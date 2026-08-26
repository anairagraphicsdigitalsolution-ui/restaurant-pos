import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"
import { printOrderSlip } from "@/lib/orderSlipPrinter"

export const runtime = "nodejs"

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const { restaurantId } = await resolveRestaurantForUser(user)
    if (!restaurantId) throw new Error("Restaurant not found")
    const body = await req.json()
    const orderId = String(body?.order_id || "").trim()
    if (!orderId) throw new Error("order_id is required")
    const { data: order, error } = await supabaseAdmin.from("orders").select("id").eq("id", orderId).eq("restaurant_id", restaurantId).maybeSingle()
    if (error || !order) throw new Error("Order not found")
    const result = await printOrderSlip(orderId, restaurantId)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Order slip print failed" }, { status: 400 })
  }
}
