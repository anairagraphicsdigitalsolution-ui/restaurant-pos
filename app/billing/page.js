"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function BillingPage() {

  const [orders, setOrders] = useState([])
  const [selectedOrder, setSelectedOrder] = useState("")
  const [items, setItems] = useState([])
  const [restaurant, setRestaurant] = useState(null)

  const GST = 5

  useEffect(() => {
    init()

    // ✅ PRINT FIX (NO BLANK PAGE)
    const style = document.createElement("style")
    style.innerHTML = `
      @media print {
        body {
          margin: 0;
          background: white;
        }

        body * {
          visibility: hidden;
        }

        #bill-print, #bill-print * {
          visibility: visible;
        }

        #bill-print {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          background: white;
          color: black;
          padding: 20px;
        }

        #print-btn {
          display: none !important;
        }
      }
    `
    document.head.appendChild(style)

  }, [])

  // 🔥 INIT
  async function init() {

    const { data: auth } = await supabase.auth.getUser()

    if (!auth?.user) {
      alert("Login required")
      return
    }

    const userId = auth.user.id
    let restId = null

    // ✅ TRY users table
    const { data: userData } = await supabase
      .from("users")
      .select("restaurant_id")
      .eq("id", userId)
      .single()

    if (userData?.restaurant_id) {
      restId = userData.restaurant_id
    }

    // ✅ FALLBACK profiles table
    if (!restId) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("restaurant_id")
        .eq("id", userId)
        .single()

      if (profileData?.restaurant_id) {
        restId = profileData.restaurant_id
      }
    }

    if (!restId) {
      alert("❌ Restaurant not linked")
      return
    }

    fetchRestaurant(restId)
    fetchOrders(restId)
  }

  // 🔥 RESTAURANT
  async function fetchRestaurant(restId) {
    const { data } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", restId)
      .single()

    setRestaurant(data)
  }

  // 🔥 ORDERS
  async function fetchOrders(restId) {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restId)
      .eq("status", "done")

    setOrders(data || [])
  }

  // 🔥 BILL LOAD (FIXED NO ZERO ISSUE)
  async function loadBill(orderId) {

    setSelectedOrder(orderId)

    const { data: orderItems } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId)

    if (!orderItems?.length) {
      setItems([])
      return
    }

    // 🔥 SUPPORT BOTH item_id / menu_item_id
    const ids = orderItems.map(i => i.item_id || i.menu_item_id)

    const { data: menuData } = await supabase
      .from("menu_items")
      .select("id, name, price")
      .in("id", ids)

    const finalItems = orderItems.map(i => {

      const matchId = i.item_id || i.menu_item_id

      const menu = menuData?.find(
        m => String(m.id) === String(matchId)
      )

      return {
        quantity: Number(i.quantity),
        menu_items: menu || { name: "Item Not Found ❌", price: 0 }
      }
    })

    setItems(finalItems)
  }

  // 🔥 CALCULATION
  const subtotal = items.reduce(
    (sum, i) => sum + i.quantity * i.menu_items.price,
    0
  )

  const gst = (subtotal * GST) / 100
  const total = subtotal + gst

  function printBill() {
    window.print()
  }

  return (
    <div style={layout}>

      <h1 style={title}>💰 Smart Billing</h1>

      <select
        value={selectedOrder}
        onChange={(e)=>loadBill(e.target.value)}
        style={input}
      >
        <option value="">Select Order</option>

        {orders.map(o=>(
          <option key={o.id} value={o.id}>
            Order #{o.id.slice(0,6)}
          </option>
        ))}
      </select>

      {selectedOrder && (
        <div id="bill-print" style={billCard}>

          {/* HEADER */}
          <div style={header}>
            {restaurant?.logo && (
              <img src={restaurant.logo} style={logo} />
            )}

            <div>
              <h2>{restaurant?.name}</h2>
              <p>{restaurant?.address}</p>
              <p>{restaurant?.phone}</p>
              <p>GSTIN: {restaurant?.gst || "XXXX"}</p>
            </div>
          </div>

          <hr />

          {/* ITEMS */}
          <table style={table}>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Total</th>
              </tr>
            </thead>

            <tbody>
              {items.map((i, idx)=>(
                <tr key={idx}>
                  <td>{i.menu_items.name}</td>
                  <td>{i.quantity}</td>
                  <td>₹{i.menu_items.price}</td>
                  <td>₹{i.quantity * i.menu_items.price}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* TOTAL */}
          <div style={totalBox}>
            <p>Subtotal: ₹{subtotal}</p>
            <p>GST (5%): ₹{gst.toFixed(2)}</p>
            <h2>Total: ₹{total.toFixed(2)}</h2>
          </div>

          {/* FOOTER */}
          <div style={footer}>
            <p>🙏 Thank you for visiting {restaurant?.name}</p>
            <p style={{fontSize:12}}>
              Powered by <b>Anaira Graphics & Digital Solution</b>
            </p>
          </div>

          <button id="print-btn" onClick={printBill} style={printBtn}>
            🖨️ Print Invoice
          </button>

        </div>
      )}

    </div>
  )
}

/* 🎨 UI */

const layout = {
  minHeight:"100vh",
  padding:30,
  background:"#000",
  color:"#fff"
}

const title = {
  fontSize:28,
  marginBottom:20,
  color:"#22c55e"
}

const input = {
  padding:10,
  borderRadius:10,
  background:"#111",
  color:"#fff"
}

const billCard = {
  maxWidth:400,
  margin:"20px auto",
  padding:20,
  borderRadius:10,
  background:"#fff",
  color:"#000"
}

const header = {
  display:"flex",
  gap:10
}

const logo = {
  width:50,
  height:50
}

const table = {
  width:"100%",
  marginTop:15,
  borderCollapse:"collapse"
}

const totalBox = {
  marginTop:15,
  textAlign:"right"
}

const footer = {
  textAlign:"center",
  marginTop:15
}

const printBtn = {
  width:"100%",
  padding:10,
  marginTop:15,
  background:"#22c55e",
  color:"#fff",
  border:"none",
  borderRadius:8
}