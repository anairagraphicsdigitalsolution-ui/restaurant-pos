import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"
import { requireFeature } from "@/lib/featureGateServer"

export const runtime = "nodejs"


function cleanMethod(value) {
  const method = String(value || "cash")
    .trim()
    .toLowerCase()

  return [
    "cash",
    "card",
    "upi",
    "online"
  ].includes(method)
    ? method
    : "cash"
}


export async function POST(req) {

  let idempotencyReservation = null

  try {

    // ==========================================================
    // AUTH
    // ==========================================================

    const user = await requireApiUser(req)

    const body = await req.json()

    const orderId =
      String(body?.order_id || "")
        .trim()


    if (!orderId) {

      return Response.json(
        {
          success: false,
          error: "Order is required"
        },
        { status: 400 }
      )

    }


    // ==========================================================
    // PAYMENT AMOUNT
    // ==========================================================

    const paidAmount =
      Number(
        body?.paid_amount || 0
      )


    if (
      !Number.isFinite(paidAmount) ||
      paidAmount < 0
    ) {

      return Response.json(
        {
          success: false,
          error: "Invalid paid amount"
        },
        { status: 400 }
      )

    }


    // ==========================================================
    // GET ORDER
    // ==========================================================

    const {
      data: order,
      error: orderError
    } = await supabaseAdmin

      .from("orders")

      .select(
        "id,restaurant_id,status,invoice_no,payment_status,subtotal,discount_amount,tax_amount,total_amount,paid_amount,payment_method,offer_id,customer_id,delivery_charge"
      )

      .eq(
        "id",
        orderId
      )

      .maybeSingle()


    if (orderError) {

      console.error(
        "BILLING ORDER LOOKUP ERROR:",
        orderError
      )

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

    // Billing is unlocked only after the operator explicitly marks the order
    // DONE. This server-side check prevents direct API calls from generating
    // invoices for Pending/Preparing orders, even if the UI is bypassed.
    if (String(order.status || "").trim().toLowerCase() !== "done") {
      return Response.json(
        {
          success: false,
          error: "Order is not marked Done yet. Mark the order Done before billing."
        },
        { status: 409 }
      )
    }

    // Optional explicit idempotency key. Frontends should reuse the same key
    // when retrying the same finalize click/network request. Existing callers
    // without a key continue to use the order-level paid-state idempotency.
    // Idempotency is per PAYMENT ATTEMPT, not per order. An order can be
    // partially paid and finalized again later for its remaining balance.
    // Reusing `billing-finalize:<order>` would replay the first partial
    // response forever and prevent the second payment from reaching the RPC.
    const idempotencyKey = String(req.headers.get("x-idempotency-key") || body?.idempotency_key || "").trim().slice(0, 180)
    if (idempotencyKey) {
      const { data: existingKey } = await supabaseAdmin
        .from("billing_idempotency_keys")
        .select("id,status,response,order_id,restaurant_id")
        .eq("restaurant_id", order.restaurant_id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle()

      if (existingKey?.response && existingKey.status === "completed") {
        const priorBill = existingKey.response?.bill || existingKey.response
        const priorStatus = String(priorBill?.payment_status || "").toLowerCase()

        // A completed *paid* request is a true idempotent replay.
        if (priorStatus === "paid") {
          return Response.json(existingKey.response)
        }

        // A completed partial/unpaid response is not a terminal finalize.
        // Remove only the idempotency marker; payment rows remain untouched.
        await supabaseAdmin
          .from("billing_idempotency_keys")
          .delete()
          .eq("id", existingKey.id)
      }
      if (existingKey?.status === "processing") {
        return Response.json({ success: false, error: "This billing request is already being processed. Please wait." }, { status: 409 })
      }

      const { data: reservation, error: reservationError } = await supabaseAdmin
        .from("billing_idempotency_keys")
        .insert({
          restaurant_id: order.restaurant_id,
          order_id: order.id,
          idempotency_key: idempotencyKey,
          status: "processing",
          created_by: user.id
        })
        .select("id")
        .single()

      if (reservationError) {
        if (String(reservationError.code) === "23505") {
          const { data: retryRow } = await supabaseAdmin
            .from("billing_idempotency_keys")
            .select("status,response")
            .eq("restaurant_id", order.restaurant_id)
            .eq("idempotency_key", idempotencyKey)
            .maybeSingle()
          if (retryRow?.status === "completed" && retryRow.response) return Response.json(retryRow.response)
          return Response.json({ success: false, error: "This billing request is already being processed. Please wait." }, { status: 409 })
        }
        throw reservationError
      }
      idempotencyReservation = reservation?.id || null
    }


    // ==========================================================
    // IDEMPOTENT RETRY
    // ==========================================================
    // If the first finalize already committed but the browser retried the
    // request (for example after a slow/network response), return the stored
    // invoice instead of asking the operator to finalize the same bill again.
    // Payment collection and invoice finalization are separate states.
    // Delivery can collect COD before Billing generates the invoice, so a
    // paid order without an invoice must still reach the canonical finalize RPC.

    // ==========================================================
    // FEATURE CHECK
    // ==========================================================

    try {

      await requireFeature(
        order.restaurant_id,
        "restaurant-core"
      )

    } catch (featureError) {

      return Response.json(
        {
          success: false,
          error:
            featureError.message ||
            "Restaurant Core is not enabled"
        },
        { status: 403 }
      )

    }


    // ==========================================================
    // CUSTOMER
    // ==========================================================

    const customerName =
      String(
        body?.customer_name || ""
      )
        .trim()
        .slice(0, 120)


    const customerPhone =
      String(
        body?.customer_phone || ""
      )
        .replace(/\D/g, "")
        .slice(0, 20)


    const customerEmail =
      String(
        body?.customer_email || ""
      )
        .trim()
        .slice(0, 160)


    let customerId = null


    if (customerPhone) {

      // --------------------------------------------------------
      // Existing customer
      // --------------------------------------------------------

      const {
        data: existingCustomer,
        error: customerLookupError
      } = await supabaseAdmin

        .from("customers")

        .select(
          "id,name,phone,email"
        )

        .eq(
          "restaurant_id",
          order.restaurant_id
        )

        .eq(
          "phone",
          customerPhone
        )

        .maybeSingle()


      if (customerLookupError) {

        console.error(
          "BILLING CUSTOMER LOOKUP ERROR:",
          customerLookupError
        )

        return Response.json(
          {
            success: false,
            error:
              customerLookupError.message ||
              "Unable to find customer"
          },
          { status: 400 }
        )

      }


      if (existingCustomer?.id) {

        customerId =
          existingCustomer.id


        const customerPatch = {}


        if (customerName) {
          customerPatch.name =
            customerName
        }


        if (customerEmail) {
          customerPatch.email =
            customerEmail
        }


        if (
          Object.keys(customerPatch).length
        ) {

          const {
            error: customerUpdateError
          } = await supabaseAdmin

            .from("customers")

            .update({
              ...customerPatch,
              updated_at:
                new Date().toISOString()
            })

            .eq(
              "id",
              customerId
            )

            .eq(
              "restaurant_id",
              order.restaurant_id
            )


          if (customerUpdateError) {

            console.error(
              "BILLING CUSTOMER UPDATE ERROR:",
              customerUpdateError
            )

          }

        }

      } else {

        // ------------------------------------------------------
        // Create customer
        // ------------------------------------------------------

        const {
          data: createdCustomer,
          error: customerCreateError
        } = await supabaseAdmin

          .from("customers")

          .insert({
            restaurant_id:
              order.restaurant_id,

            name:
              customerName ||
              "Walk-in Customer",

            phone:
              customerPhone,

            email:
              customerEmail ||
              null
          })

          .select("id")

          .single()


        if (customerCreateError) {

          console.error(
            "BILLING CUSTOMER CREATE ERROR:",
            customerCreateError
          )

          return Response.json(
            {
              success: false,
              error:
                customerCreateError.message ||
                "Unable to create customer"
            },
            { status: 400 }
          )

        }


        customerId =
          createdCustomer.id

      }


      // --------------------------------------------------------
      // Link customer to order
      // --------------------------------------------------------

      const {
        error: customerLinkError
      } = await supabaseAdmin

        .from("orders")

        .update({
          customer_id:
            customerId
        })

        .eq(
          "id",
          orderId
        )

        .eq(
          "restaurant_id",
          order.restaurant_id
        )


      if (customerLinkError) {

        console.error(
          "BILLING CUSTOMER LINK ERROR:",
          customerLinkError
        )

        return Response.json(
          {
            success: false,
            error:
              customerLinkError.message ||
              "Unable to link customer"
          },
          { status: 400 }
        )

      }

    }


    // ==========================================================
    // FINALIZE ORDER
    // ==========================================================

    const {
      data,
      error
    } = await supabaseAdmin.rpc(
      "stage3_finalize_order",
      {
        p_actor_id:
          user.id,

        p_order_id:
          orderId,

        p_payment_method:
          cleanMethod(
            body?.payment_method
          ),

        p_paid_amount:
          paidAmount,

        p_offer_id:
          body?.offer_id ||
          null,
        p_loyalty_reward_id:
          body?.loyalty_reward_id ||
          null,

        p_manual_discount_amount:
          Number(body?.manual_discount_amount || 0),

        p_manual_discount_mode:
          String(body?.manual_discount_mode || "amount")
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
          error:
            error.message ||
            "Unable to finalize bill"
        },
        { status: 400 }
      )

    }


    if (!data) {

      return Response.json(
        {
          success: false,
          error:
            "Finalize returned no bill"
        },
        { status: 400 }
      )

    }


    // ==========================================================
    // PAYMENT REFERENCE
    // ==========================================================

    const paymentReference =
      String(
        body?.payment_reference || ""
      )
        .trim()
        .slice(0, 120)


    const paymentReceived =
      Number(
        data?.payment_received ||
        data?.paid_amount ||
        0
      )


    if (
      paymentReference &&
      paymentReceived > 0
    ) {

      const {
        data: paymentRow
      } = await supabaseAdmin

        .from("order_payments")

        .select("id")

        .eq(
          "restaurant_id",
          order.restaurant_id
        )

        .eq(
          "order_id",
          orderId
        )

        .eq(
          "created_by",
          user.id
        )

        .eq(
          "status",
          "paid"
        )

        .eq(
          "amount",
          paymentReceived
        )

        .order(
          "created_at",
          {
            ascending: false
          }
        )

        .limit(1)

        .maybeSingle()


      if (paymentRow?.id) {

        await supabaseAdmin

          .from("order_payments")

          .update({
            reference:
              paymentReference
          })

          .eq(
            "id",
            paymentRow.id
          )

      }

    }


    // ==========================================================
    // FINAL BILL RESPONSE
    // ==========================================================

    const bill = {

      order_id:
        data.order_id,

      invoice_no:
        data.invoice_no,


      subtotal:
        Number(
          data.subtotal || 0
        ),


      discount:
        Number(
          data.discount || 0
        ),


      tax:
        Number(
          data.tax || 0
        ),

      delivery_charge:
        Number(
          data.delivery_charge || 0
        ),


      total:
        Number(
          data.total || 0
        ),


      paid_amount:
        Number(
          data.paid_amount || 0
        ),


      payment_received:
        Number(
          data.payment_received ??
          data.paid_amount ??
          0
        ),


      payment_status:
        data.payment_status,


      payment_method:
        data.payment_method,


      offer_id:
        data.offer_id ||
        null,


      customer_id:
        customerId ||
        null,


      subtotal_amount:
        Number(
          data.subtotal || 0
        ),


      discount_amount:
        Number(
          data.discount || 0
        ),


      tax_amount:
        Number(
          data.tax || 0
        ),


      total_amount:
        Number(
          data.total || 0
        )

    }


    const finalResponse = { success: true, bill }

    // KOT integration is primarily trigger-backed at order creation. The
    // idempotent upserts below also repair legacy orders created before the
    // KOT trigger existed, without creating duplicates.
    // Repair only missing legacy KOT rows. Never update an existing ticket here:
    // Billing must not reset a kitchen ticket from ready/done back to new when
    // a bill is finalized or a finalize request is retried.
    await supabaseAdmin.from("kitchen_order_tickets").upsert({
      restaurant_id: order.restaurant_id,
      order_id: order.id,
      status: "new",
      priority: "normal"
    }, { onConflict: "order_id", ignoreDuplicates: true })
    await supabaseAdmin.from("kot_tickets").upsert({
      restaurant_id: order.restaurant_id,
      order_id: order.id,
      status: "new"
    }, { onConflict: "order_id", ignoreDuplicates: true })

    if (idempotencyReservation) {
      await supabaseAdmin
        .from("billing_idempotency_keys")
        .update({ status: "completed", response: finalResponse, updated_at: new Date().toISOString() })
        .eq("id", idempotencyReservation)
    }

    return Response.json(finalResponse)


  } catch (error) {

    if (idempotencyReservation) {
      try {
        await supabaseAdmin.from("billing_idempotency_keys").update({ status: "failed", response: null, updated_at: new Date().toISOString() }).eq("id", idempotencyReservation)
      } catch {}
    }

    console.error(
      "FINALIZE BILL ERROR:",
      error
    )


    return Response.json(
      {
        success: false,
        error:
          error?.message ||
          "Billing failed"
      },
      { status: 401 }
    )

  }

}