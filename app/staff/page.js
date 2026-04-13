"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import OrderPage from "../order/page"

export default function StaffPage(){

  const [restaurantId,setRestaurantId] = useState(null)
  const [orders,setOrders] = useState([])
  const [activeTab,setActiveTab] = useState("orders")
  const [posEnabled,setPosEnabled] = useState(false)

  useEffect(()=>{ init() },[])

  async function init(){

    const { data: userData } = await supabase.auth.getUser()
    if(!userData?.user) return alert("Login required")

    const { data: profile } = await supabase
      .from("profiles")
      .select("restaurant_id")
      .eq("id", userData.user.id)
      .single()

    if(!profile?.restaurant_id) return

    setRestaurantId(profile.restaurant_id)
    loadOrders(profile.restaurant_id)

    // 🔥 POS plugin check
    const { data: posPlugin } = await supabase
      .from("restaurant_plugins")
      .select("*")
      .eq("restaurant_id", profile.restaurant_id)
      .eq("plugin_code","pos")
      .maybeSingle()

    setPosEnabled(posPlugin?.enabled || false)

    // 🔴 realtime
    supabase.channel("orders-live")
      .on("postgres_changes",
        { event:"*", schema:"public", table:"orders" },
        ()=>loadOrders(profile.restaurant_id)
      )
      .subscribe()
  }

  async function loadOrders(id){

    const { data: ordersData } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", id)
      .order("created_at",{ascending:false})

    const { data: tables } = await supabase.from("tables").select("*").eq("restaurant_id", id)
    const { data: rooms } = await supabase.from("rooms").select("*").eq("restaurant_id", id)

    const tableMap = {}
    tables?.forEach(t => tableMap[t.id] = t.table_number)

    const roomMap = {}
    rooms?.forEach(r => roomMap[r.id] = r.room_number)

    const final = ordersData.map(o => ({
      ...o,
      display:
        o.source_type==="table"
          ? `🍽️ Table ${tableMap[o.source_id] || "-"}`
          : `🛏️ Room ${roomMap[o.source_id] || "-"}`
    }))

    setOrders(final)
  }

  async function updateStatus(order,status){
    await supabase.from("orders").update({status}).eq("id", order.id)
  }

  return (
    <div style={layout}>

      {/* HEADER */}
      <div style={header}>
        <h1 style={title}>👨‍🍳 Staff Panel</h1>
        <div style={badge}>{orders.length} Orders</div>
      </div>

      {/* TABS */}
      <div style={tabs}>
        <button onClick={()=>setActiveTab("orders")}
          style={tabBtn(activeTab==="orders","#3b82f6")}>
          Orders
        </button>

        <button onClick={()=>setActiveTab("take")}
          style={tabBtn(activeTab==="take","#22c55e")}>
          Take Order
        </button>

        {posEnabled && (
          <button onClick={()=>setActiveTab("pos")}
            style={tabBtn(activeTab==="pos","#f59e0b")}>
            POS
          </button>
        )}
      </div>

      {/* TAKE */}
      {activeTab==="take" && <OrderPage />}

      {/* POS */}
      {activeTab==="pos" && posEnabled && (
        <POS restaurantId={restaurantId} />
      )}

      {/* ORDERS */}
      {activeTab==="orders" && (
        <div style={grid}>
          {orders.map(o=>(
            <div key={o.id} style={card}>

              <div style={topRow}>
                <span style={orderId}>#{o.id.slice(0,6)}</span>
                <span style={time}>
                  {new Date(o.created_at).toLocaleTimeString()}
                </span>
              </div>

              <div style={tableBox}>{o.display}</div>

              <div style={status(o.status)}>
                {o.status.toUpperCase()}
              </div>

              <div style={actions}>
                <button onClick={()=>updateStatus(o,"preparing")} style={btn("#3b82f6")}>Preparing</button>
                <button onClick={()=>updateStatus(o,"ready")} style={btn("#22c55e")}>Ready</button>
                <button onClick={()=>updateStatus(o,"done")} style={btn("#64748b")}>Done</button>
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  )
}

//
// 🔥 POS (IMPROVED UI)
//

function POS({ restaurantId }){

  const [menu,setMenu] = useState([])
  const [tables,setTables] = useState([])
  const [rooms,setRooms] = useState([])
  const [cart,setCart] = useState([])
  const [type,setType] = useState("table")
  const [selected,setSelected] = useState(null)

  useEffect(()=>{ load() },[])

  async function load(){
    const { data:m } = await supabase.from("menu_items").select("*").eq("restaurant_id",restaurantId)
    const { data:t } = await supabase.from("tables").select("*").eq("restaurant_id",restaurantId)
    const { data:r } = await supabase.from("rooms").select("*").eq("restaurant_id",restaurantId)

    setMenu(m||[])
    setTables(t||[])
    setRooms(r||[])
  }

  function add(item){
    const exist = cart.find(i=>i.id===item.id)
    if(exist){
      setCart(cart.map(i=>i.id===item.id?{...i,qty:i.qty+1}:i))
    }else{
      setCart([...cart,{...item,qty:1}])
    }
  }

  function qty(id,val){
    setCart(cart.map(i=>
      i.id===id?{...i,qty:Math.max(1,i.qty+val)}:i
    ))
  }

  async function place(){

    if(!selected) return alert("Select table/room")

    const { data: order } = await supabase
      .from("orders")
      .insert([{
        restaurant_id: restaurantId,
        source_type:type,
        source_id:selected.id,
        source_label:
          type==="table"
            ? `Table ${selected.table_number}`
            : `Room ${selected.room_number}`,
        status:"done"
      }])
      .select()
      .single()

    const items = cart.map(i=>({
      order_id:order.id,
      item_id:i.id,
      quantity:i.qty
    }))

    await supabase.from("order_items").insert(items)

    alert("✅ Bill Generated")
    setCart([])
  }

  return (
    <div style={posBox}>

      {/* TYPE */}
      <div style={tabs}>
        <button style={tabBtn(type==="table","#3b82f6")} onClick={()=>{setType("table");setSelected(null)}}>🍽️ Table</button>
        <button style={tabBtn(type==="room","#a855f7")} onClick={()=>{setType("room");setSelected(null)}}>🛏️ Room</button>
      </div>

      {/* SELECT */}
      <div style={selectWrap}>
        {(type==="table"?tables:rooms).map(i=>(
          <button key={i.id}
            onClick={()=>setSelected(i)}
            style={{
              padding:"8px 12px",
              borderRadius:10,
              border:"1px solid #22c55e",
              background:selected?.id===i.id?"#22c55e":"transparent",
              color:"#fff"
            }}>
            {type==="table"?`T${i.table_number}`:`R${i.room_number}`}
          </button>
        ))}
      </div>

      {/* MENU */}
      <div style={grid}>
        {menu.map(item=>(
          <div key={item.id} style={menuCard} onClick={()=>add(item)}>
            <p>{item.name}</p>
            <span style={{color:"#22c55e"}}>₹{item.price}</span>
          </div>
        ))}
      </div>

      {/* CART */}
      <div style={cartBox}>
        {cart.map(i=>(
          <div key={i.id} style={cartItem}>
            <span>{i.name}</span>
            <div>
              <button onClick={()=>qty(i.id,-1)}>-</button>
              {i.qty}
              <button onClick={()=>qty(i.id,1)}>+</button>
            </div>
          </div>
        ))}

        <h3>₹{cart.reduce((t,i)=>t+i.price*i.qty,0)}</h3>

        <button style={payBtn} onClick={place}>
          Generate Bill
        </button>
      </div>

    </div>
  )
}

//
// 🎨 FINAL UI
//

const layout = {
  padding:20,
  background:"linear-gradient(135deg,#020617,#0f172a,#020617)",
  color:"#fff",
  minHeight:"100vh"
}

const header = {
  display:"flex",
  justifyContent:"space-between",
  alignItems:"center",
  marginBottom:20
}

const badge = {
  background:"#22c55e",
  padding:"6px 12px",
  borderRadius:20,
  fontSize:12
}

const title = { fontSize:26 }

const tabs = { display:"flex", gap:10, marginBottom:15 }

const tabBtn = (active,color)=>({
  padding:"10px 14px",
  borderRadius:10,
  border:`1px solid ${active?color:"#0f0909"}`,
  color:active?color:"#191818",
  cursor:"pointer"
})

const grid = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",
  gap:15
}

const card = {
  background:"rgba(48, 46, 46, 0.69)",
  padding:15,
  borderRadius:14,
  border:"1px solid rgba(255, 255, 255, 0.62)",
  display:"flex",
  flexDirection:"column",
  gap:10
}

const topRow = {
  display:"flex",
  justifyContent:"space-between"
}

const orderId = { fontWeight:"bold" }

const time = { fontSize:11, opacity:0.6 }

const tableBox = { fontSize:15 }

const status = (s)=>({
  padding:"6px",
  borderRadius:8,
  textAlign:"center",
  fontWeight:"bold",
  background:
    s==="pending"?"#facc15":
    s==="preparing"?"#3b82f6":
    s==="ready"?"#22c55e":"#64748b",
  color:"#000"
})

const actions = {
  display:"grid",
  gridTemplateColumns:"1fr 1fr 1fr",
  gap:6
}

const btn = (color)=>({
  padding:8,
  border:`1px solid ${color}`,
  color:color,
  borderRadius:8,
  background:"transparent",
  fontSize:12
})

const posBox = {
  background:"rgba(40, 40, 40, 0.63)",
  padding:15,
  borderRadius:14
}

const selectWrap = {
  display:"flex",
  gap:8,
  flexWrap:"wrap",
  marginBottom:15
}

const menuCard = {
  background:"rgba(255,255,255,0.05)",
  padding:12,
  borderRadius:10,
  cursor:"pointer"
}

const cartBox = { marginTop:15 }

const cartItem = {
  display:"flex",
  justifyContent:"space-between",
  marginBottom:8
}

const payBtn = {
  marginTop:10,
  padding:12,
  background:"#22c55e",
  border:"none",
  borderRadius:10,
  color:"#fff",
  width:"100%"
}