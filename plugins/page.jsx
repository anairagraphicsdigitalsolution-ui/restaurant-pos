"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const PLUGINS = [
  { code: "pos", name: "POS", description: "Core restaurant POS" },
  { code: "whatsapp", name: "WhatsApp", description: "Restaurant WhatsApp configuration" },
  { code: "billing", name: "Billing", description: "Billing and invoice module" },
  { code: "qr-menu", name: "QR Menu", description: "Table and room QR ordering" },
  { code: "razorpay", name: "Razorpay", description: "Online payment integration" },
  { code: "qr-print-center", name: "QR Print Center", description: "Generate, preview, download and print restaurant QR cards." },
  { code: "payment-accounts", name: "Merchant Payments & Voice", description: "Merchant UPI account, payment confirmation, receipt attachment and voice payment announcement." }
]

export default function PluginsPage() {
  const [restaurants, setRestaurants] = useState([])
  const [selected, setSelected] = useState(null)
  const [installed, setInstalled] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadRestaurants()
  }, [])

  async function getSession() {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error || !session?.access_token) {
      throw new Error("Login session expired. Please login again.")
    }
    return session
  }

  async function loadRestaurants() {
    try {
      setLoading(true)
      const session = await getSession()

      const response = await fetch("/api/super-admin/plugins", {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to load restaurants")
      }

      setRestaurants(result.restaurants || [])
    } catch (error) {
      console.error(error)
      alert(error.message || "Unable to load restaurants")
    } finally {
      setLoading(false)
    }
  }

  async function selectRestaurant(r) {
    try {
      setSelected(r)
      const session = await getSession()

      const response = await fetch(
        `/api/super-admin/plugins?restaurant_id=${encodeURIComponent(r.id)}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` }
        }
      )

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to load plugins")
      }

      setInstalled(result.plugins || [])
    } catch (error) {
      console.error(error)
      setInstalled([])
      alert(error.message || "Unable to load plugins")
    }
  }

  async function installPlugin(code) {
    if (!selected) return alert("Select restaurant")

    const exists = installed.find(p => p.plugin_code === code)
    if (exists) return alert("Already installed")

    try {
      setBusy(true)
      const session = await getSession()

      const response = await fetch("/api/super-admin/plugins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          restaurant_id: selected.id,
          plugin_code: code
        })
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Error installing plugin")
      }

      await selectRestaurant(selected)
    } catch (error) {
      console.error(error)
      alert(error.message || "Error installing plugin")
    } finally {
      setBusy(false)
    }
  }

  async function togglePlugin(p) {
    try {
      setBusy(true)
      const session = await getSession()

      const response = await fetch("/api/super-admin/plugins", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          restaurant_id: selected.id,
          id: p.id,
          enabled: !p.enabled
        })
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to update plugin")
      }

      await selectRestaurant(selected)
    } catch (error) {
      console.error(error)
      alert(error.message || "Unable to update plugin")
    } finally {
      setBusy(false)
    }
  }

  async function removePlugin(id) {
    if (!confirm("Remove this plugin from the restaurant?")) return

    try {
      setBusy(true)
      const session = await getSession()

      const response = await fetch("/api/super-admin/plugins", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          restaurant_id: selected.id,
          id
        })
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to remove plugin")
      }

      await selectRestaurant(selected)
    } catch (error) {
      console.error(error)
      alert(error.message || "Unable to remove plugin")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={container}>
      <h1 style={title}>⚡ Plugin Manager</h1>
      <p style={{ color: "var(--muted)" }}>
        Super Admin only — manage plugins separately for every restaurant.
      </p>

      {loading ? (
        <div style={panel}>Loading restaurants...</div>
      ) : (
        <>
          <div style={grid}>
            {restaurants.map(r => (
              <button
                key={r.id}
                onClick={() => selectRestaurant(r)}
                style={{
                  ...card,
                  textAlign: "left",
                  color: "#fff",
                  outline: selected?.id === r.id
                    ? "2px solid var(--success)"
                    : "none"
                }}
              >
                <h3 style={{ marginTop: 0 }}>{r.name}</h3>
                <span style={{ color: r.status === "inactive" ? "var(--danger)" : "#86efac" }}>
                  {r.status || "active"}
                </span>
              </button>
            ))}
          </div>

          {selected && (
            <div style={panel}>
              <h2>{selected.name}</h2>

              <h3>Install Plugins</h3>
              <div style={btnWrap}>
                {PLUGINS.map(plugin => (
                  <button
                    key={plugin.code}
                    disabled={busy || installed.some(p => p.plugin_code === plugin.code)}
                    onClick={() => installPlugin(plugin.code)}
                    style={{
                      ...btn,
                      opacity: installed.some(p => p.plugin_code === plugin.code) ? 0.45 : 1
                    }}
                    title={plugin.description}
                  >
                    {plugin.name}
                  </button>
                ))}
              </div>

              <h3 style={{ marginTop: 28 }}>Installed</h3>

              {!installed.length && (
                <p style={{ color: "var(--muted)" }}>No plugins installed.</p>
              )}

              {installed.map(p => {
                const meta = PLUGINS.find(x => x.code === p.plugin_code)
                return (
                  <div key={p.id} style={row}>
                    <div>
                      <b>{meta?.name || p.plugin_code}</b>
                      <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 0 }}>
                        {p.enabled ? "Enabled" : "Disabled"}
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        disabled={busy}
                        onClick={() => togglePlugin(p)}
                        style={toggleBtn}
                      >
                        {p.enabled ? "ON" : "OFF"}
                      </button>

                      <button
                        disabled={busy}
                        onClick={() => removePlugin(p.id)}
                        style={dangerBtn}
                      >
                        ✖
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const container = {
  padding: 30,
  background: "radial-gradient(circle at top,var(--background),#000)",
  color: "#fff",
  minHeight: "100vh"
}
const title = {
  fontSize: 30,
  marginBottom: 8,
  background: "linear-gradient(90deg,var(--success),var(--info))",
  WebkitBackgroundClip: "text",
  color: "transparent"
}
const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))",
  gap: 20,
  marginTop: 25
}
const card = {
  padding: 18,
  borderRadius: 16,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  cursor: "pointer",
  boxShadow: "0 0 15px rgba(var(--info-rgb),0.3)"
}
const panel = {
  marginTop: 30,
  padding: 25,
  borderRadius: 18,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 0 20px rgba(var(--success-rgb),0.3)"
}
const btnWrap = { display: "flex", gap: 12, flexWrap: "wrap" }
const btn = {
  padding: "10px 16px",
  borderRadius: 12,
  background: "transparent",
  border: "1px solid var(--success)",
  color: "var(--success)",
  cursor: "pointer"
}
const row = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)"
}
const toggleBtn = {
  padding: "6px 12px",
  borderRadius: 10,
  border: "1px solid var(--info)",
  background: "transparent",
  color: "var(--info)",
  cursor: "pointer"
}
const dangerBtn = {
  padding: "6px 12px",
  borderRadius: 10,
  border: "1px solid red",
  background: "transparent",
  color: "red",
  cursor: "pointer"
}
