"use client"

import { useEffect, useRef } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { useAuth } from "@/components/AuthProvider"

type Notice = {
  id: string
  title?: string | null
  message?: string | null
  action_url?: string | null
  created_at?: string
  type?: string | null
  [key: string]: any
}

export default function RealtimeNotificationProvider() {
  const channelRef = useRef<any>(null)
  const restaurantRef = useRef<string | null>(null)

  const { user, restaurantId, role } = useAuth()

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const cleanupChannel = async () => {
      const channel = channelRef.current
      channelRef.current = null
      restaurantRef.current = null
      if (channel) await supabaseCloud.removeChannel(channel)
    }

    const start = () => {
      if (cancelled || !user || !restaurantId || role === "super_admin") return
      if (channelRef.current && restaurantRef.current === restaurantId) return
      void cleanupChannel().then(() => {
        if (cancelled) return
        const channel = supabaseCloud
          .channel(`anaira-central-notifications-${restaurantId}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `restaurant_id=eq.${restaurantId}` }, payload => {
            if (!cancelled) window.dispatchEvent(new CustomEvent("anaira:notification", { detail: payload.new as Notice }))
          })
          .subscribe(status => {
            if (status === "SUBSCRIBED") return
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              if (retryTimer) clearTimeout(retryTimer)
              retryTimer = setTimeout(start, 4000)
            }
          })
        channelRef.current = channel
        restaurantRef.current = restaurantId
      })
    }

    start()
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      void cleanupChannel()
    }
  }, [user, restaurantId, role])

  return null
}
