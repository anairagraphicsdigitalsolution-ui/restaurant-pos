import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"
import { requireFeature } from "@/lib/featureGateServer"

export const runtime = "nodejs"

function cleanMethod(value) {
  const method = String(value || "cash").trim().toLowerCase()

  return ["cash", "card", "upi", "online"].includes(method)
    ? method
    : "cash"
}

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const body = await req.json()

    const orderId = String(body?.order_id || "").trim()

    if (!orderId) {
      return Response.json(
        {
          success: false,
          error: "Order is required"
        },
        { status: 400 }
      )
    }

    const paidAmount = Number(body?.paid_amount || 0)

    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      return Response.json(
        {
          success: false,
          error: "Invalid paid amount"
        },
        { status: 400 }
      )
    }

    /*
     * ============================================================
     * GET ORDER RESTAURANT
     * ============================================================
     *
     * We get the restaurant_id from the order itself.
     * This prevents a user from finalizing an order belonging
     * to another restaurant.
     */

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, restaurant_id")
      .eq("id", orderId)
      .maybeSingle()

    if (orderError) {
      console.error("BILLING ORDER LOOKUP ERROR:", orderError)

      return Response.json(
        {
          success: false,
          error: "Unable to verify order"
        },
        { status: 400 }
      )
    }

    if (!order) {
      return Response.json(
        {
          success: false,
          error: "Order not found"
        },
        { status: 404 }
      )
    }

    if (!order.restaurant_id) {
      return Response.json(
        {
          success: false,
          error: "Order restaurant is missing"
        },
        { status: 400 }
      )
    }

    /*
     * ============================================================
     * BILLING PLAN FEATURE CHECK
     * ============================================================
     *
     * Billing is controlled by the restaurant's active plan.
     *
     * IMPORTANT:
     * We use the restaurant-specific function instead of
     * has_plan_feature(), because this API uses supabaseAdmin.
     */

    try {
      await requireFeature(order.restaurant_id, "payments")
    } catch (featureError) {
      return Response.json(
        { success: false, error: featureError.message },
        { status: 403 }
      )
    }

    /*
     * ============================================================
     * FINALIZE ORDER
     * ============================================================
     */

    const { data, error } = await supabaseAdmin.rpc(
      "stage3_finalize_order",
      {
        p_actor_id: user.id,
        p_order_id: orderId,
        p_payment_method: cleanMethod(body?.payment_method),
        p_paid_amount: paidAmount,
        p_offer_id: body?.offer_id || null
      }
    )

    if (error) {
      console.error(
        "FINALIZE BILL ERROR:",
        error
      )

      return Response.json(
        {
          success: false,
          error: error.message
        },
        { status: 400 }
      )
    }

    const bill = {
      order_id: data.order_id,
      invoice_no: data.invoice_no,

      subtotal: Number(data.subtotal || 0),
      discount: Number(data.discount || 0),
      tax: Number(data.tax || 0),
      total: Number(data.total || 0),

      paid_amount: Number(data.paid_amount || 0),

      payment_status: data.payment_status,
      payment_method: data.payment_method,

      offer_id: data.offer_id || null,

      subtotal_amount: Number(data.subtotal || 0),
      discount_amount: Number(data.discount || 0),
      tax_amount: Number(data.tax || 0),
      total_amount: Number(data.total || 0)
    }

    return Response.json({
      success: true,
      bill
    })
  } catch (error) {
    console.error(
      "FINALIZE BILL ERROR:",
      error
    )

    return Response.json(
      {
        success: false,
        error: error.message || "Billing failed"
      },
      { status: 401 }
    )
  }
}