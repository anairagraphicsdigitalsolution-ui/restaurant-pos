"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useTheme } from "@/components/ThemeProvider"

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

export default function AdvancedRestaurantSuite() {
  const { refreshTheme } = useTheme()
  const [rid, setRid] = useState("")
  const [tab, setTab] = useState("modifiers")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [data, setData] = useState({})

  const [modifierGroup, setModifierGroup] = useState({ name: "", selection_type: "single", required: false, min_select: 0, max_select: "" })
  const [modifier, setModifier] = useState({ group_id: "", name: "", price: "" })
  const [rider, setRider] = useState({ name: "", phone: "", vehicle: "" })
  const [zone, setZone] = useState({ name: "", charge: "", min_order: "" })
  const [station, setStation] = useState({ name: "", station_type: "kitchen" })
  const [staffEvent, setStaffEvent] = useState({ staff_id: "", event_type: "check_in", notes: "" })
  const [permission, setPermission] = useState({ role: "cashier", permission: "billing.view", allowed: true })
  const [branch, setBranch] = useState({ name: "", code: "", address: "", phone: "" })
  const [kiosk, setKiosk] = useState({ name: "", kiosk_code: "" })
  const [display, setDisplay] = useState({ name: "", screen_type: "menu" })
  const [device, setDevice] = useState({ name: "", device_code: "", location: "" })
  const [printer, setPrinter] = useState({ name: "", printer_type: "thermal", ip_address: "", port: 9100 })
  const [gateway, setGateway] = useState({ provider: "razorpay", display_name: "Razorpay", active: false })
  const [website, setWebsite] = useState({ enabled: false, slug: "" })
  const [report, setReport] = useState({ name: "", report_type: "sales", filters: "{}" })
  const [forecast, setForecast] = useState({ forecast_date: "", metric: "sales", predicted_value: "", confidence: "" })

  useEffect(() => {
    refreshTheme().catch(() => {})
    init()
  }, [refreshTheme])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from("profiles").select("restaurant_id").eq("id", user.id).maybeSingle()
    if (!profile?.restaurant_id) { setLoading(false); return }
    setRid(profile.restaurant_id)
    await load(profile.restaurant_id)
  }

  async function load(r = rid) {
    if (!r) return
    setLoading(true)
    const queries = {
      modifierGroups: supabase.from("modifier_groups").select("*").eq("restaurant_id", r).order("name"),
      modifiers: supabase.from("modifiers").select("*").eq("restaurant_id", r).order("name"),
      riders: supabase.from("delivery_riders").select("*").eq("restaurant_id", r).order("name"),
      zones: supabase.from("delivery_zones").select("*").eq("restaurant_id", r).order("name"),
      stations: supabase.from("kitchen_stations").select("*").eq("restaurant_id", r).order("sort_order").order("name"),
      attendance: supabase.from("staff_attendance_events").select("*").eq("restaurant_id", r).order("at", { ascending: false }).limit(30),
      permissions: supabase.from("role_permissions").select("*").eq("restaurant_id", r).order("role").order("permission"),
      branches: supabase.from("restaurant_branches").select("*").eq("parent_restaurant_id", r).order("name"),
      kiosks: supabase.from("self_service_kiosks").select("*").eq("restaurant_id", r).order("name"),
      displays: supabase.from("digital_display_playlists").select("*").eq("restaurant_id", r).order("name"),
      devices: supabase.from("calling_devices").select("*").eq("restaurant_id", r).order("name"),
      printers: supabase.from("printer_devices").select("*").eq("restaurant_id", r).order("name"),
      gateways: supabase.from("payment_gateway_configs").select("*").eq("restaurant_id", r).order("provider"),
      website: supabase.from("website_order_settings").select("*").eq("restaurant_id", r).maybeSingle(),
      reports: supabase.from("dynamic_report_definitions").select("*").eq("restaurant_id", r).order("updated_at", { ascending: false }),
      forecasts: supabase.from("forecast_snapshots").select("*").eq("restaurant_id", r).order("forecast_date", { ascending: false }).limit(50),
    }
    const entries = Object.entries(queries)
    const results = await Promise.all(entries.map(([, q]) => q))
    const next = {}
    entries.forEach(([key], i) => { next[key] = results[i].data || [] })
    setData(next)
    if (results[13]?.data) setWebsite(results[13].data)
    setLoading(false)
  }

  async function insert(table, payload, success) {
    setSaving(true); setMessage("")
    const { error } = await supabase.from(table).insert({ ...payload, restaurant_id: rid })
    setMessage(error?.message || success)
    setSaving(false)
    if (!error) await load()
  }

  async function upsert(table, payload, conflict, success) {
    setSaving(true); setMessage("")
    const { error } = await supabase.from(table).upsert({ ...payload, restaurant_id: rid }, { onConflict: conflict })
    setMessage(error?.message || success)
    setSaving(false)
    if (!error) await load()
  }

  const tabs = [
    ["modifiers", "Variants & Add-ons"],
    ["delivery", "Delivery"],
    ["kitchen", "Kitchen Stations"],
    ["staff", "Staff & Permissions"],
    ["branches", "Multi Branch"],
    ["digital", "Kiosk & Display"],
    ["printing", "Printing & E-Bill"],
    ["payments", "Payment Gateways"],
    ["online", "Website & Scan Pay"],
    ["reports", "Dynamic Reports"],
    ["forecast", "Forecasting"],
  ]

  const groups = data.modifierGroups || []
  const selectedGroup = modifier.group_id || groups[0]?.id || ""
  const activeRiders = (data.riders || []).filter(x => x.active).length
  const activeStations = (data.stations || []).filter(x => x.active).length
  const activeBranches = (data.branches || []).filter(x => x.active).length

  return (
    <main className="suite">
      <style jsx global>{css}</style>
      <div className="shell">
        <header className="hero">
          <div>
            <div className="eyebrow">ANAIRA · NON-INVENTORY COMPLETION</div>
            <h1>Restaurant Operations Suite</h1>
            <p>Real operational controls for billing, modifiers, kitchen, delivery, staff, branches, digital devices, payments and reporting.</p>
          </div>
          <button className="btn ghost" onClick={() => load()}>↻ Refresh</button>
        </header>

        {message && <div className="toast">{message}</div>}

        <section className="stats">
          <Stat label="Modifier Groups" value={groups.length} />
          <Stat label="Active Riders" value={activeRiders} />
          <Stat label="Kitchen Stations" value={activeStations} />
          <Stat label="Branches" value={activeBranches} />
          <Stat label="Kiosks" value={(data.kiosks || []).length} />
          <Stat label="Reports" value={(data.reports || []).length} />
        </section>

        <nav className="tabs">
          {tabs.map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
        </nav>

        {tab === "modifiers" && <section className="grid">
          <Panel title="Modifier Groups">
            <form className="form" onSubmit={e => { e.preventDefault(); insert("modifier_groups", { ...modifierGroup, max_select: modifierGroup.max_select === "" ? null : Number(modifierGroup.max_select), min_select: Number(modifierGroup.min_select || 0) }, "Modifier group created") }}>
              <input placeholder="Group name" value={modifierGroup.name} onChange={e => setModifierGroup({ ...modifierGroup, name: e.target.value })} required />
              <select value={modifierGroup.selection_type} onChange={e => setModifierGroup({ ...modifierGroup, selection_type: e.target.value })}><option value="single">Single selection</option><option value="multiple">Multiple selection</option></select>
              <label className="check"><input type="checkbox" checked={modifierGroup.required} onChange={e => setModifierGroup({ ...modifierGroup, required: e.target.checked })} /> Required</label>
              <input type="number" min="0" placeholder="Minimum select" value={modifierGroup.min_select} onChange={e => setModifierGroup({ ...modifierGroup, min_select: e.target.value })} />
              <input type="number" min="0" placeholder="Maximum select" value={modifierGroup.max_select} onChange={e => setModifierGroup({ ...modifierGroup, max_select: e.target.value })} />
              <button className="btn primary" disabled={saving}>Create Group</button>
            </form>
            {groups.map(g => <div className="row" key={g.id}><b>{g.name}</b><span>{g.selection_type} · {g.required ? "required" : "optional"}</span></div>)}
          </Panel>
          <Panel title="Paid Add-ons / Modifiers">
            <form className="form" onSubmit={e => { e.preventDefault(); insert("modifiers", { ...modifier, group_id: modifier.group_id || selectedGroup, price: Number(modifier.price || 0) }, "Modifier created") }}>
              <select value={modifier.group_id || selectedGroup} onChange={e => setModifier({ ...modifier, group_id: e.target.value })}><option value="">Select group</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
              <input placeholder="Modifier name" value={modifier.name} onChange={e => setModifier({ ...modifier, name: e.target.value })} required />
              <input type="number" min="0" step="0.01" placeholder="Extra price" value={modifier.price} onChange={e => setModifier({ ...modifier, price: e.target.value })} />
              <button className="btn primary" disabled={saving}>Add Modifier</button>
            </form>
            {(data.modifiers || []).map(m => <div className="row" key={m.id}><b>{m.name}</b><span>{money(m.price)}</span></div>)}
          </Panel>
        </section>}

        {tab === "delivery" && <section className="grid">
          <Panel title="Delivery Riders">
            <form className="form" onSubmit={e => { e.preventDefault(); insert("delivery_riders", { ...rider, active: true }, "Rider created") }}>
              <input placeholder="Rider name" value={rider.name} onChange={e => setRider({ ...rider, name: e.target.value })} required />
              <input placeholder="Phone" value={rider.phone} onChange={e => setRider({ ...rider, phone: e.target.value })} />
              <input placeholder="Vehicle" value={rider.vehicle} onChange={e => setRider({ ...rider, vehicle: e.target.value })} />
              <button className="btn primary" disabled={saving}>Add Rider</button>
            </form>
            {(data.riders || []).map(r => <div className="row" key={r.id}><b>{r.name}</b><span>{r.phone || "—"} · {r.active ? "Active" : "Off"}</span></div>)}
          </Panel>
          <Panel title="Delivery Zones">
            <form className="form" onSubmit={e => { e.preventDefault(); insert("delivery_zones", { ...zone, charge: Number(zone.charge || 0), min_order: Number(zone.min_order || 0), active: true }, "Delivery zone created") }}>
              <input placeholder="Zone name" value={zone.name} onChange={e => setZone({ ...zone, name: e.target.value })} required />
              <input type="number" min="0" step="0.01" placeholder="Delivery charge" value={zone.charge} onChange={e => setZone({ ...zone, charge: e.target.value })} />
              <input type="number" min="0" step="0.01" placeholder="Minimum order" value={zone.min_order} onChange={e => setZone({ ...zone, min_order: e.target.value })} />
              <button className="btn primary" disabled={saving}>Add Zone</button>
            </form>
            {(data.zones || []).map(z => <div className="row" key={z.id}><b>{z.name}</b><span>{money(z.charge)} · min {money(z.min_order)}</span></div>)}
          </Panel>
        </section>}

        {tab === "kitchen" && <section className="grid">
          <Panel title="Kitchen Stations">
            <form className="form" onSubmit={e => { e.preventDefault(); insert("kitchen_stations", { ...station, active: true, sort_order: (data.stations || []).length }, "Kitchen station created") }}>
              <input placeholder="Station name" value={station.name} onChange={e => setStation({ ...station, name: e.target.value })} required />
              <select value={station.station_type} onChange={e => setStation({ ...station, station_type: e.target.value })}><option>kitchen</option><option>bar</option><option>pizza</option><option>dessert</option><option>packing</option></select>
              <button className="btn primary" disabled={saving}>Create Station</button>
            </form>
            {(data.stations || []).map(s => <div className="row" key={s.id}><b>{s.name}</b><span>{s.station_type} · {s.active ? "Active" : "Off"}</span></div>)}
          </Panel>
          <Panel title="KDS Workflow">
            <p className="muted">KOT/KDS state transitions are handled by the existing restaurant operations API. Use the main Restaurant Core for live order tickets.</p>
            <a className="link" href="/dashboard/restaurant-core?tab=kds">Open Live KDS →</a>
            <a className="link" href="/dashboard/restaurant-core?tab=pos">Open POS / KOT →</a>
          </Panel>
        </section>}

        {tab === "staff" && <section className="grid">
          <Panel title="Attendance Event">
            <form className="form" onSubmit={e => { e.preventDefault(); insert("staff_attendance_events", { ...staffEvent, staff_id: staffEvent.staff_id || null, at: new Date().toISOString() }, "Attendance event recorded") }}>
              <input placeholder="Staff ID" value={staffEvent.staff_id} onChange={e => setStaffEvent({ ...staffEvent, staff_id: e.target.value })} />
              <select value={staffEvent.event_type} onChange={e => setStaffEvent({ ...staffEvent, event_type: e.target.value })}><option>check_in</option><option>check_out</option><option>break_start</option><option>break_end</option></select>
              <input placeholder="Notes" value={staffEvent.notes} onChange={e => setStaffEvent({ ...staffEvent, notes: e.target.value })} />
              <button className="btn primary" disabled={saving}>Record Event</button>
            </form>
            {(data.attendance || []).map(x => <div className="row" key={x.id}><b>{x.event_type}</b><span>{x.at ? new Date(x.at).toLocaleString("en-IN") : "—"}</span></div>)}
          </Panel>
          <Panel title="Role Permissions">
            <form className="form" onSubmit={e => { e.preventDefault(); upsert("role_permissions", permission, "restaurant_id,role,permission", "Permission saved") }}>
              <select value={permission.role} onChange={e => setPermission({ ...permission, role: e.target.value })}><option>admin</option><option>manager</option><option>cashier</option><option>waiter</option><option>kitchen</option><option>inventory</option></select>
              <input placeholder="Permission key" value={permission.permission} onChange={e => setPermission({ ...permission, permission: e.target.value })} />
              <label className="check"><input type="checkbox" checked={permission.allowed} onChange={e => setPermission({ ...permission, allowed: e.target.checked })} /> Allowed</label>
              <button className="btn primary" disabled={saving}>Save Permission</button>
            </form>
            {(data.permissions || []).map(p => <div className="row" key={p.id}><b>{p.role}</b><span>{p.permission} · {p.allowed ? "Allowed" : "Denied"}</span></div>)}
          </Panel>
        </section>}

        {tab === "branches" && <section className="grid">
          <Panel title="Branch Management">
            <form className="form" onSubmit={e => { e.preventDefault(); insert("restaurant_branches", { ...branch, parent_restaurant_id: rid, active: true }); }}>
              <input placeholder="Branch name" value={branch.name} onChange={e => setBranch({ ...branch, name: e.target.value })} required />
              <input placeholder="Branch code" value={branch.code} onChange={e => setBranch({ ...branch, code: e.target.value })} required />
              <input placeholder="Address" value={branch.address} onChange={e => setBranch({ ...branch, address: e.target.value })} />
              <input placeholder="Phone" value={branch.phone} onChange={e => setBranch({ ...branch, phone: e.target.value })} />
              <button className="btn primary" disabled={saving}>Create Branch</button>
            </form>
            {(data.branches || []).map(b => <div className="row" key={b.id}><b>{b.name}</b><span>{b.code} · {b.active ? "Active" : "Off"}</span></div>)}
          </Panel>
          <Panel title="Central Menu / Branch Controls">
            <p className="muted">Branch-level menu overrides are stored separately from the master menu, so a branch can change price/availability without modifying the restaurant master menu.</p>
            <a className="link" href="/dashboard/add-item">Open Master Menu →</a>
          </Panel>
        </section>}

        {tab === "digital" && <section className="grid">
          <Panel title="Self-Service Kiosk">
            <form className="form" onSubmit={e => { e.preventDefault(); insert("self_service_kiosks", { ...kiosk, active: true }) }}>
              <input placeholder="Kiosk name" value={kiosk.name} onChange={e => setKiosk({ ...kiosk, name: e.target.value })} required />
              <input placeholder="Kiosk code" value={kiosk.kiosk_code} onChange={e => setKiosk({ ...kiosk, kiosk_code: e.target.value })} />
              <button className="btn primary" disabled={saving}>Register Kiosk</button>
            </form>
            {(data.kiosks || []).map(k => <div className="row" key={k.id}><b>{k.name}</b><span>{k.kiosk_code || "—"} · {k.active ? "Active" : "Off"}</span></div>)}
          </Panel>
          <Panel title="Digital Display & Calling Devices">
            <form className="form" onSubmit={e => { e.preventDefault(); insert("digital_display_playlists", { ...display, items: [], active: true }) }}>
              <input placeholder="Display playlist name" value={display.name} onChange={e => setDisplay({ ...display, name: e.target.value })} required />
              <select value={display.screen_type} onChange={e => setDisplay({ ...display, screen_type: e.target.value })}><option>menu</option><option>token</option><option>promotion</option><option>order_ready</option></select>
              <button className="btn primary" disabled={saving}>Create Display Playlist</button>
            </form>
            <form className="form" onSubmit={e => { e.preventDefault(); insert("calling_devices", { ...device, active: true }) }}>
              <input placeholder="Calling device" value={device.name} onChange={e => setDevice({ ...device, name: e.target.value })} required />
              <input placeholder="Device code" value={device.device_code} onChange={e => setDevice({ ...device, device_code: e.target.value })} />
              <input placeholder="Location" value={device.location} onChange={e => setDevice({ ...device, location: e.target.value })} />
              <button className="btn primary" disabled={saving}>Register Calling Device</button>
            </form>
          </Panel>
        </section>}

        {tab === "printing" && <section className="grid">
          <Panel title="Thermal / KOT Printer">
            <form className="form" onSubmit={e => { e.preventDefault(); insert("printer_devices", { ...printer, port: Number(printer.port || 9100), active: true }) }}>
              <input placeholder="Printer name" value={printer.name} onChange={e => setPrinter({ ...printer, name: e.target.value })} required />
              <select value={printer.printer_type} onChange={e => setPrinter({ ...printer, printer_type: e.target.value })}><option>thermal</option><option>receipt</option><option>kot</option><option>a4</option></select>
              <input placeholder="IP address" value={printer.ip_address} onChange={e => setPrinter({ ...printer, ip_address: e.target.value })} />
              <input type="number" placeholder="Port" value={printer.port} onChange={e => setPrinter({ ...printer, port: e.target.value })} />
              <button className="btn primary" disabled={saving}>Register Printer</button>
            </form>
            {(data.printers || []).map(p => <div className="row" key={p.id}><b>{p.name}</b><span>{p.printer_type} · {p.ip_address || "No IP"}</span></div>)}
          </Panel>
          <Panel title="E-Bill / Invoice">
            <p className="muted">Invoice records are persisted per restaurant. Existing billing remains the source of truth; this module stores document delivery status and recipient information.</p>
            <a className="link" href="/billing">Open Billing & Invoice →</a>
            <a className="link" href="/dashboard/cash-closing">Open Cashier Closing →</a>
          </Panel>
        </section>}

        {tab === "payments" && <Panel title="Payment Gateway Configuration">
          <form className="form" onSubmit={e => { e.preventDefault(); upsert("payment_gateway_configs", { ...gateway, config: {} }, "restaurant_id,provider", "Gateway configuration saved") }}>
            <select value={gateway.provider} onChange={e => setGateway({ ...gateway, provider: e.target.value, display_name: e.target.value === "razorpay" ? "Razorpay" : e.target.value === "stripe" ? "Stripe" : e.target.value })}><option value="razorpay">Razorpay</option><option value="stripe">Stripe</option><option value="cashfree">Cashfree</option><option value="custom">Custom</option></select>
            <input value={gateway.display_name} onChange={e => setGateway({ ...gateway, display_name: e.target.value })} placeholder="Display name" />
            <label className="check"><input type="checkbox" checked={gateway.active} onChange={e => setGateway({ ...gateway, active: e.target.checked })} /> Active</label>
            <button className="btn primary" disabled={saving}>Save Gateway</button>
          </form>
          {(data.gateways || []).map(g => <div className="row" key={g.id}><b>{g.display_name}</b><span>{g.provider} · {g.active ? "Active" : "Off"}</span></div>)}
        </Panel>}

        {tab === "online" && <section className="grid">
          <Panel title="Restaurant Website Ordering">
            <form className="form" onSubmit={e => { e.preventDefault(); upsert("website_order_settings", { enabled: website.enabled, slug: website.slug, settings: website.settings || {} }, "restaurant_id", "Website ordering settings saved") }}>
              <input placeholder="Restaurant slug" value={website.slug || ""} onChange={e => setWebsite({ ...website, slug: e.target.value })} />
              <label className="check"><input type="checkbox" checked={Boolean(website.enabled)} onChange={e => setWebsite({ ...website, enabled: e.target.checked })} /> Online ordering enabled</label>
              <button className="btn primary" disabled={saving}>Save Website</button>
            </form>
            <a className="link" href="/order">Open Customer Ordering →</a>
          </Panel>
          <Panel title="Scan & Pay">
            <p className="muted">Create a payment request from the order/billing workflow and keep its lifecycle in the restaurant-scoped scan-pay ledger.</p>
            <a className="link" href="/billing">Open Billing / Payment Request →</a>
          </Panel>
        </section>}

        {tab === "reports" && <Panel title="Dynamic Report Definitions">
          <form className="form" onSubmit={e => { e.preventDefault(); let filters = {}; try { filters = JSON.parse(report.filters || "{}"); } catch { setMessage("Filters must be valid JSON"); return } insert("dynamic_report_definitions", { name: report.name, report_type: report.report_type, filters, columns_config: [] }) }}>
            <input placeholder="Report name" value={report.name} onChange={e => setReport({ ...report, name: e.target.value })} required />
            <select value={report.report_type} onChange={e => setReport({ ...report, report_type: e.target.value })}><option>sales</option><option>orders</option><option>payments</option><option>customers</option><option>staff</option><option>tax</option><option>delivery</option></select>
            <textarea rows={4} value={report.filters} onChange={e => setReport({ ...report, filters: e.target.value })} placeholder='{"date_from":"2026-08-01","date_to":"2026-08-31"}' />
            <button className="btn primary" disabled={saving}>Save Report Definition</button>
          </form>
          {(data.reports || []).map(r => <div className="row" key={r.id}><b>{r.name}</b><span>{r.report_type} · {r.active ? "Active" : "Off"}</span></div>)}
          <a className="link" href="/dashboard/reports">Open Report Center →</a>
        </Panel>}

        {tab === "forecast" && <Panel title="Forecast Snapshot">
          <form className="form" onSubmit={e => { e.preventDefault(); insert("forecast_snapshots", { ...forecast, predicted_value: Number(forecast.predicted_value || 0), confidence: forecast.confidence === "" ? null : Number(forecast.confidence) }) }}>
            <input type="date" value={forecast.forecast_date} onChange={e => setForecast({ ...forecast, forecast_date: e.target.value })} required />
            <select value={forecast.metric} onChange={e => setForecast({ ...forecast, metric: e.target.value })}><option>sales</option><option>orders</option><option>average_bill</option><option>delivery</option></select>
            <input type="number" min="0" step="0.01" placeholder="Predicted value" value={forecast.predicted_value} onChange={e => setForecast({ ...forecast, predicted_value: e.target.value })} required />
            <input type="number" min="0" max="1" step="0.01" placeholder="Confidence 0-1" value={forecast.confidence} onChange={e => setForecast({ ...forecast, confidence: e.target.value })} />
            <button className="btn primary" disabled={saving}>Save Forecast</button>
          </form>
          {(data.forecasts || []).map(f => <div className="row" key={f.id}><b>{f.forecast_date} · {f.metric}</b><span>{money(f.predicted_value)}{f.confidence != null ? ` · ${(Number(f.confidence) * 100).toFixed(0)}%` : ""}</span></div>)}
        </Panel>}
      </div>
    </main>
  )
}

