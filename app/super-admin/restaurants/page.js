"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { supabaseCloud as supabase } from "@/lib/supabase"

export default function RestaurantsPage() {

  const [restaurants, setRestaurants] = useState([])
  const [summary, setSummary] = useState({
    totalRestaurants: 0,
    totalOrders: 0,
    totalRevenue: 0
  })
  const [deletingId, setDeletingId] = useState("")

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {

    const { data: restData } = await supabase
      .from("restaurants")
      .select("*")

    if (!restData) return

    let totalOrdersAll = 0
    let totalRevenueAll = 0

    const result = []

    for (let rest of restData) {

      const { data: orders } = await supabase
        .from("orders")
        .select("*")
        .eq("restaurant_id", rest.id)

      const { data: menu } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", rest.id)

      const today = new Date().toISOString().split("T")[0]

      const todayOrders = orders?.filter(o =>
        o.created_at?.startsWith(today)
      )

      const revenue = (orders?.length || 0) * 200

      totalOrdersAll += orders?.length || 0
      totalRevenueAll += revenue

      result.push({
        ...rest,
        totalOrders: orders?.length || 0,
        todayOrders: todayOrders?.length || 0,
        menuCount: menu?.length || 0,
        revenue
      })
    }

    setRestaurants(result)

    setSummary({
      totalRestaurants: restData.length,
      totalOrders: totalOrdersAll,
      totalRevenue: totalRevenueAll
    })
  }

  async function deleteRestaurant(restaurant) {
    const confirmed = window.confirm(
      `DELETE RESTAURANT?\n\nThis will permanently delete ${restaurant.name} and its restaurant data including menu, orders, order items, tables, rooms, offers, reservations, plugins, settings, banners, profiles and QR-related data.\n\nThis action cannot be undone.`
    )

    if (!confirmed) return

    const typed = window.prompt(`Type the restaurant name to confirm deletion:\n${restaurant.name}`)
    if (typed?.trim() !== restaurant.name?.trim()) {
      if (typed !== null) alert("Deletion cancelled. Restaurant name did not match.")
      return
    }

    setDeletingId(restaurant.id)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error("Session expired. Please login again.")

      const response = await fetch("/api/super-admin/restaurants/delete", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ restaurant_id: restaurant.id }),
      })

      const payload = await response.json()
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Restaurant deletion failed")
      }

      setRestaurants((prev) => prev.filter((item) => item.id !== restaurant.id))
      setSummary((prev) => ({
        ...prev,
        totalRestaurants: Math.max(0, prev.totalRestaurants - 1),
      }))

      alert(`Restaurant deleted successfully. ${payload?.deleted?.deleted_rows ?? 0} database rows removed.`)
    } catch (error) {
      console.error("DELETE RESTAURANT ERROR:", error)
      alert(error?.message || "Restaurant deletion failed")
    } finally {
      setDeletingId("")
    }
  }

  return (
    <div style={layout} className="super-admin-restaurants-page">

      {/* 🔥 HEADER */}
      <div style={header}>
        <h1 style={title}>👑 Super Admin Analytics</h1>
        <p style={subtitle}>Restaurant portfolio, usage and lifecycle control</p>
      </div>

      {/* 🔥 KPI */}
      <div style={topGrid}>
        <KPI title="Restaurants" value={summary.totalRestaurants} />
        <KPI title="Orders" value={summary.totalOrders} />
        <KPI title="Revenue" value={`₹${summary.totalRevenue}`} />
      </div>

      {/* 🔥 RESTAURANTS */}
      <div style={grid}>
        {restaurants.map((r, i) => (
          <div
  key={r.id}
  style={card}
>
            <h2 style={restName}>{r.name}</h2>
            <p style={sub}>{r.address || "No address"}</p>

            <div style={statsRow}>
              <Stat label="Orders" value={r.totalOrders} />
              <Stat label="Today" value={r.todayOrders} />
              <Stat label="Menu" value={r.menuCount} />
              <Stat label="Revenue" value={`₹${r.revenue || 0}`} />
            </div>

            <div style={progressBox}>
              <div
                style={{
                  ...progress,
                  width: `${Math.min(r.todayOrders * 10, 100)}%`
                }}
              />
            </div>

            <div style={restaurantActions}>
              <Link
                href={`/super-admin/qr?rid=${encodeURIComponent(r.id)}`}
                style={qrButton}
              >
                📱 Generate / Print QR
              </Link>
              <button
                type="button"
                onClick={() => deleteRestaurant(r)}
                disabled={deletingId === r.id}
                style={{ ...deleteButton, opacity: deletingId === r.id ? 0.6 : 1 }}
              >
                {deletingId === r.id ? "Deleting…" : "🗑 Delete Restaurant"}
              </button>
            </div>

          </div>
        ))}
      </div>

    </div>
  )

  function KPI({ title, value }) {
    return (
     <div
  style={kpi}
>
        <p style={{ color: "var(--muted)" }}>{title}</p>
        <h2
  style={{
    color:"var(--primary)",
    fontSize:34,
    marginTop:10
  }}
>
  {value}
</h2>
      </div>
    )
  }

  function Stat({ label, value }) {
    return (
      <div style={stat}>
        <p style={labelStyle}>{label}</p>
        <h3
  style={{
    color:"var(--primary)",
    marginTop:6
  }}
>
  {value}
</h3>
      </div>
    )
  }
}



