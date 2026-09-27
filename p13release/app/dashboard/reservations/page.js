"use client"
import { formatIndiaTime, indiaDateKey } from "@/lib/indiaTime"

import { useEffect, useRef, useState } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"

export default function ReservationPage() {

  const [reservations, setReservations] = useState([])
  const [tables, setTables] = useState([])
  const [availableTables, setAvailableTables] = useState([])

 const [form, setForm] = useState({
  name: "",
  phone: "",
  guests: 1,
  table_id: "",
  date: "",
  time: "",
  duration: 60,
  notes: ""
})
  const [editId, setEditId] = useState(null)
  const [search, setSearch] = useState("")
const [filter, setFilter] = useState("all")
const [restaurantId, setRestaurantId] = useState(null)
  const [pluginActive, setPluginActive] = useState(false)
  const [pluginConfig, setPluginConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [initError, setInitError] = useState("")
  const initializedRef = useRef(false)
  const mountedRef = useRef(true)
  const [submitting, setSubmitting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [selectedReservation, setSelectedReservation] = useState(null)

  const normalizePhone = value => String(value || "").replace(/\D/g, "")
  const todayISO = indiaDateKey(new Date())

  const getRestaurant = async () => {
    try {
      setInitError("")

          // Use the already-persisted client session instead of getUser().
      // In Next.js development, StrictMode can invoke effects twice; concurrent
      // getUser()/refresh requests can fight over Supabase's auth-token lock.
      const { data: sessionData, error: sessionError } = await supabaseCloud.auth.getSession()
      if (sessionError) throw sessionError

      const user = sessionData?.session?.user || null
      if (!user) {
        setInitError("Please login again.")
        return
      }

      const { data, error } = await supabaseCloud
        .from("profiles")
        .select("restaurant_id, role")
        .eq("id", user.id)
        .maybeSingle()

      if (error) throw error

      if (!data?.restaurant_id) {
        setInitError("Restaurant mapping not found for this account.")
        return
      }

      const rid = data.restaurant_id
      setRestaurantId(rid)

      const { data: plugin, error: pluginError } = await supabaseCloud
        .from("restaurant_plugins")
        .select("enabled")
        .eq("restaurant_id", rid)
        .in("plugin_code", ["reservations-pro", "reservations"])
        .eq("enabled", true)
        .limit(1)
        .maybeSingle()

      if (pluginError) console.warn("Reservation plugin lookup:", pluginError)
      setPluginActive(plugin?.enabled === true)

      const { data: settings, error: settingsError } = await supabaseCloud
        .from("plugin_settings")
        .select("config")
        .eq("restaurant_id", rid)
        .eq("plugin_code", "reservations-pro")
        .maybeSingle()

      if (settingsError) console.warn("Reservation plugin settings:", settingsError)
      setPluginConfig(settings?.config || {})
    } catch (error) {
      console.error("Reservation initialization failed:", error)
      setInitError(error?.message || "Unable to load Reservations.")
      setPluginActive(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    mountedRef.current = true

    void getRestaurant()

    return () => {
      mountedRef.current = false
    }
  }, [])

useEffect(() => {

  if (!restaurantId || !pluginActive) return

  fetchTables()
  fetchReservations()

}, [restaurantId, pluginActive])

  // 🔥 FETCH TABLES
  async function fetchTables() {
    const { data, error } = await supabaseCloud
  .from("tables")
  .select("*")
  .eq("restaurant_id", restaurantId)
    if (error) {
  console.log("FETCH ERROR:", error)
  alert(error.message)
  return
}

    setTables(data || [])
    setAvailableTables(data || [])
  }

  // 🔥 FETCH RESERVATIONS (FIXED RELATION)
  async function fetchReservations() {
    const { data, error } = await supabaseCloud
      .from("reservations")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("date", { ascending: true })
      .order("time", { ascending: true })

    if (error) {
      console.error("RESERVATIONS FETCH ERROR:", error)
      return
    }
    if (!mountedRef.current) return
    setReservations(data || [])
    setLastUpdated(new Date())
  }

  async function refreshReservations() {
    if (!restaurantId || !pluginActive || refreshing) return
    try {
      setRefreshing(true)
      await Promise.all([fetchTables(), fetchReservations()])
    } finally {
      if (mountedRef.current) setRefreshing(false)
    }
  }

  function toMinutes(value) {
    const [hh, mm] = String(value || "").split(":").map(Number)
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
    return hh * 60 + mm
  }

  function overlaps(startA, durationA, startB, durationB) {
    const a = toMinutes(startA)
    const b = toMinutes(startB)
    if (a == null || b == null) return false
    const endA = a + Number(durationA || 60)
    const endB = b + Number(durationB || 60)
    return a < endB && b < endA
  }

  async function checkAvailableTables(date, time, duration = form.duration) {
    if (!date || !time) { setAvailableTables(tables); return }
    const { data, error } = await supabaseCloud
      .from("reservations")
      .select("id, table_id, date, time, duration, status")
      .eq("restaurant_id", restaurantId)
      .eq("date", date)
      .in("status", ["pending", "confirmed"])
    if (error) {
      console.error("AVAILABILITY CHECK ERROR:", error)
      setAvailableTables(tables)
      return
    }
    const booked = (data || [])
      .filter(r => r.id !== editId)
      .filter(r => overlaps(time, Number(duration || 60), r.time, Number(r.duration || 60)))
      .map(r => r.table_id)
    setAvailableTables(tables.filter(t => !booked.includes(t.id)))
  }

  function handleChange(e){
    const updated = { ...form, [e.target.name]: e.target.value }
    setForm(updated)
    if (updated.date && updated.time) {
      void checkAvailableTables(updated.date, updated.time, updated.duration)
    } else if (!updated.date && !updated.time) {
      setAvailableTables(tables)
    }
  }

  // 🔥 SAVE
  async function saveReservation() {
    const phone = normalizePhone(form.phone)
    const guests = Number(form.guests || 0)
    const duration = Number(form.duration || 0)
    if (!form.name.trim() || phone.length < 10 || !form.table_id || !form.date || !form.time) {
      alert("Please fill customer, valid phone, date, time and table.")
      return
    }
    if (guests < 1) { alert("Guests must be at least 1."); return }
    if (duration < 15) { alert("Reservation duration must be at least 15 minutes."); return }
    if (!editId && form.date < todayISO) { alert("Reservation date cannot be in the past."); return }
    try {
      setSubmitting(true)
      const { data: sessionData } = await supabaseCloud.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error("Login session expired")
      const response = await fetch("/api/reservations/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: editId ? "update" : "create",
          reservation_id: editId || undefined,
          ...form,
          name: form.name.trim(), phone, guests, duration
        })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.error || "Reservation failed")
      const wasEditing = Boolean(editId)
      resetForm()
      await fetchReservations()
      alert(wasEditing ? "Reservation updated successfully" : "Reservation created successfully")
    } catch (error) {
      console.error(error)
      alert(error.message || "Reservation failed")
    } finally {
      if (mountedRef.current) setSubmitting(false)
    }
  }

  function editReservation(r){
    setSelectedReservation(r)
    setForm({ name:r.name||"", phone:r.phone||"", table_id:r.table_id||"", date:r.date||"", time:r.time||"", guests:r.guests||1, duration:r.duration||60, notes:r.notes||"" })
    setEditId(r.id)
    if (r.date && r.time) void checkAvailableTables(r.date, r.time, r.duration || 60)
    window.scrollTo({ top:0, behavior:"smooth" })
  }

  function resetForm() {
    setEditId(null)
    setSelectedReservation(null)
    setForm({ name:"", phone:"", guests:1, table_id:"", date:"", time:"", duration:Number(pluginConfig.default_duration_minutes||90), notes:"" })
    setAvailableTables(tables)
  }

  async function deleteReservation(id) {
    if (!window.confirm("Delete this reservation?")) return

    try {
      const { data: sessionData } = await supabaseCloud.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error("Login session expired")

      const response = await fetch("/api/reservations/manage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: "delete",
          reservation_id: id
        })
      })

      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || "Delete failed")
      if (selectedReservation?.id === id) resetForm()
      await fetchReservations()
    } catch (error) {
      console.error(error)
      alert(error.message || "Delete failed")
    }
  }

  async function updateStatus(id, status) {
    try {
      const { data: sessionData } = await supabaseCloud.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error("Login session expired")

      const response = await fetch("/api/reservations/manage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: "status",
          reservation_id: id,
          status
        })
      })

      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || "Status update failed")
      await fetchReservations()
    } catch (error) {
      console.error(error)
      alert(error.message || "Status update failed")
    }
  }


  const now = new Date()
  const todayReservations = reservations.filter(r => r.date === todayISO)
  const upcomingReservations = reservations.filter(r => r.date > todayISO || (r.date === todayISO && (r.time || "") >= now.toTimeString().slice(0,5)))
  const activeReservations = reservations.filter(r => ["pending", "confirmed"].includes(r.status))
  const availableTableCount = availableTables.length
  const filteredReservations = reservations.filter(r=>{
    const q = search.toLowerCase().trim()
    const matchesSearch = !q || [r.name, r.phone, r.table_id].some(v => String(v || "").toLowerCase().includes(q))
    const matchesFilter = filter === "all" || r.status === filter
      || (filter === "today" && r.date === todayISO)
      || (filter === "upcoming" && (r.date > todayISO || (r.date === todayISO && (r.time || "") >= now.toTimeString().slice(0,5))))
    return matchesSearch && matchesFilter
  })

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", padding: 30, background: "var(--background)", color: "var(--text)" }}>
        <div style={{ maxWidth: 700, margin: "12vh auto", padding: 30, borderRadius: 22, background: "var(--surface)", border: "1px solid var(--border)", textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>⏳</div>
          <h1>Loading Reservations…</h1>
          <p style={{ color: "var(--muted)" }}>Checking restaurant and plugin access.</p>
        </div>
      </main>
    )
  }

  if (initError) {
    return (
      <main style={{ minHeight: "100vh", padding: 30, background: "var(--background)", color: "var(--text)" }}>
        <div style={{ maxWidth: 700, margin: "12vh auto", padding: 30, borderRadius: 22, background: "var(--surface)", border: "1px solid var(--border)", textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <h1>Reservations unavailable</h1>
          <p style={{ color: "var(--muted)" }}>{initError}</p>
        </div>
      </main>
    )
  }


  if (!pluginActive) {
    return (
      <main style={{minHeight:"100vh",padding:30,background:"var(--background)",color:"var(--text)"}}>
        <div style={{maxWidth:700,margin:"12vh auto",padding:30,borderRadius:22,background:"var(--surface)",border:"1px solid var(--border)",textAlign:"center"}}>
          <div style={{fontSize:48}}>📅</div>
          <h1>Advanced Reservations</h1>
          <p style={{color:"var(--muted)"}}>This plugin is currently OFF. Super Admin can activate Advanced Reservations for this restaurant from Plugin Manager.</p>
        </div>
      </main>
    )
  }

  return (
    <>
    <style jsx global>{`
.reservations-page{position:relative;max-width:1560px;margin:0 auto;isolation:isolate}
.reservations-page:before{content:"";position:absolute;inset:0 8% auto;height:380px;background:radial-gradient(circle at 20% 10%,rgba(var(--primary-rgb),.10),transparent 50%),radial-gradient(circle at 80% 0%,rgba(var(--warning-rgb),.08),transparent 45%);pointer-events:none;z-index:-1}
.hero-title-row{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin:2px 0 18px;padding:4px 2px}
.page-kicker{display:inline-flex;align-items:center;gap:8px;color:#d9dee8;font-size:11px;font-weight:900;letter-spacing:1.7px;text-transform:uppercase}
.page-kicker:before{content:"";width:26px;height:2px;background:linear-gradient(90deg,var(--primary),var(--warning));border-radius:10px}
.hero-subtitle{margin:0;color:var(--muted);font-size:14px;max-width:700px;line-height:1.55}
.live-badge{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25);color:#7af2a0;font-weight:900;font-size:11px;letter-spacing:1.1px;box-shadow:0 10px 24px rgba(0,0,0,.16)}
.live-badge i{width:8px;height:8px;border-radius:50%;background:var(--success);box-shadow:0 0 0 5px rgba(74,222,128,.10)}
.reservation-header-bar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:0 0 18px;padding:14px 16px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.025));backdrop-filter:blur(22px);box-shadow:0 16px 45px rgba(0,0,0,.20)}
.reservation-kicker{display:block;font-size:10px;letter-spacing:1.7px;color:var(--muted);font-weight:900;margin-bottom:4px;text-transform:uppercase}.reservation-header-bar strong{display:block;color:var(--text);font-size:14px}.reservation-header-bar small{display:block;color:var(--muted);font-size:11px;margin-top:2px}
.reservation-header-actions{display:flex;gap:8px}.ghost-btn,.refresh-btn,.view-btn,.detail-actions button{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:var(--text);border-radius:11px;padding:9px 13px;font-weight:800;cursor:pointer;transition:.2s}.ghost-btn:hover,.refresh-btn:hover,.view-btn:hover,.detail-actions button:hover{background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.20)}.refresh-btn:disabled{opacity:.6;cursor:wait}
.stats-grid,.reservations-page .stats-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:12px!important;margin-bottom:12px!important}
.main-stat{padding:18px 18px 16px!important;border-radius:19px!important;background:linear-gradient(145deg,rgba(255,255,255,.065),rgba(255,255,255,.025))!important;border:1px solid rgba(255,255,255,.08)!important;box-shadow:0 18px 45px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.04)!important;position:relative;overflow:hidden}
.main-stat:after{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,rgba(var(--primary-rgb),.7),rgba(var(--warning-rgb),.45));opacity:.8}
.main-stat h2{font-size:34px!important;line-height:1!important;margin:0 0 8px!important;letter-spacing:-1px}.main-stat p{margin:0;color:var(--muted);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.8px}
.reservation-extra-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:0 0 18px}.mini-stat{padding:12px 14px;border-radius:15px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}.mini-stat span{display:block;color:var(--muted);font-size:11px;font-weight:800}.mini-stat b{display:block;color:var(--text);font-size:19px;margin-top:3px}
.reservation-toolbar{display:grid;grid-template-columns:minmax(0,1fr) 220px 110px;gap:10px;align-items:center;margin:0 0 18px;padding:10px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);box-shadow:0 14px 35px rgba(0,0,0,.16)}
.toolbar-search{position:relative;display:flex;align-items:center}.toolbar-icon{position:absolute;left:14px;color:var(--muted);font-size:18px;z-index:2}.toolbar-search input{padding-left:40px!important;padding-right:38px!important}.clear-search{position:absolute;right:9px;width:26px;height:26px;border-radius:8px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.06);color:var(--text);cursor:pointer}.toolbar-filter{display:flex;align-items:center;gap:8px}.toolbar-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);font-weight:900;white-space:nowrap}.toolbar-filter select{flex:1}.toolbar-result{min-height:48px;display:flex;flex-direction:column;justify-content:center;align-items:center;border-radius:13px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07)}.toolbar-result b{font-size:18px;color:var(--text)}.toolbar-result span{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px}
.form-mode-pill{display:inline-block;margin-left:10px;padding:5px 9px;border-radius:999px;background:rgba(var(--primary-rgb),.10);border:1px solid rgba(var(--primary-rgb),.22);color:var(--primary);font-size:10px;vertical-align:middle}.availability-hint{font-size:11px;color:var(--muted);align-self:center;padding-left:2px}
.reservations-form{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:12px!important;padding:18px!important;border-radius:22px!important;background:linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.02))!important;border:1px solid rgba(255,255,255,.08)!important;box-shadow:0 24px 55px rgba(0,0,0,.20),inset 0 1px 0 rgba(255,255,255,.03)!important}
.reservations-form h2{font-size:20px!important;margin-bottom:2px!important}.reservations-form input,.reservations-form select,.reservations-form textarea{min-height:46px}.reservations-form textarea{min-height:92px!important;resize:vertical}
.reservation-detail-panel{margin-top:16px;padding:16px 18px;border-radius:18px;background:linear-gradient(135deg,rgba(var(--primary-rgb),.055),rgba(255,255,255,.025));border:1px solid rgba(var(--primary-rgb),.16);display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) auto;justify-content:space-between;gap:18px;align-items:center}.reservation-detail-panel h3{margin:0 0 4px;font-size:20px}.reservation-detail-panel p{margin:0;color:var(--muted);font-size:12px}.detail-actions{display:flex;gap:8px;flex-wrap:wrap}.detail-meta{display:flex;gap:7px;flex-wrap:wrap}.detail-chip{padding:7px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#dfe5ee;font-size:11px;font-weight:800}
.section-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin:24px 0 10px;padding:0 2px}.section-heading span{font-size:10px;letter-spacing:1.6px;color:var(--muted);font-weight:900}.section-heading h2{margin:3px 0 0;font-size:23px;color:var(--text);letter-spacing:-.4px}.section-heading small{color:var(--muted);font-size:11px}
.reservations-grid{gap:13px!important}.reservation-card{padding:18px!important;border-radius:20px!important}.reservation-card:hover{transform:translateY(-2px);transition:.2s;border-color:rgba(255,255,255,.13)!important}.reservation-card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.guest-identity{display:flex;gap:10px;align-items:center}.guest-avatar{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,rgba(var(--primary-rgb),.22),rgba(var(--warning-rgb),.20));border:1px solid rgba(var(--primary-rgb),.22);color:var(--text);font-weight:900}.guest-identity h3{margin:0;font-size:15px;color:var(--text)}.guest-identity span{display:block;color:var(--muted);font-size:10px;margin-top:2px}.status-wrap{display:flex;flex-direction:column;align-items:flex-end;gap:4px}.status-wrap [style*="text-transform"]{margin-bottom:0!important;padding:6px 10px!important;font-size:9px!important}.view-btn{padding:6px 9px!important;font-size:10px}
.reservation-actions{gap:7px!important}.reservation-actions button{padding:11px!important;border-radius:12px!important;font-size:12px}
.reservation-header-actions button{min-height:40px}
@media(max-width:1100px){.reservation-toolbar{grid-template-columns:minmax(0,1fr) 180px 96px}.reservations-form{grid-template-columns:1fr 1fr!important}.reservation-detail-panel{grid-template-columns:1fr 1fr}.hero-title-row{align-items:flex-start}}
@media(max-width:800px){.stats-grid,.reservations-page .stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.reservation-extra-stats{grid-template-columns:repeat(2,1fr)}.reservation-toolbar{grid-template-columns:1fr}.toolbar-filter{display:grid;grid-template-columns:auto 1fr}.toolbar-result{min-height:42px}.reservation-detail-panel{grid-template-columns:1fr}.hero-title-row{flex-direction:column}.live-badge{align-self:flex-start}}
@media(max-width:560px){.reservations-page{padding:18px 12px 30px!important}.reservations-title{font-size:31px!important}.reservations-form{grid-template-columns:1fr!important;padding:14px!important}.reservation-header-bar{align-items:flex-start!important;flex-direction:column!important}.reservation-header-actions{width:100%}.reservation-header-actions button{flex:1}.reservation-extra-stats{grid-template-columns:1fr 1fr}.section-heading{align-items:flex-start;flex-direction:column}.reservation-card{padding:16px!important}}
`}</style>

      <div className="reservations-page" style={layout}>

      <div className="hero-title-row">
        <div><span className="page-kicker">RESTAURANT PRO · RESERVATION DESK</span><h1 className="reservations-title" style={title}>Reservations</h1><p className="hero-subtitle">Manage tables, guests and live booking availability from one premium workspace.</p></div>
        <div className="live-badge"><i></i> LIVE</div>
      </div>
      <div className="reservation-header-bar">
        <div><span className="reservation-kicker">LIVE RESERVATION DESK</span><strong>{restaurantId ? "Restaurant connected" : "Connecting…"}</strong>{lastUpdated && <small>Updated {formatIndiaTime(lastUpdated)}</small>}</div>
        <div className="reservation-header-actions">
          {editId && <button type="button" onClick={resetForm} className="ghost-btn">Cancel edit</button>}
          <button type="button" onClick={() => void refreshReservations()} disabled={refreshing} className="refresh-btn">{refreshing ? "Refreshing…" : "↻ Refresh"}</button>
        </div>
      </div>
      <div style={statsGrid}>

  <div className="main-stat" style={statCard}>
    <h2
style={{
fontSize:42,
fontWeight:900,
marginBottom:8,
color:"var(--text)"
}}
>
{reservations.length}
</h2>
    <p>Total</p>
  </div>

  <div className="main-stat" style={statCard}>
    <h2>
      {reservations.filter(r=>r.status==="pending").length}
    </h2>
    <p>Pending</p>
  </div>

  <div className="main-stat" style={statCard}>
    <h2>
      {reservations.filter(r=>r.status==="confirmed").length}
    </h2>
    <p>Confirmed</p>
  </div>

  <div className="main-stat" style={statCard}>
    <h2>
      {reservations.filter(r=>r.status==="cancelled").length}
    </h2>
    <p>Cancelled</p>
  </div>

</div>
      <div className="reservation-extra-stats">
        <div className="mini-stat"><span>Today</span><b>{todayReservations.length}</b></div>
        <div className="mini-stat"><span>Upcoming</span><b>{upcomingReservations.length}</b></div>
        <div className="mini-stat"><span>Active</span><b>{activeReservations.length}</b></div>
        <div className="mini-stat"><span>Tables free</span><b>{availableTableCount}</b></div>
      </div>

<div className="reservation-toolbar">
  <div className="toolbar-search">
    <span className="toolbar-icon">⌕</span>
    <input placeholder="Search customer, phone or table" value={search} onChange={e=>setSearch(e.target.value)} style={input}/>
    {search && <button type="button" className="clear-search" onClick={()=>setSearch("")}>×</button>}
  </div>
  <div className="toolbar-filter">
    <span className="toolbar-label">View</span>
    <select value={filter} onChange={e=>setFilter(e.target.value)} style={select}>
      <option value="all" style={optionStyle}>All reservations</option>
      <option value="pending" style={optionStyle}>Pending</option>
      <option value="confirmed" style={optionStyle}>Confirmed</option>
      <option value="cancelled" style={optionStyle}>Cancelled</option>
      <option value="today" style={optionStyle}>Today</option>
      <option value="upcoming" style={optionStyle}>Upcoming</option>
    </select>
  </div>
  <div className="toolbar-result">
    <b>{filteredReservations.length}</b><span>results</span>
  </div>
</div>

      {/* 🔥 FORM */}
      <div className="reservations-form" style={formBox}>

<h2
style={{
gridColumn:"1/-1",
fontSize:28,
fontWeight:800,
marginBottom:5
}}
>
🍽️ {editId ? "Edit Reservation" : "Create Reservation"}
          <span className="form-mode-pill">{editId ? "Editing" : "New booking"}</span>
</h2>

        <input name="name" placeholder="Customer Name" value={form.name} onChange={handleChange} style={input}/>
        <input

type="number"

name="guests"

placeholder="Guests"

value={form.guests}

onChange={handleChange}

style={input}

/>
        <input name="phone" placeholder="Phone" value={form.phone} onChange={handleChange} style={input}/>

        {/* 🔥 FIXED DROPDOWN */}
        <select name="table_id" value={form.table_id} onChange={handleChange} style={select}>
          <option value="" style={optionStyle}>
Select Table
</option>
          {availableTables.map(t => (
            <option
key={t.id}
value={t.id}
style={optionStyle}
>
              Table {t.table_number}
            </option>
          ))}
        </select>
        <div className="availability-hint">{form.date && form.time ? `${availableTableCount} table${availableTableCount === 1 ? "" : "s"} available for this slot` : "Choose date and time to check availability"}</div>

        <input type="date" name="date" min={editId ? undefined : todayISO} value={form.date} onChange={handleChange} style={input}/>
        <input type="time" name="time" value={form.time} onChange={handleChange} style={input}/>
        <select

name="duration"

value={form.duration}

onChange={handleChange}

style={select}

>

<option value={60} style={optionStyle}>
1 Hour
</option>

<option value={90} style={optionStyle}>
1.5 Hours
</option>

<option value={120} style={optionStyle}>
2 Hours
</option>

</select>
<textarea

name="notes"

placeholder="Special Request"

value={form.notes}

onChange={handleChange}

style={{

...input,

width:"100%",

minHeight:80

}}

/>

        <button onClick={saveReservation} style={saveBtn}>
          {editId ? "Update" : "Add"}
        </button>

      </div>

      {selectedReservation && (
        <div className="reservation-detail-panel">
          <div className="detail-main">
            <div className="detail-kicker">SELECTED RESERVATION</div>
            <h3>{selectedReservation.name || "Guest"}</h3>
            <p>#{String(selectedReservation.id).slice(0,8)} · {selectedReservation.date || "-"} at {selectedReservation.time || "-"}</p>
          </div>
          <div className="detail-meta">
            <span className="detail-chip">Table {tables.find(t=>t.id===selectedReservation.table_id)?.table_number || selectedReservation.table_id || "-"}</span>
            <span className="detail-chip">{selectedReservation.guests || 1} guests</span>
            <span className="detail-chip">{selectedReservation.duration || 60} min</span>
          </div>
          <div className="detail-actions">
            <button type="button" onClick={()=>editReservation(selectedReservation)}>Edit</button>
            <button type="button" onClick={()=>setSelectedReservation(null)}>Close</button>
          </div>
        </div>
      )}

      {/* 🔥 CARDS */}
      <div className="section-heading"><div><span>RESERVATION PIPELINE</span><h2>{filteredReservations.length ? "Bookings" : "No reservations found"}</h2></div><small>Real-time restaurant desk</small></div>
      <div className="reservations-grid" style={grid}>
        {reservations

.filter(r=>{
            const q = search.toLowerCase().trim()
            const matchesSearch = !q || [r.name, r.phone, r.table_id].some(v => String(v || "").toLowerCase().includes(q))
            const matchesFilter = filter === "all" || r.status === filter
              || (filter === "today" && r.date === todayISO)
              || (filter === "upcoming" && (r.date > todayISO || (r.date === todayISO && (r.time || "") >= now.toTimeString().slice(0,5))))
            return matchesSearch && matchesFilter

})

.map(r=>(
          <div key={r.id} className={`reservation-card ${selectedReservation?.id === r.id ? "selected" : ""}`} style={card}>

            <div className="reservation-card-top">
              <div className="guest-identity">
                <div className="guest-avatar">{String(r.name || "G").trim().charAt(0).toUpperCase()}</div>
                <div><h3>{r.name || "Guest"}</h3><span>#{String(r.id).slice(0,8)}</span></div>
              </div>
              <div className="status-wrap"><div style={statusChip(r.status)}>{r.status}</div><button type="button" className="view-btn" onClick={() => setSelectedReservation(r)}>View</button></div>
            </div>
            <p style={muted}>📞 {r.phone}</p>
            <p style={muted}>
🍽️ Table : {(tables.find(t=>t.id===r.table_id)?.table_number) || r.table_id || "-"}
</p>

<hr
style={{
border:"none",
borderTop:"1px solid rgba(255,255,255,.08)",
margin:"15px 0"
}}
/>
            <p style={muted}>
              📅 {r.date || "-"} | ⏰ {r.time || "-"}
            </p>
            

<p style={muted}>

👥 Guests : {r.guests ?? "-"}

</p>

<p style={muted}>

⌛ {r.duration ?? "-"}

</p>

<p style={muted}>

📝 {r.notes || "No Notes"}

</p>
<p

style={{

fontWeight:"bold",

marginTop:8,

color:

r.status==="confirmed"

? "var(--success)"

: r.status==="cancelled"

? "var(--danger)"

: "var(--primary)"

}}

>

Status :

{r.status.toUpperCase()}

</p>

            <div className="reservation-actions" style={actions}>
              <button onClick={() => editReservation(r)} style={editBtn}>✎ Edit</button>
              <button onClick={() => deleteReservation(r.id)} style={deleteBtn}>⌫ Delete</button>
            </div>

            <div className="reservation-actions" style={actions}>

{r.status!=="confirmed" && (

<button

onClick={()=>updateStatus(r.id,"confirmed")}

style={confirmBtn}

>

✅ Confirm

</button>

)}

{r.status!=="cancelled" && (

<button

onClick={()=>updateStatus(r.id,"cancelled")}

style={cancelBtn}

>

❌ Cancel

</button>

)}

</div>

          </div>
        ))}
      </div>

    </div>
    </>
  )
}

/* 🎨 PREMIUM UI */

const layout = {
  minHeight: "100vh",
  padding: "32px clamp(14px, 3vw, 40px) 48px",
  background: "radial-gradient(circle at 10% 0%, rgba(var(--primary-rgb),.11), transparent 28%), radial-gradient(circle at 88% 18%, rgba(var(--warning-rgb),.07), transparent 25%), linear-gradient(180deg, var(--background), #07090d)",
  color: "var(--text)"
}

const title = {
  fontSize: "clamp(32px, 4vw, 46px)",
  fontWeight: 900,
  margin: "2px 0 8px",
  letterSpacing: -1.4,
  color: "var(--text)"
}

const formBox = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0,1fr))",
  gap: 14,
  marginBottom: 24,
  padding: 22,
  borderRadius: 24,
  background: "linear-gradient(145deg, rgba(255,255,255,.065), rgba(255,255,255,.025))",
  border: "1px solid rgba(255,255,255,.085)",
  backdropFilter: "blur(26px)",
  WebkitBackdropFilter: "blur(26px)",
  boxShadow: "0 30px 80px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.05)"
}

