"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"

const TABS = [
  { id: "service", label: "Service Calls", icon: "🔔" },
  { id: "delivery", label: "Delivery", icon: "🛵" },
  { id: "shifts", label: "Staff Shifts", icon: "👥" },
  { id: "reservations", label: "Reservations", icon: "📅" },
]

const EMPTY_DATA = { service: [], delivery: [], shifts: [], reservations: [] }
const EMPTY_ERRORS = { service: "", delivery: "", shifts: "", reservations: "" }

const SERVICE_ACTIONS = [
  { status: "acknowledged", label: "Acknowledge" },
  { status: "in_progress", label: "Start" },
  { status: "completed", label: "Complete" },
]

function safeTime(value) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
}

function safeDate(value) {
  if (!value) return "—"
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

function shortId(value) {
  return value ? String(value).slice(0, 8).toUpperCase() : "—"
}

function humanStatus(value) {
  return String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase())
}

function isServiceActionAllowed(current, target) {
  if (current === "cancelled" || current === "completed") return false
  if (target === "acknowledged") return current === "open"
  if (target === "in_progress") return current === "open" || current === "acknowledged"
  if (target === "completed") return current === "acknowledged" || current === "in_progress"
  return false
}

export default function OperationsControl() {
  const [restaurantId, setRestaurantId] = useState("")
  const [tab, setTab] = useState("service")
  const [data, setData] = useState(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [tabErrors, setTabErrors] = useState(EMPTY_ERRORS)
  const [notice, setNotice] = useState("")
  const [actionId, setActionId] = useState("")
  const requestRef = useRef(0)

  const loadData = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++requestRef.current
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError("")
    setNotice("")
    setTabErrors(EMPTY_ERRORS)

    try {
      const { data: sessionResult, error: sessionError } = await supabaseCloud.auth.getSession()
      const user = sessionResult?.session?.user

      if (sessionError) throw new Error(sessionError.message || "Unable to read login session.")
      if (!user) throw new Error("Please login again.")

      const { data: profile, error: profileError } = await supabaseCloud
        .from("profiles")
        .select("restaurant_id,role")
        .eq("id", user.id)
        .maybeSingle()

      if (profileError) throw new Error(profileError.message || "Unable to load your profile.")
      if (!profile?.restaurant_id) throw new Error("Restaurant mapping not found for this account.")

      const rid = profile.restaurant_id
      setRestaurantId(rid)

      const results = await Promise.all([
        supabaseCloud
          .from("service_requests")
          .select("id,request_type,message,status,priority,assigned_to,created_at,acknowledged_at,completed_at,updated_at")
          .eq("restaurant_id", rid)
          .order("created_at", { ascending: false })
          .limit(100),
        supabaseCloud
          .from("delivery_assignments")
          .select("id,order_id,rider_id,status,address,assigned_at,out_at,delivered_at,failed_at,failure_reason,delivery_charge,notes,picked_up_at")
          .eq("restaurant_id", rid)
          .order("assigned_at", { ascending: false })
          .limit(100),
        supabaseCloud
          .from("staff_shifts")
          .select("id,staff_id,shift_date,start_at,end_at,status,notes,created_at")
          .eq("restaurant_id", rid)
          .order("shift_date", { ascending: false })
          .limit(100),
        supabaseCloud
          .from("reservations")
          .select("id,name,phone,date,time,guests,status,table_id,waitlist,vip,no_show,reservation_start_at,reservation_end_at,occasion,deposit_amount,notes,created_at")
          .eq("restaurant_id", rid)
          .order("date", { ascending: false })
          .limit(100),
      ])

      if (requestId !== requestRef.current) return

      const keys = ["service", "delivery", "shifts", "reservations"]
      const nextData = { ...EMPTY_DATA }
      const nextErrors = { ...EMPTY_ERRORS }
      results.forEach((result, index) => {
        const key = keys[index]
        nextData[key] = result.data || []
        if (result.error) nextErrors[key] = result.error.message || `Unable to load ${key}.`
      })

      setData(nextData)
      setTabErrors(nextErrors)

      const failed = keys.filter(key => nextErrors[key])
      if (failed.length === keys.length) {
        setError("Operations data could not be loaded. Please refresh and try again.")
      } else if (failed.length) {
        setError(`${failed.length} section${failed.length > 1 ? "s" : ""} could not be loaded. You can still use the available sections.`)
      }
    } catch (err) {
      if (requestId === requestRef.current) setError(err?.message || "Unable to load Operations Control.")
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadData()
    return () => { requestRef.current += 1 }
  }, [loadData])

  const updateService = useCallback(async (request, status) => {
    if (!request?.id || !isServiceActionAllowed(request.status, status)) return

    setActionId(`${request.id}:${status}`)
    setError("")
    setNotice("")

    try {
      const { error: rpcError } = await supabaseCloud.rpc("phase5_update_service_request", {
        p_request_id: request.id,
        p_status: status,
        p_assigned_to: request.assigned_to || null,
      })

      if (rpcError) throw new Error(rpcError.message || "Unable to update service request.")

      setData(current => ({
        ...current,
        service: current.service.map(item =>
          item.id === request.id
            ? {
                ...item,
                status,
                acknowledged_at: status === "acknowledged" ? new Date().toISOString() : item.acknowledged_at,
                completed_at: status === "completed" ? new Date().toISOString() : item.completed_at,
                updated_at: new Date().toISOString(),
              }
            : item
        ),
      }))
      setNotice(`Service request marked ${humanStatus(status)}.`)
    } catch (err) {
      setError(err?.message || "Unable to update service request.")
    } finally {
      setActionId("")
    }
  }, [])

  const stats = useMemo(() => ({
    openService: data.service.filter(item => !["completed", "cancelled"].includes(item.status)).length,
    activeDelivery: data.delivery.filter(item => !["delivered", "cancelled", "failed"].includes(item.status)).length,
    openShifts: data.shifts.filter(item => item.status === "open").length,
    reservations: data.reservations.length,
  }), [data])

  const activeTab = TABS.find(item => item.id === tab) || TABS[0]

  if (loading) {
    return (
      <main className="oc">
        <div className="loadingShell">
          <div className="spinner" />
          <strong>Loading Operations Control…</strong>
          <span>Fetching restaurant-scoped operations data.</span>
        </div>
        <style jsx>{styles}</style>
      </main>
    )
  }

  return (
    <main className="oc">
      <header className="hero">
        <div className="heroCopy">
          <div className="eyebrow">ANAIRA OPERATIONS</div>
          <h1>Operations Control</h1>
          <p>Manage service calls, delivery assignments, staff shifts and reservations from one restaurant-scoped workspace.</p>
          {restaurantId && <div className="scope">Restaurant: <strong>{shortId(restaurantId)}</strong></div>}
        </div>
        <div className="heroActions">
          <button className="secondaryButton" onClick={() => loadData({ silent: true })} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
          <button className="primaryButton" onClick={() => { window.location.href = "/dashboard" }}>← Dashboard</button>
        </div>
      </header>

      {error && <div className="alert error"><strong>Operations warning</strong><span>{error}</span></div>}
      {notice && <div className="alert notice"><strong>Updated</strong><span>{notice}</span></div>}

      <nav className="tabs" aria-label="Operations sections">
        {TABS.map(item => (
          <button key={item.id} className={tab === item.id ? "tab active" : "tab"} onClick={() => { setTab(item.id); setNotice("") }}>
            <span>{item.icon}</span>{item.label}
            {tabErrors[item.id] && <i title="This section has an error">!</i>}
          </button>
        ))}
      </nav>

      <section className="stats">
        <Stat label="Open service" value={stats.openService} tone="gold" />
        <Stat label="Active delivery" value={stats.activeDelivery} />
        <Stat label="Open shifts" value={stats.openShifts} />
        <Stat label="Reservations loaded" value={stats.reservations} />
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelEyebrow">LIVE WORKSPACE</div>
            <h2>{activeTab.icon} {activeTab.label}</h2>
          </div>
          <span className="countBadge">{data[activeTab.id].length} records</span>
        </div>

        {tabErrors[tab] && <div className="sectionError">{tabErrors[tab]}</div>}

        {tab === "service" && (
          <Rows data={data.service} empty="No service calls found." render={item => (
            <>
              <div className="rowMain">
                <b>{humanStatus(item.request_type)}</b>
                <span>{item.message || "No message provided"}</span>
              </div>
              <div className="rowMeta">
                <StatusBadge value={item.status} />
                <span className="priority">{humanStatus(item.priority || "normal")}</span>
                <span>{safeTime(item.created_at)}</span>
              </div>
              <div className="actions">
                {SERVICE_ACTIONS.map(action => {
                  const disabled = actionId !== "" || !isServiceActionAllowed(item.status, action.status)
                  const busy = actionId === `${item.id}:${action.status}`
                  return (
                    <button key={action.status} className={action.status === "completed" ? "action success" : "action"} disabled={disabled} onClick={() => updateService(item, action.status)}>
                      {busy ? "Updating…" : action.label}
                    </button>
                  )
                })}
              </div>
            </>
          )} />
        )}

        {tab === "delivery" && (
          <Rows data={data.delivery} empty="No delivery assignments found." render={item => (
            <>
              <div className="rowMain">
                <b>Order #{shortId(item.order_id)}</b>
                <span>{item.address || "Address on order"}</span>
              </div>
              <div className="rowMeta">
                <StatusBadge value={item.status} />
                <span>Rider: {shortId(item.rider_id)}</span>
                <span>Assigned: {safeTime(item.assigned_at)}</span>
              </div>
              <div className="timeline">
                <span>Pickup: {safeTime(item.picked_up_at || item.out_at)}</span>
                <span>Delivered: {safeTime(item.delivered_at)}</span>
                {item.failed_at && <span className="dangerText">Failed: {safeTime(item.failed_at)}</span>}
              </div>
              {item.failure_reason && <div className="note dangerText">{item.failure_reason}</div>}
            </>
          )} />
        )}

        {tab === "shifts" && (
          <Rows data={data.shifts} empty="No staff shifts found." render={item => (
            <>
              <div className="rowMain">
                <b>{safeDate(item.shift_date)}</b>
                <span>{safeTime(item.start_at)} {item.end_at ? `– ${safeTime(item.end_at)}` : "– open"}</span>
              </div>
              <div className="rowMeta">
                <StatusBadge value={item.status} />
                <span>Staff: {shortId(item.staff_id)}</span>
              </div>
              {item.notes && <div className="note">{item.notes}</div>}
            </>
          )} />
        )}

        {tab === "reservations" && (
          <Rows data={data.reservations} empty="No reservations found." render={item => (
            <>
              <div className="rowMain">
                <b>{item.name || "Guest"}</b>
                <span>{item.phone || "No phone"} · {item.guests || 1} guest{Number(item.guests || 1) === 1 ? "" : "s"}</span>
              </div>
              <div className="rowMeta">
                <StatusBadge value={item.status} />
                {item.vip && <span className="vip">VIP</span>}
                {item.waitlist && <span className="priority">Waitlist</span>}
                {item.no_show && <span className="dangerText">No-show</span>}
              </div>
              <div className="timeline">
                <span>{safeDate(item.date)}</span>
                <span>{item.time || safeTime(item.reservation_start_at)}</span>
                {item.occasion && <span>{item.occasion}</span>}
                {item.deposit_amount != null && <span>Deposit: ₹{Number(item.deposit_amount || 0).toLocaleString("en-IN")}</span>}
              </div>
              {item.notes && <div className="note">{item.notes}</div>}
            </>
          )} />
        )}
      </section>

      <style jsx>{styles}</style>
    </main>
  )
}

