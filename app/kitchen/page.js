"use client"
import { formatIndiaDateTime, formatIndiaTime } from "@/lib/indiaTime"

import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { printHtmlInFrame } from "@/lib/printUtils"
import { sendThermalPrint } from "@/lib/thermalPrintClient"

export default function KitchenPage() {

  const router = useRouter()
  const search = useSearchParams()
  const nextPath = search.get("next") || ""
  const focusOrderId = search.get("order_id") || ""
  const [orders, setOrders] = useState([])
  const [updatingOrderId, setUpdatingOrderId] = useState(null)
  const [updatingStatus, setUpdatingStatus] = useState(null)
  const [showHistory,setShowHistory] =
useState(false)

const [oldOrders,setOldOrders] =
useState([])
const [restaurantId,setRestaurantId] = useState(null)
const [restaurant,setRestaurant] = useState(null)
const [kotSize, setKotSize] = useState("A5")

  // Prevent an older background refresh from overwriting a newer KDS action.
  const fetchSequenceRef = useRef(0)

  useEffect(() => {
    let channel
    let fallbackTimer
    let refreshTimer

    async function init() {
        let user = null
      { const { data: userData } = await supabaseCloud.auth.getUser(); user = userData?.user || null }
      if (!user) return

      let profile = null
      { const result = await supabaseCloud.from("profiles").select("restaurant_id,role").eq("id", user.id).maybeSingle(); profile = result.data }

      // Older accounts can have restaurant_id only in auth metadata.
      // Prefer the profile row, but fall back to the trusted server-created metadata
      // value so KDS does not fail just because the legacy profile row was incomplete.
      const metadataRestaurantId = user.user_metadata?.restaurant_id || null
      const resolvedRestaurantId = profile?.restaurant_id || metadataRestaurantId

      if (!resolvedRestaurantId) return

      setRestaurantId(resolvedRestaurantId)
      const { data: restaurantRow } = await supabaseCloud
        .from("restaurants")
        .select("id,name,address,phone,gst_enabled,gst_number")
        .eq("id", resolvedRestaurantId)
        .maybeSingle()
      setRestaurant(restaurantRow || null)
      await fetchOrders(resolvedRestaurantId)

      channel = supabaseCloud
        .channel(`kitchen-${resolvedRestaurantId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${resolvedRestaurantId}` },
          () => {
            clearTimeout(refreshTimer)
            refreshTimer = setTimeout(
              () => fetchOrders(resolvedRestaurantId),
              350
            )
          }
        )
        .subscribe()

      fallbackTimer = setInterval(() => fetchOrders(resolvedRestaurantId), 30000)
    }

    init()

    return () => {
      if (fallbackTimer) clearInterval(fallbackTimer)
      clearTimeout(refreshTimer)
      if (channel) supabaseCloud.removeChannel(channel)
    }
  }, [])

  async function fetchOrders(rid = restaurantId) {
    const requestSequence = ++fetchSequenceRef.current

    try {
      const { data: sessionData } = await supabaseCloud.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) return

      const response = await fetch("/api/kitchen/orders", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to load kitchen orders")
      }

      // Ignore an older response if a newer refresh has already started.
      if (requestSequence !== fetchSequenceRef.current) {
        return
      }

      const final = result.orders || []

      // Kitchen status is the source of truth for Live vs History.
      // Never use calendar date for this decision: UTC/local timezone
      // differences can put a brand-new pending order in History.
      // A kitchen order is LIVE unless it has reached a terminal state.
      // This intentionally accepts statuses used by POS/QR/older orders
      // such as new, confirmed, received, accepted and queued.
      const terminalStatuses = new Set([
        "done",
        "completed",
        "complete",
        "cancelled",
        "canceled",
        "void",
        "voided",
        "refunded"
      ])

      const getOrderStatus = order =>
        String(order.status || "pending").trim().toLowerCase()

      const liveOrders = final
        .filter(order => !terminalStatuses.has(getOrderStatus(order)))
        .sort(
          (a,b) =>
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
        )

      const historyOrders = final
        .filter(order => terminalStatuses.has(getOrderStatus(order)))
        .sort(
          (a,b) =>
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
        )

      setOrders(liveOrders)
      setOldOrders(historyOrders)

      if (focusOrderId) {
        const focused = final.find(order => order.id === focusOrderId)
        if (focused && nextPath === "delivery" && focused.source_type === "delivery") {
          // Keep delivery order on KDS until it is marked done.
        }
      }
    } catch (error) {
      console.error("KITCHEN FETCH ERROR:", error)
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
  }

  function buildKotHtml(order, size = kotSize) {
    const width = size === "A5" ? "148mm" : size === "58mm" ? "58mm" : "80mm"
    const items = (order?.items || []).map(item => `
      <div class="item">
        <div class="row"><span>${escapeHtml(item.name)}</span><b>x${escapeHtml(item.quantity)}</b></div>
        ${item.cooking_request ? `<div class="note">${escapeHtml(item.cooking_request)}</div>` : ""}
      </div>
    `).join("")
    return `<!doctype html><html><head><meta charset="utf-8"><title>KOT ${escapeHtml(order?.display || order?.id)}</title>
      <style>
        @page{size:${size === "A5" ? "A5 portrait" : width};margin:0}
        *{box-sizing:border-box} body{font-family:Arial,sans-serif;color:#111;margin:0;padding:0;width:${width};min-width:${width};max-width:${width};min-height:${size === "A5" ? "210mm" : "auto"};font-size:${size === "A5" ? "13px" : "11px"}}
        .kot{padding:8px}.center{text-align:center}.title{font-size:20px;font-weight:900;letter-spacing:1px}.restaurant{font-size:16px;font-weight:900;margin-top:4px}.sub{font-size:11px;color:#555;margin-top:4px}.powered{font-size:8px;color:#777;text-align:center;margin-top:8px;letter-spacing:.2px}.line{border-top:1px dashed #111;margin:9px 0}.row{display:flex;justify-content:space-between;gap:8px;font-weight:800}.item{padding:6px 0;border-bottom:1px dotted #999}.note{font-size:10px;margin-top:3px}.foot{font-size:10px;margin-top:10px}
      </style></head><body><div class="kot">
      <div class="center"><div class="title">KITCHEN ORDER TICKET</div><div class="restaurant">${escapeHtml(restaurant?.name || "Restaurant")}</div><div class="sub">${escapeHtml(restaurant?.address || "")}${restaurant?.phone ? ` • ${escapeHtml(restaurant.phone)}` : ""}</div><div class="sub">${escapeHtml(order?.display || "Order")}</div></div>
      <div class="line"></div><div><b>Order:</b> ${escapeHtml(order?.display || order?.id)}</div><div><b>Time:</b> ${escapeHtml(order?.created_at ? formatIndiaDateTime(order.created_at) : "")}</div>
      <div class="line"></div>${items || "<div>No items</div>"}<div class="line"></div><div class="foot">KOT • ${escapeHtml(String(order?.id || "").slice(0,8))}</div><div class="powered">Powered by Anaira Graphics</div>
      </div><script>window.onload=()=>window.print()</script></body></html>`
  }

  async function printKotThermal(order) {
    if (!order) return
    const lines = [
      "KITCHEN ORDER TICKET",
      restaurant?.name || "Restaurant",
      restaurant?.address || "",
      order?.display || order?.id || "Order",
      "------------------------------",
      ...(order?.items || []).flatMap(item => [
        `${item.name || "Item"} x${item.quantity || 0}`,
        item.cooking_request ? `NOTE: ${item.cooking_request}` : null
      ].filter(Boolean)),
      "------------------------------",
      `KOT • ${String(order?.id || "").slice(0,8)}`
    ]
    try {
      await sendThermalPrint({ type: "kot", content: lines.join("\n"), data: { order_id: order.id, size: "80mm" } })
    } catch (e) { alert(e.message || "Thermal KOT print failed") }
  }

  async function printKot(order) {
    if (!order) return
    try {
      await printHtmlInFrame(buildKotHtml(order, kotSize).replace(/<script>window.onload=\(\)=>window.print\(\)<\/script>/, ""), { title: `KOT ${order?.display || order?.id || ""}`, width: kotSize === "A5" ? "148mm" : kotSize === "58mm" ? "58mm" : "80mm", height: kotSize === "A5" ? "210mm" : "auto" })
    } catch (e) { alert(e.message || "Unable to print KOT") }
  }

  function downloadKot(order) {
    if (!order) return
    const blob = new Blob([buildKotHtml(order, kotSize).replace('<script>window.onload=()=>window.print()</script>','')], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `KOT-${String(order.id || "order").slice(0,8)}-${kotSize}.html`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  async function updateStatus(id, status) {
    if (updatingOrderId) return

    const currentOrder = orders.find(order => order.id === id)

    // Delivery flow is intentionally unchanged.
    // Takeaway/table/room unlock Billing only after confirmed Mark Done.
    if (status === "done" && currentOrder?.source_type !== "delivery") {
      const confirmed = window.confirm(
        "Confirm Mark Done?\n\nThis order will now move to Billing."
      )
      if (!confirmed) return
    }

    setUpdatingOrderId(id)
    setUpdatingStatus(status)

    try {
      const { data: sessionData } = await supabaseCloud.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error("Login session expired")

      const response = await fetch("/api/kitchen/order-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ order_id: id, status }),
        cache: "no-store"
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to update order")
      }

      // Realtime already refreshes orders. Do not issue another GET here.
      // Invalidate older in-flight refreshes so stale data cannot restore
      // a completed/cancelled order to the Live list.
      const updatedOrder = {
        ...(currentOrder || {}),
        ...(result.order || {}),
        id,
        status
      }

      fetchSequenceRef.current += 1

      if (
        status === "preparing" &&
        currentOrder?.source_type === "delivery"
      ) {
        router.push(
          `/dashboard/delivery?order_id=${encodeURIComponent(id)}`
        )
        return
      }

      if (status === "done" || status === "cancelled") {
        setOrders(prev =>
          prev.filter(order => order.id !== id)
        )

        setOldOrders(prev => [
          updatedOrder,
          ...prev.filter(order => order.id !== id)
        ])

        if (
          status === "done" &&
          currentOrder?.source_type === "delivery"
        ) {
          // Existing delivery workflow: unchanged.
          router.push(
            `/dashboard/delivery?order_id=${encodeURIComponent(id)}`
          )
        } else if (
          status === "done" &&
          currentOrder?.source_type !== "delivery"
        ) {
          router.push("/billing")
          return
        }
      } else {
        setOrders(prev => {
          const exists = prev.some(order => order.id === id)

          if (!exists) {
            return [updatedOrder, ...prev]
          }

          return prev.map(order =>
            order.id === id
              ? { ...order, ...updatedOrder }
              : order
          )
        })
      }
    } catch (error) {
      console.error(error)
      alert(error instanceof Error ? error.message : "Unable to update order")
    } finally {
      setUpdatingOrderId(null)
      setUpdatingStatus(null)
    }
  }

  return (
    <>
    <style jsx global>{`
  .kitchen-page{font-family:var(--font-sans,Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif)}
  .kitchen-page button,.kitchen-page select{font:inherit}
  .kitchen-page .kds-hero{position:relative;overflow:hidden}
  .kitchen-page .kds-hero:after{
    content:"";position:absolute;inset:auto -10% -70% 40%;height:220px;
    background:radial-gradient(circle,rgba(var(--primary-rgb),.12),transparent 65%);
    pointer-events:none
  }
  .kitchen-page .kds-action-btn:hover:not(:disabled){
    transform:translateY(-1px);box-shadow:0 8px 20px rgba(0,0,0,.10)
  }
  .kitchen-page .kds-action-btn:active:not(:disabled){transform:translateY(0)}
  .kitchen-page .kds-action-btn:disabled{
    opacity:.62!important;cursor:wait!important;transform:none!important;box-shadow:none!important
  }
  .kitchen-page .kds-items::-webkit-scrollbar,
  .kitchen-page .kds-history-grid::-webkit-scrollbar{width:7px}
  .kitchen-page .kds-items::-webkit-scrollbar-thumb,
  .kitchen-page .kds-history-grid::-webkit-scrollbar-thumb{
    background:rgba(var(--primary-rgb),.22);border-radius:999px
  }
  .kitchen-page .kds-items::-webkit-scrollbar-track,
  .kitchen-page .kds-history-grid::-webkit-scrollbar-track{background:transparent}
  .kitchen-page .kds-card{
    position:relative;
    overflow:hidden;
  }
  .kitchen-page .kds-card:before{
    content:"";
    position:absolute;
    left:0;
    top:0;
    bottom:0;
    width:4px;
    border-radius:22px 0 0 22px;
    background:var(--primary);
    opacity:.72;
    pointer-events:none;
  }
  .kitchen-page .kds-card > *{position:relative;z-index:1}
  .kitchen-page .kds-card h3{
    margin:0;
    line-height:1.2;
    letter-spacing:-.2px;
  }
  .kitchen-page .kds-card .kds-items{
    margin-left:0;
    margin-right:0;
  }
  .kitchen-page .kds-card .kds-actions{
    align-items:stretch;
  }
  .kitchen-page .kds-card .kds-actions button{
    min-width:0;
    width:100%;
  }
  .kitchen-page .kds-card .kds-action-btn{
    min-height:48px;
    height:48px;
    width:100%;
    padding:8px 6px;
    border-radius:12px;
    font-size:12px;
    line-height:1;
    letter-spacing:.1px;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
    display:flex;
    align-items:center;
    justify-content:center;
    text-align:center;
  }
  .kitchen-page .kds-card .kds-actions{
    display:grid!important;
    grid-template-columns:repeat(3,minmax(0,1fr))!important;
    gap:8px!important;
    width:100%!important;
    align-items:stretch!important;
  }
  .kitchen-page .kds-card .kds-actions > button{
    min-width:0!important;
    width:100%!important;
    margin:0!important;
  }
  .kitchen-page .kds-card .kds-order-meta{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
    flex-wrap:wrap;
    margin-top:8px;
  }
  .kitchen-page .kds-card .kds-order-meta > *{
    min-width:0;
  }
  .kitchen-page .kds-card .kds-new-order{
    display:inline-flex;
    align-items:center;
    gap:7px;
    padding:6px 9px;
    border-radius:999px;
    background:rgba(var(--primary-rgb),.10);
    border:1px solid rgba(var(--primary-rgb),.22);
    color:var(--primary);
    font-size:10px;
    font-weight:900;
    letter-spacing:.45px;
    text-transform:uppercase;
  }
  .kitchen-page .kds-card .kds-new-order-dot{
    width:7px;
    height:7px;
    border-radius:50%;
    background:var(--primary);
    box-shadow:0 0 0 4px rgba(var(--primary-rgb),.10);
  }
  .kitchen-page .kds-card .kds-order-title{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    min-width:0;
  }
  .kitchen-page .kds-card .kds-order-title > *{
    min-width:0;
  }
  .kitchen-page .kds-card .kds-order-title h3,
  .kitchen-page .kds-card .kds-order-title strong{
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
  }
  .kitchen-page .kds-card .kds-status-row{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
    flex-wrap:wrap;
    margin-top:10px;
  }
  .kitchen-page .kds-card .kds-status-row .kds-time{
    margin-left:auto;
    font-size:11px;
    opacity:.58;
    white-space:nowrap;
  }
  .kitchen-page .kds-history-card{transition:transform .2s ease,box-shadow .2s ease}
  .kitchen-page .kds-history-card:hover{
    transform:translateY(-2px);box-shadow:0 16px 38px rgba(0,0,0,.12)!important
  }
  .kitchen-page select:focus,.kitchen-page button:focus-visible{
    outline:2px solid rgba(var(--primary-rgb),.45);outline-offset:2px
  }
  @media(max-width:1050px){
    .kds-actions{grid-template-columns:repeat(3,minmax(0,1fr))!important}
    .kds-history-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  }
  @media(min-width:1051px){
    .kitchen-page .kds-card:hover{
      transform:translateY(-2px);
      box-shadow:0 18px 42px rgba(0,0,0,.13);
    }
  }
  @media(max-width:700px){
    .kds-page,.kitchen-page{padding:12px!important}
    .kds-hero{padding:18px!important;margin-bottom:16px!important;border-radius:20px!important}
    .kds-hero h1{font-size:30px!important}
    .kds-history-grid{grid-template-columns:1fr!important;padding:6px 0!important;gap:12px!important}
    .kds-card{min-height:0!important;padding:16px!important}
    .kds-actions{
      grid-template-columns:repeat(3,minmax(0,1fr))!important;
      gap:7px!important;
    }
    .kds-actions .kds-action-btn{
      min-height:44px!important;
      height:44px!important;
      font-size:11px!important;
      padding:0 4px!important;
      white-space:nowrap!important;
    }
    .kitchen-page .kds-card .kds-actions{
      grid-template-columns:repeat(3,minmax(0,1fr))!important;
      gap:7px!important;
    }
    .kds-history-card{width:100%!important;height:auto!important;min-height:280px!important;padding:18px!important}
    .kds-items{max-height:none!important}
  }
`}</style>

      <div style={container} className="kitchen-page">

      <div className="kds-hero" style={hero}>

  <div>

    <div
      style={{
        color:"var(--primary)",
        letterSpacing:2,
        fontSize:14
      }}
    >
      PREMIUM KITCHEN
    </div>

    <h1
      style={{
        marginTop:10,
        marginBottom:8,
        fontSize:38
      }}
    >
      Kitchen Dashboard
    </h1>

    <p
      style={{
        color:"var(--muted)"
      }}
    >
      Manage live restaurant orders
    </p>

  </div>

  <div
    style={{
      display:"flex",
      alignItems:"center",
      gap:6,
      padding:5,
      borderRadius:14,
      background:"var(--surface-2)",
      border:"1px solid var(--border)",
      flexWrap:"wrap"
    }}
  >
    <button
      style={{
        ...historyBtn,
        background: !showHistory ? "var(--primary)" : "transparent",
        color: !showHistory ? "#111" : "var(--text)",
        boxShadow:"none"
      }}
      onClick={() => setShowHistory(false)}
    >
      Live Orders
    </button>

    <button
      style={{
        ...historyBtn,
        background: showHistory ? "var(--primary)" : "transparent",
        color: showHistory ? "#111" : "var(--text)",
        boxShadow:"none"
      }}
      onClick={() => setShowHistory(true)}
    >
      Order History
    </button>
  </div>

</div>

      {!showHistory && orders.length === 0 && (
        <div style={emptyState}>
          <div style={{fontSize:32}}>🍳</div>
          <strong>No New Orders</strong>
          <div style={{color:"var(--muted)",marginTop:5,fontSize:13}}>
            New POS and QR orders will appear here automatically.
          </div>
        </div>
      )}

      {!showHistory && <div style={grid}>
        {orders.map(order => (

          <div
  key={order.id}
  style={{
    ...card(order.status),
    transform:
      "translateY(0)"
  }}
>
            {/* TOP */}
            <div style={topRow}>
              <div>

  <div
    style={{
      color:"var(--primary)",
      fontSize:11,
      letterSpacing:1.5,
      marginBottom:4
    }}
  >
    ORDER
  </div>

  <h3>
    {order.display}
  </h3>

</div>
              <span style={time}>
                {formatIndiaTime(order.created_at)}
              </span>
            </div>
            {order.overall_note && (
  <div style={orderNote}>
    📌 {order.overall_note}
  </div>
)}

            {/* ITEMS */}
            <div className="kds-items" style={itemsBox}>
              {order.overall_note && (
  <div style={orderNote}>
    📌 {order.overall_note}
  </div>
)}
              {order.items?.map((item, i) => (

  <div key={i}>

    <div style={itemRow}>
      <span>{item.name}</span>
      <b>× {item.quantity}</b>
    </div>

    {item.cooking_request && (
      <div style={cookingNote}>
        🍳 {item.cooking_request}
      </div>
    )}

  </div>

))}
            </div>

            {/* STATUS */}
            <div style={status(order.status)}>
              {order.status.toUpperCase()}
            </div>

            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:12,padding:10,borderRadius:12,background:"var(--surface-2)",border:"1px solid var(--border)"}}>
              <strong style={{fontSize:12}}>KOT</strong>
              <select value={kotSize} onChange={e=>setKotSize(e.target.value)} style={{padding:"7px 9px",borderRadius:8,border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text)"}}>
                <option>A5</option><option>58mm</option><option>80mm</option>
              </select>
              <button type="button" onClick={()=>printKot(order)} style={{padding:"7px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text)",cursor:"pointer"}}>🖨 Print KOT</button>
              <button type="button" onClick={()=>printKotThermal(order)} style={{padding:"7px 10px",borderRadius:8,border:"1px solid var(--primary)",background:"var(--primary)",color:"#111",cursor:"pointer",fontWeight:800}}>🖨 Thermal 80mm</button>
              <button type="button" onClick={()=>downloadKot(order)} style={{padding:"7px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text)",cursor:"pointer"}}>⬇ Download KOT</button>
            </div>

            {/* ACTION */}
            <div className="kds-actions" style={actions}>
              <button
                className="kds-action-btn"
                style={btnBlue}
                onClick={() => updateStatus(order.id, "preparing")}
                disabled={updatingOrderId === order.id}
              >
                {updatingOrderId === order.id && updatingStatus === "preparing" ? "Saving…" : "Start Preparing"}
              </button>

              <button
                className="kds-action-btn"
                style={btnGreen}
                onClick={() => updateStatus(order.id, "done")}
                disabled={updatingOrderId === order.id}
              >
                {updatingOrderId === order.id && updatingStatus === "done" ? "Saving…" : "Mark Done"}
              </button>
              <button
                className="kds-action-btn"
                style={btnRed}
                onClick={() => updateStatus(order.id, "cancelled")}
                disabled={updatingOrderId === order.id}
              >
                Cancel
              </button>
            </div>
            

          </div>

        ))}
        </div>}
        {showHistory && (

<div
  style={{
    marginTop:40
  }}
>

  <h2
  style={{
    fontSize:28,
    fontWeight:800,
    marginBottom:20,
    color:"var(--primary)",
    letterSpacing:1,
    textShadow:
      "0 0 20px rgba(var(--primary-rgb),.35)"
  }}
>
📜 Order Archive
</h2>

  <div className="kds-history-grid" style={historyGrid}>

    {oldOrders.map(order => (

  <div
  key={order.id}
  className="kds-history-card" style={historyCard(order.status)}
>
<div style={topRow}>

      <div>

        <h3
          style={{
            marginBottom:6
          }}
        >
          {order.display}
        </h3>

        <div
          style={{
            color:"var(--muted)",
            fontSize:12
          }}
        >
          {formatIndiaDateTime(order.created_at)}
        </div>

      </div>

      <div
        style={status(order.status)}
      >
        {order.status}
      </div>

    </div>

    <div className="kds-items" style={itemsBox}>

      {order.items?.map((item,i) => (

  <div key={i}>

    <div style={itemRow}>
      <span>{item.name}</span>
      <b>× {item.quantity}</b>
    </div>

    {item.cooking_request && (
      <div style={cookingNote}>
        🍳 {item.cooking_request}
      </div>
    )}

  </div>

))}
    </div>

   

  </div>

))}
  </div>

</div>

)}
      </div>
    </>

    
  )
}

