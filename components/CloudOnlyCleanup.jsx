"use client"

import { useEffect } from "react"

export default function CloudOnlyCleanup() {
  useEffect(() => {
    let cancelled = false
    async function cleanup() {
      if (cancelled || typeof window === "undefined") return
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations()
          await Promise.all(registrations.map((registration) => registration.unregister()))
        }
        if ("caches" in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map((key) => caches.delete(key)))
        }
      } catch {}
    }
    cleanup()
    return () => { cancelled = true }
  }, [])
  return null
}
