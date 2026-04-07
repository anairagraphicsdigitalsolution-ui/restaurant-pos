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
        <button onClick={()=>setActiveTab("orders")} style={tabBtn(activeTab==="orders")}>
          Orders
        </button>
        <button onClick={()=>setActiveTab("take")} style={tabBtn(activeTab==="take")}>
          Take Order
        </button>
      </div>

      {/* 🔥 ORDER PAGE */}
      {activeTab==="take" && <OrderPage />}

      {/* 🔥 ORDERS LIST */}
      {activeTab==="orders" && (
        <div style={grid}>

          {orders.map(o=>(
            <div key={o.id} style={card}>

              <h3>#{o.id.slice(0,6)}</h3>
              <p>Table {o.table_number || "-"}</p>

              <p style={{
                color:
                  o.status==="pending"?"#facc15":
                  o.status==="preparing"?"#3b82f6":
                  o.status==="ready"?"#22c55e":"#94a3b8"
              }}>
                {o.status}
              </p>

              <div style={actions}>
                <button onClick={()=>updateStatus(o,"preparing")} style={btnBlue}>
                  Preparing
                </button>

                <button onClick={()=>updateStatus(o,"ready")} style={btnGreen}>
                  Ready
                </button>

                <button onClick={()=>updateStatus(o,"done")} style={btnGray}>
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

/* 🎨 UI */

const layout={
  padding:30,
  background:"#020617",
  color:"#fff",
  minHeight:"100vh"
}

const title={
  fontSize:26,
  marginBottom:20
}

const tabs={
  display:"flex",
  gap:10,
  marginBottom:20
}

const tabBtn=(active)=>({
  padding:"8px 14px",
  borderRadius:8,
  background:active?"#22c55e":"#111",
  color:active?"#000":"#fff"
})

const grid={
  display:"grid",
  gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",
  gap:20
}

const card={
  padding:20,
  background:"#111",
  borderRadius:12
}

const actions={
  display:"flex",
  flexWrap:"wrap",
  gap:6,
  marginTop:10
}

const btnBlue={
  background:"#3b82f6",
  padding:"6px 10px",
  borderRadius:6
}

const btnGreen={
  background:"#22c55e",
  padding:"6px 10px",
  borderRadius:6
}

const btnGray={
  background:"#64748b",
  padding:"6px 10px",
  borderRadius:6
}