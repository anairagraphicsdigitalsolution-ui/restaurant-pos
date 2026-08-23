import "@fontsource/inter/400.css"
import "@fontsource/inter/500.css"
import "@fontsource/inter/600.css"
import "@fontsource/inter/700.css"
import "@fontsource/inter/800.css"
import AuthProvider from "@/components/AuthProvider"
import { ThemeProvider } from "@/components/ThemeProvider"
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
            {children}
          </ThemeProvider>
        </AuthProvider>

      </body>

    </html>
  )
}