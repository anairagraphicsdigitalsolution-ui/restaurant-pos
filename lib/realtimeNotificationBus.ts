import { supabaseCloud } from "@/lib/supabaseCloud"

type Listener = (row: any) => void

type Bucket = {
  listeners: Set<Listener>
  channel: any | null
  started: boolean
}

const buckets = new Map<string, Bucket>()

export function subscribeRestaurantNotifications(restaurantId: string, listener: Listener) {
  if (!restaurantId || typeof listener !== "function") return () => {}

  let bucket = buckets.get(restaurantId)
  if (!bucket) {
    bucket = { listeners: new Set(), channel: null, started: false }
    buckets.set(restaurantId, bucket)
  }

  bucket.listeners.add(listener)

  if (!bucket.started) {
    bucket.started = true
    bucket.channel = supabaseCloud
      .channel(`restaurant-notifications-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        payload => {
          const current = buckets.get(restaurantId)
          if (!current) return
          for (const callback of current.listeners) {
            try { callback(payload.new) } catch (error) { console.error("Realtime notification listener", error) }
          }
        }
      )
      .subscribe()
  }

  return () => {
    const current = buckets.get(restaurantId)
    if (!current) return
    current.listeners.delete(listener)
    if (current.listeners.size === 0) {
      if (current.channel) void supabaseCloud.removeChannel(current.channel)
      buckets.delete(restaurantId)
    }
  }
}