//
// 🎨 PRO THEME-BASED UI STYLES
// NOTE: This section contains styling only. All application logic above remains unchanged.

const emptyState = {
  maxWidth: 560,
  margin: "32px auto",
  padding: "38px 24px",
  textAlign: "center",
  borderRadius: 22,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  boxShadow: "0 14px 40px rgba(0,0,0,.08)"
}

const container = {
  padding: "clamp(14px, 2.2vw, 30px)",
  minHeight: "100vh",
  background: "var(--background)",
  color: "var(--text)",
  transition: "background .25s ease,color .25s ease"
}

const title = {
  textAlign: "center",
  fontSize: 30,
  marginBottom: 20,
  color: "var(--text)"
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))",
  gap: 18
}

const card = (status) => ({
  padding: "clamp(16px,1.5vw,22px)",
  borderRadius: 22,
  background: "var(--surface)",
  border:
    status === "pending"
      ? "1px solid rgba(var(--primary-rgb),.34)"
      : status === "preparing"
      ? "1px solid rgba(var(--info-rgb),.34)"
      : status === "done"
      ? "1px solid rgba(var(--success-rgb),.28)"
      : "1px solid rgba(var(--danger-rgb),.28)",
  cursor: "default",
  backdropFilter: "blur(18px)",
  minHeight: 280,
  boxShadow: "0 12px 35px rgba(0,0,0,.10),0 2px 8px rgba(0,0,0,.05)",
  transition: "transform .2s ease,box-shadow .2s ease,border-color .2s ease"
})

const topRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 10
}

const time = {
  fontSize: 12,
  opacity: 0.62,
  whiteSpace: "nowrap"
}

const itemsBox = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 10,
  marginTop: 14,
  marginBottom: 14,
  maxHeight: 145,
  overflowY: "auto"
}

const itemRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "10px 11px",
  marginBottom: 7,
  borderRadius: 12,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--text)"
}

const cookingNote = {
  marginTop: 4,
  marginBottom: 8,
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(var(--primary-rgb),.08)",
  border: "1px solid rgba(var(--primary-rgb),.20)",
  color: "var(--primary)",
  fontSize: 12,
  lineHeight: 1.45
}

const orderNote = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(var(--info-rgb),.08)",
  border: "1px solid rgba(var(--info-rgb),.20)",
  color: "var(--info)",
  fontSize: 13,
  lineHeight: 1.45
}

const status = (s) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  alignSelf: "flex-start",
  maxWidth: "100%",
  minWidth: 0,
  padding: "7px 12px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 850,
  textTransform: "uppercase",
  letterSpacing: ".5px",
  color:
    s === "pending"
      ? "var(--primary)"
      : s === "preparing"
      ? "var(--info)"
      : s === "done"
      ? "var(--success)"
      : "var(--danger)",
  background:
    s === "pending"
      ? "rgba(var(--primary-rgb),.10)"
      : s === "preparing"
      ? "rgba(var(--info-rgb),.10)"
      : s === "done"
      ? "rgba(var(--success-rgb),.10)"
      : "rgba(var(--danger-rgb),.10)",
  border:
    s === "pending"
      ? "1px solid rgba(var(--primary-rgb),.20)"
      : s === "preparing"
      ? "1px solid rgba(var(--info-rgb),.20)"
      : s === "done"
      ? "1px solid rgba(var(--success-rgb),.20)"
      : "1px solid rgba(var(--danger-rgb),.20)"
})

