"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

const money = n => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const badge = s => String(s || "pending").replaceAll("_", " ")

export default function PaymentReconciliationPage() {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState({ count: 0, expected: 0, received: 0, byStatus: {} })
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [settling, setSettling] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const r = await fetch(`/api/payments/reconciliation?days=${days}`, { cache: "no-store" })
      const j = await r.json()
      if (!r.ok || !j.success) throw new Error(j.error || "Unable to load reconciliation")
      setRows(j.rows || []); setSummary(j.summary || { count: 0, expected: 0, received: 0, byStatus: {} })
    } catch (e) { setError(e?.message || "Unable to load reconciliation") } finally { setLoading(false) }
  }, [days])

  useEffect(() => { void load() }, [load])

  async function sync() {
    setSyncing(true); setError(""); setNotice("")
    try {
      const r = await fetch("/api/payments/reconciliation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sync", days }) })
      const j = await r.json()
      if (!r.ok || !j.success) throw new Error(j.error || "Sync failed")
      setNotice(`${j.synced || 0} payment records reconciled.`)
      await load()
    } catch (e) { setError(e?.message || "Sync failed") } finally { setSyncing(false) }
  }

  async function settle(row) {
    const value = window.prompt(`Expected ${money(row.expected_amount)}. Enter actual received amount:`, String(Number(row.received_amount || row.expected_amount || 0)))
    if (value === null) return
    setSettling(row.id); setError(""); setNotice("")
    try {
      const r = await fetch("/api/payments/reconciliation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "settle", id: row.id, received_amount: Number(value) }) })
      const j = await r.json()
      if (!r.ok || !j.success) throw new Error(j.error || "Settlement failed")
      setNotice(`Settlement updated: ${badge(j.row?.status)}.`)
      await load()
    } catch (e) { setError(e?.message || "Settlement failed") } finally { setSettling(null) }
  }

  const open = useMemo(() => rows.filter(r => ["pending", "exception", "short", "over", "partial"].includes(r.status)).length, [rows])

  return <main className="recon">
    <header className="hero">
      <div><small>ANAIRA · FINANCE CONTROL</small><h1>Payment Reconciliation</h1><p>Match POS payments with gateway/provider settlements and identify short, over, pending or exceptional transactions.</p></div>
      <div className="toolbar"><select value={days} onChange={e => setDays(Number(e.target.value))}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>365 days</option></select><button onClick={sync} disabled={syncing}>{syncing ? "Syncing…" : "↻ Sync Payments"}</button></div>
    </header>
    {error && <div className="message error">{error}</div>}{notice && <div className="message notice">{notice}</div>}
    <section className="stats"><Card label="Records" value={summary.count}/><Card label="Expected" value={money(summary.expected)}/><Card label="Received" value={money(summary.received)}/><Card label="Open / Exceptions" value={open}/></section>
    <section className="panel"><div className="panel-head"><div><h2>Settlement Ledger</h2><span>Internal payment records are matched automatically; online/provider settlements remain pending until verified.</span></div></div>
      {loading ? <div className="empty">Loading reconciliation…</div> : !rows.length ? <div className="empty">No payment records found. Click Sync Payments to build the reconciliation ledger.</div> : <div className="table-wrap"><table><thead><tr><th>Date</th><th>Order</th><th>Provider</th><th>Reference</th><th>Expected</th><th>Received</th><th>Difference</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{r.created_at ? new Date(r.created_at).toLocaleString("en-IN") : "—"}</td><td>{String(r.order_id || "").slice(0, 8)}</td><td>{r.provider || "—"}</td><td className="ref">{r.external_reference || "—"}</td><td>{money(r.expected_amount)}</td><td>{money(r.received_amount)}</td><td className={Number(r.difference || 0) === 0 ? "ok" : "bad"}>{money(r.difference)}</td><td><span className={`status ${String(r.status || "pending")}`}>{badge(r.status)}</span></td><td>{["pending","exception","partial","short","over"].includes(r.status) && <button className="small" onClick={() => settle(r)} disabled={settling === r.id}>{settling === r.id ? "…" : "Settle"}</button>}</td></tr>)}</tbody></table></div>}
    </section>
    <style jsx>{styles}</style>
  </main>
}
function Card({label,value}) { return <div className="card"><small>{label}</small><strong>{value}</strong></div> }
const styles = `.recon{min-height:100dvh;padding:24px;max-width:1500px;margin:auto;background:var(--background,#09101b);color:var(--foreground,#f4efe5)}.hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding:24px;border:1px solid rgba(231,174,57,.22);border-radius:22px;background:var(--surface,#101827)}.hero small{color:#e7ae39;font-weight:900;letter-spacing:.14em}.hero h1{font-size:clamp(28px,4vw,46px);margin:7px 0}.hero p{color:#aab4c7;max-width:820px}.toolbar{display:flex;gap:8px;flex-wrap:wrap}button,select{border:1px solid rgba(231,174,57,.3);background:#121b2b;color:#f4efe5;border-radius:11px;padding:10px 14px;font-weight:800;cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}.card,.panel{border:1px solid rgba(255,255,255,.08);background:var(--surface,#101827);border-radius:18px;padding:17px}.card small{display:block;color:#9ca8bb}.card strong{display:block;font-size:25px;margin-top:6px}.panel-head{display:flex;justify-content:space-between;gap:12px}.panel h2{margin:0 0 5px}.panel-head span{color:#8f9bad;font-size:13px}.table-wrap{overflow:auto;margin-top:15px}table{width:100%;border-collapse:collapse;min-width:1050px}th,td{text-align:left;padding:12px;border-top:1px solid rgba(255,255,255,.07);white-space:nowrap}th{color:#9ca8bb;font-size:12px;text-transform:uppercase;letter-spacing:.06em}.ref{max-width:260px;overflow:hidden;text-overflow:ellipsis}.status{display:inline-flex;padding:5px 9px;border-radius:999px;background:#202b3d;color:#e7ae39;font-weight:800;font-size:12px}.status.settled,.status.matched{color:#b9f3c1}.status.short,.status.over,.status.exception{color:#ffb6a9}.ok{color:#b9f3c1}.bad{color:#ffb6a9}.small{padding:7px 10px;font-size:12px}.message{margin:12px 0;padding:12px 14px;border-radius:12px;background:#171f2e;border:1px solid rgba(231,174,57,.3)}.notice{color:#d9f6d9}.error{color:#ffd0c8}.empty{padding:35px;text-align:center;color:#9ca8bb}@media(max-width:900px){.hero{flex-direction:column}.stats{grid-template-columns:repeat(2,1fr)}.recon{padding:14px}}@media(max-width:520px){.stats{grid-template-columns:1fr}.toolbar{width:100%}.toolbar>*{flex:1}}`
