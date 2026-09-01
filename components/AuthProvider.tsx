"use client"

import { useCallback, useEffect, useMemo, useRef, useState, createContext, useContext } from "react"
import { usePathname, useRouter } from "next/navigation"
import { supabaseCloud } from "@/lib/supabaseCloud"
import Sidebar from "@/components/Sidebar"
import AppUtilities from "@/components/AppUtilities"

type Role = "staff" | "admin" | "super_admin" | ""
type AuthContextValue = { user: any; role: Role; restaurantId: string | null; loading: boolean }

const HOME_BY_ROLE: Record<Exclude<Role, "">, string> = {
  staff: "/staff", admin: "/dashboard", super_admin: "/super-admin",
}

function isInternalPath(pathname: string) {
  return ["/dashboard","/staff","/super-admin","/admin","/order","/kitchen","/billing","/business-card","/ai"]
    .some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function requiredFeatureForPath(pathname: string) {
  if (pathname.startsWith("/dashboard/reservations")) return "reservations-pro"
  if (pathname.startsWith("/dashboard/reports")) return "analytics"
  if (pathname.startsWith("/dashboard/qr")) return "qr-print-center"
  if (pathname.startsWith("/dashboard/theme") || pathname.startsWith("/dashboard/logo")) return "theme-branding"
  if (pathname.startsWith("/dashboard/business") && pathname.includes("tab=loyalty")) return "loyalty"
  return null
}

function canAccess(role: Role, pathname: string, staffPermissions: Record<string, boolean> = {}) {
  if (!isInternalPath(pathname)) return true
  if (role === "staff") {
    const permissionForPath =
      pathname === "/order" ? "orders" :
      pathname.startsWith("/kitchen") ? "kitchen" :
      pathname.startsWith("/billing") ? "billing" :
      pathname.includes("/dashboard/business") && pathname.includes("tab=customers") ? "customers" :
      pathname.includes("/dashboard/business") && pathname.includes("tab=expenses") ? "expenses" :
      pathname.includes("/dashboard/business") && pathname.includes("tab=attendance") ? "attendance" :
      pathname.startsWith("/dashboard/reports") ? "reports" : null
    if (permissionForPath && staffPermissions[permissionForPath] !== true) return false
  }
  if (role === "super_admin") return pathname === "/super-admin" || pathname.startsWith("/super-admin/") || pathname.startsWith("/ai/") || pathname === "/ai" || pathname === "/business-card"
  if (role === "admin") return pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/order" || pathname === "/kitchen" || pathname.startsWith("/billing") || pathname === "/business-card"
  if (role === "staff") return pathname === "/staff" || pathname === "/order" || pathname === "/kitchen" || pathname.startsWith("/billing")
  return false
}

const AuthContext = createContext<AuthContextValue | null>(null)

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [loading,setLoading]=useState(true), [user,setUser]=useState<any>(null), [role,setRole]=useState<Role>(""), [restaurantId,setRestaurantId]=useState<string|null>(null)
  const [staffPermissions,setStaffPermissions]=useState<Record<string,boolean>>({})
  const bootstrapped=useRef(false), syncInFlight=useRef(false), currentUserRef=useRef<any|null>(null)
  const profileCacheRef=useRef<{userId:string;profile:any}|null>(null), redirectingRef=useRef(false)

  const getProfile=useCallback(async(userId:string,authUser:any=null)=>{
    const {data}=await supabaseCloud.from("profiles").select("role,restaurant_id").eq("id",userId).maybeSingle()
    const allowedRoles:Role[]=["staff","admin","super_admin"]
    let resolvedRole:Role=allowedRoles.includes(data?.role as Role)?data?.role as Role:""
    let resolvedRestaurantId:string|null=data?.restaurant_id||null
    if(!resolvedRestaurantId && resolvedRole!=="super_admin"){
      const metadataRestaurantId=authUser?.user_metadata?.restaurant_id||authUser?.app_metadata?.restaurant_id||null
      if(metadataRestaurantId){
        const {data:restaurant}=await supabaseCloud.from("restaurants").select("id").eq("id",metadataRestaurantId).maybeSingle()
        if(restaurant?.id) resolvedRestaurantId=restaurant.id
      }
    }
    if(!resolvedRestaurantId && resolvedRole!=="super_admin"){
      const {data:ownedRestaurant}=await supabaseCloud.from("restaurants").select("id").eq("owner_id",userId).order("created_at",{ascending:true}).limit(1).maybeSingle()
      if(ownedRestaurant?.id){ resolvedRestaurantId=ownedRestaurant.id; if(!resolvedRole) resolvedRole="admin" }
    }
    if(!resolvedRole) return null
    if(resolvedRole!=="super_admin" && resolvedRestaurantId){
      const [{data:restaurant},{data:planData}]=await Promise.all([
        supabaseCloud.from("restaurants").select("status").eq("id",resolvedRestaurantId).maybeSingle(),
        supabaseCloud.rpc("get_restaurant_plan",{p_restaurant_id:resolvedRestaurantId})
      ])
      if(restaurant?.status!=="active") return {role:resolvedRole,restaurantId:resolvedRestaurantId,blocked:true,reason:"Restaurant subscription is pending or inactive. Please contact the platform administrator.",planFeatures:{}} as any
      const plan=planData?.plan||null
      const planFeatures={qr_ordering:plan?.qr_ordering===true,loyalty:plan?.loyalty===true,offers:plan?.offers===true,analytics:plan?.analytics===true,reservations:plan?.reservations===true,whatsapp:plan?.whatsapp===true}
      const endsAt=planData?.subscription?.ends_at?new Date(planData.subscription.ends_at).getTime():null
      const subscriptionLive=planData?.subscription?.status==="active"&&(!endsAt||endsAt>=Date.now())
      if(!subscriptionLive||!plan) return {role:resolvedRole,restaurantId:resolvedRestaurantId,blocked:true,reason:"Your restaurant does not have an active subscription.",planFeatures} as any
      return {role:resolvedRole,restaurantId:resolvedRestaurantId,blocked:false,planFeatures} as any
    }
    return {role:resolvedRole,restaurantId:resolvedRestaurantId,blocked:false,planFeatures:{}} as any
  },[])

  const syncAuth=useCallback(async(knownUser:any=undefined)=>{
    if(syncInFlight.current)return
    syncInFlight.current=true
    if(!bootstrapped.current)setLoading(true)
    try{
      let currentUser=knownUser
      if(currentUser===undefined){
        const {data:{user:authUser}}=await supabaseCloud.auth.getUser()
        currentUser=authUser
      }
      currentUserRef.current=currentUser||null
      setUser(currentUser)
      if(!currentUser){
        setRole("");setRestaurantId(null)
        if(isInternalPath(pathname)){redirectingRef.current=true;router.replace("/login")}
        return
      }
      const cachedProfile = profileCacheRef.current
      let profile = cachedProfile && cachedProfile.userId === currentUser.id ? cachedProfile.profile : null
      if(!profile){profile=await getProfile(currentUser.id,currentUser);if(profile)profileCacheRef.current={userId:currentUser.id,profile}}
      if(!profile){
        await supabaseCloud.auth.signOut();setUser(null);setRole("");setRestaurantId(null);profileCacheRef.current=null
        if(isInternalPath(pathname))router.replace("/login")
        return
      }
      if(profile.blocked){
        await supabaseCloud.auth.signOut();setUser(null);setRole("");setRestaurantId(null);profileCacheRef.current=null
        router.replace(`/login?reason=${encodeURIComponent(profile.reason||"Restaurant access is inactive")}`);return
      }
      setRole(profile.role);setRestaurantId(profile.restaurantId)
      let permissions:Record<string,boolean>={}
      if(profile.role==="staff"&&profile.restaurantId){
        const {data:rows}=await supabaseCloud.from("staff_permissions").select("permission_key,enabled").eq("restaurant_id",profile.restaurantId).eq("staff_id",currentUser.id)
        for(const row of rows||[])permissions[row.permission_key]=row.enabled===true
      }
      setStaffPermissions(permissions)
      const requiredFeature=requiredFeatureForPath(pathname)
      let pluginFeatureEnabled=false
      if(profile.role==="admin"&&requiredFeature){
        const codes=requiredFeature==="reservations-pro"?["reservations-pro","reservations"]:requiredFeature==="qr-print-center"?["qr-print-center"]:requiredFeature==="analytics"?["analytics"]:[requiredFeature]
        const {data:pluginRow}=await supabaseCloud.from("restaurant_plugins").select("plugin_code,enabled").eq("restaurant_id",profile.restaurantId).in("plugin_code",codes).eq("enabled",true).limit(1).maybeSingle()
        pluginFeatureEnabled=!!pluginRow?.enabled
      }
      if(profile.role==="admin"&&requiredFeature&&(profile.planFeatures?.[requiredFeature]!==true)&&!pluginFeatureEnabled){router.replace("/dashboard");return}
      if(!canAccess(profile.role,pathname,permissions)){router.replace(HOME_BY_ROLE[profile.role as Exclude<Role,"">]);return}
      if(pathname==="/login"){redirectingRef.current=true;router.replace(HOME_BY_ROLE[profile.role as Exclude<Role,"">]);return}
    }catch(error){
      console.error("AUTH SYNC ERROR:",error);setUser(null);setRole("");setRestaurantId(null)
      if(isInternalPath(pathname))router.replace("/login")
    }finally{
      bootstrapped.current=true;syncInFlight.current=false
      if(!(redirectingRef.current&&pathname==="/login")){redirectingRef.current=false;setLoading(false)}
    }
  },[getProfile,pathname,router])

  useEffect(()=>{
    syncAuth()
    const {data:listener}=supabaseCloud.auth.onAuthStateChange((event,session)=>{
      if(event==="SIGNED_OUT"){bootstrapped.current=false;currentUserRef.current=null;profileCacheRef.current=null;window.setTimeout(()=>syncAuth(null),0);return}
      if(event==="SIGNED_IN"&&session?.user){bootstrapped.current=false;window.setTimeout(()=>syncAuth(session.user),0)}
    })
    return()=>listener.subscription.unsubscribe()
  },[syncAuth])

  const showSidebar=useMemo(()=>Boolean(user&&role&&isInternalPath(pathname)),[pathname,role,user])
  const value=useMemo(()=>({user,role,restaurantId,loading}),[user,role,restaurantId,loading])
  if(loading)return <div className="app-loading"><div className="app-loading-card"><div className="app-spinner"/><strong>Loading Anaira POS…</strong></div></div>
  return <AuthContext.Provider value={value}><div className={showSidebar?"app-shell has-sidebar":"app-shell"}>{showSidebar&&<Sidebar role={role}/>}<main className="app-main">{showSidebar&&<AppUtilities restaurantId={restaurantId} role={role}/>} {children}</main></div></AuthContext.Provider>
}

export function useAuth(){const context=useContext(AuthContext);if(!context)throw new Error("useAuth must be used inside AuthProvider");return context}
