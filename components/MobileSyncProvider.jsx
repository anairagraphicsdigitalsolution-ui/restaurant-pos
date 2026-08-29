"use client"

import { useEffect } from "react"
import { supabase, supabaseCloud } from "@/lib/supabase"
import { mobileDbOpen, mobileDbPut } from "@/lib/mobileLocalDb"
import { syncMobileRestaurant } from "@/lib/mobileSyncEngine"
import { getMobileDeviceId } from "@/lib/mobileDevice"

const CORE_TABLES = [
  "restaurants", "profiles", "menu_items", "tables", "rooms",
  "modifier_groups", "modifiers", "menu_item_modifier_groups",
  "delivery_zones", "restaurant_plugins", "plugin_settings", "offers",
  "customers", "orders", "order_items", "order_item_modifiers",
  "restaurant_deliveries", "riders", "order_payments", "order_refunds",
  "inventory", "inventory_transactions", "staff_permissions"
]

async function bootstrapCoreLocal(rid, userId) {
  if (!rid) return
  await mobileDbOpen(rid).catch(() => {})
  for (const table of CORE_TABLES) {
    try {
      let query = supabaseCloud.from(table).select("*")
      if (table === "profiles") query = query.eq("id", userId || "").limit(1)
      else if (table === "restaurants") query = query.eq("id", rid).limit(1)
      else if (["order_item_modifiers", "order_payments", "order_refunds"].includes(table)) query = query.limit(2000)
      else query = query.eq("restaurant_id", rid).limit(1000)
      const { data, error } = await query
      if (error) continue
      for (const row of data || []) {
        const id = row.id || row.restaurant_id || row.order_id
        if (id) await mobileDbPut(rid, table, id, row).catch(() => {})
      }
    } catch {}
  }
}


export default function MobileSyncProvider() {
  useEffect(() => {
    let disposed = false
    let timer = null
    let running = false

    async function runSync(reason = "scheduled") {
      if (disposed || running || typeof window === "undefined" || !navigator.onLine) return
      running = true
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token
        if (!token) return
        const { data: userData } = await supabase.auth.getUser()
        const user = userData?.user
        const restaurantId = user?.user_metadata?.restaurant_id || user?.app_metadata?.restaurant_id || window.localStorage.getItem("anaira.restaurant_id")
        if (!restaurantId) return
        await bootstrapCoreLocal(restaurantId, user?.id)
        await mobileDbOpen(restaurantId)
        window.localStorage.setItem("anaira.device_id", getMobileDeviceId())
        await syncMobileRestaurant(restaurantId, token)
        window.dispatchEvent(new CustomEvent("anaira:mobile-sync", { detail: { restaurantId, reason } }))
      } catch (error) {
        window.dispatchEvent(new CustomEvent("anaira:mobile-sync-error", { detail: { message: error?.message || "Sync failed", reason } }))
      } finally {
        running = false
      }
    }

    const runOnline = () => runSync("network-online")
    const runVisible = () => { if (!document.hidden) runSync("app-visible") }
    const runPageShow = () => runSync("pageshow")
    const onServiceWorkerMessage = event => {
      if (event?.data?.type === "ANAIRA_SYNC_REQUEST") runSync(event.data.reason || "service-worker")
    }

    window.addEventListener("online", runOnline)
    window.addEventListener("pageshow", runPageShow)
    document.addEventListener("visibilitychange", runVisible)
    navigator.serviceWorker?.addEventListener?.("message", onServiceWorkerMessage)
    timer = window.setInterval(() => runSync("interval"), 15000)
    runSync("startup")

    return () => {
      disposed = true
      window.removeEventListener("online", runOnline)
      window.removeEventListener("pageshow", runPageShow)
      document.removeEventListener("visibilitychange", runVisible)
      navigator.serviceWorker?.removeEventListener?.("message", onServiceWorkerMessage)
      if (timer) window.clearInterval(timer)
    }
  }, [])

  return null
}
