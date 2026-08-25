"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"

type NotificationRow = {
  id: string
  type?: string | null
  title?: string | null
  message?: string | null
  action_url?: string | null
  created_at?: string
  read_at?: string | null
  [key: string]: any
}

type CallingRow = NotificationRow

type NotificationContextValue = {
  notifications: NotificationRow[]
  unread: number
  callingEvents: CallingRow[]
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  requestPermission: () => Promise<string>
  permission: string
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

export function NotificationProvider({ restaurantId, role, children }: { restaurantId: string | null, role: string, children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [unread, setUnread] = useState(0)
  const [callingEvents, setCallingEvents] = useState<CallingRow[]>([])
  const [permission, setPermission] = useState<string>(() => typeof Notification === "undefined" ? "unsupported" : Notification.permission)
  const seen = useRef(new Set<string>())
  const mounted = useRef(false)

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return "unsupported"
    try {
      const value = await Notification.requestPermission()
      setPermission(value)
      return value
    } catch { return Notification.permission }
  }, [])

  useEffect(() => {
    mounted.current = true
    if (!restaurantId || role === "super_admin") return () => { mounted.current = false }

    let channel: any
    let cancelled = false

    async function bootstrap() {
      const [{ data: latest }, { count }] = await Promise.all([
        supabase.from("notifications").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(30),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).is("read_at", null)
      ])
      if (cancelled || !mounted.current) return
      const rows = latest || []
      rows.forEach((row: any) => seen.current.add(row.id))
      setNotifications(rows)
      setUnread(count || 0)

      channel = supabase
        .channel(`restaurant-live-${restaurantId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `restaurant_id=eq.${restaurantId}` }, payload => {
          const row = payload.new as NotificationRow
          if (cancelled || !row?.id || seen.current.has(row.id)) return
          seen.current.add(row.id)
          setNotifications(current => [row, ...current].slice(0, 50))
          if (!row.read_at) setUnread(current => current + 1)
          if (row.type === "waiter_call" || row.type === "waiter" || row.type === "order" || row.type === "order_ready") {
            setCallingEvents(current => [row, ...current].slice(0, 30))
          }
        })
        .subscribe()
    }
    void bootstrap()
    return () => {
      cancelled = true
      mounted.current = false
      if (channel) void supabase.removeChannel(channel)
      seen.current.clear()
    }
  }, [restaurantId, role])

  const markRead = useCallback(async (id: string) => {
    if (!restaurantId || !id) return
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("restaurant_id", restaurantId).is("read_at", null)
    if (!error) {
      setNotifications(current => current.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      setUnread(current => Math.max(0, current - 1))
    }
  }, [restaurantId])

  const markAllRead = useCallback(async () => {
    if (!restaurantId || unread === 0) return
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("restaurant_id", restaurantId).is("read_at", null)
    if (!error) {
      setNotifications(current => current.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
      setUnread(0)
    }
  }, [restaurantId, unread])

  const value = useMemo(() => ({ notifications, unread, callingEvents, markRead, markAllRead, requestPermission, permission }), [notifications, unread, callingEvents, markRead, markAllRead, requestPermission, permission])
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

export function useNotifications() {
  const value = useContext(NotificationContext)
  if (!value) throw new Error("useNotifications must be used inside NotificationProvider")
  return value
}
