"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function UsersPage() {

  const [users, setUsers] = useState([])
  const [summary, setSummary] = useState({
    totalUsers: 0,
    todayUsers: 0,
    admins: 0,
    staff: 0
  })

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {

    // 🔥 USERS TABLE (profiles)
    const { data } = await supabase
      .from("profiles")
      .select("*")

    if (!data) return

    const today = new Date().toISOString().split("T")[0]

    const todayUsers = data.filter(u =>
      u.created_at?.startsWith(today)
    )

    const admins = data.filter(u => u.role === "admin")
    const staff = data.filter(u => u.role === "staff")

    setUsers(data)

    setSummary({
      totalUsers: data.length,
      todayUsers: todayUsers.length,
      admins: admins.length,
      staff: staff.length
    })
  }

  return (
    <div style={layout}>

      {/* 🔥 HEADER */}
      <div style={header}>
        <h1 style={title}>👥 User Analytics</h1>
        <p style={subtitle}>Platform user insights</p>
      </div>

      {/* 🔥 KPI */}
      <div style={topGrid}>
        <KPI title="Total Users" value={summary.totalUsers} glow="#3b82f6" />
        <KPI title="Today Joined" value={summary.todayUsers} glow="#22c55e" />
        <KPI title="Admins" value={summary.admins} glow="#9333ea" />
        <KPI title="Staff" value={summary.staff} glow="#f59e0b" />
      </div>

      {/* 🔥 USER LIST */}
      <div style={grid}>
        {users.map((u, i) => (
          <div key={u.id} style={{
            ...card,
            boxShadow: neonShadows[i % neonShadows.length]
          }}>

            <h3>{u.name || "User"}</h3>
            <p style={email}>{u.email}</p>

            <div style={statsRow}>
              <Stat label="Role" value={u.role} />
              <Stat label="Joined" value={formatDate(u.created_at)} />
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

  function formatDate(date) {
    if (!date) return "-"
    return new Date(date).toLocaleDateString()
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

/* 🎨 UI */

const layout = {
  minHeight:"100vh",
  padding:30,
  background:"radial-gradient(circle at top,#020617,#000)",
  color:"#fff"
}

const header = { marginBottom:30 }

const title = {
  fontSize:32,
  background:"linear-gradient(90deg,#3b82f6,#22c55e)",
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
  backdropFilter:"blur(20px)"
}

const grid = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",
  gap:20
}

const card = {
  padding:20,
  borderRadius:18,
  background:"rgba(255,255,255,0.05)",
  backdropFilter:"blur(25px)"
}

const email = {
  fontSize:12,
  color:"#94a3b8",
  marginBottom:10
}

const statsRow = {
  display:"flex",
  justifyContent:"space-between"
}

const stat = {
  textAlign:"center"
}

const labelStyle = {
  fontSize:11,
  color:"#64748b"
}