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
        rider_id: body?.delivery_person_type === "owner" ? null : (body?.rider_id || null),
        rider_name: body?.delivery_person_type === "owner" ? null : (String(body?.rider_name || "").trim() || null),
        rider_phone: body?.delivery_person_type === "owner" ? null : (String(body?.rider_phone || "").trim() || null),
        delivery_person_type: body?.delivery_person_type === "owner" ? "owner" : "rider",
        delivery_person_name:
          body?.delivery_person_type === "owner"
            ? (String(body?.delivery_person_name || "Restaurant Owner").trim() || "Restaurant Owner")
            : (String(body?.rider_name || "").trim() || null),
        delivery_person_phone:
          body?.delivery_person_type === "owner"
            ? (String(body?.delivery_person_phone || "").trim() || null)
            : (String(body?.rider_phone || "").trim() || null),
        expected_amount: cleanMoney(order.total_amount),
        collection_expected: cleanMoney(order.total_amount),
        payment_method: String(body?.payment_method || "cash").toLowerCase(),
        payment_status: "pending",
        settlement_status: "pending",
        collection_status:
          [ "cash", "cod" ].includes(String(body?.payment_method || "cash").toLowerCase())
            ? "pending_collection"
            : "not_required",
        status:
          body?.delivery_person_type === "owner" || body?.rider_id
            ? "assigned"
            : "pending",
        assigned_at:
          body?.delivery_person_type === "owner" || body?.rider_id
            ? new Date().toISOString()
            : null,
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

    if (action === "zone_create" || action === "zone_update" || action === "zone_delete") {
      const zoneId = String(body?.zone_id || "").trim()

      if (action === "zone_delete") {
        if (!zoneId) {
          return Response.json(
            { success: false, error: "Delivery zone is required" },
            { status: 400 }
          )
        }

        const { data: existing, error: findError } = await supabaseAdmin
          .from("delivery_zones")
          .select("id,name")
          .eq("id", zoneId)
          .eq("restaurant_id", restaurantId)
          .maybeSingle()

        if (findError) {
          return Response.json(
            { success: false, error: findError.message },
            { status: 400 }
          )
        }

        if (!existing) {
          return Response.json(
            { success: false, error: "Delivery zone not found" },
            { status: 404 }
          )
        }

        const { error } = await supabaseAdmin
          .from("delivery_zones")
          .delete()
          .eq("id", zoneId)
          .eq("restaurant_id", restaurantId)

        if (error) {
          return Response.json(
            { success: false, error: error.message },
            { status: 400 }
          )
        }

        return Response.json({ success: true })
      }

      const name = String(body?.name || "").trim()
      const charge = cleanMoney(body?.charge)
      const minOrder = cleanMoney(body?.min_order)
      const active = body?.active !== false

      if (!name) {
        return Response.json(
          { success: false, error: "Zone name is required" },
          { status: 400 }
        )
      }

      if (action === "zone_update") {
        if (!zoneId) {
          return Response.json(
            { success: false, error: "Delivery zone is required" },
            { status: 400 }
          )
        }

        const { data: duplicate } = await supabaseAdmin
          .from("delivery_zones")
          .select("id")
          .eq("restaurant_id", restaurantId)
          .ilike("name", name)
          .neq("id", zoneId)
          .limit(1)

        if (duplicate?.length) {
          return Response.json(
            { success: false, error: "A delivery zone with this name already exists." },
            { status: 409 }
          )
        }

        const { data: zone, error } = await supabaseAdmin
          .from("delivery_zones")
          .update({
            name,
            charge,
            min_order: minOrder,
            active,
          })
          .eq("id", zoneId)
          .eq("restaurant_id", restaurantId)
          .select("*")
          .single()

        if (error) {
          return Response.json(
            { success: false, error: error.message },
            { status: 400 }
          )
        }

        return Response.json({ success: true, zone })
      }

      const { data: duplicate } = await supabaseAdmin
        .from("delivery_zones")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .ilike("name", name)
        .limit(1)

      if (duplicate?.length) {
        return Response.json(
          { success: false, error: "A delivery zone with this name already exists." },
          { status: 409 }
        )
      }

      const { data: zone, error } = await supabaseAdmin
        .from("delivery_zones")
        .insert([{
          restaurant_id: restaurantId,
          name,
          charge,
          min_order: minOrder,
          active,
        }])
        .select("*")
        .single()

      if (error) {
        return Response.json(
          { success: false, error: error.message },
          { status: 400 }
        )
      }

      return Response.json({ success: true, zone })
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
      const personType = String(body?.delivery_person_type || "rider").toLowerCase()
      if (!["rider", "owner"].includes(personType)) {
        return Response.json({ success:false, error:"Delivery person must be rider or owner" }, { status:400 })
      }

      let rider = null
      if (personType === "rider") {
        const riderId = body?.rider_id || null
        if (riderId) {
          const { data } = await supabaseAdmin
            .from("delivery_riders")
            .select("id,name,phone")
            .eq("id", riderId)
            .eq("restaurant_id", restaurantId)
            .maybeSingle()
          rider = data
          if (!rider) {
            return Response.json({ success:false,error:"Rider not found" },{status:404})
          }
        } else {
          return Response.json({ success:false,error:"Select a rider" },{status:400})
        }
      }

      const ownerName = String(body?.delivery_person_name || "Restaurant Owner").trim() || "Restaurant Owner"
      const ownerPhone = String(body?.delivery_person_phone || "").trim() || null

      const patch = {
        rider_id: personType === "rider" ? rider.id : null,
        rider_name: personType === "rider" ? rider.name : null,
        rider_phone: personType === "rider" ? rider.phone : null,
        delivery_person_type: personType,
        delivery_person_name: personType === "rider" ? rider.name : ownerName,
        delivery_person_phone: personType === "rider" ? rider.phone : ownerPhone,
        status: "assigned",
        assigned_at: new Date().toISOString()
      }

      const { data: updated,error } = await supabaseAdmin
        .from("restaurant_deliveries")
        .update(patch)
        .eq("id",deliveryId)
        .eq("restaurant_id",restaurantId)
        .select("*")
        .single()

      if (error) return Response.json({success:false,error:error.message},{status:400})

      await addEvent({
        restaurantId,
        deliveryId,
        status:"assigned",
        note: personType === "owner"
          ? `Delivery assigned to restaurant owner ${ownerName}`
          : `Assigned to ${rider.name}`,
        userId:user.id
      })

      return Response.json({success:true,delivery:updated})
    }

    if (action === "status") {
      const next = String(body?.status || "").trim().toLowerCase()
      const allowed = ["pending","assigned","out_for_delivery","delivered","ready_for_pickup","picked_up","cancelled"]
      if (!allowed.includes(next)) return Response.json({success:false,error:"Invalid delivery status"},{status:400})

      const now = new Date().toISOString()
      const isCod = ["cash","cod"].includes(String(delivery.payment_method || "cash").toLowerCase())
      const patch = { status:next, updated_at:now }

      if (next === "out_for_delivery") {
        patch.out_for_delivery_at = now
      }

      if (next === "delivered" || next === "picked_up") {
        patch.delivered_at = now
        patch.collection_status = isCod
          ? "pending_settlement"
          : "not_required"
      }

      if (next === "cancelled") {
        patch.collection_status = "not_required"
      }

      const { data: updated,error } = await supabaseAdmin
        .from("restaurant_deliveries")
        .update(patch)
        .eq("id",deliveryId)
        .eq("restaurant_id",restaurantId)
        .select("*")
        .single()

      if (error) return Response.json({success:false,error:error.message},{status:400})

      if (delivery.order_id) {
        const orderStatus =
          ["delivered","picked_up"].includes(next)
            ? (isCod ? "delivered" : "completed")
            : next === "out_for_delivery"
              ? "out_for_delivery"
              : next === "cancelled"
                ? "cancelled"
                : "pending"

        await supabaseAdmin
          .from("orders")
          .update({status:orderStatus})
          .eq("id",delivery.order_id)
          .eq("restaurant_id",restaurantId)
      }

      await addEvent({
        restaurantId,
        deliveryId,
        status:next,
        note: isCod && ["delivered","picked_up"].includes(next)
          ? "Delivered. COD collection is pending settlement."
          : body?.note || null,
        userId:user.id
      })

      return Response.json({success:true,delivery:updated})
    }

    if (action === "settle") {
      if (delivery.settlement_status === "settled") {
        return Response.json({success:false,error:"Delivery is already settled"},{status:400})
      }

      if (!["delivered","picked_up"].includes(String(delivery.status || "").toLowerCase())) {
        return Response.json({
          success:false,
          error:"Delivery must be marked delivered before payment can be settled."
        },{status:400})
      }

      const isCod = ["cash","cod"].includes(String(delivery.payment_method || "cash").toLowerCase())
      const expected = cleanMoney(delivery.collection_expected ?? delivery.expected_amount)

      if (!isCod) {
        const { data: updated,error } = await supabaseAdmin
          .from("restaurant_deliveries")
          .update({
            settlement_status:"settled",
            collection_status:"not_required",
            settled_at:new Date().toISOString(),
            settled_by:user.id,
            collection_received_by:user.id,
            collection_received_at:new Date().toISOString(),
            settlement_method:String(delivery.payment_method || "online").toLowerCase(),
            collection_notes:String(body?.collection_notes || "").trim() || null,
            status:delivery.status
          })
          .eq("id",deliveryId)
          .eq("restaurant_id",restaurantId)
          .select("*")
          .single()

        if (error) return Response.json({success:false,error:error.message},{status:400})

        await addEvent({
          restaurantId,
          deliveryId,
          status:"settled",
          note:"Prepaid delivery marked settled. No cash collection required.",
          userId:user.id
        })

        return Response.json({success:true,delivery:updated,difference:0})
      }

      const cash = cleanMoney(body?.cash_collected)
      const upi = cleanMoney(body?.upi_collected)
      const card = cleanMoney(body?.card_collected)
      const totalCollected = Math.round((cash + upi + card) * 100) / 100
      const difference = Math.round((totalCollected - expected) * 100) / 100

      if (totalCollected <= 0 && expected > 0) {
        return Response.json({
          success:false,
          error:`Enter the amount actually collected. Expected ${money(expected)}.`
        },{status:400})
      }

      const primaryMethod =
        cash > 0 && upi === 0 && card === 0
          ? "cash"
          : upi > 0 && cash === 0 && card === 0
            ? "upi"
            : card > 0 && cash === 0 && upi === 0
              ? "card"
              : "other"

      if (delivery.order_id && totalCollected > 0) {
        const { data: existingPayments } = await supabaseAdmin
          .from("order_payments")
          .select("id,amount,payment_method,status")
          .eq("order_id",delivery.order_id)
          .eq("restaurant_id",restaurantId)
          .eq("status","paid")

        const alreadyPaid = (existingPayments || [])
          .reduce((sum,row)=>sum+Number(row.amount||0),0)

        let remaining = Math.max(0, expected - alreadyPaid)
        const methods = [["cash",cash],["upi",upi],["card",card]]

        for (const [method,amount] of methods) {
          const available = Number(amount || 0)
          const n = Math.min(available, remaining)
          if (n <= 0) continue

          await supabaseAdmin
            .from("order_payments")
            .insert([{
              restaurant_id:restaurantId,
              order_id:delivery.order_id,
              payment_method:method,
              amount:n,
              status:"paid",
              paid_at:new Date().toISOString(),
              created_by:user.id,
              notes:`Delivery settlement ${delivery.slip_no || delivery.id}`
            }])

          remaining = Math.max(0, remaining - n)
        }

        const newPaid = alreadyPaid + Math.min(totalCollected, expected)
        const paymentStatus =
          newPaid >= expected && expected > 0
            ? "paid"
            : newPaid > 0
              ? "partially_paid"
              : "unpaid"

        await supabaseAdmin
          .from("orders")
          .update({
            paid_amount:newPaid,
            payment_status:paymentStatus,
            payment_method:primaryMethod,
            status:paymentStatus === "paid" ? "completed" : "delivered"
          })
          .eq("id",delivery.order_id)
          .eq("restaurant_id",restaurantId)
      }

      const resultStatus =
        difference === 0 ? "settled" : difference < 0 ? "short" : "over"

      const { data: updated,error } = await supabaseAdmin
        .from("restaurant_deliveries")
        .update({
          cash_collected:cash,
          upi_collected:upi,
          card_collected:card,
          collection_received:totalCollected,
          collection_difference:difference,
          payment_status:
            totalCollected >= expected && expected > 0
              ? "paid"
              : totalCollected > 0
                ? "partial"
                : "pending",
          collection_status:"settled",
          settlement_status:"settled",
          settlement_difference:difference,
          settlement_method:primaryMethod,
          collection_received_by:user.id,
          collection_received_at:new Date().toISOString(),
          collection_notes:String(body?.collection_notes || "").trim() || null,
          settled_at:new Date().toISOString(),
          settled_by:user.id,
          status:delivery.status === "cancelled" ? "cancelled" : "delivered"
        })
        .eq("id",deliveryId)
        .eq("restaurant_id",restaurantId)
        .select("*")
        .single()

      if (error) return Response.json({success:false,error:error.message},{status:400})

      await addEvent({
        restaurantId,
        deliveryId,
        status:"settled",
        note:`${resultStatus.toUpperCase()}: collected ₹${totalCollected.toLocaleString("en-IN")} | expected ₹${expected.toLocaleString("en-IN")} | difference ₹${difference.toLocaleString("en-IN")}`,
        userId:user.id
      })

      return Response.json({
        success:true,
        delivery:updated,
        difference,
        settlement_result:resultStatus
      })
    }

    return Response.json({success:false,error:"Unknown delivery action"},{status:400})
  } catch (error) {
    console.error("DELIVERY API ERROR",error)
    return Response.json({success:false,error:error?.message || "Delivery operation failed"},{status:401})
  }
}
