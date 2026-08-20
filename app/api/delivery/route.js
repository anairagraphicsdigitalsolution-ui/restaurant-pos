import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"
import { requireFeature } from "@/lib/featureGateServer"

export const runtime = "nodejs"

async function resolveRestaurant(userId) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("restaurant_id,role")
    .eq("id", userId)
    .maybeSingle()

  if (profile?.restaurant_id) return { restaurantId: profile.restaurant_id, role: profile.role || "" }

  const { data: restaurant } = await supabaseAdmin
    .from("restaurants")
    .select("id")
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle()

  return { restaurantId: restaurant?.id || null, role: profile?.role || "admin" }
}

function cleanMoney(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0
}

async function addEvent({ restaurantId, deliveryId, status, note, userId }) {
  await supabaseAdmin.from("delivery_events").insert([{
    restaurant_id: restaurantId,
    delivery_id: deliveryId,
    status,
    note: note || null,
    created_by: userId
  }])
}

export async function GET(req) {
  try {
    const user = await requireApiUser(req)
    const { restaurantId } = await resolveRestaurant(user.id)
    if (!restaurantId) return Response.json({ success:false, error:"No restaurant linked" }, { status:403 })

    try {
      await requireFeature(restaurantId, "delivery")
    } catch (featureError) {
      return Response.json({ success:false, error:featureError.message }, { status:403 })
    }

    const [deliveryRes, riderRes, zoneRes] = await Promise.all([
      supabaseAdmin
        .from("restaurant_deliveries")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending:false })
        .limit(200),
      supabaseAdmin
        .from("delivery_riders")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("name"),
      supabaseAdmin
        .from("delivery_zones")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("name")
    ])

    return Response.json({
      success:true,
      restaurant_id:restaurantId,
      deliveries:deliveryRes.data || [],
      riders:riderRes.data || [],
      zones:zoneRes.data || [],
      errors:{
        deliveries:deliveryRes.error?.message || null,
        riders:riderRes.error?.message || null,
        zones:zoneRes.error?.message || null
      }
    })
  } catch (error) {
    return Response.json({ success:false, error:error?.message || "Delivery load failed" }, { status:401 })
  }
}

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const { restaurantId } = await resolveRestaurant(user.id)
    if (!restaurantId) return Response.json({ success:false, error:"No restaurant linked" }, { status:403 })

    try {
      await requireFeature(restaurantId, "delivery")
    } catch (featureError) {
      return Response.json({ success:false, error:featureError.message }, { status:403 })
    }

    const body = await req.json()
    const action = String(body?.action || "").trim().toLowerCase()

    if (action === "create") {
      const orderId = String(body?.order_id || "").trim()
      if (!orderId) return Response.json({ success:false,error:"Order is required" },{status:400})

      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("id,restaurant_id,total_amount,order_mode,customer_id")
        .eq("id",orderId)
        .eq("restaurant_id",restaurantId)
        .maybeSingle()

      if (!order) return Response.json({ success:false,error:"Order not found" },{status:404})

      const { data: slip, error: slipError } = await supabaseAdmin.rpc("next_delivery_slip_no", { p_restaurant_id:restaurantId })
      if (slipError) return Response.json({ success:false,error:slipError.message },{status:400})

      const row = {
        restaurant_id: restaurantId,
        order_id: orderId,
        slip_no: slip,
        order_mode: String(body?.order_mode || order.order_mode || "delivery"),
        customer_name: String(body?.customer_name || "Walk-in Customer").trim(),
        phone: String(body?.phone || "").trim() || null,
        address: String(body?.address || "").trim() || null,
        zone: String(body?.zone || "").trim() || null,
        delivery_charge: cleanMoney(body?.delivery_charge),
        rider_id: body?.rider_id || null,
        rider_name: String(body?.rider_name || "").trim() || null,
        rider_phone: String(body?.rider_phone || "").trim() || null,
        expected_amount: cleanMoney(order.total_amount),
        payment_method: String(body?.payment_method || "cash").toLowerCase(),
        payment_status: "pending",
        settlement_status: "pending",
        status: body?.rider_id ? "assigned" : "pending",
        assigned_at: body?.rider_id ? new Date().toISOString() : null,
        customer_notes: String(body?.customer_notes || "").trim() || null
      }

      const { data: delivery, error } = await supabaseAdmin
        .from("restaurant_deliveries")
        .insert([row])
        .select("*")
        .single()

      if (error) return Response.json({ success:false,error:error.message },{status:400})
      await addEvent({ restaurantId, deliveryId:delivery.id, status:row.status, note:"Delivery slip created", userId:user.id })
      return Response.json({ success:true, delivery })
    }

    const deliveryId = String(body?.delivery_id || "").trim()
    if (!deliveryId) return Response.json({ success:false,error:"Delivery is required" },{status:400})

    const { data: delivery } = await supabaseAdmin
      .from("restaurant_deliveries")
      .select("*")
      .eq("id",deliveryId)
      .eq("restaurant_id",restaurantId)
      .maybeSingle()

    if (!delivery) return Response.json({ success:false,error:"Delivery not found" },{status:404})

    if (action === "assign") {
      const riderId = body?.rider_id || null
      let rider = null
      if (riderId) {
        const { data } = await supabaseAdmin.from("delivery_riders").select("id,name,phone").eq("id",riderId).eq("restaurant_id",restaurantId).maybeSingle()
        rider = data
        if (!rider) return Response.json({success:false,error:"Rider not found"},{status:404})
      }
      const patch = {
        rider_id: rider?.id || null,
        rider_name: rider?.name || null,
        rider_phone: rider?.phone || null,
        status: rider ? "assigned" : "pending",
        assigned_at: rider ? new Date().toISOString() : null
      }
      const { data: updated,error } = await supabaseAdmin.from("restaurant_deliveries").update(patch).eq("id",deliveryId).eq("restaurant_id",restaurantId).select("*").single()
      if (error) return Response.json({success:false,error:error.message},{status:400})
      await addEvent({restaurantId,deliveryId,status:patch.status,note:rider ? `Assigned to ${rider.name}` : "Rider unassigned",userId:user.id})
      return Response.json({success:true,delivery:updated})
    }

    if (action === "status") {
      const next = String(body?.status || "").trim().toLowerCase()
      const allowed = ["pending","assigned","out_for_delivery","delivered","ready_for_pickup","picked_up","cancelled"]
      if (!allowed.includes(next)) return Response.json({success:false,error:"Invalid delivery status"},{status:400})
      const now = new Date().toISOString()
      const patch = { status:next }
      if (next === "out_for_delivery") patch.out_for_delivery_at = now
      if (next === "delivered" || next === "picked_up") patch.delivered_at = now
      const { data: updated,error } = await supabaseAdmin.from("restaurant_deliveries").update(patch).eq("id",deliveryId).eq("restaurant_id",restaurantId).select("*").single()
      if (error) return Response.json({success:false,error:error.message},{status:400})
      if (delivery.order_id) {
        const orderStatus = ["delivered","picked_up"].includes(next) ? "completed" : ["out_for_delivery"].includes(next) ? "out_for_delivery" : next === "cancelled" ? "cancelled" : "pending"
        await supabaseAdmin.from("orders").update({status:orderStatus}).eq("id",delivery.order_id).eq("restaurant_id",restaurantId)
      }
      await addEvent({restaurantId,deliveryId,status:next,note:body?.note || null,userId:user.id})
      return Response.json({success:true,delivery:updated})
    }

    if (action === "settle") {
      if (delivery.settlement_status === "settled") return Response.json({success:false,error:"Delivery is already settled"},{status:400})
      const cash = cleanMoney(body?.cash_collected)
      const upi = cleanMoney(body?.upi_collected)
      const card = cleanMoney(body?.card_collected)
      const totalCollected = cash + upi + card
      const expected = cleanMoney(delivery.expected_amount)
      const difference = Math.round((totalCollected - expected) * 100) / 100
      const primaryMethod = cash > 0 && upi === 0 && card === 0 ? "cash" : upi > 0 && cash === 0 && card === 0 ? "upi" : card > 0 && cash === 0 && upi === 0 ? "card" : "other"

      if (delivery.order_id && totalCollected > 0) {
        const { data: existingPayments } = await supabaseAdmin
          .from("order_payments")
          .select("id,amount,payment_method,status")
          .eq("order_id",delivery.order_id)
          .eq("restaurant_id",restaurantId)
          .eq("status","paid")

        const alreadyPaid = (existingPayments || []).reduce((sum,row)=>sum+Number(row.amount||0),0)
        const remaining = Math.max(0, expected - alreadyPaid)
        const methods = [["cash",cash],["upi",upi],["card",card]]
        for (const [method,amount] of methods) {
          const n = Math.min(Number(amount||0), remaining)
          if (n <= 0) continue
          await supabaseAdmin.from("order_payments").insert([{
            restaurant_id:restaurantId,
            order_id:delivery.order_id,
            payment_method:method,
            amount:n,
            status:"paid",
            paid_at:new Date().toISOString(),
            created_by:user.id,
            notes:`Delivery settlement ${delivery.slip_no || delivery.id}`
          }])
        }
        const newPaid = alreadyPaid + Math.min(totalCollected, remaining)
        const paymentStatus = newPaid >= expected && expected > 0 ? "paid" : newPaid > 0 ? "partially_paid" : "unpaid"
        await supabaseAdmin.from("orders").update({
          paid_amount:newPaid,
          payment_status:paymentStatus,
          payment_method:primaryMethod,
          status:paymentStatus === "paid" ? "completed" : delivery.status
        }).eq("id",delivery.order_id).eq("restaurant_id",restaurantId)
      }

      const { data: updated,error } = await supabaseAdmin.from("restaurant_deliveries").update({
        cash_collected:cash,
        upi_collected:upi,
        card_collected:card,
        payment_status: totalCollected >= expected && expected > 0 ? "paid" : totalCollected > 0 ? "partial" : "pending",
        settlement_status:"settled",
        settlement_difference:difference,
        settled_at:new Date().toISOString(),
        settled_by:user.id,
        status:delivery.status === "cancelled" ? "cancelled" : "delivered"
      }).eq("id",deliveryId).eq("restaurant_id",restaurantId).select("*").single()
      if (error) return Response.json({success:false,error:error.message},{status:400})
      await addEvent({restaurantId,deliveryId,status:"settled",note:`Collected ₹${totalCollected.toLocaleString("en-IN")} | Difference ₹${difference.toLocaleString("en-IN")}`,userId:user.id})
      return Response.json({success:true,delivery:updated,difference})
    }

    return Response.json({success:false,error:"Unknown delivery action"},{status:400})
  } catch (error) {
    console.error("DELIVERY API ERROR",error)
    return Response.json({success:false,error:error?.message || "Delivery operation failed"},{status:401})
  }
}