const actions = {
  display: "grid",
  gridTemplateColumns: "repeat(3,minmax(0,1fr))",
  gap: 9,
  marginTop: 16
}

const btnBlue = {
  flex: 1,
  minHeight: 46,
  height: "auto",
  padding: "0 8px",
  minWidth: 0,
  width: "100%",
  height: 48,
  borderRadius: 12,
  border: "1px solid rgba(var(--info-rgb),.40)",
  background: "rgba(var(--info-rgb),.07)",
  color: "var(--info)",
  fontWeight: 800,
  fontSize: 12.5,
  lineHeight: 1,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  wordBreak: "normal",
  overflowWrap: "normal",
  textAlign: "center",
  cursor: "pointer",
  transition: "transform .18s ease,box-shadow .18s ease,background .18s ease"
}

const btnGreen = {
  flex: 1,
  minHeight: 46,
  height: "auto",
  padding: "0 8px",
  minWidth: 0,
  width: "100%",
  height: 48,
  borderRadius: 12,
  border: "1px solid rgba(var(--primary-rgb),.42)",
  background: "rgba(var(--primary-rgb),.08)",
  color: "var(--primary)",
  fontWeight: 800,
  fontSize: 12.5,
  lineHeight: 1,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  wordBreak: "normal",
  overflowWrap: "normal",
  textAlign: "center",
  cursor: "pointer",
  transition: "transform .18s ease,box-shadow .18s ease,background .18s ease"
}

