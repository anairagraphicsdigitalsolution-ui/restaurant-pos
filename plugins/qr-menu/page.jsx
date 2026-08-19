"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function QRMenuPluginPage() {
  const router = useRouter()
  const params = useSearchParams()
  const rid = params.get("rid")

  useEffect(() => {
    let mounted = true

    async function redirectToQRCenter() {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return

      if (!data?.user) {
        router.replace("/login")
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role,restaurant_id")
        .eq("id", data.user.id)
        .maybeSingle()

      if (!mounted || !profile) return

      if (profile.role === "super_admin") {
        router.replace(rid ? `/super-admin/qr?rid=${encodeURIComponent(rid)}` : "/super-admin/qr")
        return
      }

      if (profile.role === "admin") {
        router.replace("/dashboard/qr")
        return
      }

      router.replace("/login")
    }

    redirectToQRCenter()
    return () => { mounted = false }
  }, [router, rid])

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--background)", color: "var(--text)" }}>
      Opening QR Print Center…
    </div>
  )
}
