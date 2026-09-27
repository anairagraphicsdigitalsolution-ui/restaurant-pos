import "server-only"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"

function clean(value, max = 500) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max)
}

function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Cloud-first KOT printing.
 *
 * The Next/Supabase server NEVER tries to reach localhost or a customer's
 * Bluetooth adapter. It creates a durable print_jobs row in Supabase.
 * A connected Anaira Android printer agent claims that job and sends ESC/POS
 * bytes to the local Bluetooth printer.
 */
export async function printOrderSlip(orderId, restaurantId) {
  if (!orderId || !restaurantId) return { attempted: false, printed: false, reason: "missing_order" }

  const [{ data: plugin }, { data: settings }, { data: restaurant }, { data: order }] = await Promise.all([
    supabaseCloudAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id", restaurantId).eq("plugin_code", "thermal-printing").maybeSingle(),
    supabaseCloudAdmin.from("plugin_settings").select("config").eq("restaurant_id", restaurantId).eq("plugin_code", "thermal-printing").maybeSingle(),
    supabaseCloudAdmin.from("restaurants").select("name,address,phone,gst_number").eq("id", restaurantId).maybeSingle(),
    supabaseCloudAdmin.from("orders").select("id,source_type,source_label,source_id,status,total_amount,created_at,overall_note").eq("id", orderId).eq("restaurant_id", restaurantId).maybeSingle(),
  ])

  if (!order) return { attempted: false, printed: false, reason: "order_not_found" }
  if (plugin?.enabled !== true) return { attempted: false, printed: false, reason: "thermal_plugin_disabled" }

  const cfg = settings?.config || {}
  const [{ data: kot }, { data: items }] = await Promise.all([
    supabaseCloudAdmin.from("kot_tickets").select("kot_no,status").eq("restaurant_id", restaurantId).eq("order_id", orderId).maybeSingle(),
    supabaseCloudAdmin.from("order_items").select("id,item_name,quantity,unit_price,line_total,cooking_request").eq("order_id", orderId).order("id"),
  ])

  const itemIds = (items || []).map(i => i.id)
  const { data: modifiers } = itemIds.length
    ? await supabaseCloudAdmin.from("order_item_modifiers").select("order_item_id,modifier_name,price,quantity").in("order_item_id", itemIds)
    : { data: [] }
  const mods = {}
  ;(modifiers || []).forEach(m => { (mods[m.order_item_id] ||= []).push(m) })

  const lines = [
    clean(restaurant?.name || "Restaurant", 80),
    clean(order.source_label || order.source_type || "Order", 80),
    `KOT #${kot?.kot_no ?? "—"}   ORDER #${String(order.id).slice(0, 8)}`,
    new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" }).format(new Date(order.created_at || Date.now())),
    "--------------------------------",
    ...(items || []).flatMap(item => {
      const rows = [`${item.item_name || "Item"} x${item.quantity}  ${money(item.line_total)}`]
      ;(mods[item.id] || []).forEach(m => rows.push(`  + ${m.modifier_name || "Modifier"} x${m.quantity || 1}`))
      if (item.cooking_request) rows.push(`  Note: ${clean(item.cooking_request, 160)}`)
      return rows
    }),
    "--------------------------------",
    `TOTAL ${money(order.total_amount)}`,
    ...(order.overall_note ? [`Note: ${clean(order.overall_note, 200)}`] : []),
  ]
  const content = lines.join("\n")

  const { data: job, error: jobError } = await supabaseCloudAdmin.from("print_jobs").insert({
    restaurant_id: restaurantId,
    job_type: "kot",
    reference_id: orderId,
    payload: {
      order_id: orderId,
      kot_no: kot?.kot_no || null,
      source_type: order.source_type,
      source_label: order.source_label,
      content,
      title: `${restaurant?.name || "ANAIRA"} - KOT`,
      footer: "KITCHEN COPY",
      kot_size: cfg.kot_size || "80mm",
      queued_by: "cloud",
    },
    status: "queued",
  }).select("id,status,created_at").single()

  if (jobError) {
    console.error("Cloud KOT print queue:", jobError.message)
    return { attempted: true, printed: false, reason: jobError.message }
  }

  return { attempted: true, printed: false, queued: true, cloud: true, job_id: job.id, status: job.status }
}
