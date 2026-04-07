"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function OrderPage() {

  const params = useSearchParams()

  const [menu, setMenu] = useState([])
  const [tables, setTables] = useState([])
  const [rooms, setRooms] = useState([])
  const [cart, setCart] = useState([])

  const [type, setType] = useState("table")
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState("")
  const [restaurantId, setRestaurantId] = useState(null)
  const [openSelect, setOpenSelect] = useState(false)

  useEffect(() => { init() }, [])
  useEffect(() => { autoQR() }, [tables, rooms])

  async function init() {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) return

    const { data: profile } = await supabase
      .from("profiles")
      .select("restaurant_id")
      .eq("id", userData.user.id)
      .single()

    if (!profile?.restaurant_id) return alert("Restaurant not linked")

    setRestaurantId(profile.restaurant_id)
    fetchAll(profile.restaurant_id)
  }

  async function fetchAll(rid) {
    const { data: m } = await supabase.from("menu_items").select("*").eq("restaurant_id", rid)
    const { data: t } = await supabase.from("tables").select("*").eq("restaurant_id", rid)
    const { data: r } = await supabase.from("rooms").select("*").eq("restaurant_id", rid)

    setMenu(m || [])
    setTables(t || [])
    setRooms(r || [])
  }

  function autoQR() {
    const qrType = params.get("type")
    const qrId = params.get("id")
    if (!qrType || !qrId) return

    setType(qrType)
    const list = qrType === "table" ? tables : rooms
    const found = list.find(i => String(i.id) === qrId)
    if (found) setSelected(found)
  }

  function addToCart(item) {
    const exist = cart.find(i => i.id === item.id)
    if (exist) {
      setCart(cart.map(i =>
        i.id === item.id ? { ...i, qty: i.qty + 1 } : i
      ))
    } else {
      setCart([...cart, { ...item, qty: 1 }])
    }
  }

  function updateQty(id, change) {
    setCart(cart.map(i =>
      i.id === id
        ? { ...i, qty: Math.max(1, i.qty + change) }
        : i
    ))
  }

  async function placeOrder() {
    if (!selected) return alert("Select table/room")

    const { data: userData } = await supabase.auth.getUser()

    const { data: profile } = await supabase
      .from("profiles")
      .select("restaurant_id")
      .eq("id", userData.user.id)
      .single()

    const { data: order } = await supabase
      .from("orders")
      .insert([{
        source_type: type,
        source_id: selected.id,
        source_label:
          type === "table"
            ? `Table ${selected.table_number}`
            : `Room ${selected.room_number}`,
        restaurant_id: profile.restaurant_id,
        status: "pending"
      }])
      .select()
      .single()

    const items = cart.map(i => ({
      order_id: order.id,
      item_id: i.id,
      quantity: i.qty
    }))

    await supabase.from("order_items").insert(items)

    alert("✅ Order placed")
    setCart([])
  }

  const groupedMenu = menu.reduce((acc, item) => {
    const cat = item.category || "Other"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  return (
    <div style={layout}>

      {/* LEFT */}
      <div style={{...glass, ...panel}}>
        <h3>🔘 Select</h3>

        <div style={{display:"flex", gap:10}}>
          <button style={tabBtn(type==="table","#3b82f6")} onClick={()=>setType("table")}>Table</button>
          <button style={tabBtn(type==="room","#a855f7")} onClick={()=>setType("room")}>Room</button>
        </div>

        {/* SELECT BUTTON */}
        <button style={selectBtn} onClick={()=>setOpenSelect(!openSelect)}>
          {selected
            ? (type==="table"
                ? `Table ${selected.table_number}`
                : `Room ${selected.room_number}`)
            : "Select Table / Room"}
        </button>

        {openSelect && (
          <div style={dropdown}>
            {(type==="table"?tables:rooms).map(item=>(
              <div key={item.id}
                onClick={()=>{setSelected(item);setOpenSelect(false)}}
                style={dropdownItem}>
                {type==="table"
                  ? `Table ${item.table_number}`
                  : `Room ${item.room_number}`}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MENU */}
      <div style={{...glass, ...menuBox}}>
        <input
          placeholder="Search..."
          value={search}
          onChange={(e)=>setSearch(e.target.value)}
          style={searchBox}
        />

        <div style={{overflowY:"auto"}}>
          {Object.entries(groupedMenu).map(([cat, items]) => (
            <div key={cat}>
              <h3>{cat}</h3>

              <div style={grid}>
                {items.map(item=>(
                  <div key={item.id} style={menuCard} onClick={()=>addToCart(item)}>
                    <img src={item.image} style={imageStyle}/>
                    <p>{item.name}</p>
                    <p>₹{item.price}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CART */}
      <div style={{...glass, ...panel}}>
        
        {/* PLACE ORDER BUTTON FIX */}
        <button style={placeBtn} onClick={placeOrder}>
          🚀 Place Order
        </button>

        {cart.map(item=>(
          <div key={item.id} style={cartItem}>
            {item.name}
            <div>
              <button onClick={()=>updateQty(item.id,-1)}>-</button>
              {item.qty}
              <button onClick={()=>updateQty(item.id,1)}>+</button>
            </div>
          </div>
        ))}
      </div>

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
  display:"grid",
  gridTemplateColumns:"260px 1fr 300px",
  height:"100vh",
  gap:12,
  padding:12,
  background:"linear-gradient(135deg,#020617,#0f172a,#020617)"
}

const panel = { padding:16 }
const menuBox = { padding:16 }

const grid = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",
  gap:12
}

const menuCard = {
  padding:10,
  borderRadius:12,
  background:"rgba(255,255,255,0.05)",
  cursor:"pointer"
}

const imageStyle = {
  width:"100%",
  height:90,
  objectFit:"cover",
  borderRadius:8
}

const searchBox = {
  padding:10,
  borderRadius:10,
  background:"#0f172a",
  color:"#fff",
  marginBottom:10
}

/* 🔥 SELECT BUTTON FIX */
const selectBtn = {
  marginTop:15,
  padding:"12px",
  width:"100%",
  borderRadius:12,
  background:"rgba(255,255,255,0.05)",
  border:"1px solid rgba(255,255,255,0.2)",
  color:"#fff",
  textAlign:"center"
}

const dropdown = { marginTop:10 }
const dropdownItem = { padding:10, cursor:"pointer" }

const cartItem = {
  display:"flex",
  justifyContent:"space-between",
  marginTop:10
}

/* 🔥 TAB BUTTON */
const tabBtn = (active,color)=>({
  flex:1,
  padding:"10px",
  borderRadius:12,
  background:"rgba(255,255,255,0.03)",
  border:`1px solid ${active?color:"rgba(255,255,255,0.2)"}`,
  color: active ? color : "#fff",
  boxShadow: active ? `0 0 8px ${color}` : "none"
})

/* 💎 PLACE ORDER BUTTON PERFECT */
const placeBtn = {
  width:"100%",
  padding:"14px",
  borderRadius:14,
  background:"transparent",
  border:"1px solid #22c55e",
  color:"#22c55e",
  fontWeight:"bold",
  textAlign:"center",
  boxShadow:"0 0 12px #22c55e, 0 0 30px #22c55e",
  marginBottom:15,
  cursor:"pointer"
}