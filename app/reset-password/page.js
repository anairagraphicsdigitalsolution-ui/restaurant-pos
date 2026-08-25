"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

export default function ResetPassword() {

  const router = useRouter()

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)

  const [errorMsg, setErrorMsg] = useState("")
  const [successMsg, setSuccessMsg] = useState("")


  // =====================================================
  // CHECK PASSWORD RECOVERY SESSION
  // =====================================================

  useEffect(() => {

    let mounted = true

    async function checkSession() {

      const {
        data: {
          session
        }
      } = await supabase.auth.getSession()

      if (!mounted) return

      if (!session) {

        setErrorMsg(
          "Password reset link is invalid or expired."
        )

      }

      setChecking(false)
    }


    checkSession()


    // IMPORTANT:
    // Supabase sends PASSWORD_RECOVERY
    // event when recovery link is opened.

    const {
      data: listener
    } = supabase.auth.onAuthStateChange(
      async (event) => {

        if (
          event === "PASSWORD_RECOVERY"
        ) {

          if (mounted) {
            setErrorMsg("")
            setChecking(false)
          }

        }

      }
    )


    return () => {

      mounted = false

      listener?.subscription?.unsubscribe()

    }

  }, [])


  // =====================================================
  // UPDATE PASSWORD
  // =====================================================

  async function handleUpdatePassword() {

    setErrorMsg("")
    setSuccessMsg("")


    if (!password || !confirmPassword) {

      setErrorMsg(
        "Please enter both password fields."
      )

      return
    }


    if (password.length < 6) {

      setErrorMsg(
        "Password must be at least 6 characters."
      )

      return
    }


    if (password !== confirmPassword) {

      setErrorMsg(
        "Passwords do not match."
      )

      return
    }


    setLoading(true)


    try {

      const {
        error
      } = await supabase.auth.updateUser({
        password
      })


      if (error) {

        setErrorMsg(
          `❌ ${error.message}`
        )

        setLoading(false)

        return
      }


      setSuccessMsg(
        "✅ Password updated successfully."
      )


      // Sign out recovery session
      await supabase.auth.signOut()


      setTimeout(() => {

        router.replace("/login")

      }, 1800)


    } catch (error) {

      console.error(
        "PASSWORD UPDATE ERROR:",
        error
      )

      setErrorMsg(
        "❌ Unable to update password."
      )

    } finally {

      setLoading(false)

    }

  }


  // =====================================================
  // LOADING
  // =====================================================

  if (checking) {

    return (

      <div style={container}>

        <div style={glow1}/>
        <div style={glow2}/>

        <div style={box}>

          <h2 style={title}>
            Checking Reset Link
          </h2>

          <p style={subtitle}>
            Please wait...
          </p>

        </div>

      </div>

    )

  }


  // =====================================================
  // PAGE
  // =====================================================

  return (

    <div style={container}>

      <div style={glow1}/>
      <div style={glow2}/>


      <div style={box}>

        {/* LOGO */}

        <div style={logoBox}>

          <img
            src="/Logo.png"
            style={logo}
          />

          <h2 style={brand}>
            Anaira Graphics
          </h2>

          <p style={subBrand}>
            Digital Solution
          </p>

        </div>


        {/* TITLE */}

        <h3 style={title}>
          Reset Password
        </h3>

        <p style={subtitle}>
          Create a new secure password
        </p>


        {/* ERROR */}

        {errorMsg && (

          <p style={error}>
            {errorMsg}
          </p>

        )}


        {/* SUCCESS */}

        {successMsg && (

          <p style={success}>
            {successMsg}
          </p>

        )}


        {/* PASSWORD */}

        <div style={inputBox}>

          <label style={label}>
            New Password
          </label>

          <div style={passwordWrap}>

            <input
              type={
                showPassword
                  ? "text"
                  : "password"
              }

              placeholder="Enter new password"

              value={password}

              onChange={(e) =>
                setPassword(e.target.value)
              }

              style={passwordInput}

              autoComplete="new-password"
            />

            <button
              type="button"

              onClick={() =>
                setShowPassword(
                  !showPassword
                )
              }

              style={eyeButton}
            >
              {showPassword
                ? "🙈"
                : "👁️"}
            </button>

          </div>

        </div>


        {/* CONFIRM PASSWORD */}

        <div style={inputBox}>

          <label style={label}>
            Confirm Password
          </label>

          <div style={passwordWrap}>

            <input
              type={
                showConfirm
                  ? "text"
                  : "password"
              }

              placeholder="Confirm new password"

              value={confirmPassword}

              onChange={(e) =>
                setConfirmPassword(
                  e.target.value
                )
              }

              style={passwordInput}

              autoComplete="new-password"
            />

            <button
              type="button"

              onClick={() =>
                setShowConfirm(
                  !showConfirm
                )
              }

              style={eyeButton}
            >
              {showConfirm
                ? "🙈"
                : "👁️"}
            </button>

          </div>

        </div>


        {/* UPDATE */}

        <button
          onClick={handleUpdatePassword}

          disabled={
            loading ||
            !!successMsg
          }

          style={{
            ...btn,
            opacity:
              loading ||
              successMsg
                ? 0.7
                : 1
          }}
        >

          {loading
            ? "⏳ Updating..."
            : "Update Password"}

        </button>


        {/* SECURITY */}

        <div style={secureBox}>
          🔒 Secure Password Recovery
        </div>


        <p style={footer}>
          Anaira Graphics • Secure Account
        </p>

      </div>

    </div>

  )
}


/* =========================================================
   STYLES
========================================================= */

const container = {

  display: "flex",

  justifyContent: "center",

  alignItems: "center",

  minHeight: "100vh",

  background:
    "radial-gradient(circle at top,var(--surface-2),var(--background),#000)",

  position: "relative",

  padding: 20,

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

  objectFit: "contain"
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


const passwordWrap = {

  position: "relative",

  width: "100%"
}


const passwordInput = {

  width: "100%",

  boxSizing: "border-box",

  padding: "15px 55px 15px 18px",

  borderRadius: 16,

  border:
    "1px solid rgba(var(--primary-rgb),.2)",

  background: "var(--surface-2)",

  color: "var(--text)",

  outline: "none",

  fontSize: 14
}


const eyeButton = {

  position: "absolute",

  right: 10,

  top: "50%",

  transform:
    "translateY(-50%)",

  border: "none",

  background: "transparent",

  cursor: "pointer",

  fontSize: 17
}


const error = {

  color: "var(--danger)",

  fontSize: 13,

  textAlign: "center",

  padding: 10,

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

  padding: 10,

  borderRadius: 12,

  background:
    "rgba(var(--success-rgb),.08)",

  border:
    "1px solid rgba(var(--success-rgb),.2)"
}


const btn = {

  marginTop: 5,

  padding: 16,

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