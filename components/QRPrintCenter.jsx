"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import QRCode from "react-qr-code"
import { supabase } from "@/lib/supabase"

const BRAND_LOGO = "/anaira-branding.png"
const PUBLIC_BASE = "https://anairapos.in"

export default function QRPrintCenter({ superAdmin = false }) {
  const searchParams = useSearchParams()
  const initialRestaurantId = searchParams.get("rid") || ""

  const [restaurants, setRestaurants] = useState([])
  const [restaurantId, setRestaurantId] = useState("")
  const [restaurant, setRestaurant] = useState(null)
  const [tables, setTables] = useState([])
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [pluginAccess, setPluginAccess] = useState(superAdmin ? true : null)
  const [orderingEnabled, setOrderingEnabled] = useState(superAdmin)
  const [printEnabled, setPrintEnabled] = useState(false)
  const printRef = useRef(null)

  useEffect(() => {
    loadRestaurants()
  }, [superAdmin, initialRestaurantId])

  useEffect(() => {
    if (!restaurantId) return

    if (superAdmin) {
      setPluginAccess(true)
      loadQRData(restaurantId)
      const timer = setInterval(() => loadQRData(restaurantId, true), 15000)
      return () => clearInterval(timer)
    }

    let cancelled = false

    async function verifyAccess() {
      try {
        setPluginAccess(null)
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token
        if (!token) throw new Error("Session expired. Please login again.")

        const response = await fetch(
          `/api/qr-menu/access?restaurant_id=${encodeURIComponent(restaurantId)}`,
          {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            cache: "no-store",
          }
        )
        const payload = await response.json()
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "Unable to verify QR Menu access")
        }

        if (cancelled) return
        setPluginAccess(payload.enabled === true)
        setOrderingEnabled(payload.orderingEnabled === true)
        setPrintEnabled(payload.printEnabled === true)

        if (payload.enabled === true) {
          await loadQRData(restaurantId)
        } else {
          setRestaurant(null)
          setTables([])
          setRooms([])
        }
      } catch (err) {
        if (cancelled) return
        console.error("QR MENU ACCESS ERROR:", err)
        setPluginAccess(false)
        setError(err?.message || "QR Menu is not available")
      }
    }

    verifyAccess()

    const timer = setInterval(() => {
      verifyAccess()
    }, 15000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [restaurantId, superAdmin])

  async function loadRestaurants() {
    try {
      setLoading(true)
      setError("")

      if (superAdmin) {
        const { data, error: restError } = await supabase
          .from("restaurants")
          .select("id,name,slug,logo,address,phone,description,cuisine")
          .order("name")

        if (restError) throw new Error(restError.message)

        const list = data || []
        setRestaurants(list)
        if (list.length && !restaurantId) {
          const preferred = list.find((item) => item.id === initialRestaurantId)
          setRestaurantId(preferred?.id || list[0].id)
        }
        return
      }

      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user) throw new Error("Please login again")

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("restaurant_id,role")
        .eq("id", userData.user.id)
        .maybeSingle()

      if (profileError) throw new Error("Unable to load restaurant profile")

      const metadataRestaurantId =
        userData.user.user_metadata?.restaurant_id ||
        userData.user.app_metadata?.restaurant_id ||
        null

      let resolvedRestaurantId = profile?.restaurant_id || metadataRestaurantId || null

      if (!resolvedRestaurantId) {
        const { data: ownedRestaurant } = await supabase
          .from("restaurants")
          .select("id")
          .eq("owner_id", userData.user.id)
          .limit(1)
          .maybeSingle()
        resolvedRestaurantId = ownedRestaurant?.id || null
      }

      if (!resolvedRestaurantId) {
        throw new Error("Restaurant not linked to this account")
      }

      setRestaurantId(resolvedRestaurantId)
    } catch (err) {
      console.error("QR RESTAURANT LOAD ERROR:", err)
      setError(err?.message || "Unable to load restaurants")
    } finally {
      setLoading(false)
    }
  }

  async function loadQRData(rid, silent = false) {
    try {
      if (!silent) setLoading(true)
      setError("")

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      if (!token) throw new Error("Session expired. Please login again.")

      const response = await fetch(
        `/api/qr/print-data?restaurant_id=${encodeURIComponent(rid)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          cache: "no-store",
        }
      )

      const payload = await response.json()
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load QR data")
      }

      setRestaurant(payload.restaurant || null)
      setTables(payload.tables || [])
      setRooms(payload.rooms || [])
      setOrderingEnabled(payload.orderingEnabled === true)
      setPrintEnabled(payload.printEnabled === true)
    } catch (err) {
      console.error("QR DATA ERROR:", err)
      setError(err?.message || "Unable to load QR data")
      setTables([])
      setRooms([])
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const selectedRestaurant = useMemo(() => {
    return restaurant || restaurants.find((item) => item.id === restaurantId) || null
  }, [restaurant, restaurants, restaurantId])

  function qrUrl(type, id) {
    const base = typeof window !== "undefined"
      ? window.location.origin
      : PUBLIC_BASE
    const slug = selectedRestaurant?.slug
    if (!slug) return ""
    return `${base}/${encodeURIComponent(slug)}/order/${type}/${encodeURIComponent(id)}`
  }

  function handlePrint() {
    if (!printEnabled) {
      alert("QR Print Center is disabled for this restaurant.")
      return
    }
    if (!tables.length && !rooms.length) {
      alert("No tables or rooms found for this restaurant.")
      return
    }
    window.print()
  }

  const total = tables.length + rooms.length

  return (
    <div className="qr-print-center" style={page}>
      <div className="qr-toolbar" style={toolbar}>
        <div>
          <div style={eyebrow}>{printEnabled ? "ANAIRA QR PRINT CENTER" : "ANAIRA QR MENU"}</div>
          <h1 style={heading}>{printEnabled ? "Restaurant QR Codes" : "QR Menu & Ordering"}</h1>
          <p style={subtitle}>
            Every active table and room gets its own QR automatically. Guests can scan to browse
            and order. QR printing is available only when the separate QR Print Center plugin is enabled.
          </p>
        </div>

        <div style={actions}>
          {superAdmin && (
            <select
              value={restaurantId}
              onChange={(e) => setRestaurantId(e.target.value)}
              style={select}
            >
              <option value="">Select restaurant</option>
              {restaurants.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}

          <button type="button" onClick={() => loadQRData(restaurantId)} style={secondaryButton}>
            ↻ Refresh
          </button>
          {printEnabled && (
            <button type="button" onClick={handlePrint} style={primaryButton}>
              🖨️ Print All / Save PDF
            </button>
          )}
        </div>
      </div>

      {error && <div className="qr-error-box" style={errorBox}>⚠️ {error}</div>}

      {pluginAccess === null ? (
        <div style={emptyState}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🔐</div>
          <h3 style={{ margin: "0 0 8px" }}>Checking QR Menu access…</h3>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Verifying the restaurant plugin status.
          </p>
        </div>
      ) : pluginAccess === false ? (
        <div style={emptyState}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <h2 style={{ margin: "0 0 8px" }}>QR Menu is locked</h2>
          <p style={{ color: "var(--muted)", maxWidth: 520, margin: "0 auto", lineHeight: 1.6 }}>
            Super Admin must activate the separate <strong>QR Print Center</strong> plugin for this restaurant.
            Advanced QR Ordering remains independent and controls the public customer ordering runtime.
          </p>
        </div>
      ) : loading && !selectedRestaurant ? (
        <div style={emptyState}>Loading QR Print Center…</div>
      ) : !selectedRestaurant ? (
        <div style={emptyState}>Select a restaurant to generate QR cards.</div>
      ) : (
        <>
          <div className="qr-summary" style={summaryCard}>
            <div style={restaurantIdentity}>
              <div style={restaurantLogoWrap}>
                {selectedRestaurant.logo ? (
                  <img src={selectedRestaurant.logo} alt="" style={restaurantLogo} />
                ) : (
                  <div style={restaurantLogoFallback}>🍽️</div>
                )}
              </div>
              <div>
                <div style={eyebrow}>READY TO PRINT</div>
                <h2 style={restaurantName}>{selectedRestaurant.name}</h2>
                <p style={restaurantMeta}>
                  {selectedRestaurant.address || selectedRestaurant.cuisine || "Restaurant QR Ordering"}
                </p>
              </div>
            </div>

            <div style={countGrid}>
              <div style={countBox}><strong>{tables.length}</strong><span>Tables</span></div>
              <div style={countBox}><strong>{rooms.length}</strong><span>Rooms</span></div>
              <div style={countBox}><strong>{total}</strong><span>Total QR</span></div>
            </div>
          </div>

          <div ref={printRef} className="qr-print-sheet" style={printSheet}>
            <PrintHeader restaurant={selectedRestaurant} />

            {tables.length > 0 && (
              <section style={section}>
                <div className="print-section-title" style={sectionTitle}>🍽️ TABLE QR CODES</div>
                <div className="qr-grid" style={qrGrid}>
                  {tables.map((item, index) => (
                    <QRCard
                      key={item.id}
                      type="table"
                      label={`Table ${item.table_number ?? index + 1}`}
                      url={qrUrl("table", item.id)}
                      restaurant={selectedRestaurant}
                      canPrint={printEnabled}
                    />
                  ))}
                </div>
              </section>
            )}

            {rooms.length > 0 && (
              <section style={section} className="print-break-before">
                <div className="print-section-title" style={sectionTitle}>🏨 ROOM QR CODES</div>
                <div className="qr-grid" style={qrGrid}>
                  {rooms.map((item, index) => (
                    <QRCard
                      key={item.id}
                      type="room"
                      label={`Room ${item.room_number ?? index + 1}`}
                      url={qrUrl("room", item.id)}
                      restaurant={selectedRestaurant}
                      canPrint={printEnabled}
                    />
                  ))}
                </div>
              </section>
            )}

            {!tables.length && !rooms.length && (
              <div style={emptyPrint}>
                <div style={{ fontSize: 42 }}>📱</div>
                <h3>No QR codes yet</h3>
                <p>Add tables or rooms to this restaurant. The QR Print Center will generate the cards automatically.</p>
              </div>
            )}
          </div>
        </>
      )}

      <p className="qr-footer-note" style={footerNote}>
        Powered by Anaira Graphics • Smart QR Ordering • Scan, Browse &amp; Order with Ease
      </p>
    </div>
  )
}

function PrintHeader({ restaurant }) {
  return (
    <header className="qr-print-header" style={printHeader}>
      <div style={printHeaderBrand}>
        {restaurant.logo ? (
          <img src={restaurant.logo} alt="" style={printRestaurantLogo} />
        ) : (
          <div style={printRestaurantFallback}>🍽️</div>
        )}
        <div>
          <div style={printEyebrow}>WELCOME TO</div>
          <h2 style={printRestaurantName}>{restaurant.name}</h2>
          <p style={printTagline}>
            Scan • Explore our menu • Order from your table or room
          </p>
        </div>
      </div>
      <img src={BRAND_LOGO} alt="Anaira Graphics" style={anairaLogo} />
    </header>
  )
}

function QRCard({ type, label, url, restaurant, canPrint = false }) {
  const cardRef = useRef(null)
  const qrRef = useRef(null)

  function safeFileName(value) {
    return String(value || "qr")
      .trim()
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "qr"
  }

  function downloadPNG() {
    const svg = qrRef.current?.querySelector("svg")
    if (!svg || !url) {
      alert("QR code is not ready yet.")
      return
    }

    const serializer = new XMLSerializer()
    const cloned = svg.cloneNode(true)
    cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg")
    cloned.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink")
    const svgText = serializer.serializeToString(cloned)
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" })
    const objectUrl = URL.createObjectURL(blob)
    const image = new Image()

    image.onload = () => {
      const scale = 4
      const canvas = document.createElement("canvas")
      canvas.width = image.width * scale
      canvas.height = image.height * scale
      const ctx = canvas.getContext("2d")
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(objectUrl)

      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return
        const downloadUrl = URL.createObjectURL(pngBlob)
        const a = document.createElement("a")
        a.href = downloadUrl
        a.download = `${safeFileName(restaurant?.name)}-${safeFileName(label)}-qr.png`
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
      }, "image/png")
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      alert("Unable to download this QR code.")
    }

    image.src = objectUrl
  }

  function printOne() {
    if (!cardRef.current || !url) {
      alert("QR code is not ready yet.")
      return
    }

    const popup = window.open("", "_blank", "width=800,height=900")
    if (!popup) {
      alert("Please allow pop-ups to print a QR card.")
      return
    }

    const cardHtml = cardRef.current.outerHTML
    popup.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${label} QR</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; font-family: Arial, sans-serif; color: #122017; }
  .qr-card { width: 90mm; margin: 20mm auto; border: 1px solid #cbd5cf; border-radius: 5mm; padding: 6mm; text-align: center; }
  .qr-card-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
  .qr-pill { font-size:10px; letter-spacing:1px; font-weight:800; color:#8b5d00; }
  .qr-brand { font-size:10px; font-weight:800; color:#789184; }
  .qr-card-logo-line { display:flex; justify-content:center; align-items:center; gap:8px; min-height:36px; }
  .qr-card-logo-line img { width:30px; height:30px; object-fit:contain; border-radius:7px; }
  .qr-label { font-size:18px; }
  .qr-code-wrap { display:flex; justify-content:center; padding:12px; margin:12px auto 10px; background:#fff; border-radius:12px; width:fit-content; }
  .qr-code-wrap svg { width:190px; height:190px; }
  .scan-title { margin:4px 0; font-size:18px; color:#0a1d15; }
  .scan-text { margin:0 auto; max-width:250px; font-size:11px; line-height:1.45; color:#5b6b60; }
  .card-divider { height:1px; background:#e5ebe6; margin:12px 0 9px; }
  .card-branding { display:flex; justify-content:center; align-items:center; gap:6px; font-size:9px; color:#738177; font-weight:700; }
  .card-branding img { width:25px; height:25px; object-fit:contain; }
  .qr-card-actions { display:none !important; }
</style>
</head>
<body>${cardHtml}</body>
</html>`)
    popup.document.close()
    const print = () => {
      popup.focus()
      popup.print()
      popup.close()
    }
    if (popup.document.readyState === "complete") {
      setTimeout(print, 250)
    } else {
      popup.onload = () => setTimeout(print, 250)
    }
  }

  return (
    <article ref={cardRef} className="qr-card" style={qrCard}>
      <div style={qrCardTop}>
        <span style={qrPill}>{type === "table" ? "TABLE ORDER" : "ROOM ORDER"}</span>
        <span style={qrBrand}>ANAIRA</span>
      </div>

      <div style={qrCardLogoLine}>
        {restaurant.logo ? (
          <img src={restaurant.logo} alt="" style={miniRestaurantLogo} />
        ) : (
          <div style={miniRestaurantFallback}>🍽️</div>
        )}
        <strong style={qrLabel}>{label}</strong>
      </div>

      <div ref={qrRef} className="qr-code-wrap" style={qrCodeWrap}>
        {url ? (
          <QRCode value={url} size={148} bgColor="#ffffff" fgColor="#0a1d15" />
        ) : (
          <div style={invalidQr}>Restaurant slug missing</div>
        )}
      </div>

      <h3 style={scanTitle}>Scan to Order</h3>
      <p style={scanText}>
        Browse the menu, choose your favourites and place your order directly from here.
      </p>

      <div style={cardDivider} />
      <div style={cardBranding}>
        <img src={BRAND_LOGO} alt="Anaira Graphics" style={cardBrandLogo} />
        <span>Powered by Anaira Graphics</span>
      </div>

      {canPrint && (
        <div className="qr-card-actions" style={cardActions}>
          <button type="button" onClick={downloadPNG} style={cardActionSecondary}>⬇ Download PNG</button>
          <button type="button" onClick={printOne} style={cardActionPrimary}>🖨 Print</button>
        </div>
      )}
    </article>
  )
}

