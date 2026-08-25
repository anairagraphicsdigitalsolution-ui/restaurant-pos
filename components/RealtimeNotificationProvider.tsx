"use client"

import { useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"

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
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    let cancelled = false
    let channel: any = null

    async function start() {
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData?.session?.user || null
      if (!user || cancelled) return

      const { data: profile } = await supabase
        .from("profiles")
        .select("restaurant_id,role")
        .eq("id", user.id)
        .maybeSingle()

      const restaurantId = profile?.restaurant_id
      if (!restaurantId || profile?.role === "super_admin" || cancelled) return

      channel = supabase
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
        .subscribe()
    }

    void start()
    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [])

  return null
}
