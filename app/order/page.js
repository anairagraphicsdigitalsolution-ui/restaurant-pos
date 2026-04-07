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

    const { data: order, error } = await supabase
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

    if (error) return alert("❌ Order failed")

    const items = cart.map(i => ({
      order_id: order.id,
      item_id: i.id,
      quantity: i.qty
    }))

    await supabase.from("order_items").insert(items)

    alert("✅ Order placed")
    setCart([])
  }

  const groupedMenu = menu
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    .reduce((acc, item) => {
      const cat = item.category || "Other"
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(item)
      return acc
    }, {})

  return (
    <div style={layout}>

      {/* LEFT PANEL */}
      <div style={leftPanel}>
        <h3>Select</h3>

        <div style={switchBox}>
          <button onClick={()=>setType("table")} style={btn(type==="table")}>Table</button>
          <button onClick={()=>setType("room")} style={btn(type==="room")}>Room</button>
        </div>

        <button onClick={()=>setOpenSelect(!openSelect)} style={selectBtn}>
          {selected
            ? (type==="table"
                ? `Table ${selected.table_number}`
                : `Room ${selected.room_number}`)
            : "Select"}
        </button>

        {openSelect && (
          <div style={dropdown}>
            {(type==="table"?tables:rooms).map(item=>(
              <div
                key={item.id}
                onClick={()=>{
                  setSelected(item)
                  setOpenSelect(false)
                }}
                style={dropdownItem}
              >
                {type==="table"
                  ? `Table ${item.table_number}`
                  : `Room ${item.room_number}`}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MENU */}
      <div style={menuBox}>
        <input
          placeholder="Search..."
          value={search}
          onChange={(e)=>setSearch(e.target.value)}
          style={searchBox}
        />

        <div style={menuScroll}>
          {Object.entries(groupedMenu).map(([cat, items]) => (
            <div key={cat}>
              <h2 style={categoryTitle}>{cat}</h2>

              <div style={grid}>
                {items.map(item=>(
                  <div
                    key={item.id}
                    style={menuCard}
                    onClick={()=>addToCart(item)}
                  >
                    <img
                      src={item.image || "https://via.placeholder.com/150"}
                      style={imageStyle}
                    />
                    <h4 style={{fontSize:14, margin:"6px 0"}}>{item.name}</h4>
                    <p style={{fontSize:12}}>₹{item.price}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CART */}
      <div style={rightPanel}>

        {/* ✅ BUTTON TOP */}
        <button onClick={placeOrder} style={orderBtn}>
          Place Order
        </button>

        {/* CART */}
        <div style={cartScroll}>
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

    </div>
  )
}

/* 🎨 STYLES */

const categoryTitle = {
  marginTop:20,
  marginBottom:10,
  color:"#c34b0a"
}

const imageStyle = {
  width:"100%",
  height:90,
  objectFit:"cover",
  borderRadius:8
}

const grid = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",
  gap:15
}

const menuCard = {
  padding:10,
  borderRadius:12,
  background:"rgba(175, 81, 19, 0.04)",
  cursor:"pointer",
  textAlign:"center"
}

const layout = {
  display:"grid",
  gridTemplateColumns:"260px 1fr 320px",
  height:"100vh",
  overflow:"hidden",
  background:"#020617",
  color:"#fff"
}

const selectBtn = {
  marginTop:15,
  width:"100%",
  padding:12,
  borderRadius:10,
  background:"#1e293b",
  color:"#fff",
  cursor:"pointer"
}

const dropdown = {
  marginTop:10,
  background:"#0f172a",
  borderRadius:10,
  maxHeight:200,
  overflowY:"auto"
}

const dropdownItem = {
  padding:12,
  cursor:"pointer",
  borderBottom:"1px solid rgba(255,255,255,0.05)"
}

const menuScroll = {
  overflowY:"auto",
  height:"calc(100vh - 80px)"
}

const cartScroll = {
  overflowY:"auto",
  maxHeight:"70vh"
}

const leftPanel = {
  padding:20,
  borderRight:"1px solid rgba(255,255,255,0.08)"
}

const rightPanel = {
  padding:20,
  display:"flex",
  flexDirection:"column",
  gap:15, // ✅ FIX
  borderLeft:"1px solid rgba(255,255,255,0.08)"
}

const switchBox = { display:"flex", gap:10 }

const btn = a => ({
  flex:1,
  padding:10,
  borderRadius:10,
  background:a?"#1e293b":"#0f172a",
  color:"#c75107"
})

const menuBox = { padding:25 }

const searchBox = {
  padding:10,
  borderRadius:10,
  background:"#0f172a",
  color:"#fff"
}

const cartItem = {
  display:"flex",
  justifyContent:"space-between",
  marginBottom:12
}

const orderBtn = {
  padding:14,
  borderRadius:12,
  background:"#bd4f05",
  color:"#fff",
  cursor:"pointer"
}