import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"

export const runtime = "nodejs"

const num = (v) => Number(v || 0)
const key = (v) => String(v || "Unknown").trim() || "Unknown"

export async function GET(req) {
  try {
    const user = await requireApiUser(req)
    const resolved = await resolveRestaurantForUser(user)
    const url = new URL(req.url)
    const requestedRestaurantId = url.searchParams.get("restaurant_id")
    const days = Math.min(Math.max(Number(url.searchParams.get("days") || 30), 1), 365)
    const restaurantId = resolved.restaurantId

    if (!restaurantId || !requestedRestaurantId || String(restaurantId) !== String(requestedRestaurantId)) {
      return Response.json({ success: false, error: "Restaurant access denied" }, { status: 403 })
    }

    const since = new Date(Date.now() - days * 86400000).toISOString()
    const sinceDay = since.slice(0, 10)

    const [ordersRes, paymentsRes, refundsRes, expensesRes, itemsRes, closingsRes] = await Promise.all([
      supabaseCloudAdmin.from("orders").select("id,created_at,status,total_amount,subtotal,discount_amount,tax_amount,payment_status,payment_method,paid_amount,source_type,source_label,order_mode,customer_id,waiter_id").eq("restaurant_id", restaurantId).gte("created_at", since).order("created_at", { ascending: true }).limit(5000),
      supabaseCloudAdmin.from("order_payments").select("order_id,payment_method,amount,status,created_at").eq("restaurant_id", restaurantId).gte("created_at", since).limit(10000),
      supabaseCloudAdmin.from("order_refunds").select("order_id,amount,status,created_at").eq("restaurant_id", restaurantId).gte("created_at", since).limit(5000),
      supabaseCloudAdmin.from("expenses").select("category,amount,payment_method,expense_date").eq("restaurant_id", restaurantId).gte("expense_date", sinceDay).limit(5000),
      supabaseCloudAdmin.from("order_items").select("order_id,item_id,item_name,quantity,line_total,unit_price").in("order_id", []).limit(1),
      supabaseCloudAdmin.from("cash_closings").select("business_date,opening_cash,cash_sales,cash_in,cash_out,expense_cash,refunds,expected_cash,actual_cash,difference").eq("restaurant_id", restaurantId).gte("business_date", sinceDay).order("business_date", { ascending: true })
    ])

    if (ordersRes.error) throw ordersRes.error
    if (paymentsRes.error) throw paymentsRes.error
    if (refundsRes.error) throw refundsRes.error
    if (expensesRes.error) throw expensesRes.error
    if (closingsRes.error) throw closingsRes.error

    const orders = (ordersRes.data || []).filter(o => !["cancelled", "void", "deleted"].includes(key(o.status).toLowerCase()))
    const orderIds = orders.map(o => o.id).filter(Boolean)
    let items = []
    if (orderIds.length) {
      const res = await supabaseCloudAdmin.from("order_items").select("order_id,item_id,item_name,quantity,line_total,unit_price").in("order_id", orderIds).limit(20000)
      if (res.error) throw res.error
      items = res.data || []
    }

    const refunds = refundsRes.data || []
    const payments = paymentsRes.data || []
    const expenses = expensesRes.data || []

    const revenue = orders.reduce((s,o)=>s+num(o.total_amount),0)
    const discounts = orders.reduce((s,o)=>s+num(o.discount_amount),0)
    const taxes = orders.reduce((s,o)=>s+num(o.tax_amount),0)
    const refundTotal = refunds.filter(r=>key(r.status).toLowerCase() !== "rejected").reduce((s,r)=>s+num(r.amount),0)
    const expenseTotal = expenses.reduce((s,e)=>s+num(e.amount),0)

    const paymentMap = new Map()
    for (const p of payments) {
      const k = key(p.payment_method)
      paymentMap.set(k, (paymentMap.get(k)||0) + num(p.amount))
    }

    const sourceMap = new Map()
    for (const o of orders) {
      const k = key(o.source_label || o.source_type || o.order_mode)
      const row = sourceMap.get(k) || { source:k, orders:0, revenue:0 }
      row.orders += 1; row.revenue += num(o.total_amount); sourceMap.set(k,row)
    }

    const productMap = new Map()
    for (const i of items) {
      const k = key(i.item_name)
      const row = productMap.get(k) || { name:k, quantity:0, revenue:0 }
      row.quantity += num(i.quantity); row.revenue += num(i.line_total)
      productMap.set(k,row)
    }

    const expenseMap = new Map()
    for (const e of expenses) {
      const k = key(e.category)
      expenseMap.set(k, (expenseMap.get(k)||0) + num(e.amount))
    }

    const staffMap = new Map()
    for (const o of orders) {
      if (!o.waiter_id) continue
      const k = o.waiter_id
      const row = staffMap.get(k) || { staff_id:k, orders:0, revenue:0 }
      row.orders += 1; row.revenue += num(o.total_amount); staffMap.set(k,row)
    }

    const dailyMap = new Map()
    for (const o of orders) {
      const d = String(o.created_at).slice(0,10)
      const row = dailyMap.get(d) || { date:d, orders:0, revenue:0, discounts:0, taxes:0 }
      row.orders += 1; row.revenue += num(o.total_amount); row.discounts += num(o.discount_amount); row.taxes += num(o.tax_amount); dailyMap.set(d,row)
    }

    return Response.json({
      success:true,
      period:{days,since,since_day:sinceDay},
      summary:{orders:orders.length,revenue,discounts,taxes,refunds:refundTotal,expenses:expenseTotal,net_revenue:revenue-refundTotal,operating_result:revenue-refundTotal-expenseTotal,average_order_value:orders.length?revenue/orders.length:0},
      daily:Array.from(dailyMap.values()),
      payments:Array.from(paymentMap,([method,amount])=>({method,amount})).sort((a,b)=>b.amount-a.amount),
      sources:Array.from(sourceMap.values()).sort((a,b)=>b.revenue-a.revenue),
      products:Array.from(productMap.values()).sort((a,b)=>b.revenue-a.revenue).slice(0,20),
      expenses_by_category:Array.from(expenseMap,([category,amount])=>({category,amount})).sort((a,b)=>b.amount-a.amount),
      staff:Array.from(staffMap.values()).sort((a,b)=>b.revenue-a.revenue).slice(0,20),
      cash_closings:closingsRes.data || []
    })
  } catch (error) {
    console.error("REPORTS ANALYTICS ERROR:", error)
    const message = error?.message || "Reports analytics unavailable"
    const status = /invalid|expired|authentication/i.test(message) ? 401 : 500
    return Response.json({ success:false, error:message }, { status })
  }
}
