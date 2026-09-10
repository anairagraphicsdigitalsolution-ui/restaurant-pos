"use client"
import { formatIndiaDate, formatIndiaTime, indiaDateKey } from "@/lib/indiaTime"

import { useEffect, useMemo, useState } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/AuthProvider"

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`

function localDateKey(value) {
  return indiaDateKey(value)
}

function isToday(value) {
  if (!value) return false
  return indiaDateKey(value) === indiaDateKey(new Date())
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
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(false)
  const [activeImage, setActiveImage] = useState(0)
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    let channel
    let refreshTimer
    let cancelled = false
    let loadingRefresh = false
    let refreshQueued = false
    let lastRefreshAt = 0

    const scheduleRefresh = (rid) => {
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(async () => {
        if (cancelled) return
        if (loadingRefresh) { refreshQueued = true; return }
        const sinceLast = Date.now() - lastRefreshAt
        if (sinceLast < 4000) { refreshQueued = true; refreshTimer = setTimeout(() => scheduleRefresh(rid), 4000 - sinceLast); return }
        loadingRefresh = true
        lastRefreshAt = Date.now()
        try { await loadData(rid, false) } finally {
          loadingRefresh = false
          if (refreshQueued && !cancelled) {
            refreshQueued = false
            scheduleRefresh(rid)
          }
        }
      }, 1500)
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

      channel = supabaseCloud
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
      if (channel) supabaseCloud.removeChannel(channel)
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
      const { data: sessionData, error: sessionError } = await supabaseCloud.auth.getSession()
      if (sessionError) throw sessionError
      const accessToken = sessionData?.session?.access_token
      if (!accessToken) throw new Error("Authentication session expired. Please sign in again.")

      // Read dashboard data through the Cloud-only server endpoint. This keeps
      // the browser and Electron builds on the exact same Cloud Supabase query
      // path and avoids browser RLS differences for dashboard reporting.
      let response = null
      let payload = null
      let lastError = null
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          response = await fetch("/api/dashboard/overview", {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: "no-store",
          })
          payload = await response.json().catch(() => ({}))
          if (response.ok && payload?.success) break
          lastError = new Error(payload?.error || `Dashboard Cloud request failed (${response.status})`)
        } catch (error) {
          lastError = error
        }
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)))
      }
      if (!response?.ok || !payload?.success) throw lastError || new Error("Dashboard Cloud request failed")

      if (String(payload.restaurant_id) !== String(rid)) {
        throw new Error("Cloud restaurant context changed. Please refresh the dashboard.")
      }

      const orderData = payload.orders || []
      const itemData = payload.items || []
      const offerData = payload.offers || []
      const customerData = payload.customers || []
      const reservationData = payload.reservations || []
      const tableData = payload.tables || []
      const restaurantData = payload.restaurant

      if (!restaurantData) throw new Error("Restaurant was not found in Cloud Supabase")

      setRestaurant(restaurantData)
      setRole(payload.role || authRole || "")
      setRestaurantId(rid)
      setOrders(orderData)
      setItems(itemData)
      setOffers(offerData)
      setCustomers(customerData)
      setReservations(reservationData)
      setTables(tableData)
      
      const todayKey = indiaDateKey(new Date())
      const cancelledStatuses = new Set(["cancelled", "canceled", "void", "voided", "refunded"])
      const todayOrders = orderData.filter((order) => {
        const status = String(order.status || "").toLowerCase()
        return !cancelledStatuses.has(status) && indiaDateKey(order.created_at || order.billed_at) === todayKey
      })
      const todaySales = todayOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
      const pendingOrders = orderData.filter((o) => ["pending", "new"].includes(String(o.status || "").toLowerCase())).length
      const preparingOrders = orderData.filter((o) => ["preparing", "in_kitchen", "in-kitchen"].includes(String(o.status || "").toLowerCase())).length
      const readyOrders = orderData.filter((o) => String(o.status || "").toLowerCase() === "ready").length

      setSummary({
        todayKey,
        todayOrderCount: todayOrders.length,
        todaySales,
        averageBill: todayOrders.length ? todaySales / todayOrders.length : 0,
        customerCount: Number(payload.summary?.customerCount ?? customerData.length),
        todayReservationCount: reservationData.filter((r) => String(r.date || "").slice(0, 10) === todayKey).length,
        pendingOrders,
        preparingOrders,
        readyOrders,
        completedOrders: orderData.filter((o) => ["done", "completed", "served", "paid"].includes(String(o.status || "").toLowerCase())).length,
      })

      setTopSelling((payload.topSelling || []).map((item) => ({
        name: item.item_name || "Unknown item",
        qty: Number(item.quantity || 0),
        amount: Number(item.sales_amount || 0),
      })))

    } catch (error) {
      // Keep the last known-good dashboard on transient Cloud/network failures.
      // Clearing the whole screen made a temporary timeout look like data loss.
      console.error("DASHBOARD CLOUD LOAD ERROR:", error)
    } finally {
      setLoading(false)
    }
  }

  async function deleteItem(id) {
    if (!['admin', 'super_admin'].includes(role)) return alert("Only admin is allowed to delete menu items.")
    if (!confirm("Delete this menu item?")) return
    const { error } = await supabaseCloud.from("menu_items").delete().eq("id", id).eq("restaurant_id", restaurantId)
    if (error) return alert(error.message)
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  async function deleteCategory(category) {
    if (!['admin', 'super_admin'].includes(role)) return alert("Only admin is allowed to delete categories.")
    if (!confirm(`Delete all items in ${category}?`)) return
    const { error } = await supabaseCloud.from("menu_items").delete().eq("category", category).eq("restaurant_id", restaurantId)
    if (error) return alert(error.message)
    setItems((prev) => prev.filter((item) => item.category !== category))
  }

  async function deleteAllOrders() {
    if (!['admin', 'super_admin'].includes(role)) return alert("Only admin is allowed.")
    if (!confirm("⚠️ Delete ALL orders for this restaurant? This cannot be undone.")) return
    const { error } = await supabaseCloud.from("orders").delete().eq("restaurant_id", restaurantId)
    if (error) return alert(error.message)
    setOrders([])
  }

  // Dashboard is intentionally TODAY-only. Derive operational cards from the
  // same todayOrders source so Sales, Business Mix and Order Flow can never
  // disagree because one card used historical/all-orders state.
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
  const pendingOrders = todayOrders.filter((o) => ["pending", "new"].includes(String(o.status || "").toLowerCase())).length
  const preparingOrders = todayOrders.filter((o) => ["preparing", "in_kitchen", "in-kitchen"].includes(String(o.status || "").toLowerCase())).length
  const readyOrders = todayOrders.filter((o) => String(o.status || "").toLowerCase() === "ready").length
  const completedOrders = todayOrders.filter((o) => ["done", "completed", "served", "paid"].includes(String(o.status || "").toLowerCase())).length
  const todayOrderTypeBreakdown = useMemo(() => {
    const map = new Map()
    todayOrders.forEach((order) => {
      const key = String(order.source_type || order.source_label || "Other").trim() || "Other"
      const current = map.get(key) || { label: key, orders: 0, sales: 0 }
      current.orders += 1
      current.sales += Number(order.total_amount || 0)
      map.set(key, current)
    })
    return Array.from(map.values()).sort((a, b) => b.sales - a.sales).slice(0, 4)
  }, [todayOrders])
  const todayReservations = reservations.filter((r) => r.date === (summary?.todayKey || new Date().toISOString().slice(0, 10)))
  const activeOffers = offers.filter((o) => !o.valid_till || o.valid_till >= new Date().toISOString().slice(0, 10))

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
            <div className="heroDate">{formatIndiaDate(new Date(), { weekday: "long", day: "numeric", month: "long" })}</div>
          </div>
        </section>

        <section className="statsGrid">
          <StatCard icon="₹" label="Today's Sales" value={money(todaySales)} note={`${todayOrders.length} orders today`} />
          <StatCard icon="🧾" label="Today's Orders" value={todayOrders.length} note={`${pendingOrders} pending`} />
          <StatCard icon="◉" label="Average Bill" value={money(averageBill)} note="Per order today" />
          <StatCard icon="👥" label="Customers" value={summary?.customerCount ?? customers.length} note={`${summary?.todayReservationCount ?? todayReservations.length} reservations today`} />
          <StatCard icon="🎁" label="Active Offers" value={activeOffers.length} note="Currently available" />
          <StatCard icon="🍳" label="Kitchen Queue" value={pendingOrders + preparingOrders} note={`${readyOrders} ready for service`} />
        </section>

        <section className="mainGrid">
          <div className="panel salesPanel">
            <PanelHeader title="Sales Performance" subtitle="Today • Full Day" action={<button className="textBtn" onClick={() => router.push("/dashboard/reports")}>Open reports →</button>} />
            <div className="salesTodayRow">
              <span>Today</span>
              <div className="salesTodayTrack"><div className="salesTodayFill" style={{ width: todaySales > 0 ? "100%" : "0%" }} /></div>
              <strong>{money(todaySales)}</strong>
            </div>
            <div className="salesInsightHeader">
              <div><strong>Today’s business mix</strong><span>Sales and order count by channel</span></div>
              <div className="salesInsightTotal"><b>{summary?.todayOrderCount ?? todayOrders.length}</b><small>orders</small></div>
            </div>
            <div className="salesMixGrid">
              {todayOrderTypeBreakdown.map((entry) => (
                <div className="salesMixCard" key={entry.label}>
                  <div className="salesMixTop"><span>{entry.label}</span><b>{money(entry.sales)}</b></div>
                  <div className="salesMixBar"><i style={{ width: `${todaySales > 0 ? Math.min(100, (Number(entry.sales || 0) / todaySales) * 100) : 0}%` }} /></div>
                  <small>{Number(entry.orders || 0)} {Number(entry.orders || 0) === 1 ? "order" : "orders"}</small>
                </div>
              ))}
              {!todayOrderTypeBreakdown.length && <Empty text="No orders today yet." />}
            </div>
          </div>

          <div className="panel">
            <PanelHeader title="Order Flow" subtitle="Current operational queue" />
            <div className="flowGrid">
              <FlowCard label="Pending" value={pendingOrders} icon="🕐" tone="pending" />
              <FlowCard label="Preparing" value={preparingOrders} icon="🔥" tone="warning" />
              <FlowCard label="Ready" value={readyOrders} icon="✓" tone="info" />
              <FlowCard label="Completed" value={completedOrders} icon="✓" tone="success" />
            </div>
            <button className="wideBtn" onClick={() => router.push("/kitchen")}>Open Kitchen Display</button>
          </div>
        </section>

        <section className="threeGrid">
          <div className="panel">
            <PanelHeader title="Recent Orders" subtitle="Latest activity" action={<button className="textBtn" onClick={() => router.push("/dashboard/reports")}>View all →</button>} />
            <div className="listScroll">
              {orders.slice(0, 7).map((order) => {
                const meta = statusMeta(order.status)
                return <div className="orderRow" key={order.id}>
                  <div><strong>{order.source_label || `#${order.id.slice(0, 6)}`}</strong><small>{formatIndiaTime(order.created_at)} • {order.source_type || "Order"}</small></div>
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
        .dashboardPage{min-height:100vh;background:radial-gradient(circle at 15% 0%,rgba(var(--primary-rgb),.12),transparent 28%),radial-gradient(circle at 90% 5%,rgba(59,130,246,.08),transparent 25%),linear-gradient(180deg,var(--background),var(--background));color:var(--text);padding:28px;overflow-x:hidden}
        .dashShell{max-width:1600px;margin:0 auto}
        .heroCard{display:flex;justify-content:space-between;gap:28px;padding:32px;border-radius:28px;background:linear-gradient(135deg,rgba(var(--surface-rgb),.96),rgba(var(--surface-2-rgb),.9));border:1px solid rgba(var(--primary-rgb),.22);box-shadow:0 25px 70px rgba(0,0,0,.32);margin-bottom:22px}
        .eyebrow{font-size:11px;font-weight:900;letter-spacing:.16em;color:var(--primary);margin-bottom:10px}
        .heroCard h1{font-size:clamp(30px,4vw,48px);margin:0 0 10px;letter-spacing:-.04em}.heroCard p{margin:0;color:var(--muted);max-width:720px;line-height:1.7}.heroActions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}.primaryBtn,.ghostBtn,.wideBtn,.primarySmall,.quickAction{cursor:pointer;border-radius:13px;font-weight:800}.primaryBtn{border:1px solid rgba(var(--primary-rgb),.45);background:var(--primary);color:#08110d;padding:12px 17px}.ghostBtn{background:rgba(255,255,255,.04);color:var(--text);border:1px solid rgba(255,255,255,.1);padding:12px 17px}.heroSide{min-width:230px;display:flex;flex-direction:column;align-items:flex-end;gap:10px}.livePill{padding:8px 12px;border-radius:999px;background:rgba(148,163,184,.1);border:1px solid rgba(148,163,184,.2);font-size:12px;font-weight:800}.livePill span{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--muted);margin-right:6px}.livePill.live{color:var(--success);border-color:rgba(74,222,128,.25);background:rgba(74,222,128,.08)}.livePill.live span{background:var(--success);box-shadow:0 0 10px var(--success)}.roleText,.heroDate{font-size:12px;color:var(--muted);text-align:right}.statsGrid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:14px;margin-bottom:22px}.statCard{padding:20px;border-radius:20px;background:linear-gradient(145deg,var(--surface),var(--surface-2));border:1px solid rgba(var(--primary-rgb),.16);box-shadow:0 15px 35px rgba(0,0,0,.2)}.statIcon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:rgba(var(--primary-rgb),.12);color:var(--primary);font-weight:900}.statLabel{color:var(--muted);font-size:12px;margin-top:12px}.statValue{font-size:27px;font-weight:900;margin:5px 0}.statNote{color:var(--muted);font-size:11px}.mainGrid{display:grid;grid-template-columns:1.55fr 1fr;gap:18px;margin-bottom:18px}.threeGrid{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:18px;margin-bottom:18px}.twoGrid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px}.panel{background:linear-gradient(145deg,rgba(var(--surface-rgb),.96),rgba(var(--surface-2-rgb),.94));border:1px solid rgba(var(--primary-rgb),.15);border-radius:22px;padding:22px;box-shadow:0 18px 45px rgba(0,0,0,.22);min-width:0}.panelHeader{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:18px}.panelHeader h3{margin:0;font-size:17px}.panelHeader p{margin:4px 0 0;color:var(--muted);font-size:11px}.textBtn{background:none;border:0;color:var(--primary);font-size:12px;font-weight:800;cursor:pointer}.primarySmall{border:0;background:var(--primary);color:#07110c;padding:9px 13px}.salesSummary{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:2px 0 14px}.salesSummaryCompact .salesMetric{padding:12px 14px}.salesMetric{padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07)}.salesMetric span{display:block;color:var(--muted);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}.salesMetric strong{display:block;color:var(--text);font-size:22px;line-height:1.15;margin:5px 0 2px}.salesMetric:first-child strong{color:var(--primary)}.salesMetric small{display:block;color:var(--muted);font-size:10px}.chartArea{height:auto;display:flex;align-items:center;justify-content:center;gap:12px;padding:8px 4px}.horizontalSalesChart{display:block}.horizontalSalesChart .barCol{width:100%;height:auto;display:grid;grid-template-columns:55px minmax(0,1fr) auto;align-items:center;gap:10px}.horizontalSalesChart .barValue{font-size:12px;color:var(--primary);font-weight:900;white-space:nowrap;max-width:none;text-align:right}.horizontalSalesChart .barTrack{height:18px;width:100%;max-width:none;border-radius:999px;background:rgba(255,255,255,.045);display:flex;align-items:stretch;overflow:hidden;border:1px solid rgba(255,255,255,.06)}.horizontalSalesChart .barFill{height:100%;min-height:0;border-radius:999px;background:linear-gradient(90deg,var(--primary),color-mix(in srgb,var(--primary) 45%,var(--surface)));box-shadow:0 0 18px rgba(var(--primary-rgb),.2)}.horizontalSalesChart .barLabel{font-size:11px;color:var(--muted);font-weight:800}.flowGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.flowCard{padding:17px;border-radius:16px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025)}.flowIcon{font-size:18px}.flowLabel{font-size:11px;color:var(--muted);margin-top:9px}.flowValue{font-size:27px;font-weight:900;margin-top:2px}.flowCard.pending{border-color:rgba(251,191,36,.18)}.flowCard.warning{border-color:rgba(249,115,22,.18)}.flowCard.info{border-color:rgba(59,130,246,.18)}.flowCard.success{border-color:rgba(34,197,94,.18)}.wideBtn{width:100%;margin-top:14px;padding:12px;background:rgba(var(--primary-rgb),.09);color:var(--primary);border:1px solid rgba(var(--primary-rgb),.2)}.listScroll{max-height:330px;overflow:auto;padding-right:3px}.orderRow,.reservationRow,.rankRow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.06)}.orderRow:last-child,.reservationRow:last-child,.rankRow:last-child{border-bottom:0}.orderRow strong,.reservationRow strong,.rankRow strong{font-size:12px}.orderRow small,.reservationRow small,.rankName small{display:block;color:var(--muted);font-size:10px;margin-top:4px}.orderRight{display:flex;align-items:flex-end;flex-direction:column;gap:5px}.badge{padding:5px 8px;border-radius:999px;font-size:9px;font-weight:800;border:1px solid transparent;text-transform:capitalize}.badge.success{color:var(--success);background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.18)}.badge.info{color:var(--info);background:rgba(59,130,246,.1);border-color:rgba(59,130,246,.18)}.badge.warning,.badge.pending{color:var(--warning);background:rgba(251,191,36,.1);border-color:rgba(251,191,36,.18)}.badge.danger{color:var(--danger);background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.18)}.rankRow{justify-content:flex-start}.rank{width:28px;height:28px;border-radius:9px;background:rgba(var(--primary-rgb),.1);color:var(--primary);display:grid;place-items:center;font-weight:900;font-size:11px;flex:0 0 auto}.rankName{flex:1}.amount{margin-left:auto;color:var(--primary)}.quickGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.quickAction{border:1px solid rgba(var(--primary-rgb),.12);background:rgba(255,255,255,.025);color:var(--text);padding:16px 10px;display:flex;flex-direction:column;align-items:center;gap:8px;font-size:11px}.quickAction:hover{background:rgba(var(--primary-rgb),.08);transform:translateY(-2px)}.quickAction span:first-child{font-size:20px}.spotlight{display:grid;grid-template-columns:130px 1fr;gap:16px;align-items:center}.spotlight img{width:130px;height:115px;object-fit:cover;border-radius:18px;border:1px solid rgba(var(--primary-rgb),.18);background:var(--surface)}.spotlight strong{display:block;font-size:17px}.spotlight span{display:block;color:var(--muted);font-size:11px;margin:7px 0}.spotlight b{color:var(--primary);font-size:18px}.menuPanel{margin-bottom:18px}.categoryGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.categoryCard{padding:16px;border-radius:17px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07)}.categoryTop{display:flex;justify-content:space-between;align-items:center}.categoryTop strong{display:block;font-size:14px}.categoryTop span{display:block;color:var(--muted);font-size:10px;margin-top:4px}.categoryItems{margin-top:12px}.miniItem{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-top:1px solid rgba(255,255,255,.05)}.miniItem strong{font-size:11px}.miniItem span{display:block;color:var(--primary);font-size:10px;margin-top:3px}.deleteIcon{border:0;background:transparent;color:var(--danger);cursor:pointer;font-size:12px}.dangerZone{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 20px;border-radius:18px;background:rgba(127,29,29,.1);border:1px solid rgba(239,68,68,.2);margin-bottom:30px}.dangerZone strong{display:block}.dangerZone span{display:block;color:var(--muted);font-size:11px;margin-top:4px}.dangerZone button{border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.14);color:var(--danger);padding:10px 14px;border-radius:10px;cursor:pointer;font-weight:800}.emptyState{padding:30px 10px;text-align:center;color:var(--muted);font-size:12px}

        .salesTodayRow{display:grid;grid-template-columns:55px minmax(0,1fr) auto;align-items:center;gap:12px;margin:8px 0 24px;padding:4px 2px}.salesTodayRow>span{font-size:11px;font-weight:800;color:var(--muted)}.salesTodayRow>strong{font-size:14px;color:var(--primary);white-space:nowrap}.salesTodayTrack{height:16px;border-radius:999px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.06);overflow:hidden}.salesTodayFill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--primary),color-mix(in srgb,var(--primary) 45%,var(--surface)));box-shadow:0 0 18px rgba(var(--primary-rgb),.18)}.salesInsightHeader{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);margin-bottom:12px}.salesInsightHeader strong{display:block;font-size:12px}.salesInsightHeader span{display:block;color:var(--muted);font-size:10px;margin-top:4px}.salesInsightTotal{display:flex;align-items:baseline;gap:5px}.salesInsightTotal b{font-size:22px;color:var(--text)}.salesInsightTotal small{font-size:10px;color:var(--muted)}.salesMixGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.salesMixCard{padding:13px 14px;border-radius:15px;background:rgba(255,255,255,.018);border:1px solid rgba(255,255,255,.06)}.salesMixTop{display:flex;justify-content:space-between;gap:8px;align-items:center}.salesMixTop span{font-size:11px;font-weight:800;text-transform:capitalize}.salesMixTop b{font-size:12px;color:var(--primary);white-space:nowrap}.salesMixBar{height:6px;margin:9px 0 6px;border-radius:999px;background:rgba(255,255,255,.05);overflow:hidden}.salesMixBar i{display:block;height:100%;border-radius:999px;background:var(--primary)}.salesMixCard small{font-size:9px;color:var(--muted)}
        @media(max-width:1250px){.statsGrid{grid-template-columns:repeat(3,1fr)}.threeGrid{grid-template-columns:1fr 1fr}.threeGrid>.panel:last-child{grid-column:1/-1}.categoryGrid{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:900px){.dashboardPage{padding:16px}.heroCard{flex-direction:column}.heroSide{align-items:flex-start}.roleText,.heroDate{text-align:left}.mainGrid,.twoGrid{grid-template-columns:1fr}.threeGrid{grid-template-columns:1fr}.quickGrid{grid-template-columns:repeat(4,1fr)}}
        @media(max-width:768px){.salesTodayRow{grid-template-columns:42px minmax(0,1fr) auto;gap:8px}.salesMixGrid{grid-template-columns:1fr 1fr}.salesInsightHeader{padding:12px}.salesSummary{grid-template-columns:1fr 1fr}.salesMetric{padding:12px}.salesMetric strong{font-size:20px}.horizontalSalesChart .barCol{grid-template-columns:48px minmax(0,1fr) auto}.horizontalSalesChart .barValue{font-size:10px}.statsGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px} .statCard{min-width:0}.statValue{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.statCard{padding:14px}.statValue{font-size:22px}.heroCard{padding:22px;border-radius:22px}.heroCard h1{font-size:30px}.panel{padding:16px;border-radius:18px}.quickGrid{grid-template-columns:repeat(2,1fr)}.categoryGrid{grid-template-columns:1fr}.chartArea{gap:7px}.barValue{font-size:8px}.dangerZone{align-items:flex-start;flex-direction:column}}
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
