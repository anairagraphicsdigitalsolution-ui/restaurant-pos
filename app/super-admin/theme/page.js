"use client"

import { useEffect, useState } from "react"
import { BRAND_THEMES, DEFAULT_THEME, useTheme } from "@/components/ThemeProvider"

export default function SuperAdminThemePage() {
  const { theme, setTheme } = useTheme()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    setMessage("")
  }, [theme.id])

  async function chooseTheme(id) {
    setSaving(true)
    setMessage("")
    try {
      await setTheme(id, true)
      setMessage("Platform theme saved successfully.")
    } catch (error) {
      setMessage(error?.message || "Theme could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main style={page}>
      <section style={hero}>
        <div style={{ minWidth: 280, flex: 1 }}>
          <div style={eyebrow}>ANAIRA POS • PLATFORM SETTINGS</div>
          <h1 style={title}>Super Admin Theme</h1>
          <p style={subtitle}>
            Choose the visual identity for the Anaira POS SaaS control panel.
            This theme is separate from individual restaurant branding.
          </p>
          <div style={note}>Platform theme • Restaurant themes remain independent</div>
        </div>
        <div style={previewShell}>
          <div style={{ ...previewOrb, background: theme.primary }} />
          <strong>{theme.name}</strong>
          <span>Currently active</span>
        </div>
      </section>

      {message && <div style={success}>{message}</div>}

      <section style={section}>
        <div style={sectionHead}>
          <div>
            <div style={eyebrow}>THEME LIBRARY</div>
            <h2 style={{ margin: "6px 0 0", fontSize: 24 }}>Premium presets</h2>
          </div>
          <span style={activePill}>Active: {theme.name}</span>
        </div>

        <div style={grid}>
          {BRAND_THEMES.map((item) => {
            const active = item.id === theme.id
            return (
              <button
                key={item.id}
                type="button"
                disabled={saving}
                onClick={() => chooseTheme(item.id)}
                style={{
                  ...themeCard,
                  borderColor: active ? item.primary : "rgba(255,255,255,.08)",
                  boxShadow: active ? `0 24px 60px ${item.primary}22` : "0 16px 40px rgba(0,0,0,.16)",
                  opacity: saving && !active ? .65 : 1,
                }}
              >
                <div
                  style={{
                    ...swatch,
                    background: `linear-gradient(135deg, ${item.background}, ${item.surface})`,
                    borderColor: item.primary,
                  }}
                >
                  <span style={{ ...swatchDot, background: item.primary }} />
                  <span style={{ ...swatchDot, background: item.accent }} />
                  <span style={{ ...swatchDot, background: item.secondary }} />
                </div>

                <div style={cardBody}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <h3 style={{ margin: 0 }}>{item.name}</h3>
                    {active && <span style={{ ...activePill, color: item.primary, borderColor: `${item.primary}55` }}>ACTIVE</span>}
                  </div>
                  <p style={{ color: "var(--muted)", lineHeight: 1.6, margin: "8px 0 14px" }}>
                    {item.description}
                  </p>
                  <div style={palette}>
                    <i style={{ background: item.primary }} />
                    <i style={{ background: item.accent }} />
                    <i style={{ background: item.background }} />
                    <i style={{ background: item.surface }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 14 }}>
                    <span style={{ fontSize: 10, letterSpacing: 1.4, fontWeight: 900, color: item.mode === "light" ? "#475467" : "#a7b0bf" }}>
                      {item.mode === "light" ? "CLEAN LIGHT" : "DARK PREMIUM"}
                    </span>
                    <span style={{ color: active ? item.primary : "var(--muted)", fontWeight: 900 }}>
                      {active ? "✓ Selected" : "Use this theme →"}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section style={tip}>
        <strong>How this works</strong>
        <span>
          Super Admin theme changes are stored locally for the platform control panel.
          Restaurant owners can still select their own themes from Admin → Theme & Branding.
        </span>
      </section>
    </main>
  )
}

const page = {
  minHeight: "100vh",
  padding: "clamp(18px, 3vw, 36px)",
  background: "radial-gradient(circle at top right, rgba(var(--primary-rgb),.12), transparent 34%), var(--background)",
  color: "var(--text)",
  fontFamily: "Inter, system-ui, sans-serif",
}
const hero = {
  display: "flex",
  justifyContent: "space-between",
  gap: 28,
  alignItems: "center",
  flexWrap: "wrap",
  padding: "clamp(24px,4vw,42px)",
  borderRadius: 30,
  background: "linear-gradient(135deg, rgba(var(--primary-rgb),.14), var(--surface))",
  border: "1px solid rgba(var(--primary-rgb),.2)",
  boxShadow: "0 30px 90px rgba(0,0,0,.25)",
}
const eyebrow = { color: "var(--primary)", fontSize: 11, letterSpacing: 2.2, fontWeight: 900 }
const title = { margin: "8px 0 10px", fontSize: "clamp(32px,5vw,56px)", lineHeight: 1, letterSpacing: "-.04em" }
const subtitle = { margin: 0, maxWidth: 720, color: "var(--muted)", lineHeight: 1.7 }
const note = { display: "inline-flex", marginTop: 16, padding: "8px 11px", borderRadius: 999, background: "rgba(var(--primary-rgb),.08)", color: "var(--primary)", fontSize: 12, fontWeight: 800 }
const previewShell = { width: 220, minHeight: 150, display: "grid", placeItems: "center", alignContent: "center", gap: 8, padding: 20, borderRadius: 24, background: "var(--surface-2)", border: "1px solid var(--border)" }
const previewOrb = { width: 58, height: 58, borderRadius: 20, boxShadow: "0 0 50px rgba(var(--primary-rgb),.35)" }
const section = { marginTop: 18, padding: "clamp(20px,3vw,30px)", borderRadius: 26, background: "var(--surface)", border: "1px solid var(--border)" }
const sectionHead = { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 16 }
const themeCard = { textAlign: "left", padding: 0, overflow: "hidden", border: "1px solid", borderRadius: 22, background: "var(--surface-2)", color: "var(--text)", cursor: "pointer", transition: "all .2s ease" }
const swatch = { height: 120, display: "flex", alignItems: "flex-end", gap: 8, padding: 16, borderBottom: "1px solid" }
const swatchDot = { width: 30, height: 30, borderRadius: 10, border: "1px solid var(--border)" }
const cardBody = { padding: 18 }
const palette = { display: "flex", gap: 6 }
const activePill = { display: "inline-flex", alignItems: "center", padding: "6px 9px", borderRadius: 999, border: "1px solid rgba(var(--primary-rgb),.25)", color: "var(--primary)", fontSize: 10, fontWeight: 900, letterSpacing: .7 }
const success = { marginTop: 16, padding: "12px 14px", borderRadius: 14, background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.2)", color: "var(--success)" }
const tip = { marginTop: 18, display: "grid", gap: 5, padding: 16, borderRadius: 18, background: "rgba(var(--primary-rgb),.06)", border: "1px solid rgba(var(--primary-rgb),.14)", color: "var(--muted)", lineHeight: 1.6 }
