"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

const money = n => `₹${Number(n || 0).toLocaleString("en-IN")}`
const featureLabels = [
  ["qr_ordering", "QR Ordering"],
  ["loyalty", "Loyalty"],
  ["offers", "Offers"],
  ["analytics", "Analytics"],
  ["reservations", "Reservations"],
  ["whatsapp", "WhatsApp"],
]

export default function Subscriptions() {
  const [plans, setPlans] = useState([])
  const [rows, setRows] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [selectedPlan, setSelectedPlan] = useState({})
  const [billingCycle, setBillingCycle] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => { load() }, [])

  async function authHeaders() {
    const { data } = await supabase.auth.getSession()
    if (!data?.session?.access_token) throw new Error("Login session expired")
    return { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" }
  }

  async function load() {
    setLoading(true)
    try {
      const headers = await authHeaders()
      const response = await fetch("/api/super-admin/subscriptions", { headers, cache: "no-store" })
      const payload = await response.json()
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load subscriptions")
      setPlans(payload.plans || [])
      setRows(payload.subscriptions || [])
      setRestaurants(payload.restaurants || [])
      const map = {}
      const cycles = {}
      ;(payload.subscriptions || []).forEach(row => {
        if (!map[row.restaurant_id]) map[row.restaurant_id] = row.saas_plan_id || ""
        if (!cycles[row.restaurant_id]) cycles[row.restaurant_id] = row.billing_cycle || "monthly"
      })
      setSelectedPlan(map)
      setBillingCycle(cycles)
    } catch (error) {
      setMessage(error.message || "Unable to load subscriptions")
    } finally { setLoading(false) }
  }

  const latestByRestaurant = useMemo(() => {
    const map = new Map()
    for (const row of rows) if (!map.has(row.restaurant_id)) map.set(row.restaurant_id, row)
    return map
  }, [rows])

  async function updateSubscription(restaurantId, action) {
    const planId = selectedPlan[restaurantId] || ""
    if (action === "approve" && !planId) {
      setMessage("Select a plan before activating the restaurant.")
      return
    }
    setBusy(`${restaurantId}:${action}`)
    setMessage("")
    try {
      const headers = await authHeaders()
      const response = await fetch("/api/super-admin/subscriptions", {
        method: "POST",
        headers,
        body: JSON.stringify({ restaurant_id: restaurantId, saas_plan_id: planId || null, billing_cycle: billingCycle[restaurantId] || "monthly", action })
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) throw new Error(payload.error || "Subscription update failed")
      setMessage(action === "approve" ? "Restaurant activated with the selected plan." : action === "pending" ? "Restaurant moved back to pending." : "Restaurant deactivated.")
      await load()
    } catch (error) {
      setMessage(error.message || "Subscription update failed")
    } finally { setBusy("") }
  }

  return (
    <main className="subscription-page">
      <section className="hero">
        <div>
          <div className="eyebrow">ANAIRA POS • SAAS CONTROL</div>
          <h1>Subscriptions</h1>
          <p>Plans, approvals, lifecycle control and plan-based access for every restaurant.</p>
          <div className="hero-note">A newly created restaurant stays inactive until a plan is selected and approved.</div>
        </div>
        <div className="hero-stat"><span>Restaurants</span><strong>{restaurants.length}</strong><small>{restaurants.filter(r => r.status === "active").length} active</small></div>
      </section>

      {message && <div className="message">{message}</div>}

      <section className="plans-grid">
        {plans.map(plan => (
          <article className="plan-card" key={plan.id}>
            <div className="plan-top"><span>PLAN</span><b>{plan.active ? "ACTIVE" : "PAUSED"}</b></div>
            <h2>{plan.name}</h2>
            <div className="price">{money(plan.monthly_price)}<small>/month</small></div>
            <div className="price-year">{money(plan.yearly_price)} / year</div>
            <div className="limits">
              <span>👥 {plan.max_users == null ? "Unlimited users" : `${plan.max_users} users`}</span>
              <span>🪑 {plan.max_tables == null ? "Unlimited tables" : `${plan.max_tables} tables`}</span>
            </div>
            <div className="feature-list">
              {featureLabels.map(([key, label]) => <span className={plan[key] ? "enabled" : "disabled"} key={key}>{plan[key] ? "✓" : "—"} {label}</span>)}
            </div>
          </article>
        ))}
      </section>

      <section className="restaurant-section">
        <div className="section-head"><div><div className="eyebrow">RESTAURANT LIFECYCLE</div><h2>Activation & plan control</h2></div><span className="hint">Manual deactivate is always available to Super Admin.</span></div>
        {loading ? <div className="empty">Loading subscriptions…</div> : restaurants.length === 0 ? <div className="empty">No restaurants found.</div> : (
          <div className="restaurant-list">
            {restaurants.map(restaurant => {
              const row = latestByRestaurant.get(restaurant.id)
              const plan = row?.plan
              const status = row?.status || "pending"
              const isActive = restaurant.status === "active" && status === "active"
              return (
                <article className="restaurant-row" key={restaurant.id}>
                  <div className="restaurant-info">
                    <div className="restaurant-icon">🏢</div>
                    <div><h3>{restaurant.name}</h3><p>{restaurant.owner_name || "Owner not set"} · {restaurant.phone || "No phone"}</p></div>
                  </div>
                  <div className="plan-select-wrap">
                    <label>Plan</label>
                    <select value={selectedPlan[restaurant.id] || ""} onChange={e => setSelectedPlan(prev => ({ ...prev, [restaurant.id]: e.target.value }))}>
                      <option value="">No plan selected</option>
                      {plans.map(p => <option value={p.id} key={p.id}>{p.name} · {money(p.monthly_price)}/mo</option>)}
                    </select>
                    <select className="cycle-select" value={billingCycle[restaurant.id] || "monthly"} onChange={e => setBillingCycle(prev => ({ ...prev, [restaurant.id]: e.target.value }))}>
                      <option value="monthly">Monthly billing</option>
                      <option value="yearly">Yearly billing</option>
                    </select>
                  </div>
                  <div className="plan-summary">
                    <span className={`status ${isActive ? "active" : status === "pending" ? "pending" : "inactive"}`}>{isActive ? "ACTIVE" : status.toUpperCase()}</span>
                    <strong>{plan?.name || "No plan"}</strong>
                    <small>{plan ? `${money(plan.monthly_price)}/month · ${plan.max_users == null ? "Unlimited users" : `${plan.max_users} users`} · ${plan.max_tables == null ? "Unlimited tables" : `${plan.max_tables} tables`}` : "Subscription approval required"}</small>
                  </div>
                  <div className="actions">
                    <button className="approve" disabled={busy || !selectedPlan[restaurant.id]} onClick={() => updateSubscription(restaurant.id, "approve")}>{busy === `${restaurant.id}:approve` ? "Activating…" : "✓ Activate / Approve"}</button>
                    <button className="pending" disabled={!!busy} onClick={() => updateSubscription(restaurant.id, "pending")}>Pending</button>
                    <button className="deactivate" disabled={!!busy} onClick={() => updateSubscription(restaurant.id, "deactivate")}>{busy === `${restaurant.id}:deactivate` ? "…" : "Deactivate"}</button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="rule-card"><strong>How activation works</strong><span>Super Admin creates restaurant → restaurant starts <b>inactive</b> → choose plan → approve subscription → restaurant becomes <b>active</b> → users receive only the features included in that plan.</span></section>

      <style jsx>{css}</style>
    </main>
  )
}

const css = `
.subscription-page{min-height:100vh;padding:clamp(18px,3vw,36px);background:radial-gradient(circle at 85% 0%,rgba(var(--primary-rgb),.14),transparent 32%),var(--background);color:var(--text)}
.hero{display:flex;justify-content:space-between;gap:24px;align-items:center;flex-wrap:wrap;padding:clamp(24px,4vw,42px);border:1px solid rgba(var(--primary-rgb),.2);border-radius:30px;background:linear-gradient(135deg,rgba(var(--primary-rgb),.12),rgba(255,255,255,.025));box-shadow:0 30px 80px rgba(0,0,0,.22)}
.eyebrow{font-size:11px;letter-spacing:2px;color:var(--primary);font-weight:900}.hero h1{margin:8px 0;font-size:clamp(32px,5vw,52px);letter-spacing:-.04em}.hero p{margin:0;color:var(--muted);line-height:1.7}.hero-note{display:inline-flex;margin-top:15px;padding:8px 12px;border-radius:999px;background:rgba(var(--warning-rgb,245,158,11),.08);border:1px solid rgba(245,158,11,.2);color:var(--warning);font-size:12px;font-weight:800}.hero-stat{min-width:170px;padding:22px;border-radius:22px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);display:grid;gap:4px}.hero-stat span,.hero-stat small{color:var(--muted)}.hero-stat strong{font-size:38px;color:var(--primary)}
.message{margin-top:16px;padding:13px 15px;border-radius:15px;background:rgba(var(--primary-rgb),.08);border:1px solid rgba(var(--primary-rgb),.2);color:var(--text)}
.plans-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;margin-top:18px}.plan-card{padding:22px;border-radius:24px;background:var(--surface);border:1px solid rgba(var(--primary-rgb),.12);box-shadow:0 18px 45px rgba(0,0,0,.18)}.plan-top{display:flex;justify-content:space-between;color:var(--muted);font-size:10px;letter-spacing:1.5px}.plan-top b{color:var(--success)}.plan-card h2{margin:10px 0 5px;font-size:24px}.price{font-size:32px;font-weight:900;color:var(--primary)}.price small{font-size:12px;color:var(--muted)}.price-year{color:var(--muted);font-size:12px}.limits{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.limits span{padding:7px 9px;border-radius:999px;background:rgba(255,255,255,.04);color:var(--muted);font-size:11px}.feature-list{display:grid;grid-template-columns:1fr 1fr;gap:8px}.feature-list span{font-size:12px}.feature-list .enabled{color:var(--success)}.feature-list .disabled{color:var(--muted)}
.restaurant-section{margin-top:18px;padding:clamp(18px,3vw,28px);border-radius:26px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07)}.section-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:18px}.section-head h2{margin:5px 0 0}.hint{color:var(--muted);font-size:12px}.restaurant-list{display:grid;gap:12px}.restaurant-row{display:grid;grid-template-columns:minmax(220px,1.3fr) minmax(190px,.8fr) minmax(150px,.7fr) auto;gap:14px;align-items:center;padding:16px;border-radius:20px;background:var(--surface);border:1px solid rgba(255,255,255,.06)}.restaurant-info{display:flex;align-items:center;gap:12px}.restaurant-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:13px;background:rgba(var(--primary-rgb),.08)}.restaurant-info h3{margin:0 0 4px}.restaurant-info p,.plan-summary small{margin:0;color:var(--muted);font-size:12px}.plan-select-wrap{display:grid;gap:6px}.plan-select-wrap label{font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:1px}.plan-select-wrap select{width:100%;padding:11px 12px;border-radius:12px;border:1px solid rgba(var(--primary-rgb),.16);background:var(--surface-2);color:var(--text);outline:none}.cycle-select{margin-top:4px}.plan-summary{display:grid;gap:5px}.status{justify-self:start;padding:5px 8px;border-radius:999px;font-size:9px;font-weight:900;letter-spacing:1px}.status.active{background:rgba(34,197,94,.1);color:var(--success)}.status.pending{background:rgba(245,158,11,.1);color:var(--warning)}.status.inactive{background:rgba(239,68,68,.1);color:var(--danger)}.actions{display:flex;gap:7px;flex-wrap:wrap}.actions button{border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:9px 11px;background:rgba(255,255,255,.04);color:var(--text);cursor:pointer;font-weight:800}.actions button:disabled{opacity:.45;cursor:not-allowed}.actions .approve{border-color:rgba(34,197,94,.25);color:var(--success)}.actions .pending{color:var(--warning)}.actions .deactivate{color:var(--danger)}.empty{padding:30px;text-align:center;color:var(--muted)}.rule-card{display:grid;gap:6px;margin-top:18px;padding:16px;border-radius:18px;background:rgba(var(--primary-rgb),.06);border:1px solid rgba(var(--primary-rgb),.14);color:var(--muted);line-height:1.6}.rule-card strong{color:var(--text)}
@media(max-width:1050px){.restaurant-row{grid-template-columns:1fr 1fr}.actions{grid-column:1/-1}}@media(max-width:650px){.subscription-page{padding:14px}.restaurant-row{grid-template-columns:1fr}.actions{grid-column:auto}.actions button{flex:1}.feature-list{grid-template-columns:1fr}.hero-stat{width:100%}}
`
