"use client"

import { useEffect, useRef } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"

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

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let authSubscription: { unsubscribe: () => void } | null = null

    const cleanupChannel = async () => {
      const channel = channelRef.current
      channelRef.current = null
      restaurantRef.current = null
      if (channel) await supabaseCloud.removeChannel(channel)
    }

    const start = async () => {
      if (cancelled) return

      const { data: sessionData } = await supabaseCloud.auth.getSession()
      const user = sessionData?.session?.user || null
      if (!user) {
        retryTimer = setTimeout(start, 1000)
        return
      }

      const { data: profile } = await supabaseCloud
        .from("profiles")
        .select("restaurant_id,role")
        .eq("id", user.id)
        .maybeSingle()

      const restaurantId = profile?.restaurant_id
      if (!restaurantId || profile?.role === "super_admin") {
        retryTimer = setTimeout(start, 1500)
        return
      }

      if (channelRef.current && restaurantRef.current === restaurantId) return
      await cleanupChannel()
      if (cancelled) return

      const channel = supabaseCloud
        .channel(`anaira-central-notifications-${restaurantId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `restaurant_id=eq.${restaurantId}`,
          },
          payload => {
            if (cancelled) return
            window.dispatchEvent(new CustomEvent("anaira:notification", { detail: payload.new as Notice }))
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") return
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            retryTimer = setTimeout(start, 2000)
          }
        })

      channelRef.current = channel
      restaurantRef.current = restaurantId
    }

    const auth = supabaseCloud.auth.onAuthStateChange((_event) => {
      if (retryTimer) clearTimeout(retryTimer)
      // Supabase recommends deferring follow-up work from the auth callback.
      retryTimer = setTimeout(start, 0)
    })
    authSubscription = auth.data.subscription

    void start()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      authSubscription?.unsubscribe()
      void cleanupChannel()
    }
  }, [])

  return null
}
