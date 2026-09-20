"use client"

import { useEffect } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { syncMobileRestaurant } from "@/lib/mobileSyncEngine"

export default function MobileSyncRuntime() {
  useEffect(() => {
    if (typeof window === "undefined") return undefined
    const isAndroid = /Android/i.test(navigator.userAgent || "") || !!window.Capacitor?.Plugins?.AnairaLocalDb
    if (!isAndroid) return undefined

    let timer = null
    let disposed = false

    async function run() {
      if (disposed || !navigator.onLine) return
      const restaurantId = window.localStorage.getItem("anaira.restaurant_id")
      if (!restaurantId) return
      const { data } = await supabaseCloud.auth.getSession()
      const token = data?.session?.access_token
      if (!token) return
      try {
        const native = window.Capacitor?.Plugins?.AnairaLocalDb
        if (native?.setSyncSession) {
          await native.setSyncSession({ restaurantId, token, apiBase: window.location.origin })
        }
        await syncMobileRestaurant(restaurantId, token)
      } catch (error) { console.warn("Anaira mobile sync:", error?.message || error) }
    }

    const onOnline = () => { void run() }
    window.addEventListener("online", onOnline)
    void run()
    timer = window.setInterval(() => { void run() }, 60000)

    return () => {
      disposed = true
      window.removeEventListener("online", onOnline)
      if (timer) window.clearInterval(timer)
    }
  }, [])

  return null
}
