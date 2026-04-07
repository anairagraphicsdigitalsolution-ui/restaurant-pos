"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"

export default function Login() {

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleLogin(){

    if(!email || !password){
      alert("Enter email & password")
      return
    }

    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if(error){
      alert("❌ Login failed")
      setLoading(false)
      return
    }

    const user = data.user

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if(!profile){
      alert("Profile not found ❌")
      setLoading(false)
      return
    }

    if(profile.role === "staff"){
      window.location.href = "/staff"
    }
    else if(profile.role === "admin"){
      window.location.href = "/dashboard"
    }
    else if(profile.role === "super_admin"){
      window.location.href = "/super-admin"
    }
    else{
      window.location.href = "/login"
    }
  }

  return (
    <div style={container}>

      <div style={glow1}></div>
      <div style={glow2}></div>

      <div style={box}>

        {/* LOGO */}
        <div style={logoBox}>
          <img src="/logo.png" style={logo} />
          <h2 style={brand}>Anaira Graphics</h2>
          <p style={subBrand}>Digital Solution</p>
        </div>

        <h3 style={title}>Welcome Back 👋</h3>

        {/* INPUTS */}
        <div style={inputWrap}>
          <input
            placeholder="Enter Email"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            style={input}
          />

          <input
            type="password"
            placeholder="Enter Password"
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
            style={input}
          />
        </div>

        {/* 🔥 NEON BORDER BUTTON */}
        <button onClick={handleLogin} style={btn}>
          {loading ? "Logging..." : "Login"}
        </button>

        <p style={footer}>
          Secure Login • Anaira Graphics
        </p>

      </div>
    </div>
  )
}

/* 🎨 UI */

const container = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  height: "100vh",
  background: "radial-gradient(circle at top,#020617,#000)",
  position: "relative",
  overflow: "hidden"
}

const glow1 = {
  position: "absolute",
  width: 280,
  height: 280,
  background: "#22c55e",
  filter: "blur(120px)",
  top: -60,
  left: -60,
  opacity: 0.35
}

const glow2 = {
  position: "absolute",
  width: 280,
  height: 280,
  background: "#3b82f6",
  filter: "blur(120px)",
  bottom: -60,
  right: -60,
  opacity: 0.35
}

const box = {
  position: "relative",
  zIndex: 2,
  width: 320,
  padding: 30,
  borderRadius: 20,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
  background: "rgba(255,255,255,0.05)",
  backdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 0 30px rgba(34,197,94,0.15)"
}

/* CENTER FIX */

const logoBox = {
  textAlign: "center",
  marginBottom: 10
}

const logo = {
  width: 70,
  height: 70,
  borderRadius: 14,
  marginBottom: 6,
  boxShadow: "0 0 15px #22c55e66"
}

const brand = {
  margin: 0,
  fontSize: 18,
  color: "#fff"
}

const subBrand = {
  fontSize: 11,
  color: "#94a3b8"
}

const title = {
  color: "#fff",
  marginBottom: 10
}

/* 🔥 PERFECT ALIGN */

const inputWrap = {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: 10
}

const input = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid rgba(103, 103, 103, 0.1)",
  background: "rgba(101, 101, 101, 0.04)",
  color: "#4a4a4a",
  outline: "none"
}

/* 🔥 NEON BORDER BUTTON */

const btn = {
  width: "100%",
  marginTop: 10,
  padding: 12,
  borderRadius: 12,
  background: "transparent",
  border: "2px solid #49dd7f",
  color: "#026426",
  fontWeight: "600",
  cursor: "pointer",
  boxShadow: "0 0 12px #00572088, inset 0 0 8px #036d2a74",
  transition: "0.3s"
}

const footer = {
  fontSize: 10,
  color: "#3e4c5f",
  textAlign: "center"
}