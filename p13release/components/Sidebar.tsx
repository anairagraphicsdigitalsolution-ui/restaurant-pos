"use client"
import { formatIndiaDate } from "@/lib/indiaTime"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import React, {
  useEffect,
  useState,
  CSSProperties
} from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { CORE_FEATURE_CODES, isRestaurantProFeature } from "@/lib/featureCatalog"
import { useAuth } from "@/components/AuthProvider"


/* ✅ ADD PROPS TYPE */
type SidebarProps = {
  role?: string
  drawer?: boolean
  onNavigate?: () => void
}

// Sidebar is mounted across many dashboard routes. Keep a short-lived
// tenant-scoped cache so route changes do not repeat identical Supabase reads.
// Explicit plugin-update events invalidate this cache.
const SIDEBAR_CACHE_TTL_MS = 15_000
const sidebarDataCache = new Map<string, { value: any; cachedAt: number }>()

export default function Sidebar({ role: propRole, drawer = false, onNavigate }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, restaurantId: authRestaurantId, role: authRole } = useAuth()

  const [logo, setLogo] = useState<string>("")
  const [restaurantName, setRestaurantName] = useState("")
  const [userEmail, setUserEmail] = useState("")
  const [role, setRole] = useState<string>(propRole || "")
  const [mobileOpen, setMobileOpen] = useState(false)
  const [staffPermissions] = useState<Record<string, boolean>>({})
  const [permissionsConfigured] = useState(false)
  const [planFeatures, setPlanFeatures] = useState<Record<string, boolean>>({})
  const [planName, setPlanName] = useState("")
  const [planEndsAt, setPlanEndsAt] = useState("")
  const [hubPlugins, setHubPlugins] = useState<Record<string, boolean>>({})
  const [, setFeaturePlugins] = useState<Record<string, boolean>>({})
  const [, setOperationsSettings] = useState<Record<string, any>>({})
  const [openAdminMenus, setOpenAdminMenus] = useState<Record<string, boolean>>({})
  const [manualClosedMenus, setManualClosedMenus] = useState<Record<string, boolean>>({})
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const fetchInFlight = React.useRef(false)

  // Sidebar is a navigation shell, so it must not wait for plugin/plan/
  // notification queries before rendering. Persist the last known shell
  // metadata locally and refresh it in the background. This preserves all
  // feature gating while making navigation/logo appear immediately.
  const sidebarCacheKey = authRestaurantId ? `anaira:sidebar:${authRestaurantId}` : "anaira:sidebar:unknown"

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = window.localStorage.getItem(sidebarCacheKey)
      if (!raw) return
      const cached = JSON.parse(raw)
      if (cached?.restaurantName) setRestaurantName(cached.restaurantName)
      if (cached?.logo) setLogo(cached.logo)
      if (cached?.role) setRole(cached.role)
      if (cached?.planFeatures) {
        setPlanFeatures(cached.planFeatures)
        setFeaturePlugins(cached.planFeatures)
      }
      if (cached?.hubPlugins) setHubPlugins(cached.hubPlugins)
      if (cached?.operationsSettings) setOperationsSettings(cached.operationsSettings)
      if (cached?.planName) setPlanName(cached.planName)
      if (cached?.planEndsAt) setPlanEndsAt(cached.planEndsAt)
      if (typeof cached?.unreadNotifications === "number") setUnreadNotifications(cached.unreadNotifications)
    } catch {}
  }, [sidebarCacheKey])

  useEffect(() => {
    if (user || authRestaurantId || authRole === "super_admin") fetchData()
  }, [user, authRestaurantId, authRole])

  useEffect(() => {
    if (propRole) {
      setRole(propRole)
      if (propRole === "admin" || propRole === "staff") {
        // Core navigation is safe to paint immediately. The background
        // fetch below remains authoritative and can hide gated modules if
        // the restaurant's actual plugin state differs.
        setPlanFeatures(prev => ({
          "restaurant-core": true,
          "pos-core": true,
          "payments": true,
          "kds": true,
          "takeaway": true,
          "delivery": true,
          "table-management": true,
          ...prev,
        }))
      }
    }
  }, [propRole])

  useEffect(() => {
    // The Order POS owns its drawer state. Do not let route/path effects
    // accidentally collapse the drawer while a touch navigation is opening.
    if (!drawer) setMobileOpen(false)
  }, [pathname, drawer])

  async function fetchData(forceRefresh = false) {
    try {
      if (!user || fetchInFlight.current) return

      const resolvedRole = authRole || propRole || ""
      const resolvedRestaurantId = authRestaurantId || null
      setUserEmail(user.email || "")
      setRole(resolvedRole)

      if (resolvedRole === "super_admin") {
        setRestaurantName("Anaira Graphics")
        return
      }

      if (!resolvedRestaurantId) return

      const cached = sidebarDataCache.get(resolvedRestaurantId)
      if (!forceRefresh && cached && (Date.now() - cached.cachedAt) < SIDEBAR_CACHE_TTL_MS) {
        const value = cached.value || {}
        setRestaurantId(resolvedRestaurantId)
        setRestaurantName(value.restaurantName || "")
        setLogo(value.logo || "")
        setPlanFeatures(value.planFeatures || {})
        setFeaturePlugins(value.planFeatures || {})
        setHubPlugins(value.hubPlugins || {})
        setOperationsSettings(value.operationsSettings || {})
        setPlanName(value.planName || "")
        setPlanEndsAt(value.planEndsAt || "")
        setUnreadNotifications(Number(value.unreadNotifications || 0))
        return
      }

      fetchInFlight.current = true
      setRestaurantId(resolvedRestaurantId)

      // Restaurant identity/logo is the most visible part of the sidebar.
      // Resolve it independently so the brand appears as soon as that single
      // request completes instead of waiting for plan/plugins/notifications.
      const restaurantRequest = supabaseCloud
        .from("restaurants")
        .select("id,name,logo,status")
        .eq("id", resolvedRestaurantId)
        .single()

        const backgroundRequests = Promise.all([
          supabaseCloud
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("restaurant_id", resolvedRestaurantId)
            .is("read_at", null),
          supabaseCloud.rpc("get_restaurant_plan", { p_restaurant_id: resolvedRestaurantId }),
          supabaseCloud
            .from("restaurant_plugins")
            .select("plugin_code,enabled")
            .eq("restaurant_id", resolvedRestaurantId),
          supabaseCloud
            .from("plugin_settings")
            .select("plugin_code,config")
            .eq("restaurant_id", resolvedRestaurantId)
            .eq("plugin_code", "operations-hub")
        ])
  
        const { data: rest } = await restaurantRequest
        if (rest) {
          setRestaurantName(rest.name || "")
          setLogo(rest.logo || "")
          try {
            const raw = window.localStorage.getItem(sidebarCacheKey)
            const cached = raw ? JSON.parse(raw) : {}
            window.localStorage.setItem(sidebarCacheKey, JSON.stringify({ ...cached, restaurantName: rest.name || "", logo: rest.logo || "", role: resolvedRole, cachedAt: Date.now() }))
          } catch {}
        }
  
        const [
          { count: unreadCount },
          { data: planData },
          { data: pluginRows },
          { data: operationsSettingRows }
        ] = await backgroundRequests
  
        setUnreadNotifications(unreadCount || 0)
  
        const plan = planData?.plan || null
        const endsAt = planData?.subscription?.ends_at ? new Date(planData.subscription.ends_at).getTime() : null
        setPlanName(plan?.name || "")
        setPlanEndsAt(planData?.subscription?.ends_at || "")
  
        const opsConfig = operationsSettingRows?.[0]?.config || {}
        setOperationsSettings(opsConfig)
  
        const pluginState: Record<string, boolean> = {}
        for (const row of pluginRows || []) {
          pluginState[row.plugin_code] = row.enabled === true
        }
  
        const aliases: Record<string,string[]> = {
          qr: ["qr-ordering-pro","qr-menu"],
          "qr-print-center": ["qr-print-center"],
          loyalty: ["loyalty"],
          offers: ["offers"],
          analytics: ["analytics"],
          reservations: ["reservations-pro","reservations"],
          whatsapp: ["whatsapp-invoice","whatsapp","whatsapp-marketing"],
          marketing: ["facebook-integration","instagram-integration","whatsapp-marketing"],
        }
  
        const resolved: Record<string, boolean> = { ...pluginState }
        const proMasterOn = pluginState["restaurant-pro"] === true
  
        for (const [key, codes] of Object.entries(aliases)) {
          resolved[key] = codes.some(code => pluginState[code] === true)
        }
  
        // Restaurant Core is controlled by its Super Admin master switch.
        // Operations Hub is independent and must never be overwritten by Core.
        const coreOn = pluginState["restaurant-core"] === true
        for (const code of CORE_FEATURE_CODES) {
          if (code === "operations-hub") continue
          resolved[code] = coreOn
        }
  
        // Restaurant Pro is a true master switch. Its child features cannot
        // become visible while the master is OFF.
        for (const row of pluginRows || []) {
          if (isRestaurantProFeature(row.plugin_code)) {
            resolved[row.plugin_code] = proMasterOn && row.enabled === true
          }
        }
  
        // Loyalty remains independent from Restaurant Pro.
        resolved["loyalty"] = pluginState["loyalty"] === true
  
        // Appearance / branding is an independent Super Admin-controlled plugin.
        resolved["marketing"] = ["facebook-integration","instagram-integration","whatsapp-marketing"].some(code => pluginState[code] === true)
  
        resolved["theme-branding"] = pluginState["theme-branding"] === true
        resolved["restaurant-settings"] = pluginState["restaurant-settings"] === true
  
        // Operations Hub is its own master. Cash Closing is one of the only
        // independently switchable children of that master.
        resolved["cash-closing"] =
          pluginState["operations-hub"] === true &&
          opsConfig.cash_closing_enabled !== false
  
        resolved["expenses"] =
          pluginState["operations-hub"] === true &&
          opsConfig.expenses_enabled !== false
  
        setPlanFeatures(resolved)
        setFeaturePlugins(resolved)
  
        const nextHubPlugins = {
          "restaurant-suite": pluginState["restaurant-suite"] === true,
          "operations-hub": pluginState["operations-hub"] === true,
          "restaurant-core": coreOn,
          "restaurant-pro": proMasterOn
        }
        setHubPlugins(nextHubPlugins)

        const shellValue = {
          restaurantName: rest?.name || "",
          logo: rest?.logo || "",
          role: resolvedRole,
          planFeatures: resolved,
          hubPlugins: nextHubPlugins,
          operationsSettings: opsConfig,
          planName: plan?.name || "",
          planEndsAt: planData?.subscription?.ends_at || "",
          unreadNotifications: unreadCount || 0,
        }
        sidebarDataCache.set(resolvedRestaurantId, { value: shellValue, cachedAt: Date.now() })
  
        // Store only the lightweight navigation shell. Do not cache menu/order
        // data here; the POS has its own data/cache strategy.
        try {
          window.localStorage.setItem(sidebarCacheKey, JSON.stringify({
            restaurantName: rest?.name || "",
            logo: rest?.logo || "",
            role: resolvedRole,
            planFeatures: resolved,
            hubPlugins: nextHubPlugins,
            operationsSettings: opsConfig,
            planName: plan?.name || "",
            planEndsAt: planData?.subscription?.ends_at || "",
            unreadNotifications: unreadCount || 0,
            cachedAt: Date.now(),
          }))
        } catch {}
  
      } finally {
      fetchInFlight.current = false
    }
  }
  useEffect(() => {
    if (!restaurantId || role === "super_admin") return
    const handler = () => {
      setUnreadNotifications(value => {
        const next = value + 1
        try {
          const raw = window.localStorage.getItem(`anaira:sidebar:${restaurantId}`)
          const cached = raw ? JSON.parse(raw) : {}
          window.localStorage.setItem(`anaira:sidebar:${restaurantId}`, JSON.stringify({ ...cached, unreadNotifications: next }))
        } catch {}
        return next
      })
    }
    window.addEventListener("anaira:notification", handler)
    return () => window.removeEventListener("anaira:notification", handler)
  }, [restaurantId, role])

  useEffect(() => {
    const refresh = () => {
      fetchData(true)
    }
    window.addEventListener("anaira:plugins-updated", refresh)
    return () => window.removeEventListener("anaira:plugins-updated", refresh)
  }, [user, authRestaurantId, authRole, propRole])

  async function handleLogout() {
    await supabaseCloud.auth.signOut()
    try { await window.Capacitor?.Plugins?.AnairaLocalDb?.clearSyncSession?.() } catch {}
    router.replace("/login")
  }

  const superAdminMenu = [
    { name: "Dashboard", path: "/super-admin", icon: "👑" },
    { name: "Restaurants", path: "/super-admin/restaurants", icon: "🏢" },
    { name: "QR Print Center", path: "/super-admin/qr", icon: "📱" },
    { name: "Platform Theme", path: "/super-admin/theme", icon: "🎨" },
    { name: "Platform Analytics", path: "/super-admin/analytics", icon: "📈" },
    { name: "Marketing", path: "/super-admin/marketing", icon: "📣" },
    { name: "Subscriptions", path: "/super-admin/subscriptions", icon: "💳" },
    { name: "Offer Plan Limits", path: "/super-admin/offer-limits", icon: "🎁" },
    { name: "Audit Logs", path: "/super-admin/audit", icon: "🛡️" },
    { name: "Users", path: "/super-admin/users", icon: "👥" },
    { name: "AI Image", path: "/ai/image", icon: "🎨" },
    { name: "AI Logo", path: "/ai/logo", icon: "🔥" },
    { name: "Poster Maker", path: "/ai/poster", icon: "🪧" },
    { name: "Business Card", path: "/business-card", icon: "💳" }
  ]

  const adminMenu = [
    {
      name: "Admin Panel",
      icon: "⚙️",
      path: "/admin",
      children: [
        { name: "Dashboard", path: "/admin" },
        { name: "Plugins", path: "/admin/plugins" },
      ]
    },
    {
      name: "Restaurant Suite",
      icon: "🍽️",
      path: "/dashboard/restaurant-suite",
      hubPlugin: "restaurant-suite",
      children: [
        { name: "🏠 Unified Control Center", path: "/dashboard/restaurant-suite/unified" },
        { name: "🌐 Channels", path: "/dashboard/restaurant-suite/complete?tab=channels" },
        { name: "🖥️ Website", path: "/dashboard/restaurant-suite/complete?tab=website" },
        { name: "🍱 Virtual Brands", path: "/dashboard/restaurant-suite/complete?tab=brands" },
        { name: "🧾 POS Terminals", path: "/dashboard/restaurant-suite/complete?tab=terminals" },
        { name: "👨‍💼 Staff / Approvals", path: "/dashboard/restaurant-suite/complete?tab=staff" },
        { name: "📢 Menu Publishing", path: "/dashboard/restaurant-suite/complete?tab=menu" },
        { name: "🔗 Integrations", path: "/dashboard/restaurant-suite/complete?tab=integrations" },
      ]
    },
    {
      name: "Payment QR / Merchant Payments",
      icon: "💳",
      path: "/dashboard/payment-qr",
      feature: "payment-accounts",
      children: [
        { name: "Merchant Payment Account", path: "/dashboard/payment-qr" },
        { name: "Payment QR", path: "/dashboard/payment-qr" },
        { name: "Payment Reconciliation", path: "/dashboard/payment-reconciliation", feature: "payment-accounts" },
      ]
    },
    {
      name: "Operations Hub",
      icon: "🧭",
      path: "/dashboard/business",
      hubPlugin: "operations-hub",
      children: [
        { name: "Overview", path: "/dashboard/business" },
        { name: "Customers", path: "/dashboard/business?tab=customers", feature: "crm" },
        { name: "Modifiers", path: "/dashboard/business?tab=modifiers", feature: "combos-variants" },
        { name: "KOT", path: "/dashboard/business?tab=kot", feature: "kds" },
        { name: "Expenses", path: "/dashboard/business?tab=expenses", feature: "expenses" },
        { name: "Cash Closing", path: "/dashboard/cash-closing", feature: "cash-closing" },
        { name: "Attendance", path: "/dashboard/business?tab=attendance", feature: "staff-attendance" },
        { name: "Loyalty", path: "/dashboard/business?tab=loyalty", feature: "loyalty" },
        { name: "Gift Cards", path: "/dashboard/gift-cards", feature: "loyalty" },
        { name: "Payroll", path: "/dashboard/payroll", feature: "staff" },
        { name: "Feedback", path: "/dashboard/business?tab=feedback", feature: "feedback-reviews" },
        { name: "Permissions", path: "/dashboard/business?tab=permissions", feature: "permissions" },
      ]
    },
    {
      name: "Restaurant Pro",
      path: "/dashboard/restaurant-pro",
      hubPlugin: "restaurant-pro",
      children: [
        { name: "Pro Plugins", path: "/dashboard/restaurant-pro" },
        { name: "Captain / Waiter", path: "/staff", feature: "captain-app" },
        { name: "Smart Notifications", path: "/dashboard/notifications", feature: "smart-notifications" },
        { name: "Calling Device", path: "/dashboard/calling", feature: "calling-device" },
        { name: "QR Ordering", path: "/dashboard/qr", feature: "qr-ordering-pro" },
        { name: "QR Print Center", path: "/dashboard/qr?view=print", feature: "qr-print-center" },
      ],
    },
    {
      name: "Restaurant Core",
      icon: "⚡",
      path: "/dashboard/restaurant-core",
      hubPlugin: "restaurant-core",
      children: [
        { name: "POS & Orders", path: "/dashboard/restaurant-core?tab=pos" },
        { name: "Tables", path: "/dashboard/restaurant-core?tab=tables", feature: "table-management" },
        { name: "Kitchen / KDS", path: "/dashboard/restaurant-core?tab=kds", feature: "kds" },
        { name: "Billing", path: "/dashboard/restaurant-core?tab=billing", feature: "payments" },
        { name: "Production Planning", path: "/dashboard/production-planning", feature: "inventory" },
    { name: "Inventory", path: "/dashboard/restaurant-core?tab=inventory", feature: "inventory-advanced" },
        { name: "Delivery", path: "/dashboard/restaurant-core?tab=delivery", feature: "delivery" },
        { name: "Customers", path: "/dashboard/restaurant-core?tab=crm", feature: "crm" },
        { name: "Analytics", path: "/dashboard/restaurant-core?tab=analytics", feature: "analytics" },
      ]
    },
    {
      name: "Marketing Hub",
      icon: "📣",
      path: "/dashboard/marketing",
      feature: "marketing",
      children: [
        { name: "Overview", path: "/dashboard/marketing" },
        { name: "Facebook", path: "/dashboard/marketing?tab=Facebook" },
        { name: "Instagram", path: "/dashboard/marketing?tab=Instagram" },
        { name: "WhatsApp", path: "/dashboard/marketing?tab=WhatsApp" },
        { name: "Content Studio", path: "/dashboard/marketing?tab=Content%20Studio" },
        { name: "Campaigns", path: "/dashboard/marketing?tab=Campaigns" },
        { name: "Leads", path: "/dashboard/marketing?tab=Leads" },
        { name: "Calendar", path: "/dashboard/marketing?tab=Calendar" },
        { name: "Analytics", path: "/dashboard/marketing?tab=Analytics" },
      ]
    },
    {
      name: "Offers",
      icon: "🎁",
      path: "/dashboard/offers",
      feature: "offers",
      children: [
        { name: "All Offers", path: "/dashboard/offers" },
        { name: "Combos", path: "/dashboard/combos", feature: "combos-variants" },
      ]
    },
    {
      name: "Reservations",
      icon: "📅",
      path: "/dashboard/reservations",
      feature: "reservations-pro",
      children: [
        { name: "Table Reservations", path: "/dashboard/reservations", feature: "reservations-pro" },
      ]
    },
    {
      name: "Customers",
      icon: "👥",
      path: "/dashboard/customers",
      anyFeature: ["crm","loyalty","feedback-reviews"],
      children: [
        { name: "Customer CRM", path: "/dashboard/customers", feature: "crm" },
        { name: "Loyalty & Rewards", path: "/dashboard/business?tab=loyalty", feature: "loyalty" },
        { name: "Feedback & Reviews", path: "/dashboard/business?tab=feedback", feature: "feedback-reviews" },
      ]
    },
    {
      name: "QR & Ordering",
      icon: "📱",
      path: "/dashboard/qr",
      // Restaurant Admin sees the QR section only after Super Admin
      // explicitly enables the separate QR Print Center plugin.
      // Advanced QR Ordering remains an independent customer-ordering feature.
      feature: "qr-print-center",
      children: [
        { name: "QR Menu", path: "/dashboard/qr", feature: "qr-print-center" },
        { name: "QR Print Center", path: "/dashboard/qr?view=print", feature: "qr-print-center" },
      ]
    },
    {
      name: "Reports",
      icon: "📊",
      path: "/dashboard/reports",
      feature: "analytics",
      children: [
        { name: "Sales Reports", path: "/dashboard/reports", feature: "analytics" },
        { name: "Analytics", path: "/dashboard/reports", feature: "analytics" },
        { name: "Accounting", path: "/dashboard/accounting", feature: "analytics" },
      ]
    },
    {
      name: "Notifications",
      icon: "🔔",
      path: "/dashboard/notifications",
      feature: "smart-notifications",
      badge: unreadNotifications,
    },
    {
      name: "Settings & Branding",
      icon: "🎨",
      path: "/dashboard/theme",
      feature: "theme-branding",
      children: [
        { name: "Theme & Branding", path: "/dashboard/theme" },
      ]
    },
  ]

  const isStaff = role === "staff"
  const isAdmin = role === "admin"

  const canStaff = (key: string) => !permissionsConfigured || staffPermissions[key] === true

  const mainMenu = [
    ...(isStaff ? [{ name: "Staff Panel", path: "/staff", icon: "👨‍🍳" }] : []),
    ...(isAdmin ? [{ name: "Dashboard", path: "/dashboard", icon: "📊" }] : []),
    ...((isStaff || isAdmin)
      ? [
          ...(isAdmin || canStaff("orders") ? [{ name: "Order", path: "/order", icon: "🧾", feature: "pos-core" }] : []),
          ...(isAdmin || canStaff("kitchen") ? [{ name: "Kitchen", path: "/kitchen", icon: "🍳", feature: "kds" }] : []),
          ...(isAdmin || canStaff("billing") ? [{ name: "Billing", path: "/billing", icon: "💰", feature: "payments" }] : [])
        ]
      : [])
  ]

  function renderLink(item: any, i: number) {
    const active = pathname === item.path.split("?")[0]

    return (
      <Link
        key={i}
        href={item.path}
        style={{
          ...link,
          ...(active && activeLink)
        }}
        onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
          const t = e.currentTarget
          t.style.background = "rgba(var(--primary-rgb),.08)"
          t.style.transform = "translateX(4px)"
        }}
        onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
          const t = e.currentTarget
          t.style.background = active ? "" : "transparent"
          t.style.transform = "translateX(0px)"
        }}
        onClick={onNavigate}
      >
        <span>{item.icon}</span>
        {item.name}
      </Link>
    )
  }

  function renderAdminMenu(item: any, i: number) {
    const visible = (!item.feature || planFeatures[item.feature] === true) &&
      (!item.anyFeature || item.anyFeature.some((feature: string) => planFeatures[feature] === true)) &&
      (!item.hubPlugin || hubPlugins[item.hubPlugin] === true)
    if (!visible) return null

    const visibleChildren = (item.children || []).filter(
      (child: any) => !child.feature || planFeatures[child.feature] === true
    )

    const activeMain = pathname === item.path.split("?")[0] && !item.path.includes("?tab=")
    const currentTab = searchParams.get("tab") || ""
    const childTab = (path: string) => {
      const match = path.match(/[?&]tab=([^&]+)/)
      return match ? decodeURIComponent(match[1]) : ""
    }
    const activeChild = visibleChildren.some((child: any) => {
      if (pathname !== child.path.split("?")[0]) return false
      return childTab(child.path) === currentTab
    })
    const isOpen =
      manualClosedMenus[item.name]
        ? false
        : (openAdminMenus[item.name] ?? (activeMain || activeChild))

    return (
      <div key={item.name + i} style={adminGroup}>
        <div style={adminMainRow}>
          <Link
            href={item.path}
            style={{
              ...adminMainLink,
              ...(activeMain || activeChild ? adminMainLinkActive : {})
            }}
            aria-current={activeMain ? "page" : undefined}
            onClick={onNavigate}
          >
            <span style={{
              ...adminMainIcon,
              ...(activeMain || activeChild ? adminMainIconActive : {})
            }}>
              {item.icon}
            </span>

            <span style={adminMainText}>{item.name}</span>

            {visibleChildren.length > 0 && (
              <span style={adminCount}>
                {visibleChildren.length}
              </span>
            )}

            {Number((item as any).badge || 0) > 0 && (
              <span
                style={{
                  ...adminCount,
                  minWidth: 22,
                  height: 22,
                  padding: "0 6px",
                  background: "rgba(var(--primary-rgb),.16)",
                  borderColor: "rgba(var(--primary-rgb),.35)",
                  color: "var(--primary)",
                }}
                aria-label={`${Number((item as any).badge)} unread notifications`}
              >
                {Number((item as any).badge) > 99 ? "99+" : Number((item as any).badge)}
              </span>
            )}

            {visibleChildren.length > 0 && (
              <span
                role="button"
                aria-label={`${isOpen ? "Collapse" : "Expand"} ${item.name}`}
                aria-expanded={isOpen}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()

                  if (isOpen) {
                    setManualClosedMenus(prev => ({
                      ...prev,
                      [item.name]: true,
                    }))

                    setOpenAdminMenus(prev => ({
                      ...prev,
                      [item.name]: false,
                    }))
                  } else {
                    setManualClosedMenus(prev => ({
                      ...prev,
                      [item.name]: false,
                    }))

                    setOpenAdminMenus({
                      [item.name]: true,
                    })
                  }
                }}
                style={adminChevron}
              >
                <span style={{
                  display:"inline-block",
                  transform:isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition:"transform .18s ease"
                }}>⌄</span>
              </span>
            )}
          </Link>
        </div>

        {visibleChildren.length > 0 && isOpen && (
          <div style={submenuWrap}>
            <div style={submenuInner}>
              {visibleChildren.map((child: any, childIndex: number) => {
                const active = pathname === child.path.split("?")[0] &&
                  ((child.path.match(/[?&]tab=([^&]+)/)?.[1] || "") === (searchParams.get("tab") || ""))

                return (
                  <Link
                    key={child.name + childIndex}
                    href={child.path}
                    style={{
                      ...submenuLink,
                      ...(active ? submenuActive : {})
                    }}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                  >
                    <span style={{
                      ...submenuDot,
                      ...(active ? submenuDotActive : {})
                    }} />
                    <span style={{flex:1,minWidth:0}}>{child.name}</span>
                    {active && <span style={submenuCurrent}>●</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  function Section({ title, children }: { title: string, children?: React.ReactNode }) {
    return (
      <div style={section}>
        <p style={sectionTitle}>{title}</p>
        {children}
      </div>
    )
  }

  return (
    <>
      {!drawer && <button
        type="button"
        className="mobile-menu-button"
        aria-label="Open navigation"
        onClick={() => setMobileOpen(true)}
      >
        ☰
      </button>}

      {!drawer && mobileOpen && (
        <button
          type="button"
          className="mobile-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <style jsx global>{`
        .pos-sidebar a:hover{
          background:rgba(var(--primary-rgb),.055);
        }
        .pos-sidebar a[aria-current="page"]:hover{
          background:rgba(var(--primary-rgb),.11);
        }
        .pos-sidebar [role="button"]:hover{
          color:var(--primary);
          background:rgba(var(--primary-rgb),.08);
        }
        @media(max-width:760px){
          .pos-sidebar .admin-main-row,
          .pos-sidebar .core-menu-main-row{
            gap:6px;
          }
          .pos-sidebar{
            width:min(92vw,330px)!important;
            max-width:330px;
            flex-basis:min(92vw,330px)!important;
          }
        }
      `}</style>

      <aside className={`pos-sidebar${mobileOpen ? " mobile-open" : ""}${drawer ? " pos-sidebar-drawer" : ""}`} style={drawer ? {
        ...sidebar,
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 2147483002,
        width: "min(88vw, 360px)",
        maxWidth: 360,
        minHeight: "100dvh",
        maxHeight: "100dvh",
        height: "100dvh",
        boxSizing: "border-box",
        background: "linear-gradient(180deg,var(--surface),var(--surface-2))",
        color: "var(--text)",
        boxShadow: "24px 0 70px rgba(0,0,0,.48)",
        overflow: "hidden",
        pointerEvents: "auto",
        touchAction: "auto",
      } : sidebar}>
      
      <div style={brandBox}>
        <div style={logoWrap}>
          {role === "super_admin" ? (
            <img
              src="/Logo.png"
              alt="Anaira Graphics"
              width={86}
              height={86}
              decoding="async"
              fetchPriority="high"
              style={superAdminLogoStyle}
            />
          ) : logo ? (
            <img
              src={logo}
              alt="Restaurant Logo"
              width={60}
              height={60}
              decoding="async"
              fetchPriority="high"
              style={logoStyle}
            />
          ) : (
            <div style={logoPlaceholder}>
              🍽️
            </div>
          )}
        </div>

        <h2 style={brand}>
          {role === "super_admin"
            ? "Anaira Graphics"
            : (restaurantName || "Loading…")}
        </h2>

        <p style={subBrand}>
          {role === "super_admin"
            ? "SaaS Control Panel"
            : "Powered by Anaira Graphics"}
        </p>
      </div>

      <div style={profileBox}>
        <p style={email}>{userEmail}</p>
        <span style={roleBadge()}>{role || "Loading…"}</span>
        {role !== "super_admin" && planName && <span style={planBadge}>{planName}{planEndsAt ? ` · ${formatIndiaDate(planEndsAt)}` : ""}</span>}
      </div>

      <div style={{ flex: "1 1 auto", minHeight: 0, minWidth: 0, overflowY: "auto", overflowX: "hidden", paddingRight: 2 }}>
        {role === "super_admin" && (
          <Section title="SUPER ADMIN">
            {superAdminMenu.map(renderLink)}
          </Section>
        )}

        {role !== "super_admin" && (
          <Section title="MAIN MENU">
            {mainMenu.filter((item: any) => !item.feature || planFeatures[item.feature] === true).map(renderLink)}
          </Section>
        )}

        {role === "admin" && (
          <Section title="ADMIN MENU">
            <div style={adminMenuWrap}>
              {adminMenu.map(renderAdminMenu)}
            </div>
          </Section>
        )}
      </div>

      <div style={sidebarFooter}>
        <div className="sidebar-powered-by">
          <img src="/anaira-branding.png" alt="Anaira Graphics" width="120" height="28" loading="lazy" decoding="async" />
          <span>Powered by Anaira Graphics</span>
        </div>

        <button
          onClick={handleLogout}
          style={logoutBtn}
          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.transform = "translateY(-1px)"
          }}
          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.transform = "translateY(0)"
          }}
        >
          🚪 Logout
        </button>
      </div>

    </aside>
    </>
  )
}

/* 🎨 TYPES ADDED */

const planBadge: CSSProperties = { display:"inline-flex", marginTop:8, padding:"5px 9px", borderRadius:999, border:"1px solid rgba(var(--primary-rgb),.22)", background:"rgba(var(--primary-rgb),.08)", color:"var(--primary)", fontSize:10, fontWeight:800, alignSelf:"flex-start" }

const sidebar: CSSProperties = {
  width:"min(264px, 100vw)",
  flex: "0 0 min(264px, 100vw)",
  boxSizing: "border-box",
  position: "sticky",
  top: 0,

  padding:"20px 12px 12px",

  minHeight:0,
  maxHeight:"100dvh",
  height:"100dvh",

  display:"flex",

  flexDirection:"column",

  background:
    "linear-gradient(180deg,var(--surface),var(--surface-2))",

  borderRight:
    "1px solid rgba(var(--primary-rgb),.15)"
}
const brandBox: CSSProperties = { textAlign: "center", marginBottom: 25 }
const logoWrap: CSSProperties = {

  background:
    "rgba(var(--primary-rgb),.04)",

  padding:14,

  borderRadius:20,

  display:"inline-block",

  marginBottom:12,

  border:
    "1px solid rgba(var(--primary-rgb),.15)"
}
const logoStyle: CSSProperties = { width: 60, height: 60, borderRadius: 12 }
const superAdminLogoStyle: CSSProperties = {
  width: 86,
  height: 86,
  objectFit: "contain",
  borderRadius: 16,
  background: "var(--text)",
  padding: 6,
}
const logoPlaceholder: CSSProperties = { fontSize: 32 }

const brand: CSSProperties = {
  color:"var(--text)",

  fontSize:20,

  fontWeight:"800",

  letterSpacing:"0.5px"
}
const subBrand: CSSProperties = { fontSize: 11, color: "var(--muted)" }

const profileBox: CSSProperties = {

  padding:18,

  borderRadius:20,

  background:
    "rgba(255,255,255,.03)",

  border:
    "1px solid rgba(var(--primary-rgb),.12)",

  marginBottom:24
}

const email: CSSProperties = { fontSize: 12, color: "var(--text)" }

const roleBadge = (): CSSProperties => ({

  fontSize:11,

  padding:"6px 12px",

  borderRadius:999,

  marginTop:8,

  display:"inline-block",

  background:
    "rgba(var(--primary-rgb),.08)",

  border:
    "1px solid rgba(var(--primary-rgb),.25)",

  color:"var(--primary)"
})

const adminMenuWrap: CSSProperties = {
  display:"grid",
  gap:4
}

const adminGroup: CSSProperties = {
  width:"100%"
}

const adminMainRow: CSSProperties = {
  width:"100%"
}

const adminMainLink: CSSProperties = {
  minWidth:0,
  width:"100%",
  boxSizing:"border-box",
  display:"flex",
  alignItems:"center",
  gap:9,
  minHeight:43,
  padding:"7px 8px",
  borderRadius:12,
  border:"1px solid transparent",
  textDecoration:"none",
  color:"var(--text)",
  background:"transparent",
  transition:"background .16s ease, border-color .16s ease, color .16s ease",
  cursor:"pointer"
}

const adminMainLinkActive: CSSProperties = {
  color:"var(--primary)",
  background:"rgba(var(--primary-rgb),.085)",
  border:"1px solid rgba(var(--primary-rgb),.22)"
}

const adminMainIcon: CSSProperties = {
  width:29,
  height:29,
  flex:"0 0 29px",
  display:"grid",
  placeItems:"center",
  borderRadius:9,
  background:"rgba(var(--primary-rgb),.055)",
  fontSize:14
}

const adminMainIconActive: CSSProperties = {
  background:"rgba(var(--primary-rgb),.13)"
}

const adminMainText: CSSProperties = {
  minWidth:0,
  flex:1,
  overflow:"hidden",
  textOverflow:"ellipsis",
  whiteSpace:"nowrap",
  fontSize:12.5,
  fontWeight:850,
  lineHeight:1.2
}

const adminCount: CSSProperties = {
  minWidth:19,
  height:19,
  padding:"0 5px",
  boxSizing:"border-box",
  display:"inline-flex",
  alignItems:"center",
  justifyContent:"center",
  borderRadius:999,
  background:"rgba(var(--primary-rgb),.065)",
  border:"1px solid rgba(var(--primary-rgb),.13)",
  color:"var(--muted)",
  fontSize:9,
  fontWeight:900
}

const adminChevron: CSSProperties = {
  width:23,
  height:23,
  flex:"0 0 23px",
  display:"grid",
  placeItems:"center",
  borderRadius:7,
  color:"var(--muted)",
  fontSize:14,
  lineHeight:1
}

const submenuWrap: CSSProperties = {
  margin:"2px 0 5px 18px",
  padding:"3px 0 3px 9px",
  borderLeft:"1px solid rgba(var(--primary-rgb),.16)"
}

const submenuInner: CSSProperties = {
  display:"grid",
  gap:1
}

const submenuLink: CSSProperties = {
  minWidth:0,
  minHeight:31,
  boxSizing:"border-box",
  display:"flex",
  alignItems:"center",
  gap:8,
  padding:"5px 8px",
  borderRadius:8,
  textDecoration:"none",
  color:"var(--muted)",
  background:"transparent",
  fontSize:10.5,
  fontWeight:750,
  lineHeight:1.2,
  transition:"background .14s ease, color .14s ease"
}

const submenuActive: CSSProperties = {
  color:"var(--primary)",
  background:"rgba(var(--primary-rgb),.075)",
  fontWeight:900
}

const submenuDot: CSSProperties = {
  width:4,
  height:4,
  flex:"0 0 4px",
  borderRadius:"50%",
  background:"var(--muted)",
  opacity:.5
}

const submenuDotActive: CSSProperties = {
  background:"var(--primary)",
  opacity:1,
  boxShadow:"0 0 0 3px rgba(var(--primary-rgb),.08)"
}

const submenuCurrent: CSSProperties = {
  color:"var(--primary)",
  fontSize:6
}


const section: CSSProperties = { marginBottom: 15 }
const sectionTitle: CSSProperties = { fontSize: 11, color: "var(--muted)", marginBottom: 6, letterSpacing: "1px" }

const link: CSSProperties = {

  display:"flex",

  alignItems:"center",

  gap:12,

  padding:"14px 16px",

  borderRadius:16,

  textDecoration:"none",

  color:"var(--text)",

  marginBottom:10,

  border:
    "1px solid transparent",

  transition:"all .3s ease"
}

const activeLink: CSSProperties = {
  background: "rgba(var(--primary-rgb),.08)",

  border:
    "1px solid rgba(var(--primary-rgb),.35)",

  color:"var(--primary)",

  boxShadow:
    "0 10px 25px rgba(var(--primary-rgb),.12)"
}

const sidebarFooter: CSSProperties = {
  flex: "0 0 auto",
  minHeight: 0,
  width: "100%",
  boxSizing: "border-box",
  paddingTop: 6,
  paddingBottom: "max(0px, env(safe-area-inset-bottom))",
}

const logoutBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  boxSizing: "border-box",
  flex: "0 0 auto",
  minHeight: 50,
  marginTop: 4,
  padding: "12px 14px",
  borderRadius: 14,
  background: "linear-gradient(135deg,var(--danger),var(--danger))",
  color: "var(--text)",
  border: "none",
  cursor: "pointer",
  fontWeight: "600",
  transition: "0.3s"
}