"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabaseCloud } from "@/lib/supabaseCloud"

export default function Home() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkUser = async () => {
      try {
        const {
          data: { user },
        } = await supabaseCloud.auth.getUser()

        // Not logged in
        if (!user) {
          router.replace("/login")
          return
        }

        // Get user role
        const { data: profile, error } = await supabaseCloud
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single()

        if (error || !profile) {
          await supabaseCloud.auth.signOut()
          router.replace("/login")
          return
        }

        switch (profile.role) {
          case "staff":
            router.replace("/staff")
            break

          case "admin":
            router.replace("/dashboard")
            break

          case "super_admin":
            router.replace("/super-admin")
            break

          default:
            await supabaseCloud.auth.signOut()
            router.replace("/login")
        }
      } catch (err) {
        console.error(err)
        router.replace("/login")
      } finally {
        setLoading(false)
      }
    }

    checkUser()
  }, [router])

  return (
    <div style={container}>
      <div style={card}>
        <div style={spinner}></div>

        <h2 style={title}>Anaira Graphics</h2>

        <p style={text}>
          Verifying your account...
        </p>
      </div>
    </div>
  )
}

const container = {
  minHeight: "100vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  background:
    "radial-gradient(circle at top,var(--surface-2),var(--background),#000)",
}

const card = {
  padding: "40px",
  borderRadius: "24px",
  textAlign: "center" as const,
  background: "rgba(var(--surface-2-rgb),.65)",
  backdropFilter: "blur(20px)",
  border: "1px solid rgba(var(--primary-rgb),.15)",
}

const spinner = {
  width: "60px",
  height: "60px",
  margin: "0 auto 20px",
  border: "4px solid rgba(var(--primary-rgb),.15)",
  borderTop: "4px solid var(--primary)",
  borderRadius: "50%",
  animation: "spin 1s linear infinite",
}

const title = {
  color: "var(--primary)",
  fontSize: "28px",
  fontWeight: 800,
  marginBottom: "10px",
}

const text = {
  color: "var(--muted)",
  fontSize: "14px",
}