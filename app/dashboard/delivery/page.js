"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
const statusLabel = (s) => ({ pending:"Pending", assigned:"Assigned", out_for_delivery:"Out for delivery", delivered:"Delivered", ready_for_pickup:"Ready for pickup", picked_up:"Picked up", cancelled:"Cancelled", settled:"Settled" }[s] || s || "Pending")

export default function DeliveryManagement() {
  const search = useSearchParams()
  const [deliveries,setDeliveries] = useState([])
  const [riders,setRiders] = useState([])
  const [zones,setZones] = useState([])
  const [loading,setLoading] = useState(true)
  const [selected,setSelected] = useState(null)
  const [riderId,setRiderId] = useState("")
  const [cash,setCash] = useState("")
  const [upi,setUpi] = useState("")
  const [card,setCard] = useState("")
  const [filter,setFilter] = useState("active")
  const [busy,setBusy] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/delivery", { cache:"no-store" })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Delivery data unavailable")
      setDeliveries(data.deliveries || [])
      setRiders(data.riders || [])
      setZones(data.zones || [])
      const slip = search.get("slip")
      if (slip) {
        const match = (data.deliveries || []).find(x => x.slip_no === slip)
        if (match) setSelected(match)
      }
    } catch (e) {
      alert(e.message)
    } finally { setLoading(false) }
  }

  useEffect(()=>{ load() },[])

  async function action(body) {
    setBusy(true)
    try {
      const res = await fetch("/api/delivery", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Operation failed")
      await load()
      if (data.delivery) setSelected(data.delivery)
      return data.delivery
    } catch(e) { alert(e.message) } finally { setBusy(false) }
  }

  const filtered = useMemo(()=>deliveries.filter(d=>{
    if (filter === "active") return !["settled","cancelled"].includes(String(d.settlement_status || "")) && d.status !== "cancelled"
    if (filter === "settled") return d.settlement_status === "settled"
    if (filter === "out") return d.status === "out_for_delivery"
    if (filter === "delivered") return d.status === "delivered"
    return true
  }),[deliveries,filter])

  function printSlip(delivery) {
    if (!delivery) return
    const w = window.open("", "_blank", "width=420,height=720")
    if (!w) return alert("Please allow pop-ups to print the slip.")
    w.document.write(`<!doctype html><html><head><title>${delivery.slip_no || "Delivery Slip"}</title><style>body{font-family:Arial,sans-serif;padding:18px;color:#111}h2{margin:0 0 4px}.muted{color:#666;font-size:12px}.line{border-top:1px dashed #777;margin:12px 0}.row{display:flex;justify-content:space-between;gap:10px;margin:6px 0}.big{font-size:20px;font-weight:800}.items{margin:12px 0}.note{background:#f5f5f5;padding:8px;border-radius:6px;font-size:12px}@media print{button{display:none}}</style></head><body><h2>${delivery.order_mode === "takeaway" ? "TAKEAWAY SLIP" : "DELIVERY SLIP"}</h2><div class="muted">${delivery.slip_no || ""}</div><div class="line"></div><div><b>${delivery.customer_name || "Customer"}</b></div><div>${delivery.phone || ""}</div><div>${delivery.address || "Takeaway"}</div><div>${delivery.zone || ""}</div><div class="line"></div><div class="row"><span>Order</span><b>#${String(delivery.order_id || "").slice(0,8)}</b></div>${(delivery.items || []).map(i => `<div class="row"><span>${Number(i.quantity||0)} × ${i.item_name || "Item"}</span><b>${money(i.line_total ?? Number(i.unit_price||0)*Number(i.quantity||0))}</b></div>`).join("")}<div class="line"></div><div class="row"><span>Amount</span><b class="big">${money(delivery.expected_amount)}</b></div><div class="row"><span>Payment</span><b>${String(delivery.payment_method || "cash").toUpperCase()}</b></div><div class="row"><span>Rider</span><b>${delivery.rider_name || "Not assigned"}</b></div>${delivery.customer_notes ? `<div class="note">Note: ${delivery.customer_notes}</div>` : ""}<div class="line"></div><div class="muted">Generated ${new Date().toLocaleString("en-IN")}</div><script>window.onload=()=>{window.print();}</script></body></html>`)
    w.document.close()
  }

  async function settle() {
    if (!selected) return
    const total = Number(cash||0)+Number(upi||0)+Number(card||0)
    if (total <= 0) return alert("Enter the amount collected by the rider.")
    const result = await action({ action:"settle", delivery_id:selected.id, cash_collected:Number(cash||0), upi_collected:Number(upi||0), card_collected:Number(card||0) })
    if (result) { setCash(""); setUpi(""); setCard("") }
  }

  return <main className="deliveryPage">
    <section className="deliveryHero">
      <div><div className="eyebrow">DELIVERY CONTROL CENTER</div><h1>Delivery & Takeaway</h1><p>Issue slips, assign riders, track delivery and settle COD/UPI when the rider returns.</p></div>
      <div className="heroActions"><button className="ghostBtn" onClick={load}>↻ Refresh</button><a className="primaryBtn" href="/order">＋ New Order</a></div>
    </section>

    <section className="deliveryStats">
      <Stat label="Active" value={deliveries.filter(d=>!['settled','cancelled'].includes(d.settlement_status||'') && d.status!=='cancelled').length} />
      <Stat label="Out for delivery" value={deliveries.filter(d=>d.status==='out_for_delivery').length} />
      <Stat label="Delivered" value={deliveries.filter(d=>d.status==='delivered').length} />
      <Stat label="Settled" value={deliveries.filter(d=>d.settlement_status==='settled').length} />
    </section>

    <section className="deliveryLayout">
      <div className="panel deliveryListPanel">
        <div className="panelHeader"><div><h2>Delivery Queue</h2><span>{filtered.length} slips</span></div><div className="filters">{[["active","Active"],["out","Out"],["delivered","Delivered"],["settled","Settled"],["all","All"]].map(([v,l])=><button key={v} onClick={()=>setFilter(v)} className={filter===v?"filter active":"filter"}>{l}</button>)}</div></div>
        {loading ? <div className="empty">Loading delivery queue…</div> : !filtered.length ? <div className="empty">No delivery slips in this view.</div> : <div className="queue">{filtered.map(d=><button key={d.id} className={`deliveryRow ${selected?.id===d.id?"selected":""}`} onClick={()=>{setSelected(d);setRiderId(d.rider_id||"")}}><div className="slip"><b>{d.slip_no || "DELIVERY"}</b><small>{d.customer_name || "Customer"} • {d.phone || "No phone"}</small><small>{d.zone || d.address || "Address not set"}</small></div><div className="rowRight"><strong>{money(d.expected_amount)}</strong><span className={`status ${d.status}`}>{statusLabel(d.status)}</span><small>{d.settlement_status === "settled" ? "✓ Settled" : String(d.payment_method||"cash").toUpperCase()}</small></div></button>)}</div>}
      </div>

      <div className="panel detailPanel">
        {!selected ? <div className="empty bigEmpty"><div>🛵</div><h2>Select a delivery</h2><p>Create an order from POS, then manage its rider, status and settlement here.</p></div> : <>
          <div className="detailHeader"><div><div className="eyebrow">{selected.order_mode === "takeaway" ? "TAKEAWAY" : "DELIVERY"}</div><h2>{selected.slip_no || "Delivery"}</h2><p>{selected.customer_name} • {selected.phone || "No phone"}</p></div><button className="printBtn" onClick={()=>printSlip(selected)}>🖨 Print Slip</button></div>
          <div className="customerCard"><b>Address</b><span>{selected.address || "Takeaway / counter pickup"}</span>{selected.zone && <small>Zone: {selected.zone}</small>}{selected.customer_notes && <small>Note: {selected.customer_notes}</small>}</div>
          <div className="detailGrid">
            <div>{selected.order_mode === "takeaway" ? <><label>Pickup</label><strong>Counter pickup</strong><small>No rider assignment required.</small></> : <><label>Rider</label><select value={riderId} onChange={e=>setRiderId(e.target.value)}><option value="">Unassigned</option>{riders.filter(r=>r.active!==false).map(r=><option key={r.id} value={r.id}>{r.name} {r.phone?`• ${r.phone}`:""}</option>)}</select><button disabled={busy} onClick={()=>action({action:"assign",delivery_id:selected.id,rider_id:riderId||null})}>Assign Rider</button></>}</div>
            <div><label>Expected collection</label><strong className="amountBig">{money(selected.expected_amount)}</strong><small>{String(selected.payment_method||"cash").toUpperCase()} • {selected.settlement_status === "settled" ? "Settled" : "Pending settlement"}</small></div>
          </div>
          <div className="statusActions">{selected.order_mode === "takeaway" ? <><button disabled={busy} onClick={()=>action({action:"status",delivery_id:selected.id,status:"ready_for_pickup"})}>📦 Ready for Pickup</button><button disabled={busy} onClick={()=>action({action:"status",delivery_id:selected.id,status:"picked_up"})}>✓ Picked Up</button></> : <><button disabled={busy} onClick={()=>action({action:"status",delivery_id:selected.id,status:"out_for_delivery"})}>🛵 Out for Delivery</button><button disabled={busy} onClick={()=>action({action:"status",delivery_id:selected.id,status:"delivered"})}>✓ Delivered</button></>}<button disabled={busy} onClick={()=>action({action:"status",delivery_id:selected.id,status:"cancelled"})}>Cancel</button></div>
          <div className="settlement"><div><div className="eyebrow">RIDER SETTLEMENT</div><h3>Settle collected payment</h3><p>Enter what the rider actually brought back. Difference is recorded for reconciliation.</p></div><div className="settleGrid"><MoneyInput label="Cash" value={cash} setValue={setCash}/><MoneyInput label="UPI" value={upi} setValue={setUpi}/><MoneyInput label="Card" value={card} setValue={setCard}/></div><div className="settleFooter"><strong>Collected: {money(Number(cash||0)+Number(upi||0)+Number(card||0))}</strong><button disabled={busy || selected.settlement_status === "settled"} onClick={settle}>✓ Settle Rider</button></div></div>
          <div className="timeline"><b>Workflow</b><div><span className={selected.status!=="pending"?"done":""}>1. Slip issued</span><span className={selected.status === "assigned" || selected.status === "out_for_delivery" || selected.status === "delivered"?"done":""}>2. Rider assigned</span><span className={selected.status === "out_for_delivery" || selected.status === "delivered"?"done":""}>3. Out for delivery</span><span className={selected.status === "delivered"?"done":""}>4. Delivered</span><span className={selected.settlement_status === "settled"?"done":""}>5. Payment settled</span></div></div>
        </>}
      </div>
    </section>

    <style jsx>{`\n      .deliveryPage{min-height:100vh;padding:22px;background:linear-gradient(135deg,var(--background),var(--surface-2),var(--background));color:#fff}\n      .deliveryHero,.panel,.deliveryStats>div{background:rgba(var(--surface-2-rgb),.82);border:1px solid rgba(var(--primary-rgb),.15);border-radius:24px;box-shadow:0 20px 55px rgba(0,0,0,.3);backdrop-filter:blur(18px)}\n      .deliveryHero{padding:24px;display:flex;justify-content:space-between;gap:18px;align-items:center}.deliveryHero h1{margin:4px 0;font-size:34px}.deliveryHero p{margin:0;color:var(--muted);max-width:680px}.eyebrow{color:var(--primary);font-size:11px;font-weight:900;letter-spacing:1.7px}.heroActions{display:flex;gap:9px}.primaryBtn,.ghostBtn,.printBtn,.settleFooter button,.statusActions button,.detailGrid button{border-radius:12px;padding:11px 14px;border:1px solid rgba(var(--primary-rgb),.22);background:rgba(var(--primary-rgb),.1);color:#fff;font-weight:800;cursor:pointer;text-decoration:none}.primaryBtn{background:var(--primary);color:#111}.deliveryStats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0}.deliveryStats>div{padding:16px}.deliveryStats span{display:block;color:var(--muted);font-size:12px}.deliveryStats strong{display:block;font-size:25px;margin-top:4px}.deliveryLayout{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(360px,.9fr);gap:14px}.panel{padding:18px}.panelHeader,.detailHeader,.settleFooter{display:flex;justify-content:space-between;gap:12px;align-items:center}.panelHeader h2,.detailHeader h2{margin:0}.panelHeader span,.detailHeader p{color:var(--muted);font-size:12px}.filters{display:flex;gap:5px;overflow:auto}.filter{border:0;background:rgba(255,255,255,.04);color:var(--muted);padding:7px 9px;border-radius:9px;white-space:nowrap}.filter.active{background:rgba(var(--primary-rgb),.14);color:var(--primary)}.queue{display:grid;gap:7px;margin-top:14px;max-height:680px;overflow:auto}.deliveryRow{width:100%;display:flex;justify-content:space-between;gap:10px;text-align:left;padding:13px;border-radius:14px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.025);color:#fff;cursor:pointer}.deliveryRow.selected{border-color:var(--primary);background:rgba(var(--primary-rgb),.08)}.slip{min-width:0}.slip b,.slip small,.rowRight small{display:block}.slip small{color:var(--muted);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rowRight{text-align:right;display:grid;justify-items:end;gap:4px}.status{font-size:10px;padding:5px 8px;border-radius:999px;background:rgba(255,255,255,.07)}.status.out_for_delivery{color:#facc15}.status.delivered{color:#4ade80}.status.cancelled{color:#f87171}.rowRight small{color:var(--muted);font-size:10px}.empty{text-align:center;padding:50px 20px;color:var(--muted)}.bigEmpty div{font-size:42px}.customerCard{margin-top:15px;padding:13px;border-radius:14px;background:rgba(255,255,255,.035);display:grid;gap:5px}.customerCard span{font-size:13px;line-height:1.45}.customerCard small{color:var(--muted)}.detailGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.detailGrid>div{padding:12px;border-radius:14px;background:rgba(255,255,255,.03);display:grid;gap:7px}.detailGrid label{font-size:10px;color:var(--muted);text-transform:uppercase}.detailGrid select,.settleGrid input{width:100%;box-sizing:border-box;padding:10px;border-radius:10px;background:#10241c;color:#fff;border:1px solid rgba(255,255,255,.12)}.detailGrid button{padding:9px}.amountBig{font-size:25px}.statusActions{display:flex;gap:7px;margin-top:10px}.statusActions button{flex:1}.settlement{margin-top:14px;padding:15px;border-radius:17px;border:1px solid rgba(var(--primary-rgb),.16);background:rgba(var(--primary-rgb),.05)}.settlement h3{margin:3px 0}.settlement p{color:var(--muted);font-size:12px}.settleGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.settleGrid label{display:block;color:var(--muted);font-size:10px;margin-bottom:4px}.timeline{margin-top:14px;padding:13px;border-radius:14px;background:rgba(255,255,255,.025)}.timeline>div{display:grid;gap:6px;margin-top:8px}.timeline span{font-size:12px;color:var(--muted)}.timeline span.done{color:#4ade80}.timeline span.done:before{content:'✓ ';color:#4ade80}@media(max-width:900px){.deliveryPage{padding:12px}.deliveryHero{display:block}.heroActions{margin-top:12px}.deliveryStats{grid-template-columns:repeat(2,1fr)}.deliveryLayout{grid-template-columns:1fr}.detailPanel{order:-1}.deliveryHero h1{font-size:27px}}@media(max-width:560px){.deliveryStats{gap:7px}.deliveryStats>div{padding:12px}.deliveryStats strong{font-size:21px}.deliveryHero{padding:17px}.panel{padding:13px}.detailGrid,.settleGrid{grid-template-columns:1fr}.statusActions{display:grid;grid-template-columns:1fr}.filters{max-width:100%}}\n    `}</style>
  </main>
}

function Stat({label,value}){ return <div><span>{label}</span><strong>{value}</strong></div> }
function MoneyInput({label,value,setValue}){ return <label><span>{label}</span><input value={value} onChange={e=>setValue(e.target.value)} inputMode="decimal" placeholder="₹0" /></label> }
