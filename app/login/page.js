"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"

export default function Login() {

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  async function handleLogin(){
    if(!email || !password){
      setErrorMsg("Enter email & password")
      return
    }

    setLoading(true)
    setErrorMsg("")

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if(error){
      setErrorMsg("❌ Invalid email or password")
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
      setErrorMsg("Profile not found")
      setLoading(false)
      return
    }

    if(profile.role === "staff"){
      window.location.href = "/staff"
    } else if(profile.role === "admin"){
      window.location.href = "/dashboard"
    } else if(profile.role === "super_admin"){
      window.location.href = "/super-admin"
    }
  }

  return (
    <div style={container}>

      <div style={glow1}></div>
      <div style={glow2}></div>

      <div style={box}>

        <div style={logoBox}>
          <img src="/logo.png" style={logo} />
          <h2 style={brand}>Anaira Graphics</h2>
          <p style={subBrand}>Digital Solution</p>
        </div>

        <h3 style={title}>Welcome Back 👋</h3>

        {errorMsg && <p style={error}>{errorMsg}</p>}

        {/* INPUTS */}
        <div style={inputWrap}>

          <div style={inputBox}>
            <label style={label}>Email</label>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e)=>setEmail(e.target.value)}
              style={input}
            />
          </div>

          <div style={inputBox}>
            <label style={label}>Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e)=>setPassword(e.target.value)}
              style={input}
            />
          </div>

        </div>

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

/* UI */

const container = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  height: "100vh",
  background: "radial-gradient(circle at top,#020617,#000)",
  position: "relative"
}

const glow1 = {
  position: "absolute",
  width: 300,
  height: 300,
  background: "#22c55e",
  filter: "blur(140px)",
  top: -80,
  left: -80,
  opacity: 0.4
}

const glow2 = {
  position: "absolute",
  width: 300,
  height: 300,
  background: "#3b82f6",
  filter: "blur(140px)",
  bottom: -80,
  right: -80,
  opacity: 0.4
}

const box = {
  width: 360,
  padding: 30,
  borderRadius: 20,
  display: "flex",
  flexDirection: "column",
  gap: 18,
  background: "rgba(255,255,255,0.05)",
  backdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 0 40px rgba(0,0,0,0.6)"
}

const logoBox = { textAlign: "center" }

const logo = {
  width: 70,
  height: 70,
  borderRadius: 12,
  marginBottom: 6
}

const brand = { color: "#fff", fontSize: 18, fontWeight: "600" }
const subBrand = { fontSize: 11, color: "#94a3b8" }
const title = { color: "#fff" }

const error = {
  color: "#ef4444",
  fontSize: 12
}

/* FIXED INPUT ALIGN */

const inputWrap = {
  display: "flex",
  flexDirection: "column",
  gap: 14
}

const inputBox = {
  display: "flex",
  flexDirection: "column",
  gap: 6
}

const label = {
  fontSize: 12,
  color: "#94a3b8"
}

const input = {
  padding: "12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  outline: "none"
}

const btn = {
  marginTop: 10,
  padding: 12,
  borderRadius: 12,
  background: "linear-gradient(135deg,#22c55e,#16a34a)",
  border: "none",
  color: "#fff",
  fontWeight: "600",
  cursor: "pointer"
}

const footer = {
  fontSize: 10,
  color: "#64748b",
  textAlign: "center"
}