const input = {
  width: "100%",
  padding: "14px 15px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(255,255,255,.045)",
  color: "var(--text)",
  fontSize: 14,
  outline: "none",
  backdropFilter: "blur(18px)",
  transition: ".2s"
}
const select = {
  ...input,
  background: "rgba(255,255,255,.055)",
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none"
}
const optionStyle = {
  background: "#11151c",
  color: "var(--text)"
}
const saveBtn = {
  padding: "14px 18px",
  borderRadius: 14,
  border: "1px solid rgba(var(--primary-rgb),.38)",
  background: "linear-gradient(135deg, rgba(var(--primary-rgb),.9), rgba(var(--warning-rgb),.85))",
  color: "#0b0d10",
  fontWeight: 900,
  cursor: "pointer",
  transition: ".2s",
  boxShadow: "0 12px 30px rgba(var(--primary-rgb),.18)"
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(285px,1fr))",
  gap: 16
}

const card = {
  position: "relative",
  overflow: "hidden",
  padding: 20,
  borderRadius: 22,
  background: "linear-gradient(145deg, rgba(255,255,255,.06), rgba(255,255,255,.025))",
  border: "1px solid rgba(255,255,255,.085)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  boxShadow: "0 20px 55px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.04)"
}
const muted = {
  fontSize: 12,
  color: "var(--muted)"
}

