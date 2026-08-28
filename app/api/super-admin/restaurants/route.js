import { supabaseCloudAdmin as supabaseAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

function cleanText(value, max = 500) {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, max)
}

export async function POST(req) {
  try {
    const user = await requireApiUser(req)

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError || !profile) {
      return Response.json(
        { success: false, error: "Profile not found" },
        { status: 403 }
      )
    }

    if (profile.role !== "super_admin") {
      return Response.json(
        { success: false, error: "Super Admin access required" },
        { status: 403 }
      )
    }

    const body = await req.json()

    const name = cleanText(body?.name, 150)
    const ownerName = cleanText(body?.owner_name, 150)
    const phone = cleanText(body?.phone, 40)
    const address = cleanText(body?.address, 500)
    const gst = cleanText(body?.gst, 50)
    const logo = cleanText(body?.logo, 1000)
    const whatsapp = cleanText(body?.whatsapp, 40)
    const saasPlanId = cleanText(body?.saas_plan_id, 100)
    const billingCycle = cleanText(body?.billing_cycle, 20).toLowerCase() || "monthly"

    if (!name) {
      return Response.json(
        { success: false, error: "Restaurant name is required" },
        { status: 400 }
      )
    }

    if (!["monthly", "yearly"].includes(billingCycle)) {
      return Response.json(
        { success: false, error: "Invalid billing cycle" },
        { status: 400 }
      )
    }

    if (saasPlanId) {
      const { data: plan, error: planError } = await supabaseAdmin
        .from("saas_plans")
        .select("id,active")
        .eq("id", saasPlanId)
        .maybeSingle()

      if (planError) {
        return Response.json(
          { success: false, error: planError.message || "Unable to validate subscription plan" },
          { status: 400 }
        )
      }

      if (!plan || !plan.active) {
        return Response.json(
          { success: false, error: "Selected subscription plan is not active" },
          { status: 400 }
        )
      }
    }

    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from("restaurants")
      .insert({
        name,
        owner_name: ownerName || null,
        phone: phone || null,
        address: address || null,
        gst: gst || null,
        logo: logo || null,
        status: "inactive"
      })
      .select()
      .single()

    if (restaurantError) {
      console.error("SUPER ADMIN RESTAURANT CREATE ERROR:", restaurantError)
      return Response.json(
        { success: false, error: restaurantError.message || "Restaurant creation failed" },
        { status: 400 }
      )
    }

    const { data: pendingSubscription, error: subscriptionError } = await supabaseAdmin
      .from("restaurant_subscriptions")
      .insert({
        restaurant_id: restaurant.id,
        saas_plan_id: saasPlanId || null,
        plan_id: null,
        status: "pending",
        billing_cycle: billingCycle,
        starts_at: null,
        ends_at: null,
        updated_at: new Date().toISOString()
      })
      .select("*")
      .single()

    if (subscriptionError) {
      await supabaseAdmin.from("restaurants").delete().eq("id", restaurant.id)
      return Response.json(
        { success: false, error: subscriptionError.message || "Subscription setup failed" },
        { status: 400 }
      )
    }

    if (whatsapp) {
      const { error: pluginError } = await supabaseAdmin
        .from("plugin_settings")
        .upsert({
          restaurant_id: restaurant.id,
          plugin_code: "whatsapp",
          config: { number: whatsapp }
        }, {
          onConflict: "restaurant_id,plugin_code"
        })

      if (pluginError) {
        console.error("WHATSAPP SETTING ERROR:", pluginError)

        // Keep the operation atomic from the user's perspective:
        // if the optional initial WhatsApp setup fails, remove the
        // newly-created restaurant rather than leaving partial setup.
        await supabaseAdmin
          .from("restaurants")
          .delete()
          .eq("id", restaurant.id)

        return Response.json(
          { success: false, error: pluginError.message || "WhatsApp setting failed" },
          { status: 400 }
        )
      }
    }

    return Response.json({
      success: true,
      restaurant: { ...restaurant, status: "inactive" },
      subscription: pendingSubscription,
      message: "Restaurant created as inactive. Assign and approve a subscription to activate it."
    })
  } catch (error) {
    console.error("SUPER ADMIN RESTAURANT API ERROR:", error)

    const message = error?.message || "Restaurant creation failed"
    const status = /authorized|authentication|login|session|token/i.test(message)
      ? 401
      : 400

    return Response.json(
      { success: false, error: message },
      { status }
    )
  }
}