const page = {
  minHeight: "100vh",
  padding: "28px",
  background: "radial-gradient(circle at top, rgba(var(--primary-rgb),.10), transparent 32%), var(--background)",
  color: "var(--text)",
}
const toolbar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 20,
  marginBottom: 22,
}
const eyebrow = { fontSize: 11, letterSpacing: 2.2, color: "var(--primary)", fontWeight: 800 }
const heading = { margin: "6px 0 8px", fontSize: "clamp(28px,4vw,44px)", lineHeight: 1.05 }
const subtitle = { margin: 0, color: "var(--muted)", maxWidth: 760, lineHeight: 1.6 }
const actions = { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "flex-end" }
const select = { minWidth: 220, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", outline: "none" }
const primaryButton = { padding: "12px 18px", border: 0, borderRadius: 12, background: "var(--primary)", color: "#111", fontWeight: 800, cursor: "pointer" }
const secondaryButton = { padding: "12px 18px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", color: "var(--text)", fontWeight: 700, cursor: "pointer" }
const infoBox = { padding: 14, marginBottom: 18, borderRadius: 14, background: "rgba(var(--primary-rgb),.08)", border: "1px solid rgba(var(--primary-rgb),.22)", color: "var(--text)" }
const errorBox = { padding: 14, marginBottom: 18, borderRadius: 14, background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.35)", color: "#fca5a5" }
const emptyState = { padding: 50, borderRadius: 24, textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }
const summaryCard = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, marginBottom: 24, padding: 22, borderRadius: 24, background: "linear-gradient(135deg,var(--surface),var(--surface-2))", border: "1px solid rgba(var(--primary-rgb),.2)" }
const restaurantIdentity = { display: "flex", alignItems: "center", gap: 15, minWidth: 0 }
const restaurantLogoWrap = { width: 64, height: 64, borderRadius: 16, display: "grid", placeItems: "center", background: "#fff", overflow: "hidden", flex: "0 0 auto" }
const restaurantLogo = { width: "100%", height: "100%", objectFit: "contain" }
const restaurantLogoFallback = { fontSize: 28 }
const restaurantName = { margin: "4px 0", fontSize: 24 }
const restaurantMeta = { margin: 0, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 620 }
const countGrid = { display: "grid", gridTemplateColumns: "repeat(3, minmax(70px,1fr))", gap: 10 }
const countBox = { padding: "10px 14px", borderRadius: 14, background: "rgba(var(--primary-rgb),.06)", border: "1px solid rgba(var(--primary-rgb),.16)", textAlign: "center" }
const printSheet = { background: "var(--surface)", borderRadius: 28, padding: 28, border: "1px solid rgba(var(--primary-rgb),.16)" }
const printHeader = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, paddingBottom: 22, marginBottom: 24, borderBottom: "2px solid rgba(var(--primary-rgb),.22)" }
const printHeaderBrand = { display: "flex", alignItems: "center", gap: 14 }
const printRestaurantLogo = { width: 68, height: 68, objectFit: "contain", borderRadius: 14, background: "#fff" }
const printRestaurantFallback = { width: 68, height: 68, display: "grid", placeItems: "center", borderRadius: 14, background: "#fff", fontSize: 30 }
const printEyebrow = { fontSize: 10, letterSpacing: 2, color: "var(--primary)", fontWeight: 800 }
const printRestaurantName = { margin: "3px 0 4px", fontSize: 26 }
const printTagline = { margin: 0, color: "var(--muted)", fontSize: 12 }
const anairaLogo = { width: 88, height: 88, objectFit: "contain" }
const section = { marginBottom: 28 }
const sectionTitle = { fontSize: 14, letterSpacing: 1.8, color: "var(--primary)", fontWeight: 900, marginBottom: 14 }
const qrGrid = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }
const qrCard = { background: "#fff", color: "#122017", border: "1px solid #d7dfd8", borderRadius: 18, padding: 16, textAlign: "center", boxShadow: "0 10px 24px rgba(0,0,0,.08)", breakInside: "avoid" }
const qrCardTop = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }
const qrPill = { fontSize: 9, letterSpacing: 1.2, fontWeight: 900, color: "#8b5d00" }
const qrBrand = { fontSize: 9, fontWeight: 900, color: "#789184", letterSpacing: 1 }
const qrCardLogoLine = { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 36 }
const miniRestaurantLogo = { width: 30, height: 30, objectFit: "contain", borderRadius: 7, background: "#fff" }
const miniRestaurantFallback = { fontSize: 22 }
const qrLabel = { fontSize: 18 }
const qrCodeWrap = { display: "flex", justifyContent: "center", padding: 12, margin: "12px auto 10px", background: "#fff", borderRadius: 12, width: "fit-content" }
const invalidQr = { width: 148, height: 148, display: "grid", placeItems: "center", fontSize: 12, color: "#b91c1c", background: "#fee2e2" }
const scanTitle = { margin: "4px 0", fontSize: 18, color: "#0a1d15" }
const scanText = { margin: "0 auto", maxWidth: 250, fontSize: 11, lineHeight: 1.45, color: "#5b6b60" }
const cardDivider = { height: 1, background: "#e5ebe6", margin: "12px 0 9px" }
const cardBranding = { display: "flex", justifyContent: "center", alignItems: "center", gap: 6, fontSize: 9, color: "#738177", fontWeight: 700 }
const cardBrandLogo = { width: 25, height: 25, objectFit: "contain" }
const cardActions = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }
const cardActionSecondary = { padding: "9px 8px", borderRadius: 9, border: "1px solid #cbd5cf", background: "#f8faf9", color: "#183126", fontWeight: 800, fontSize: 11, cursor: "pointer" }
const cardActionPrimary = { padding: "9px 8px", borderRadius: 9, border: "1px solid #183126", background: "#183126", color: "#fff", fontWeight: 800, fontSize: 11, cursor: "pointer" }
const emptyPrint = { padding: 60, textAlign: "center", border: "1px dashed rgba(var(--primary-rgb),.3)", borderRadius: 20, color: "var(--muted)" }
const footerNote = { margin: "20px 0 0", textAlign: "center", color: "var(--muted)", fontSize: 11 }

