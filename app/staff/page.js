"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import OrderPage from "../order/page"

export default function StaffPage(){

  const [restaurantId,setRestaurantId] = useState(null)
  const [orders,setOrders] = useState([])
  const [activeTab,setActiveTab] = useState("orders")

  useEffect(()=>{
    init()
  },[])

  async function init(){

    const { data: userData } = await supabase.auth.getUser()

    if(!userData?.user){
      alert("Login required")
      return
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("restaurant_id")
      .eq("id", userData.user.id)
      .single()

    if(!profile?.restaurant_id){
      alert("Restaurant not linked ❌")
      return
    }

    setRestaurantId(profile.restaurant_id)
    loadOrders(profile.restaurant_id)
  }

  async function loadOrders(id){
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", id)
      .order("created_at",{ascending:false})

    setOrders(data || [])
  }

  async function updateStatus(order,status){
    await supabase
      .from("orders")
      .update({status})
      .eq("id", order.id)

    loadOrders(restaurantId)
  }

  return (
    <div style={layout}>

      <h1 style={title}>👨‍🍳 Staff Panel</h1>

      {/* 🔥 TABS */}
      <div style={tabs}>
        <button
          onClick={()=>setActiveTab("orders")}
          style={tabBtn(activeTab==="orders","#3b82f6")}
        >
          Orders
        </button>

        <button
          onClick={()=>setActiveTab("take")}
          style={tabBtn(activeTab==="take","#22c55e")}
        >
          Take Order
        </button>
      </div>

      {/* ORDER PAGE */}
      {activeTab==="take" && <OrderPage />}

      {/* ORDERS */}
      {activeTab==="orders" && (
        <div style={grid}>

          {orders.map(o=>(
            <div key={o.id} style={card}>

              <h3>#{o.id.slice(0,6)}</h3>
              <p>Table {o.table_number || "-"}</p>

              <p style={statusStyle(o.status)}>
                {o.status}
              </p>

              <div style={actions}>

                <button
                  onClick={()=>updateStatus(o,"preparing")}
                  style={outlineBtn("#3b82f6")}
                >
                  Preparing
                </button>

                <button
                  onClick={()=>updateStatus(o,"ready")}
                  style={outlineBtn("#22c55e")}
                >
                  Ready
                </button>

                <button
                  onClick={()=>updateStatus(o,"done")}
                  style={outlineBtn("#64748b")}
                >
                  Done
                </button>

              </div>

            </div>
          ))}

        </div>
      )}

    </div>
  )
}

/* 🎨 STYLES */

const glass = {
  background:"rgba(255,255,255,0.04)",
  border:"1px solid rgba(255,255,255,0.08)",
  backdropFilter:"blur(14px)",
  borderRadius:18
}

const layout = {
  padding: 30,
  background: "linear-gradient(135deg,#020617,#0f172a,#020617)",
  color: "#fff",
  minHeight: "100vh"
}

const title = {
  fontSize: 30,
  marginBottom: 20,
  fontWeight: "bold",
  background: "linear-gradient(90deg,#22c55e,#3b82f6)",
  WebkitBackgroundClip: "text",
  color: "transparent"
}

/* 🔥 TABS */

const tabs = {
  display:"flex",
  gap:10,
  marginBottom:20
}

const tabBtn = (active,color)=>({
  padding:"10px 16px",
  borderRadius:12,
  cursor:"pointer",
  background:"rgba(255,255,255,0.03)",
  border:`1px solid ${active?color:"rgba(255,255,255,0.2)"}`,
  color: active ? color : "#fff",
  backdropFilter:"blur(10px)",
  boxShadow: active ? `0 0 8px ${color}` : "none",
  transition:"0.3s"
})

/* GRID */

const grid = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",
  gap:20
}

/* CARD */

const card = {
  ...glass,
  padding:20,
  transition:"0.3s",
  boxShadow:"0 0 18px rgba(59,130,246,0.15)"
}

/* STATUS COLOR */

const statusStyle = (status)=>({
  fontWeight:"bold",
  marginTop:5,
  color:
    status==="pending"?"#facc15":
    status==="preparing"?"#3b82f6":
    status==="ready"?"#22c55e":"#94a3b8"
})

/* ACTIONS */

const actions = {
  display:"flex",
  flexWrap:"wrap",
  gap:8,
  marginTop:12
}

/* 💎 OUTLINE NEON BUTTON */

const outlineBtn = (color)=>({
  padding:"8px 12px",
  borderRadius:10,
  background:"transparent",
  border:`1px solid ${color}`,
  color:color,
  cursor:"pointer",
  boxShadow:`0 0 8px ${color}`,
  fontSize:13
})