"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function RestaurantsPage() {

  const [restaurants, setRestaurants] = useState([])
  const [summary, setSummary] = useState({
    totalRestaurants: 0,
    totalOrders: 0,
    totalRevenue: 0
  })

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

  return (
    <div style={layout}>

      {/* 🔥 HEADER */}
      <div style={header}>
        <h1 style={title}>👑 Super Admin Analytics</h1>
        <p style={subtitle}>Neon Intelligence Dashboard</p>
      </div>

      {/* 🔥 KPI */}
      <div style={topGrid}>
        <KPI title="Restaurants" value={summary.totalRestaurants} glow="#9333ea" />
        <KPI title="Orders" value={summary.totalOrders} glow="#3b82f6" />
        <KPI title="Revenue" value={`₹${summary.totalRevenue}`} glow="#22c55e" />
      </div>

      {/* 🔥 RESTAURANTS */}
      <div style={grid}>
        {restaurants.map((r, i) => (
          <div key={r.id} style={{
            ...card,
            boxShadow: neonShadows[i % neonShadows.length]
          }}>

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

          </div>
        ))}
      </div>

    </div>
  )

  function KPI({ title, value, glow }) {
    return (
      <div style={{
        ...kpi,
        boxShadow: `0 0 20px ${glow}, 0 0 40px ${glow}55`
      }}>
        <p style={{ color: "#94a3b8" }}>{title}</p>
        <h2>{value}</h2>
      </div>
    )
  }

  function Stat({ label, value }) {
    return (
      <div style={stat}>
        <p style={labelStyle}>{label}</p>
        <h3>{value}</h3>
      </div>
    )
  }
}

/* 🎨 NEON COLORS */

const neonShadows = [
  "0 0 20px #22c55e55, 0 0 40px #22c55e33",
  "0 0 20px #3b82f655, 0 0 40px #3b82f633",
  "0 0 20px #9333ea55, 0 0 40px #9333ea33",
  "0 0 20px #f59e0b55, 0 0 40px #f59e0b33",
  "0 0 20px #ef444455, 0 0 40px #ef444433"
]

/* 🎨 STYLES */

const layout = {
  minHeight:"100vh",
  padding:30,
  background:"radial-gradient(circle at top,#020617,#000)",
  color:"#fff"
}

const header = { marginBottom:30 }

const title = {
  fontSize:32,
  background:"linear-gradient(90deg,#9333ea,#3b82f6,#22c55e)",
  WebkitBackgroundClip:"text",
  color:"transparent"
}

const subtitle = {
  color:"#94a3b8",
  fontSize:14
}

const topGrid = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",
  gap:20,
  marginBottom:30
}

const kpi = {
  padding:20,
  borderRadius:16,
  background:"rgba(255,255,255,0.05)",
  backdropFilter:"blur(20px)",
  transition:"0.3s"
}

const grid = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",
  gap:20
}

const card = {
  padding:20,
  borderRadius:20,
  background:"rgba(255,255,255,0.05)",
  backdropFilter:"blur(25px)",
  transition:"0.3s"
}

const restName = {
  fontSize:18,
  marginBottom:5
}

const sub = {
  fontSize:12,
  color:"#94a3b8",
  marginBottom:15
}

const statsRow = {
  display:"flex",
  justifyContent:"space-between",
  marginTop:10
}

const stat = {
  textAlign:"center"
}

const labelStyle = {
  fontSize:11,
  color:"#64748b"
}

const progressBox = {
  marginTop:15,
  height:5,
  background:"#1e293b",
  borderRadius:10
}

const progress = {
  height:"100%",
  background:"linear-gradient(90deg,#22c55e,#3b82f6)",
  borderRadius:10
}