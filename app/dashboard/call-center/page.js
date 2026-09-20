"use client"

import { useEffect, useMemo, useState } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"

const money = n => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
const dt = v => v ? new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"

export default function CallCenterPage() {
  const [phone, setPhone] = useState("")
  const [name, setName] = useState("")
  const [subject, setSubject] = useState("")
  const [notes, setNotes] = useState("")
  const [address, setAddress] = useState("")
  const [customer, setCustomer] = useState(null)
  const [orders, setOrders] = useState([])
  const [history, setHistory] = useState([])
  const [calls, setCalls] = useState([])
  const [agents, setAgents] = useState([])
  const [selectedCall, setSelectedCall] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [status, setStatus] = useState("")

  async function token() {
    const { data } = await supabaseCloud.auth.getSession()
    if (!data?.session?.access_token) throw new Error("Session expired. Please sign in again.")
    return data.session.access_token
  }

  async function api(method, body, query = "") {
    const t = await token()
    const res = await fetch(`/api/call-center${query}`, { method, headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify(body), cache: "no-store" })
    const d = await res.json().catch(() => ({}))
    if (!res.ok || !d.success) throw new Error(d.error || "Call center request failed")
    return d
  }

  async function load(extraPhone = phone) {
    setLoading(true)
    try {
      const d = await api("GET", null, extraPhone ? `?phone=${encodeURIComponent(extraPhone)}${status ? `&status=${encodeURIComponent(status)}` : ""}` : status ? `?status=${encodeURIComponent(status)}` : "")
      setCalls(d.calls || []); setAgents(d.agents || []); setCustomer(d.customer || null); setOrders(d.orders || []); setHistory(d.history || [])
    } catch (e) { setMessage(e.message) } finally { setLoading(false) }
  }

  useEffect(() => { load("") }, [])

  async function identify() { if (!phone.trim()) return setMessage("Enter caller mobile number") ; setMessage(""); await load(phone.trim()) }

  async function createCall() {
    setBusy(true); setMessage("")
    try {
      const d = await api("POST", { action: "create", phone, name: name || customer?.name || "", subject, notes, idempotency_key: crypto.randomUUID() })
      setMessage(`Call ${String(d.call_id).slice(0, 8)} created`); setSubject(""); setNotes(""); await load(phone)
    } catch (e) { setMessage(e.message) } finally { setBusy(false) }
  }

  async function action(action, extra = {}) {
    if (!selectedCall) return
    setBusy(true); setMessage("")
    try { const d = await api("POST", { action, call_id: selectedCall.id, ...extra }); setMessage(d.message || "Updated"); await load(phone); setSelectedCall(null) }
    catch (e) { setMessage(e.message) } finally { setBusy(false) }
  }

  async function reorder(orderId) {
    setBusy(true); setMessage("")
    try {
      const d = await api("POST", { action: "reorder", order_id: orderId })
      localStorage.setItem("anaira_call_center_reorder", JSON.stringify(d.reorder))
      setMessage("Quick reorder prepared. Review the items in POS before billing.")
      window.open("/order", "_blank", "noopener,noreferrer")
    } catch (e) { setMessage(e.message) } finally { setBusy(false) }
  }

  const openCalls = useMemo(() => calls.filter(x => ["open", "assigned", "callback"].includes(x.status)), [calls])

  return <>
  <main className="cc-page">
    <header className="cc-head"><div><span className="eyebrow">P2.1 · ADVANCED OPERATIONS</span><h1>Call Center</h1><p>Identify callers, open Customer 360, reorder, request delivery, schedule callbacks, assign agents and resolve calls.</p></div><div className="head-actions"><a href="/dashboard/customers" className="btn">Customer 360</a><a href="/dashboard/calling" className="btn">Calling Device</a><button className="btn" onClick={() => load(phone)}>↻ Refresh</button></div></header>
    {message && <div className="notice">{message}</div>}

    <section className="identify card"><div className="section-title"><div><b>Incoming Caller</b><small>Phone identification → Customer 360</small></div><span className={customer ? "identified" : "waiting"}>{customer ? "● IDENTIFIED" : "○ WAITING"}</span></div><div className="identify-grid"><input value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === "Enter" && identify()} placeholder="Caller mobile number" inputMode="tel"/><button className="btn primary" onClick={identify} disabled={loading}>🔎 Identify Caller</button></div></section>

    <section className="stats"><div><b>{openCalls.length}</b><span>Open Calls</span></div><div><b>{customer?.total_orders || 0}</b><span>Customer Orders</span></div><div><b>{money(customer?.total_spend)}</b><span>Lifetime Spend</span></div><div><b>⭐ {customer?.loyalty_points || 0}</b><span>Loyalty Points</span></div></section>

    <div className="grid">
      <section className="card"><div className="section-title"><div><b>Customer 360</b><small>{customer ? `${customer.name || "Guest"} · ${customer.phone || phone}` : "Identify a caller to load profile"}</small></div></div>{customer ? <><div className="profile-grid"><div><small>Name</small><b>{customer.name || "Guest"}</b></div><div><small>Phone</small><b>{customer.phone || phone}</b></div><div><small>Email</small><b>{customer.email || "—"}</b></div><div><small>Last Visit</small><b>{dt(customer.last_visit_at)}</b></div></div><div className="quick-form"><input value={name} onChange={e => setName(e.target.value)} placeholder="Caller name"/><input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Call subject"/><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Call notes / request"/><button className="btn primary" onClick={createCall} disabled={busy}>＋ Create Call</button></div></> : <div className="empty">No caller identified yet.</div>}</section>

      <section className="card"><div className="section-title"><div><b>Agent Queue</b><small>Assignment and current state</small></div><select value={status} onChange={e => { setStatus(e.target.value); setTimeout(() => load(phone), 0) }}><option value="">All</option><option value="open">Open</option><option value="assigned">Assigned</option><option value="callback">Callback</option><option value="resolved">Resolved</option></select></div><div className="call-list">{loading ? <div className="empty">Loading…</div> : calls.map(c => <button className={`call-row ${selectedCall?.id === c.id ? "active" : ""}`} key={c.id} onClick={() => setSelectedCall(c)}><div><b>{c.customer?.name || c.caller_name || "Unknown Caller"}</b><small>{c.caller_phone || "No phone"} · {c.subject || "General call"}</small></div><span>{c.status}</span></button>)}{!calls.length && <div className="empty">No calls yet.</div>}</div></section>
    </div>

    {selectedCall && <section className="card action-panel"><div className="section-title"><div><b>Call Actions</b><small>{selectedCall.subject || "Call"} · {selectedCall.caller_phone || "No phone"}</small></div><button className="btn" onClick={() => setSelectedCall(null)}>Close</button></div><div className="action-grid"><label>Assign Agent<select value={selectedCall.agent_id || ""} onChange={e => action("assign", { agent_id: e.target.value })}><option value="">Select agent</option>{agents.map(a => <option value={a.id} key={a.id}>{a.email} · {a.role}</option>)}</select></label><label>Callback Time<input type="datetime-local" onChange={e => e.target.value && action("callback", { callback_at: new Date(e.target.value).toISOString() })}/></label><label>Delivery Address<textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="Full delivery address"/></label><button className="btn" disabled={busy} onClick={() => action("delivery", { address, phone: selectedCall.caller_phone })}>🛵 Request Delivery</button><button className="btn primary" disabled={busy} onClick={() => action("resolve", { notes: "Resolved from Call Center" })}>✓ Resolve Call</button></div></section>}

    <div className="grid">
      <section className="card"><div className="section-title"><div><b>Previous Orders</b><small>Quick reorder always requires POS review before billing</small></div></div><div className="orders">{orders.map(o => <div className="order" key={o.id}><div><b>#{o.order_number || String(o.id).slice(0, 8).toUpperCase()}</b><small>{dt(o.created_at)} · {o.status || "—"}</small></div><strong>{money(o.total_amount)}</strong><button className="btn" disabled={busy} onClick={() => reorder(o.id)}>↻ Quick Reorder</button></div>)}{!orders.length && <div className="empty">No previous orders found.</div>}</div></section>
      <section className="card"><div className="section-title"><div><b>Call History</b><small>Every call-center event is retained</small></div></div><div className="history">{history.map(h => <div className="history-row" key={h.id}><span>{h.status || h.event_type}</span><small>{dt(h.created_at)}</small></div>)}{!history.length && <div className="empty">No call history for this caller.</div>}</div></section>
    </div>
  </main>
  <style jsx global>{css}</style>
  </>
}

const css = `
.cc-page{min-height:100vh;background:var(--background);color:var(--text);padding:28px;box-sizing:border-box}.cc-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:20px}.cc-head h1{margin:5px 0;font-size:34px}.cc-head p{color:var(--muted);margin:0;max-width:800px}.eyebrow{font-size:11px;font-weight:900;letter-spacing:.14em;color:var(--info)}.head-actions{display:flex;gap:8px;flex-wrap:wrap}.card{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:18px}.notice{padding:12px 15px;border:1px solid var(--border);border-radius:12px;margin-bottom:15px;font-weight:800}.identify{margin-bottom:15px}.section-title{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:14px}.section-title b{display:block;font-size:16px}.section-title small{display:block;color:var(--muted);margin-top:4px}.identified{color:#22c55e;font-size:11px;font-weight:900}.waiting{color:var(--muted);font-size:11px;font-weight:900}.identify-grid{display:grid;grid-template-columns:1fr auto;gap:9px}.identify-grid input,.quick-form input,.quick-form textarea,.action-grid input,.action-grid textarea,.action-grid select,.section-title select{width:100%;box-sizing:border-box;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--background);color:var(--text);outline:none}.btn{border:1px solid var(--border);background:var(--surface-2);color:var(--text);border-radius:10px;padding:11px 14px;font-weight:850;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.btn.primary{background:var(--primary);color:#111827;border-color:var(--primary)}.btn:disabled{opacity:.55;cursor:wait}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:15px}.stats>div{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:17px}.stats b{font-size:23px;display:block}.stats span{font-size:12px;color:var(--muted)}.grid{display:grid;grid-template-columns:1.2fr .8fr;gap:15px;margin-bottom:15px}.profile-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:14px}.profile-grid>div{padding:12px;border:1px solid var(--border);border-radius:11px;background:var(--surface-2)}.profile-grid small{display:block;color:var(--muted);font-size:11px}.profile-grid b{display:block;margin-top:5px;font-size:13px}.quick-form{display:grid;grid-template-columns:1fr 1fr;gap:9px}.quick-form textarea{grid-column:1/-1;min-height:75px;resize:vertical}.quick-form .btn{justify-self:start}.call-list,.orders,.history{display:flex;flex-direction:column;gap:7px;max-height:420px;overflow:auto}.call-row{width:100%;border:1px solid var(--border);background:var(--surface-2);color:var(--text);border-radius:11px;padding:11px;text-align:left;display:flex;justify-content:space-between;gap:12px;cursor:pointer}.call-row.active{border-color:var(--primary)}.call-row b,.call-row small{display:block}.call-row small{color:var(--muted);margin-top:4px}.call-row>span{font-size:10px;font-weight:900;text-transform:uppercase;color:var(--primary)}.empty{padding:28px;text-align:center;color:var(--muted);border:1px dashed var(--border);border-radius:12px}.action-panel{margin-bottom:15px}.action-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.action-grid label{display:grid;gap:6px;font-size:12px;font-weight:850}.action-grid textarea{min-height:80px;resize:vertical}.action-grid .btn{align-self:end}.order{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:11px;border:1px solid var(--border);border-radius:11px}.order small{display:block;color:var(--muted);margin-top:3px}.history-row{display:flex;justify-content:space-between;padding:11px;border-bottom:1px solid var(--border)}.history-row span{font-weight:800}.history-row small{color:var(--muted)}@media(max-width:1000px){.grid{grid-template-columns:1fr}.profile-grid{grid-template-columns:1fr 1fr}.stats{grid-template-columns:1fr 1fr}}@media(max-width:620px){.cc-page{padding:15px}.cc-head{flex-direction:column}.head-actions{width:100%}.head-actions .btn{flex:1}.identify-grid,.quick-form,.action-grid{grid-template-columns:1fr}.quick-form textarea{grid-column:auto}.stats{grid-template-columns:1fr 1fr}.profile-grid{grid-template-columns:1fr}.order{grid-template-columns:1fr}.order .btn{width:100%}}
`

// Keep this page self-contained so it can run alongside the existing POS styles.

