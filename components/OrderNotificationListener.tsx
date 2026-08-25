"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"

type Notice = {
  id: string
  title: string
  message?: string | null
  action_url?: string | null
  created_at: string
  type?: string
}

function playOrderTone() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65)
    gain.connect(ctx.destination)

    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    osc1.type = "sine"
    osc2.type = "sine"
    osc1.frequency.setValueAtTime(880, now)
    osc1.frequency.setValueAtTime(1175, now + 0.16)
    osc2.frequency.setValueAtTime(659, now)
    osc2.frequency.setValueAtTime(880, now + 0.16)
    osc1.connect(gain)
    osc2.connect(gain)
    osc1.start(now)
    osc2.start(now)
    osc1.stop(now + 0.65)
    osc2.stop(now + 0.65)

    window.setTimeout(() => {
      try { void ctx.close() } catch {}
    }, 900)
  } catch {}
}

export default function OrderNotificationListener({ user, restaurantId, role }: { user: any, restaurantId: string | null, role: string }) {
  const [notice, setNotice] = useState<Notice | null>(null)
  const [permission, setPermission] = useState<string>(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  )
  const seenIds = useRef(new Set<string>())
  const audioUnlocked = useRef(false)

  const unlockAudio = useCallback(() => {
    if (audioUnlocked.current) return
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      if (ctx.state === "suspended") void ctx.resume()
      audioUnlocked.current = true
      window.setTimeout(() => { try { void ctx.close() } catch {} }, 300)
    } catch {}
  }, [])

  const showNotice = useCallback((row: Notice) => {
    if (!row?.id || seenIds.current.has(row.id)) return
    seenIds.current.add(row.id)
    setNotice(row)
    playOrderTone()

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        const n = new Notification(row.title || "New order", {
          body: row.message || "A new order has arrived in the kitchen.",
          tag: `anaira-order-${row.id}`,
          requireInteraction: true,
        })
        n.onclick = () => {
          window.focus()
          if (row.action_url) window.location.href = row.action_url
          n.close()
        }
      } catch {}
    }

    window.setTimeout(() => {
      setNotice(current => current?.id === row.id ? null : current)
    }, 7000)
  }, [])

  const requestPermission = useCallback(async () => {
    unlockAudio()
    if (typeof Notification === "undefined") return
    try {
      const value = await Notification.requestPermission()
      setPermission(value)
    } catch {}
  }, [unlockAudio])

  useEffect(() => {
    window.addEventListener("pointerdown", unlockAudio, { once: true })
    return () => window.removeEventListener("pointerdown", unlockAudio)
  }, [unlockAudio])

  useEffect(() => {
    if (!user || !restaurantId || role === "super_admin") return
    const handler = (event: Event) => {
      const row = (event as CustomEvent<Notice>).detail
      showNotice(row)
    }
    window.addEventListener("anaira:notification", handler)
    return () => window.removeEventListener("anaira:notification", handler)
  }, [user, restaurantId, role, showNotice])

  if (!user || !restaurantId || role === "super_admin") return null

  return (
    <>

      {notice && (
        <button
          type="button"
          onClick={() => {
            if (notice.action_url) window.location.href = notice.action_url
            setNotice(null)
          }}
          style={{
            position: "fixed",
            top: 18,
            right: 18,
            zIndex: 10000,
            width: "min(420px, calc(100vw - 36px))",
            display: "flex",
            alignItems: "center",
            gap: 13,
            textAlign: "left",
            border: "1px solid rgba(var(--primary-rgb),.35)",
            background: "linear-gradient(135deg,var(--surface),var(--surface-2))",
            color: "var(--text)",
            borderRadius: 18,
            padding: 15,
            boxShadow: "0 20px 55px rgba(0,0,0,.35)",
            cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 28 }}>🔔</span>
          <span style={{ minWidth: 0 }}>
            <strong style={{ display: "block", fontSize: 15 }}>{notice.title}</strong>
            <span style={{ display: "block", marginTop: 3, color: "var(--muted)", fontSize: 12 }}>
              {notice.message || "A new order has arrived."}
            </span>
            <span style={{ display: "block", marginTop: 6, color: "var(--primary)", fontSize: 11, fontWeight: 800 }}>
              Tap to open Kitchen
            </span>
          </span>
        </button>
      )}
    </>
  )
}

