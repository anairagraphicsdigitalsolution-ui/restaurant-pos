"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import { BRAND_THEMES, DEFAULT_THEME, useTheme } from "@/components/ThemeProvider"

function clamp(value, min = 0, max = 255) {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`
}

function hexToRgb(hex) {
  const value = String(hex || "").replace("#", "")
  const full = value.length === 3
    ? value.split("").map((x) => x + x).join("")
    : value
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  }
}

function mix(a, b, amount = 0.5) {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return rgbToHex(
    x.r + (y.r - x.r) * amount,
    x.g + (y.g - x.g) * amount,
    x.b + (y.b - x.b) * amount,
  )
}

function darken(hex, amount = 0.35) {
  return mix(hex, "#000000", amount)
}

function lighten(hex, amount = 0.35) {
  return mix(hex, "var(--text)", amount)
}

function makeTheme(id, name, description, primary, accent, darkBase, lightMode = false) {
  if (lightMode) {
    const darkPrimary = darken(primary, 0.25)

    return {
      id,
      name,
      description,
      primary: darkPrimary,
      secondary: "var(--text)",
      accent,
      background: "#f5f7f4",
      surface: "var(--text)",
      surface2: mix("var(--text)", accent, 0.07),
      text: "#172019",
      muted: "#526158",
      border: mix(darkPrimary, "var(--text)", 0.58),
      success: "var(--success)",
      danger: "#b91c1c",
      warning: "#a16207",
      info: "var(--info)",
      radius: "16px",
      mode: "light",
    }
  }

  return {
    id,
    name,
    description,
    primary,
    secondary: darken(darkBase, 0.08),
    accent,
    background: darken(darkBase, 0.35),
    surface: mix(darkBase, "var(--text)", 0.04),
    surface2: mix(darkBase, "var(--text)", 0.09),
    text: "var(--text)af0",
    muted: lighten(darkBase, 0.65),
    border: primary,
    success: "var(--success)",
    danger: "var(--danger)",
    warning: "var(--warning)",
    info: "var(--info)",
    radius: "20px",
    mode: "dark",
  }
}

async function extractBrandColors(file) {
  const bitmap = await createImageBitmap(file)
  const size = 140
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("Canvas is not supported")

  ctx.drawImage(bitmap, 0, 0, size, size)

  const data = ctx.getImageData(0, 0, size, size).data
  const buckets = new Map()

  for (let i = 0; i < data.length; i += 16) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const saturation = max - min
    const brightness = (r + g + b) / 3

    if (brightness < 25 || brightness > 248 || saturation < 25) continue

    const qr = Math.round(r / 16) * 16
    const qg = Math.round(g / 16) * 16
    const qb = Math.round(b / 16) * 16

    const key = `${qr},${qg},${qb}`
    buckets.set(key, (buckets.get(key) || 0) + 1)
  }

  const colors = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key.split(",").map(Number))
    .map(([r, g, b]) => rgbToHex(r, g, b))

  const primary = colors[0] || DEFAULT_THEME.primary

  const primaryRgb = hexToRgb(primary)
  const accent = colors.find((hex) => {
    const c = hexToRgb(hex)
    const distance = Math.sqrt(
      (primaryRgb.r - c.r) ** 2 +
      (primaryRgb.g - c.g) ** 2 +
      (primaryRgb.b - c.b) ** 2,
    )
    return distance > 80
  }) || DEFAULT_THEME.accent

  return {
    primary,
    accent,
    darkBase: darken(primary, 0.72),
  }
}

function uniqueThemes(list) {
  const output = []

  for (const item of list) {
    if (!item?.id) continue
    if (output.some((theme) => theme.id === item.id)) continue
    output.push(item)
  }

  return output
}

export default function ThemeBrandingPage() {
  const {
    theme: activeTheme,
    themes,
    setThemeList,
    restaurantId,
  } = useTheme()

  const [restaurant, setRestaurant] = useState(null)
  const [logo, setLogo] = useState("")
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState("")
  const [generated, setGenerated] = useState(themes)
  const [selected, setSelected] = useState(activeTheme.id)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const inputRef = useRef(null)

  useEffect(() => {
    setGenerated(themes)
    setSelected(activeTheme.id)
  }, [themes, activeTheme.id])

  useEffect(() => {
    if (restaurantId) loadRestaurant(restaurantId)
  }, [restaurantId])

  async function loadRestaurant(id) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id,name,logo,theme_config")
      .eq("id", id)
      .maybeSingle()

    if (error) {
      console.error("THEME RESTAURANT LOAD ERROR:", error)
      setMessage(error.message)
      return
    }

    if (!data) return

    setRestaurant(data)
    setLogo(data.logo || "")
    setPreview(data.logo || "")

    const savedThemes = Array.isArray(data.theme_config?.themes)
      ? data.theme_config.themes
      : []

    setGenerated(uniqueThemes([...BRAND_THEMES, ...savedThemes]))
    setSelected(data.theme_config?.selected || activeTheme.id)
  }

  function onFileChange(event) {
    const nextFile = event.target.files?.[0]
    if (!nextFile) return

    if (!nextFile.type.startsWith("image/")) {
      setMessage("Please select a valid image file.")
      return
    }

    if (nextFile.size > 5 * 1024 * 1024) {
      setMessage("Logo should be 5 MB or smaller.")
      return
    }

    setFile(nextFile)
    setPreview(URL.createObjectURL(nextFile))
    setMessage("")
  }

  async function generateThemes() {
    if (!file && !preview) {
      setMessage("Upload the restaurant logo first.")
      return
    }

    try {
      const colors = file
        ? await extractBrandColors(file)
        : {
            primary: DEFAULT_THEME.primary,
            accent: DEFAULT_THEME.accent,
            darkBase: DEFAULT_THEME.background,
          }

      const generatedThemes = [
        makeTheme(
          "brand-auto-premium",
          "Logo Premium",
          "Your logo palette converted into a luxury dark restaurant interface.",
          colors.primary,
          colors.accent,
          colors.darkBase,
        ),
        makeTheme(
          "brand-auto-light",
          "Logo Light",
          "A clean white interface with your logo colours and readable data.",
          colors.primary,
          colors.accent,
          colors.darkBase,
          true,
        ),
        makeTheme(
          "brand-auto-bold",
          "Logo Bold",
          "A high-contrast premium theme using your strongest logo colours.",
          colors.accent,
          colors.primary,
          darken(colors.accent, 0.68),
        ),
      ]

      const nextThemes = uniqueThemes([
        ...BRAND_THEMES,
        ...generatedThemes,
      ])

      setGenerated(nextThemes)
      setSelected("brand-auto-premium")
      setMessage("3 premium branding themes generated. Your original Classic Default theme is still available.")
    } catch (error) {
      console.error("THEME GENERATION ERROR:", error)
      setMessage("Unable to analyze this logo. Please use a PNG, JPG or WEBP image.")
    }
  }

  async function chooseTheme(themeId) {
    setSelected(themeId)

    const safeThemes = uniqueThemes([
      ...BRAND_THEMES,
      ...generated,
    ])

    await setThemeList(safeThemes, themeId, true)
  }

  async function saveBranding() {
    if (!restaurantId) {
      setMessage("Restaurant is not linked to this account.")
      return
    }

    setSaving(true)
    setMessage("")

    try {
      let logoUrl = logo

      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "png"
        const fileName = `${restaurantId}/logo-${Date.now()}.${ext}`

        const { error: uploadError } = await supabase
          .storage
          .from("logos")
          .upload(fileName, file, {
            upsert: true,
            contentType: file.type,
            cacheControl: "3600",
          })

        if (uploadError) throw uploadError

        logoUrl = supabase
          .storage
          .from("logos")
          .getPublicUrl(fileName)
          .data
          .publicUrl
      }

      const themeList = uniqueThemes([
        ...BRAND_THEMES,
        ...generated,
      ])

      const selectedTheme =
        themeList.find((item) => item.id === selected) ||
        DEFAULT_THEME

      const { error } = await supabase
        .from("restaurants")
        .update({
          logo: logoUrl || null,
          theme_config: {
            selected: selectedTheme.id,
            themes: themeList,
            updated_at: new Date().toISOString(),
          },
        })
        .eq("id", restaurantId)

      if (error) throw error

      setLogo(logoUrl)
      setPreview(logoUrl)
      setFile(null)

      await setThemeList(themeList, selectedTheme.id, true)

      setMessage("Branding, logo and theme saved successfully.")
    } catch (error) {
      console.error("THEME SAVE ERROR:", error)
      setMessage(error?.message || "Unable to save branding.")
    } finally {
      setSaving(false)
    }
  }

  const activePreview = useMemo(
    () =>
      generated.find((item) => item.id === selected) ||
      activeTheme ||
      DEFAULT_THEME,
    [generated, selected, activeTheme],
  )

  return (
    <div style={page} className="theme-page">
      <div style={hero}>
        <div>
          <div style={eyebrow}>WHITE-LABEL BRANDING</div>
          <h1 style={title}>🎨 Theme & Branding</h1>
          <p style={subtitle}>
            Upload the restaurant logo, generate premium brand themes, or keep
            the original POS design.
          </p>
        </div>

        <button
          type="button"
          style={primaryButton}
          onClick={saveBranding}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save Branding"}
        </button>
      </div>

      {message && <div style={messageBox}>{message}</div>}

      <div style={layout}>
        <section style={card}>
          <h2 style={cardTitle}>1. Restaurant Branding Logo</h2>
          <p style={muted}>
            This is the restaurant logo used inside the POS. It is separate
            from the Anaira public/Super Admin logo.
          </p>

          <div style={uploadArea}>
            {preview ? (
              <img
                src={preview}
                alt="Restaurant logo preview"
                style={logoPreview}
              />
            ) : (
              <div style={logoPlaceholder}>🏪</div>
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={onFileChange}
                style={fileInput}
              />

              <div style={buttonRow}>
                <button
                  type="button"
                  style={secondaryButton}
                  onClick={() => inputRef.current?.click()}
                >
                  Upload Logo
                </button>

                <button
                  type="button"
                  style={primaryButton}
                  onClick={generateThemes}
                >
                  ✨ Generate 3 Premium Themes
                </button>
              </div>
            </div>
          </div>
        </section>

        <section style={card}>
          <h2 style={cardTitle}>2. Choose Your Theme</h2>
          <p style={muted}>
            Classic Default is always available. Premium branding themes are
            added without removing your existing themes.
          </p>

          <div style={themeGrid}>
            {generated.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => chooseTheme(item.id)}
                style={{
                  ...themeCard,
                  ...(selected === item.id ? selectedCard : {}),
                }}
              >
                <div
                  style={{
                    ...themePreview,
                    background: item.background,
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: `${item.border}55`,
                  }}
                >
                  <div
                    style={{
                      ...miniSidebar,
                      background: item.secondary,
                    }}
                  >
                    <span style={{ ...dot, background: item.primary }} />
                    <span style={{ ...miniLine, background: item.muted }} />
                    <span style={{ ...miniLine, background: item.muted }} />
                    <span style={{ ...miniLine, background: item.accent }} />
                  </div>

                  <div
                    style={{
                      ...miniContent,
                      background: item.surface,
                      color: item.text,
                    }}
                  >
                    <div style={{ ...miniTitle, color: item.primary }}>
                      Dashboard
                    </div>

                    <div style={miniCards}>
                      <span
                        style={{
                          ...miniCard,
                          background: item.primary,
                        }}
                      />
                      <span
                        style={{
                          ...miniCard,
                          background: item.accent,
                        }}
                      />
                      <span
                        style={{
                          ...miniCard,
                          background: item.border,
                        }}
                      />
                    </div>

                    <div style={{ ...miniData, color: item.muted }}>
                      ₹12,450 &nbsp; • &nbsp; 38 Orders
                    </div>
                  </div>
                </div>

                <div style={themeName}>{item.name}</div>
                <div style={themeDescription}>{item.description}</div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 10 }}>
                  <span style={{ fontSize: 10, letterSpacing: 1.2, fontWeight: 900, color: item.mode === "light" ? "#475467" : "var(--muted)" }}>
                    {item.mode === "light" ? "CLEAN LIGHT" : "DARK PREMIUM"}
                  </span>
                  <span style={radio}>
                    {selected === item.id ? "✓ Selected" : "Use Theme"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section style={card}>
        <h2 style={cardTitle}>3. Live Preview</h2>

        <div
          className="theme-live-preview"
          style={{
            ...livePreview,
            background: activePreview.background,
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: `${activePreview.primary}55`,
            color: activePreview.text,
          }}
        >
          <div
            className="theme-live-sidebar"
            style={{
              ...liveSidebar,
              background: activePreview.secondary,
              color: activePreview.text,
            }}
          >
            {preview ? (
              <img src={preview} alt="" style={previewSmallLogo} />
            ) : (
              <div
                style={{
                  ...previewFallback,
                  background: activePreview.primary,
                }}
              >
                🍽️
              </div>
            )}

            <strong style={{ color: activePreview.primary }}>
              {restaurant?.name || "Your Restaurant"}
            </strong>

            <span>Dashboard</span>
            <span>Orders</span>
            <span>Kitchen</span>
            <span>Billing</span>
          </div>

          <div
            style={{
              ...liveMain,
              color: activePreview.text,
            }}
          >
            <div
              style={{
                color: activePreview.primary,
                fontWeight: 800,
                letterSpacing: 1,
              }}
            >
              RESTAURANT ANALYTICS
            </div>

            <h2 style={{ margin: "8px 0", fontSize: 28 }}>
              Welcome Back 👋
            </h2>

            <p style={{ color: activePreview.muted }}>
              Your selected theme keeps your restaurant data readable on
              cards, reports and dashboards.
            </p>

            <div style={liveStats}>
              <div
                style={{
                  ...liveStat,
                  background: activePreview.surface,
                  borderColor: `${activePreview.border}55`,
                }}
              >
                <small style={{ color: activePreview.muted }}>
                  Today&apos;s Sale
                </small>
                <strong style={{ color: activePreview.primary }}>
                  ₹12,450
                </strong>
              </div>

              <div
                style={{
                  ...liveStat,
                  background: activePreview.surface,
                  borderColor: `${activePreview.border}55`,
                }}
              >
                <small style={{ color: activePreview.muted }}>
                  Orders
                </small>
                <strong style={{ color: activePreview.accent }}>
                  38
                </strong>
              </div>

              <div
                style={{
                  ...liveStat,
                  background: activePreview.surface,
                  borderColor: `${activePreview.border}55`,
                }}
              >
                <small style={{ color: activePreview.muted }}>
                  Menu Items
                </small>
                <strong style={{ color: activePreview.primary }}>
                  42
                </strong>
              </div>

              <div
                style={{
                  ...liveStat,
                  background: activePreview.surface,
                  borderColor: `${activePreview.border}55`,
                }}
              >
                <small style={{ color: activePreview.muted }}>
                  Kitchen
                </small>
                <strong style={{ color: activePreview.success }}>
                  Live
                </strong>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

const page = {
  minHeight: "100vh",
  padding: 24,
  background: "var(--background)",
  color: "var(--text)",
}

const hero = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 20,
  marginBottom: 20,
  padding: 24,
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(var(--primary-rgb),.2)",
}

const eyebrow = {
  color: "var(--primary)",
  fontSize: 12,
  letterSpacing: 2,
  fontWeight: 800,
}

const title = {
  margin: "7px 0",
  fontSize: 32,
}

const subtitle = {
  margin: 0,
  color: "var(--muted)",
  lineHeight: 1.5,
}

const card = {
  marginBottom: 20,
  padding: 22,
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(var(--primary-rgb),.18)",
  boxShadow: "0 18px 45px rgba(0,0,0,.22)",
}

const cardTitle = {
  margin: "0 0 8px",
  fontSize: 20,
}

const muted = {
  color: "var(--muted)",
  marginTop: 0,
  lineHeight: 1.5,
}

const messageBox = {
  marginBottom: 18,
  padding: 14,
  borderRadius: 14,
  background: "rgba(var(--primary-rgb),.08)",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(var(--primary-rgb),.2)",
  color: "var(--text)",
}

const uploadArea = {
  display: "flex",
  alignItems: "center",
  gap: 20,
  flexWrap: "wrap",
  padding: 18,
  borderRadius: 18,
  background: "var(--surface-2)",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(var(--primary-rgb),.12)",
}

const logoPreview = {
  width: 130,
  height: 130,
  objectFit: "contain",
  borderRadius: 20,
  background: "var(--background)",
  borderWidth: 2,
  borderStyle: "solid",
  borderColor: "rgba(var(--primary-rgb),.35)",
}

const logoPlaceholder = {
  width: 130,
  height: 130,
  display: "grid",
  placeItems: "center",
  borderRadius: 20,
  background: "var(--background)",
  fontSize: 42,
}

const fileInput = {
  width: "100%",
  marginBottom: 14,
  color: "var(--text)",
}

const buttonRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
}

const primaryButton = {
  border: 0,
  borderRadius: 12,
  padding: "12px 18px",
  background: "linear-gradient(135deg,var(--primary),var(--accent))",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
}

const secondaryButton = {
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(var(--primary-rgb),.3)",
  borderRadius: 12,
  padding: "12px 18px",
  background: "var(--surface-2)",
  color: "var(--text)",
  fontWeight: 700,
  cursor: "pointer",
}

const layout = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))",
  gap: 20,
}

const themeGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,230px),1fr))",
  gap: 14,
  marginTop: 18,
}

const themeCard = {
  textAlign: "left",
  padding: 12,
  borderRadius: 16,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(var(--primary-rgb),.12)",
  background: "var(--surface-2)",
  color: "var(--text)",
  cursor: "pointer",
}

const selectedCard = {
  borderColor: "var(--primary)",
  boxShadow: "0 0 0 2px rgba(var(--primary-rgb),.16)",
}

const themePreview = {
  height: 145,
  display: "flex",
  overflow: "hidden",
  borderRadius: 12,
  marginBottom: 12,
  padding: 8,
  gap: 8,
}

const miniSidebar = {
  width: "27%",
  borderRadius: 8,
  padding: 7,
  display: "flex",
  flexDirection: "column",
  gap: 7,
}

const dot = {
  width: 18,
  height: 18,
  borderRadius: 6,
  display: "block",
}

const miniLine = {
  height: 5,
  borderRadius: 99,
  opacity: 0.65,
  display: "block",
}

const miniContent = {
  flex: 1,
  borderRadius: 8,
  padding: 10,
  minWidth: 0,
}

const miniTitle = {
  fontSize: 10,
  fontWeight: 800,
}

const miniCards = {
  display: "flex",
  gap: 5,
  marginTop: 14,
}

const miniCard = {
  width: 28,
  height: 20,
  borderRadius: 5,
  display: "block",
}

const miniData = {
  marginTop: 16,
  fontSize: 9,
  fontWeight: 700,
}

const themeName = {
  fontWeight: 800,
  fontSize: 15,
}

const themeDescription = {
  marginTop: 4,
  color: "var(--muted)",
  fontSize: 12,
  lineHeight: 1.4,
}

const radio = {
  marginTop: 10,
  fontSize: 12,
  color: "var(--primary)",
  fontWeight: 800,
}

const livePreview = {
  minHeight: 360,
  display: "flex",
  overflow: "hidden",
  borderRadius: 22,
  padding: 12,
  gap: 12,
}

const liveSidebar = {
  width: 180,
  padding: 16,
  borderRadius: 16,
  display: "flex",
  flexDirection: "column",
  gap: 14,
  fontSize: 12,
  flexShrink: 0,
}

const previewSmallLogo = {
  width: 54,
  height: 54,
  objectFit: "contain",
  borderRadius: 12,
  background: "rgba(255,255,255,.08)",
}

const previewFallback = {
  width: 54,
  height: 54,
  display: "grid",
  placeItems: "center",
  borderRadius: 12,
  color: "#111",
}

const liveMain = {
  flex: 1,
  padding: 18,
  minWidth: 0,
}

const liveStats = {
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  gap: 12,
  marginTop: 20,
}

const liveStat = {
  padding: 16,
  borderWidth: 1,
  borderStyle: "solid",
  borderRadius: 14,
  display: "flex",
  flexDirection: "column",
  gap: 8,
}
