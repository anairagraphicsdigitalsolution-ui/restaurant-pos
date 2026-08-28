"use client"

import { useEffect, useState } from "react"

export default function LocalServerStatus() {
  const [online, setOnline] = useState(true)
  const [local, setLocal] = useState(false)
  const [mode, setMode] = useState("local")
  const [pending, setPending] = useState(0)

  useEffect(() => {
    let alive = true
    const check = async () => {
      const network = navigator.onLine
      try {
        const res = await fetch("/api/local/health", { cache: "no-store" })
        const data = await res.json()
        if (!alive) return
        setOnline(network)
        setLocal(Boolean(data.localServer))
        if (data.localServer) {
          try {
            const sync = await fetch("/api/local/sync", { cache: "no-store" })
            const syncData = await sync.json()
            setMode(syncData.mode || "local")
            setPending(Number(syncData.pending_count || 0))
          } catch {}

          // Restaurant changes are local-first. When internet is available,
          // push captured local DB events to the Cloud control plane.
          // Never run this from Super Admin pages.
          if (network && !window.location.pathname.startsWith("/super-admin")) {
            try {
              const pushed = await fetch("/api/local/sync/push", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              })
              const pushedData = await pushed.json().catch(() => ({}))
              if (pushedData?.status?.[0]) {
                setMode(pushedData.status[0].mode || "local")
                setPending(Number(pushedData.status[0].pending_count || pushedData.pending || 0))
              }
            } catch {}
          }
        }
      } catch {
        if (alive) {
          setOnline(false)
          setLocal(false)
        }
      }
    }
    check()
    const onOnline = async () => {
      await check()
      if (!window.location.pathname.startsWith("/super-admin")) {
        // Push local-first changes BEFORE pulling Cloud, so offline sales/menu
        // edits are not overwritten when the connection returns.
        try { await fetch("/api/local/sync/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }) } catch {}
        try { await fetch("/api/local/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }) } catch {}
      }
      check()
    }
    const onOffline = () => setOnline(false)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    const timer = setInterval(check, 15000)
    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [])

  if (!local) return null

  return (
    <div
      title={online ? "Local server active — internet available" : "Local server active — internet unavailable"}
      style={{
        position: "fixed", right: 14, bottom: 14, zIndex: 9999,
        padding: "7px 11px", borderRadius: 999,
        background: "rgba(15,23,42,.94)", color: "#fff",
        fontSize: 12, fontWeight: 700, boxShadow: "0 6px 24px rgba(0,0,0,.18)",
      }}
    >
      <span style={{ marginRight: 6 }}>●</span>
      {online ? (mode === "syncing" ? "Local • Syncing" : "Local • Online") : "Local • Offline"}{pending > 0 ? ` • ${pending} pending` : ""}
    </div>
  )
}
