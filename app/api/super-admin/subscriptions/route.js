import { NextResponse } from "next/server"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

async function requireSuperAdmin(req) {
  const user = await requireApiUser(req)
  const { data: profile, error } = await supabaseCloudAdmin
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .maybeSingle()
  if (error || profile?.role !== "super_admin") throw new Error("Super Admin access required")
  return user
}

export async function GET(req) {
  try {
    await requireSuperAdmin(req)
    const [{ data: plans, error: planError }, { data: subscriptions, error: subError }, { data: restaurants, error: restError }] = await Promise.all([
      supabaseCloudAdmin.from("saas_plans").select("*").order("monthly_price"),
      supabaseCloudAdmin.from("restaurant_subscriptions").select("*").order("updated_at", { ascending: false }),
      supabaseCloudAdmin.from("restaurants").select("id,name,status,owner_name,phone").order("name")
    ])
    if (planError) throw planError
    if (subError) throw subError
    if (restError) throw restError
    const planMap = new Map((plans || []).map(p => [p.id, p]))
    const restaurantMap = new Map((restaurants || []).map(r => [r.id, r]))
    const rows = (subscriptions || []).map(s => ({ ...s, plan: s.saas_plan_id ? planMap.get(s.saas_plan_id) || null : null, restaurant: restaurantMap.get(s.restaurant_id) || null }))
    return NextResponse.json({ success: true, plans: plans || [], restaurants: restaurants || [], subscriptions: rows })
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to load subscriptions" }, { status: 403 })
  }
}

export async function POST(req) {
  try {
    await requireSuperAdmin(req)
    const body = await req.json()
    const restaurantId = String(body?.restaurant_id || "").trim()
    const saasPlanId = String(body?.saas_plan_id || body?.plan_id || "").trim()
    const billingCycle = String(body?.billing_cycle || "monthly").trim().toLowerCase()
    const action = String(body?.action || "approve").trim().toLowerCase()
    if (!restaurantId) return NextResponse.json({ success: false, error: "restaurant_id is required" }, { status: 400 })
    if (!["approve", "activate", "pending", "deactivate"].includes(action)) return NextResponse.json({ success: false, error: "Invalid subscription action" }, { status: 400 })
    if (!["monthly", "yearly"].includes(billingCycle)) return NextResponse.json({ success: false, error: "Invalid billing cycle" }, { status: 400 })
    const { data: restaurant, error: restError } = await supabaseCloudAdmin.from("restaurants").select("id,name,status").eq("id", restaurantId).maybeSingle()
    if (restError || !restaurant) return NextResponse.json({ success: false, error: "Restaurant not found" }, { status: 404 })
    if ((action === "approve" || action === "activate") && !saasPlanId) return NextResponse.json({ success: false, error: "Select a plan before activating the restaurant" }, { status: 400 })
    if (saasPlanId) {
      const { data: plan, error: planError } = await supabaseCloudAdmin.from("saas_plans").select("id,active").eq("id", saasPlanId).maybeSingle()
      if (planError || !plan || !plan.active) return NextResponse.json({ success: false, error: "Selected plan is not active" }, { status: 400 })
    }
    const normalizedAction = action === "activate" ? "approve" : action
    const status = normalizedAction === "approve" ? "active" : normalizedAction === "pending" ? "pending" : "cancelled"
    const now = new Date().toISOString()
    const durationDays = billingCycle === "yearly" ? 365 : 30
    const endsAt = normalizedAction === "approve" ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString() : null
    const { data: existing } = await supabaseCloudAdmin.from("restaurant_subscriptions").select("id").eq("restaurant_id", restaurantId).order("updated_at", { ascending: false }).limit(1).maybeSingle()
    let subscription
    if (existing?.id) {
      const { data, error } = await supabaseCloudAdmin.from("restaurant_subscriptions").update({ saas_plan_id: saasPlanId || null, status, billing_cycle: billingCycle, starts_at: normalizedAction === "approve" ? now : null, ends_at: endsAt, updated_at: now }).eq("id", existing.id).select("*").single()
      if (error) throw error
      subscription = data
    } else {
      const { data, error } = await supabaseCloudAdmin.from("restaurant_subscriptions").insert({ restaurant_id: restaurantId, saas_plan_id: saasPlanId || null, status, billing_cycle: billingCycle, starts_at: normalizedAction === "approve" ? now : null, ends_at: endsAt, updated_at: now }).select("*").single()
      if (error) throw error
      subscription = data
    }
    const restaurantStatus = normalizedAction === "approve" ? "active" : "inactive"
    const { error: statusError } = await supabaseCloudAdmin.from("restaurants").update({ status: restaurantStatus }).eq("id", restaurantId)
    if (statusError) throw statusError
    return NextResponse.json({ success: true, subscription, restaurant_status: restaurantStatus, billing_cycle: billingCycle })
  } catch (error) {
    console.error("SUPER ADMIN SUBSCRIPTION UPDATE ERROR", error)
    return NextResponse.json({ success: false, error: error?.message || "Subscription update failed" }, { status: 400 })
  }
}
