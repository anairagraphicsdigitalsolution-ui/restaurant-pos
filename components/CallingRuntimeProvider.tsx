"use client"

import { useCallback, useEffect, useRef } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { useAuth } from "@/components/AuthProvider"
import { speakCallingAnnouncement, unlockCallingAudio } from "@/lib/callingVoice"
import { requestBrowserNotificationPermission, showBrowserNotification } from "@/lib/browserNotifications"

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
  events: { new_order: true, order_ready: false, waiter_call: true, payment_received: true, token_ready: false, table_service: false, delivery_ready: false },
  audioAssets: {},
  browserNotifications: true,
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
      new_order: c.events?.new_order ?? (c.new_order !== false),
      order_ready: c.events?.order_ready ?? (c.order_ready === true),
      waiter_call: c.events?.waiter_call ?? (c.waiter_call !== false),
      payment_received: c.events?.payment_received ?? true,
      token_ready: c.events?.token_ready ?? false,
      table_service: c.events?.table_service ?? false,
      delivery_ready: c.events?.delivery_ready ?? false,
    },
    audioAssets: c.audioAssets && typeof c.audioAssets === "object" ? c.audioAssets : {},
    browserNotifications: c.browserNotifications !== false,
  }
}

function eventKeyFor(row: Notice) {
  const type = String(row.type || "").toLowerCase()
  if (type === "order") return "new_order"
  if (["success", "order_ready", "ready"].includes(type)) return "order_ready"
  if (["waiter_call", "waiter", "service_request"].includes(type)) return "waiter_call"
  if (["payment", "payment_received"].includes(type)) return "payment_received"
  if (type.includes("token")) return "token_ready"
  if (type.includes("table")) return "table_service"
  if (type.includes("delivery")) return "delivery_ready"
  return "new_order"
}

function announcementFor(row: Notice, config: ReturnType<typeof normaliseConfig>) {
  const key = eventKeyFor(row)
  if (config.events[key] === false) return null
  const raw = String(row.message || "A new restaurant alert has arrived.")
  const orderMatch = raw.match(/Order\s+#?([a-z0-9-]{3,})/i)
  const orderNumber = orderMatch?.[1] || ""
  const text = key === "new_order" ? String(config.phrase || "").replaceAll("{order_number}", orderNumber) : `${row.title || "Restaurant alert"}. ${raw}`
  return { key, text, audioUrl: String(config.audioAssets?.[key]?.url || "") }
}

export default function CallingRuntimeProvider() {
  const seen = useRef(new Set<string>())
  const configRef = useRef(normaliseConfig(defaults))

  const consume = useCallback((row: Notice) => {
    if (!row?.id || seen.current.has(row.id)) return
    const config = configRef.current
    const announcement = announcementFor(row, config)
    if (!config.enabled || !announcement) return

    seen.current.add(row.id)
    void speakCallingAnnouncement(announcement.text, { ...config, audioUrl: announcement.audioUrl }, {
      onError: (error: unknown) => console.error("CALLING VOICE ERROR:", error),
    })
    showBrowserNotification(row, { enabled: config.browserNotifications, prefix: "Anaira" })
    window.dispatchEvent(new CustomEvent("anaira:calling", { detail: row }))
  }, [])

  const { user, restaurantId, role } = useAuth()

  useEffect(() => {
    let cancelled = false
    let retry: ReturnType<typeof setTimeout> | null = null
    let fallbackHandler: ((event: Event) => void) | null = null
    let unlockAlertsHandler: EventListener | null = null

    const start = async () => {
      if (cancelled || !user || !restaurantId || role === "super_admin") return

      const [{ data: callingPlugin, error: callingPluginError }, { data: callingSettings }, { data: paymentPlugin }, { data: paymentAccount }, { data: smartSettingsRow }] = await Promise.all([
        supabaseCloud.from("restaurant_plugins").select("enabled").eq("restaurant_id", restaurantId).eq("plugin_code", "calling-device").maybeSingle(),
        supabaseCloud.from("plugin_settings").select("config").eq("restaurant_id", restaurantId).eq("plugin_code", "calling-device").maybeSingle(),
        supabaseCloud.from("restaurant_plugins").select("enabled").eq("restaurant_id", restaurantId).eq("plugin_code", "payment-accounts").maybeSingle(),
        supabaseCloud.from("restaurant_payment_accounts").select("settings").eq("restaurant_id", restaurantId).eq("provider", "payment-accounts").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        supabaseCloud.from("plugin_settings").select("config").eq("restaurant_id", restaurantId).eq("plugin_code", "smart-notifications").maybeSingle(),
      ])
      if (callingPluginError) {
        retry = setTimeout(start, 5000)
        return
      }

      const callingEnabled = callingPlugin?.enabled === true
      const paymentEnabled = paymentPlugin?.enabled === true
      if (!callingEnabled && !paymentEnabled) return

      const runtimeConfig = normaliseConfig(callingSettings?.config)
      const paymentSettings = paymentAccount?.settings && typeof paymentAccount.settings === "object" ? paymentAccount.settings : {}

      // Merchant Payments & Voice can run independently. In that case only
      // payment_received is announced, using the merchant's recorded voice
      // first and normal TTS as fallback.
      if (!callingEnabled) {
        runtimeConfig.enabled = paymentSettings.voice_enabled !== false
        runtimeConfig.events = { ...runtimeConfig.events, payment_received: paymentSettings.voice_enabled !== false }
        runtimeConfig.audioAssets = {}
      }

      const smartConfig = smartSettingsRow?.config && typeof smartSettingsRow.config === "object" ? smartSettingsRow.config : {}
      runtimeConfig.browserNotifications = callingEnabled
        ? (runtimeConfig.browserNotifications !== false || smartConfig.browser === true)
        : (paymentSettings.browser_notification !== false || smartConfig.browser === true)

      if (!runtimeConfig.audioAssets?.payment_received?.url && paymentSettings.voice_audio_url) {
        runtimeConfig.audioAssets = {
          ...runtimeConfig.audioAssets,
          payment_received: {
            url: String(paymentSettings.voice_audio_url),
            path: String(paymentSettings.voice_audio_path || ""),
            name: String(paymentSettings.voice_audio_name || "Merchant Payment Voice"),
            source: "merchant-payment",
          },
        }
      }
      try {
        const localVoice = window.localStorage.getItem("anaira.calling.voiceName") || ""
        if (localVoice) runtimeConfig.voiceName = localVoice
      } catch {}
      configRef.current = runtimeConfig

      unlockAlertsHandler = () => {
        unlockCallingAudio()
        if (configRef.current.browserNotifications) void requestBrowserNotificationPermission()
      }
      window.addEventListener("pointerdown", unlockAlertsHandler, { once: true, passive: true })
      window.addEventListener("keydown", unlockAlertsHandler, { once: true })
      fallbackHandler = event => {
        if (!cancelled) consume((event as CustomEvent<Notice>).detail)
      }
      window.addEventListener("anaira:notification", fallbackHandler)
    }
    void start()
    return () => {
      cancelled = true
      if (retry) clearTimeout(retry)
      if (fallbackHandler) window.removeEventListener("anaira:notification", fallbackHandler)
      if (unlockAlertsHandler) {
        window.removeEventListener("pointerdown", unlockAlertsHandler)
        window.removeEventListener("keydown", unlockAlertsHandler)
      }
    }
  }, [consume, user, restaurantId, role, unlockCallingAudio])

  return null
}