function Stat({ label, value }) { return <div className="stat"><small>{label}</small><strong>{value}</strong></div> }
function Panel({ title, children }) { return <section className="panel"><h2>{title}</h2>{children}</section> }

const css = `
.suite{min-height:100vh;padding:24px;background:var(--background);color:var(--text)}
.shell{max-width:1500px;margin:auto}.hero,.panel,.stat{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 18px 50px rgba(0,0,0,.12)}
.hero{padding:26px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px}.eyebrow{font-size:11px;font-weight:900;letter-spacing:1.5px;color:var(--primary)}h1{font-size:clamp(28px,4vw,44px);margin:7px 0}.hero p,.muted{color:var(--muted);line-height:1.6}.toast{margin:14px 0;padding:12px 14px;border-radius:12px;background:rgba(var(--primary-rgb),.08);border:1px solid rgba(var(--primary-rgb),.25);color:var(--text)}
.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:14px 0}.stat{padding:16px}.stat small{display:block;color:var(--muted);font-weight:800}.stat strong{display:block;margin-top:6px;font-size:24px}.tabs{display:flex;gap:8px;overflow:auto;padding:4px 0 14px}.tabs button,.btn{border:1px solid var(--border);background:var(--surface-2);color:var(--text);border-radius:11px;padding:10px 13px;font-weight:900;cursor:pointer;white-space:nowrap}.tabs button.active,.btn.primary{background:var(--primary);color:#111;border-color:var(--primary)}.btn.ghost{background:rgba(var(--primary-rgb),.08);color:var(--primary)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.panel{padding:20px;margin-bottom:16px}.panel h2{margin:0 0 15px;font-size:20px}.form{display:grid;gap:9px;margin-bottom:15px}.form input,.form select,.form textarea{width:100%;box-sizing:border-box;background:var(--background);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:11px}.form input:focus,.form select:focus,.form textarea:focus{outline:2px solid rgba(var(--primary-rgb),.35);outline-offset:1px}.check{display:flex;gap:8px;align-items:center;color:var(--text);font-weight:700}.check input{width:auto}.row{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--border)}.row:last-child{border-bottom:0}.row span{color:var(--muted);text-align:right}.link{display:block;padding:12px;border-radius:11px;background:rgba(var(--primary-rgb),.06);color:var(--primary);text-decoration:none;font-weight:900;margin-top:8px}
@media(max-width:1000px){.stats{grid-template-columns:repeat(3,1fr)}.grid{grid-template-columns:1fr}}@media(max-width:600px){.suite{padding:12px}.hero{padding:18px;flex-direction:column}.stats{grid-template-columns:repeat(2,1fr)}.panel{padding:15px}.row{align-items:flex-start;flex-direction:column}.row span{text-align:left}}
`
