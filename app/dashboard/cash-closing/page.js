"use client"

import { indiaDateKey, formatIndiaDateTime } from "@/lib/indiaTime"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { supabaseCloud } from "@/lib/supabaseCloud"

const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const numberValue = (value) => Number(value || 0)

export default function CashClosing() {
  const [rid, setRid] = useState(null)
  const [opening, setOpening] = useState("")
  const [actual, setActual] = useState("")
  const [sales, setSales] = useState(0)
  const [refunds, setRefunds] = useState(0)
  const [cashIn, setCashIn] = useState(0)
  const [cashOut, setCashOut] = useState(0)
  const [expenseCash, setExpenseCash] = useState(0)
  const [history, setHistory] = useState([])
  const [todayClosing, setTodayClosing] = useState(null)
  const [loading, setLoading] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState("")

  const businessDate = indiaDateKey(new Date())

  async function load() {
    setError("")

    const { data: userData } = await supabaseCloud.auth.getUser()
    if (!userData?.user) return

    const { data: profile, error: profileError } = await supabaseCloud
      .from("profiles")
      .select("restaurant_id")
      .eq("id", userData.user.id)
      .single()

    if (profileError || !profile?.restaurant_id) return

    const restaurantId = profile.restaurant_id
    setRid(restaurantId)

    const now = new Date()
    const day = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    const start = new Date(`${day}T00:00:00+05:30`).toISOString()
    const end = new Date(`${day}T23:59:59.999+05:30`).toISOString()

    const [
      { data: opsSettings },
      { data: opsPlugin },
      { data: payments },
      { data: refundRows },
      { data: movements },
      { data: expenseRows },
      { data: closings },
    ] = await Promise.all([
      supabaseCloud
        .from("plugin_settings")
        .select("config")
        .eq("restaurant_id", restaurantId)
        .eq("plugin_code", "operations-hub")
        .maybeSingle(),

      supabaseCloud
        .from("restaurant_plugins")
        .select("enabled")
        .eq("restaurant_id", restaurantId)
        .eq("plugin_code", "operations-hub")
        .maybeSingle(),

      supabaseCloud
        .from("order_payments")
        .select("amount,payment_method,status,paid_at,created_at")
        .eq("restaurant_id", restaurantId)
        .eq("payment_method", "cash")
        .eq("status", "paid")
        .gte("paid_at", start)
        .lte("paid_at", end),

      supabaseCloud
        .from("order_refunds")
        .select("amount,status,created_at")
        .eq("restaurant_id", restaurantId)
        .eq("status", "refunded")
        .gte("created_at", start)
        .lte("created_at", end),

      supabaseCloud
        .from("cash_movements")
        .select("movement_type,amount,created_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", start)
        .lte("created_at", end),

      supabaseCloud
        .from("expenses")
        .select("amount,payment_method,expense_date")
        .eq("restaurant_id", restaurantId)
        .eq("payment_method", "cash")
        .eq("expense_date", day),

      supabaseCloud
        .from("cash_closings")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("business_date", { ascending: false })
        .limit(31),
    ])

    const isEnabled =
      opsPlugin?.enabled === true &&
      opsSettings?.config?.cash_closing_enabled !== false

    setEnabled(isEnabled)

    const cashSales = (payments || []).reduce(
      (sum, row) => sum + numberValue(row.amount),
      0
    )
    const cashRefunds = (refundRows || []).reduce(
      (sum, row) => sum + numberValue(row.amount),
      0
    )
    const movementIn = (movements || [])
      .filter((row) => row.movement_type === "cash_in")
      .reduce((sum, row) => sum + numberValue(row.amount), 0)
    const movementOut = (movements || [])
      .filter((row) => ["cash_out", "petty_cash"].includes(row.movement_type))
      .reduce((sum, row) => sum + numberValue(row.amount), 0)
    const cashExpenses = (expenseRows || []).reduce(
      (sum, row) => sum + numberValue(row.amount),
      0
    )

    setSales(cashSales)
    setRefunds(cashRefunds)
    setCashIn(movementIn)
    setCashOut(movementOut)
    setExpenseCash(cashExpenses)

    const orderedClosings = closings || []
    const current = orderedClosings.find(
      (row) => row.business_date === businessDate
    )
    const previous = orderedClosings.find(
      (row) => row.business_date < businessDate
    )

    setTodayClosing(current || null)
    setHistory(orderedClosings.filter((row) => row.business_date !== businessDate))

    if (current) {
      setOpening(String(numberValue(current.opening_cash)))
      setActual(String(numberValue(current.actual_cash)))
    } else if (opening === "") {
      setOpening(String(numberValue(previous?.actual_cash)))
    }
  }

  useEffect(() => {
    load()
  }, [])

  const expected = useMemo(
    () =>
      numberValue(opening) +
      sales +
      cashIn -
      refunds -
      cashOut -
      expenseCash,
    [opening, sales, cashIn, refunds, cashOut, expenseCash]
  )

  const difference = numberValue(actual) - expected
  const isMatched = Math.abs(difference) < 0.005

  async function close() {
    if (!rid || loading) return

    if (numberValue(actual) < 0) {
      setError("Actual cash cannot be negative.")
      return
    }

    setLoading(true)
    setError("")

    try {
      const { data: userData } = await supabaseCloud.auth.getUser()

      const { error: closeError } = await supabaseCloud
        .from("cash_closings")
        .upsert(
          {
            restaurant_id: rid,
            business_date: businessDate,
            opening_cash: numberValue(opening),
            cash_sales: sales,
            cash_in: cashIn,
            cash_out: cashOut,
            expense_cash: expenseCash,
            refunds,
            expected_cash: expected,
            actual_cash: numberValue(actual),
            difference,
            closed_by: userData?.user?.id || null,
            closed_at: new Date().toISOString(),
          },
          { onConflict: "restaurant_id,business_date" }
        )

      if (closeError) throw closeError

      await load()
    } catch (err) {
      setError(err?.message || "Unable to close cash day.")
    } finally {
      setLoading(false)
    }
  }

  if (!enabled) {
    return (
      <main className="cash-page">
        <section className="cash-shell cash-disabled">
          <div className="cash-eyebrow">OPERATIONS HUB · CASH CONTROL</div>
          <div className="cash-disabled-icon">🔒</div>
          <h1>Daily Cash Closing</h1>
          <p>
            Cash Closing is currently disabled by Super Admin. Enable it from
            Operations Hub → Plugins to use daily reconciliation.
          </p>
          <Link className="cash-button cash-primary" href="/dashboard/business">
            Open Operations Hub →
          </Link>
        </section>
        <CashStyles />
      </main>
    )
  }

  return (
    <main className="cash-page">
      <section className="cash-shell">
        <header className="cash-hero">
          <div>
            <div className="cash-eyebrow">ANAIRA · OPERATIONS HUB · CASH CONTROL</div>
            <h1>Daily Cash Closing</h1>
            <p>
              Reconcile the complete cash drawer from opening balance to
              physical cash counted at day close.
            </p>
            <div className="cash-hero-actions">
              <Link className="cash-button cash-primary" href="/dashboard/business">
                ← Operations Hub
              </Link>
              <span className={`cash-status ${todayClosing ? "closed" : "open"}`}>
                <i /> {todayClosing ? "Today Closed" : "Today Open"}
              </span>
              <span className="cash-date">{businessDate}</span>
            </div>
          </div>
          <div className="cash-hero-mark">₹</div>
        </header>

        <section className="cash-kpis">
          <Metric label="Opening Cash" value={opening} />
          <Metric label="Cash Sales" value={sales} />
          <Metric label="Cash In" value={cashIn} />
          <Metric label="Cash Out" value={cashOut} />
          <Metric label="Cash Expenses" value={expenseCash} />
          <Metric label="Refunds" value={refunds} />
        </section>

        <section className="cash-main-grid">
          <div className="cash-card">
            <div className="cash-card-head">
              <div>
                <span className="cash-card-kicker">RECONCILIATION</span>
                <h2>Close Today’s Cash</h2>
                <p>System calculates the expected drawer automatically.</p>
              </div>
              <div className={`cash-match-badge ${isMatched ? "matched" : "variance"}`}>
                {isMatched ? "✓ Matched" : "⚠ Variance"}
              </div>
            </div>

            <div className="cash-flow">
              <FlowRow label="Opening Cash" value={opening} />
              <FlowRow label="+ Cash Sales" value={sales} />
              <FlowRow label="+ Cash In" value={cashIn} />
              <FlowRow label="− Cash Refunds" value={refunds} negative />
              <FlowRow label="− Cash Out / Petty Cash" value={cashOut} negative />
              <FlowRow label="− Cash Expenses" value={expenseCash} negative />
              <div className="cash-flow-total">
                <span>Expected Cash</span>
                <strong>{money(expected)}</strong>
              </div>
            </div>

            <div className="cash-input-grid">
              <label>
                <span>Opening Cash</span>
                <input
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={Boolean(todayClosing)}
                />
                <small>
                  {todayClosing
                    ? "Saved opening balance for today."
                    : "Usually carried forward from the previous closing."}
                </small>
              </label>

              <label>
                <span>Actual Cash Counted</span>
                <input
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                />
                <small>Enter the physical cash in the drawer.</small>
              </label>
            </div>

            <div className={`cash-difference ${isMatched ? "matched" : ""}`}>
              <div>
                <span>Closing Difference</span>
                <small>Actual cash − expected cash</small>
              </div>
              <strong>{money(difference)}</strong>
            </div>

            {error && <div className="cash-error">⚠ {error}</div>}

            <button className="cash-close-button" onClick={close} disabled={loading}>
              {loading
                ? "Saving Closing…"
                : todayClosing
                  ? "✓ Update Today’s Closing"
                  : "🔒 Close Cashier Day"}
            </button>
          </div>

          <aside className="cash-card cash-summary-card">
            <div className="cash-card-head">
              <div>
                <span className="cash-card-kicker">DAILY SUMMARY</span>
                <h2>Cash Position</h2>
              </div>
            </div>

            <div className="cash-summary-total">
              <span>Expected Cash</span>
              <strong>{money(expected)}</strong>
              <small>Based on today’s live cash activity</small>
            </div>

            <div className="cash-mini-list">
              <FlowRow label="Cash Sales" value={sales} />
              <FlowRow label="Cash In" value={cashIn} />
              <FlowRow label="Cash Out" value={cashOut} negative />
              <FlowRow label="Cash Expenses" value={expenseCash} negative />
              <FlowRow label="Refunds" value={refunds} negative />
            </div>

            <Link className="cash-secondary-link" href="/dashboard/reports">
              View Daily Reports →
            </Link>
          </aside>
        </section>

        <section className="cash-card">
          <div className="cash-card-head">
            <div>
              <span className="cash-card-kicker">HISTORY</span>
              <h2>Recent Cash Closings</h2>
              <p>Daily reconciliation history is retained for reporting and audit.</p>
            </div>
            <Link className="cash-secondary-link" href="/dashboard/reports">
              Full Reports →
            </Link>
          </div>

          {history.length ? (
            <div className="cash-history">
              {history.map((row) => (
                <div className="cash-history-row" key={row.id}>
                  <div>
                    <strong>{row.business_date}</strong>
                    <small>
                      Closed {row.closed_at ? formatIndiaDateTime(row.closed_at) : "—"}
                    </small>
                  </div>
                  <div>
                    <span>Opening</span>
                    <b>{money(row.opening_cash)}</b>
                  </div>
                  <div>
                    <span>Expected</span>
                    <b>{money(row.expected_cash)}</b>
                  </div>
                  <div>
                    <span>Actual</span>
                    <b>{money(row.actual_cash)}</b>
                  </div>
                  <div className={Math.abs(numberValue(row.difference)) < 0.005 ? "history-match" : "history-variance"}>
                    <span>Difference</span>
                    <b>
                      {Math.abs(numberValue(row.difference)) < 0.005
                        ? "✓ Matched"
                        : money(row.difference)}
                    </b>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="cash-empty">No previous cash closings found for this restaurant.</div>
          )}
        </section>
      </section>

      <CashStyles />
    </main>
  )
}

function Metric({ label, value }) {
  return (
    <div className="cash-kpi">
      <span>{label}</span>
      <strong>{money(value)}</strong>
    </div>
  )
}

function FlowRow({ label, value, negative = false }) {
  return (
    <div className="cash-flow-row">
      <span>{label}</span>
      <b className={negative ? "negative" : ""}>
        {negative ? "− " : ""}
        {money(value)}
      </b>
    </div>
  )
}

function CashStyles() {
  return (
    <style jsx global>{`
      .cash-page{
        min-height:100vh;
        padding:28px;
        background:var(--background);
        color:var(--text);
      }
      .cash-shell{
        max-width:1480px;
        margin:0 auto;
      }
      .cash-hero{
        position:relative;
        overflow:hidden;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:30px;
        padding:30px;
        margin-bottom:16px;
        border:1px solid var(--border);
        border-radius:24px;
        background:
          linear-gradient(135deg,var(--surface),rgba(var(--primary-rgb),.045));
        box-shadow:0 20px 70px rgba(0,0,0,.12);
      }
      .cash-hero:after{
        content:"";
        position:absolute;
        width:360px;
        height:360px;
        right:-160px;
        top:-180px;
        border-radius:50%;
        background:rgba(var(--primary-rgb),.1);
        filter:blur(12px);
      }
      .cash-eyebrow{
        position:relative;
        z-index:1;
        font-size:10px;
        letter-spacing:.17em;
        font-weight:900;
        color:var(--primary);
      }
      .cash-hero h1{
        position:relative;
        z-index:1;
        margin:7px 0 8px;
        font-size:clamp(30px,4vw,48px);
        letter-spacing:-.04em;
      }
      .cash-hero p{
        position:relative;
        z-index:1;
        max-width:760px;
        margin:0;
        color:var(--muted);
        line-height:1.65;
      }
      .cash-hero-mark{
        position:relative;
        z-index:1;
        width:88px;
        height:88px;
        flex:0 0 88px;
        display:grid;
        place-items:center;
        border-radius:26px;
        background:rgba(var(--primary-rgb),.1);
        border:1px solid rgba(var(--primary-rgb),.2);
        color:var(--primary);
        font-size:43px;
        font-weight:900;
      }
      .cash-hero-actions{
        position:relative;
        z-index:2;
        display:flex;
        align-items:center;
        gap:9px;
        flex-wrap:wrap;
        margin-top:20px;
      }
      .cash-button,.cash-secondary-link{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        cursor:pointer;
      }
      .cash-button{
        padding:10px 14px;
        border-radius:11px;
        font-weight:900;
      }
      .cash-primary{
        background:var(--primary);
        color:#111;
      }
      .cash-status,.cash-date{
        padding:9px 11px;
        border:1px solid var(--border);
        border-radius:999px;
        background:var(--surface);
        font-size:10px;
        font-weight:900;
      }
      .cash-status{color:var(--primary)}
      .cash-status i{
        display:inline-block;
        width:7px;
        height:7px;
        margin-right:6px;
        border-radius:50%;
        background:var(--primary);
      }
      .cash-status.closed i{background:var(--success)}
      .cash-date{color:var(--muted)}
      .cash-kpis{
        display:grid;
        grid-template-columns:repeat(6,minmax(0,1fr));
        gap:10px;
        margin-bottom:16px;
      }
      .cash-kpi{
        padding:16px;
        border:1px solid var(--border);
        border-radius:17px;
        background:var(--surface);
        min-width:0;
      }
      .cash-kpi span{
        display:block;
        color:var(--muted);
        font-size:10px;
        font-weight:800;
      }
      .cash-kpi strong{
        display:block;
        margin-top:7px;
        font-size:19px;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .cash-main-grid{
        display:grid;
        grid-template-columns:minmax(0,1.7fr) minmax(300px,.8fr);
        gap:16px;
        margin-bottom:16px;
      }
      .cash-card{
        padding:22px;
        border:1px solid var(--border);
        border-radius:22px;
        background:var(--surface);
        min-width:0;
      }
      .cash-card-head{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:15px;
        margin-bottom:18px;
      }
      .cash-card-kicker{
        font-size:9px;
        letter-spacing:.14em;
        font-weight:900;
        color:var(--primary);
      }
      .cash-card h2{
        margin:4px 0;
        font-size:21px;
      }
      .cash-card p{
        margin:0;
        color:var(--muted);
        font-size:12px;
        line-height:1.55;
      }
      .cash-match-badge{
        flex:0 0 auto;
        padding:8px 10px;
        border-radius:999px;
        font-size:10px;
        font-weight:900;
      }
      .cash-match-badge.matched{
        color:var(--success);
        background:rgba(34,197,94,.09);
        border:1px solid rgba(34,197,94,.2);
      }
      .cash-match-badge.variance{
        color:var(--primary);
        background:rgba(var(--primary-rgb),.08);
        border:1px solid rgba(var(--primary-rgb),.2);
      }
      .cash-flow{
        padding:3px 0;
        border-top:1px solid var(--border);
      }
      .cash-flow-row,.cash-flow-total{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        padding:11px 0;
        border-bottom:1px solid var(--border);
        font-size:13px;
      }
      .cash-flow-row span{color:var(--muted)}
      .cash-flow-row b{font-size:13px}
      .cash-flow-row b.negative{color:var(--muted)}
      .cash-flow-total{
        margin-top:3px;
        padding:15px 0;
        border-bottom:0;
      }
      .cash-flow-total span{font-weight:900}
      .cash-flow-total strong{font-size:22px}
      .cash-input-grid{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:12px;
        margin-top:10px;
      }
      .cash-input-grid label{
        display:block;
        padding:14px;
        border:1px solid var(--border);
        border-radius:15px;
        background:var(--background);
      }
      .cash-input-grid label > span{
        display:block;
        font-size:11px;
        font-weight:900;
      }
      .cash-input-grid input{
        width:100%;
        box-sizing:border-box;
        margin-top:8px;
        padding:13px 12px;
        border:1px solid rgba(var(--primary-rgb),.25);
        border-radius:11px;
        outline:none;
        background:var(--surface);
        color:var(--text);
        font-size:18px;
        font-weight:800;
      }
      .cash-input-grid input:disabled{opacity:.65}
      .cash-input-grid small{
        display:block;
        margin-top:6px;
        color:var(--muted);
        font-size:9px;
        line-height:1.4;
      }
      .cash-difference{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        margin-top:12px;
        padding:15px;
        border:1px solid rgba(var(--primary-rgb),.18);
        border-radius:15px;
        background:rgba(var(--primary-rgb),.05);
      }
      .cash-difference span{display:block;font-weight:900;font-size:12px}
      .cash-difference small{display:block;margin-top:3px;color:var(--muted);font-size:9px}
      .cash-difference strong{font-size:21px;color:var(--primary)}
      .cash-difference.matched strong{color:var(--success)}
      .cash-error{
        margin-top:12px;
        padding:11px 13px;
        border:1px solid rgba(248,113,113,.25);
        border-radius:12px;
        background:rgba(248,113,113,.07);
        color:var(--danger);
        font-size:11px;
        font-weight:800;
      }
      .cash-close-button{
        width:100%;
        margin-top:12px;
        padding:14px 16px;
        border:0;
        border-radius:13px;
        background:var(--primary);
        color:#111;
        font-weight:900;
        cursor:pointer;
      }
      .cash-close-button:disabled{opacity:.55;cursor:not-allowed}
      .cash-summary-total{
        padding:17px;
        border:1px solid rgba(var(--primary-rgb),.18);
        border-radius:16px;
        background:rgba(var(--primary-rgb),.06);
      }
      .cash-summary-total span,.cash-summary-total small{
        display:block;
        color:var(--muted);
      }
      .cash-summary-total strong{
        display:block;
        margin:5px 0;
        font-size:29px;
      }
      .cash-summary-total small{font-size:9px}
      .cash-mini-list{margin-top:12px}
      .cash-secondary-link{
        margin-top:16px;
        color:var(--primary);
        font-size:11px;
        font-weight:900;
      }
      .cash-history{border-top:1px solid var(--border)}
      .cash-history-row{
        display:grid;
        grid-template-columns:1.4fr repeat(4,minmax(100px,1fr));
        gap:14px;
        align-items:center;
        padding:14px 0;
        border-bottom:1px solid var(--border);
      }
      .cash-history-row strong{display:block;font-size:13px}
      .cash-history-row small,.cash-history-row span{
        display:block;
        color:var(--muted);
        font-size:9px;
      }
      .cash-history-row b{display:block;margin-top:3px;font-size:12px}
      .history-match b{color:var(--success)}
      .history-variance b{color:var(--primary)}
      .cash-empty{
        padding:30px 10px;
        text-align:center;
        color:var(--muted);
        font-size:12px;
      }
      .cash-disabled{
        max-width:650px;
        margin:10vh auto;
        padding:35px;
        text-align:center;
        border:1px solid var(--border);
        border-radius:24px;
        background:var(--surface);
      }
      .cash-disabled-icon{
        width:65px;
        height:65px;
        display:grid;
        place-items:center;
        margin:22px auto 12px;
        border-radius:20px;
        background:rgba(var(--primary-rgb),.08);
        font-size:28px;
      }
      .cash-disabled h1{margin:0 0 8px;font-size:30px}
      .cash-disabled p{margin:0 auto 20px;max-width:520px;color:var(--muted);line-height:1.6}
      @media(max-width:1100px){
        .cash-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}
        .cash-main-grid{grid-template-columns:1fr}
      }
      @media(max-width:720px){
        .cash-page{padding:16px}
        .cash-hero{padding:22px;align-items:flex-start}
        .cash-hero-mark{display:none}
        .cash-kpis{grid-template-columns:1fr 1fr}
        .cash-input-grid{grid-template-columns:1fr}
        .cash-history-row{grid-template-columns:1fr 1fr}
      }
      @media(max-width:480px){
        .cash-kpis{grid-template-columns:1fr}
        .cash-card{padding:17px}
        .cash-history-row{grid-template-columns:1fr}
      }
    `}</style>
  )
}
