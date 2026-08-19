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