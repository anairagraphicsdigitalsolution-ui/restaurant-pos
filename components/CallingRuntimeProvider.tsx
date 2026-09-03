"use client"

import { useCallback, useEffect, useRef } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { useAuth } from "@/components/AuthProvider"
import { speakCallingAnnouncement, unlockCallingAudio } from "@/lib/callingVoice"

type Notice = {
  id: string
  title?: string | null
  message?: string | null
  action_url?: string | null
  type?: string | null
  [key: string]: any
}

const defaults = {
  enabled: true,
  repeat: 3,
  volume: 1,
  rate: .9,
  language: "hi-IN",
  voiceName: "",
  phrase: "New order received. Order {order_number} has arrived.",
  events: { new_order: true, order_ready: false, waiter_call: true },
}

function normaliseConfig(config: any) {
  const c = config && typeof config === "object" ? config : {}
  return {
    enabled: c.enabled !== false,
    repeat: Math.max(1, Math.min(5, Number(c.repeat ?? defaults.repeat))),
    volume: Math.max(0, Math.min(1, Number(c.volume ?? defaults.volume))),
    rate: Math.max(.5, Math.min(2, Number(c.rate ?? defaults.rate))),
    language: c.language || defaults.language,
    voiceName: c.voiceName || "",
    phrase: c.phrase || defaults.phrase,
    events: {
      new_order: c.new_order !== false,
      order_ready: c.order_ready === true,
      waiter_call: c.waiter_call !== false,
    },
  }
}

function announcementFor(row: Notice, config: ReturnType<typeof normaliseConfig>) {
  const type = String(row.type || "order").toLowerCase()
  if (type === "order" && !config.events.new_order) return null
  if ((type === "success" || type === "order_ready") && !config.events.order_ready) return null
  if ((type === "waiter_call" || type === "waiter") && !config.events.waiter_call) return null
  const raw = String(row.message || "A new order has arrived in the kitchen.")
  const orderMatch = raw.match(/Order\s+#?([a-z0-9-]{3,})/i)
  const orderNumber = orderMatch?.[1] || ""
  if (type === "order") return config.phrase.replaceAll("{order_number}", orderNumber)
  return `${row.title || "Restaurant alert"}. ${raw}`
}

export default function CallingRuntimeProvider() {
  const seen = useRef(new Set<string>())
  const configRef = useRef(normaliseConfig(defaults))
  const restaurantRef = useRef<string | null>(null)

  const consume = useCallback((row: Notice) => {
    if (!row?.id || seen.current.has(row.id)) return
    const config = configRef.current
    const text = announcementFor(row, config)
    if (!config.enabled || !text) return

    seen.current.add(row.id)
    void speakCallingAnnouncement(text, config, {
      onError: (error: unknown) => console.error("CALLING VOICE ERROR:", error),
    })
    window.dispatchEvent(new CustomEvent("anaira:calling", { detail: row }))
  }, [])

  const { user, restaurantId, role } = useAuth()

  useEffect(() => {
    let cancelled = false
    let retry: ReturnType<typeof setTimeout> | null = null
    let channel: any = null
    let fallbackHandler: ((event: Event) => void) | null = null

    const cleanup = async () => {
      if (retry) clearTimeout(retry)
      if (fallbackHandler) window.removeEventListener("anaira:notification", fallbackHandler)
      fallbackHandler = null
      if (channel) {
        await supabaseCloud.removeChannel(channel)
        channel = null
      }
      restaurantRef.current = null
    }

    const start = async () => {
      if (cancelled || !user || !restaurantId || role === "super_admin") return

      const { data: plugin, error: pluginError } = await supabaseCloud
        .from("restaurant_plugins")
        .select("enabled")
        .eq("restaurant_id", restaurantId)
        .eq("plugin_code", "calling-device")
        .maybeSingle()
      if (pluginError) {
        retry = setTimeout(start, 5000)
        return
      }
      if (plugin?.enabled !== true) return

      const { data: settings } = await supabaseCloud
        .from("plugin_settings")
        .select("config")
        .eq("restaurant_id", restaurantId)
        .eq("plugin_code", "calling-device")
        .maybeSingle()

      const runtimeConfig = normaliseConfig(settings?.config)
      try {
        const localVoice = window.localStorage.getItem("anaira.calling.voiceName") || ""
        if (localVoice) runtimeConfig.voiceName = localVoice
      } catch {}
      configRef.current = runtimeConfig
      restaurantRef.current = restaurantId

      window.addEventListener("pointerdown", unlockCallingAudio, { once: true, passive: true })
      window.addEventListener("keydown", unlockCallingAudio, { once: true })
      fallbackHandler = event => consume((event as CustomEvent<Notice>).detail)
      window.addEventListener("anaira:notification", fallbackHandler)

      channel = supabaseCloud
        .channel(`anaira-calling-runtime-${restaurantId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `restaurant_id=eq.${restaurantId}` }, payload => consume(payload.new as Notice))
        .subscribe(status => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            if (retry) clearTimeout(retry)
            retry = setTimeout(start, 5000)
          }
        })
    }

    void start()
    return () => {
      cancelled = true
      void cleanup()
      window.removeEventListener("pointerdown", unlockCallingAudio)
      window.removeEventListener("keydown", unlockCallingAudio)
    }
  }, [consume, user, restaurantId, role])

  return null
}
