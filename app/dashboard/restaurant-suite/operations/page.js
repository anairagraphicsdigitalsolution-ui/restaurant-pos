"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function RestaurantSuiteLegacyRedirect(){
  const router = useRouter()
  useEffect(() => { router.replace("/dashboard/restaurant-suite") }, [router])
  return <main style={{minHeight:"60vh",display:"grid",placeItems:"center",background:"var(--background)",color:"var(--text)"}}>Opening Restaurant Suite…</main>
}
