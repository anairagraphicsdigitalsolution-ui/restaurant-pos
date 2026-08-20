"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

const TABS = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "tables", label: "Tables", icon: "🪑" },
  { id: "billing", label: "Billing", icon: "🧾" },
  { id: "kitchen", label: "KOT / KDS", icon: "👨‍🍳" },
  { id: "delivery", label: "Delivery", icon: "🛵" },
  { id: "reservations", label: "Reservations", icon: "📅" },
  { id: "captain", label: "Captain", icon: "📱" },
  { id: "qr", label: "QR / Scan", icon: "📲" },
  { id: "kiosk", label: "Kiosk", icon: "🖥️" },
  { id: "display", label: "Display", icon: "📺" },
  { id: "customers", label: "CRM", icon: "👥" },
  { id: "reports", label: "Reports", icon: "📈" },
  { id: "settings", label: "Settings", icon: "⚙️" },
]

const emptyStats = {
  tables: 0,
  occupied: 0,
  orders: 0,
  pendingOrders: 0,
  deliveries: 0,
  reservations: 0,
  customers: 0,
  revenue: 0,
}

function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`
}

function safeRows(value) {
  return Array.isArray(value) ? value : []
}

function Card({ title, value, subtitle, icon }) {
  return (
    <div className="suite-card">
      <div className="suite-icon">{icon}</div>
      <div className="suite-card-title">{title}</div>
      <div className="suite-card-value">{value}</div>
      {subtitle ? <div className="suite-card-subtitle">{subtitle}</div> : null}
    </div>
  )
}

function Section({ title, subtitle, children, action }) {
  return (
    <section className="suite-section">
      <div className="suite-section-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {action || null}
      </div>
      {children}
    </section>
  )
}

function EmptyState({ icon = "📭", title, text }) {
  return (
    <div className="suite-empty">
      <div className="suite-empty-icon">{icon}</div>
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  )
}

export default function RestaurantParityPage() {
  const [activeTab, setActiveTab] = useState("overview")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [restaurantId, setRestaurantId] = useState(null)

  const [stats, setStats] = useState(emptyStats)
  const [tables, setTables] = useState([])
  const [orders, setOrders] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [reservations, setReservations] = useState([])
  const [customers, setCustomers] = useState([])
  const [stations, setStations] = useState([])
  const [riders, setRiders] = useState([])
  const [reports, setReports] = useState([])
  const [plugins, setPlugins] = useState([])

  const [search, setSearch] = useState("")

  const getRestaurantId = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw new Error("Please sign in again.")
    }

    const { data, error: restaurantError } = await supabase
      .from("restaurant_users")
      .select("restaurant_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    if (restaurantError) {
      throw restaurantError
    }

    if (!data?.restaurant_id) {
      throw new Error("No restaurant is linked with this account.")
    }

    return data.restaurant_id
  }, [])

  const loadData = useCallback(
    async (silent = false) => {
      try {
        if (silent) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        setError("")

        const rid = restaurantId || (await getRestaurantId())

        if (!restaurantId) {
          setRestaurantId(rid)
        }

        const today = new Date()
        const start = new Date(today)
        start.setHours(0, 0, 0, 0)

        const startIso = start.toISOString()

        const [
          tablesResult,
          ordersResult,
          deliveriesResult,
          reservationsResult,
          customersResult,
          stationsResult,
          ridersResult,
          reportsResult,
          pluginsResult,
        ] = await Promise.all([
          supabase
            .from("restaurant_tables")
            .select("*")
            .eq("restaurant_id", rid)
            .order("name", { ascending: true })
            .limit(200),

          supabase
            .from("orders")
            .select("*")
            .eq("restaurant_id", rid)
            .gte("created_at", startIso)
            .order("created_at", { ascending: false })
            .limit(100),

          supabase
            .from("restaurant_delivery_orders")
            .select("*")
            .eq("restaurant_id", rid)
            .order("created_at", { ascending: false })
            .limit(100),

          supabase
            .from("reservations")
            .select("*")
            .eq("restaurant_id", rid)
            .order("created_at", { ascending: false })
            .limit(100),

          supabase
            .from("customers")
            .select("*")
            .eq("restaurant_id", rid)
            .order("created_at", { ascending: false })
            .limit(100),

          supabase
            .from("restaurant_kitchen_stations")
            .select("*")
            .eq("restaurant_id", rid)
            .order("name", { ascending: true }),

          supabase
            .from("restaurant_delivery_riders")
            .select("*")
            .eq("restaurant_id", rid)
            .order("name", { ascending: true }),

          supabase
            .from("report_definitions")
            .select("*")
            .eq("restaurant_id", rid)
            .order("created_at", { ascending: false })
            .limit(100),

          supabase
            .from("restaurant_plugins")
            .select("*")
            .eq("restaurant_id", rid)
            .order("plugin_code", { ascending: true }),
        ])

        const resultErrors = [
          tablesResult.error,
          ordersResult.error,
          deliveriesResult.error,
          reservationsResult.error,
          customersResult.error,
          stationsResult.error,
          ridersResult.error,
          reportsResult.error,
          pluginsResult.error,
        ].filter(Boolean)

        /*
         * Some projects may not have every optional parity table yet.
         * We do not crash the whole dashboard when an optional module
         * is missing. Core data is still displayed.
         */
        const optionalTableErrors = resultErrors.filter(
          (item) =>
            !String(item?.message || "")
              .toLowerCase()
              .includes("does not exist")
        )

        if (optionalTableErrors.length > 0) {
          console.warn("Restaurant Suite data warnings:", optionalTableErrors)
        }

        const nextTables = safeRows(tablesResult.data)
        const nextOrders = safeRows(ordersResult.data)
        const nextDeliveries = safeRows(deliveriesResult.data)
        const nextReservations = safeRows(reservationsResult.data)
        const nextCustomers = safeRows(customersResult.data)
        const nextStations = safeRows(stationsResult.data)
        const nextRiders = safeRows(ridersResult.data)
        const nextReports = safeRows(reportsResult.data)
        const nextPlugins = safeRows(pluginsResult.data)

        setTables(nextTables)
        setOrders(nextOrders)
        setDeliveries(nextDeliveries)
        setReservations(nextReservations)
        setCustomers(nextCustomers)
        setStations(nextStations)
        setRiders(nextRiders)
        setReports(nextReports)
        setPlugins(nextPlugins)

        const revenue = nextOrders.reduce((sum, order) => {
          const status = String(order.status || "").toLowerCase()

          if (
            status === "cancelled" ||
            status === "canceled" ||
            status === "void"
          ) {
            return sum
          }

          return (
            sum +
            Number(
              order.total_amount ??
                order.grand_total ??
                order.total ??
                order.amount ??
                0
            )
          )
        }, 0)

        const occupied = nextTables.filter((table) => {
          const status = String(table.status || "").toLowerCase()
          return ["occupied", "running", "active"].includes(status)
        }).length

        const pendingOrders = nextOrders.filter((order) => {
          const status = String(order.status || "").toLowerCase()
          return !["completed", "delivered", "cancelled", "canceled", "void"].includes(
            status
          )
        }).length

        setStats({
          tables: nextTables.length,
          occupied,
          orders: nextOrders.length,
          pendingOrders,
          deliveries: nextDeliveries.length,
          reservations: nextReservations.length,
          customers: nextCustomers.length,
          revenue,
        })
      } catch (loadError) {
        console.error(loadError)
        setError(loadError?.message || "Unable to load Restaurant Suite.")
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [getRestaurantId, restaurantId]
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) {
      return orders.slice(0, 20)
    }

    return orders
      .filter((order) =>
        JSON.stringify(order).toLowerCase().includes(query)
      )
      .slice(0, 20)
  }, [orders, search])

  const enabledPlugins = useMemo(
    () =>
      plugins.filter(
        (plugin) =>
          plugin.enabled === true ||
          plugin.active === true ||
          plugin.is_enabled === true
      ),
    [plugins]
  )

  async function updateTableStatus(table, status) {
    try {
      setError("")

      const { error: updateError } = await supabase
        .from("restaurant_tables")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", table.id)
        .eq("restaurant_id", restaurantId)

      if (updateError) {
        throw updateError
      }

      await loadData(true)
    } catch (updateError) {
      console.error(updateError)
      setError(updateError?.message || "Unable to update table.")
    }
  }

  async function updateDeliveryStatus(delivery, status) {
    try {
      setError("")

      const { error: updateError } = await supabase
        .from("restaurant_delivery_orders")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", delivery.id)
        .eq("restaurant_id", restaurantId)

      if (updateError) {
        throw updateError
      }

      await loadData(true)
    } catch (updateError) {
      console.error(updateError)
      setError(updateError?.message || "Unable to update delivery.")
    }
  }

  function renderOverview() {
    return (
      <>
        <div className="suite-grid">
          <Card
            title="Today's Sales"
            value={money(stats.revenue)}
            subtitle={`${stats.orders} orders today`}
            icon="₹"
          />

          <Card
            title="Today's Orders"
            value={stats.orders}
            subtitle={`${stats.pendingOrders} pending`}
            icon="🧾"
          />

          <Card
            title="Tables"
            value={stats.tables}
            subtitle={`${stats.occupied} occupied`}
            icon="🪑"
          />

          <Card
            title="Delivery"
            value={stats.deliveries}
            subtitle="delivery orders"
            icon="🛵"
          />

          <Card
            title="Reservations"
            value={stats.reservations}
            subtitle="active records"
            icon="📅"
          />

          <Card
            title="Customers"
            value={stats.customers}
            subtitle="customer records"
            icon="👥"
          />
        </div>

        <Section
          title="Live Operations"
          subtitle="Current restaurant activity"
          action={
            <button className="suite-button" onClick={() => loadData(true)}>
              {refreshing ? "Refreshing..." : "↻ Refresh"}
            </button>
          }
        >
          {filteredOrders.length === 0 ? (
            <EmptyState
              icon="🧾"
              title="No orders found"
              text="New orders will appear here automatically."
            />
          ) : (
            <div className="suite-list">
              {filteredOrders.map((order) => (
                <div className="suite-row" key={order.id}>
                  <div>
                    <strong>
                      Order #{String(order.id).slice(0, 8)}
                    </strong>
                    <span>
                      {order.order_type ||
                        order.channel ||
                        order.source ||
                        "POS"}
                    </span>
                  </div>

                  <div className="suite-row-right">
                    <strong>
                      {money(
                        order.total_amount ??
                          order.grand_total ??
                          order.total ??
                          order.amount
                      )}
                    </strong>
                    <span className="suite-badge">
                      {order.status || "pending"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </>
    )
  }

  function renderTables() {
    return (
      <Section
        title="Dine-in Tables"
        subtitle="Live table occupancy and service status"
      >
        {tables.length === 0 ? (
          <EmptyState
            icon="🪑"
            title="No tables configured"
            text="Create tables from your restaurant table management module."
          />
        ) : (
          <div className="table-grid">
            {tables.map((table) => {
              const status = String(table.status || "available").toLowerCase()

              return (
                <div className="table-card" key={table.id}>
                  <div className="table-number">
                    {table.name || table.table_number || `Table`}
                  </div>

                  <div className={`status-dot status-${status}`} />

                  <div className="table-status">
                    {table.status || "available"}
                  </div>

                  <div className="table-actions">
                    <button
                      className="mini-button"
                      onClick={() => updateTableStatus(table, "available")}
                    >
                      Free
                    </button>

                    <button
                      className="mini-button primary"
                      onClick={() => updateTableStatus(table, "occupied")}
                    >
                      Occupy
                    </button>

                    <button
                      className="mini-button"
                      onClick={() => updateTableStatus(table, "reserved")}
                    >
                      Reserve
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>
    )
  }

  function renderBilling() {
    return (
      <>
        <Section
          title="Billing Control"
          subtitle="Payments, split bills, discounts and audit workflow"
        >
          <div className="feature-grid">
            <div className="feature-card">
              <span>🧾</span>
              <strong>Split Bill</strong>
              <p>Split an order between multiple customers or payment methods.</p>
            </div>

            <div className="feature-card">
              <span>💳</span>
              <strong>Multiple Payments</strong>
              <p>Cash, UPI, card and other payment records can be tracked.</p>
            </div>

            <div className="feature-card">
              <span>🏷️</span>
              <strong>Discounts</strong>
              <p>Bill/item discount rules and approval workflow.</p>
            </div>

            <div className="feature-card">
              <span>↩️</span>
              <strong>Refund / Void</strong>
              <p>Keep refund and void activity auditable.</p>
            </div>
          </div>
        </Section>

        <Section title="Recent Orders" subtitle="Orders available for billing operations">
          {filteredOrders.length === 0 ? (
            <EmptyState
              icon="🧾"
              title="No orders"
              text="Orders will appear when billing activity is recorded."
            />
          ) : (
            <div className="suite-list">
              {filteredOrders.map((order) => (
                <div className="suite-row" key={order.id}>
                  <div>
                    <strong>#{String(order.id).slice(0, 8)}</strong>
                    <span>{order.status || "pending"}</span>
                  </div>

                  <strong>
                    {money(
                      order.total_amount ??
                        order.grand_total ??
                        order.total ??
                        order.amount
                    )}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </Section>
      </>
    )
  }

  function renderKitchen() {
    return (
      <>
        <Section title="Kitchen Stations" subtitle="KOT routing configuration">
          {stations.length === 0 ? (
            <EmptyState
              icon="👨‍🍳"
              title="No kitchen stations"
              text="Create kitchen stations from Operations."
            />
          ) : (
            <div className="feature-grid">
              {stations.map((station) => (
                <div className="feature-card" key={station.id}>
                  <span>🔥</span>
                  <strong>{station.name || "Kitchen Station"}</strong>
                  <p>
                    Status:{" "}
                    {station.active === false ? "Disabled" : "Active"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="KOT / KDS Workflow" subtitle="Production status pipeline">
          <div className="pipeline">
            {["New", "Accepted", "Preparing", "Ready", "Served"].map(
              (step) => (
                <div className="pipeline-step" key={step}>
                  <span>{step}</span>
                </div>
              )
            )}
          </div>
        </Section>
      </>
    )
  }

  function renderDelivery() {
    return (
      <>
        <Section title="Delivery Orders" subtitle="Rider and delivery workflow">
          {deliveries.length === 0 ? (
            <EmptyState
              icon="🛵"
              title="No delivery orders"
              text="Delivery orders will appear here."
            />
          ) : (
            <div className="suite-list">
              {deliveries.map((delivery) => (
                <div className="suite-row" key={delivery.id}>
                  <div>
                    <strong>
                      Delivery #{String(delivery.id).slice(0, 8)}
                    </strong>
                    <span>
                      {delivery.rider_id
                        ? "Rider assigned"
                        : "Rider pending"}
                    </span>
                  </div>

                  <div className="suite-row-right">
                    <span className="suite-badge">
                      {delivery.status || "pending"}
                    </span>

                    <button
                      className="mini-button primary"
                      onClick={() =>
                        updateDeliveryStatus(delivery, "out_for_delivery")
                      }
                    >
                      Out for delivery
                    </button>

                    <button
                      className="mini-button"
                      onClick={() =>
                        updateDeliveryStatus(delivery, "delivered")
                      }
                    >
                      Delivered
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Riders" subtitle="Delivery staff">
          {riders.length === 0 ? (
            <EmptyState
              icon="🛵"
              title="No riders"
              text="Add delivery riders from Operations."
            />
          ) : (
            <div className="feature-grid">
              {riders.map((rider) => (
                <div className="feature-card" key={rider.id}>
                  <span>🛵</span>
                  <strong>{rider.name || "Rider"}</strong>
                  <p>{rider.phone || rider.mobile || "No phone"}</p>
                </div>
              ))}
            </div>
          )}
        </Section>
      </>
    )
  }

  function renderReservations() {
    return (
      <Section
        title="Reservations"
        subtitle="Bookings, waitlist and table assignment"
      >
        {reservations.length === 0 ? (
          <EmptyState
            icon="📅"
            title="No reservations"
            text="Reservations will appear here."
          />
        ) : (
          <div className="suite-list">
            {reservations.map((reservation) => (
              <div className="suite-row" key={reservation.id}>
                <div>
                  <strong>
                    {reservation.customer_name ||
                      reservation.name ||
                      "Reservation"}
                  </strong>
                  <span>
                    {reservation.reservation_time ||
                      reservation.booking_time ||
                      reservation.created_at}
                  </span>
                </div>

                <span className="suite-badge">
                  {reservation.status || "pending"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    )
  }

  function renderCaptain() {
    return (
      <Section
        title="Captain / Waiter"
        subtitle="Table-side ordering workflow"
      >
        <div className="feature-grid">
          <div className="feature-card">
            <span>📱</span>
            <strong>Select Table</strong>
            <p>Captain selects a table and starts a running order.</p>
          </div>

          <div className="feature-card">
            <span>🍽️</span>
            <strong>Add Items</strong>
            <p>Variants, modifiers and special instructions.</p>
          </div>

          <div className="feature-card">
            <span>👨‍🍳</span>
            <strong>Send KOT</strong>
            <p>Items are routed to the appropriate kitchen station.</p>
          </div>

          <div className="feature-card">
            <span>💳</span>
            <strong>Close Table</strong>
            <p>Send the bill for payment and settlement.</p>
          </div>
        </div>
      </Section>
    )
  }

  function renderQr() {
    return (
      <Section title="QR / Scan & Order" subtitle="Customer self-order workflow">
        <div className="feature-grid">
          <div className="feature-card">
            <span>🔳</span>
            <strong>Table QR</strong>
            <p>QR identifies the restaurant table.</p>
          </div>

          <div className="feature-card">
            <span>🛒</span>
            <strong>Customer Cart</strong>
            <p>Customer selects items, variants and add-ons.</p>
          </div>

          <div className="feature-card">
            <span>📲</span>
            <strong>Order Confirmation</strong>
            <p>Customer order reaches POS and KOT workflow.</p>
          </div>

          <div className="feature-card">
            <span>💰</span>
            <strong>Scan & Pay</strong>
            <p>Payment request can be associated with the table.</p>
          </div>
        </div>
      </Section>
    )
  }

  function renderKiosk() {
    return (
      <Section title="Self-Service Kiosk" subtitle="Kiosk ordering workflow">
        <div className="feature-grid">
          {[
            ["🖥️", "Menu", "Customer browses the restaurant menu."],
            ["🛒", "Cart", "Variants and add-ons are supported."],
            ["💳", "Payment", "Payment can be completed at kiosk."],
            ["🎟️", "Token", "Successful orders receive a token."],
            ["👨‍🍳", "KOT", "Order goes into kitchen workflow."],
            ["↻", "Auto Reset", "Kiosk resets after completed session."],
          ].map(([icon, title, text]) => (
            <div className="feature-card" key={title}>
              <span>{icon}</span>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </Section>
    )
  }

  function renderDisplay() {
    return (
      <Section title="Digital Display" subtitle="Customer-facing display and token calling">
        <div className="feature-grid">
          <div className="feature-card">
            <span>📺</span>
            <strong>Menu Display</strong>
            <p>Promotional and menu playlists.</p>
          </div>

          <div className="feature-card">
            <span>🎟️</span>
            <strong>Token Display</strong>
            <p>Ready and called order tokens.</p>
          </div>

          <div className="feature-card">
            <span>🔊</span>
            <strong>Audio Calling</strong>
            <p>Customer token announcements.</p>
          </div>

          <div className="feature-card">
            <span>📢</span>
            <strong>Service Requests</strong>
            <p>Calling device requests for staff.</p>
          </div>
        </div>
      </Section>
    )
  }

  function renderCustomers() {
    const segments = {
      vip: 0,
      repeat: 0,
      new: 0,
    }

    customers.forEach((customer) => {
      const spend = Number(
        customer.total_spend ?? customer.lifetime_value ?? 0
      )

      const visits = Number(
        customer.visit_count ?? customer.total_orders ?? 0
      )

      if (spend >= 25000) {
        segments.vip += 1
      } else if (visits >= 3) {
        segments.repeat += 1
      } else {
        segments.new += 1
      }
    })

    return (
      <>
        <Section title="Customer Segments" subtitle="Basic CRM segmentation">
          <div className="suite-grid">
            <Card title="VIP" value={segments.vip} subtitle="₹25k+ spend" icon="⭐" />
            <Card title="Repeat" value={segments.repeat} subtitle="3+ visits/orders" icon="🔁" />
            <Card title="New" value={segments.new} subtitle="new customers" icon="🆕" />
          </div>
        </Section>

        <Section title="Customers" subtitle="Latest customer records">
          {customers.length === 0 ? (
            <EmptyState
              icon="👥"
              title="No customers"
              text="Customer records will appear here."
            />
          ) : (
            <div className="suite-list">
              {customers.slice(0, 25).map((customer) => (
                <div className="suite-row" key={customer.id}>
                  <div>
                    <strong>
                      {customer.name || customer.full_name || "Customer"}
                    </strong>
                    <span>{customer.phone || customer.mobile || ""}</span>
                  </div>
                  <span>
                    {money(
                      customer.total_spend ??
                        customer.lifetime_value ??
                        0
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </>
    )
  }

  function renderReports() {
    return (
      <Section title="Reports" subtitle="Saved and scheduled report definitions">
        {reports.length === 0 ? (
          <EmptyState
            icon="📈"
            title="No saved reports"
            text="Create report definitions from the Reports module."
          />
        ) : (
          <div className="feature-grid">
            {reports.map((report) => (
              <div className="feature-card" key={report.id}>
                <span>📊</span>
                <strong>
                  {report.name || report.title || "Report"}
                </strong>
                <p>
                  {report.schedule ||
                    report.frequency ||
                    "On demand"}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>
    )
  }

  function renderSettings() {
    return (
      <>
        <Section
          title="Plugin Controls"
          subtitle="Features enabled for this restaurant"
        >
          {enabledPlugins.length === 0 ? (
            <EmptyState
              icon="🔌"
              title="No enabled plugin records"
              text="Plugin state is controlled from Super Admin."
            />
          ) : (
            <div className="feature-grid">
              {enabledPlugins.map((plugin) => (
                <div className="feature-card" key={plugin.id}>
                  <span>🔌</span>
                  <strong>
                    {plugin.plugin_code ||
                      plugin.code ||
                      plugin.name ||
                      "Plugin"}
                  </strong>
                  <p>Enabled</p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Operations Modules" subtitle="Current implementation scope">
          <div className="feature-grid">
            {TABS.filter((tab) => tab.id !== "settings").map((tab) => (
              <button
                type="button"
                className="feature-card feature-card-button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.icon}</span>
                <strong>{tab.label}</strong>
                <p>Open module</p>
              </button>
            ))}
          </div>
        </Section>
      </>
    )
  }

  function renderActiveTab() {
    switch (activeTab) {
      case "tables":
        return renderTables()
      case "billing":
        return renderBilling()
      case "kitchen":
        return renderKitchen()
      case "delivery":
        return renderDelivery()
      case "reservations":
        return renderReservations()
      case "captain":
        return renderCaptain()
      case "qr":
        return renderQr()
      case "kiosk":
        return renderKiosk()
      case "display":
        return renderDisplay()
      case "customers":
        return renderCustomers()
      case "reports":
        return renderReports()
      case "settings":
        return renderSettings()
      case "overview":
      default:
        return renderOverview()
    }
  }

  return (
    <main className="restaurant-suite-page">
      <style jsx global>{`
        :root {
          --suite-bg: var(--background, #06130f);
          --suite-surface: var(--surface, #0d241c);
          --suite-surface-2: var(--surface-2, #143126);
          --suite-text: var(--text, #f5f0df);
          --suite-muted: var(--muted, #a9b9af);
          --suite-border: var(--border, rgba(220, 180, 65, 0.25));
          --suite-primary: var(--primary, #e0ad35);
          --suite-success: var(--success, #35d477);
          --suite-danger: var(--danger, #e35d5d);
        }

        * {
          box-sizing: border-box;
        }

        .restaurant-suite-page {
          min-height: 100vh;
          padding: 28px;
          color: var(--suite-text);
          background:
            radial-gradient(
              circle at top right,
              rgba(224, 173, 53, 0.08),
              transparent 30%
            ),
            var(--suite-bg);
        }

        .suite-header {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: flex-start;
          margin-bottom: 24px;
        }

        .suite-kicker {
          color: var(--suite-primary);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .suite-header h1 {
          margin: 6px 0;
          font-size: clamp(30px, 5vw, 52px);
          line-height: 1;
        }

        .suite-header p {
          margin: 0;
          color: var(--suite-muted);
        }

        .suite-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .suite-button,
        .mini-button {
          border: 1px solid var(--suite-border);
          border-radius: 12px;
          padding: 10px 14px;
          background: var(--suite-surface);
          color: var(--suite-text);
          cursor: pointer;
          font-weight: 700;
        }

        .suite-button:hover,
        .mini-button:hover {
          border-color: var(--suite-primary);
        }

        .mini-button.primary {
          background: var(--suite-primary);
          color: #171006;
          border-color: var(--suite-primary);
        }

        .suite-tabs {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 8px;
          margin-bottom: 24px;
          border: 1px solid var(--suite-border);
          border-radius: 18px;
          background: rgba(13, 36, 28, 0.72);
          scrollbar-width: thin;
        }

        .suite-tab {
          flex: 0 0 auto;
          border: 0;
          border-radius: 12px;
          padding: 11px 15px;
          color: var(--suite-muted);
          background: transparent;
          cursor: pointer;
          font-weight: 700;
        }

        .suite-tab.active {
          color: #171006;
          background: var(--suite-primary);
        }

        .suite-error {
          margin-bottom: 18px;
          padding: 13px 16px;
          border: 1px solid rgba(227, 93, 93, 0.45);
          border-radius: 14px;
          color: #ffd9d9;
          background: rgba(227, 93, 93, 0.1);
        }

        .suite-loading {
          min-height: 300px;
          display: grid;
          place-items: center;
          color: var(--suite-muted);
        }

        .suite-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 20px;
        }

        .suite-card,
        .suite-section,
        .feature-card,
        .table-card {
          border: 1px solid var(--suite-border);
          background: linear-gradient(
            145deg,
            rgba(20, 49, 38, 0.94),
            rgba(8, 28, 21, 0.94)
          );
          box-shadow: 0 12px 35px rgba(0, 0, 0, 0.12);
        }

        .suite-card {
          min-height: 150px;
          padding: 20px;
          border-radius: 20px;
        }

        .suite-icon {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          margin-bottom: 16px;
          border-radius: 13px;
          color: var(--suite-primary);
          background: rgba(224, 173, 53, 0.12);
          font-size: 21px;
        }

        .suite-card-title {
          color: var(--suite-muted);
          font-size: 14px;
        }

        .suite-card-value {
          margin-top: 3px;
          font-size: 30px;
          font-weight: 800;
        }

        .suite-card-subtitle {
          margin-top: 4px;
          color: var(--suite-muted);
          font-size: 13px;
        }

        .suite-section {
          margin-bottom: 20px;
          padding: 20px;
          border-radius: 22px;
        }

        .suite-section-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 15px;
          margin-bottom: 18px;
        }

        .suite-section-head h2 {
          margin: 0;
          font-size: 24px;
        }

        .suite-section-head p {
          margin: 5px 0 0;
          color: var(--suite-muted);
        }

        .suite-list {
          display: grid;
        }

        .suite-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 16px 4px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
        }

        .suite-row:last-child {
          border-bottom: 0;
        }

        .suite-row > div:first-child {
          min-width: 0;
        }

        .suite-row strong {
          display: block;
        }

        .suite-row span {
          display: block;
          margin-top: 4px;
          color: var(--suite-muted);
          font-size: 13px;
        }

        .suite-row-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .suite-badge {
          display: inline-block !important;
          margin: 0 !important;
          padding: 6px 10px;
          border: 1px solid rgba(53, 212, 119, 0.25);
          border-radius: 999px;
          color: var(--suite-success) !important;
          background: rgba(53, 212, 119, 0.08);
          font-size: 12px !important;
          font-weight: 700;
        }

        .table-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .table-card {
          position: relative;
          min-height: 160px;
          padding: 18px;
          border-radius: 18px;
        }

        .table-number {
          font-size: 22px;
          font-weight: 800;
        }

        .status-dot {
          width: 11px;
          height: 11px;
          margin-top: 15px;
          border-radius: 50%;
          background: var(--suite-success);
          box-shadow: 0 0 12px currentColor;
        }

        .status-occupied,
        .status-running {
          background: var(--suite-danger);
        }

        .status-reserved {
          background: var(--suite-primary);
        }

        .table-status {
          margin-top: 8px;
          color: var(--suite-muted);
          text-transform: capitalize;
        }

        .table-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 15px;
        }

        .feature-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .feature-card {
          min-height: 145px;
          padding: 18px;
          border-radius: 18px;
        }

        .feature-card > span {
          display: block;
          margin-bottom: 12px;
          font-size: 25px;
        }

        .feature-card strong {
          display: block;
          font-size: 17px;
        }

        .feature-card p {
          margin: 7px 0 0;
          color: var(--suite-muted);
          line-height: 1.5;
        }

        .feature-card-button {
          width: 100%;
          text-align: left;
          color: var(--suite-text);
          cursor: pointer;
        }

        .pipeline {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
        }

        .pipeline-step {
          padding: 16px;
          text-align: center;
          border: 1px solid var(--suite-border);
          border-radius: 14px;
          background: rgba(224, 173, 53, 0.06);
          color: var(--suite-primary);
          font-weight: 800;
        }

        .suite-empty {
          min-height: 180px;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 7px;
          color: var(--suite-muted);
          text-align: center;
        }

        .suite-empty strong {
          color: var(--suite-text);
          font-size: 17px;
        }

        .suite-empty-icon {
          font-size: 34px;
        }

        @media (max-width: 900px) {
          .suite-grid,
          .feature-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .table-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 650px) {
          .restaurant-suite-page {
            padding: 15px;
          }

          .suite-header {
            flex-direction: column;
          }

          .suite-grid,
          .feature-grid,
          .table-grid,
          .pipeline {
            grid-template-columns: 1fr;
          }

          .suite-section {
            padding: 15px;
            border-radius: 18px;
          }

          .suite-section-head {
            flex-direction: column;
          }

          .suite-row {
            align-items: flex-start;
            flex-direction: column;
          }

          .suite-row-right {
            justify-content: flex-start;
          }
        }
      `}</style>

      <header className="suite-header">
        <div>
          <div className="suite-kicker">Restaurant Operations</div>
          <h1>Petpooja Operations Hub</h1>
          <p>
            Billing, tables, KOT, delivery, QR, kiosk, CRM and reporting.
          </p>
        </div>

        <div className="suite-actions">
          <button
            type="button"
            className="suite-button"
            onClick={() => loadData(true)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>
      </header>

      <nav className="suite-tabs">
        {TABS.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={`suite-tab ${
              activeTab === tab.id ? "active" : ""
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </nav>

      {error ? <div className="suite-error">⚠️ {error}</div> : null}

      {loading ? (
        <div className="suite-loading">
          <div>Loading Restaurant Operations...</div>
        </div>
      ) : (
        <>
          {activeTab !== "overview" ? (
            <div
              style={{
                marginBottom: 18,
                color: "var(--suite-muted)",
                fontSize: 13,
              }}
            >
              Restaurant ID: {restaurantId || "Connected"}
            </div>
          ) : null}

          {renderActiveTab()}
        </>
      )}
    </main>
  )
}