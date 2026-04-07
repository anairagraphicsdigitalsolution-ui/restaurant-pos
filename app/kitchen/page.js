"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function KitchenPage() {

  const [orders, setOrders] = useState([])

  useEffect(() => {
    fetchOrders()
  }, [])

  async function fetchOrders() {

    const { data } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })

    const { data: tables } = await supabase.from("tables").select("*")
    const { data: rooms } = await supabase.from("rooms").select("*")
    const { data: orderItems } = await supabase.from("order_items").select("*")
    const { data: menuItems } = await supabase.from("menu_items").select("*")

    const tableMap = {}
    tables?.forEach(t => tableMap[t.id] = t.table_number)

    const roomMap = {}
    rooms?.forEach(r => roomMap[r.id] = r.room_number)

    const menuMap = {}
    menuItems?.forEach(m => menuMap[m.id] = m.name)

    const final = data.map(order => {

      const items = orderItems
        ?.filter(i => i.order_id === order.id)
        .map(i => ({
          quantity: i.quantity,
          name: menuMap[i.item_id] || "Item"
        }))

      return {
        ...order,
        display:
          order.source_type === "table"
            ? `🪑 Table ${tableMap[order.source_id]}`
            : `🏨 Room ${roomMap[order.source_id]}`,
        items
      }
    })

    setOrders(final)
  }

  async function updateStatus(id, status) {
    await supabase.from("orders").update({ status }).eq("id", id)
    fetchOrders()
  }

  return (
    <div style={container}>

      <h1 style={title}>⚡ Kitchen Panel</h1>

      {orders.length === 0 && <p style={{opacity:0.5}}>No Orders Found</p>}

      <div style={grid}>
        {orders.map(order => (

          <div key={order.id} style={card(order.status)}>

            {/* TOP */}
            <div style={topRow}>
              <h3>{order.display}</h3>
              <span style={time}>
                {new Date(order.created_at).toLocaleTimeString()}
              </span>
            </div>

            {/* ITEMS */}
            <div style={itemsBox}>
              {order.items?.map((item, i) => (
                <div key={i} style={itemRow}>
                  <span>{item.name}</span>
                  <b>× {item.quantity}</b>
                </div>
              ))}
            </div>

            {/* STATUS */}
            <div style={status(order.status)}>
              {order.status.toUpperCase()}
            </div>

            {/* ACTION */}
            <div style={actions}>
              <button
                style={btnBlue}
                onClick={() => updateStatus(order.id, "preparing")}
              >
                Start
              </button>

              <button
                style={btnGreen}
                onClick={() => updateStatus(order.id, "done")}
              >
                Done
              </button>
            </div>

          </div>

        ))}
      </div>

    </div>
  )
}

//
// 🎨 NEON UI STYLES
//

const container = {
  padding: 25,
  minHeight: "100vh",
  background: "radial-gradient(circle at top,#020617,#000)",
  color: "#fff"
}

const title = {
  textAlign: "center",
  fontSize: 30,
  marginBottom: 20,
  background: "linear-gradient(90deg,#22c55e,#3b82f6,#9333ea)",
  WebkitBackgroundClip: "text",
  color: "transparent"
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))",
  gap: 20
}

const card = (status) => ({
  padding: 18,
  borderRadius: 18,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  backdropFilter: "blur(10px)",
  boxShadow:
    status === "pending"
      ? "0 0 20px #facc15"
      : status === "preparing"
      ? "0 0 20px #38bdf8"
      : "0 0 20px #22c55e",
  transition: "0.3s"
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
  background: "#020617",
  padding: 10,
  borderRadius: 10,
  marginBottom: 10
}

const itemRow = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: 5
}

const status = (s) => ({
  padding: 6,
  borderRadius: 8,
  textAlign: "center",
  marginBottom: 10,
  fontWeight: "bold",
  background:
    s === "pending" ? "#facc15" :
    s === "preparing" ? "#38bdf8" :
    "#22c55e",
  color: "#000"
})

const actions = {
  display: "flex",
  gap: 10
}

const btnBlue = {
  flex: 1,
  padding: 10,
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(135deg,#0ea5e9,#2563eb)",
  color: "#fff",
  cursor: "pointer"
}

const btnGreen = {
  flex: 1,
  padding: 10,
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(135deg,#22c55e,#16a34a)",
  color: "#fff",
  cursor: "pointer"
}