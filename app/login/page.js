"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { DEFAULT_THEME, applyTheme } from "@/components/ThemeProvider"

export default function Login() {

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  const [errorMsg, setErrorMsg] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    // Login is platform-neutral: always render the canonical Logo Premium theme.
    applyTheme(DEFAULT_THEME)

    const reason = new URLSearchParams(window.location.search).get("reason")
    if (reason) setErrorMsg(`⚠️ ${reason}`)
  }, [])

  // ==========================================
  // NORMAL LOGIN
  // ==========================================

  async function handleLogin() {
    if (!email.trim() || !password) {
      setErrorMsg("Enter email & password")
      setSuccessMsg("")
      return
    }

    setLoading(true)
    setErrorMsg("")
    setSuccessMsg("")

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error || !data?.user) {
        setErrorMsg(error?.message?.toLowerCase().includes("email not confirmed")
          ? "❌ Please confirm your email before logging in."
          : "❌ Invalid email or password")
        setLoading(false)
        return
      }

      // AuthProvider owns profile/subscription checks and role-based routing.
      // Do not query profiles or redirect again here; SIGNED_IN is handled there.
    } catch (error) {
      console.error("LOGIN ERROR:", error)
      setErrorMsg("❌ Unable to login. Please try again.")
      setLoading(false)
    }
  }


  // ==========================================
  // FORGOT PASSWORD
  // ==========================================

  async function handleForgotPassword() {

    if (!email.trim()) {
      setErrorMsg("Please enter your email address first")
      setSuccessMsg("")
      return
    }

    setResetLoading(true)
    setErrorMsg("")
    setSuccessMsg("")

    try {

      const siteUrl =
        window.location.origin

      const redirectUrl =
        `${siteUrl}/reset-password`

      const { error } =
        await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: redirectUrl
          }
        )

      if (error) {
        setErrorMsg(
          `❌ ${error.message}`
        )

        setResetLoading(false)
        return
      }

      setSuccessMsg(
        "✅ Password reset link has been sent to your email."
      )

    } catch (error) {

      console.error(
        "FORGOT PASSWORD ERROR:",
        error
      )

      setErrorMsg(
        "❌ Unable to send password reset email."
      )

    } finally {

      setResetLoading(false)

    }
  }


  return (
    <div style={container}>

      <div style={glow1}/>
      <div style={glow2}/>


      <div style={box}>

        {/* =====================================
            LOGO
        ====================================== */}

        <div style={logoBox}>

          <img
            src="/Logo.png"
            style={{
              ...logo,
              animation:
                "float 4s ease-in-out infinite"
            }}
          />

          <style jsx>{`
            @keyframes float {
              0% {
                transform: translateY(0)
              }

              50% {
                transform: translateY(-10px)
              }

              100% {
                transform: translateY(0)
              }
            }
          `}</style>


          <h2 style={brand}>
            Anaira Graphics
          </h2>

          <p style={subBrand}>
            Digital Solution
          </p>

        </div>


        {/* =====================================
            TITLE
        ====================================== */}

        <h3 style={title}>
          Welcome Back
        </h3>

        <p style={subtitle}>
          Manage your business from one dashboard
        </p>


        {/* =====================================
            ERROR
        ====================================== */}

        {errorMsg && (
          <p style={error}>
            {errorMsg}
          </p>
        )}


        {/* =====================================
            SUCCESS
        ====================================== */}

        {successMsg && (
          <p style={success}>
            {successMsg}
          </p>
        )}


        {/* =====================================
            INPUTS
        ====================================== */}

        <div style={inputWrap}>

          {/* EMAIL */}

          <div style={inputBox}>

            <label style={label}>
              Email
            </label>

            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              style={input}
              autoComplete="email"
            />

          </div>


          {/* PASSWORD */}

          <div style={inputBox}>

            <label style={label}>
              Password
            </label>

            <div style={passwordWrap}>

              <input
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                placeholder="Enter your password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                style={passwordInput}
                autoComplete="current-password"
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword(!showPassword)
                }
                style={eyeButton}
              >
                {showPassword ? "🙈" : "👁️"}
              </button>

            </div>

          </div>

        </div>


        {/* =====================================
            FORGOT PASSWORD
        ====================================== */}

        <div style={forgotWrap}>

          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={resetLoading}
            style={forgotButton}
          >

            {resetLoading
              ? "⏳ Sending..."
              : "Forgot Password?"}

          </button>

        </div>


        {/* =====================================
            LOGIN BUTTON
        ====================================== */}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            ...btn,
            opacity: loading ? 0.7 : 1
          }}

          onMouseEnter={(e) => {

            if (loading) return

            e.currentTarget.style.transform =
              "translateY(-4px)"

            e.currentTarget.style.background =
              "rgba(var(--primary-rgb),.08)"

            e.currentTarget.style.boxShadow =
              "0 20px 40px rgba(var(--primary-rgb),.18)"

          }}

          onMouseLeave={(e) => {

            e.currentTarget.style.transform =
              "translateY(0)"

            e.currentTarget.style.background =
              "transparent"

            e.currentTarget.style.boxShadow =
              "0 10px 25px rgba(var(--primary-rgb),.12)"

          }}
        >

          {loading
            ? "⏳ Signing In..."
            : "Login"}

        </button>


        {/* =====================================
            SECURE BOX
        ====================================== */}

        <div style={secureBox}>
          🔒 Secure Authentication
        </div>


        {/* =====================================
            FOOTER
        ====================================== */}

        <p style={footer}>
          Secure Login • Anaira Graphics
        </p>

      </div>

    </div>
  )
}


