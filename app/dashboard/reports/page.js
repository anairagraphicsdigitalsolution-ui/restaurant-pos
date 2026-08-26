"use client"
import { formatIndiaDate, formatIndiaTime } from "@/lib/indiaTime"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`

const shortMoney = (n) => {
  const value = Number(n || 0)

  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`

  return money(value)
}

const normalize = (value) => String(value || "").toLowerCase().trim()

const formatDate = (date) =>
  formatIndiaDate(date, { month: "short" })

const formatTime = (date) =>
  formatIndiaTime(date)

export default function Reports() {
  const [orders, setOrders] = useState([])
  const [expenses, setExpenses] = useState([])
  const [cashClosings, setCashClosings] = useState([])
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false

    async function loadReport() {
      setLoading(true)
      setError("")

      try {
        const { data: authData, error: authError } =
          await supabase.auth.getUser()

        if (authError) throw authError

        const user = authData?.user

        if (!user) {
          if (!cancelled) {
            setOrders([])
            setExpenses([])
            setCashClosings([])
            setLoading(false)
          }
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("restaurant_id")
          .eq("id", user.id)
          .single()

        if (profileError) throw profileError

        if (!profile?.restaurant_id) {
          if (!cancelled) {
            setOrders([])
            setExpenses([])
            setCashClosings([])
            setLoading(false)
          }
          return
        }

        const sinceDate = new Date(
          Date.now() - days * 24 * 60 * 60 * 1000
        )

        const since = sinceDate.toISOString()
        const sinceDay = since.slice(0, 10)

        const [ordersResult, expensesResult, cashClosingResult] = await Promise.all([
          supabase
            .from("orders")
            .select(
              "id,created_at,status,total_amount,payment_status"
            )
            .eq("restaurant_id", profile.restaurant_id)
            .gte("created_at", since)
            .order("created_at", { ascending: true }),

          supabase
            .from("expenses")
            .select("amount,expense_date")
            .eq("restaurant_id", profile.restaurant_id)
            .gte("expense_date", sinceDay)
            .order("expense_date", { ascending: true }),

          supabase
            .from("cash_closings")
            .select("id,business_date,opening_cash,cash_sales,cash_in,cash_out,expense_cash,refunds,expected_cash,actual_cash,difference,closed_at")
            .eq("restaurant_id", profile.restaurant_id)
            .gte("business_date", sinceDay)
            .order("business_date", { ascending: false }),
        ])

        if (ordersResult.error) throw ordersResult.error
        if (expensesResult.error) throw expensesResult.error
        if (cashClosingResult.error) throw cashClosingResult.error

        if (!cancelled) {
          setOrders(ordersResult.data || [])
          setExpenses(expensesResult.data || [])
          setCashClosings(cashClosingResult.data || [])
          setLoading(false)
        }
      } catch (err) {
        console.error("REPORTS LOAD ERROR:", err)

        if (!cancelled) {
          setError(
            err?.message ||
              "Unable to load reports right now."
          )
          setOrders([])
          setExpenses([])
          setLoading(false)
        }
      }
    }

    loadReport()

    return () => {
      cancelled = true
    }
  }, [days])

  const validOrders = useMemo(() => {
    return orders.filter((order) => {
      const status = normalize(order.status)

      return !["cancelled", "void", "deleted"].includes(status)
    })
  }, [orders])

  const revenue = useMemo(() => {
    return validOrders.reduce(
      (sum, order) => sum + Number(order.total_amount || 0),
      0
    )
  }, [validOrders])

  const expense = useMemo(() => {
    return expenses.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    )
  }, [expenses])

  const contribution = revenue - expense

  const averageOrderValue = validOrders.length
    ? revenue / validOrders.length
    : 0

  const paidOrders = validOrders.filter(
    (order) => normalize(order.payment_status) === "paid"
  ).length

  const pendingPayments = validOrders.filter(
    (order) => normalize(order.payment_status) !== "paid"
  ).length

  const completedOrders = validOrders.filter(
    (order) =>
      ["completed", "complete", "delivered", "served"].includes(
        normalize(order.status)
      )
  ).length

  const cancelledOrders = orders.filter((order) =>
    ["cancelled", "void", "deleted"].includes(
      normalize(order.status)
    )
  ).length

  const pendingOrders = validOrders.filter((order) =>
    ["pending", "new", "accepted", "preparing", "ready"].includes(
      normalize(order.status)
    )
  ).length

  const chartData = useMemo(() => {
    const map = new Map()

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date()
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() - i)

      const key = date.toISOString().slice(0, 10)

      map.set(key, {
        date,
        revenue: 0,
        orders: 0,
      })
    }

    validOrders.forEach((order) => {
      const date = new Date(order.created_at)

      if (Number.isNaN(date.getTime())) return

      const key = date.toISOString().slice(0, 10)

      if (!map.has(key)) return

      const current = map.get(key)

      current.revenue += Number(order.total_amount || 0)
      current.orders += 1
    })

    const values = Array.from(map.values())

    /*
      For very large ranges, don't render hundreds of bars.
      We group the data visually while keeping totals correct.
    */
    if (days <= 31) {
      return values
    }

    const groupSize = days <= 90 ? 3 : 7
    const grouped = []

    for (let i = 0; i < values.length; i += groupSize) {
      const chunk = values.slice(i, i + groupSize)

      grouped.push({
        date: chunk[0]?.date || new Date(),
        revenue: chunk.reduce((sum, item) => sum + item.revenue, 0),
        orders: chunk.reduce((sum, item) => sum + item.orders, 0),
      })
    }

    return grouped
  }, [validOrders, days])

  const maxChartRevenue = Math.max(
    ...chartData.map((item) => item.revenue),
    1
  )

  const chartTotalOrders = chartData.reduce(
    (sum, item) => sum + item.orders,
    0
  )

  const latestOrders = useMemo(() => {
    return [...validOrders]
      .sort(
        (a, b) =>
          new Date(b.created_at) -
          new Date(a.created_at)
      )
      .slice(0, 5)
  }, [validOrders])

  const statusTotal =
    completedOrders + pendingOrders + cancelledOrders || 1

  const paidPercentage = validOrders.length
    ? Math.round((paidOrders / validOrders.length) * 100)
    : 0

  const paymentPendingPercentage = validOrders.length
    ? Math.round((pendingPayments / validOrders.length) * 100)
    : 0

  return (
    <div className="reports-page">
      <main className="reports-content">
        {/* HEADER */}
        <header className="reports-header">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-dot" />
              ANALYTICS
            </div>

            <h1>Reports & Analytics</h1>

            <p>
              Sales, profitability and operating performance
              at a glance.
            </p>
          </div>

          <div className="header-actions">
            <div className="range-label">
              Reporting period
            </div>

            <select
              className="range-select"
              value={days}
              onChange={(e) =>
                setDays(Number(e.target.value))
              }
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last 365 days</option>
            </select>
          </div>
        </header>

        {/* ERROR */}
        {error && (
          <div className="error-banner">
            <div className="error-icon">!</div>

            <div>
              <strong>Unable to load report</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* KPI CARDS */}
        <section className="kpi-grid">
          <div className="kpi-card revenue-card">
            <div className="kpi-top">
              <div className="kpi-icon">₹</div>
              <span className="kpi-tag positive">
                Revenue
              </span>
            </div>

            <div className="kpi-value">
              {money(revenue)}
            </div>

            <div className="kpi-footer">
              <span>
                {validOrders.length} valid orders
              </span>

              <span className="trend-up">
                ● Live data
              </span>
            </div>
          </div>

          <div className="kpi-card orders-card">
            <div className="kpi-top">
              <div className="kpi-icon">◉</div>
              <span className="kpi-tag blue">
                Orders
              </span>
            </div>

            <div className="kpi-value">
              {validOrders.length}
            </div>

            <div className="kpi-footer">
              <span>
                {completedOrders} completed
              </span>

              <span className="trend-neutral">
                {pendingOrders} pending
              </span>
            </div>
          </div>

          <div className="kpi-card average-card">
            <div className="kpi-top">
              <div className="kpi-icon">◌</div>
              <span className="kpi-tag gold">
                Avg. Order
              </span>
            </div>

            <div className="kpi-value">
              {money(averageOrderValue)}
            </div>

            <div className="kpi-footer">
              <span>
                Average bill value
              </span>

              <span className="trend-neutral">
                {validOrders.length
                  ? `${validOrders.length} bills`
                  : "No bills"}
              </span>
            </div>
          </div>

          <div className="kpi-card profit-card">
            <div className="kpi-top">
              <div className="kpi-icon">↗</div>
              <span className="kpi-tag green">
                Contribution
              </span>
            </div>

            <div className="kpi-value">
              {money(contribution)}
            </div>

            <div className="kpi-footer">
              <span>
                Revenue − expenses
              </span>

              <span
                className={
                  contribution >= 0
                    ? "trend-up"
                    : "trend-down"
                }
              >
                {contribution >= 0
                  ? "Positive"
                  : "Negative"}
              </span>
            </div>
          </div>
        </section>

        {/* DAILY CASH CLOSING */}
        <section className="cash-closing-report">
          <div className="panel">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">CASH CONTROL</span>
                <h2>Daily Cash Closing</h2>
                <p>India business-day closing history: opening cash, cash received, adjustments and final counted cash.</p>
              </div>
              <a className="report-link" href="/dashboard/restaurant-suite/operations">Open Operations Hub →</a>
            </div>
            {cashClosings.length === 0 ? (
              <div className="empty-chart">No cash closing recorded for this period.</div>
            ) : (
              <div className="cash-closing-table">
                <div className="cash-closing-row cash-closing-head">
                  <span>Date</span><span>Opening</span><span>Cash In</span><span>Cash Expenses</span><span>Expected</span><span>Actual</span><span>Difference</span>
                </div>
                {cashClosings.map((c) => (
                  <div className="cash-closing-row" key={c.id}>
                    <strong>{c.business_date}</strong>
                    <span>{money(c.opening_cash)}</span>
                    <span>{money(Number(c.cash_sales || 0) + Number(c.cash_in || 0))}</span>
                    <span>{money(c.expense_cash)}</span>
                    <span>{money(c.expected_cash)}</span>
                    <span>{money(c.actual_cash)}</span>
                    <strong className={Number(c.difference || 0) === 0 ? "cash-match" : "cash-difference"}>
                      {Number(c.difference || 0) === 0 ? "✓ Matched" : money(c.difference)}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* MAIN ANALYTICS */}
        <section className="analytics-grid">
          {/* REVENUE CHART */}
          <div className="panel revenue-panel">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">
                  PERFORMANCE
                </span>

                <h2>Revenue Overview</h2>

                <p>
                  Revenue generated during the selected
                  period.
                </p>
              </div>

              <div className="chart-total">
                <strong>{shortMoney(revenue)}</strong>
                <span>
                  {chartTotalOrders} orders
                </span>
              </div>
            </div>

            <div className="chart">
              {loading ? (
                <div className="chart-loading">
                  <div className="spinner" />
                  Loading revenue...
                </div>
              ) : chartData.length === 0 ? (
                <div className="empty-chart">
                  No revenue data for this period.
                </div>
              ) : (
                <>
                  <div className="chart-y">
                    <span>
                      {shortMoney(maxChartRevenue)}
                    </span>
                    <span>
                      {shortMoney(
                        maxChartRevenue * 0.5
                      )}
                    </span>
                    <span>₹0</span>
                  </div>

                  <div className="bars">
                    {chartData.map((item, index) => {
                      const height = Math.max(
                        (item.revenue /
                          maxChartRevenue) *
                          100,
                        item.revenue > 0 ? 4 : 0
                      )

                      const showLabel =
                        days <= 31 ||
                        index === 0 ||
                        index === chartData.length - 1 ||
                        index %
                          Math.max(
                            Math.ceil(
                              chartData.length / 6
                            ),
                            1
                          ) ===
                          0

                      return (
                        <div
                          className="bar-column"
                          key={`${item.date.toISOString()}-${index}`}
                        >
                          <div className="bar-value">
                            {item.revenue > 0
                              ? shortMoney(
                                  item.revenue
                                )
                              : ""}
                          </div>

                          <div className="bar-track">
                            <div
                              className="bar"
                              style={{
                                height: `${height}%`,
                              }}
                              title={`${formatDate(
                                item.date
                              )} • ${money(
                                item.revenue
                              )} • ${
                                item.orders
                              } orders`}
                            />
                          </div>

                          <span className="bar-label">
                            {showLabel
                              ? formatDate(item.date)
                              : ""}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ORDER STATUS */}
          <div className="panel status-panel">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">
                  OPERATIONS
                </span>

                <h2>Order Status</h2>

                <p>
                  Current order distribution.
                </p>
              </div>
            </div>

            <div className="status-content">
              <div
                className="status-ring"
                style={{
                  "--completed-angle": `${(completedOrders / statusTotal) * 360}deg`,
                  "--pending-angle": `${((completedOrders + pendingOrders) / statusTotal) * 360}deg`,
                }}
              >
                <div className="ring-inner">
                  <strong>
                    {validOrders.length}
                  </strong>
                  <span>Orders</span>
                </div>
              </div>

              <div className="status-list">
                <div className="status-row">
                  <div>
                    <span className="status-dot completed" />
                    Completed
                  </div>

                  <strong>
                    {completedOrders}
                  </strong>
                </div>

                <div className="status-row">
                  <div>
                    <span className="status-dot pending" />
                    Pending
                  </div>

                  <strong>
                    {pendingOrders}
                  </strong>
                </div>

                <div className="status-row">
                  <div>
                    <span className="status-dot cancelled" />
                    Cancelled
                  </div>

                  <strong>
                    {cancelledOrders}
                  </strong>
                </div>
              </div>
            </div>

            <div className="status-progress">
              <span
                style={{
                  width: `${Math.min(
                    100,
                    (completedOrders /
                      statusTotal) *
                      100
                  )}%`,
                }}
              />
            </div>

            <div className="status-caption">
              <span>
                {validOrders.length
                  ? Math.round(
                      (completedOrders /
                        validOrders.length) *
                        100
                    )
                  : 0}
                % completion rate
              </span>

              <span>
                {cancelledOrders} cancelled
              </span>
            </div>
          </div>
        </section>

        {/* SECOND ROW */}
        <section className="bottom-grid">
          {/* PERFORMANCE SUMMARY */}
          <div className="panel">
            <div className="panel-heading compact">
              <div>
                <span className="panel-kicker">
                  FINANCIAL HEALTH
                </span>

                <h2>Performance Summary</h2>
              </div>
            </div>

            <div className="summary-list">
              <div className="summary-item">
                <div className="summary-icon gold">
                  ₹
                </div>

                <div>
                  <span>
                    Average Order Value
                  </span>

                  <small>
                    Revenue per valid order
                  </small>
                </div>

                <strong>
                  {money(averageOrderValue)}
                </strong>
              </div>

              <div className="summary-item">
                <div className="summary-icon green">
                  ✓
                </div>

                <div>
                  <span>Paid Orders</span>

                  <small>
                    Successfully paid orders
                  </small>
                </div>

                <strong>{paidOrders}</strong>
              </div>

              <div className="summary-item">
                <div className="summary-icon orange">
                  !
                </div>

                <div>
                  <span>Pending Payments</span>

                  <small>
                    Orders awaiting payment
                  </small>
                </div>

                <strong>{pendingPayments}</strong>
              </div>

              <div className="summary-item">
                <div className="summary-icon blue">
                  %
                </div>

                <div>
                  <span>Payment Collection</span>

                  <small>
                    Paid vs total valid orders
                  </small>
                </div>

                <strong>{paidPercentage}%</strong>
              </div>
            </div>
          </div>

          {/* EXPENSES */}
          <div className="panel">
            <div className="panel-heading compact">
              <div>
                <span className="panel-kicker">
                  COST CONTROL
                </span>

                <h2>Expenses & Contribution</h2>
              </div>
            </div>

            <div className="expense-main">
              <div>
                <span>Total Expenses</span>

                <strong>
                  {money(expense)}
                </strong>

                <small>
                  Recorded during this period
                </small>
              </div>

              <div className="expense-percent">
                <strong>
                  {revenue > 0
                    ? Math.round(
                        (expense / revenue) *
                          100
                      )
                    : 0}
                  %
                </strong>

                <span>of revenue</span>
              </div>
            </div>

            <div className="expense-track">
              <span
                style={{
                  width: `${Math.min(
                    100,
                    revenue > 0
                      ? (expense / revenue) *
                          100
                      : 0
                  )}%`,
                }}
              />
            </div>

            <div className="contribution-box">
              <div>
                <span>Operating Contribution</span>
                <small>
                  Revenue after recorded expenses
                </small>
              </div>

              <strong
                className={
                  contribution >= 0
                    ? "positive-text"
                    : "negative-text"
                }
              >
                {money(contribution)}
              </strong>
            </div>
          </div>
        </section>

        {/* RECENT ORDERS + PAYMENT */}
        <section className="bottom-grid">
          {/* RECENT ORDERS */}
          <div className="panel">
            <div className="panel-heading compact">
              <div>
                <span className="panel-kicker">
                  ACTIVITY
                </span>

                <h2>Recent Orders</h2>

                <p>
                  Latest valid orders in the selected
                  period.
                </p>
              </div>
            </div>

            {latestOrders.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  ◉
                </div>

                <strong>
                  No orders found
                </strong>

                <span>
                  Orders will appear here once they
                  are created.
                </span>
              </div>
            ) : (
              <div className="orders-list">
                {latestOrders.map((order) => (
                  <div
                    className="order-row"
                    key={order.id}
                  >
                    <div className="order-icon">
                      #
                    </div>

                    <div className="order-info">
                      <strong>
                        Order #
                        {String(order.id).slice(
                          0,
                          8
                        )}
                      </strong>

                      <span>
                        {formatDate(
                          new Date(
                            order.created_at
                          )
                        )}{" "}
                        •{" "}
                        {formatTime(
                          new Date(
                            order.created_at
                          )
                        )}
                      </span>
                    </div>

                    <div className="order-right">
                      <strong>
                        {money(
                          order.total_amount
                        )}
                      </strong>

                      <span
                        className={`order-status ${normalize(
                          order.status
                        )}`}
                      >
                        {order.status ||
                          "Unknown"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PAYMENT HEALTH */}
          <div className="panel payment-panel">
            <div className="panel-heading compact">
              <div>
                <span className="panel-kicker">
                  COLLECTION
                </span>

                <h2>Payment Health</h2>

                <p>
                  Payment collection status.
                </p>
              </div>
            </div>

            <div className="payment-number">
              <strong>{paidPercentage}%</strong>

              <span>
                of valid orders are paid
              </span>
            </div>

            <div className="payment-progress">
              <span
                style={{
                  width: `${paidPercentage}%`,
                }}
              />
            </div>

            <div className="payment-stats">
              <div>
                <span className="payment-dot paid" />
                <div>
                  <strong>
                    {paidOrders}
                  </strong>
                  <small>Paid</small>
                </div>
              </div>

              <div>
                <span className="payment-dot pending" />
                <div>
                  <strong>
                    {pendingPayments}
                  </strong>
                  <small>Pending</small>
                </div>
              </div>
            </div>

            <div className="watch-card">
              <div className="watch-icon">
                💡
              </div>

              <div>
                <strong>
                  What to watch
                </strong>

                <p>
                  {paymentPendingPercentage > 30
                    ? "Pending payments are high. Review unpaid orders before changing discounts."
                    : "Payment collection is looking healthy. Continue monitoring unpaid orders."}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FINAL INSIGHT */}
        <section className="insight-banner">
          <div className="insight-symbol">
            ✦
          </div>

          <div>
            <span>RECOMMENDED ACTION</span>

            <h3>
              Compare this period before changing
              discounts.
            </h3>

            <p>
              Use Revenue, Average Order Value and
              Payment Collection together when evaluating
              offers and campaigns.
            </p>
          </div>

          <div className="insight-number">
            <strong>
              {shortMoney(revenue)}
            </strong>

            <span>
              {days}-day revenue
            </span>
          </div>
        </section>

        {loading && (
          <div className="loading-pill">
            <span className="spinner small" />
            Updating analytics…
          </div>
        )}
      </main>

      <style jsx global>{css}</style>
    </div>
  )
}

const css = `
.reports-page {
  min-height: 100vh;
  background:
    radial-gradient(
      circle at 78% 0%,
      rgba(201, 157, 66, 0.09),
      transparent 30%
    ),
    radial-gradient(
      circle at 15% 15%,
      rgba(35, 117, 94, 0.08),
      transparent 28%
    ),
    var(--background);
  color: var(--text);
}

.reports-content {
  width: 100%;
  max-width: 1480px;
  margin: 0 auto;
  padding: 38px 38px 70px;
  box-sizing: border-box;
}

/* HEADER */

.reports-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 30px;
  margin-bottom: 30px;
}

.eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #d6a94c;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .19em;
}

.eyebrow-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d6a94c;
  box-shadow: 0 0 14px rgba(214,169,76,.8);
}

.reports-header h1 {
  margin: 8px 0 7px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(32px, 4vw, 48px);
  line-height: 1;
  letter-spacing: -.035em;
}

.reports-header p {
  margin: 0;
  color: var(--muted);
  font-size: 15px;
}

.header-actions {
  min-width: 190px;
}

.range-label {
  margin-bottom: 7px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .1em;
}

.range-select {
  width: 100%;
  appearance: none;
  background:
    linear-gradient(45deg, transparent 50%, #cba34c 50%)
      calc(100% - 18px) 17px / 6px 6px no-repeat,
    linear-gradient(135deg, #cba34c 50%, transparent 50%)
      calc(100% - 13px) 17px / 6px 6px no-repeat,
    rgba(12, 29, 45, .9);
  color: var(--text);
  border: 1px solid rgba(203,163,76,.3);
  border-radius: 14px;
  padding: 13px 38px 13px 15px;
  font-weight: 700;
  outline: none;
  cursor: pointer;
}

.range-select:focus {
  border-color: rgba(203,163,76,.7);
  box-shadow: 0 0 0 3px rgba(203,163,76,.08);
}

/* KPI */

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.kpi-card {
  position: relative;
  min-width: 0;
  overflow: hidden;
  padding: 19px;
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,.08);
  background:
    linear-gradient(
      145deg,
      rgba(17, 39, 57, .96),
      rgba(9, 28, 42, .92)
    );
  box-shadow:
    0 16px 35px rgba(0,0,0,.12);
}

.kpi-card::after {
  content: "";
  position: absolute;
  width: 110px;
  height: 110px;
  right: -50px;
  bottom: -55px;
  border-radius: 50%;
  background: rgba(214,169,76,.08);
}

.kpi-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.kpi-icon {
  width: 39px;
  height: 39px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(214,169,76,.12);
  color: #e4b94f;
  font-weight: 900;
  font-size: 18px;
}

.kpi-tag {
  padding: 5px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .07em;
}

.kpi-tag.positive {
  color: #65dc96;
  background: rgba(45,195,111,.09);
}

.kpi-tag.blue {
  color: #76b8ff;
  background: rgba(80,150,255,.1);
}

.kpi-tag.gold {
  color: #e2bd63;
  background: rgba(214,169,76,.1);
}

.kpi-tag.green {
  color: #64db94;
  background: rgba(45,195,111,.1);
}

.kpi-value {
  margin-top: 17px;
  font-size: clamp(25px, 2.3vw, 34px);
  line-height: 1;
  font-weight: 900;
  letter-spacing: -.035em;
}

.kpi-footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 13px;
  color: var(--muted);
  font-size: 11px;
}

.trend-up {
  color: #5cda8c;
  font-weight: 800;
}

.trend-down {
  color: #ff7b7b;
  font-weight: 800;
}

.trend-neutral {
  color: #94b0c4;
}

/* PANELS */

.analytics-grid,
.bottom-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(330px, .9fr);
  gap: 16px;
  margin-top: 16px;
}

.panel {
  min-width: 0;
  border: 1px solid rgba(255,255,255,.075);
  background:
    linear-gradient(
      145deg,
      rgba(14, 36, 52, .97),
      rgba(7, 27, 40, .94)
    );
  border-radius: 22px;
  padding: 22px;
  box-shadow: 0 18px 40px rgba(0,0,0,.12);
}

.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.panel-heading.compact {
  margin-bottom: 12px;
}

.panel-kicker {
  color: #cfa44f;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .16em;
}

.panel h2 {
  margin: 5px 0 5px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 24px;
  letter-spacing: -.02em;
}

.panel p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.chart-total {
  text-align: right;
}

.chart-total strong {
  display: block;
  font-size: 20px;
}

.chart-total span {
  color: var(--muted);
  font-size: 10px;
}

/* CHART */

.chart {
  position: relative;
  display: flex;
  height: 275px;
  margin-top: 24px;
  padding: 0 5px 0 42px;
  box-sizing: border-box;
}

.chart::before,
.chart::after {
  content: "";
  position: absolute;
  left: 42px;
  right: 5px;
  border-top: 1px dashed rgba(255,255,255,.07);
}

.chart::before {
  top: 10px;
}

.chart::after {
  top: 50%;
}

.chart-y {
  position: absolute;
  left: 0;
  top: 3px;
  bottom: 28px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #7690a1;
  font-size: 9px;
}

.bars {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 4px;
  position: relative;
  z-index: 1;
}

.bar-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
}

.bar-value {
  height: 16px;
  color: #c9a44d;
  font-size: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.bar-track {
  width: min(100%, 28px);
  height: calc(100% - 48px);
  display: flex;
  align-items: flex-end;
  border-radius: 8px 8px 3px 3px;
  background: rgba(255,255,255,.025);
  overflow: hidden;
}

.bar {
  width: 100%;
  min-height: 0;
  border-radius: 7px 7px 2px 2px;
  background:
    linear-gradient(
      180deg,
      #e1b955,
      #a97928
    );
  box-shadow: 0 0 16px rgba(202,157,54,.18);
  transition: height .3s ease;
}

.bar:hover {
  filter: brightness(1.15);
}

.bar-label {
  height: 27px;
  padding-top: 8px;
  color: #7890a0;
  font-size: 8px;
  white-space: nowrap;
}

.chart-loading,
.empty-chart {
  width: 100%;
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 13px;
}

.spinner {
  width: 23px;
  height: 23px;
  border: 2px solid rgba(255,255,255,.12);
  border-top-color: #d5a945;
  border-radius: 50%;
  animation: report-spin .8s linear infinite;
  margin-bottom: 10px;
}

.spinner.small {
  width: 13px;
  height: 13px;
  border-width: 2px;
  margin: 0;
}

@keyframes report-spin {
  to {
    transform: rotate(360deg);
  }
}

/* STATUS */

.status-content {
  display: flex;
  align-items: center;
  gap: 28px;
  margin-top: 28px;
}

.status-ring {
  width: 150px;
  height: 150px;
  flex: 0 0 150px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background:
    conic-gradient(
      #55d68a
        0deg
        var(--completed-angle),
      #d7a93f
        var(--completed-angle)
        var(--pending-angle),
      #e56868
        var(--pending-angle)
        360deg
    );
  position: relative;
}

.status-ring::before {
  content: "";
  position: absolute;
  inset: 9px;
  border-radius: 50%;
  background: #0b2535;
}

.ring-inner {
  position: relative;
  z-index: 1;
  text-align: center;
}

.ring-inner strong {
  display: block;
  font-size: 28px;
}

.ring-inner span {
  color: var(--muted);
  font-size: 10px;
}

.status-list {
  flex: 1;
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 11px 0;
  border-bottom: 1px solid rgba(255,255,255,.055);
  font-size: 12px;
}

.status-row > div {
  display: flex;
  align-items: center;
  gap: 9px;
}

.status-row strong {
  font-size: 14px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.completed {
  background: #55d68a;
}

.status-dot.pending {
  background: #d7a93f;
}

.status-dot.cancelled {
  background: #e56868;
}

.status-progress,
.expense-track,
.payment-progress {
  height: 6px;
  margin-top: 20px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255,255,255,.06);
}

.status-progress span,
.expense-track span,
.payment-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #55d68a;
}

.status-caption {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  color: var(--muted);
  font-size: 10px;
}

/* SUMMARY */

.summary-list {
  display: flex;
  flex-direction: column;
}

.summary-item {
  display: grid;
  grid-template-columns: 38px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid rgba(255,255,255,.055);
}

.summary-item:last-child {
  border-bottom: 0;
}

.summary-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  font-weight: 900;
  background: rgba(214,169,76,.1);
}

.summary-icon.gold {
  color: #dfb652;
}

.summary-icon.green {
  color: #55d68a;
  background: rgba(85,214,138,.08);
}

.summary-icon.orange {
  color: #f0a44d;
  background: rgba(240,164,77,.08);
}

.summary-icon.blue {
  color: #68b1ff;
  background: rgba(104,177,255,.08);
}

.summary-item span {
  display: block;
  font-size: 12px;
}

.summary-item small {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 9px;
}

.summary-item > strong {
  font-size: 14px;
}

/* EXPENSE */

.expense-main {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
  padding: 17px 0;
}

.expense-main span,
.expense-main small {
  display: block;
  color: var(--muted);
  font-size: 11px;
}

.expense-main strong {
  display: block;
  margin: 5px 0;
  font-size: 28px;
}

.expense-percent {
  text-align: right;
}

.expense-percent strong {
  color: #e0b44c;
  font-size: 24px;
}

.contribution-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  margin-top: 18px;
  padding: 15px;
  border: 1px solid rgba(255,255,255,.06);
  border-radius: 14px;
  background: rgba(255,255,255,.025);
}

.contribution-box span,
.contribution-box small {
  display: block;
}

.contribution-box span {
  font-size: 12px;
}

.contribution-box small {
  margin-top: 4px;
  color: var(--muted);
  font-size: 9px;
}

.contribution-box strong {
  font-size: 19px;
}

.positive-text {
  color: #55d68a;
}

.negative-text {
  color: #e56868;
}

/* ORDERS */

.orders-list {
  margin-top: 10px;
}

.order-row {
  display: grid;
  grid-template-columns: 36px 1fr auto;
  align-items: center;
  gap: 11px;
  padding: 13px 0;
  border-bottom: 1px solid rgba(255,255,255,.055);
}

.order-row:last-child {
  border-bottom: 0;
}

.order-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: rgba(214,169,76,.09);
  color: #d7aa45;
  font-weight: 900;
}

.order-info strong {
  display: block;
  font-size: 12px;
}

.order-info span {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 9px;
}

.order-right {
  text-align: right;
}

.order-right > strong {
  display: block;
  font-size: 12px;
}

.order-status {
  display: inline-block;
  margin-top: 4px;
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(85,214,138,.09);
  color: #5cdb8c;
  font-size: 8px;
  text-transform: capitalize;
}

/* PAYMENT */

.payment-number {
  margin-top: 23px;
}

.payment-number strong {
  display: block;
  font-size: 43px;
  line-height: 1;
  letter-spacing: -.04em;
}

.payment-number span {
  display: block;
  margin-top: 7px;
  color: var(--muted);
  font-size: 11px;
}

.payment-progress span {
  background:
    linear-gradient(
      90deg,
      #55d68a,
      #9be45e
    );
}

.payment-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 18px;
}

.payment-stats > div {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px;
  border: 1px solid rgba(255,255,255,.06);
  border-radius: 12px;
  background: rgba(255,255,255,.025);
}

.payment-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.payment-dot.paid {
  background: #55d68a;
}

.payment-dot.pending {
  background: #d7a93f;
}

.payment-stats strong,
.payment-stats small {
  display: block;
}

.payment-stats strong {
  font-size: 15px;
}

.payment-stats small {
  margin-top: 2px;
  color: var(--muted);
  font-size: 9px;
}

.watch-card {
  display: flex;
  gap: 12px;
  margin-top: 18px;
  padding: 14px;
  border: 1px solid rgba(214,169,76,.15);
  border-radius: 14px;
  background: rgba(214,169,76,.05);
}

.watch-icon {
  font-size: 19px;
}

.watch-card strong {
  font-size: 12px;
}

.watch-card p {
  margin-top: 4px;
  font-size: 10px;
}

/* EMPTY / ERROR */

.empty-state {
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 6px;
  color: var(--muted);
}

.empty-icon {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  margin-bottom: 4px;
  border-radius: 14px;
  background: rgba(214,169,76,.08);
  color: #d7aa45;
  font-size: 19px;
}

.empty-state strong {
  color: var(--text);
  font-size: 13px;
}

.empty-state span {
  font-size: 10px;
}

.error-banner {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 18px;
  padding: 14px 16px;
  border: 1px solid rgba(229,104,104,.22);
  border-radius: 15px;
  background: rgba(229,104,104,.06);
}

.error-icon {
  width: 27px;
  height: 27px;
  display: grid;
  place-items: center;
  flex: 0 0 27px;
  border-radius: 50%;
  background: rgba(229,104,104,.12);
  color: #ff7b7b;
  font-weight: 900;
}

.error-banner strong {
  font-size: 12px;
}

.error-banner p {
  margin: 3px 0 0;
  color: #bf9e9e;
  font-size: 10px;
}

.loading-pill {
  position: fixed;
  right: 22px;
  bottom: 22px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 14px;
  border: 1px solid rgba(214,169,76,.2);
  border-radius: 999px;
  background: rgba(7,24,35,.94);
  color: #d6b15c;
  box-shadow: 0 12px 30px rgba(0,0,0,.2);
  font-size: 10px;
  font-weight: 800;
  z-index: 20;
}

/* FINAL INSIGHT */

.insight-banner {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
  padding: 19px 21px;
  border: 1px solid rgba(214,169,76,.18);
  border-radius: 19px;
  background:
    linear-gradient(
      105deg,
      rgba(214,169,76,.08),
      rgba(14,37,53,.9)
    );
}

.insight-symbol {
  width: 43px;
  height: 43px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: rgba(214,169,76,.1);
  color: #d8af53;
  font-size: 21px;
}

.insight-banner span {
  color: #cba44e;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: .13em;
}

.insight-banner h3 {
  margin: 4px 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 17px;
}

.insight-banner p {
  margin: 0;
  color: var(--muted);
  font-size: 10px;
}

.insight-number {
  text-align: right;
}

.insight-number strong {
  display: block;
  font-size: 21px;
}

.insight-number span {
  color: var(--muted);
  font-size: 9px;
  letter-spacing: 0;
}

.cash-closing-report{margin-bottom:18px}.cash-closing-table{overflow:auto;border:1px solid var(--border);border-radius:14px}.cash-closing-row{display:grid;grid-template-columns:1.1fr repeat(6,minmax(90px,1fr));gap:12px;align-items:center;padding:12px 14px;border-top:1px solid var(--border);font-size:13px}.cash-closing-head{border-top:0;background:var(--surface-2);font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:900}.cash-closing-row span{color:var(--muted)}.cash-match{color:var(--success)}.cash-difference{color:var(--primary)}

/* RESPONSIVE */

@media (max-width: 1150px) {
  .reports-content {
    padding: 30px 24px 60px;
  }

  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .analytics-grid,
  .bottom-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .reports-content {
    padding: 22px 15px 50px;
  }

  .reports-header {
    align-items: stretch;
    flex-direction: column;
    gap: 18px;
  }

  .header-actions {
    width: 100%;
  }

  .kpi-grid {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .kpi-card {
    padding: 15px;
    border-radius: 17px;
  }

  .kpi-value {
    font-size: 24px;
  }

  .kpi-footer {
    flex-direction: column;
    gap: 4px;
  }

  .panel {
    padding: 17px;
    border-radius: 18px;
  }

  .status-content {
    gap: 18px;
  }

  .status-ring {
    width: 125px;
    height: 125px;
    flex-basis: 125px;
  }

  .chart {
    height: 240px;
  }
}

@media (max-width: 500px) {
  .reports-header h1 {
    font-size: 31px;
  }

  .reports-header p {
    font-size: 12px;
  }

  .kpi-grid {
    grid-template-columns: 1fr;
  }

  .kpi-footer {
    flex-direction: row;
  }

  .panel-heading {
    flex-direction: column;
  }

  .chart-total {
    text-align: left;
  }

  .status-content {
    flex-direction: column;
    align-items: stretch;
  }

  .status-ring {
    margin: 0 auto;
  }

  .summary-item {
    grid-template-columns: 35px 1fr auto;
  }

  .summary-item small {
    display: none;
  }

  .insight-banner {
    grid-template-columns: auto 1fr;
  }

  .insight-number {
    grid-column: 2;
    text-align: left;
  }

  .order-row {
    grid-template-columns: 32px 1fr auto;
  }

  .order-right > strong {
    font-size: 11px;
  }

  .chart {
    padding-left: 32px;
  }

  .chart::before,
  .chart::after {
    left: 32px;
  }
}
`