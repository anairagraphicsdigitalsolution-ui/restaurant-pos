"use client"

import { useEffect, useMemo, useState } from "react"
import { supabasePublic as supabase } from "@/lib/supabasePublic"

const modules = [
  ["pos", "🧾", "POS & Billing"], ["floor", "🪑", "Floor & Tables"],
  ["kitchen", "👨‍🍳", "KOT / KDS"], ["delivery", "🛵", "Delivery & COD"],
  ["reservations", "📅", "Reservations"], ["captain", "📱", "Captain"],
  ["digital", "📲", "QR / Kiosk"], ["online", "🔗", "Online Channels"],
  ["crm", "👥", "CRM / Loyalty"], ["cash", "💵", "Cash & Shifts"],
  ["reports", "📊", "Reports"], ["hardware", "🖨️", "Hardware"],
  ["marketing", "📣", "Marketing"], ["enterprise", "🏢", "Enterprise"],
]

const money = n => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

export default function UltimateRestaurantSuite() {
  const [rid, setRid] = useState("")
  const [tab, setTab] = useState("pos")
  const [msg, setMsg] = useState("")
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ orders: 0, revenue: 0, tables: 0, occupied: 0, deliveries: 0, pendingSettlement: 0 })
  const [rows, setRows] = useState({ orders: [], tables: [], deliveries: [], calls: [], jobs: [], shifts: [], reports: [], segments: [], devices: [] })

  useEffect(() => { init() }, [])

  async function init() {
    const { data: auth } = await supabase.auth.getUser()
    const user = auth?.user
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from("profiles").select("restaurant_id").eq("id", user.id).maybeSingle()
    if (!profile?.restaurant_id) { setLoading(false); return }
    setRid(profile.restaurant_id)
    await load(profile.restaurant_id)
  }

  async function load(id = rid) {
    if (!id) return
    setLoading(true)
    const q = await Promise.all([
      supabase.from("orders").select("id,total_amount,status,payment_status,order_mode,created_at").eq("restaurant_id", id).order("created_at", { ascending: false }).limit(50),
      supabase.from("dining_tables").select("id,table_no,status,capacity").eq("restaurant_id", id),
      supabase.from("restaurant_deliveries").select("id,status,collection_status,collection_expected,collection_received,customer_name,created_at").eq("restaurant_id", id).order("created_at", { ascending: false }).limit(50),
      supabase.from("restaurant_service_calls").select("id,call_type,status,table_id,created_at").eq("restaurant_id", id).order("created_at", { ascending: false }).limit(30),
      supabase.from("restaurant_integration_jobs").select("id,integration_code,job_type,status,attempts,created_at").eq("restaurant_id", id).order("created_at", { ascending: false }).limit(30),
      supabase.from("restaurant_cash_movements").select("id,movement_type,amount,reference,created_at").eq("restaurant_id", id).order("created_at", { ascending: false }).limit(30),
      supabase.from("restaurant_report_runs").select("id,report_type,status,created_at").eq("restaurant_id", id).order("created_at", { ascending: false }).limit(20),
      supabase.from("restaurant_customer_segments").select("id,name,code,active").eq("restaurant_id", id).order("name"),
      supabase.from("restaurant_hardware_devices").select("id,name,device_type,active,last_seen_at").eq("restaurant_id", id).order("name"),
    ])
    const [orders, tables, deliveries, calls, jobs, shifts, reports, segments, devices] = q.map(x => Array.isArray(x.data) ? x.data : [])
    const revenue = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0)
    setRows({ orders, tables, deliveries, calls, jobs, shifts, reports, segments, devices })
    setStats({
      orders: orders.length,
      revenue,
      tables: tables.length,
      occupied: tables.filter(t => ["occupied", "running", "billing"].includes(String(t.status).toLowerCase())).length,
      deliveries: deliveries.length,
      pendingSettlement: deliveries.filter(d => ["pending_collection", "pending_settlement"].includes(d.collection_status)).length,
    })
    setLoading(false)
  }

  async function insert(table, payload, text) {
    const { error } = await supabase.from(table).insert({ restaurant_id: rid, ...payload })
    setMsg(error?.message || text)
    if (!error) await load()
  }

  const pendingCalls = useMemo(() => rows.calls.filter(x => x.status !== "resolved" && x.status !== "cancelled").length, [rows.calls])

  if (loading) return <main className="ultimate"><div className="loading">Loading Anaira Restaurant Suite…</div></main>

  return <main className="ultimate">
    <header className="hero">
      <div><small>ANAIRA RESTAURANT SUITE</small><h1>Complete Operations Center</h1><p>POS, tables, kitchen, delivery, customers, channels, reports and enterprise controls.</p></div>
      <button onClick={() => load()}>↻ Refresh</button>
    </header>

    <section className="metrics">
      <Metric title="Today's orders" value={stats.orders} icon="🧾" />
      <Metric title="Sales" value={money(stats.revenue)} icon="₹" />
      <Metric title="Tables occupied" value={`${stats.occupied}/${stats.tables}`} icon="🪑" />
      <Metric title="COD unsettled" value={stats.pendingSettlement} icon="💰" />
      <Metric title="Service calls" value={pendingCalls} icon="📢" />
    </section>

    <nav className="tabs">{modules.map(([id, icon, label]) => <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id)}>{icon} {label}</button>)}</nav>
    {msg && <div className="msg">{msg}</div>}

    {tab === "pos" && <Panel title="POS / Billing"><InfoGrid items={[["Hold / Park", "Hold an active order and resume later."], ["Split / Merge", "Split by item/payment and merge bills."], ["Refund / Void", "Manager-controlled reversal with audit."], ["Discounts", "Coupons, percentage, flat and approval rules."], ["Payments", "Cash, UPI, card, partial and multiple payments."], ["E-Bill", "Receipt, invoice and reprint workflow."]]} /><OrderList orders={rows.orders} /></Panel>}
    {tab === "floor" && <Panel title="Floor & Tables"><InfoGrid items={[["Visual Floor", "Store table positions and floor layouts."], ["Occupancy", "Available, occupied, reserved and billing states."], ["Transfer", "Move a running order between tables."], ["Merge / Split", "Combine or split table sessions."], ["Reservations", "Reserve tables and connect booking to service."], ["Calling", "Table service requests reach the staff queue."]]} /><TableList tables={rows.tables} /></Panel>}
    {tab === "kitchen" && <Panel title="KOT / KDS"><InfoGrid items={[["Station Routing", "Route items to kitchen, bar and packing stations."], ["KOT", "New → accepted → preparing → ready → served."], ["Timers", "Track preparation time and delayed orders."], ["Priority", "Rush and priority production handling."], ["Re-fire", "Re-fire selected items without duplicating the bill."], ["Bump", "Complete a station ticket from KDS."]]} /></Panel>}
    {tab === "delivery" && <Panel title="Delivery & COD"><InfoGrid items={[["Delivery Slip", "Print the amount that must be collected."], ["Rider", "Assign a rider or choose restaurant owner."], ["COD Hold", "Payment remains unsettled until money returns."], ["Settlement", "Record cash/UPI/card actually received."], ["Variance", "Automatic shortage/overage calculation."], ["Audit", "Every delivery and settlement event is recorded."]]} /><DeliveryList deliveries={rows.deliveries} /></Panel>}
    {tab === "reservations" && <Panel title="Reservations"><InfoGrid items={[["Calendar", "Booking date/time and guest count."], ["Waitlist", "Queue guests when tables are unavailable."], ["Deposits", "Record reservation deposits."], ["No-show", "Track cancelled and no-show bookings."], ["Reminders", "Reservation reminder records."], ["Table Assignment", "Connect reservation to table session."]]} /></Panel>}
    {tab === "captain" && <Panel title="Captain / Waiter"><InfoGrid items={[["Assigned Tables", "Captain sees assigned tables."], ["Order Entry", "Items, variants and modifiers."], ["KOT", "Send selected items to kitchen."], ["Reorder", "Add another round to the running table."], ["Payment", "Request and close bill."], ["Offline", "Queue table-side operations for later sync."]]} /></Panel>}
    {tab === "digital" && <Panel title="QR / Kiosk / Display"><InfoGrid items={[["QR Order", "Table QR → menu → cart → order."], ["Scan & Pay", "Customer payment request against table."], ["Kiosk", "Self-order, payment, token and KOT."], ["Multi-language", "Language-aware kiosk settings."], ["Display", "Menu, token and ready-order screens."], ["Calling", "Waiter and service request queue."]]} /></Panel>}
    {tab === "online" && <Panel title="Online Channels"><InfoGrid items={[["Website", "Direct ordering from restaurant website."], ["Aggregators", "Provider account and outlet configuration."], ["Menu Sync", "Publish menu versions to channels."], ["Order Sync", "Queue provider order ingestion/status jobs."], ["Reconciliation", "Compare gross, commission and settlement."], ["Integration Jobs", "Track success/failure/retry state."]]} /><JobList jobs={rows.jobs} /></Panel>}
    {tab === "crm" && <Panel title="CRM / Loyalty"><InfoGrid items={[["Segments", "VIP, repeat, dormant and new rules."], ["Loyalty", "Points, tiers, rewards and wallet."], ["Feedback", "Ratings, comments and response workflow."], ["Campaigns", "Target a segment with a promotion."], ["Wallet", "Top-up, redemption and ledger."], ["Customer History", "Orders, spend and preferences."]]} /><div className="list">{rows.segments.map(x => <div className="row" key={x.id}><b>{x.name}</b><span>{x.code} • {x.active ? "Active" : "Disabled"}</span></div>)}</div></Panel>}
    {tab === "cash" && <Panel title="Cash & Shifts"><InfoGrid items={[["Opening Cash", "Start a cashier shift with opening float."], ["Cash In/Out", "Record non-sale cash movements."], ["Expected", "Calculate expected cash from payments."], ["Closing", "Compare expected vs counted cash."], ["Variance", "Record shortage/overage with reason."], ["Approval", "Manager approval for exceptional adjustments."]]} /></Panel>}
    {tab === "reports" && <Panel title="Reports"><InfoGrid items={[["Sales", "Orders, revenue and average bill."], ["Payments", "Cash, UPI, card and settlement."], ["KOT", "Preparation time and station performance."], ["Staff", "Sales, discounts, voids and productivity."], ["Online", "Channel commissions and payouts."], ["Scheduled", "Recurring report definitions and runs."]]} /><div className="list">{rows.reports.map(x => <div className="row" key={x.id}><b>{x.report_type}</b><span>{x.status}</span></div>)}</div></Panel>}
    {tab === "hardware" && <Panel title="Hardware"><InfoGrid items={[["Thermal Printer", "KOT, bill and delivery slip jobs."], ["A4 Printer", "Professional invoice printing."], ["KDS Screen", "Station display device."], ["Kiosk", "Self-order terminal registry."], ["Calling Device", "Service request device."], ["Payment Terminal", "Card/UPI terminal registry."]]} /><div className="list">{rows.devices.map(x => <div className="row" key={x.id}><b>{x.name}</b><span>{x.device_type} • {x.active ? "Active" : "Disabled"}</span></div>)}</div></Panel>}
    {tab === "marketing" && <Panel title="Marketing"><InfoGrid items={[["SMS", "Provider-ready campaign queue."], ["WhatsApp", "Invoice and campaign message queue."], ["Birthday", "Automated customer segment targeting."], ["Dormant", "Reactivation campaigns."], ["Offers", "Coupons and targeted promotions."], ["Feedback", "Post-order feedback requests."]]} /></Panel>}
    {tab === "enterprise" && <Panel title="Enterprise"><InfoGrid items={[["Multi Branch", "Branch-level users, menus and reports."], ["Head Office", "Consolidated outlet performance."], ["Central Menu", "Version and publish menus."], ["Central Kitchen", "Production and branch dispatch."], ["Roles", "Owner, manager, cashier, captain and kitchen rights."], ["Integrations", "Accounting, messaging, payment and delivery adapters."]]} /></Panel>}
  </main>
}

