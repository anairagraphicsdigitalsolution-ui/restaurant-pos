import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").slice(-15)
}

async function getOrder(orderId) {
  const { data, error } = await supabaseCloudAdmin
    .from("orders")
    .select("id,restaurant_id,customer_id")
    .eq("id", orderId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error("Order not found")
  if (!data.restaurant_id) throw new Error("Order restaurant is missing")
  return data
}

export async function GET(req) {
  try {
    await requireApiUser(req)
    const { searchParams } = new URL(req.url)
    const orderId = String(searchParams.get("order_id") || "").trim()
    const phone = normalizePhone(searchParams.get("phone"))
    if (!orderId) return Response.json({ customer: null }, { status: 200 })
    const order = await getOrder(orderId)

    if (order.customer_id) {
      const { data: customer } = await supabaseCloudAdmin
        .from("customers")
        .select("*")
        .eq("id", order.customer_id)
        .eq("restaurant_id", order.restaurant_id)
        .maybeSingle()
      if (customer && (!phone || normalizePhone(customer.phone) === phone)) {
        return Response.json({ customer })
      }
    }

    if (!phone || phone.length < 10) return Response.json({ customer: null })
    const { data: customer, error } = await supabaseCloudAdmin
      .from("customers")
      .select("*")
      .eq("restaurant_id", order.restaurant_id)
      .eq("phone", phone)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return Response.json({ customer: customer || null })
  } catch (error) {
    return Response.json({ customer: null, error: error.message || "Customer lookup failed" }, { status: 403 })
  }
}

export async function POST(req) {
  try {
    await requireApiUser(req)
    const body = await req.json()
    const orderId = String(body?.order_id || "").trim()
    const name = String(body?.name || "").trim().slice(0, 120)
    const phone = normalizePhone(body?.phone)
    if (!orderId || !name || phone.length < 10) {
      return Response.json({ success: false, error: "Customer name and valid mobile number are required" }, { status: 400 })
    }

    const order = await getOrder(orderId)

    let customer = null
    const { data: existing, error: existingError } = await supabaseCloudAdmin
      .from("customers")
      .select("*")
      .eq("restaurant_id", order.restaurant_id)
      .eq("phone", phone)
      .maybeSingle()
    if (existingError) throw new Error(existingError.message)

    if (existing) {
      const { data, error } = await supabaseCloudAdmin
        .from("customers")
        .update({ name, phone, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("restaurant_id", order.restaurant_id)
        .select("*")
        .single()
      if (error) throw new Error(error.message)
      customer = data
    } else {
      const { data, error } = await supabaseCloudAdmin
        .from("customers")
        .insert({ restaurant_id: order.restaurant_id, name, phone })
        .select("*")
        .single()
      if (error) throw new Error(error.message)
      customer = data
    }

    const { error: linkError } = await supabaseCloudAdmin
      .from("orders")
      .update({ customer_id: customer.id })
      .eq("id", orderId)
      .eq("restaurant_id", order.restaurant_id)
    if (linkError) throw new Error(linkError.message)

    return Response.json({ success: true, customer })
  } catch (error) {
    return Response.json({ success: false, error: error.message || "Unable to save customer" }, { status: 400 })
  }
}
