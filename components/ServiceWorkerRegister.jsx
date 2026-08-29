"use client"
import { useEffect } from "react"
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {})
    }
  }, [])
  return null
}
