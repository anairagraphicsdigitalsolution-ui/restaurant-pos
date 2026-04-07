"use client"

import "./globals.css"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Sidebar from "@/components/Sidebar"

export default function RootLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [role, setRole] = useState<string>("")

  // ✅ RUN ONLY ONCE
  useEffect(() => {
    const initAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (!user && pathname !== "/login" && pathname !== "/order") {
        router.replace("/login")
      }

      if (user && pathname === "/login") {
        router.replace("/dashboard")
      }

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single()

        if (profile?.role) setRole(profile.role)
      }

      setLoading(false)
    }

    initAuth()

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
  }, []) // ❗ dependency hata diya

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

          {user && pathname !== "/login" && pathname !== "/order" && (
            <Sidebar role={role} />
          )}

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