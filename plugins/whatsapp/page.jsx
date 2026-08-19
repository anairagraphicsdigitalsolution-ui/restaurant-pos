"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function WhatsAppConfig() {
  const params = useSearchParams()
  const rid = params.get("rid")

  const [number, setNumber] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (rid) load()
    else setLoading(false)
  }, [rid])

  async function load() {
    const { data, error } = await supabase
      .from("plugin_settings")
      .select("config")
      .eq("restaurant_id", rid)
      .eq("plugin_code", "whatsapp")
      .maybeSingle()

    if (error) console.error("WhatsApp settings:", error)
    setNumber(data?.config?.number || "")
    setLoading(false)
  }

  async function save() {
    if (!rid) return alert("Restaurant is required")

    const clean = number.replace(/\D/g, "")
    if (clean.length < 10) return alert("Enter a valid WhatsApp number")

    try {
      setSaving(true)

      const { data: plugin } = await supabase
        .from("restaurant_plugins")
        .select("enabled")
        .eq("restaurant_id", rid)
        .eq("plugin_code", "whatsapp")
        .maybeSingle()

      if (!plugin?.enabled) {
        alert("WhatsApp plugin is disabled for this restaurant.")
        return
      }

      const { error } = await supabase
        .from("plugin_settings")
        .upsert(
          {
            restaurant_id: rid,
            plugin_code: "whatsapp",
            config: { number: clean }
          },
          { onConflict: "restaurant_id,plugin_code" }
        )

      if (error) throw new Error(error.message)

      setNumber(clean)
      alert("WhatsApp settings saved ✅")
    } catch (error) {
      console.error(error)
      alert(error.message || "Error saving WhatsApp settings")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={container}>Loading...</div>

  return (
    <div style={container}>
      <div style={panel}>
        <div style={{ color: "var(--success)", fontSize: 13, fontWeight: 800 }}>
          RESTAURANT PLUGIN
        </div>
        <h1>📲 WhatsApp Settings</h1>
        <p style={{ color: "var(--muted)" }}>
          Enter the restaurant WhatsApp number in international format.
        </p>

        <input
          value={number}
          onChange={e => setNumber(e.target.value)}
          placeholder="919876543210"
          style={input}
        />

        <button onClick={save} disabled={saving} style={btn}>
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  )
}

const container = {
  padding: 30,
  color: "#fff",
  background: "var(--background)",
  minHeight: "100vh"
}
const panel = {
  maxWidth: 650,
  margin: "0 auto",
  padding: 30,
  borderRadius: 22,
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.1)",
  boxShadow: "0 20px 50px rgba(0,0,0,.35)"
}
const input = {
  display: "block",
  padding: 13,
  borderRadius: 10,
  border: "1px solid #444",
  width: "100%",
  boxSizing: "border-box",
  background: "var(--surface-2)",
  color: "#fff",
  marginTop: 15
}
const btn = {
  marginTop: 16,
  padding: "11px 20px",
  borderRadius: 10,
  background: "var(--success)",
  color: "#000",
  border: "none",
  cursor: "pointer",
  fontWeight: 800
}
