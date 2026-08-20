"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { supabasePublic as supabase } from "@/lib/supabasePublic"

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

function Card({ title, children, action }) {
  return <section className="cmd-card"><header><div><h2>{title}</h2></div>{action || null}</header>{children}</section>
}

function Stat({ icon, title, value, note }) {
  return <div className="cmd-stat"><div className="cmd-icon">{icon}</div><span>{title}</span><strong>{value}</strong><small>{note}</small></div>
}

export default function RestaurantCommandCenter() {
  const [rid, setRid] = useState("")
  const [tab, setTab] = useState("overview")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [data, setData] = useState({})
  const [walletForm, setWalletForm] = useState({ customer_id: "", points: "", amount: "", transaction_type: "adjustment", note: "" })
  const [displayForm, setDisplayForm] = useState({ token_no: "", display_name: "", message: "" })
  const [settlement, setSettlement] = useState({ rider_id: "", rider_name: "", expected_cash: "", expected_upi: "", expected_card: "", submitted_cash: "", submitted_upi: "", submitted_card: "", notes: "" })

  const load = useCallback(async (restaurantId) => {
    if (!restaurantId) return
    setLoading(true)
    const queries = {
      tables: supabase.from("dining_tables").select("id,table_no,status,x,y,width,height,capacity,area_id").eq("restaurant_id", restaurantId).order("table_no").limit(200),
      areas: supabase.from("restaurant_areas").select("id,name").eq("restaurant_id", restaurantId).order("sort_order"),
      orders: supabase.from("orders").select("id,status,total_amount,subtotal,discount_amount,tax_amount,payment_status,order_mode,waiter_id,customer_id,table_id,created_at,source_label").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(300),
      payments: supabase.from("order_payments").select("id,order_id,payment_method,amount,status,created_at,created_by").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(300),
      customers: supabase.from("customers").select("id,name,phone").eq("restaurant_id", restaurantId).order("name").limit(200),
      wallets: supabase.from("customer_wallets").select("id,customer_id,balance,points,updated_at").eq("restaurant_id", restaurantId).limit(200),
      walletTx: supabase.from("customer_wallet_transactions").select("id,customer_id,transaction_type,amount,points,notes,created_at").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(100),
      riders: supabase.from("delivery_riders").select("id,name,phone").eq("restaurant_id", restaurantId).order("name"),
      deliverySettlements: supabase.from("delivery_settlements").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(100),
      payouts: supabase.from("aggregator_payouts").select("*").eq("restaurant_id", restaurantId).order("payout_date", { ascending: false }).limit(100),
      displays: supabase.from("digital_display_calls").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(50),
      terminals: supabase.from("pos_terminals").select("*").eq("restaurant_id", restaurantId).order("terminal_name"),
      branches: supabase.from("restaurant_branches").select("id,name,code,active").eq("parent_restaurant_id", restaurantId).order("name"),
      plugins: supabase.from("restaurant_plugins").select("plugin_code,enabled").eq("restaurant_id", restaurantId),
    }
    const entries = await Promise.all(Object.entries(queries).map(async ([key, query]) => [key, (await query).data || []]))
    setData(Object.fromEntries(entries))
    setLoading(false)
  }, [])

  useEffect(() => {
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth?.user) { setLoading(false); return }
      const { data: profile, error } = await supabase.from("profiles").select("restaurant_id").eq("id", auth.user.id).maybeSingle()
      if (error || !profile?.restaurant_id) { setMessage(error?.message || "Restaurant profile not found"); setLoading(false); return }
      setRid(profile.restaurant_id)
      await load(profile.restaurant_id)
    })()
  }, [load])

  const todayOrders = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    return (data.orders || []).filter(o => new Date(o.created_at) >= start)
  }, [data.orders])

  const revenue = useMemo(() => todayOrders.reduce((s, o) => ["cancelled", "canceled", "void"].includes(String(o.status).toLowerCase()) ? s : s + Number(o.total_amount || 0), 0), [todayOrders])
  const paid = useMemo(() => (data.payments || []).filter(p => p.status === "paid").reduce((s, p) => s + Number(p.amount || 0), 0), [data.payments])
  const occupied = (data.tables || []).filter(t => ["occupied", "running", "billing"].includes(String(t.status).toLowerCase())).length
  const avgBill = todayOrders.length ? revenue / todayOrders.length : 0

  const staffStats = useMemo(() => {
    const map = new Map()
    for (const order of data.orders || []) {
      const key = order.waiter_id || "unassigned"
      const row = map.get(key) || { id: key, orders: 0, sales: 0, discounts: 0 }
      row.orders += 1
      row.sales += Number(order.total_amount || 0)
      row.discounts += Number(order.discount_amount || 0)
      map.set(key, row)
    }
    return [...map.values()].sort((a, b) => b.sales - a.sales).slice(0, 20)
  }, [data.orders])

  const insights = useMemo(() => {
    const list = []
    if (todayOrders.length === 0) list.push(["📈", "No orders yet today", "Your live sales dashboard is ready; connect POS/online channels to start measuring today."])
    if (todayOrders.length > 0 && avgBill < 300) list.push(["🛒", "Average bill is low", `Today's average bill is ${money(avgBill)}. Consider a combo/add-on recommendation.`])
    if (occupied > 0 && (data.tables || []).length > 0 && occupied / data.tables.length < 0.3) list.push(["🪑", "Table occupancy is low", "Consider a happy-hour or targeted offer during the next slow period."])
    const discountRate = revenue > 0 ? todayOrders.reduce((s, o) => s + Number(o.discount_amount || 0), 0) / revenue : 0
    if (discountRate > 0.1) list.push(["🏷️", "Discount pressure is high", `Discounts are about ${(discountRate * 100).toFixed(1)}% of today's sales.`])
    const pending = todayOrders.filter(o => !["completed", "delivered", "cancelled", "canceled", "void"].includes(String(o.status).toLowerCase())).length
    if (pending >= 5) list.push(["👨‍🍳", "Kitchen queue needs attention", `${pending} orders are still active/pending.`])
    if (paid < revenue && revenue > 0) list.push(["💳", "Payment reconciliation needed", `${money(revenue - paid)} of loaded order value is not represented by paid payment records.`])
    if (!list.length) list.push(["✅", "Operations look healthy", "No immediate operational warning was detected from the loaded data."])
    return list
  }, [todayOrders, avgBill, occupied, data.tables, revenue, paid])

  async function api(action, payload) {
    setBusy(true)
    const { data: session } = await supabase.auth.getSession()
    const response = await fetch("/api/restaurant-operations", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.session?.access_token || ""}` }, body: JSON.stringify({ action, ...payload }) })
    const json = await response.json().catch(() => ({}))
    setBusy(false)
    setMessage(json.error || (response.ok ? "Saved successfully" : "Operation failed"))
    if (response.ok) await load(rid)
  }

  async function moveTable(table, dx, dy) {
    const x = Number(table.x || 0) + dx
    const y = Number(table.y || 0) + dy
    const { error } = await supabase.from("dining_tables").update({ x, y }).eq("id", table.id).eq("restaurant_id", rid)
    setMessage(error?.message || "Table position updated")
    if (!error) await load(rid)
  }

  async function walletAdjust(e) {
    e.preventDefault()
    await api("wallet_adjust", { ...walletForm, points: Number(walletForm.points || 0), amount: Number(walletForm.amount || 0) })
    setWalletForm({ customer_id: "", points: "", amount: "", transaction_type: "adjustment", note: "" })
  }

  if (loading) return <main className="cmd-page"><div className="cmd-loading">Loading Operations Command Center…</div></main>

  return <main className="cmd-page">
    <header className="cmd-hero">
      <div><small>ANAIRA RESTAURANT OS</small><h1>Operations Command Center</h1><p>POS • Floor • KDS • Delivery • CRM • Reconciliation • Intelligence</p></div>
      <button onClick={() => load(rid)} disabled={busy}>{busy ? "Working…" : "↻ Refresh"}</button>
    </header>

    <nav className="cmd-tabs">{[
      ["overview", "📊 Overview"], ["floor", "🪑 Floor"], ["staff", "👥 Staff"], ["recon", "💰 Reconciliation"], ["loyalty", "🎁 Loyalty"], ["display", "📺 Display"], ["insights", "🧠 Insights"], ["enterprise", "🏢 Enterprise"],
    ].map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</nav>

    <div className="cmd-stats">
      <Stat icon="₹" title="Today's Sales" value={money(revenue)} note={`${todayOrders.length} orders`} />
      <Stat icon="🧾" title="Average Bill" value={money(avgBill)} note="per order today" />
      <Stat icon="🪑" title="Occupied Tables" value={`${occupied}/${(data.tables || []).length}`} note="live floor" />
      <Stat icon="💳" title="Paid Payments" value={money(paid)} note="loaded payment records" />
    </div>

    {tab === "overview" && <div className="cmd-grid">
      <Card title="Today's channel mix"><div className="cmd-list">{Object.entries(todayOrders.reduce((m, o) => { const k = o.source_label || o.order_mode || "POS"; m[k] = (m[k] || 0) + 1; return m }, {})).map(([k, v]) => <div className="cmd-row" key={k}><b>{k}</b><span>{v} orders</span></div>)}</div></Card>
      <Card title="Top order values"><div className="cmd-list">{[...todayOrders].sort((a,b) => Number(b.total_amount||0)-Number(a.total_amount||0)).slice(0,8).map(o => <div className="cmd-row" key={o.id}><b>#{String(o.id).slice(0,8)}</b><span>{money(o.total_amount)} • {o.status}</span></div>)}</div></Card>
      <Card title="Quick links"><div className="cmd-links"><a href="/dashboard/restaurant-suite/operations">Full parity hub →</a><a href="/dashboard/restaurant-suite/advanced">Advanced suite →</a><a href="/dashboard/offers">Offers →</a><a href="/dashboard/notifications">Notifications →</a></div></Card>
      <Card title="Enabled plugins"><div className="cmd-list">{(data.plugins || []).filter(x => x.enabled).slice(0, 30).map(x => <div className="cmd-row" key={x.plugin_code}><b>{x.plugin_code}</b><span>Enabled</span></div>)}</div></Card>
    </div>}

    {tab === "floor" && <Card title="Live Floor Map" action={<span className="cmd-note">Use the arrows to reposition tables.</span>}>
      <div className="floor-map">{(data.tables || []).map(t => <div key={t.id} className={`floor-table ${String(t.status).toLowerCase()}`} style={{ left: `${Math.max(0, Number(t.x || 0))}px`, top: `${Math.max(0, Number(t.y || 0))}px` }}><b>{t.table_no}</b><small>{t.status}</small><div><button onClick={() => moveTable(t, -20, 0)}>←</button><button onClick={() => moveTable(t, 20, 0)}>→</button><button onClick={() => moveTable(t, 0, -20)}>↑</button><button onClick={() => moveTable(t, 0, 20)}>↓</button></div></div>)}</div>
    </Card>}

    {tab === "staff" && <Card title="Staff Performance" subtitle="Calculated from waiter_id/order data"><div className="cmd-table"><div className="cmd-head"><b>Staff</b><b>Orders</b><b>Sales</b><b>Discounts</b></div>{staffStats.map(s => <div className="cmd-head" key={s.id}><span>{s.id === "unassigned" ? "Unassigned" : String(s.id).slice(0, 8)}</span><span>{s.orders}</span><span>{money(s.sales)}</span><span>{money(s.discounts)}</span></div>)}</div></Card>}

    {tab === "recon" && <div className="cmd-grid"><Card title="Delivery settlement"><form className="cmd-form" onSubmit={e => { e.preventDefault(); api("delivery_settlement", settlement); setSettlement({ rider_id: "", rider_name: "", expected_cash: "", expected_upi: "", expected_card: "", submitted_cash: "", submitted_upi: "", submitted_card: "", notes: "" }) }}><select value={settlement.rider_id} onChange={e => { const r = (data.riders || []).find(x => x.id === e.target.value); setSettlement({ ...settlement, rider_id: e.target.value, rider_name: r?.name || "" }) }}><option value="">Select rider</option>{(data.riders || []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>{["expected_cash","expected_upi","expected_card","submitted_cash","submitted_upi","submitted_card"].map(k => <input key={k} type="number" step="0.01" placeholder={k.replaceAll("_", " ")} value={settlement[k]} onChange={e => setSettlement({ ...settlement, [k]: e.target.value })} />)}<input placeholder="Notes" value={settlement.notes} onChange={e => setSettlement({ ...settlement, notes: e.target.value })}/><button>Settle rider</button></form></Card><Card title="Aggregator payouts"><div className="cmd-list">{(data.payouts || []).map(p => <div className="cmd-row" key={p.id}><b>{p.channel_code}</b><span>{money(p.net_payout)} • {p.status}</span></div>)}</div></Card></div>}

    {tab === "loyalty" && <div className="cmd-grid"><Card title="Customer wallet / loyalty"><form className="cmd-form" onSubmit={walletAdjust}><select required value={walletForm.customer_id} onChange={e => setWalletForm({ ...walletForm, customer_id: e.target.value })}><option value="">Select customer</option>{(data.customers || []).map(c => <option key={c.id} value={c.id}>{c.name || c.phone || String(c.id).slice(0,8)}</option>)}</select><input type="number" placeholder="Points (+/-)" value={walletForm.points} onChange={e => setWalletForm({ ...walletForm, points: e.target.value })}/><input type="number" step="0.01" placeholder="Wallet amount (+/-)" value={walletForm.amount} onChange={e => setWalletForm({ ...walletForm, amount: e.target.value })}/><select value={walletForm.transaction_type} onChange={e => setWalletForm({ ...walletForm, transaction_type: e.target.value })}><option>earn</option><option>redeem</option><option>cashback</option><option>adjustment</option><option>expiry</option></select><input placeholder="Reason" value={walletForm.note} onChange={e => setWalletForm({ ...walletForm, note: e.target.value })}/><button>Update wallet</button></form></Card><Card title="Wallet balances"><div className="cmd-list">{(data.wallets || []).map(w => <div className="cmd-row" key={w.id}><b>{String(w.customer_id).slice(0,8)}</b><span>{money(w.balance)} • {Number(w.points || 0)} pts</span></div>)}</div></Card></div>}

    {tab === "display" && <div className="cmd-grid"><Card title="Call customer token"><form className="cmd-form" onSubmit={e => { e.preventDefault(); api("display_call", displayForm); setDisplayForm({ token_no: "", display_name: "", message: "" }) }}><input required placeholder="Token" value={displayForm.token_no} onChange={e => setDisplayForm({ ...displayForm, token_no: e.target.value })}/><input placeholder="Customer name" value={displayForm.display_name} onChange={e => setDisplayForm({ ...displayForm, display_name: e.target.value })}/><input placeholder="Message" value={displayForm.message} onChange={e => setDisplayForm({ ...displayForm, message: e.target.value })}/><button>Call token</button></form></Card><Card title="Display queue"><div className="cmd-list">{(data.displays || []).map(x => <div className="cmd-row" key={x.id}><b>{x.token_no}</b><span>{x.display_name || "Customer"} • {x.status}</span></div>)}</div></Card></div>}

    {tab === "insights" && <div className="cmd-grid">{insights.map(([icon, title, text]) => <Card key={title} title={`${icon} ${title}`}><p className="cmd-insight">{text}</p></Card>)}</div>}

    {tab === "enterprise" && <div className="cmd-grid"><Card title="Branches"><div className="cmd-list">{(data.branches || []).map(b => <div className="cmd-row" key={b.id}><b>{b.name}</b><span>{b.code || "No code"} • {b.active === false ? "Inactive" : "Active"}</span></div>)}</div></Card><Card title="Terminals"><div className="cmd-list">{(data.terminals || []).map(t => <div className="cmd-row" key={t.id}><b>{t.terminal_name}</b><span>{t.device_type} • {t.active ? "Active" : "Off"}</span></div>)}</div></Card></div>}

    {message && <div className="cmd-toast">{message}</div>}

    <style jsx global>{`
      .cmd-page{min-height:100vh;padding:24px;max-width:1500px;margin:0 auto;color:var(--text,#f5f0e6);background:var(--background,#07120e)}
      .cmd-hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding:28px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:24px;background:var(--surface,#0c251b)}
      .cmd-hero small{color:var(--primary,#e7ae39);font-weight:800;letter-spacing:.18em}.cmd-hero h1{margin:8px 0;font:800 clamp(28px,4vw,48px)/1.05 Georgia,serif}.cmd-hero p,.cmd-note{color:var(--muted,#aeb8b2)}.cmd-hero button,.cmd-tabs button,.cmd-card button,.cmd-form button{border:1px solid var(--border,rgba(255,255,255,.12));border-radius:11px;padding:10px 14px;background:var(--surface-2,#102d22);color:var(--text,#f5f0e6);font-weight:700;cursor:pointer}.cmd-hero button:hover,.cmd-tabs button.active,.cmd-card button:hover,.cmd-form button:hover{background:var(--primary,#e7ae39);color:#111}.cmd-tabs{display:flex;gap:8px;overflow:auto;padding:16px 0}.cmd-tabs button{white-space:nowrap}.cmd-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}.cmd-stat,.cmd-card{border:1px solid var(--border,rgba(255,255,255,.12));border-radius:20px;background:var(--surface,#0c251b)}.cmd-stat{padding:18px}.cmd-icon{font-size:22px;margin-bottom:10px}.cmd-stat span,.cmd-stat small{display:block;color:var(--muted,#aeb8b2)}.cmd-stat strong{display:block;font-size:28px;margin:3px 0}.cmd-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.cmd-card{padding:20px}.cmd-card header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.cmd-card h2{margin:0;font-size:21px}.cmd-list{display:flex;flex-direction:column}.cmd-row{display:flex;justify-content:space-between;gap:15px;padding:12px 0;border-top:1px solid rgba(255,255,255,.07)}.cmd-row span{color:var(--muted,#aeb8b2)}.cmd-links{display:flex;gap:10px;flex-wrap:wrap}.cmd-links a{color:var(--primary,#e7ae39);text-decoration:none;padding:10px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:10px}.floor-map{position:relative;min-height:520px;overflow:auto;border:1px dashed var(--border,rgba(255,255,255,.15));border-radius:18px;background:repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0,rgba(255,255,255,.025) 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,rgba(255,255,255,.025) 0,rgba(255,255,255,.025) 1px,transparent 1px,transparent 40px)}.floor-table{position:absolute;width:120px;min-height:92px;padding:10px;border:1px solid var(--primary,#e7ae39);border-radius:14px;background:#112c21;box-shadow:0 8px 20px rgba(0,0,0,.2)}.floor-table.occupied{border-color:#e15b52}.floor-table.reserved{border-color:#e7ae39}.floor-table small{display:block;color:var(--muted,#aeb8b2);margin:4px 0}.floor-table button{padding:4px 7px!important;margin-right:3px;font-size:11px}.cmd-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.cmd-form input,.cmd-form select{width:100%;padding:11px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.12));background:rgba(0,0,0,.14);color:var(--text,#f5f0e6)}.cmd-form button{grid-column:1/-1}.cmd-table{display:grid}.cmd-head{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:10px;padding:12px;border-bottom:1px solid rgba(255,255,255,.08)}.cmd-head:not(:first-child){color:var(--muted,#aeb8b2)}.cmd-insight{color:var(--muted,#aeb8b2);line-height:1.7;margin:0}.cmd-loading{min-height:70vh;display:grid;place-items:center;color:var(--muted,#aeb8b2)}.cmd-toast{position:fixed;right:20px;bottom:20px;padding:14px 18px;border-radius:13px;border:1px solid rgba(231,174,57,.4);background:#0d241a;z-index:100}@media(max-width:900px){.cmd-stats,.cmd-grid{grid-template-columns:repeat(2,1fr)}.cmd-hero{flex-direction:column}}@media(max-width:620px){.cmd-page{padding:14px}.cmd-stats,.cmd-grid,.cmd-form{grid-template-columns:1fr}.cmd-head{grid-template-columns:1.5fr .7fr 1fr 1fr}.floor-map{min-height:430px}}
    `}</style>
  </main>
}
