import "@fontsource/inter/400.css"
import "@fontsource/inter/500.css"
import "@fontsource/inter/600.css"
import "@fontsource/inter/700.css"
import "@fontsource/inter/800.css"
import AuthProvider from "@/components/AuthProvider"
import { ThemeProvider } from "@/components/ThemeProvider"
import RealtimeNotificationProvider from "@/components/RealtimeNotificationProvider"
import OrderNotificationListener from "@/components/OrderNotificationListener"
import CallingRuntimeProvider from "@/components/CallingRuntimeProvider"
import MobileSyncProvider from "@/components/MobileSyncProvider"
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister"
import AndroidOfflineApiBridge from "@/components/AndroidOfflineApiBridge"
import "./globals.css"

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export const metadata = {
  title: "Anaira Graphics",
  description: "Premium Restaurant SaaS Platform",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {

  return (
    <html lang="en">

      <body>

        <AuthProvider>
          <ThemeProvider>
            <RealtimeNotificationProvider />
            <OrderNotificationListener />
            <CallingRuntimeProvider />
            <MobileSyncProvider />
            <ServiceWorkerRegister />
            <AndroidOfflineApiBridge />
            {children}
          </ThemeProvider>
        </AuthProvider>

      </body>

    </html>
  )
}