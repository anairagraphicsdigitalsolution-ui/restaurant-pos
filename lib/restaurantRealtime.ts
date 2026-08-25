import { supabase } from "@/lib/supabase"

type NotificationRow = Record<string, any>
type Subscriber = (row: NotificationRow) => void

type Entry = {
  channel: any
  subscribers: Set<Subscriber>
}

// One Supabase Realtime channel per restaurant. Multiple UI features (bell,
// toast, calling device, notification center) share this channel instead of
// opening independent postgres_changes subscriptions.
const notificationChannels = new Map<string, Entry>()

function ensureChannel(restaurantId: string) {
  const existing = notificationChannels.get(restaurantId)
  if (existing) return existing

  const subscribers = new Set<Subscriber>()
  const channel = supabase
    .channel(`restaurant-events-${restaurantId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `restaurant_id=eq.${restaurantId}`,
      },
      (payload: any) => {
        for (const subscriber of subscribers) {
          try { subscriber(payload.new as NotificationRow) } catch (error) {
            console.error("Realtime notification subscriber error", error)
          }
        }
      }
    )
    .subscribe((status: string) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn(`Restaurant realtime channel ${status}:`, restaurantId)
      }
    })

  const entry = { channel, subscribers }
  notificationChannels.set(restaurantId, entry)
  return entry
}

export function subscribeRestaurantNotifications(
  restaurantId: string | null | undefined,
  subscriber: Subscriber
) {
  if (!restaurantId || typeof subscriber !== "function") return () => {}

  const entry = ensureChannel(restaurantId)
  entry.subscribers.add(subscriber)

  return () => {
    const current = notificationChannels.get(restaurantId)
    if (!current) return
    current.subscribers.delete(subscriber)
    if (current.subscribers.size === 0) {
      notificationChannels.delete(restaurantId)
      void supabase.removeChannel(current.channel)
    }
  }
}

export function getRestaurantRealtimeDebug() {
  return Array.from(notificationChannels.entries()).map(([restaurantId, entry]) => ({
    restaurantId,
    subscribers: entry.subscribers.size,
  }))
}
