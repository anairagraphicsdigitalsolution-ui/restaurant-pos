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
        "id,restaurant_id,invoice_no,payment_status,subtotal,discount_amount,tax_amount,total_amount,paid_amount,payment_method,offer_id,customer_id,delivery_charge"
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


    // ==========================================================
    // IDEMPOTENT RETRY
    // ==========================================================
    // If the first finalize already committed but the browser retried the
    // request (for example after a slow/network response), return the stored
    // invoice instead of asking the operator to finalize the same bill again.
    if (String(order.payment_status || "").toLowerCase() === "paid") {
      return Response.json({
        success: true,
        bill: {
          order_id: order.id,
          invoice_no: order.invoice_no || null,
          subtotal: Number(order.subtotal || 0),
          discount: Number(order.discount_amount || 0),
          tax: Number(order.tax_amount || 0),
          delivery_charge: Number(order.delivery_charge || 0),
          total: Number(order.total_amount || 0),
          paid_amount: Number(order.paid_amount || 0),
          payment_received: 0,
          payment_status: "paid",
          payment_method: order.payment_method || cleanMethod(body?.payment_method),
          offer_id: order.offer_id || null,
          customer_id: order.customer_id || null,
          subtotal_amount: Number(order.subtotal || 0),
          discount_amount: Number(order.discount_amount || 0),
          tax_amount: Number(order.tax_amount || 0),
          total_amount: Number(order.total_amount || 0)
        }
      })
    }


    // ==========================================================
    // FEATURE CHECK
    // ==========================================================

    try {

      await requireFeature(
        order.restaurant_id,
        "payments"
      )

    } catch (featureError) {

      return Response.json(
        {
          success: false,
          error:
            featureError.message ||
            "Payments feature is not enabled"
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
        error:
          error?.message ||
          "Billing failed"
      },
      { status: 401 }
    )

  }

}