function Stat({ label, value, tone }) {
  return <div className={`stat ${tone === "gold" ? "gold" : ""}`}><small>{label}</small><strong>{value}</strong></div>
}

function StatusBadge({ value }) {
  return <span className={`status status-${String(value || "unknown").replace(/[^a-z0-9_-]/gi, "-")}`}>{humanStatus(value)}</span>
}

function Rows({ data, render, empty }) {
  if (!data.length) return <div className="empty"><div className="emptyIcon">✓</div><strong>{empty}</strong><span>New records will appear here when available.</span></div>
  return <div className="rows">{data.map(item => <article className="row" key={item.id}>{render(item)}</article>)}</div>
}

const styles = `
.oc{min-height:100dvh;box-sizing:border-box;padding:24px;max-width:1500px;margin:0 auto;background:var(--background,#09101b);color:var(--foreground,#f4efe5)}
.hero{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding:26px;border:1px solid rgba(231,174,57,.22);border-radius:24px;background:linear-gradient(145deg,rgba(20,30,46,.98),rgba(12,19,31,.98));box-shadow:0 16px 50px rgba(0,0,0,.18)}
.heroCopy{min-width:0}.eyebrow,.panelEyebrow{font-size:11px;color:#e7ae39;font-weight:900;letter-spacing:.16em}.hero h1{font-size:clamp(30px,4vw,48px);line-height:1.05;margin:8px 0 10px}.hero p{color:#aab4c7;max-width:850px;line-height:1.6;margin:0}.scope{margin-top:14px;color:#8f9caf;font-size:12px}.scope strong{color:#dfe5ef}.heroActions{display:flex;gap:9px;flex-wrap:wrap;justify-content:flex-end}.oc button{border:1px solid rgba(231,174,57,.28);background:#121b2b;color:#f4efe5;border-radius:11px;padding:10px 14px;font-weight:800;cursor:pointer;transition:.18s ease}.oc button:hover:not(:disabled){transform:translateY(-1px);border-color:rgba(231,174,57,.7)}.oc button:disabled{opacity:.5;cursor:not-allowed}.primaryButton{background:#e7ae39!important;color:#111!important;border-color:#e7ae39!important}.secondaryButton{background:#121b2b!important}
.alert{display:flex;gap:10px;align-items:flex-start;margin:14px 0;padding:13px 15px;border-radius:13px;background:#151e2d;border:1px solid rgba(231,174,57,.3)}.alert strong{white-space:nowrap}.alert span{color:#c5cfdd}.alert.notice{border-color:rgba(77,190,112,.35)}.alert.notice strong{color:#7ee49b}.alert.error strong{color:#e7ae39}
.tabs{display:flex;gap:8px;overflow-x:auto;padding:16px 0 12px;scrollbar-width:thin}.tab{white-space:nowrap;display:inline-flex;align-items:center;gap:7px}.tab.active{background:#e7ae39!important;color:#111!important;border-color:#e7ae39!important}.tab i{display:inline-grid;place-items:center;width:17px;height:17px;border-radius:50%;font-size:10px;font-style:normal;background:#b33b3b;color:white}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.stat{border:1px solid rgba(255,255,255,.08);background:#101827;border-radius:18px;padding:17px}.stat small{display:block;color:#9ca8bb;font-weight:700}.stat strong{display:block;font-size:30px;margin-top:5px}.stat.gold strong{color:#e7ae39}
.panel{border:1px solid rgba(255,255,255,.08);background:#101827;border-radius:20px;padding:18px;overflow:hidden}.panelHeader{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:14px}.panelHeader h2{margin:4px 0 0;font-size:22px}.countBadge{padding:7px 10px;border-radius:999px;background:#172235;color:#9eabbd;font-size:12px;font-weight:800}.sectionError{padding:11px 13px;border-radius:11px;background:#241b1d;color:#f0b5b5;border:1px solid rgba(220,80,80,.25);margin-bottom:10px}.rows{width:100%}.row{display:grid;grid-template-columns:minmax(180px,1fr) minmax(180px,1.3fr) auto;gap:14px;align-items:center;border-top:1px solid rgba(255,255,255,.07);padding:17px 4px}.rowMain{display:flex;flex-direction:column;gap:5px;min-width:0}.rowMain b{font-size:15px}.rowMain span{color:#aab4c7;line-height:1.45;overflow-wrap:anywhere}.rowMeta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#8995a9;font-size:12px}.status{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;background:#182235;color:#d9e0ea;font-weight:800}.status-open,.status-acknowledged,.status-in_progress,.status-requested{color:#e7ae39}.status-completed,.status-delivered,.status-received{color:#7ee49b}.status-failed,.status-cancelled,.status-no_show{color:#f29b9b}.priority{color:#e7ae39;font-weight:800}.vip{color:#d9b6ff;font-weight:800}.actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.action{padding:8px 10px!important;font-size:12px}.action.success{border-color:rgba(126,228,155,.3)!important}.timeline{grid-column:1/-1;display:flex;gap:16px;flex-wrap:wrap;color:#8e9aae;font-size:12px}.note{grid-column:1/-1;color:#aab4c7;font-size:12px;background:#0d1522;border-radius:9px;padding:9px 11px;overflow-wrap:anywhere}.dangerText{color:#ef9a9a!important}.empty{padding:54px 20px;text-align:center;color:#9ca8bb;display:flex;flex-direction:column;gap:7px}.emptyIcon{margin:0 auto 3px;width:38px;height:38px;display:grid;place-items:center;border-radius:50%;background:#172235;color:#e7ae39;font-weight:900}.loadingShell{min-height:70vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;color:#9ca8bb}.loadingShell strong{color:#f4efe5}.spinner{width:28px;height:28px;border-radius:50%;border:3px solid #263247;border-top-color:#e7ae39;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:1000px){.hero{flex-direction:column}.heroActions{justify-content:flex-start}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.row{grid-template-columns:1fr 1fr}.actions{grid-column:1/-1;justify-content:flex-start}}
@media(max-width:650px){.oc{padding:12px}.hero{padding:18px;border-radius:18px}.hero h1{font-size:31px}.heroActions{width:100%}.heroActions button{flex:1}.tabs{padding-top:12px}.stats{grid-template-columns:1fr 1fr;gap:8px}.stat{padding:13px}.stat strong{font-size:24px}.panel{padding:13px;border-radius:16px}.panelHeader{align-items:flex-start}.row{grid-template-columns:1fr;gap:9px;padding:15px 2px}.rowMeta{order:2}.timeline{order:3}.actions{order:4}.actions button{flex:1;min-width:100px}.note{order:5}.countBadge{font-size:10px}.alert{flex-direction:column;gap:3px}}
@media(max-width:400px){.stats{grid-template-columns:1fr}.heroActions{flex-direction:column}.heroActions button{width:100%}}
`
