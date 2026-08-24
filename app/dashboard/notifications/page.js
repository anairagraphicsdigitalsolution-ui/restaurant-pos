"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function Notifications() {
  const [notifications, setNotifications] = useState([])
  const [restaurantId, setRestaurantId] = useState(null)
  const [orderTotals, setOrderTotals] = useState({})
  const [permission, setPermission] = useState(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  )
  const [settings,setSettings]=useState({in_app:true,sound:true,browser:false,email:false})

  async function load() {
    const { data: u } = await supabase.auth.getUser()
    if (!u?.user) return
    const { data: p } = await supabase
      .from("profiles")
      .select("restaurant_id")
      .eq("id", u.user.id)
      .single()
    if (!p?.restaurant_id) return
    setRestaurantId(p.restaurant_id)
    const {data:pluginSettings}=await supabase.from("plugin_settings").select("config")
      .eq("restaurant_id",p.restaurant_id).eq("plugin_code","smart-notifications").maybeSingle()
    setSettings({...settings,...(pluginSettings?.config||{})})
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("restaurant_id", p.restaurant_id)
      .order("created_at", { ascending: false })
      .limit(100)

    const rows = data || []
    setNotifications(rows)

    const orderIds = rows
      .filter(n => n.type === "order")
      .map(n => {
        const match = String(n.message || "").match(/Order #([a-f0-9]{8})/i)
        return match?.[1]?.toLowerCase() || null
      })
      .filter(Boolean)

    if (orderIds.length) {
      const { data: orders } = await supabase
        .from("orders")
        .select("id,total_amount,subtotal,tax_amount,discount_amount")
        .eq("restaurant_id", p.restaurant_id)

      const ids = (orders || []).map(o => o.id)
      const { data: orderItems } = ids.length
        ? await supabase
            .from("order_items")
            .select("id,order_id,quantity,unit_price,line_total")
            .in("order_id", ids)
        : { data: [] }

      const calculated = {}
      ;(orderItems || []).forEach(item => {
        const line =
          Number(item.line_total || 0) ||
          Number(item.unit_price || 0) * Number(item.quantity || 0)
        calculated[item.order_id] = (calculated[item.order_id] || 0) + line
      })

      const map = {}
      ;(orders || []).forEach(o => {
        const fallback = Number(calculated[o.id] || 0)
        map[String(o.id).slice(0, 8).toLowerCase()] = {
          ...o,
          total_amount: Number(o.total_amount || 0) || fallback
        }
      })
      setOrderTotals(map)
    } else {
      setOrderTotals({})
    }
  }

  async function enableAlerts() {
    try {
      const value = await Notification.requestPermission()
      setPermission(value)
    } catch {}
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!restaurantId) return
    const channel = supabase
      .channel(`notification-center-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        payload => {
          if(settings.in_app!==false) setNotifications(prev => [payload.new, ...prev].slice(0, 100))
          if(settings.browser===true && typeof Notification!=="undefined" && Notification.permission==="granted"){
            try{new Notification(payload.new?.title||"Restaurant notification",{body:payload.new?.message||""})}catch{}
          }

          if (payload.new?.type === "order") {
            // The notification trigger fires immediately after the order INSERT,
            // while totals may be finalized a moment later. Re-read the order.
            setTimeout(async () => {
              const match = String(payload.new.message || "").match(/Order #([a-f0-9]{8})/i)
              const shortId = match?.[1]?.toLowerCase()
              if (!shortId) return

              const { data: orders } = await supabase
                .from("orders")
                .select("id,total_amount,subtotal,tax_amount,discount_amount")
                .eq("restaurant_id", restaurantId)

              const found = (orders || []).find(o => String(o.id).slice(0, 8).toLowerCase() === shortId)
              if (!found) return

              let total = Number(found.total_amount || 0)
              if (!total) {
                const { data: items } = await supabase
                  .from("order_items")
                  .select("quantity,unit_price,line_total")
                  .eq("order_id", found.id)

                total = (items || []).reduce(
                  (sum, item) =>
                    sum +
                    (Number(item.line_total || 0) ||
                      Number(item.unit_price || 0) * Number(item.quantity || 0)),
                  0
                )
              }

              setOrderTotals(prev => ({
                ...prev,
                [shortId]: { ...found, total_amount: total }
              }))
            }, 500)
          }
        }
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [restaurantId,settings])

  async function read(id) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
    setNotifications(prev => prev.map(x => x.id === id ? { ...x, read_at: new Date().toISOString() } : x))
  }

  return (
    <div className="shell">
      <main className="page">
        <div className="head">
          <div>
            <span>NOTIFICATION CENTER</span>
            <h1>Notifications</h1>
            <p>New orders, reviews, payments and operational alerts.</p>
          </div>
          <div className="actions">
            {settings.browser===true && permission !== "granted" && permission !== "unsupported" && (
              <button onClick={enableAlerts}>🔔 Enable alerts & sound</button>
            )}
            <button onClick={load}>↻ Refresh</button>
          </div>
        </div>
        <div className="card">
          {!notifications.length ? (
            <div className="empty">🎉 No notifications right now.</div>
          ) : notifications.map(x => {
            const match = String(x.message || "").match(/Order #([a-f0-9]{8})/i)
            const shortId = match?.[1]?.toLowerCase()
            const resolvedTotal = shortId ? orderTotals[shortId]?.total_amount : null
            const displayMessage =
              resolvedTotal != null
                ? String(x.message || "").replace(/₹[\d,]+(?:\.\d{1,2})?/, `₹${Number(resolvedTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
                : (x.message || "")

            return (
              <div className={`note ${x.read_at ? "read" : ""}`} key={x.id} onClick={() => read(x.id)}>
                <div className="icon">{x.type === "order" ? "🍳" : x.type === "warning" ? "⚠️" : x.type === "success" ? "✅" : "🔔"}</div>
                <div>
                  <b>{x.title}</b>
                  <p>{displayMessage}</p>
                  <small>{new Date(x.created_at).toLocaleString("en-IN")}</small>
                  {x.action_url && <div className="open">Open Kitchen →</div>}
                </div>
              </div>
            )
          })}
        </div>
      </main>
      <style jsx global>{css}</style>
    </div>
  )
}

const css = `
.shell{min-height:100vh;background:var(--background);color:var(--text)}
.page{margin-left:0;padding:32px}
.head{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:22px}
.head span{font-size:11px;letter-spacing:.14em;color:var(--info);font-weight:900}
.head h1{margin:5px 0;font-size:34px}
.head p{color:var(--muted)}
.actions{display:flex;gap:9px;flex-wrap:wrap}
.head button{background:var(--surface-2);color:var(--text);border:1px solid rgba(var(--primary-rgb),.24);border-radius:12px;padding:11px 15px;font-weight:800;cursor:pointer}
.card{background:var(--surface);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:10px}
.note{display:flex;gap:14px;padding:17px;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer}
.note:last-child{border:0}
.note.read{opacity:.55}
.icon{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--surface-2);flex:0 0 auto}
.note p{margin:4px 0;color:var(--muted)}
.note small{color:var(--muted)}
.open{margin-top:6px;color:var(--primary);font-size:11px;font-weight:800}
.empty{text-align:center;padding:60px;color:var(--muted)}
@media(max-width:700px){.page{padding:18px}.head{align-items:flex-start;flex-direction:column}.head h1{font-size:28px}}
`