function Metric({ title, value, icon }) { return <div className="metric"><span>{icon}</span><small>{title}</small><strong>{value}</strong></div> }
function Panel({ title, children }) { return <section className="panel"><h2>{title}</h2>{children}</section> }
function InfoGrid({ items }) { return <div className="info-grid">{items.map(([title, text]) => <div className="info" key={title}><b>{title}</b><p>{text}</p></div>)}</div> }
function OrderList({ orders }) { return <div className="list">{orders.slice(0, 15).map(o => <div className="row" key={o.id}><b>#{String(o.id).slice(0, 8)}</b><span>{o.order_mode || "POS"} • {o.status || "pending"} • {money(o.total_amount)}</span></div>)}</div> }
function TableList({ tables }) { return <div className="table-grid">{tables.map(t => <div className="table" key={t.id}><b>{t.table_no || "Table"}</b><span>{t.capacity || 2} seats</span><em>{t.status || "available"}</em></div>)}</div> }
function DeliveryList({ deliveries }) { return <div className="list">{deliveries.slice(0, 15).map(d => <div className="row" key={d.id}><b>{d.customer_name || "Delivery"}</b><span>{d.status} • {d.collection_status} • {money(d.collection_expected)} expected</span></div>)}</div> }
function JobList({ jobs }) { return <div className="list">{jobs.slice(0, 15).map(j => <div className="row" key={j.id}><b>{j.integration_code}</b><span>{j.job_type} • {j.status} • {j.attempts} attempts</span></div>)}</div> }

const styles = `.ultimate{min-height:100vh;padding:24px;max-width:1500px;margin:auto;background:var(--background,#07120e);color:var(--text,#f4efe5)}.hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding:28px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:24px;background:var(--surface,#0d261c)}.hero small{color:var(--primary,#e3ad39);font-weight:800;letter-spacing:.18em}.hero h1{margin:8px 0;font-size:clamp(28px,4vw,48px)}.hero p,.info p,.row span,.metric small{color:var(--muted,#aeb8b2)}button{border:1px solid var(--border,rgba(255,255,255,.12));border-radius:11px;padding:10px 14px;background:var(--surface-2,#123025);color:var(--text,#f4efe5);font-weight:700;cursor:pointer}.hero button:hover,.tabs .active{background:var(--primary,#e3ad39);color:#111}.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin:18px 0}.metric,.panel,.info,.table{border:1px solid var(--border,rgba(255,255,255,.12));background:var(--surface,#0d261c);border-radius:18px}.metric{padding:18px}.metric span{font-size:24px;display:block}.metric small,.metric strong{display:block;margin-top:7px}.metric strong{font-size:25px}.tabs{display:flex;gap:8px;overflow:auto;padding:4px 0 16px}.tabs button{white-space:nowrap}.msg{padding:12px;margin-bottom:14px;border-radius:12px;border:1px solid rgba(227,173,57,.35)}.panel{padding:20px;margin-bottom:20px}.panel h2{margin-top:0}.info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px}.info{padding:16px}.info p{margin-bottom:0;line-height:1.5}.list{display:flex;flex-direction:column}.row{display:flex;justify-content:space-between;gap:15px;padding:13px 0;border-top:1px solid rgba(255,255,255,.07)}.table-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.table{padding:16px;display:flex;flex-direction:column;gap:8px}.table span{color:var(--muted,#aeb8b2);font-size:13px}.table em{text-transform:capitalize;color:var(--primary,#e3ad39);font-style:normal}.loading{min-height:80vh;display:grid;place-items:center;color:var(--muted,#aeb8b2)}@media(max-width:1000px){.metrics{grid-template-columns:repeat(3,1fr)}.info-grid{grid-template-columns:repeat(2,1fr)}.table-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:650px){.ultimate{padding:14px}.hero{flex-direction:column}.metrics,.info-grid,.table-grid{grid-template-columns:1fr}.panel{padding:15px}.row{flex-direction:column;align-items:flex-start}}`

if (typeof document !== "undefined" && !document.getElementById("anaira-ultimate-style")) {
  const style = document.createElement("style")
  style.id = "anaira-ultimate-style"
  style.textContent = styles
  document.head.appendChild(style)
}
