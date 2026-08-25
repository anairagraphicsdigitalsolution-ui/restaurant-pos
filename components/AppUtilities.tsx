"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
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
  const pathname = usePathname()
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Result[]>([])
  const [searching, setSearching] = useState(false)
  const [unread, setUnread] = useState(0)
  const [toast, setToast] = useState<any>(null)
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUnlocked = useRef(false)
  const lastNotificationId = useRef<string | null>(null)
  const notificationsEnabledRef = useRef(notificationsEnabled)

  useEffect(() => {
    notificationsEnabledRef.current = notificationsEnabled
  }, [notificationsEnabled])

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
    try {
      const saved = window.localStorage.getItem("anaira-notifications-enabled")
      if (saved === "off") setNotificationsEnabled(false)
    } catch {}
  }, [])

  useEffect(() => {
    if (!restaurantId || role === "super_admin") return
    let mounted = true
    async function loadInitial() {
      const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).is("read_at", null)
      if (mounted) setUnread(count || 0)
    }
    void loadInitial()
    const handler = async (event: Event) => {
      const n = (event as CustomEvent<any>).detail
      if (!mounted || !n?.id) return
      if (!n.read_at) setUnread(value => value + 1)
      if (!notificationsEnabledRef.current) return
      setToast(n)
      const audio = audioRef.current
      if (audio) { try { audio.pause(); audio.currentTime = 0; audio.muted = false; await audio.play() } catch {} }
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        try { new Notification(n.title || "New notification", { body: n.message || "You have a new restaurant notification.", icon: "/Logo.png" }) } catch {}
      }
      window.setTimeout(() => mounted && setToast(null), 7000)
    }
    window.addEventListener("anaira:notification", handler)
    return () => { mounted = false; window.removeEventListener("anaira:notification", handler) }
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

  async function setNotificationPreference(enabled: boolean) {
    if (!enabled) {
      setNotificationsEnabled(false)
      setNotificationMenuOpen(false)
      try { window.localStorage.setItem("anaira-notifications-enabled", "off") } catch {}
      setToast(null)
      return
    }

    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        if (Notification.permission !== "granted") {
          const permission = await Notification.requestPermission()
          if (permission !== "granted") {
            setNotificationsEnabled(false)
            try { window.localStorage.setItem("anaira-notifications-enabled", "off") } catch {}
            return
          }
        }
      } catch {}
    }

    setNotificationsEnabled(true)
    try { window.localStorage.setItem("anaira-notifications-enabled", "on") } catch {}
    setNotificationMenuOpen(false)

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
      <header className="app-header" aria-label="Application header">
        <div className="header-context">
          <span className="header-kicker">ANAIRA</span>
          <strong>{pageTitle(pathname, role)}</strong>
        </div>
        <button className="header-search" onClick={() => { setSearchOpen(true); window.setTimeout(() => document.getElementById("global-app-search")?.focus(), 0) }}>
          <span className="header-search-icon">⌕</span>
          <span className="header-search-placeholder">{searchPlaceholder(pathname)}</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="notification-control">
          <button className={`header-notification ${notificationsEnabled ? "is-on" : "is-off"}`} title="Notification settings" aria-label="Notification settings" aria-expanded={notificationMenuOpen} onClick={() => setNotificationMenuOpen((value) => !value)}>
            🔔{unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}
          </button>
          {notificationMenuOpen && (
            <div className="notification-menu" role="dialog" aria-label="Notification settings">
              <div className="notification-menu-head">
                <div><small>NOTIFICATIONS</small><strong>Alerts & sound</strong></div>
                <span className={notificationsEnabled ? "status-on" : "status-off"}>{notificationsEnabled ? "ON" : "OFF"}</span>
              </div>
              <button className="notification-toggle-row" onClick={() => setNotificationPreference(!notificationsEnabled)}>
                <span><strong>Notifications</strong><small>{notificationsEnabled ? "New alerts are enabled" : "Alerts are turned off"}</small></span>
                <span className={`toggle-switch ${notificationsEnabled ? "checked" : ""}`} aria-hidden="true"><i /></span>
              </button>
              <button className="notification-view-all" onClick={() => { setNotificationMenuOpen(false); window.location.href = role === "super_admin" ? "/super-admin/audit" : "/dashboard/notifications" }}>View notification center →</button>
            </div>
          )}
        </div>
      </header>

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
        .app-header{position:sticky;top:0;z-index:900;width:100%;min-height:72px;display:grid;grid-template-columns:minmax(170px,1fr) minmax(280px,680px) auto;align-items:center;gap:14px;padding:12px 18px;background:color-mix(in srgb,var(--surface) 88%,transparent);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-bottom:1px solid rgba(var(--primary-rgb),.14);box-shadow:0 10px 28px rgba(0,0,0,.12)}
        .header-context{min-width:0;display:flex;flex-direction:column;gap:3px}.header-kicker{font-size:9px;letter-spacing:1.6px;font-weight:900;color:var(--primary)}.header-context strong{font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .header-search{min-width:0;width:100%;height:44px;display:flex;align-items:center;gap:10px;padding:0 12px;border:1px solid rgba(var(--primary-rgb),.18);border-radius:14px;background:rgba(255,255,255,.035);color:var(--text);cursor:text;text-align:left}.header-search:hover{border-color:rgba(var(--primary-rgb),.35);background:rgba(var(--primary-rgb),.045)}.header-search-icon{font-size:20px;color:var(--primary);line-height:1}.header-search-placeholder{flex:1;min-width:0;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.header-search kbd{flex:0 0 auto;font-size:10px;color:var(--muted);padding:4px 7px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:rgba(255,255,255,.03)}
        .notification-control{position:relative}.header-notification{position:relative;width:44px;height:44px;display:grid;place-items:center;border:1px solid rgba(var(--primary-rgb),.18);background:rgba(255,255,255,.035);color:var(--text);border-radius:14px;font-size:18px;cursor:pointer;transition:.2s ease}.header-notification:hover{background:rgba(var(--primary-rgb),.08);border-color:rgba(var(--primary-rgb),.3);transform:translateY(-1px)}.header-notification.is-on{box-shadow:0 0 0 1px rgba(34,197,94,.12)}.header-notification.is-off{opacity:.72}.header-notification b{position:absolute;right:-5px;top:-6px;background:var(--danger);color:var(--text);border-radius:999px;font-size:9px;min-width:18px;height:18px;display:grid;place-items:center;border:2px solid var(--surface)}.notification-menu{position:absolute;right:0;top:52px;width:300px;padding:12px;border-radius:18px;background:var(--surface);border:1px solid rgba(var(--primary-rgb),.18);box-shadow:0 24px 70px rgba(0,0,0,.35);z-index:1200}.notification-menu-head{display:flex;align-items:center;justify-content:space-between;padding:4px 4px 10px}.notification-menu-head small{display:block;color:var(--muted);font-size:9px;letter-spacing:.14em}.notification-menu-head strong{display:block;margin-top:2px;font-size:14px}.status-on,.status-off{font-size:10px;font-weight:900;border-radius:999px;padding:5px 8px}.status-on{color:var(--success);background:rgba(34,197,94,.1)}.status-off{color:var(--warning);background:rgba(245,158,11,.1)}.notification-toggle-row{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid rgba(var(--primary-rgb),.12);border-radius:14px;background:rgba(255,255,255,.025);color:var(--text);text-align:left;cursor:pointer}.notification-toggle-row:hover{background:rgba(var(--primary-rgb),.07)}.notification-toggle-row strong,.notification-toggle-row small{display:block}.notification-toggle-row small{margin-top:3px;color:var(--muted);font-size:11px}.toggle-switch{width:42px;height:24px;border-radius:999px;background:rgba(148,163,184,.25);padding:3px;flex:none;transition:.2s}.toggle-switch i{display:block;width:18px;height:18px;border-radius:50%;background:var(--text);transition:.2s;box-shadow:0 2px 5px rgba(0,0,0,.25)}.toggle-switch.checked{background:var(--success)}.toggle-switch.checked i{transform:translateX(18px)}.notification-view-all{width:100%;margin-top:8px;padding:10px;border:0;background:transparent;color:var(--primary);font-weight:800;text-align:left;cursor:pointer;border-radius:10px}.notification-view-all:hover{background:rgba(var(--primary-rgb),.07)}
        .order-toast{position:fixed;right:18px;top:72px;z-index:1100;width:min(430px,calc(100vw - 36px));display:flex;align-items:center;gap:12px;padding:14px;border-radius:18px;background:var(--surface);border:1px solid rgba(var(--primary-rgb),.35);box-shadow:0 25px 70px rgba(0,0,0,.35);animation:anairaToastIn .25s ease-out}.toast-icon{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:rgba(var(--primary-rgb),.12);font-size:21px}.toast-copy{min-width:0;flex:1}.toast-copy strong,.toast-copy span{display:block}.toast-copy span{margin-top:3px;color:var(--muted);font-size:12px}.order-toast button{border:0;border-radius:10px;background:rgba(var(--primary-rgb),.12);color:var(--primary);padding:8px 10px;font-weight:800;cursor:pointer}.order-toast .toast-close{background:transparent;color:var(--muted);font-size:18px;padding:3px}
        .search-overlay{position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.58);backdrop-filter:blur(7px);display:flex;justify-content:center;align-items:flex-start;padding:8vh 18px}.search-modal{width:min(820px,100%);max-height:80vh;overflow:hidden;background:var(--surface);border:1px solid rgba(var(--primary-rgb),.25);border-radius:24px;box-shadow:0 35px 100px rgba(0,0,0,.45)}.search-head{display:flex;justify-content:space-between;align-items:center;padding:20px 22px 12px}.search-head small{color:var(--primary);font-size:10px;letter-spacing:1.5px;font-weight:900}.search-head h2{margin:5px 0 0;font-size:22px}.search-head button{border:1px solid rgba(255,255,255,.1);background:var(--surface-2);color:var(--muted);border-radius:8px;padding:5px 8px}.search-input-wrap{margin:0 18px 10px;display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid rgba(var(--primary-rgb),.25);border-radius:15px;background:rgba(255,255,255,.025)}.search-input-wrap span{font-size:22px;color:var(--primary)}.search-input-wrap input{flex:1;background:transparent;border:0;outline:0;color:var(--text);font-size:15px}.search-input-wrap i{font-size:11px;color:var(--muted)}.search-results{max-height:55vh;overflow:auto;padding:6px 12px 14px}.search-hint{padding:32px;text-align:center;color:var(--muted)}.search-result{width:100%;display:flex;align-items:center;gap:12px;text-align:left;padding:13px 10px;border:0;background:transparent;color:var(--text);border-radius:13px;cursor:pointer}.search-result:hover{background:rgba(var(--primary-rgb),.08)}.result-icon{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:var(--surface-2);font-size:18px}.search-result span:nth-child(2){min-width:0;flex:1}.search-result strong,.search-result small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.search-result small{margin-top:3px;color:var(--muted);font-size:11px}.search-result em{font-style:normal;color:var(--muted);font-size:20px}@keyframes anairaToastIn{from{transform:translateY(-10px);opacity:0}to{transform:translateY(0);opacity:1}}
        @media(max-width:900px){.app-header{grid-template-columns:auto minmax(0,1fr) auto}.header-context{display:none}}@media(max-width:520px){.notification-menu{right:-6px;width:min(300px,calc(100vw - 20px))}.app-header{min-height:62px;padding:9px 10px;gap:8px}.header-search{height:40px}.header-search-placeholder{font-size:11px}.header-search kbd{display:none}.header-notification{width:40px;height:40px}.order-toast{right:10px;top:70px}.search-overlay{padding:4vh 10px}.search-modal{border-radius:18px}}
      `}</style>
    </>
  )
}

function pageTitle(pathname: string, role: string) {
  if (role === "super_admin") {
    if (pathname === "/super-admin") return "Super Admin Dashboard"
    if (pathname.includes("/super-admin/users")) return "Users & Merchant Accounts"
    if (pathname.includes("/super-admin/restaurants")) return "Restaurants"
    if (pathname.includes("/super-admin/plugins")) return "Plugins"
    if (pathname.includes("/super-admin/subscriptions")) return "Subscriptions"
    if (pathname.includes("/super-admin/analytics")) return "Platform Analytics"
    if (pathname.includes("/super-admin/audit")) return "Audit Logs"
    return "SaaS Control Panel"
  }
  const map: Record<string,string> = {
    "/dashboard":"Dashboard", "/order":"Orders", "/kitchen":"Kitchen / KDS", "/billing":"Billing", "/dashboard/offers":"Offers",
    "/dashboard/customers":"Customers", "/dashboard/reservations":"Reservations", "/dashboard/tables":"Tables", "/dashboard/reports":"Reports & Analytics",
    "/dashboard/delivery":"Delivery", "/dashboard/notifications":"Notifications", "/dashboard/business":"Operations Hub",
    "/dashboard/restaurant-pro":"Restaurant Pro", "/dashboard/restaurant-core":"Restaurant Core", "/dashboard/restaurant-suite":"Restaurant Suite",
  }
  return map[pathname] || (pathname.startsWith("/billing/") ? "Billing" : "Restaurant Admin")
}

function searchPlaceholder(pathname: string) {
  if (pathname === "/order") return "Search orders, invoices, menu items, customers…"
  if (pathname === "/billing" || pathname.startsWith("/billing/")) return "Search bills, orders, customers, offers…"
  if (pathname.includes("customers")) return "Search customers, phone, email, orders…"
  if (pathname.includes("offers")) return "Search offers, products, categories…"
  if (pathname.includes("reservations")) return "Search reservations, guests, phone…"
  if (pathname.includes("tables")) return "Search tables, seats, status…"
  if (pathname.includes("reports")) return "Search reports, sales, payment records…"
  if (pathname.includes("kitchen")) return "Search KOTs, orders, tables…"
  if (pathname.includes("delivery")) return "Search delivery orders, customers, riders…"
  if (pathname.startsWith("/super-admin")) return "Search restaurants, users, plugins, subscriptions…"
  return "Search anything…"
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
