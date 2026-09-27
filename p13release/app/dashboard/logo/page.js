"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function LogoSettingsRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/dashboard/theme")
  }, [router])

  return (
    <div className="app-loading">
      <div className="app-loading-card">
        <div className="app-spinner" />
        <strong>Opening Theme & Branding…</strong>
      </div>
    </div>
  )
}