/* =========================================================
   UI
========================================================= */

const container = {

  display: "flex",

  justifyContent: "center",

  alignItems: "center",

  minHeight: "100vh",

  background:
    "radial-gradient(circle at top,var(--surface-2),var(--background),#000)",

  position: "relative",

  padding: "20px",

  overflow: "hidden"
}


const box = {

  width: 420,

  maxWidth: "100%",

  boxSizing: "border-box",

  padding: 40,

  borderRadius: 32,

  display: "flex",

  flexDirection: "column",

  gap: 20,

  background:
    "rgba(255,255,255,.03)",

  border:
    "1px solid rgba(255,255,255,.08)",

  backdropFilter:
    "blur(10px)",

  WebkitBackdropFilter:
    "blur(30px)",

  boxShadow:
    "0 40px 100px rgba(0,0,0,.55)",

  position: "relative",

  zIndex: 2
}


const logoBox = {
  textAlign: "center"
}


const logo = {

  width: 100,

  height: 100,

  borderRadius: 22,

  padding: 8,

  background: "var(--text)",

  border:
    "1px solid rgba(var(--primary-rgb),.2)",

  marginBottom: 12
}


const brand = {

  color: "var(--primary)",

  fontSize: 28,

  fontWeight: 800,

  letterSpacing: 1
}


const subBrand = {

  fontSize: 13,

  color: "var(--muted)"
}


const title = {

  color: "var(--text)",

  textAlign: "center",

  fontSize: 26,

  fontWeight: 700
}


const subtitle = {

  color: "var(--muted)",

  textAlign: "center",

  marginTop: -10,

  fontSize: 14
}


const error = {

  color: "var(--danger)",

  fontSize: 13,

  textAlign: "center",

  padding: "10px",

  borderRadius: 12,

  background:
    "rgba(var(--danger-rgb),.08)",

  border:
    "1px solid rgba(var(--danger-rgb),.2)"
}


const success = {

  color: "var(--success)",

  fontSize: 13,

  textAlign: "center",

  padding: "10px",

  borderRadius: 12,

  background:
    "rgba(var(--success-rgb),.08)",

  border:
    "1px solid rgba(var(--success-rgb),.2)"
}


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

  fontSize: 13,

  color: "var(--primary)",

  fontWeight: 600
}


const input = {

  width: "100%",

  boxSizing: "border-box",

  padding: "15px 18px",

  borderRadius: 16,

  border:
    "1px solid rgba(var(--primary-rgb),.2)",

  background: "var(--surface-2)",

  color: "var(--text)",

  outline: "none",

  fontSize: 14,

  transition: "all .3s ease"
}


const passwordWrap = {

  position: "relative",

  width: "100%"
}


const passwordInput = {

  ...input,

  paddingRight: 55
}


const eyeButton = {

  position: "absolute",

  right: 10,

  top: "50%",

  transform: "translateY(-50%)",

  border: "none",

  background: "transparent",

  color: "var(--muted)",

  cursor: "pointer",

  fontSize: 17,

  padding: 6
}


const forgotWrap = {

  display: "flex",

  justifyContent: "flex-end",

  marginTop: -8
}


const forgotButton = {

  border: "none",

  background: "transparent",

  color: "var(--primary)",

  cursor: "pointer",

  fontSize: 13,

  fontWeight: 600,

  padding: 0
}


const btn = {

  marginTop: 5,

  padding: "16px",

  borderRadius: 18,

  background: "transparent",

  border:
    "1px solid rgba(var(--primary-rgb),.35)",

  color: "var(--primary)",

  fontWeight: 800,

  letterSpacing: 1,

  cursor: "pointer",

  transition: "all .35s ease",

  boxShadow:
    "0 10px 25px rgba(var(--primary-rgb),.12)"
}


const secureBox = {

  textAlign: "center",

  fontSize: 12,

  color: "var(--muted)",

  padding: 10,

  borderRadius: 12,

  background:
    "rgba(255,255,255,.03)"
}


const footer = {

  fontSize: 12,

  color: "var(--muted)",

  textAlign: "center",

  marginTop: 10
}


const glow1 = {

  position: "absolute",

  width: 350,

  height: 350,

  borderRadius: "50%",

  background:
    "rgba(var(--primary-rgb),.15)",

  filter: "blur(120px)",

  top: -100,

  left: -100
}


const glow2 = {

  position: "absolute",

  width: 300,

  height: 300,

  borderRadius: "50%",

  background:
    "rgba(var(--info-rgb),.12)",

  filter: "blur(120px)",

  bottom: -100,

  right: -100
}