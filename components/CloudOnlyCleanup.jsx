"use client"

import { useEffect } from "react"

export default function CloudOnlyCleanup() {
  useEffect(() => {
    let cancelled = false
    async function cleanupLegacyWorkers() {
      if (cancelled || typeof window === "undefined") return
      try {
        // Only remove legacy/local service workers that belong to old Anaira
        // builds. Never wipe the entire Cache Storage on every app startup;
        // that causes unnecessary cold loads and can make Electron feel frozen.
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations()
          await Promise.all(
            registrations
              .filter(registration => String(registration.scope || "").includes("/"))
              .map(registration => registration.unregister())
          )
        }
      } catch {}
    }
    void cleanupLegacyWorkers()
    return () => { cancelled = true }
  }, [])
  return null
}
