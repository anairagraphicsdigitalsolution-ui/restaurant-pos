import { supabaseAdmin } from "@/lib/supabaseServer"
import { validateExternalUrl } from "@/lib/pluginRuntime"

function clean(value, max = 500) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max)
}

function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export async function printOrderSlip(orderId, restaurantId) {
  if (!orderId || !restaurantId) return { attempted: false, printed: false, reason: "missing_order" }

  const [{ data: plugin }, { data: settings }, { data: restaurant }, { data: order }] = await Promise.all([
    supabaseAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id", restaurantId).eq("plugin_code", "thermal-printing").maybeSingle(),
    supabaseAdmin.from("plugin_settings").select("config").eq("restaurant_id", restaurantId).eq("plugin_code", "thermal-printing").maybeSingle(),
    supabaseAdmin.from("restaurants").select("name,address,phone,gst_number").eq("id", restaurantId).maybeSingle(),
    supabaseAdmin.from("orders").select("id,source_type,source_label,source_id,status,total_amount,created_at,overall_note").eq("id", orderId).eq("restaurant_id", restaurantId).maybeSingle(),
  ])

  if (!order) return { attempted: false, printed: false, reason: "order_not_found" }
  if (plugin?.enabled !== true) return { attempted: false, printed: false, reason: "thermal_plugin_disabled" }

  const cfg = settings?.config || {}
  const bridgeUrl = String(cfg.bridge_url || "").trim()
  if (!bridgeUrl) return { attempted: false, printed: false, reason: "printer_bridge_not_configured" }

  const [{ data: kot }, { data: items }] = await Promise.all([
    supabaseAdmin.from("kot_tickets").select("kot_no,status").eq("restaurant_id", restaurantId).eq("order_id", orderId).maybeSingle(),
    supabaseAdmin.from("order_items").select("id,item_name,quantity,unit_price,line_total,cooking_request").eq("order_id", orderId).order("id"),
  ])

  const itemIds = (items || []).map(i => i.id)
  const { data: modifiers } = itemIds.length
    ? await supabaseAdmin.from("order_item_modifiers").select("order_item_id,modifier_name,price,quantity").in("order_item_id", itemIds)
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

  const { data: job, error: jobError } = await supabaseAdmin.from("print_jobs").insert({
    restaurant_id: restaurantId,
    job_type: "kot",
    reference_id: orderId,
    payload: { order_id: orderId, kot_no: kot?.kot_no || null, source_type: order.source_type, source_label: order.source_label, content },
    status: "printing",
  }).select("id").single()
  if (jobError) console.warn("KOT print job create:", jobError.message)

  try {
    const bridge = validateExternalUrl(bridgeUrl, { allowPrivate: cfg.allow_private_bridge === true, requireHttps: cfg.allow_private_bridge !== true }).toString()
    const response = await fetch(bridge, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printer: cfg.thermal || cfg.queue || null, type: "kot", content, data: { order_id: orderId, kot_no: kot?.kot_no || null, size: cfg.kot_size || "80mm" } }),
      signal: AbortSignal.timeout(10000),
    })
    const text = await response.text()
    let result = text
    try { result = JSON.parse(text) } catch {}
    if (!response.ok) throw new Error(`Printer bridge ${response.status}`)
    if (job?.id) await supabaseAdmin.from("print_jobs").update({ status: "printed", printed_at: new Date().toISOString(), last_error: null }).eq("id", job.id)
    if (kot?.kot_no) await supabaseAdmin.from("kot_tickets").update({ printed_at: new Date().toISOString() }).eq("restaurant_id", restaurantId).eq("order_id", orderId)
    return { attempted: true, printed: true, result }
  } catch (error) {
    if (job?.id) await supabaseAdmin.from("print_jobs").update({ status: "failed", attempts: 1, last_error: String(error?.message || error) }).eq("id", job.id)
    return { attempted: true, printed: false, reason: String(error?.message || error) }
  }
}
