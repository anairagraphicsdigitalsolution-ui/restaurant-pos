"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/AuthProvider"

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`

function localDateKey(value) {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
}

function isToday(value) {
  if (!value) return false
  const now = new Date()
  const todayKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`
  return localDateKey(value) === todayKey
}

function statusMeta(status) {
  const key = String(status || "pending").toLowerCase()
  if (["done", "completed", "served", "paid"].includes(key)) return { label: "Completed", cls: "success" }
  if (["ready"].includes(key)) return { label: "Ready", cls: "info" }
  if (["preparing", "in_kitchen", "in-kitchen"].includes(key)) return { label: "Preparing", cls: "warning" }
  if (["cancelled", "canceled"].includes(key)) return { label: "Cancelled", cls: "danger" }
  return { label: "Pending", cls: "pending" }
}

export default function Dashboard() {
  const router = useRouter()
  const { role: authRole, restaurantId: authRestaurantId, loading: authLoading } = useAuth()
  const [role, setRole] = useState("")
  const [restaurant, setRestaurant] = useState(null)
  const [restaurantId, setRestaurantId] = useState(null)
  const [orders, setOrders] = useState([])
  const [items, setItems] = useState([])
  const [offers, setOffers] = useState([])
  const [customers, setCustomers] = useState([])
  const [reservations, setReservations] = useState([])
  const [tables, setTables] = useState([])
  const [topSelling, setTopSelling] = useState([])
  const [salesDays, setSalesDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(false)
  const [activeImage, setActiveImage] = useState(0)
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    let channel
    let refreshTimer
    let cancelled = false

    const scheduleRefresh = (rid) => {
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        if (!cancelled) loadData(rid, false)
      }, 350)
    }

    async function init() {
      if (authLoading) return

      const rid = authRestaurantId
      if (!rid) {
        setLoading(false)
        return
      }

      setRole(authRole || "")
      setRestaurantId(rid)
      await loadData(rid)

      if (cancelled) return

      channel = supabase
        .channel(`dashboard-${rid}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${rid}` }, () => scheduleRefresh(rid))
        .on("postgres_changes", { event: "*", schema: "public", table: "menu_items", filter: `restaurant_id=eq.${rid}` }, () => scheduleRefresh(rid))
        .on("postgres_changes", { event: "*", schema: "public", table: "offers", filter: `restaurant_id=eq.${rid}` }, () => scheduleRefresh(rid))
        .subscribe((status) => setLive(status === "SUBSCRIBED"))
    }

    init()

    return () => {
      cancelled = true
      clearTimeout(refreshTimer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [authLoading, authRestaurantId, authRole])

  useEffect(() => {
    if (!items.length) return
    const timer = setInterval(() => {
      setActiveImage((prev) => (prev + 1) % items.length)
    }, 3500)
    return () => clearInterval(timer)
  }, [items.length])

  async function loadData(rid, showLoading = true) {
    if (showLoading) setLoading(true)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      if (!token) {
        if (showLoading) setLoading(false)
        return
      }

      const response = await fetch("/api/dashboard/overview", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      })

      const payload = await response.json()

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Dashboard data unavailable")
      }

      const orderData = payload.orders || []
      const itemData = payload.items || []
      const offerData = payload.offers || []
      const customerData = payload.customers || []
      const reservationData = payload.reservations || []

      setRestaurant(payload.restaurant || null)
      setRole(payload.role || "")
      setRestaurantId(payload.restaurant_id || rid)
      setOrders(orderData)
      setItems(itemData)
      setOffers(offerData)
      setCustomers(customerData)
      setReservations(reservationData)
      setTables(payload.tables || [])
      setSummary(payload.summary || null)

      const itemMap = new Map(itemData.map((item) => [String(item.id), item]))
      const salesMap = {}

      for (const oi of payload.orderItems || []) {
        const menuItem = itemMap.get(String(oi.item_id))
        const name = menuItem?.name || "Unknown item"
        const qty = Number(oi.quantity || 0)
        const amount = Number(menuItem?.price || 0) * qty

        if (!salesMap[name]) salesMap[name] = { name, qty: 0, amount: 0 }
        salesMap[name].qty += qty
        salesMap[name].amount += amount
      }

      setTopSelling(
        Object.values(salesMap)
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 6)
      )

      const days = []

      for (let offset = 6; offset >= 0; offset--) {
        const d = new Date()
        d.setHours(0, 0, 0, 0)
        d.setDate(d.getDate() - offset)

        const key = localDateKey(d)
        const total = orderData
          .filter((o) => localDateKey(o.created_at || o.billed_at) === key)
          .reduce((sum, o) => sum + Number(o.total_amount || 0), 0)

        days.push({
          key,
          label: d.toLocaleDateString("en-IN", { weekday: "short" }),
          total
        })
      }

      setSalesDays(days)

      const queryErrors = Object.entries(payload.errors || {})
        .filter(([,value]) => value)
        .map(([key,value]) => `${key}: ${value}`)

      if (queryErrors.length) {
        console.warn("Dashboard query warnings:", queryErrors)
      }
    } catch (error) {
      console.error("DASHBOARD LOAD ERROR:", error)
    } finally {
      setLoading(false)
    }
  }

  async function deleteItem(id) {
    if (!['admin', 'super_admin'].includes(role)) return alert("Only admin is allowed to delete menu items.")
    if (!confirm("Delete this menu item?")) return
    const { error } = await supabase.from("menu_items").delete().eq("id", id).eq("restaurant_id", restaurantId)
    if (error) return alert(error.message)
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  async function deleteCategory(category) {
    if (!['admin', 'super_admin'].includes(role)) return alert("Only admin is allowed to delete categories.")
    if (!confirm(`Delete all items in ${category}?`)) return
    const { error } = await supabase.from("menu_items").delete().eq("category", category).eq("restaurant_id", restaurantId)
    if (error) return alert(error.message)
    setItems((prev) => prev.filter((item) => item.category !== category))
  }

  async function deleteAllOrders() {
    if (!['admin', 'super_admin'].includes(role)) return alert("Only admin is allowed.")
    if (!confirm("⚠️ Delete ALL orders for this restaurant? This cannot be undone.")) return
    const { error } = await supabase.from("orders").delete().eq("restaurant_id", restaurantId)
    if (error) return alert(error.message)
    setOrders([])
  }

  const todayOrders = useMemo(
    () => orders.filter((o) => {
      const status = String(o.status || "").toLowerCase()
      return isToday(o.created_at || o.billed_at) && !["cancelled", "canceled", "void", "voided", "refunded"].includes(status)
    }),
    [orders]
  )
  const todaySales = summary?.todaySales ?? todayOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
  const paidToday = todayOrders.filter((o) => o.payment_status === "paid" || Number(o.total_amount || 0) > 0).reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
  const averageBill = summary?.averageBill ?? (todayOrders.length ? todaySales / todayOrders.length : 0)
  const pendingOrders = summary?.pendingOrders ?? orders.filter((o) => ["pending", "new"].includes(String(o.status || "").toLowerCase())).length
  const preparingOrders = summary?.preparingOrders ?? orders.filter((o) => ["preparing", "in_kitchen", "in-kitchen"].includes(String(o.status || "").toLowerCase())).length
  const readyOrders = summary?.readyOrders ?? orders.filter((o) => String(o.status || "").toLowerCase() === "ready").length
  const todayReservations = reservations.filter((r) => r.date === (summary?.todayKey || new Date().toISOString().slice(0, 10)))
  const activeOffers = offers.filter((o) => !o.valid_till || o.valid_till >= new Date().toISOString().slice(0, 10))
  const maxSales = Math.max(...salesDays.map((d) => d.total), 1)

  const categories = useMemo(() => {
    return items.reduce((acc, item) => {
      const key = item.category || "Others"
      if (!acc[key]) acc[key] = []
      acc[key].push(item)
      return acc
    }, {})
  }, [items])

  return (
    <div className="dashboardPage">
      <div className="dashShell">
        <section className="heroCard">
          <div>
            <div className="eyebrow">ANAIRA POS • RESTAURANT CONTROL CENTER</div>
            <h1>{restaurant?.name || "Restaurant Dashboard"}</h1>
            <p>Real-time overview of sales, orders, kitchen flow, customers and daily operations.</p>
            <div className="heroActions">
              <button onClick={() => router.push("/order")} className="primaryBtn">➕ New Order</button>
              <button onClick={() => router.push("/billing")} className="ghostBtn">🧾 Billing</button>
              <button onClick={() => router.push("/dashboard/business")} className="ghostBtn">⚙️ Operations</button>
              <button onClick={() => router.push("/kitchen")} className="ghostBtn">🍳 Kitchen</button>
              <button onClick={() => router.push("/dashboard/delivery")} className="ghostBtn">🛵 Delivery</button>
            </div>
          </div>
          <div className="heroSide">
            <div className={`livePill ${live ? "live" : ""}`}><span /> {live ? "Live Connected" : "Connecting"}</div>
            <div className="roleText">Signed in as <b>{role || "user"}</b></div>
            <div className="heroDate">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</div>
          </div>
        </section>

        <section className="statsGrid">
          <StatCard icon="₹" label="Today's Sales" value={money(todaySales)} note={`${todayOrders.length} orders today`} />
          <StatCard icon="🧾" label="Today's Orders" value={summary?.todayOrderCount ?? todayOrders.length} note={`${pendingOrders} pending`} />
          <StatCard icon="◉" label="Average Bill" value={money(averageBill)} note="Per order today" />
          <StatCard icon="👥" label="Customers" value={summary?.customerCount ?? customers.length} note={`${summary?.todayReservationCount ?? todayReservations.length} reservations today`} />
          <StatCard icon="🎁" label="Active Offers" value={activeOffers.length} note="Currently available" />
          <StatCard icon="🍳" label="Kitchen Queue" value={pendingOrders + preparingOrders} note={`${readyOrders} ready for service`} />
        </section>

        <section className="mainGrid">
          <div className="panel salesPanel">
            <PanelHeader title="Sales Performance" subtitle="Last 7 days" action={<button className="textBtn" onClick={() => router.push("/billing")}>Open reports →</button>} />
            <div className="chartArea">
              {salesDays.map((day) => (
                <div className="barCol" key={day.key} title={`${day.label}: ${money(day.total)}`}>
                  <div className="barValue">{day.total ? money(day.total) : "—"}</div>
                  <div className="barTrack"><div className="barFill" style={{ height: `${Math.max(5, (day.total / maxSales) * 100)}%` }} /></div>
                  <div className="barLabel">{day.label}</div>
                </div>
              ))}
            </div>
            <div className="salesFooter"><span>Collected today</span><strong>{money(paidToday)}</strong></div>
          </div>

          <div className="panel">
            <PanelHeader title="Order Flow" subtitle="Current operational queue" />
            <div className="flowGrid">
              <FlowCard label="Pending" value={pendingOrders} icon="🕐" tone="pending" />
              <FlowCard label="Preparing" value={preparingOrders} icon="🔥" tone="warning" />
              <FlowCard label="Ready" value={readyOrders} icon="✓" tone="info" />
              <FlowCard label="Completed" value={summary?.completedOrders ?? orders.filter((o) => ["done", "completed", "served"].includes(String(o.status || "").toLowerCase())).length} icon="✓" tone="success" />
            </div>
            <button className="wideBtn" onClick={() => router.push("/kitchen")}>Open Kitchen Display</button>
          </div>
        </section>

        <section className="threeGrid">
          <div className="panel">
            <PanelHeader title="Recent Orders" subtitle="Latest activity" action={<button className="textBtn" onClick={() => router.push("/order")}>View all →</button>} />
            <div className="listScroll">
              {orders.slice(0, 7).map((order) => {
                const meta = statusMeta(order.status)
                return <div className="orderRow" key={order.id}>
                  <div><strong>{order.source_label || `#${order.id.slice(0, 6)}`}</strong><small>{new Date(order.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} • {order.source_type || "Order"}</small></div>
                  <div className="orderRight"><strong>{money(order.total_amount)}</strong><span className={`badge ${meta.cls}`}>{meta.label}</span></div>
                </div>
              })}
              {!orders.length && <Empty text="No orders yet." />}
            </div>
          </div>

          <div className="panel">
            <PanelHeader title="Top Selling Items" subtitle="By quantity" />
            <div className="listScroll">
              {topSelling.map((item, index) => <div className="rankRow" key={item.name}>
                <div className="rank">{index + 1}</div><div className="rankName"><strong>{item.name}</strong><small>{item.qty} sold</small></div><strong className="amount">{money(item.amount)}</strong>
              </div>)}
              {!topSelling.length && <Empty text="Sales data will appear here." />}
            </div>
          </div>

          <div className="panel">
            <PanelHeader title="Today's Reservations" subtitle={`${todayReservations.length} bookings`} action={<button className="textBtn" onClick={() => router.push("/dashboard/reservations")}>Manage →</button>} />
            <div className="listScroll">
              {todayReservations.slice(0, 6).map((r) => <div className="reservationRow" key={r.id}>
                <div><strong>{r.name || "Guest"}</strong><small>{r.time || "Time not set"} • {r.guests || 1} guests</small></div>
                <span className={`badge ${String(r.status).toLowerCase() === "confirmed" ? "success" : "pending"}`}>{r.status || "pending"}</span>
              </div>)}
              {!todayReservations.length && <Empty text="No reservations for today." />}
            </div>
          </div>
        </section>

        <section className="twoGrid">
          <div className="panel">
            <PanelHeader title="Quick Actions" subtitle="Jump directly into daily work" />
            <div className="quickGrid">
              <QuickAction icon="🧾" label="Create Order" onClick={() => router.push("/order")} />
              <QuickAction icon="💳" label="Billing" onClick={() => router.push("/billing")} />
              <QuickAction icon="🍳" label="Kitchen" onClick={() => router.push("/kitchen")} />
              <QuickAction icon="🛵" label="Delivery" onClick={() => router.push("/dashboard/delivery")} />
              <QuickAction icon="🪑" label="Tables" onClick={() => router.push("/dashboard/tables")} />
              <QuickAction icon="🎁" label="Offers" onClick={() => router.push("/dashboard/offers")} />
              <QuickAction icon="👥" label="Customers" onClick={() => router.push("/dashboard/customers")} />
              <QuickAction icon="📱" label="QR Center" onClick={() => router.push("/dashboard/qr")} />
              <QuickAction icon="🎨" label="Branding" onClick={() => router.push("/dashboard/theme")} />
            </div>
          </div>

          <div className="panel galleryPanel">
            <PanelHeader title="Menu Spotlight" subtitle={`${items.length} menu items`} action={<button className="textBtn" onClick={() => router.push("/admin")}>Manage menu →</button>} />
            {items.length ? <div className="spotlight">
              <img src={items[activeImage]?.image || "/Logo.png"} alt={items[activeImage]?.name || "Menu item"} />
              <div><strong>{items[activeImage]?.name}</strong><span>{items[activeImage]?.category || "Menu"}</span><b>{money(items[activeImage]?.price)}</b></div>
            </div> : <Empty text="Add menu items to show your spotlight." />}
          </div>
        </section>

        <section className="panel menuPanel">
          <PanelHeader title="Menu Overview" subtitle="Categories and menu items" action={<button className="primarySmall" onClick={() => router.push("/admin")}>＋ Add Item</button>} />
          <div className="categoryGrid">
            {Object.entries(categories).map(([category, catItems]) => (
              <div className="categoryCard" key={category}>
                <div className="categoryTop"><div><strong>{category}</strong><span>{catItems.length} items</span></div>{['admin', 'super_admin'].includes(role) && <button className="deleteIcon" onClick={() => deleteCategory(category)}>🗑</button>}</div>
                <div className="categoryItems">
                  {catItems.slice(0, 4).map((item) => <div className="miniItem" key={item.id}><div><strong>{item.name}</strong><span>{money(item.price)}</span></div>{['admin', 'super_admin'].includes(role) && <button className="deleteIcon" onClick={() => deleteItem(item.id)}>×</button>}</div>)}
                </div>
              </div>
            ))}
          </div>
          {!Object.keys(categories).length && <Empty text="No menu items found." />}
        </section>

        {['admin', 'super_admin'].includes(role) && <section className="dangerZone">
          <div><strong>Danger Zone</strong><span>Permanent actions for restaurant data.</span></div>
          <button onClick={deleteAllOrders}>Delete All Orders</button>
        </section>}
      </div>

      <style jsx global>{`
        .dashboardPage{min-height:100vh;background:radial-gradient(circle at 15% 0%,rgba(var(--primary-rgb),.12),transparent 28%),radial-gradient(circle at 90% 5%,rgba(59,130,246,.08),transparent 25%),linear-gradient(180deg,var(--background),#020617);color:#fff;padding:28px;overflow-x:hidden}
        .dashShell{max-width:1600px;margin:0 auto}
        .heroCard{display:flex;justify-content:space-between;gap:28px;padding:32px;border-radius:28px;background:linear-gradient(135deg,rgba(var(--surface-rgb),.96),rgba(var(--surface-2-rgb),.9));border:1px solid rgba(var(--primary-rgb),.22);box-shadow:0 25px 70px rgba(0,0,0,.32);margin-bottom:22px}
        .eyebrow{font-size:11px;font-weight:900;letter-spacing:.16em;color:var(--primary);margin-bottom:10px}
        .heroCard h1{font-size:clamp(30px,4vw,48px);margin:0 0 10px;letter-spacing:-.04em}.heroCard p{margin:0;color:var(--muted);max-width:720px;line-height:1.7}.heroActions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}.primaryBtn,.ghostBtn,.wideBtn,.primarySmall,.quickAction{cursor:pointer;border-radius:13px;font-weight:800}.primaryBtn{border:1px solid rgba(var(--primary-rgb),.45);background:var(--primary);color:#08110d;padding:12px 17px}.ghostBtn{background:rgba(255,255,255,.04);color:#fff;border:1px solid rgba(255,255,255,.1);padding:12px 17px}.heroSide{min-width:230px;display:flex;flex-direction:column;align-items:flex-end;gap:10px}.livePill{padding:8px 12px;border-radius:999px;background:rgba(148,163,184,.1);border:1px solid rgba(148,163,184,.2);font-size:12px;font-weight:800}.livePill span{display:inline-block;width:7px;height:7px;border-radius:50%;background:#94a3b8;margin-right:6px}.livePill.live{color:#4ade80;border-color:rgba(74,222,128,.25);background:rgba(74,222,128,.08)}.livePill.live span{background:#4ade80;box-shadow:0 0 10px #4ade80}.roleText,.heroDate{font-size:12px;color:var(--muted);text-align:right}.statsGrid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:14px;margin-bottom:22px}.statCard{padding:20px;border-radius:20px;background:linear-gradient(145deg,var(--surface),var(--surface-2));border:1px solid rgba(var(--primary-rgb),.16);box-shadow:0 15px 35px rgba(0,0,0,.2)}.statIcon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:rgba(var(--primary-rgb),.12);color:var(--primary);font-weight:900}.statLabel{color:var(--muted);font-size:12px;margin-top:12px}.statValue{font-size:27px;font-weight:900;margin:5px 0}.statNote{color:#94a3b8;font-size:11px}.mainGrid{display:grid;grid-template-columns:1.55fr 1fr;gap:18px;margin-bottom:18px}.threeGrid{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:18px;margin-bottom:18px}.twoGrid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px}.panel{background:linear-gradient(145deg,rgba(var(--surface-rgb),.96),rgba(var(--surface-2-rgb),.94));border:1px solid rgba(var(--primary-rgb),.15);border-radius:22px;padding:22px;box-shadow:0 18px 45px rgba(0,0,0,.22);min-width:0}.panelHeader{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:18px}.panelHeader h3{margin:0;font-size:17px}.panelHeader p{margin:4px 0 0;color:var(--muted);font-size:11px}.textBtn{background:none;border:0;color:var(--primary);font-size:12px;font-weight:800;cursor:pointer}.primarySmall{border:0;background:var(--primary);color:#07110c;padding:9px 13px}.chartArea{height:250px;display:flex;align-items:flex-end;gap:12px;padding:10px 4px 0}.barCol{height:100%;flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:7px;min-width:0}.barValue{font-size:9px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70px}.barTrack{height:185px;width:100%;max-width:42px;border-radius:12px;background:rgba(255,255,255,.045);display:flex;align-items:flex-end;overflow:hidden}.barFill{width:100%;min-height:5px;border-radius:12px;background:linear-gradient(180deg,var(--primary),color-mix(in srgb,var(--primary) 45%,#0f172a));box-shadow:0 0 18px rgba(var(--primary-rgb),.2)}.barLabel{font-size:10px;color:var(--muted)}.salesFooter{margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07);display:flex;justify-content:space-between;color:var(--muted);font-size:12px}.salesFooter strong{color:var(--primary);font-size:16px}.flowGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.flowCard{padding:17px;border-radius:16px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025)}.flowIcon{font-size:18px}.flowLabel{font-size:11px;color:var(--muted);margin-top:9px}.flowValue{font-size:27px;font-weight:900;margin-top:2px}.flowCard.pending{border-color:rgba(251,191,36,.18)}.flowCard.warning{border-color:rgba(249,115,22,.18)}.flowCard.info{border-color:rgba(59,130,246,.18)}.flowCard.success{border-color:rgba(34,197,94,.18)}.wideBtn{width:100%;margin-top:14px;padding:12px;background:rgba(var(--primary-rgb),.09);color:var(--primary);border:1px solid rgba(var(--primary-rgb),.2)}.listScroll{max-height:330px;overflow:auto;padding-right:3px}.orderRow,.reservationRow,.rankRow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.06)}.orderRow:last-child,.reservationRow:last-child,.rankRow:last-child{border-bottom:0}.orderRow strong,.reservationRow strong,.rankRow strong{font-size:12px}.orderRow small,.reservationRow small,.rankName small{display:block;color:var(--muted);font-size:10px;margin-top:4px}.orderRight{display:flex;align-items:flex-end;flex-direction:column;gap:5px}.badge{padding:5px 8px;border-radius:999px;font-size:9px;font-weight:800;border:1px solid transparent;text-transform:capitalize}.badge.success{color:#4ade80;background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.18)}.badge.info{color:#60a5fa;background:rgba(59,130,246,.1);border-color:rgba(59,130,246,.18)}.badge.warning,.badge.pending{color:#fbbf24;background:rgba(251,191,36,.1);border-color:rgba(251,191,36,.18)}.badge.danger{color:#f87171;background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.18)}.rankRow{justify-content:flex-start}.rank{width:28px;height:28px;border-radius:9px;background:rgba(var(--primary-rgb),.1);color:var(--primary);display:grid;place-items:center;font-weight:900;font-size:11px;flex:0 0 auto}.rankName{flex:1}.amount{margin-left:auto;color:var(--primary)}.quickGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.quickAction{border:1px solid rgba(var(--primary-rgb),.12);background:rgba(255,255,255,.025);color:#fff;padding:16px 10px;display:flex;flex-direction:column;align-items:center;gap:8px;font-size:11px}.quickAction:hover{background:rgba(var(--primary-rgb),.08);transform:translateY(-2px)}.quickAction span:first-child{font-size:20px}.spotlight{display:grid;grid-template-columns:130px 1fr;gap:16px;align-items:center}.spotlight img{width:130px;height:115px;object-fit:cover;border-radius:18px;border:1px solid rgba(var(--primary-rgb),.18);background:#0f172a}.spotlight strong{display:block;font-size:17px}.spotlight span{display:block;color:var(--muted);font-size:11px;margin:7px 0}.spotlight b{color:var(--primary);font-size:18px}.menuPanel{margin-bottom:18px}.categoryGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.categoryCard{padding:16px;border-radius:17px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07)}.categoryTop{display:flex;justify-content:space-between;align-items:center}.categoryTop strong{display:block;font-size:14px}.categoryTop span{display:block;color:var(--muted);font-size:10px;margin-top:4px}.categoryItems{margin-top:12px}.miniItem{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-top:1px solid rgba(255,255,255,.05)}.miniItem strong{font-size:11px}.miniItem span{display:block;color:var(--primary);font-size:10px;margin-top:3px}.deleteIcon{border:0;background:transparent;color:#f87171;cursor:pointer;font-size:12px}.dangerZone{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 20px;border-radius:18px;background:rgba(127,29,29,.1);border:1px solid rgba(239,68,68,.2);margin-bottom:30px}.dangerZone strong{display:block}.dangerZone span{display:block;color:#94a3b8;font-size:11px;margin-top:4px}.dangerZone button{border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.14);color:#fca5a5;padding:10px 14px;border-radius:10px;cursor:pointer;font-weight:800}.emptyState{padding:30px 10px;text-align:center;color:var(--muted);font-size:12px}
        @media(max-width:1250px){.statsGrid{grid-template-columns:repeat(3,1fr)}.threeGrid{grid-template-columns:1fr 1fr}.threeGrid>.panel:last-child{grid-column:1/-1}.categoryGrid{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:900px){.dashboardPage{padding:16px}.heroCard{flex-direction:column}.heroSide{align-items:flex-start}.roleText,.heroDate{text-align:left}.mainGrid,.twoGrid{grid-template-columns:1fr}.threeGrid{grid-template-columns:1fr}.quickGrid{grid-template-columns:repeat(4,1fr)}}
        @media(max-width:768px){.statsGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px} .statCard{min-width:0}.statValue{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.statCard{padding:14px}.statValue{font-size:22px}.heroCard{padding:22px;border-radius:22px}.heroCard h1{font-size:30px}.panel{padding:16px;border-radius:18px}.quickGrid{grid-template-columns:repeat(2,1fr)}.categoryGrid{grid-template-columns:1fr}.chartArea{gap:7px}.barValue{font-size:8px}.dangerZone{align-items:flex-start;flex-direction:column}}
      `}</style>
    </div>
  )
}

function StatCard({ icon, label, value, note }) {
  return <div className="statCard"><div className="statIcon">{icon}</div><div className="statLabel">{label}</div><div className="statValue">{value}</div><div className="statNote">{note}</div></div>
}

function PanelHeader({ title, subtitle, action }) {
  return <div className="panelHeader"><div><h3>{title}</h3><p>{subtitle}</p></div>{action}</div>
}

function FlowCard({ label, value, icon, tone }) {
  return <div className={`flowCard ${tone}`}><div className="flowIcon">{icon}</div><div className="flowLabel">{label}</div><div className="flowValue">{value}</div></div>
}

function QuickAction({ icon, label, onClick }) {
  return <button className="quickAction" onClick={onClick}><span>{icon}</span><span>{label}</span></button>
}

function Empty({ text }) {
  return <div className="emptyState">{text}</div>
}
