"use client"

import { useEffect, useMemo, useState } from "react"
import { supabasePublic as supabase } from "@/lib/supabasePublic"

const tabs = [
  ["pos", "🧾 POS Control"],
  ["floor", "🪑 Tables"],
  ["billing", "🧾 Billing"],
  ["kitchen", "👨‍🍳 KDS"],
  ["delivery", "🛵 Delivery"],
  ["digital", "📲 QR / Kiosk"],
  ["reservations", "📅 Reservations"],
  ["captain", "📱 Captain"],
  ["online", "🔗 Aggregators"],
  ["crm", "👥 CRM"],
  ["cash", "💵 Cash"],
  ["reports", "📊 Reports"],
  ["hardware", "🖨️ Hardware"],
  ["marketing", "📣 Marketing"],
  ["enterprise", "🏢 Enterprise"],
]

const pluginFor = {
  pos: "pos-core",
  floor: "table-management",
  billing: "pos-core",
  kitchen: "kds-runtime",
  delivery: "delivery",
  digital: "scan-order-runtime",
  reservations: "reservations-pro",
  captain: "captain-runtime",
  online: "aggregator-runtime",
  crm: "customer-segments",
  cash: "cash-shift",
  reports: "scheduled-reports",
  hardware: "hardware-print-queue",
  marketing: "campaigns",
  enterprise: "multi-branch",
}

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

function Card({ title, children, action }) {
  return <section className="pp-card"><div className="pp-card-head"><h2>{title}</h2>{action}</div>{children}</section>
}

function Field({ label, children }) {
  return <label className="pp-field"><span>{label}</span>{children}</label>
}

function Empty({ children }) { return <div className="pp-empty">{children}</div> }

