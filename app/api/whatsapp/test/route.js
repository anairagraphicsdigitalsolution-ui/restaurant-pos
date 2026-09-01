import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/serverAuth"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"
import { getWhatsAppConfig, sendWhatsAppMessage } from "@/lib/whatsappServer"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"

export const runtime = "nodejs"

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const body = await req.json().catch(() => ({}))
    let { restaurantId } = await resolveRestaurantForUser(user)

    if (!restaurantId && body.restaurant_id) {
      const { data: profile } = await supabaseCloudAdmin.from("profiles").select("role").eq("id", user.id).maybeSingle()
      if (profile?.role !== "super_admin") throw new Error("Restaurant profile not found")
      restaurantId = String(body.restaurant_id)
    }

    if (!restaurantId) throw new Error("Restaurant profile not found")

    const config = await getWhatsAppConfig(restaurantId)
    const to = body.to || config.test_recipient
    if (!to) throw new Error("Enter a test recipient number.")

    const result = await sendWhatsAppMessage({
      restaurantId,
      to,
      type: "template",
      templateName: body.templateName || "hello_world",
      language: body.language || "en_US"
    })

    return NextResponse.json({
      ...result,
      message: "WhatsApp API accepted the test message."
    })
  } catch (e) {
    return NextResponse.json({success:false,error:e?.message || "WhatsApp test failed"},{status:400})
  }
}
