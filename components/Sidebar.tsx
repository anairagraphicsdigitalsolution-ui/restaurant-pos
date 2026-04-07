"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const [logo, setLogo] = useState("")
  const [restaurantName, setRestaurantName] = useState("NH3 POS")
  const [userEmail, setUserEmail] = useState("")
  const [role, setRole] = useState("staff") // 🔥 IMPORTANT

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) return

    const user = userData.user
    setUserEmail(user.email || "")

    // 🔥 PROFILE GET (ROLE + RESTAURANT)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, restaurant_id")
      .eq("id", user.id)
      .single()

    if (!profile) return

    setRole(profile.role || "staff")

    // 👑 SUPER ADMIN
    if (profile.role === "super_admin") {
      setRestaurantName("Anaira Graphics")
      return
    }

    // 🏢 RESTAURANT FETCH
    if (profile.restaurant_id) {
      const { data: rest } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", profile.restaurant_id)
        .single()

      if (rest) {
        setRestaurantName(rest.name)
        setLogo(rest.logo || "")
      }
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace("/login")
  }

  // 🔥 MENUS

  const superAdminMenu = [
    { name: "Dashboard", path: "/super-admin", icon: "👑" },
    { name: "Restaurants", path: "/super-admin/restaurants", icon: "🏢" },
    { name: "Users", path: "/super-admin/users", icon: "👥" },
  ]

  const adminMenu = [
    { name: "Admin Panel", path: "/admin", icon: "⚙️" },
    { name: "Inventory", path: "/dashboard/inventory", icon: "📦" },
    { name: "Offers", path: "/dashboard/offers", icon: "🎁" },
    { name: "Reservations", path: "/dashboard/reservations", icon: "📅" },
  ]

const isStaff = role === "staff"
const isAdmin = role === "admin"

const mainMenu = [

  ...(isStaff ? [{
    name: "Staff Panel",
    path: "/staff",
    icon: "👨‍🍳"
  }] : []),

  ...(isAdmin ? [{
    name: "Dashboard",
    path: "/dashboard",
    icon: "📊"
  }] : []),

  ...((isStaff || isAdmin) ? [
    { name: "Order", path: "/order", icon: "🧾" },
    { name: "Kitchen", path: "/kitchen", icon: "🍳" },
    { name: "Billing", path: "/billing", icon: "💰" }
  ] : [])
]
  return (
    <aside style={sidebar}>

      {/* 🔥 BRAND */}
      <div style={brandBox}>
        <div style={logoWrap}>
          {logo ? (
            <img src={logo} style={logoStyle} />
          ) : (
            <div style={logoPlaceholder}>
              {role === "super_admin" ? "👑" : "🍽️"}
            </div>
          )}
        </div>

        <h2 style={brand}>{restaurantName}</h2>

        <p style={subBrand}>
          {role === "super_admin"
            ? "SaaS Control Panel"
            : "Powered by Anaira Graphics"}
        </p>
      </div>

      {/* 🔥 USER */}
      <div style={profileBox}>
        <p style={email}>{userEmail}</p>
        <span style={roleBadge(role)}>{role}</span>
      </div>

      {/* 🔥 MENU */}
      <div style={{ flex: 1 }}>

        {/* 👑 SUPER ADMIN ONLY */}
        {role === "super_admin" && (
          <Section title="SUPER ADMIN">
            {superAdminMenu.map(renderLink)}
          </Section>
        )}

        {/* 🏢 ADMIN */}
        {role === "admin" && (
          <Section title="ADMIN">
            {adminMenu.map(renderLink)}
          </Section>
        )}

        {/* 🔥 MAIN (HIDE FOR SUPER ADMIN) */}
        {role !== "super_admin" && (
          <Section title="MAIN">
            {mainMenu.map(renderLink)}
          </Section>
        )}

      </div>

      {/* 🔥 LOGOUT */}
      <button onClick={handleLogout} style={logoutBtn}>
        🚪 Logout
      </button>

    </aside>
  )

  // 🔥 LINK RENDER
  function renderLink(item, i) {
    const active = pathname === item.path

    return (
      <Link
        key={i}
        href={item.path}
        style={{
          ...link,
          ...(active && activeLink)
        }}
      >
        <span>{item.icon}</span>
        {item.name}
        {active && <div style={activeBar}></div>}
      </Link>
    )
  }

  // 🔥 SECTION
  function Section({ title, children }) {
    return (
      <div style={section}>
        <p style={sectionTitle}>{title}</p>
        {children}
      </div>
    )
  }
}

/* 🎨 ULTRA PREMIUM UI */

const sidebar = {
  width: 270,
  padding: 20,
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  background: "rgba(15,23,42,0.9)",
  backdropFilter: "blur(25px)",
  borderRight: "1px solid rgba(255,255,255,0.05)"
}

const brandBox = { textAlign: "center", marginBottom: 25 }

const logoWrap = {
  background: "rgba(255,255,255,0.05)",
  padding: 12,
  borderRadius: 16,
  display: "inline-block",
  marginBottom: 10
}

const logoStyle = { width: 60, height: 60, borderRadius: 12 }

const logoPlaceholder = { fontSize: 32 }

const brand = { color: "#fff", fontSize: 18, fontWeight: "600" }

const subBrand = { fontSize: 11, color: "#94a3b8" }

const profileBox = {
  padding: 12,
  borderRadius: 14,
  background: "rgba(255,255,255,0.05)",
  marginBottom: 20
}

const email = { fontSize: 12, color: "#fff" }

const roleBadge = (role) => ({
  fontSize: 11,
  padding: "4px 10px",
  borderRadius: 20,
  marginTop: 5,
  display: "inline-block",
  background:
    role === "super_admin"
      ? "linear-gradient(135deg,#9333ea,#3b82f6)"
      : "linear-gradient(135deg,#22c55e,#16a34a)",
  color: "#fff"
})

const section = { marginBottom: 15 }

const sectionTitle = { fontSize: 11, color: "#64748b", marginBottom: 6 }

const link = {
  display: "flex",
  gap: 10,
  padding: "12px",
  borderRadius: 12,
  textDecoration: "none",
  color: "#cbd5f5",
  marginBottom: 8
}

const activeLink = {
  background: "linear-gradient(135deg,#3b82f6,#1d4ed8)",
  color: "#fff"
}

const activeBar = {
  position: "absolute",
  left: 0,
  top: 0,
  bottom: 0,
  width: 4,
  background: "linear-gradient(#22c55e,#3b82f6)"
}

const logoutBtn = {
  marginTop: 10,
  padding: 12,
  borderRadius: 12,
  background: "#ef4444",
  color: "#fff",
  border: "none",
  cursor: "pointer"
}