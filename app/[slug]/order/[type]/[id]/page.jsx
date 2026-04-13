"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function OrderPage() {

  const params = useParams()
  const slug = params?.slug
  const type = params?.type
  const id = params?.id

  const [menu, setMenu] = useState([])
  const [cart, setCart] = useState([])
  const [selected, setSelected] = useState(null)
  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (slug && type && id) init()
  }, [slug, type, id])

  async function init() {

    setLoading(true)

    // 🔥 RESTAURANT
    const { data: rest, error: restError } = await supabase
      .from("restaurants")
      .select("*")
      .eq("slug", slug)
      .maybeSingle()

    if (restError || !rest) {
      console.log(restError)
      alert("❌ Restaurant not found")
      setLoading(false)
      return
    }

    setRestaurant(rest)

    // 🔥 MENU
    const { data: m } = await supabase
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", rest.id)

    setMenu(m || [])

    // 🔥 TABLE / ROOM
    const query = type === "table"
      ? supabase.from("tables")
      : supabase.from("rooms")

    const { data } = await query
      .select("*")
      .eq("restaurant_id", rest.id)

    const found = data?.find(i =>
      type === "table"
        ? String(i.table_number) === String(id) || String(i.id) === String(id)
        : String(i.room_number) === String(id) || String(i.id) === String(id)
    )

    console.log("FOUND:", found)

    if (found) setSelected(found)

    setLoading(false)
  }

  // 🛒 ADD
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

  // ➕➖
  function updateQty(id, change) {
    setCart(cart.map(i =>
      i.id === id
        ? { ...i, qty: Math.max(1, i.qty + change) }
        : i
    ))
  }

  // 🚀 PLACE ORDER
  async function placeOrder() {

    if (!selected) return alert("Select table/room")
    if (!restaurant) return alert("Restaurant missing")
    if (!cart.length) return alert("Cart empty")

    console.log("Restaurant:", restaurant)
    console.log("Selected:", selected)
    console.log("Cart:", cart)

    // ✅ ORDER INSERT
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([{
        restaurant_id: restaurant.id,
        source_type: type,
        source_id: selected.id,
        source_label:
          type === "table"
            ? `Table ${selected.table_number}`
            : `Room ${selected.room_number}`,
        status: "pending"
      }])
      .select()
      .single()

    if (orderError) {
      console.log("ORDER ERROR:", orderError)
      alert(orderError.message)
      return
    }

    // ✅ ITEMS
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
      alert(itemError.message)
      return
    }

    // 🔥 WHATSAPP
    const { data: wp } = await supabase
      .from("plugin_settings")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .eq("plugin_slug", "whatsapp")
      .maybeSingle()

    if (wp?.config?.number) {

      let number = wp.config.number.replace(/\D/g, "")
      if (!number.startsWith("91")) number = "91" + number

      let text = `🧾 *New Order - ${restaurant.name}*\n\n`

      cart.forEach((i, index) => {
        text += `${index + 1}. ${i.name} x${i.qty} = ₹${i.price * i.qty}\n`
      })

      text += `\n💰 Total: ₹${cart.reduce((t,i)=>t + i.price*i.qty,0)}\n`

      text += `📍 ${
        type === "table"
          ? `Table ${selected.table_number}`
          : `Room ${selected.room_number}`
      }`

      window.open(
        `https://wa.me/${number}?text=${encodeURIComponent(text)}`,
        "_blank"
      )
    }

    alert("✅ Order placed successfully")
    setCart([])
  }

  if (loading) {
    return <div style={{color:"#fff",padding:20}}>Loading...</div>
  }

  return (
    <div style={layout}>

      <div style={header}>
        <h2>{restaurant?.name}</h2>
        <p>
          {type === "table"
            ? `🍽️ Table ${selected?.table_number || "Loading..."}`
            : `🛏️ Room ${selected?.room_number || "Loading..."}`}
        </p>
      </div>

      <div style={grid}>
        {menu.map(item=>(
          <div key={item.id} style={card} onClick={()=>addToCart(item)}>
            <img src={item.image} style={img}/>
            <p>{item.name}</p>
            <p style={{color:"#22c55e"}}>₹{item.price}</p>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <div style={cartBox}>

          <h3>🛒 Cart</h3>

          {cart.map(item=>(
            <div key={item.id} style={cartItem}>
              <span>{item.name}</span>
              <div>
                <button onClick={()=>updateQty(item.id,-1)}>-</button>
                {item.qty}
                <button onClick={()=>updateQty(item.id,1)}>+</button>
              </div>
            </div>
          ))}

          <div style={total}>
            ₹{cart.reduce((t,i)=>t + i.price*i.qty,0)}
          </div>

          <button style={btn} onClick={placeOrder}>
            🚀 Place Order
          </button>

        </div>
      )}

    </div>
  )
}

/* STYLES */

const layout = {
  background:"#020617",
  color:"#fff",
  minHeight:"100vh",
  paddingBottom:"120px"
}

const header = {
  padding:15,
  borderBottom:"1px solid rgba(255,255,255,0.1)"
}

const grid = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",
  gap:12,
  padding:12
}

const card = {
  background:"rgba(255,255,255,0.05)",
  padding:10,
  borderRadius:10,
  cursor:"pointer"
}

const img = {
  width:"100%",
  height:90,
  objectFit:"cover",
  borderRadius:8
}

const cartBox = {
  position:"fixed",
  bottom:0,
  left:0,
  right:0,
  background:"#020617",
  padding:15,
  borderTop:"1px solid rgba(255,255,255,0.1)"
}

const cartItem = {
  display:"flex",
  justifyContent:"space-between",
  marginBottom:10
}

const total = {
  fontWeight:"bold",
  marginTop:10
}

const btn = {
  marginTop:10,
  padding:14,
  width:"100%",
  background:"#22c55e",
  border:"none",
  borderRadius:10,
  color:"#fff",
  fontWeight:"bold"
}