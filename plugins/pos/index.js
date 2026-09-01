import { supabaseCloudAdmin } from "../../lib/supabaseCloudServer"

function cleanText(value, max = 500) {
  const text = String(value ?? "").trim()
  return text ? text.slice(0, max) : null
}

function normalizeItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 100) {
    throw new Error("At least one valid order item is required")
  }
  return items.map((item, index) => {
    const itemId = cleanText(item?.item_id || item?.id, 80)
    const quantity = Number(item?.qty ?? item?.quantity)
    if (!itemId || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new Error(`Invalid item at position ${index + 1}`)
    }
    return { itemId, quantity, cookingRequest: cleanText(item?.cooking_request, 500) }
  })
}

export async function createOrder(data = {}, config = {}) {
  const restaurantId = data._restaurantId
  if (!restaurantId) throw new Error("Restaurant context is required")

  const items = normalizeItems(data.items)
  const ids = [...new Set(items.map(item => item.itemId))]
  const { data: menuItems, error: menuError } = await supabaseCloudAdmin
    .from("menu_items")
    .select("id,name,price")
    .eq("restaurant_id", restaurantId)
    .in("id", ids)
  if (menuError) throw new Error(menuError.message)
  const menuMap = new Map((menuItems || []).map(item => [String(item.id), item]))
  for (const item of items) if (!menuMap.has(item.itemId)) throw new Error(`Menu item not found: ${item.itemId}`)

  const { data: order, error: orderError } = await supabaseCloudAdmin
    .from("orders")
    .insert({
      restaurant_id: restaurantId,
      source_type: cleanText(data.source_type || "pos", 30) || "pos",
      source_id: cleanText(data.source_id, 100),
      source_label: cleanText(data.source_label || "POS", 120),
      overall_note: cleanText(data.overall_note, 1000),
      status: "pending"
    })
    .select("id,restaurant_id,status,source_type,source_id,source_label,created_at")
    .single()
  if (orderError) throw new Error(orderError.message)

  const rows = items.map(item => ({
    order_id: order.id,
    item_id: item.itemId,
    quantity: item.quantity,
    cooking_request: item.cookingRequest
  }))
  const { error: itemError } = await supabaseCloudAdmin.from("order_items").insert(rows)
  if (itemError) {
    await supabaseCloudAdmin.from("orders").delete().eq("id", order.id).eq("restaurant_id", restaurantId)
    throw new Error(itemError.message)
  }

  const subtotal = items.reduce((sum, item) => sum + Number(menuMap.get(item.itemId)?.price || 0) * item.quantity, 0)
  return { success: true, message: "Order created", order: { ...order, items, subtotal } }
}

export async function calculateBill(data = {}, config = {}) {
  const restaurantId = data._restaurantId
  if (!restaurantId) throw new Error("Restaurant context is required")
  const items = normalizeItems(data.items)
  const ids = [...new Set(items.map(item => item.itemId))]
  const { data: menuItems, error } = await supabaseCloudAdmin
    .from("menu_items")
    .select("id,price")
    .eq("restaurant_id", restaurantId)
    .in("id", ids)
  if (error) throw new Error(error.message)
  const prices = new Map((menuItems || []).map(item => [String(item.id), Number(item.price || 0)]))
  for (const item of items) if (!prices.has(item.itemId)) throw new Error(`Menu item not found: ${item.itemId}`)
  const subtotal = items.reduce((sum, item) => sum + prices.get(item.itemId) * item.quantity, 0)
  const taxRate = Number(config.tax_rate ?? data.tax_rate ?? 5)
  const tax = Math.round(Math.max(subtotal, 0) * Math.max(taxRate, 0) / 100 * 100) / 100
  return { success: true, subtotal, tax, tax_rate: taxRate, total: Math.round((subtotal + tax) * 100) / 100 }
}

export async function pay(data = {}, config = {}) {
  const restaurantId = data._restaurantId
  const actorId = cleanText(data.actor_id, 80)
  const orderId = cleanText(data.order_id, 80)
  if (!restaurantId || !actorId || !orderId) throw new Error("restaurant_id, actor_id and order_id are required")
  const { data: result, error } = await supabaseCloudAdmin.rpc("stage3_finalize_order", {
    p_actor_id: actorId,
    p_order_id: orderId,
    p_payment_method: cleanText(data.payment_method || "cash", 30) || "cash",
    p_paid_amount: Number(data.amount || 0),
    p_offer_id: data.offer_id || null,
    p_loyalty_reward_id: data.loyalty_reward_id || null,
    p_manual_discount_amount: Number(data.manual_discount_amount || 0),
    p_manual_discount_mode: cleanText(data.manual_discount_mode || "amount", 20) || "amount"
  })
  if (error) throw new Error(error.message)
  return { success: true, message: "Payment processed", bill: result }
}

export async function sendToKitchen(data = {}) {
  const restaurantId = data._restaurantId
  const orderId = cleanText(data.order_id, 80)
  if (!restaurantId || !orderId) throw new Error("Restaurant and order are required")
  const { data: order, error } = await supabaseCloudAdmin
    .from("orders")
    .update({ status: "preparing" })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .select("id,status")
    .single()
  if (error) throw new Error(error.message)
  return { success: true, message: "Order sent to kitchen", order_id: order.id, status: order.status, kot: true }
}

export async function completeOrder(data = {}) {
  const restaurantId = data._restaurantId
  const orderId = cleanText(data.order_id, 80)
  if (!restaurantId || !orderId) throw new Error("Restaurant and order are required")
  const { data: order, error } = await supabaseCloudAdmin
    .from("orders")
    .update({ status: "done" })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .select("id,status")
    .single()
  if (error) throw new Error(error.message)
  return { success: true, message: "Order completed", order_id: order.id, status: order.status }
}
