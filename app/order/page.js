"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function OrderPage() {

  const params = useSearchParams()
  const route = useParams()

  const slug = route?.slug
  const typeParam = route?.type
  const idParam = route?.id

  const [menu, setMenu] = useState([])
  const [tables, setTables] = useState([])
  const [rooms, setRooms] = useState([])
  const [cart, setCart] = useState([])

  const [type, setType] = useState("table")
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState("")
  const [restaurantId, setRestaurantId] = useState(null)
  const [restaurantName, setRestaurantName] = useState("")
  
  const [openSelect, setOpenSelect] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => { init() }, [])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  useEffect(() => {
    if (tables.length || rooms.length) autoQR()
  }, [tables, rooms])

  // 🔥 INIT
  async function init() {

    if (slug) {
      const { data: rest } = await supabase
        .from("restaurants")
        .select("*")
        .eq("slug", slug)
        .maybeSingle()

      if (!rest) return alert("Restaurant not found")

      setRestaurantId(rest.id)
      setRestaurantName(rest.name)
      fetchAll(rest.id)
      return
    }

    const rid = params.get("rid")

    if (rid) {
      setRestaurantId(rid)
      fetchAll(rid)
      return
    }

    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) return

    const { data: profile } = await supabase
      .from("profiles")
      .select("restaurant_id")
      .eq("id", userData.user.id)
      .single()

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

    if (typeParam && idParam) {

      setType(typeParam)

      const list = typeParam === "table" ? tables : rooms

      const found = list.find(i =>
        typeParam === "table"
          ? String(i.table_number) === String(idParam) || String(i.id) === String(idParam)
          : String(i.room_number) === String(idParam) || String(i.id) === String(idParam)
      )

      if (found) setSelected(found)
      return
    }

    const qrType = params.get("type")
    const qrId = params.get("id")

    if (!qrType || !qrId) return

    setType(qrType)

    const list = qrType === "table" ? tables : rooms

    const found = list.find(i =>
      qrType === "table"
        ? String(i.table_number) === qrId || String(i.id) === qrId
        : String(i.room_number) === qrId || String(i.id) === qrId
    )

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

  // 🚀 FIXED PLACE ORDER
  async function placeOrder() {

    if (!selected) return alert("Select table/room")
    if (!restaurantId) return alert("Restaurant missing")
    if (cart.length === 0) return alert("Cart empty")

    console.log("DEBUG:", { selected, restaurantId, cart })

    const { data: order, error } = await supabase
      .from("orders")
      .insert([{
        source_type: type,
        source_id: selected.id,
        source_label:
          type === "table"
            ? `Table ${selected.table_number}`
            : `Room ${selected.room_number}`,
        restaurant_id: restaurantId,
        status: "pending"
      }])
      .select()
      .single()

    // 🔥 MAIN FIX
    if (error || !order) {
      console.log("ORDER ERROR:", error)
      alert("❌ Order failed (RLS issue)")
      return
    }

    const items = cart.map(i => ({
      order_id: order.id,
      item_id: i.id,
      quantity: i.qty
    }))

    const { error: itemError } = await supabase
      .from("order_items")
      .insert(items)

    if (itemError) {
      console.log("ITEM ERROR:", itemError)
      alert("❌ Items failed")
      return
    }

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
    <div style={getLayout(isMobile)}>

      {/* SAME UI (UNCHANGED) */}
      <div style={{...glass, ...panel}}>
        <h3>🔘 Select</h3>

        <div style={{display:"flex", gap:10}}>
          <button style={tabBtn(type==="table","#3b82f6")} onClick={()=>setType("table")}>Table</button>
          <button style={tabBtn(type==="room","#a855f7")} onClick={()=>setType("room")}>Room</button>
        </div>

        <button style={selectBtn} onClick={()=>setOpenSelect(!openSelect)}>
          {selected
            ? (type==="table"
                ? `🍽️ Table ${selected.table_number}`
                : `🛏️ Room ${selected.room_number}`)
            : "Select Table / Room"}
        </button>

        {openSelect && (
          <div style={dropdown}>
            {(type==="table"?tables:rooms).map(item=>(
              <div key={item.id}
                onClick={()=>{setSelected(item); setOpenSelect(false)}}
                style={dropdownItem}>
                {type==="table"
                  ? `🍽️ Table ${item.table_number}`
                  : `🛏️ Room ${item.room_number}`}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{...glass, ...menuBox}}>
        {Object.entries(groupedMenu).map(([cat, items]) => (
          <div key={cat}>
            <h3 style={{color:"#0bb8df"}}>{cat}</h3>

            <div style={getGrid(isMobile)}>
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

      <div style={{...glass, ...panel}}>
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

/* styles same */
/* STYLES */

const glass = {
  background:"rgba(32, 81, 137, 0.2)",
  border:"1px solid #fff",
  backdropFilter:"blur(14px)",
  borderRadius:18
}

const getLayout = (isMobile) => ({
  display:"grid",
  gridTemplateColumns: isMobile ? "1fr" : "260px 1fr 300px",
  height:"100vh",
  gap:12,
  padding:12,
  background:"linear-gradient(135deg,#020617,#0f172a,#020617)",
  color:"#fff"
})

const panel = { padding:16 }
const menuBox = { padding:16 }

const getGrid = (isMobile) => ({
  display:"grid",
  gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(auto-fill,minmax(150px,1fr))",
  gap:12
})

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
  background:"rgba(255,255,255,0.05)",
  border:"1px solid rgba(255,255,255,0.2)",
  color:"#fff"
}

const selectBtn = {
  marginTop:15,
  padding:"12px",
  width:"100%",
  borderRadius:12,
  background:"rgba(255,255,255,0.05)",
  border:"1px solid rgba(255,255,255,0.2)",
  color:"#fff"
}

const dropdown = {
  marginTop:10,
  maxHeight:200,
  overflowY:"auto",
  borderRadius:12,
  background:"rgba(0,0,0,0.4)"
}

const dropdownItem = {
  padding:"10px",
  cursor:"pointer"
}

const cartItem = {
  display:"flex",
  justifyContent:"space-between",
  marginTop:10
}

const tabBtn = (active,color)=>({
  flex:1,
  padding:"10px",
  borderRadius:12,
  background:"rgba(255,255,255,0.03)",
  border:`1px solid ${active?color:"rgba(255,255,255,0.2)"}`,
  color: active ? color : "#fff",
  boxShadow: active ? `0 0 8px ${color}` : "none"
})

const placeBtn = {
  width:"100%",
  padding:"14px",
  borderRadius:14,
  border:"1px solid #22c55e",
  color:"#22c55e",
  fontWeight:"bold",
  boxShadow:"0 0 12px #22c55e"
}