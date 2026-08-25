import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/serverAuth"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"
import { supabaseAdmin } from "@/lib/supabaseServer"

export const runtime = "nodejs"

function cleanConfig(input = {}) {
  return {
    credential_owner: input.credential_owner === "platform" ? "platform" : "restaurant",
    number: String(input.number || "").replace(/\D/g, ""),
    phone_number_id: String(input.phone_number_id || "").trim(),
    access_token: String(input.access_token || "").trim(),
    api_version: String(input.api_version || "v23.0").trim(),
    base_url: String(input.base_url || "https://graph.facebook.com").trim(),
    webhook_verify_token: String(input.webhook_verify_token || "").trim(),
    webhook_app_secret: String(input.webhook_app_secret || "").trim(),
    order_notification_recipient: String(input.order_notification_recipient || "").replace(/\D/g, ""),
    test_recipient: String(input.test_recipient || "").replace(/\D/g, ""),
    invoice_template_name: String(input.invoice_template_name || "invoice_ready").trim(),
    order_template_name: String(input.order_template_name || "order_confirmation").trim(),
    qr_order_template_name: String(input.qr_order_template_name || "new_qr_order").trim(),
    invoice_template_language: String(input.invoice_template_language || "en_US").trim(),
    send_qr_order_notification: input.send_qr_order_notification !== false,
    send_order_confirmation: input.send_order_confirmation !== false,
    allow_24h_text: input.allow_24h_text === true,
  }
}

async function context(req, body = {}) {
  const user = await requireApiUser(req)
  const resolved = await resolveRestaurantForUser(user)
  let restaurantId = resolved.restaurantId
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (profile?.role === "super_admin" && body.restaurant_id) restaurantId = String(body.restaurant_id)
  if (!restaurantId) throw new Error("Restaurant profile not found")
  if (profile?.role !== "super_admin" && body.restaurant_id && String(body.restaurant_id) !== String(restaurantId)) throw new Error("Restaurant access denied")
  return { user, restaurantId, role: profile?.role }
}

export async function GET(req) {
  try {
    const user = await requireApiUser(req)
    const url = new URL(req.url)
    const resolved = await resolveRestaurantForUser(user)
    let restaurantId = resolved.restaurantId
    const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).maybeSingle()
    if (profile?.role === "super_admin") restaurantId = url.searchParams.get("restaurant_id") || restaurantId
    if (!restaurantId) throw new Error("Restaurant profile not found")
    const { data, error } = await supabaseAdmin.from("plugin_settings").select("config").eq("restaurant_id", restaurantId).eq("plugin_code", "whatsapp-invoice").maybeSingle()
    if (error) throw error
    const cfg = data?.config || {}
    return NextResponse.json({ success: true, restaurant_id: restaurantId, config: { ...cfg, access_token: cfg.access_token ? "••••••••" : "", webhook_app_secret: cfg.webhook_app_secret ? "••••••••" : "" } })
  } catch (e) { return NextResponse.json({ success:false, error:e.message || "Unable to load WhatsApp config" }, { status:400 }) }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))
    const { restaurantId, role } = await context(req, body)
    const incoming = cleanConfig(body.config || {})
    const { data: current } = await supabaseAdmin.from("plugin_settings").select("config").eq("restaurant_id", restaurantId).eq("plugin_code", "whatsapp-invoice").maybeSingle()
    const existing = current?.config || {}
    if (!incoming.access_token && existing.access_token) incoming.access_token = existing.access_token
    if (!incoming.webhook_app_secret && existing.webhook_app_secret) incoming.webhook_app_secret = existing.webhook_app_secret
    const { error } = await supabaseAdmin.from("plugin_settings").upsert({ restaurant_id: restaurantId, plugin_code: "whatsapp-invoice", config: incoming }, { onConflict:"restaurant_id,plugin_code" })
    if (error) throw error
    return NextResponse.json({ success:true, restaurant_id:restaurantId, credential_owner:incoming.credential_owner, message:"WhatsApp configuration saved" })
  } catch (e) { return NextResponse.json({ success:false,error:e.message || "Unable to save WhatsApp config" }, { status:400 }) }
}
