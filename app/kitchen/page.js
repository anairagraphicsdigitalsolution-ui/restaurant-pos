"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function KitchenPage() {

  const [orders, setOrders] = useState([])
  const [updatingOrderId, setUpdatingOrderId] = useState(null)
  const [updatingStatus, setUpdatingStatus] = useState(null)
  const [showHistory,setShowHistory] =
useState(false)

const [oldOrders,setOldOrders] =
useState([])
const [restaurantId,setRestaurantId] = useState(null)

  useEffect(() => {
    let channel
    let fallbackTimer

    async function init() {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user) return

      const { data: profile } = await supabase
        .from("profiles")
        .select("restaurant_id,role")
        .eq("id", userData.user.id)
        .maybeSingle()

      // Older accounts can have restaurant_id only in auth metadata.
      // Prefer the profile row, but fall back to the trusted server-created metadata
      // value so KDS does not fail just because the legacy profile row was incomplete.
      const metadataRestaurantId = userData.user.user_metadata?.restaurant_id || null
      const resolvedRestaurantId = profile?.restaurant_id || metadataRestaurantId

      if (!resolvedRestaurantId) return

      setRestaurantId(resolvedRestaurantId)
      await fetchOrders(resolvedRestaurantId)

      channel = supabase
        .channel(`kitchen-${profile.restaurant_id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${profile.restaurant_id}` },
          () => fetchOrders(profile.restaurant_id)
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "order_items" },
          () => fetchOrders(profile.restaurant_id)
        )
        .subscribe()

      fallbackTimer = setInterval(() => fetchOrders(profile.restaurant_id), 15000)
    }

    init()

    return () => {
      if (fallbackTimer) clearInterval(fallbackTimer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  async function fetchOrders(rid = restaurantId) {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
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
    } catch (error) {
      console.error("KITCHEN FETCH ERROR:", error)
    }
  }

  async function updateStatus(id, status) {
    if (updatingOrderId) return

    setUpdatingOrderId(id)
    setUpdatingStatus(status)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error("Login session expired")

      const response = await fetch("/api/kitchen/order-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ order_id: id, status })
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to update order")
      }

      await fetchOrders()
    } catch (error) {
      console.error(error)
      alert(error.message || "Unable to update order")
    } finally {
      setUpdatingOrderId(null)
      setUpdatingStatus(null)
    }
  }

  return (
    <>
    <style jsx global>{`
.kds-actions button:disabled{opacity:.62!important;cursor:wait!important;transform:none!important;box-shadow:none!important}
@media(max-width:1050px){.kds-history-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}.kds-actions{grid-template-columns:1fr 1fr!important}}
@media(max-width:700px){.kds-page{padding:12px!important}.kds-hero{padding:18px!important;margin-bottom:16px!important}.kds-history-grid{grid-template-columns:1fr!important;padding:10px 0!important;gap:12px!important}.kds-card{min-height:0!important;padding:18px!important}.kds-actions{grid-template-columns:1fr!important}.kds-history-card{width:100%!important;height:auto!important;padding:18px!important}.kds-items{max-height:none!important}}
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
                {new Date(order.created_at).toLocaleTimeString()}
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

            {/* ACTION */}
            <div className="kds-actions" style={actions}>
              <button
  style={btnBlue}
  onMouseEnter={(e)=>{
    e.currentTarget.style.transform="translateY(-4px)"
    e.currentTarget.style.boxShadow="0 15px 35px rgb(0, 41, 65)"
    e.currentTarget.style.background="rgb(0, 0, 0)"
  }}
  onMouseLeave={(e)=>{
    e.currentTarget.style.transform="translateY(0)"
    e.currentTarget.style.boxShadow="none"
    e.currentTarget.style.background="transparent"
  }}
  onClick={() => updateStatus(order.id, "preparing")}
  disabled={updatingOrderId === order.id}
>
                {updatingOrderId === order.id && updatingStatus === "preparing"
                  ? "Saving…"
                  : "Start Preparing"}
              </button>

              <button
  style={btnGreen}
  onMouseEnter={(e)=>{
    e.currentTarget.style.transform="translateY(-4px)"
    e.currentTarget.style.boxShadow="0 15px 35px rgba(133, 102, 3, 0.45)"
    e.currentTarget.style.background="rgb(0, 0, 0)"
  }}
  onMouseLeave={(e)=>{
    e.currentTarget.style.transform="translateY(0)"
    e.currentTarget.style.boxShadow="none"
    e.currentTarget.style.background="transparent"
  }}
                onClick={() => updateStatus(order.id, "done")}
                disabled={updatingOrderId === order.id}
              >
                {updatingOrderId === order.id && updatingStatus === "done"
                  ? "Saving…"
                  : "Mark Done"}
              </button>
              <button
  style={btnRed}
  onMouseEnter={(e)=>{
    e.currentTarget.style.transform="translateY(-4px)"
    e.currentTarget.style.boxShadow="0 15px 35px rgba(110, 0, 0, 0.4)"
    e.currentTarget.style.background="rgb(0, 0, 0)"
  }}
  onMouseLeave={(e)=>{
    e.currentTarget.style.transform="translateY(0)"
    e.currentTarget.style.boxShadow="none"
    e.currentTarget.style.background="transparent"
  }}
  onClick={() =>
    updateStatus(
      order.id,
      "cancelled"
    )
  }
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
          {new Date(
            order.created_at
          ).toLocaleString()}
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
// 🎨 NEON UI STYLES
//

const emptyState = {
  maxWidth:520,
  margin:"30px auto",
  padding:"32px 22px",
  textAlign:"center",
  borderRadius:22,
  background:"var(--surface)",
  border:"1px solid var(--border)",
  color:"var(--text)",
  boxShadow:"0 12px 35px rgba(0,0,0,.08)"
}

const container = {
  padding: 25,
  minHeight: "100vh",
  background: "radial-gradient(circle at top,var(--background),#000)",
  color: "#fff"
}

const title = {
  textAlign: "center",
  fontSize: 30,
  marginBottom: 20,
  background: "linear-gradient(90deg,var(--success),var(--info),var(--accent))",
  WebkitBackgroundClip: "text",
  color: "transparent"
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))",
  gap: 20
}

const card = (status) => ({

  padding:20,

  borderRadius:26,

  background:
    "linear-gradient(145deg,var(--surface-2),var(--surface-2))",

  border:
    "1px solid rgba(var(--primary-rgb),.15)",
    cursor:"pointer",

  backdropFilter:"blur(20px)",

  minHeight:280,

  boxShadow:

    status==="pending"

      ? `
        0 15px 35px rgba(0,0,0,.45),
        0 0 25px rgba(var(--primary-rgb),.25)
      `

    : status==="preparing"

      ? `
        0 15px 35px rgba(0,0,0,.45),
        0 0 25px rgba(var(--info-rgb),.25)
      `

    : status==="done"

      ? `
        0 15px 35px rgba(0,0,0,.45),
        0 0 25px rgba(var(--success-rgb),.25)
      `

    : `
        0 15px 35px rgba(0,0,0,.45),
        0 0 25px rgba(var(--danger-rgb),.25)
      `,

  transition:"all .3s ease"
})
const topRow = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: 10
}

const time = {
  fontSize: 12,
  opacity: 0.6
}

const itemsBox = {

  background:
    "rgba(255,255,255,.025)",

  border:
    "1px solid rgba(255,255,255,.06)",

  borderRadius:18,

  padding:14,

  marginTop:14,

  marginBottom:14,

  maxHeight:110,

  overflowY:"auto"
  
}
const itemRow = {

  display:"flex",

  justifyContent:"space-between",

  alignItems:"center",

  padding:"8px 10px",

  marginBottom:8,

  borderRadius:10,

  background:
    "rgba(255,255,255,.03)"
}
const cookingNote = {

  marginTop:4,

  marginBottom:8,

  padding:"8px 10px",

  borderRadius:10,

  background:
    "rgba(var(--primary-rgb),.08)",

  border:
    "1px solid rgba(var(--primary-rgb),.2)",

  color:"var(--primary)",

  fontSize:12,

  lineHeight:1.4
}
const orderNote = {

  marginTop:10,

  padding:"10px 12px",

  borderRadius:12,

  background:
    "rgba(var(--info-rgb),.08)",

  border:
    "1px solid rgba(var(--info-rgb),.2)",

  color:"#93c5fd",

  fontSize:13
}

const status = (s) => ({

  padding:"8px 14px",

  borderRadius:999,

  fontSize:12,

  fontWeight:700,

  textTransform:"uppercase",

  
  color:
    s==="pending"
      ? "var(--primary)"
    : s==="preparing"
      ? "var(--info)"
    : s==="done"
      ? "var(--primary)"
      : "#fb7185",

  
})

const actions = {

  display:"grid",

  gridTemplateColumns:
    "repeat(3,1fr)",

  gap:8,

  marginTop:16
}

const btnBlue = {

  flex:1,

  height:44,

  borderRadius:14,

  border:
    "2px solid rgba(95, 153, 245, 0.4)",

  background:"transparent",

  color:"#69aafa",

  fontWeight:600,

  cursor:"pointer",

  transition:"all .25s ease"
}
const btnGreen = {

  flex:1,

  height:44,

  borderRadius:14,

  border:
    "1px solid rgba(var(--primary-rgb),.4)",

  background:"transparent",

  color:"var(--primary)",

  fontWeight:600,

  cursor:"pointer",

  transition:"all .25s ease"
}
const hero = {

  marginBottom:30,

  padding:30,

  borderRadius:30,

  background:
    "linear-gradient(135deg,var(--surface),var(--surface-2))",

  border:
    "1px solid rgba(var(--primary-rgb),.25)",

  boxShadow:
    "0 25px 60px rgba(0,0,0,.45)",

  display:"flex",

  justifyContent:"space-between",

  alignItems:"center",

  flexWrap:"wrap"
}
const historyBtn = {

  padding:"14px 28px",

  borderRadius:16,

  border:
    "1px solid rgba(var(--primary-rgb),.35)",

  background:
    "linear-gradient(135deg,rgba(var(--primary-rgb),.12),rgba(var(--warning-rgb),.12))",

  color:"var(--primary)",

  fontWeight:700,

  cursor:"pointer",

  boxShadow:
    "0 10px 30px rgba(var(--primary-rgb),.15)"
}
const btnRed = {

  flex:1,

  height:44,

  borderRadius:14,

  border:
    "1px solid rgba(var(--danger-rgb),.4)",

  background:"transparent",

  color:"var(--danger)",

  fontWeight:600,

  cursor:"pointer",

  transition:"all .25s ease"
}
const historyGrid = {

  display:"grid",

  gridTemplateColumns:
    "repeat(auto-fill,minmax(280px,1fr))",

  justifyContent:"space-between",

  columnGap:30,

  rowGap:30,

  padding:"20px 30px",

  maxHeight:"700px",

  overflowY:"auto",

  overflowX:"hidden",

  marginTop:20
}
const historyCard = (status) => ({

  width:"100%",

  height:300,

  padding:26,

  borderRadius:30,

  overflow:"hidden",

  position:"relative",

  background:
    "linear-gradient(145deg,var(--surface-2),var(--surface-2))",
    

  border:
    status === "done"
      ? "1px solid rgba(212,175,55,.35)"
      : "1px solid rgba(var(--danger-rgb),.25)",

  boxShadow:
    status === "done"
      ? `
        0 20px 50px rgba(0,0,0,.55),
        0 0 30px rgba(212,175,55,.18)
      `
      : `
        0 20px 50px rgba(0,0,0,.55),
        0 0 25px rgba(var(--danger-rgb),.15)
      `,

  backdropFilter:"blur(24px)"
})