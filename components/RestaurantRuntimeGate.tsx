"use client"

import { usePathname } from "next/navigation"
import dynamic from "next/dynamic"

const RealtimeNotificationProvider = dynamic(() => import("@/components/RealtimeNotificationProvider"), { ssr: false })
const OrderNotificationListener = dynamic(() => import("@/components/OrderNotificationListener"), { ssr: false })
const CallingRuntimeProvider = dynamic(() => import("@/components/CallingRuntimeProvider"), { ssr: false })
const CloudOnlyCleanup = dynamic(() => import("@/components/CloudOnlyCleanup"), { ssr: false })
const CloudPrintAgent = dynamic(() => import("@/components/CloudPrintAgent"), { ssr: false })

/**
 * Keeps restaurant-only realtime/printing/calling workers off public and
 * marketing pages. The components themselves are untouched, so existing
 * functionality remains available everywhere it was operationally needed.
 */
export default function RestaurantRuntimeGate() {
  const pathname = usePathname() || ""
  const isRestaurantApp =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/staff") ||
    pathname.startsWith("/kitchen") ||
    pathname.startsWith("/billing") ||
    pathname.startsWith("/order") ||
    pathname.startsWith("/api/") ||
    /^\/[^/]+\/order(\/|$)/.test(pathname)

  if (!isRestaurantApp) return null

  return (
    <>
      <RealtimeNotificationProvider />
      <OrderNotificationListener />
      <CallingRuntimeProvider />
      <CloudOnlyCleanup />
      <CloudPrintAgent />
    </>
  )
}
