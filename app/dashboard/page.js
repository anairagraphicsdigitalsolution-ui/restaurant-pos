"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function Dashboard() {

  const [orders, setOrders] = useState([])
  const [items, setItems] = useState([])
  const [offers, setOffers] = useState([])

  const [role, setRole] = useState(null)
  const [restaurantId, setRestaurantId] = useState(null)
  const [openCategory, setOpenCategory] = useState(null)

  useEffect(() => {
    init()
  }, [])

  async function init() {

    const { data: userData } = await supabase.auth.getUser()

    if (!userData?.user) return

    const { data: profile } = await supabase
      .from("profiles")
      .select("restaurant_id, role")
      .eq("id", userData.user.id)
      .single()

    if (!profile) return

    setRole(profile.role)
    setRestaurantId(profile.restaurant_id)

    loadData(profile.restaurant_id)
  }

  async function loadData(rid) {

    const { data: orderData } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", rid)
      .order("created_at", { ascending: false })

    const { data: itemData } = await supabase
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", rid)

    const { data: offerData } = await supabase
      .from("offers")
      .select("*")
      .eq("restaurant_id", rid)

    setOrders(orderData || [])
    setItems(itemData || [])
    setOffers(offerData || [])
  }

  // ✅ DELETE ITEM (ADMIN ONLY)
  async function deleteItem(id) {

    if (role !== "admin" && role !== "super_admin") {
      alert("❌ Only admin allowed")
      return
    }

    if (!confirm("Delete item?")) return

    await supabase
      .from("menu_items")
      .delete()
      .eq("id", id)
      .eq("restaurant_id", restaurantId)

    setItems(prev => prev.filter(i => i.id !== id))
  }

  // ✅ DELETE CATEGORY
  async function deleteCategory(category) {

    if (role !== "admin" && role !== "super_admin") {
      alert("❌ Only admin allowed")
      return
    }

    if (!confirm(`Delete ${category}?`)) return

    await supabase
      .from("menu_items")
      .delete()
      .eq("category", category)
      .eq("restaurant_id", restaurantId)

    setItems(prev => prev.filter(i => i.category !== category))
  }

  // ✅ DELETE ALL ORDERS (SAFE)
  async function deleteAllOrders() {

    if (role !== "admin" && role !== "super_admin") {
      alert("❌ Only admin allowed")
      return
    }

    if (!confirm("⚠️ Delete ALL orders?")) return

    await supabase
      .from("orders")
      .delete()
      .eq("restaurant_id", restaurantId)

    setOrders([])
  }

  function toggleCategory(cat) {
    setOpenCategory(openCategory === cat ? null : cat)
  }

  // 💰 Revenue
  const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0)

  return (
    <div style={container}>

      {/* HEADER */}
      <div style={header}>
        <h1 style={title}>📊 Dashboard</h1>
        <p style={subtitle}>Role: {role}</p>
      </div>

      {/* STATS */}
      <div style={statsGrid}>
        <div style={cardPink}>
          <p>Total Orders</p>
          <h2>{orders.length}</h2>
        </div>

        <div style={cardBlue}>
          <p>Revenue</p>
          <h2>₹{revenue}</h2>
        </div>

        <div style={cardGreen}>
          <p>Menu Items</p>
          <h2>{items.length}</h2>
        </div>
      </div>

      {/* ORDERS */}
      <div style={box}>
        <h3>🧾 Recent Orders</h3>

        {orders.length === 0 && <p>No orders</p>}

        {orders.slice(0, 6).map(o => (
          <div key={o.id} style={row}>
            <div>
              <b>{o.source_label || `Order #${o.id.slice(0,5)}`}</b>
              <p style={timeText}>
                {new Date(o.created_at).toLocaleString()}
              </p>
            </div>

            <span style={status(o.status)}>
              {o.status}
            </span>
          </div>
        ))}
      </div>

      {/* MENU */}
      <div style={{ marginTop: 30 }}>
        <h3>🍔 Menu</h3>

        {Object.entries(
          items.reduce((acc, item) => {
            const cat = item.category || "Others"
            if (!acc[cat]) acc[cat] = []
            acc[cat].push(item)
            return acc
          }, {})
        ).map(([category, catItems]) => (

          <div key={category} style={categoryBox}>

            <div style={categoryHeader}>
              <div onClick={() => toggleCategory(category)} style={{ cursor: "pointer" }}>
                🍽 {category}
              </div>

              {(role === "admin" || role === "super_admin") && (
                <button onClick={() => deleteCategory(category)} style={deleteBtn}>
                  🗑
                </button>
              )}
            </div>

            {openCategory === category && (
              <div style={grid}>
                {catItems.map(item => (
                  <div key={item.id} style={itemCard}>
                    <h4>{item.name}</h4>
                    <p>₹{item.price}</p>

                    {(role === "admin" || role === "super_admin") && (
                      <button onClick={() => deleteItem(item.id)} style={deleteBtn}>
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

          </div>
        ))}
      </div>

      {/* DANGER */}
      <div style={dangerBox}>
        <h3>⚠️ Danger Zone</h3>
        <button onClick={deleteAllOrders} style={dangerBtn}>
          Delete All Orders
        </button>
      </div>

    </div>
  )
}

//
// 🎨 PREMIUM STYLE
//

const container = {
  padding: 25,
  background: "linear-gradient(135deg,#020617,#000)",
  minHeight: "100vh",
  color: "#fff"
}

const header = { marginBottom: 20 }
const title = { fontSize: 26 }
const subtitle = { color: "#94a3b8" }

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
  gap: 20
}

const cardPink = {
  background: "linear-gradient(135deg,#ec4899,#be185d)",
  padding: 20,
  borderRadius: 16
}

const cardBlue = {
  background: "linear-gradient(135deg,#3b82f6,#1e40af)",
  padding: 20,
  borderRadius: 16
}

const cardGreen = {
  background: "linear-gradient(135deg,#22c55e,#15803d)",
  padding: 20,
  borderRadius: 16
}

const box = {
  marginTop: 30,
  padding: 20,
  background: "rgba(255,255,255,0.05)",
  borderRadius: 16
}

const row = {
  display: "flex",
  justifyContent: "space-between",
  padding: "10px 0"
}

const timeText = { fontSize: 12, color: "#94a3b8" }

const status = (s) => {

  const config = {
    done: {
      label: "Done",
      color: "#22c55e",
      bg: "rgba(34,197,94,0.15)",
      icon: "✔"
    },
    preparing: {
      label: "Preparing",
      color: "#38bdf8",
      bg: "rgba(56,189,248,0.15)",
      icon: "⏳"
    },
    pending: {
      label: "Pending",
      color: "#facc15",
      bg: "rgba(250,204,21,0.15)",
      icon: "⚡"
    }
  }

  const st = config[s] || config.pending

  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,

    padding: "6px 14px",
    borderRadius: 999,

    fontSize: 12,
    fontWeight: "600",

    color: st.color,
    background: st.bg,

    border: `1px solid ${st.color}33`,

    backdropFilter: "blur(6px)",

    boxShadow: `0 4px 12px ${st.color}22`,

    letterSpacing: 0.4
  }
}

const categoryBox = {
  marginTop: 15,
  padding: 15,
  background: "rgba(255,255,255,0.05)",
  borderRadius: 16
}

const categoryHeader = {
  display: "flex",
  justifyContent: "space-between"
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
  gap: 15
}

const itemCard = {
  background: "#020617",
  padding: 15,
  borderRadius: 12
}

const deleteBtn = {
  background: "#dc2626",
  color: "#fff",
  border: "none",
  padding: "6px 10px",
  borderRadius: 6,
  cursor: "pointer"
}

const dangerBox = {
  marginTop: 40,
  padding: 20,
  borderRadius: 16,
  border: "1px solid red"
}

const dangerBtn = {
  background: "red",
  color: "#fff",
  padding: "10px 14px",
  border: "none",
  borderRadius: 10,
  cursor: "pointer"
}