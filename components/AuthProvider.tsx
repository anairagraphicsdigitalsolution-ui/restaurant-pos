"use client"

import { useCallback, useEffect, useMemo, useRef, useState, createContext, useContext } from "react"
import { usePathname, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Sidebar from "@/components/Sidebar"
import OrderNotificationListener from "@/components/OrderNotificationListener"

type Role = "staff" | "admin" | "super_admin" | ""
type AuthContextValue = {
  user: any
  role: Role
  restaurantId: string | null
  loading: boolean
}

const HOME_BY_ROLE: Record<Exclude<Role, "">, string> = {
  staff: "/staff",
  admin: "/dashboard",
  super_admin: "/super-admin",
}

function isInternalPath(pathname: string) {
  return [
    "/dashboard",
    "/staff",
    "/super-admin",
    "/admin",
    "/order",
    "/kitchen",
    "/billing",
    "/business-card",
    "/ai",
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function requiredFeatureForPath(pathname: string) {
  // Offers is a legacy/core restaurant feature and must remain accessible.
  // Combo Meals is embedded inside Offers, so it must not be redirected by
  // SaaS feature gating either. Other premium modules remain gated.
  if (pathname.startsWith("/dashboard/reservations")) return "reservations"
  if (pathname.startsWith("/dashboard/reports")) return "analytics"
  if (pathname.startsWith("/dashboard/qr")) return "qr_ordering"
  if (pathname.startsWith("/dashboard/business") && pathname.includes("tab=loyalty")) return "loyalty"
  return null
}

function canAccess(role: Role, pathname: string) {
  if (!isInternalPath(pathname)) return true
  if (role === "super_admin") {
    return pathname === "/super-admin" || pathname.startsWith("/super-admin/") || pathname.startsWith("/ai/") || pathname === "/ai" || pathname === "/business-card"
  }
  if (role === "admin") {
    return pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/order" || pathname === "/kitchen" || pathname.startsWith("/billing") || pathname === "/business-card"
  }
  if (role === "staff") {
    return pathname === "/staff" || pathname === "/order" || pathname === "/kitchen" || pathname.startsWith("/billing")
  }
  return false
}

const AuthContext = createContext<AuthContextValue | null>(null)

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [role, setRole] = useState<Role>("")
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const bootstrapped = useRef(false)
  const syncInFlight = useRef(false)
  const currentUserRef = useRef<any | null>(null)
  const profileCacheRef = useRef<{ userId: string; profile: any } | null>(null)
  const syncingUserIdRef = useRef<string | null | undefined>(undefined)

  const getProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("role, restaurant_id")
      .eq("id", userId)
      .maybeSingle()

    if (error || !data?.role) return null
    const allowedRoles: Role[] = ["staff", "admin", "super_admin"]
    if (!allowedRoles.includes(data.role as Role)) return null

    if (data.role !== "super_admin" && data.restaurant_id) {
      // These two reads are independent, so fetch them together to reduce login latency.
      const [{ data: restaurant }, { data: planData }] = await Promise.all([
        supabase
          .from("restaurants")
          .select("status")
          .eq("id", data.restaurant_id)
          .maybeSingle(),
        supabase.rpc("get_restaurant_plan", { p_restaurant_id: data.restaurant_id }),
      ])

      if (restaurant?.status !== "active") {
        return {
          role: data.role as Role,
          restaurantId: data.restaurant_id || null,
          blocked: true,
          reason: "Restaurant subscription is pending or inactive. Please contact the platform administrator.",
          planFeatures: {}
        } as any
      }

      const plan = planData?.plan || null
      const planFeatures = {
        qr_ordering: plan?.qr_ordering === true,
        loyalty: plan?.loyalty === true,
        offers: plan?.offers === true,
        analytics: plan?.analytics === true,
        reservations: plan?.reservations === true,
        whatsapp: plan?.whatsapp === true,
      }
      const endsAt = planData?.subscription?.ends_at ? new Date(planData.subscription.ends_at).getTime() : null
      const subscriptionLive = planData?.subscription?.status === "active" && (!endsAt || endsAt >= Date.now())
      if (!subscriptionLive || !plan) {
        return {
          role: data.role as Role,
          restaurantId: data.restaurant_id || null,
          blocked: true,
          reason: "Your restaurant does not have an active subscription.",
          planFeatures
        } as any
      }
      return {
        role: data.role as Role,
        restaurantId: data.restaurant_id || null,
        blocked: false,
        planFeatures
      } as any
    }

    return {
      role: data.role as Role,
      restaurantId: data.restaurant_id || null,
      blocked: false,
      planFeatures: {}
    } as any
  }, [])

  const syncQueued = useRef(false)
  const queuedUser = useRef<any | null | undefined>(undefined)
  const redirectingRef = useRef(false)

  const syncAuth = useCallback(async (knownUser: any = undefined) => {
    if (syncInFlight.current) {
      // If the same user is already being synchronized, do not run a second
      // profile/restaurant/plan lookup. This commonly happened on first login
      // when the SIGNED_IN event raced with the initial bootstrap sync.
      const incomingId = knownUser?.id ?? (knownUser === null ? null : undefined)
      if (incomingId === syncingUserIdRef.current) return

      // A different auth state arrived while a sync is running. Queue only
      // that genuinely new state.
      syncQueued.current = true
      queuedUser.current = knownUser
      return
    }

    syncInFlight.current = true
    syncingUserIdRef.current = knownUser?.id ?? (knownUser === null ? null : undefined)
    if (!bootstrapped.current) setLoading(true)

    try {
      let currentUser = knownUser
      if (knownUser === undefined) {
        // After the first successful sync, pathname changes should reuse the
        // current auth user instead of asking Supabase Auth again.
        currentUser = bootstrapped.current ? currentUserRef.current : undefined
        if (currentUser === undefined) {
          const { data: { user } } = await supabase.auth.getUser()
          currentUser = user
        }
      }

      currentUserRef.current = currentUser || null
      setUser(currentUser)

      if (!currentUser) {
        setRole("")
        setRestaurantId(null)
        if (isInternalPath(pathname)) {
          redirectingRef.current = true
          router.replace("/login")
        }
        return
      }

      let profile: any = null

      if (profileCacheRef.current && profileCacheRef.current.userId === currentUser.id) {
        profile = profileCacheRef.current.profile
      }

      if (!profile) {
        profile = await getProfile(currentUser.id)
        if (profile) {
          profileCacheRef.current = { userId: currentUser.id, profile }
        }
      }

      if (!profile) {
        await supabase.auth.signOut()
        currentUserRef.current = null
        profileCacheRef.current = null
        setUser(null)
        setRole("")
        setRestaurantId(null)
        redirectingRef.current = true
        router.replace("/login")
        return
      }

      if ((profile as any).blocked) {
        await supabase.auth.signOut()
        currentUserRef.current = null
        profileCacheRef.current = null
        setUser(null)
        setRole("")
        setRestaurantId(null)
        redirectingRef.current = true
        router.replace(`/login?reason=${encodeURIComponent((profile as any).reason || "Restaurant access is inactive")}`)
        return
      }

      setRole(profile.role)
      setRestaurantId(profile.restaurantId)

      if (pathname === "/login") {
        // Keep the auth gate in its loading state until the role dashboard
        // navigation completes. This prevents the login screen from flashing
        // a second time after a successful sign-in.
        redirectingRef.current = true
        router.replace(HOME_BY_ROLE[profile.role as Exclude<Role, "">])
        return
      }

      const requiredFeature = requiredFeatureForPath(pathname)

      // Feature access can be granted either by the restaurant's plan
      // or by an explicitly enabled restaurant plugin.
      let pluginFeatureEnabled = false

      if (
        profile.role === "admin" &&
        requiredFeature
      ) {
        const { data: pluginRow, error: pluginError } = await supabase
          .from("restaurant_plugins")
          .select("enabled")
          .eq("restaurant_id", profile.restaurantId)
          .eq("plugin_code", requiredFeature)
          .eq("enabled", true)
          .maybeSingle()

        if (pluginError) {
          console.warn("PLUGIN FEATURE CHECK:", pluginError)
        }

        pluginFeatureEnabled = !!pluginRow?.enabled
      }

      if (
        profile.role === "admin" &&
        requiredFeature &&
        (profile as any).planFeatures?.[requiredFeature] !== true &&
        !pluginFeatureEnabled
      ) {
        redirectingRef.current = true
        router.replace("/dashboard")
        return
      }

      if (!canAccess(profile.role, pathname)) {
        router.replace(HOME_BY_ROLE[profile.role as Exclude<Role, "">])
        return
      }
    } catch (error) {
      console.error("AUTH SYNC ERROR:", error)
      currentUserRef.current = null
      profileCacheRef.current = null
      setUser(null)
      setRole("")
      setRestaurantId(null)
      if (isInternalPath(pathname)) router.replace("/login")
    } finally {
      bootstrapped.current = true
      syncInFlight.current = false
      syncingUserIdRef.current = undefined

      // When a successful login is redirecting away from /login, keep the
      // auth gate visible until Next.js completes the navigation. This avoids
      // briefly rendering the login page a second time.
      if (!(redirectingRef.current && pathname === "/login")) {
        redirectingRef.current = false
        setLoading(false)
      }

      if (syncQueued.current) {
        const nextUser = queuedUser.current
        syncQueued.current = false
        queuedUser.current = undefined
        // Run only genuinely new auth state after the current work finishes.
        window.setTimeout(() => syncAuth(nextUser), 0)
      }
    }
  }, [getProfile, pathname, router])

  useEffect(() => {
    syncAuth()

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // Supabase recommends not performing additional Supabase requests
      // directly inside the auth callback. Defer the sync to the next tick
      // so sign-in can finish cleanly before profile/restaurant queries run.
      if (event === "SIGNED_OUT") {
        bootstrapped.current = false
        currentUserRef.current = null
        profileCacheRef.current = null
        window.setTimeout(() => syncAuth(null), 0)
        return
      }

      if (event === "SIGNED_IN" && session?.user) {
        bootstrapped.current = false
        window.setTimeout(() => syncAuth(session.user), 0)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [syncAuth])

  const showSidebar = useMemo(
    () => Boolean(user && role && isInternalPath(pathname)),
    [pathname, role, user]
  )

  const value = useMemo(() => ({
    user,
    role,
    restaurantId,
    loading,
  }), [user, role, restaurantId, loading])

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-card">
          <div className="app-spinner" />
          <strong>Loading Anaira POS…</strong>
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={value}>
      <div className={showSidebar ? "app-shell has-sidebar" : "app-shell"}>
        <OrderNotificationListener user={user} restaurantId={restaurantId} role={role} />
        {showSidebar && <Sidebar role={role} />}
        <main className="app-main">{children}</main>
      </div>
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside AuthProvider")
  return context
}