const btnRed = {
  flex: 1,
  minHeight: 46,
  height: "auto",
  padding: "0 8px",
  minWidth: 0,
  width: "100%",
  height: 48,
  borderRadius: 12,
  border: "1px solid rgba(var(--danger-rgb),.38)",
  background: "rgba(var(--danger-rgb),.07)",
  color: "var(--danger)",
  fontWeight: 800,
  fontSize: 12.5,
  lineHeight: 1,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  wordBreak: "normal",
  overflowWrap: "normal",
  textAlign: "center",
  cursor: "pointer",
  transition: "transform .18s ease,box-shadow .18s ease,background .18s ease"
}

const hero = {
  marginBottom: 24,
  padding: "clamp(20px,2.5vw,30px)",
  borderRadius: 24,
  background: "linear-gradient(135deg,var(--surface),var(--surface-2))",
  border: "1px solid var(--border)",
  boxShadow: "0 16px 45px rgba(0,0,0,.10)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 18,
  flexWrap: "wrap"
}

const historyBtn = {
  padding: "11px 17px",
  borderRadius: 11,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  transition: "all .18s ease"
}

const historyGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))",
  justifyContent: "space-between",
  columnGap: 18,
  rowGap: 18,
  padding: "8px 0",
  maxHeight: "700px",
  overflowY: "auto",
  overflowX: "hidden",
  marginTop: 16
}

const historyCard = (status) => ({
  width: "100%",
  height: 300,
  padding: 20,
  borderRadius: 22,
  overflow: "hidden",
  position: "relative",
  background: "var(--surface)",
  border:
    status === "done"
      ? "1px solid rgba(var(--success-rgb),.28)"
      : "1px solid rgba(var(--danger-rgb),.24)",
  boxShadow: "0 12px 34px rgba(0,0,0,.09)",
  backdropFilter: "blur(18px)"
})
