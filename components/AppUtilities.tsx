"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"

type Result = {
  id: string
  type: string
  title: string
  subtitle?: string
  url: string
}

type Props = {
  restaurantId: string | null
  role: string
}

export default function AppUtilities({ restaurantId, role }: Props) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Result[]>([])
  const [searching, setSearching] = useState(false)
  const [unread, setUnread] = useState(0)
  const [toast, setToast] = useState<any>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUnlocked = useRef(false)
  const lastNotificationId = useRef<string | null>(null)

  useEffect(() => {
    const audio = new Audio("/alert.mp3")
    audio.preload = "auto"
    audioRef.current = audio

    const unlock = () => {
      if (audioUnlocked.current) return
      audioUnlocked.current = true
      audio.muted = true
      audio.currentTime = 0
      audio.play().then(() => {
        audio.pause()
        audio.muted = false
        audio.currentTime = 0
      }).catch(() => {
        audio.muted = false
      })
    }

    window.addEventListener("pointerdown", unlock, { once: false, passive: true })
    window.addEventListener("keydown", unlock, { once: false })
    return () => {
      window.removeEventListener("pointerdown", unlock)
      window.removeEventListener("keydown", unlock)
      audio.pause()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!restaurantId || role === "super_admin") return

    let channel: any
    let mounted = true

    async function loadUnread() {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .is("read_at", null)
      if (mounted) setUnread(count || 0)
    }

    async function subscribe() {
      await loadUnread()
      const { data } = await supabase
        .from("notifications")
        .select("id,title,message,type,action_url,created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(1)
      if (data?.[0]) lastNotificationId.current = data[0].id

      const handleNewNotification = async (n: any) => {
        if (!mounted || !n?.id || n.id === lastNotificationId.current) return
        lastNotificationId.current = n.id
        setUnread((value) => value + 1)
        setToast(n)

        const audio = audioRef.current
        if (audio) {
          try {
            audio.pause()
            audio.currentTime = 0
            audio.muted = false
            await audio.play()
          } catch {
            // Browsers can block sound until a user gesture. The visual toast remains active.
          }
        }

        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          try {
            new Notification(n.title || "New notification", {
              body: n.message || "You have a new restaurant notification.",
              icon: "/Logo.png",
            })
          } catch {}
        }

        window.setTimeout(() => mounted && setToast(null), 7000)
      }

      channel = supabase
        .channel(`live-notifications-${restaurantId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `restaurant_id=eq.${restaurantId}` },
          (payload) => handleNewNotification(payload.new)
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `restaurant_id=eq.${restaurantId}` },
          () => loadUnread()
        )
        .subscribe()

      const fallbackTimer = window.setInterval(async () => {
        const { data } = await supabase
          .from("notifications")
          .select("id,title,message,type,action_url,created_at")
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(1)
        const latest = data?.[0]
        if (latest && latest.id !== lastNotificationId.current) {
          const age = Date.now() - new Date(latest.created_at).getTime()
          if (age < 30000) await handleNewNotification(latest)
          else lastNotificationId.current = latest.id
        }
        await loadUnread()
      }, 10000)

      return () => window.clearInterval(fallbackTimer)
    }

    let cleanupFallback: (() => void) | undefined
    subscribe().then((cleanup) => { cleanupFallback = cleanup })
    return () => {
      mounted = false
      if (channel) supabase.removeChannel(channel)
      cleanupFallback?.()
    }
  }, [restaurantId, role])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen(true)
        window.setTimeout(() => document.getElementById("global-app-search")?.focus(), 0)
      }
      if (event.key === "Escape") {
        setSearchOpen(false)
        setQuery("")
        setResults([])
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (!searchOpen || q.length < 2) {
      setResults([])
      return
    }

    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const session = await supabase.auth.getSession()
        const token = session.data.session?.access_token
        if (!token) return
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        const payload = await response.json().catch(() => ({}))
        if (response.ok) {
          const data = Array.isArray(payload.results) ? payload.results : []
          setResults([...getQuickLinks(q), ...data].slice(0, 50))
        }
      } catch (error) {
        console.error("GLOBAL SEARCH ERROR", error)
      } finally {
        setSearching(false)
      }
    }, 220)

    return () => window.clearTimeout(timer)
  }, [query, searchOpen])

  function openResult(result: Result) {
    setSearchOpen(false)
    setQuery("")
    setResults([])
    window.location.href = result.url
  }

  async function enableNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) return
    try {
      await Notification.requestPermission()
    } catch {}
    const audio = audioRef.current
    if (audio) {
      try {
        audio.muted = false
        audio.currentTime = 0
        await audio.play()
        audio.pause()
      } catch {}
    }
  }

  return (
    <>
      <div className="utility-bar">
        <button className="utility-search" onClick={() => { setSearchOpen(true); window.setTimeout(() => document.getElementById("global-app-search")?.focus(), 0) }}>
          🔍 <span>Search anything…</span><kbd>Ctrl K</kbd>
        </button>
        {role !== "super_admin" && (
          <button className="utility-notification" title="Notifications" onClick={() => window.location.href = "/dashboard/notifications"}>
            🔔{unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}
          </button>
        )}
      </div>

      {toast && (
        <div className="order-toast" role="status">
          <div className="toast-icon">🔔</div>
          <div className="toast-copy">
            <strong>{toast.title || "New notification"}</strong>
            <span>{toast.message || "You have a new notification."}</span>
          </div>
          <button onClick={() => { setToast(null); window.location.href = toast.action_url || "/dashboard/notifications" }}>View</button>
          <button className="toast-close" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      {role !== "super_admin" && typeof window !== "undefined" && "Notification" in window && Notification.permission !== "granted" && (
        <button className="enable-notifications" onClick={enableNotifications}>🔔 Enable notifications & sound</button>
      )}

      {searchOpen && (
        <div className="search-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setSearchOpen(false) }}>
          <div className="search-modal">
            <div className="search-head">
              <div><small>ANAIRA SEARCH</small><h2>Search your restaurant</h2></div>
              <button onClick={() => setSearchOpen(false)}>Esc</button>
            </div>
            <div className="search-input-wrap">
              <span>⌕</span>
              <input id="global-app-search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search menu, orders, customers, offers, tables, rooms, reservations…" />
              {searching && <i>Searching…</i>}
            </div>
            <div className="search-results">
              {query.trim().length < 2 ? <div className="search-hint">Type at least 2 characters. Press Ctrl + K anytime.</div> : null}
              {!searching && query.trim().length >= 2 && !results.length ? <div className="search-hint">No matching records found.</div> : null}
              {results.map((r) => (
                <button key={`${r.type}-${r.id}`} className="search-result" onClick={() => openResult(r)}>
                  <span className="result-icon">{iconFor(r.type)}</span>
                  <span><strong>{r.title}</strong><small>{labelFor(r.type)}{r.subtitle ? ` • ${r.subtitle}` : ""}</small></span>
                  <em>›</em>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .utility-bar{position:fixed;top:14px;right:18px;z-index:900;display:flex;gap:8px;align-items:center}
        .utility-search,.utility-notification{border:1px solid rgba(var(--primary-rgb),.2);background:rgba(18,22,28,.88);backdrop-filter:blur(18px);color:var(--text);border-radius:14px;padding:10px 13px;box-shadow:0 12px 35px rgba(0,0,0,.2);cursor:pointer}
        .utility-search{display:flex;align-items:center;gap:8px;min-width:240px;text-align:left}.utility-search span{color:var(--muted);flex:1}.utility-search kbd{font-size:10px;color:var(--muted);padding:3px 6px;border:1px solid rgba(255,255,255,.12);border-radius:6px}
        .utility-notification{position:relative;font-size:18px}.utility-notification b{position:absolute;right:-5px;top:-7px;background:#ef4444;color:#fff;border-radius:999px;font-size:9px;min-width:18px;height:18px;display:grid;place-items:center}
        .order-toast{position:fixed;right:18px;top:72px;z-index:1100;width:min(430px,calc(100vw - 36px));display:flex;align-items:center;gap:12px;padding:14px;border-radius:18px;background:var(--surface);border:1px solid rgba(var(--primary-rgb),.35);box-shadow:0 25px 70px rgba(0,0,0,.35);animation:anairaToastIn .25s ease-out}.toast-icon{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:rgba(var(--primary-rgb),.12);font-size:21px}.toast-copy{min-width:0;flex:1}.toast-copy strong,.toast-copy span{display:block}.toast-copy span{margin-top:3px;color:var(--muted);font-size:12px}.order-toast button{border:0;border-radius:10px;background:rgba(var(--primary-rgb),.12);color:var(--primary);padding:8px 10px;font-weight:800;cursor:pointer}.order-toast .toast-close{background:transparent;color:var(--muted);font-size:18px;padding:3px}.enable-notifications{position:fixed;right:18px;bottom:18px;z-index:1000;border:1px solid rgba(var(--primary-rgb),.25);background:var(--surface);color:var(--text);border-radius:12px;padding:9px 12px;cursor:pointer;box-shadow:0 12px 30px rgba(0,0,0,.2)}
        .search-overlay{position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.58);backdrop-filter:blur(7px);display:flex;justify-content:center;align-items:flex-start;padding:8vh 18px}.search-modal{width:min(820px,100%);max-height:80vh;overflow:hidden;background:var(--surface);border:1px solid rgba(var(--primary-rgb),.25);border-radius:24px;box-shadow:0 35px 100px rgba(0,0,0,.45)}.search-head{display:flex;justify-content:space-between;align-items:center;padding:20px 22px 12px}.search-head small{color:var(--primary);font-size:10px;letter-spacing:1.5px;font-weight:900}.search-head h2{margin:5px 0 0;font-size:22px}.search-head button{border:1px solid rgba(255,255,255,.1);background:var(--surface-2);color:var(--muted);border-radius:8px;padding:5px 8px}.search-input-wrap{margin:0 18px 10px;display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid rgba(var(--primary-rgb),.25);border-radius:15px;background:rgba(255,255,255,.025)}.search-input-wrap span{font-size:22px;color:var(--primary)}.search-input-wrap input{flex:1;background:transparent;border:0;outline:0;color:var(--text);font-size:15px}.search-input-wrap i{font-size:11px;color:var(--muted)}.search-results{max-height:55vh;overflow:auto;padding:6px 12px 14px}.search-hint{padding:32px;text-align:center;color:var(--muted)}.search-result{width:100%;display:flex;align-items:center;gap:12px;text-align:left;padding:13px 10px;border:0;background:transparent;color:var(--text);border-radius:13px;cursor:pointer}.search-result:hover{background:rgba(var(--primary-rgb),.08)}.result-icon{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:var(--surface-2);font-size:18px}.search-result span:nth-child(2){min-width:0;flex:1}.search-result strong,.search-result small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.search-result small{margin-top:3px;color:var(--muted);font-size:11px}.search-result em{font-style:normal;color:var(--muted);font-size:20px}@keyframes anairaToastIn{from{transform:translateY(-10px);opacity:0}to{transform:translateY(0);opacity:1}}
        @media(max-width:720px){.utility-bar{top:10px;right:10px}.utility-search{min-width:0}.utility-search span{display:none}.utility-search kbd{display:none}.order-toast{right:10px;top:64px}.search-overlay{padding:4vh 10px}.search-modal{border-radius:18px}}
      `}</style>
    </>
  )
}

type QuickLink = readonly [title: string, url: string, icon: string]

function getQuickLinks(query: string): Result[] {
  const q = query.trim().toLowerCase()
  const links: QuickLink[] = [
    ["Dashboard", "/dashboard", "📊"],
    ["Orders", "/order", "🧾"],
    ["Kitchen", "/kitchen", "🍳"],
    ["Billing", "/billing", "💰"],
    ["Menu", "/order", "🍽️"],
    ["Offers", "/dashboard/offers", "🎁"],
    ["Combo Meals", "/dashboard/combos", "🍱"],
    ["Customers", "/dashboard/customers", "👥"],
    ["Reservations", "/dashboard/reservations", "📅"],
    ["Tables", "/dashboard/tables", "🪑"],
    ["Inventory", "/dashboard/inventory", "📦"],
    ["Reports & Analytics", "/dashboard/reports", "📈"],
    ["Notifications", "/dashboard/notifications", "🔔"],
    ["Operations Hub", "/dashboard/business", "🧭"],
    ["Theme & Branding", "/dashboard/theme", "🎨"],
  ]

  return links
    .filter(([title]) => title.toLowerCase().includes(q))
    .slice(0, 6)
    .map(([title, url]) => ({
      id: url,
      type: "navigation",
      title,
      subtitle: "Open section",
      url,
    }))
}

function labelFor(type: string) {
  return ({ navigation: "Section", menu: "Menu item", combo: "Combo meal", order: "Order", customer: "Customer", reservation: "Reservation", offer: "Offer", table: "Table", room: "Room", staff: "Staff" } as any)[type] || "Record"
}

function iconFor(type: string) {
  return ({ navigation: "↗", menu: "🍽️", combo: "🍱", order: "🧾", customer: "👤", reservation: "📅", offer: "🎁", table: "🪑", room: "🏨", staff: "👨‍🍳" } as any)[type] || "🔎"
}