export default function AnairaOperationsHub() {
  const [rid, setRid] = useState("")
  const [role, setRole] = useState("")
  const [tab, setTab] = useState("floor")
  const [plugins, setPlugins] = useState({})
  const [data, setData] = useState({})
  const [orders, setOrders] = useState([])
  const [menu, setMenu] = useState([])
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  const [area, setArea] = useState({ name: "" })
  const [table, setTable] = useState({ table_no: "", capacity: 2, area_id: "", shape: "square" })
  const [discount, setDiscount] = useState({ name: "", code: "", discount_type: "percent", value: "", min_order: "", max_discount: "" })
  const [payment, setPayment] = useState({ order_id: "", amount: "", payment_method: "cash", reference: "" })
  const [kds, setKds] = useState({ order_id: "", status: "new", priority: "normal" })
  const [rider, setRider] = useState({ order_id: "", rider_id: "", address: "", delivery_charge: "" })
  const [token, setToken] = useState({ order_id: "", token_type: "pickup", display_name: "" })
  const [waitlist, setWaitlist] = useState({ customer_name: "", phone: "", guests: 2, preferred_date: "", preferred_time: "", notes: "" })
  const [segment, setSegment] = useState({ name: "", code: "", rules: '{"min_orders":2}' })
  const [messageForm, setMessageForm] = useState({ channel: "whatsapp", recipient: "", purpose: "invoice", template: "", payload: "{}" })
  const [cash, setCash] = useState({ opening_cash: "", notes: "" })
  const [print, setPrint] = useState({ job_type: "bill", reference_id: "", payload: "{}" })
  const [aggregator, setAggregator] = useState({ provider: "zomato", outlet_code: "", active: false })
  const [posControl, setPosControl] = useState({ order_id: "", to_table_id: "", reason: "", hold_note: "" })
  const [deposit, setDeposit] = useState({ reservation_id: "", amount: "", payment_method: "upi", reference: "" })
  const [feedbackRequest, setFeedbackRequest] = useState({ order_id: "", customer_id: "", channel: "qr" })
  const [cashMovement, setCashMovement] = useState({ shift_id: "", movement_type: "cash_in", amount: "", reference: "", note: "" })

  const selectedPlugin = plugins[pluginFor[tab]] !== false
  const tableStats = useMemo(() => ({
    available: (data.tables || []).filter(x => x.status === "available").length,
    occupied: (data.tables || []).filter(x => x.status === "occupied").length,
    reserved: (data.tables || []).filter(x => x.status === "reserved").length,
  }), [data.tables])

  useEffect(() => { init() }, [])

  async function init() {
    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user
    if (!user) return
    const { data: profile } = await supabase.from("profiles").select("restaurant_id,role").eq("id", user.id).maybeSingle()
    if (!profile?.restaurant_id) return
    setRid(profile.restaurant_id)
    setRole(profile.role || "")
    await load(profile.restaurant_id)
  }

  async function load(id = rid) {
    if (!id) return
    const q = {
      areas: supabase.from("restaurant_areas").select("*").eq("restaurant_id", id).order("sort_order").order("name"),
      tables: supabase.from("dining_tables").select("*").eq("restaurant_id", id).order("table_no"),
      orders: supabase.from("orders").select("id,source_label,order_mode,status,total_amount,payment_status,table_id,created_at").eq("restaurant_id", id).order("created_at", { ascending: false }).limit(40),
      discounts: supabase.from("discount_rules").select("*").eq("restaurant_id", id).order("created_at", { ascending: false }),
      variants: supabase.from("menu_variants").select("*,menu_items(name)").eq("restaurant_id", id).order("name"),
      stations: supabase.from("kitchen_stations").select("*").eq("restaurant_id", id).order("sort_order").order("name"),
      kot: supabase.from("kds_events").select("*").eq("restaurant_id", id).order("created_at", { ascending: false }).limit(30),
      riders: supabase.from("delivery_riders").select("*").eq("restaurant_id", id).order("name"),
      assignments: supabase.from("delivery_assignments").select("*").eq("restaurant_id", id).order("assigned_at", { ascending: false }).limit(30),
      tokens: supabase.from("order_tokens").select("*").eq("restaurant_id", id).order("created_at", { ascending: false }).limit(30),
      waitlist: supabase.from("reservation_waitlist").select("*").eq("restaurant_id", id).order("created_at", { ascending: false }).limit(30),
      reservations: supabase.from("reservations").select("id,name,phone,date,time,guests,status,table_id").eq("restaurant_id", id).order("date", { ascending: true }).limit(30),
      aggregators: supabase.from("aggregator_integrations").select("id,provider,outlet_code,active,last_sync_at").eq("restaurant_id", id),
      aggregatorOrders: supabase.from("aggregator_orders").select("*").eq("restaurant_id", id).order("received_at", { ascending: false }).limit(30),
      segments: supabase.from("customer_segments").select("*").eq("restaurant_id", id).order("name"),
      messages: supabase.from("message_queue").select("*").eq("restaurant_id", id).order("created_at", { ascending: false }).limit(30),
      shifts: supabase.from("cash_shifts").select("*").eq("restaurant_id", id).order("opened_at", { ascending: false }).limit(10),
      reports: supabase.from("report_schedules").select("*").eq("restaurant_id", id).order("created_at", { ascending: false }),
      prints: supabase.from("print_jobs").select("*").eq("restaurant_id", id).order("created_at", { ascending: false }).limit(30),
      menu: supabase.from("menu_items").select("id,name,price").eq("restaurant_id", id).order("name").limit(200),
      plugins: supabase.from("restaurant_plugins").select("plugin_code,enabled").eq("restaurant_id", id),
      feedback: supabase.from("customer_feedback").select("id,rating,feedback,created_at,customer_id,order_id").eq("restaurant_id", id).order("created_at", { ascending: false }).limit(20),
      feedbackRequests: supabase.from("feedback_requests").select("id,order_id,customer_id,channel,status,created_at").eq("restaurant_id", id).order("created_at", { ascending: false }).limit(20),
      deposits: supabase.from("reservation_deposits").select("id,reservation_id,amount,payment_method,status,paid_at").eq("restaurant_id", id).order("created_at", { ascending: false }).limit(20),
      branches: supabase.from("restaurant_branches").select("id,name,code,active,phone,address").eq("parent_restaurant_id", id).order("name"),
      cashMovements: supabase.from("cash_movements").select("id,session_id,movement_type,amount,reference,note,created_at").eq("restaurant_id", id).order("created_at", { ascending: false }).limit(20),
      holds: supabase.from("order_holds").select("id,order_id,hold_type,note,released_at,created_at").eq("restaurant_id", id).order("created_at", { ascending: false }).limit(20),
    }
    const entries = await Promise.all(Object.entries(q).map(async ([k, query]) => [k, (await query).data || []]))
    const result = Object.fromEntries(entries)
    setPlugins(Object.fromEntries((result.plugins || []).map(x => [x.plugin_code, x.enabled === true])))
    delete result.plugins
    setOrders(result.orders || [])
    setMenu(result.menu || [])
    setData(result)
  }

  async function insert(tableName, payload, reset) {
    if (!rid) return
    setBusy(true)
    const { error } = await supabase.from(tableName).insert({ ...payload, restaurant_id: rid })
    setBusy(false)
    setMessage(error?.message || "Saved successfully")
    if (!error) { reset?.(); await load() }
  }

  async function api(action, payload = {}) {
    setBusy(true)
    const { data: session } = await supabase.auth.getSession()
    const response = await fetch("/api/restaurant-operations", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.session?.access_token || ""}` }, body: JSON.stringify({ action, ...payload }) })
    const json = await response.json().catch(() => ({}))
    setBusy(false)
    setMessage(json.error || (response.ok ? "Completed successfully" : "Operation failed"))
    if (response.ok) await load()
    return json
  }

  function orderSelect(value, setter) { setter(v => ({ ...v, order_id: value })) }

  if (!rid) return <main className="pp-wrap"><div className="pp-empty">Loading restaurant workspace…</div></main>

  return <main className="pp-wrap">
    <header className="pp-hero">
      <div><small>RESTAURANT OPERATIONS</small><h1>Anaira Operations Hub</h1><p>Tables → Order → KOT → KDS → Token → Delivery → Payment → CRM → Reports</p><div className="pp-actions"><a className="pp-button" href="/dashboard/restaurant-suite/command">Open Command Center →</a></div></div>
      <div className="pp-badge">{role || "staff"} • {busy ? "Working…" : "Live"}</div>
    </header>

    <nav className="pp-tabs">{tabs.map(([key,label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}</nav>

    {!selectedPlugin && <div className="pp-lock">🔒 This module is plugin-controlled. Enable <b>{pluginFor[tab]}</b> from Super Admin → Plugins.</div>}

    {tab === "pos" && <section className="pp-grid">
      <Card title="Hold / Park / Reopen" subtitle="POS control without deleting the order">
        <div className="pp-form-grid">
          <Field label="Order"><select value={posControl.order_id} onChange={e=>setPosControl({...posControl,order_id:e.target.value})}><option value="">Select order</option>{orders.map(o=><option key={o.id} value={o.id}>#{o.id.slice(0,6)} • {money(o.total_amount)} • {o.status}</option>)}</select></Field>
          <Field label="Reason / note"><input value={posControl.reason} onChange={e=>setPosControl({...posControl,reason:e.target.value})} placeholder="Customer requested hold"/></Field>
        </div>
        <div className="pp-actions">
          <button onClick={()=>api("hold_order",{order_id:posControl.order_id,note:posControl.reason})}>Hold / Park</button>
          <button onClick={()=>api("resume_order",{order_id:posControl.order_id})}>Resume</button>
          <button onClick={()=>api("reopen_order",{order_id:posControl.order_id,reason:posControl.reason})}>Reopen</button>
        </div>
        <div className="pp-list">{(data.holds||[]).map(h=><div className="pp-row" key={h.id}><b>#{String(h.order_id).slice(0,6)}</b><span>{h.hold_type} • {h.released_at ? "resumed" : "on hold"}</span></div>)}</div>
      </Card>
      <Card title="Table Transfer">
        <div className="pp-form-grid">
          <Field label="Order"><select value={posControl.order_id} onChange={e=>setPosControl({...posControl,order_id:e.target.value})}><option value="">Select order</option>{orders.map(o=><option key={o.id} value={o.id}>#{o.id.slice(0,6)} • {o.status}</option>)}</select></Field>
          <Field label="Destination table"><select value={posControl.to_table_id} onChange={e=>setPosControl({...posControl,to_table_id:e.target.value})}><option value="">Select table</option>{(data.tables||[]).map(t=><option key={t.id} value={t.id}>{t.table_no} • {t.capacity} seats</option>)}</select></Field>
          <button onClick={()=>api("table_transfer",{order_id:posControl.order_id,to_table_id:posControl.to_table_id})}>Transfer Table</button>
        </div>
        <p className="pp-muted">The original table is preserved in the transfer audit record.</p>
      </Card>
    </section>}

    {tab === "floor" && <section className="pp-grid">
      <Card title="Floor / Area"><form onSubmit={e => {e.preventDefault(); insert("restaurant_areas", { name: area.name }, () => setArea({name:""}))}}><Field label="Area name"><input required value={area.name} onChange={e=>setArea({name:e.target.value})} placeholder="Main Hall"/></Field><button>Save area</button></form><div className="pp-list">{(data.areas||[]).map(x=><div className="pp-row" key={x.id}><b>{x.name}</b><span>{x.active ? "Active" : "Off"}</span></div>)}</div></Card>
      <Card title="Tables" action={<span className="pp-stats">{tableStats.available} free • {tableStats.occupied} occupied • {tableStats.reserved} reserved</span>}><form onSubmit={e=>{e.preventDefault();insert("dining_tables",{...table,capacity:Number(table.capacity),area_id:table.area_id||null},()=>setTable({table_no:"",capacity:2,area_id:"",shape:"square"}))}} className="pp-form-grid"><Field label="Table"><input required value={table.table_no} onChange={e=>setTable({...table,table_no:e.target.value})} placeholder="T-01"/></Field><Field label="Capacity"><input type="number" min="1" value={table.capacity} onChange={e=>setTable({...table,capacity:e.target.value})}/></Field><Field label="Area"><select value={table.area_id} onChange={e=>setTable({...table,area_id:e.target.value})}><option value="">No area</option>{(data.areas||[]).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field><button>Add table</button></form><div className="pp-table-grid">{(data.tables||[]).map(t=><button key={t.id} className={`pp-table ${t.status}`} onClick={()=>api("table_status",{table_id:t.id,status:t.status==="available"?"occupied":"available"})}><b>{t.table_no}</b><small>{t.capacity} seats</small><em>{t.status}</em></button>)}</div></Card>
    </section>}

    {tab === "billing" && <section className="pp-grid"><Card title="Payments / Split / Merge"><Field label="Order"><select value={payment.order_id} onChange={e=>setPayment({...payment,order_id:e.target.value})}><option value="">Select order</option>{orders.map(o=><option key={o.id} value={o.id}>#{o.id.slice(0,6)} • {money(o.total_amount)} • {o.status}</option>)}</select></Field><div className="pp-form-grid"><Field label="Amount"><input type="number" value={payment.amount} onChange={e=>setPayment({...payment,amount:e.target.value})}/></Field><Field label="Method"><select value={payment.payment_method} onChange={e=>setPayment({...payment,payment_method:e.target.value})}><option>cash</option><option>upi</option><option>card</option><option>online</option><option>credit</option></select></Field><Field label="Reference"><input value={payment.reference} onChange={e=>setPayment({...payment,reference:e.target.value})}/></Field><button onClick={()=>api("payment",payment)}>Record payment</button></div><div className="pp-actions"><button onClick={()=>api("split",{order_id:payment.order_id,parts:2})}>Split 2</button><button onClick={()=>api("split",{order_id:payment.order_id,parts:3})}>Split 3</button><button onClick={()=>api("refund",{order_id:payment.order_id,amount:payment.amount,reason:"POS refund"})}>Refund</button><button onClick={()=>api("void",{order_id:payment.order_id,reason:"POS void"})}>Void</button></div></Card>
      <Card title="Discount / Coupon"><form onSubmit={e=>{e.preventDefault();insert("discount_rules",{...discount,value:Number(discount.value||0),min_order:Number(discount.min_order||0),max_discount:discount.max_discount?Number(discount.max_discount):null},()=>setDiscount({name:"",code:"",discount_type:"percent",value:"",min_order:"",max_discount:""}))}} className="pp-form-grid"><Field label="Name"><input required value={discount.name} onChange={e=>setDiscount({...discount,name:e.target.value})}/></Field><Field label="Code"><input value={discount.code} onChange={e=>setDiscount({...discount,code:e.target.value.toUpperCase()})}/></Field><Field label="Type"><select value={discount.discount_type} onChange={e=>setDiscount({...discount,discount_type:e.target.value})}><option value="percent">Percent</option><option value="flat">Flat</option></select></Field><Field label="Value"><input type="number" value={discount.value} onChange={e=>setDiscount({...discount,value:e.target.value})}/></Field><Field label="Min order"><input type="number" value={discount.min_order} onChange={e=>setDiscount({...discount,min_order:e.target.value})}/></Field><Field label="Max discount"><input type="number" value={discount.max_discount} onChange={e=>setDiscount({...discount,max_discount:e.target.value})}/></Field><button>Save rule</button></form><div className="pp-list">{(data.discounts||[]).map(d=><div className="pp-row" key={d.id}><b>{d.name}</b><span>{d.code||"No code"} • {d.discount_type} {d.value}</span></div>)}</div></Card></section>}

    {tab === "kitchen" && <section className="pp-grid"><Card title="Live KDS"><div className="pp-form-grid"><Field label="Order"><select value={kds.order_id} onChange={e=>setKds({...kds,order_id:e.target.value})}><option value="">Select order</option>{orders.map(o=><option key={o.id} value={o.id}>#{o.id.slice(0,6)} • {o.status}</option>)}</select></Field><Field label="Status"><select value={kds.status} onChange={e=>setKds({...kds,status:e.target.value})}><option>new</option><option>accepted</option><option>preparing</option><option>ready</option><option>served</option></select></Field><Field label="Priority"><select value={kds.priority} onChange={e=>setKds({...kds,priority:e.target.value})}><option>normal</option><option>high</option><option>rush</option></select></Field><button onClick={()=>api("kds",kds)}>Update KDS</button></div><div className="pp-list">{(data.kot||[]).map(x=><div className="pp-row" key={x.id}><b>#{String(x.order_id).slice(0,6)}</b><span>{x.status} • {x.priority}</span></div>)}</div></Card><Card title="Kitchen stations"><div className="pp-table-grid">{(data.stations||[]).map(s=><div className="pp-table available" key={s.id}><b>{s.name}</b><small>{s.code||"station"}</small><em>{s.active===false?"Off":"Live"}</em></div>)}</div><a className="pp-link" href="/kitchen">Open full Kitchen Display →</a></Card></section>}

    {tab === "delivery" && <section className="pp-grid"><Card title="Assign rider"><div className="pp-form-grid"><Field label="Order"><select value={rider.order_id} onChange={e=>setRider({...rider,order_id:e.target.value})}><option value="">Select delivery order</option>{orders.filter(o=>o.order_mode==="delivery").map(o=><option key={o.id} value={o.id}>#{o.id.slice(0,6)} • {money(o.total_amount)}</option>)}</select></Field><Field label="Rider"><select value={rider.rider_id} onChange={e=>setRider({...rider,rider_id:e.target.value})}><option value="">Select rider</option>{(data.riders||[]).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></Field><Field label="Address"><input value={rider.address} onChange={e=>setRider({...rider,address:e.target.value})}/></Field><Field label="Delivery charge"><input type="number" value={rider.delivery_charge} onChange={e=>setRider({...rider,delivery_charge:e.target.value})}/></Field><button onClick={()=>api("delivery_assign",rider)}>Assign</button></div></Card><Card title="Delivery board"><div className="pp-list">{(data.assignments||[]).map(a=><div className="pp-row" key={a.id}><b>#{String(a.order_id).slice(0,6)}</b><span>{a.status} • {money(a.delivery_charge)}</span><div className="pp-actions"><button onClick={()=>api("delivery_status",{assignment_id:a.id,status:"out_for_delivery"})}>Out</button><button onClick={()=>api("delivery_status",{assignment_id:a.id,status:"delivered"})}>Delivered</button><button onClick={()=>api("delivery_status",{assignment_id:a.id,status:"failed",failure_reason:"Customer unavailable"})}>Failed</button></div></div>)}</div></Card></section>}

    {tab === "digital" && <section className="pp-grid"><Card title="Pickup / Delivery Tokens"><div className="pp-form-grid"><Field label="Order"><select value={token.order_id} onChange={e=>setToken({...token,order_id:e.target.value})}><option value="">Select order</option>{orders.map(o=><option key={o.id} value={o.id}>#{o.id.slice(0,6)}</option>)}</select></Field><Field label="Type"><select value={token.token_type} onChange={e=>setToken({...token,token_type:e.target.value})}><option>pickup</option><option>delivery</option><option>dinein</option></select></Field><Field label="Display name"><input value={token.display_name} onChange={e=>setToken({...token,display_name:e.target.value})}/></Field><button onClick={()=>api("issue_token",token)}>Issue token</button></div><div className="pp-list">{(data.tokens||[]).map(t=><div className="pp-row" key={t.id}><b>{t.token_no}</b><span>{t.display_name||"Customer"} • {t.status}</span><div className="pp-actions"><button onClick={()=>api("token_status",{id:t.id,status:"called"})}>Call</button><button onClick={()=>api("token_status",{id:t.id,status:"ready"})}>Ready</button><button onClick={()=>api("token_status",{id:t.id,status:"completed"})}>Complete</button></div></div>)}</div></Card><Card title="QR / Kiosk / Display"><div className="pp-actions"><a href="/dashboard/qr" className="pp-button">QR Menu</a><a href="/dashboard/restaurant-suite?tab=devices" className="pp-button">Kiosk / Display</a><a href="/dashboard/notifications" className="pp-button">Customer alerts</a></div><p className="pp-muted">QR ordering, kiosk and digital display settings remain plugin-gated and use the same restaurant scope/theme.</p></Card></section>}

    {tab === "reservations" && <section className="pp-grid"><Card title="Reservation waitlist"><form onSubmit={e=>{e.preventDefault();insert("reservation_waitlist",{...waitlist,guests:Number(waitlist.guests)},()=>setWaitlist({customer_name:"",phone:"",guests:2,preferred_date:"",preferred_time:"",notes:""}))}} className="pp-form-grid"><Field label="Customer"><input required value={waitlist.customer_name} onChange={e=>setWaitlist({...waitlist,customer_name:e.target.value})}/></Field><Field label="Phone"><input value={waitlist.phone} onChange={e=>setWaitlist({...waitlist,phone:e.target.value})}/></Field><Field label="Guests"><input type="number" value={waitlist.guests} onChange={e=>setWaitlist({...waitlist,guests:e.target.value})}/></Field><Field label="Date"><input type="date" value={waitlist.preferred_date} onChange={e=>setWaitlist({...waitlist,preferred_date:e.target.value})}/></Field><Field label="Time"><input type="time" value={waitlist.preferred_time} onChange={e=>setWaitlist({...waitlist,preferred_time:e.target.value})}/></Field><Field label="Notes"><input value={waitlist.notes} onChange={e=>setWaitlist({...waitlist,notes:e.target.value})}/></Field><button>Add to waitlist</button></form><div className="pp-list">{(data.waitlist||[]).map(w=><div className="pp-row" key={w.id}><b>{w.customer_name}</b><span>{w.guests} guests • {w.status}</span><button onClick={()=>api("waitlist_status",{id:w.id,status:"called"})}>Call</button></div>)}</div></Card><Card title="Reservation manager"><a className="pp-button" href="/dashboard/reservations">Open full reservation calendar →</a><div className="pp-form-grid" style={{marginTop:14}}><Field label="Reservation"><select value={deposit.reservation_id} onChange={e=>setDeposit({...deposit,reservation_id:e.target.value})}><option value="">Select reservation</option>{(data.reservations||[]).map(r=><option key={r.id} value={r.id}>{r.name} • {r.date} {r.time}</option>)}</select></Field><Field label="Deposit"><input type="number" value={deposit.amount} onChange={e=>setDeposit({...deposit,amount:e.target.value})}/></Field><Field label="Method"><select value={deposit.payment_method} onChange={e=>setDeposit({...deposit,payment_method:e.target.value})}><option>upi</option><option>cash</option><option>card</option><option>online</option></select></Field><Field label="Reference"><input value={deposit.reference} onChange={e=>setDeposit({...deposit,reference:e.target.value})}/></Field><button onClick={()=>api("reservation_deposit",deposit)}>Record Deposit</button></div><div className="pp-list">{(data.reservations||[]).map(r=><div className="pp-row" key={r.id}><b>{r.name}</b><span>{r.date} {r.time} • {r.guests} guests • {r.status}</span></div>)}</div></Card></section>}

    {tab === "captain" && <section className="pp-grid"><Card title="Captain / Waiter workflow"><p className="pp-muted">Use the same restaurant-scoped POS/KOT session for table service. Captain devices can open a table, add items, send KOT and request payment without changing inventory.</p><div className="pp-actions"><a className="pp-button" href="/order">Open POS / Captain Order</a><a className="pp-button" href="/dashboard/tables">Open Tables</a><a className="pp-button" href="/kitchen">Open KDS</a></div></Card><Card title="Active captain sessions"><Empty>Captain sessions are shown from the existing Operations Center. Connect the device session to the POS route for live order entry.</Empty><a className="pp-link" href="/dashboard/restaurant-suite?tab=captain">Open Captain / Staff →</a></Card></section>}

    {tab === "online" && <section className="pp-grid"><Card title="Aggregator integration"><form onSubmit={e=>{e.preventDefault();insert("aggregator_integrations",{...aggregator},()=>setAggregator({provider:"zomato",outlet_code:"",active:false}))}} className="pp-form-grid"><Field label="Provider"><select value={aggregator.provider} onChange={e=>setAggregator({...aggregator,provider:e.target.value})}><option>zomato</option><option>swiggy</option><option>dineout</option><option>website</option></select></Field><Field label="Outlet code"><input value={aggregator.outlet_code} onChange={e=>setAggregator({...aggregator,outlet_code:e.target.value})}/></Field><label className="pp-check"><input type="checkbox" checked={aggregator.active} onChange={e=>setAggregator({...aggregator,active:e.target.checked})}/> Active</label><button>Save integration</button></form><p className="pp-muted">Provider credentials are stored only when supplied. The runtime queues sync jobs and webhook payloads; live provider calls require the provider's API credentials.</p></Card><Card title="Orders / reconciliation"><div className="pp-actions"><button onClick={()=>api("aggregator_sync",{provider:"zomato",job_type:"menu"})}>Queue menu sync</button><button onClick={()=>api("aggregator_sync",{provider:"zomato",job_type:"orders"})}>Queue order sync</button><button onClick={()=>api("aggregator_sync",{provider:"zomato",job_type:"settlement"})}>Queue settlement sync</button></div><div className="pp-list">{(data.aggregatorOrders||[]).map(o=><div className="pp-row" key={o.id}><b>{o.provider} • {o.external_order_id}</b><span>{o.status} • {money(o.net_payout)}</span></div>)}</div></Card></section>}

    {tab === "crm" && <section className="pp-grid"><Card title="Customer segments"><form onSubmit={e=>{e.preventDefault();let rules={};try{rules=JSON.parse(segment.rules)}catch{setMessage("Rules must be valid JSON");return}insert("customer_segments",{name:segment.name,code:segment.code.toLowerCase().replace(/\s+/g,"-"),rules},()=>setSegment({name:"",code:"",rules:'{"min_orders":2}'}))}} className="pp-form-grid"><Field label="Name"><input required value={segment.name} onChange={e=>setSegment({...segment,name:e.target.value})}/></Field><Field label="Code"><input required value={segment.code} onChange={e=>setSegment({...segment,code:e.target.value})}/></Field><Field label="Rules JSON"><textarea rows="3" value={segment.rules} onChange={e=>setSegment({...segment,rules:e.target.value})}/></Field><button>Save segment</button></form><div className="pp-list">{(data.segments||[]).map(s=><div className="pp-row" key={s.id}><b>{s.name}</b><span>{s.code} • {s.active?"Active":"Off"}</span></div>)}</div></Card><Card title="SMS / WhatsApp / Feedback"><div className="pp-form-grid"><Field label="Order for feedback"><select value={feedbackRequest.order_id} onChange={e=>setFeedbackRequest({...feedbackRequest,order_id:e.target.value})}><option value="">Select order</option>{orders.map(o=><option key={o.id} value={o.id}>#{o.id.slice(0,6)}</option>)}</select></Field><Field label="Channel"><select value={feedbackRequest.channel} onChange={e=>setFeedbackRequest({...feedbackRequest,channel:e.target.value})}><option>qr</option><option>whatsapp</option><option>sms</option></select></Field><button onClick={()=>api("feedback_request",feedbackRequest)}>Create Feedback Request</button></div><form onSubmit={e=>{e.preventDefault();insert("message_queue",{...messageForm,payload:{}})}}><div className="pp-form-grid"><Field label="Channel"><select value={messageForm.channel} onChange={e=>setMessageForm({...messageForm,channel:e.target.value})}><option>whatsapp</option><option>sms</option><option>email</option></select></Field><Field label="Recipient"><input value={messageForm.recipient} onChange={e=>setMessageForm({...messageForm,recipient:e.target.value})}/></Field><Field label="Purpose"><input value={messageForm.purpose} onChange={e=>setMessageForm({...messageForm,purpose:e.target.value})}/></Field><Field label="Template"><input value={messageForm.template} onChange={e=>setMessageForm({...messageForm,template:e.target.value})}/></Field><button type="button" onClick={()=>api("queue_message",messageForm)}>Queue message</button></div></form><div className="pp-list">{(data.messages||[]).map(m=><div className="pp-row" key={m.id}><b>{m.channel}</b><span>{m.recipient||"No recipient"} • {m.status}</span></div>)}</div></Card></section>}

    {tab === "cash" && <section className="pp-grid"><Card title="Cash drawer"><form onSubmit={e=>{e.preventDefault();insert("cash_shifts",{opening_cash:Number(cash.opening_cash||0),notes:cash.notes,status:"open"},()=>setCash({opening_cash:"",notes:""}))}} className="pp-form-grid"><Field label="Opening cash"><input type="number" value={cash.opening_cash} onChange={e=>setCash({...cash,opening_cash:e.target.value})}/></Field><Field label="Notes"><input value={cash.notes} onChange={e=>setCash({...cash,notes:e.target.value})}/></Field><button>Open shift</button></form><div className="pp-list">{(data.shifts||[]).map(s=><div className="pp-row" key={s.id}><b>{money(s.opening_cash)}</b><span>{s.status} • {s.opened_at && new Date(s.opened_at).toLocaleString("en-IN")}</span>{s.status==="open"&&<button onClick={()=>api("close_shift",{shift_id:s.id,actual_cash:s.expected_cash})}>Close</button>}</div>)}</div></Card><Card title="Cash movement"><div className="pp-form-grid"><Field label="Open shift"><select value={cashMovement.shift_id} onChange={e=>setCashMovement({...cashMovement,shift_id:e.target.value})}><option value="">Select shift</option>{(data.shifts||[]).filter(s=>s.status==="open").map(s=><option key={s.id} value={s.id}>{String(s.id).slice(0,6)} • {money(s.opening_cash)}</option>)}</select></Field><Field label="Type"><select value={cashMovement.movement_type} onChange={e=>setCashMovement({...cashMovement,movement_type:e.target.value})}><option>cash_in</option><option>cash_out</option><option>expense</option><option>petty_cash</option></select></Field><Field label="Amount"><input type="number" value={cashMovement.amount} onChange={e=>setCashMovement({...cashMovement,amount:e.target.value})}/></Field><Field label="Reason"><input value={cashMovement.note} onChange={e=>setCashMovement({...cashMovement,note:e.target.value})}/></Field><button onClick={()=>api("cash_movement",cashMovement)}>Record Movement</button></div><div className="pp-list">{(data.cashMovements||[]).map(m=><div className="pp-row" key={m.id}><b>{m.movement_type}</b><span>{money(m.amount)} • {m.note||"No note"}</span></div>)}</div></Card><Card title="Refund / void / audit"><p className="pp-muted">All operational actions are intended to be recorded in the POS audit trail. Use Billing for refund/void approvals and retain the reason.</p><a className="pp-button" href="/billing">Open Billing & Audit →</a></Card></section>}

    {tab === "reports" && <section className="pp-grid"><Card title="Scheduled reports"><div className="pp-form-grid"><Field label="Report"><select id="pp-report"><option value="sales">Sales</option><option value="orders">Orders</option><option value="payments">Payments</option><option value="discounts">Discounts</option><option value="staff">Staff</option><option value="delivery">Delivery</option></select></Field><Field label="Schedule"><select id="pp-schedule"><option>daily</option><option>weekly</option><option>monthly</option></select></Field><Field label="Channel"><select id="pp-channel"><option>email</option><option>whatsapp</option></select></Field><button onClick={()=>insert("report_schedules",{report_code:document.getElementById("pp-report")?.value||"sales",schedule:document.getElementById("pp-schedule")?.value||"daily",channel:document.getElementById("pp-channel")?.value||"email"})}>Schedule report</button></div><div className="pp-list">{(data.reports||[]).map(r=><div className="pp-row" key={r.id}><b>{r.report_code}</b><span>{r.schedule} • {r.channel} • {r.active?"Active":"Off"}</span></div>)}</div></Card><Card title="Reports"><a className="pp-button" href="/dashboard/reports">Open report center →</a><p className="pp-muted">The existing report center remains the source of truth for detailed report data and exports.</p></Card></section>}

    {tab === "hardware" && <section className="pp-grid"><Card title="Print queue"><div className="pp-form-grid"><Field label="Job type"><select value={print.job_type} onChange={e=>setPrint({...print,job_type:e.target.value})}><option>bill</option><option>kot</option><option>invoice</option><option>token</option><option>qr</option></select></Field><Field label="Reference ID"><input value={print.reference_id} onChange={e=>setPrint({...print,reference_id:e.target.value})}/></Field><button onClick={()=>api("print_job",print)}>Queue print</button></div><div className="pp-list">{(data.prints||[]).map(p=><div className="pp-row" key={p.id}><b>{p.job_type}</b><span>{p.status} • {p.attempts} attempts</span></div>)}</div></Card><Card title="Hardware / payment settings"><div className="pp-actions"><a className="pp-button" href="/dashboard/restaurant-suite/advanced">Open device configuration</a><a className="pp-button" href="/dashboard/cash-closing">Cash closing</a><a className="pp-button" href="/billing">A4 invoice / billing</a></div><p className="pp-muted">Browser-safe print jobs are queued here. Direct thermal printer/socket execution requires a local print agent or provider integration.</p></Card></section>}

    {tab === "marketing" && <section className="pp-grid"><Card title="Campaign automation"><div className="feature-grid"><div className="feature-card"><span>🎂</span><b>Birthday</b><p>Trigger a reward or message around the customer's birthday.</p></div><div className="feature-card"><span>🔁</span><b>Win-back</b><p>Target customers who have not ordered for 30/60/90 days.</p></div><div className="feature-card"><span>⭐</span><b>VIP</b><p>Send exclusive offers to high-value customers.</p></div><div className="feature-card"><span>🧾</span><b>Post-order feedback</b><p>Create QR, SMS or WhatsApp feedback requests after completion.</p></div></div><div className="pp-actions"><a className="pp-button" href="/dashboard/offers">Open Offers & Promotions →</a><a className="pp-button" href="/dashboard/crm">Open CRM →</a></div></Card><Card title="Message queue"><div className="pp-list">{(data.messages||[]).slice(0,12).map(m=><div className="pp-row" key={m.id}><b>{m.channel}</b><span>{m.purpose} • {m.status}</span></div>)}</div></Card></section>}

    {tab === "enterprise" && <section className="pp-grid"><Card title="Branches"><div className="pp-list">{(data.branches||[]).length ? (data.branches||[]).map(b=><div className="pp-row" key={b.id}><b>{b.name}</b><span>{b.code||"No code"} • {b.active===false?"Inactive":"Active"}</span></div>) : <Empty>No child branches configured.</Empty>}</div><div className="pp-actions"><a className="pp-button" href="/super-admin">Open Super Admin →</a><a className="pp-button" href="/super-admin/analytics">Head Office Analytics →</a></div></Card><Card title="Plugin-controlled modules"><div className="pp-list">{Object.entries(plugins).filter(([,enabled])=>enabled).slice(0,30).map(([code])=><div className="pp-row" key={code}><b>{code}</b><span>Enabled</span></div>)}</div><p className="pp-muted">Super Admin controls activation. Restaurant users only see enabled modules.</p></Card></section>}

    {message && <div className="pp-toast">{message}</div>}

    <style jsx global>{`
      .pp-wrap{min-height:100vh;padding:28px;max-width:1500px;margin:0 auto;color:var(--text,#f5f0e6);background:var(--background,#07120e)}
      .pp-hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding:28px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:24px;background:var(--surface,#0c251b);box-shadow:0 20px 70px rgba(0,0,0,.2)}
      .pp-hero small{color:var(--primary,#e7ae39);letter-spacing:.18em;font-weight:800}.pp-hero h1{margin:8px 0;font-size:clamp(28px,4vw,48px);font-family:Georgia,serif}.pp-hero p,.pp-muted{color:var(--muted,#aeb8b2)}.pp-badge{padding:10px 14px;border-radius:999px;background:rgba(231,174,57,.1);border:1px solid rgba(231,174,57,.35);color:var(--primary,#e7ae39);white-space:nowrap}
      .pp-tabs{display:flex;gap:8px;overflow:auto;padding:16px 0}.pp-tabs button,.pp-button,.pp-actions button,.pp-card button{border:1px solid var(--border,rgba(255,255,255,.12));background:var(--surface-2,#102d22);color:var(--text,#f5f0e6);border-radius:12px;padding:10px 14px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.pp-tabs button.active,.pp-card button:hover,.pp-actions button:hover,.pp-button:hover{background:var(--primary,#e7ae39);color:#111}.pp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.pp-card{border:1px solid var(--border,rgba(255,255,255,.12));background:var(--surface,#0c251b);border-radius:22px;padding:20px;min-width:0}.pp-card-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.pp-card h2{margin:0 0 16px;font-size:20px}.pp-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.pp-field{display:flex;flex-direction:column;gap:7px}.pp-field span{font-size:12px;color:var(--muted,#aeb8b2);font-weight:700}.pp-field input,.pp-field select,.pp-field textarea{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:11px;border:1px solid var(--border,rgba(255,255,255,.12));background:rgba(0,0,0,.15);color:var(--text,#f5f0e6);outline:none}.pp-form-grid button{align-self:end}.pp-list{margin-top:14px;display:flex;flex-direction:column}.pp-row{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--border,rgba(255,255,255,.08))}.pp-row span{color:var(--muted,#aeb8b2);font-size:13px}.pp-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.pp-table-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-top:16px}.pp-table{min-height:92px;display:flex!important;flex-direction:column;gap:5px;align-items:flex-start!important}.pp-table small,.pp-table em{font-size:12px;color:var(--muted,#aeb8b2);font-style:normal}.pp-table.occupied{border-color:#d45b4d}.pp-table.reserved{border-color:#e7ae39}.pp-empty,.pp-lock{padding:18px;border:1px dashed var(--border,rgba(255,255,255,.18));border-radius:16px;color:var(--muted,#aeb8b2)}.pp-lock{margin-bottom:16px;color:#e7ae39}.pp-stats{font-size:12px;color:var(--muted,#aeb8b2)}.pp-check{display:flex;align-items:center;gap:8px}.pp-link{display:inline-block;margin-top:16px;color:var(--primary,#e7ae39)}.pp-toast{position:fixed;right:20px;bottom:20px;max-width:420px;padding:14px 18px;border:1px solid rgba(231,174,57,.4);background:#0d241a;color:#fff;border-radius:14px;box-shadow:0 15px 40px rgba(0,0,0,.35);z-index:50}
      .feature-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}.feature-card{padding:16px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:16px;background:rgba(0,0,0,.12)}.feature-card span{font-size:24px;display:block;margin-bottom:8px}.feature-card b{display:block}.feature-card p{margin:6px 0 0;color:var(--muted,#aeb8b2);font-size:13px;line-height:1.45}
      @media(max-width:900px){.pp-grid{grid-template-columns:1fr}.feature-grid{grid-template-columns:1fr}.pp-hero{flex-direction:column}.pp-form-grid{grid-template-columns:1fr}.pp-wrap{padding:16px}.pp-row{grid-template-columns:1fr auto}.pp-row .pp-actions{grid-column:1/-1}}
    `}</style>
  </main>
}