const statusChip = (s)=>({

display:"inline-block",

padding:"8px 16px",

borderRadius:999,

fontWeight:700,

fontSize:12,

textTransform:"uppercase",

marginBottom:18,

background:

s==="confirmed"

? "linear-gradient(135deg,var(--success),var(--success))"

: s==="cancelled"

? "linear-gradient(135deg,var(--danger),var(--danger))"

: "linear-gradient(135deg,#92400e,var(--warning))",

boxShadow:"0 10px 25px rgba(0,0,0,.35)"

})

const actions = {
  display: "flex",
  gap: 10,
  marginTop: 10
}

const editBtn = {
  flex:1,
  padding:"14px",
  borderRadius:18,
  border:"1px solid rgba(96,165,250,.30)",
  background:"rgba(var(--info-rgb),.10)",
  backdropFilter:"blur(20px)",
  color:"var(--text)",
  fontWeight:700,
  cursor:"pointer"
}
const deleteBtn = {
  flex:1,
  padding:"14px",
  borderRadius:18,
  border:"1px solid rgba(248,113,113,.30)",
  background:"rgba(var(--danger-rgb),.08)",
  backdropFilter:"blur(20px)",
  color:"var(--text)",
  fontWeight:700,
  cursor:"pointer"
}
const confirmBtn = {
  flex:1,
  padding:"14px",
  borderRadius:18,
  border:"1px solid rgba(var(--success-rgb),.30)",
  background:"rgba(var(--success-rgb),.08)",
  backdropFilter:"blur(20px)",
  color:"var(--text)",
  fontWeight:700,
  cursor:"pointer"
}
const cancelBtn = {
  flex:1,
  padding:"14px",
  borderRadius:18,
  border:"1px solid rgba(var(--danger-rgb),.30)",
  background:"rgba(var(--danger-rgb),.08)",
  backdropFilter:"blur(20px)",
  color:"var(--text)",
  fontWeight:700,
  cursor:"pointer"
}
const statsGrid={

display:"grid",

gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",

gap:20,

marginBottom:30

}

const statCard = {
  padding: 28,
  borderRadius: 24,
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.08)",
  backdropFilter: "blur(24px)",
  textAlign: "center",
  boxShadow: "0 18px 45px rgba(0,0,0,.35)"
}

const secondaryBtn = { padding:"16px", borderRadius:18, border:"1px solid rgba(255,255,255,.14)", background:"rgba(255,255,255,.04)", color:"var(--text)", fontWeight:800, cursor:"pointer" }