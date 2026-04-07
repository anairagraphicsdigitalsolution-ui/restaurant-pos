"use client"

import "./globals.css"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Sidebar from "@/components/Sidebar"

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [role, setRole] = useState<string>("")

  useEffect(() => {
    checkAuth()

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const currentUser = session?.user || null
        setUser(currentUser)

        if (!currentUser && pathname !== "/login" && pathname !== "/order") {
          router.replace("/login")
        }
      }
    )

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [pathname])

  async function checkAuth() {
    const { data } = await supabase.auth.getUser()
    const currentUser = data?.user

    setUser(currentUser)

    // ❌ Not logged in
    if (!currentUser && pathname !== "/login" && pathname !== "/order") {
      router.replace("/login")
      setLoading(false)
      return
    }

    // ❌ Already logged in → block login page
    if (currentUser && pathname === "/login") {
      router.replace("/dashboard")
      setLoading(false)
      return
    }

    // ✅ GET ROLE
    if (currentUser) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", currentUser.id)
        .single()

      if (profile?.role) {
        setRole(profile.role)
      }
    }

    setLoading(false)
  }

  // ⏳ Loading UI
  if (loading) {
    return (
      <html lang="en">
        <body>
          <div style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100vh"
          }}>
            Loading...
          </div>
        </body>
      </html>
    )
  }

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif" }}>
        <div style={{ display: "flex" }}>

          {/* ✅ Sidebar with role */}
          {user && pathname !== "/login" && pathname !== "/order" && (
            <Sidebar role={role} />
          )}

          {/* ✅ MAIN */}
          <main style={main}>
            {children}
          </main>

        </div>
      </body>
    </html>
  )
}

const main: React.CSSProperties = {
  flex: 1,
  background: "#f1f5f9",
  minHeight: "100vh",
  padding: 20,
}