const layout = {
  minHeight:"100vh",
  padding:30,
  background:"radial-gradient(circle at top,var(--background),#000)",
  color:"var(--text)"
}

const header = {
  marginBottom:35,

  padding:30,

  borderRadius:30,

  background:
    "linear-gradient(145deg,var(--surface),var(--surface-2))",

  border:
    "1px solid rgba(var(--primary-rgb),.18)",

  boxShadow:
    "0 25px 60px rgba(0,0,0,.35)"
}

const title = {
  fontSize:42,
  fontWeight:800,

  color:"var(--primary)",

  letterSpacing:1,

  textShadow:
    "0 0 25px rgba(var(--primary-rgb),.35)"
}

const subtitle = {
  color:"var(--muted)",
  fontSize:15,
  marginTop:8
}

const topGrid = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",
  gap:20,
  marginBottom:30
}

const kpi = {

  padding:28,

  borderRadius:24,

  background:
    "linear-gradient(145deg,var(--surface),var(--surface-2))",

  border:
    "1.5px solid rgba(var(--primary-rgb),.22)",

  backdropFilter:"blur(20px)",

  boxShadow:
    "0 20px 40px rgba(0,0,0,.35)",

  transition:"all .35s ease"
}

const grid = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",
  gap:20
}

const card = {

  padding:24,

  borderRadius:26,

  background:
    "linear-gradient(145deg,var(--surface),var(--surface-2))",

  border:
  "1.5px solid rgba(var(--primary-rgb),.22)",

  backdropFilter:"blur(20px)",

  boxShadow:
    "0 20px 40px rgba(0,0,0,.35)",

  transition:"all .35s ease"
}

const restName = {
  fontSize:22,
  fontWeight:800,

  color:"var(--primary)",

  marginBottom:8
}

const sub = {
  fontSize:12,
  color:"var(--muted)",
  marginBottom:15
}

const statsRow = {

  display:"grid",

  gridTemplateColumns:
    "repeat(2,1fr)",

  gap:12,

  marginTop:20
}
const stat = {

  padding:"14px",

  borderRadius:16,

  textAlign:"center",

  background:
    "rgba(255,255,255,.03)",

  border:
  "1px solid rgba(var(--primary-rgb),.18)"
}

const labelStyle = {
  fontSize:11,
  color:"var(--muted)"
}

const progressBox = {

  marginTop:22,

  height:10,

  background:"var(--surface-2)",

  borderRadius:999,

  overflow:"hidden",

  border:
    "1px solid rgba(var(--primary-rgb),.12)"
}

const progress = {

  height:"100%",

  background:
    "linear-gradient(90deg,#fcd34d,var(--primary),var(--warning))",

  borderRadius:999,

  boxShadow:
    "0 0 20px rgba(var(--primary-rgb),.4)"
}
const restaurantActions = {
  marginTop: 18,
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 10,
}

const deleteButton = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 12,
  background: "#7f1d1d",
  color: "var(--text)",
  border: "1px solid rgba(248,113,113,.45)",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
}

const qrButton = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  background: "var(--primary)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  fontSize: 13,
  border: "1px solid var(--primary)"
}