export const qrPrintResponsiveStyles = `
@media (max-width: 900px) {
  .qr-toolbar { flex-direction: column; align-items: stretch !important; }
  .qr-toolbar > div:last-child { justify-content: flex-start !important; }
  .qr-summary { flex-direction: column; align-items: stretch !important; }
  .qr-grid { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
}
@media (max-width: 560px) {
  .qr-print-center { padding: 14px !important; }
  .qr-grid { grid-template-columns: 1fr !important; }
  .qr-print-sheet { padding: 14px !important; border-radius: 18px !important; }
  .qr-print-header { align-items: flex-start !important; }
  .qr-print-header img { width: 62px !important; height: 62px !important; }
  .qr-summary { padding: 16px !important; }
  .qr-summary select { width: 100%; }
}
@media print {
  @page { size: A4 portrait; margin: 8mm; }
  html, body { background: #fff !important; color: #122017 !important; }
  body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .qr-print-center { padding: 0 !important; background: #fff !important; color: #122017 !important; }
  .qr-toolbar, .qr-summary, .qr-print-center > .qr-error-box, .qr-print-center > .qr-footer-note { display: none !important; }
  .qr-print-sheet { display: block !important; padding: 0 !important; border: 0 !important; border-radius: 0 !important; background: #fff !important; }
  .qr-print-header { margin-bottom: 10mm !important; padding-bottom: 5mm !important; }
  .qr-grid { grid-template-columns: repeat(2, minmax(0,1fr)) !important; gap: 6mm !important; }
  .qr-card { border: 1px solid #cbd5cf !important; box-shadow: none !important; border-radius: 4mm !important; padding: 4mm !important; }
  .qr-card-actions { display: none !important; }
  .print-break-before { break-before: page; page-break-before: always; }
  .print-section-title { margin-top: 2mm; }
  .qr-card:nth-child(4n+1) { break-before: auto; }
}
`
