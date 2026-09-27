"use client"

import { useEffect, useMemo, useState } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell,
} from "recharts"

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
const compactMoney = (n) => {
  const v = Number(n || 0)
  if (Math.abs(v) >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(1)}L`
  if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(1)}K`
  return money(v)
}
const pct = (n) => `${Number(n || 0).toFixed(1)}%`
const COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#d97706", "#dc2626", "#0891b2", "#475569"]

const dateLabel = (v) => {
  const d = new Date(`${v}T00:00:00`)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
}

export default function AdvancedReportingPage() {
  const [days, setDays] = useState(30)
  const [tab, setTab] = useState("overview")
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    let dead = false
    async function load() {
      setLoading(true)
      setError("")
      try {
        const { data: auth, error: authError } = await supabaseCloud.auth.getUser()
        if (authError) throw authError
        if (!auth?.user) throw new Error("Please sign in again.")

        const { data: profile, error: profileError } = await supabaseCloud
          .from("profiles")
          .select("restaurant_id")
          .eq("id", auth.user.id)
          .single()
        if (profileError) throw profileError
        if (!profile?.restaurant_id) throw new Error("Restaurant profile not found.")

        const { data: sessionData } = await supabaseCloud.auth.getSession()
        const token = sessionData?.session?.access_token
        if (!token) throw new Error("Session token unavailable.")

        const res = await fetch(`/api/reports/p1-11?restaurant_id=${encodeURIComponent(profile.restaurant_id)}&days=${days}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok || !payload.success) throw new Error(payload.error || "Analytics unavailable")
        if (!dead) {
          setData(payload.data || {})
          setLastUpdated(new Date())
        }
      } catch (e) {
        if (!dead) {
          setData(null)
          setError(e?.message || "Unable to load advanced reporting")
        }
      } finally {
        if (!dead) setLoading(false)
      }
    }
    load()
    return () => { dead = true }
  }, [days])

  const p = data?.pnl || {}
  const fc = data?.food_cost || {}
  const ltv = data?.customer_ltv || {}
  const iv = data?.inventory_variance || {}
  const daily = data?.daily || []
  const payments = data?.payment_settlement || []
  const outlets = data?.outlet_comparison || []
  const staff = data?.staff_performance || []
  const kitchen = data?.kitchen_performance || []
  const aggregators = data?.aggregator_profitability || []
  const marketing = data?.marketing_roi || []
  const forecast = data?.forecasting_datasets || []

  const maxRevenue = useMemo(() => Math.max(...daily.map((x) => Number(x.revenue || 0)), 1), [daily])
  const paymentTotal = useMemo(() => payments.reduce((s, x) => s + Number(x.amount || 0), 0), [payments])
  const totalOrders = useMemo(() => daily.reduce((s, x) => s + Number(x.orders || 0), 0), [daily])
  const avgOrder = totalOrders ? Number(p.net_revenue || 0) / totalOrders : 0
  const profitMargin = Number(p.net_revenue || 0) ? (Number(p.operating_profit || 0) / Number(p.net_revenue || 0)) * 100 : 0
  const bestOutlet = outlets.length ? outlets.reduce((a, b) => Number(b.revenue || 0) > Number(a.revenue || 0) ? b : a) : null

  const exportCsv = () => {
    if (!data) return
    const rows = [
      ["ANAIRA P1.11 ADVANCED REPORTING"],
      ["Period", `${data.period?.start || ""} to ${data.period?.end || ""}`],
      [],
      ["FINANCIAL SUMMARY"],
      ["Gross Revenue", p.gross_revenue], ["Net Revenue", p.net_revenue], ["COGS", p.cogs],
      ["Food Cost %", p.food_cost_pct], ["Operating Expenses", p.operating_expenses], ["Operating Profit", p.operating_profit],
      [], ["DAILY PERFORMANCE"], ["Date", "Revenue", "COGS", "Orders", "Gross Margin"],
      ...daily.map(x => [x.date, x.revenue, x.cogs, x.orders, x.gross_margin]),
      [], ["OUTLETS"], ["Outlet", "Orders", "Revenue"],
      ...outlets.map(x => [x.outlet_name, x.orders, x.revenue]),
      [], ["STAFF"], ["Staff", "Orders", "Revenue", "Avg Order"],
      ...staff.map(x => [x.staff_name, x.orders, x.revenue, x.avg_order]),
      [], ["AGGREGATORS"], ["Provider", "Orders", "Gross", "Commission", "Net Payout", "Contribution"],
      ...aggregators.map(x => [x.provider, x.orders, x.gross_value, x.commission, x.net_payout, x.contribution]),
    ]
    const csv = rows.map(r => r.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `anaira-advanced-report-${days}days.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="ar-page">
      <header className="ar-header">
        <div>
          <div className="ar-eyebrow"><span className="ar-live-dot" /> ANAIRA INTELLIGENCE · P1.11</div>
          <h1>Advanced Reporting</h1>
          <p>Executive-grade visibility across revenue, profitability, operations, customers, inventory and channels.</p>
        </div>
        <div className="ar-actions">
          <div className="ar-period">
            {[7, 30, 90, 365].map(v => <button key={v} className={days === v ? "active" : ""} onClick={() => setDays(v)}>{v}D</button>)}
        </div>
          <button className="ar-export" onClick={exportCsv}>Export CSV <span>↓</span></button>
        </div>
      </header>

      {error && <div className="ar-error"><strong>Report unavailable</strong><span>{error}</span></div>}

      {loading ? <Loading /> : data && <>
        <section className="ar-hero-grid">
          <div className="ar-hero-card">
            <div className="ar-card-label">NET REVENUE</div>
            <div className="ar-hero-value">{compactMoney(p.net_revenue)}</div>
            <div className="ar-card-meta">Gross {money(p.gross_revenue)} · Refund/adjustments reflected in source data</div>
            <div className="ar-mini-chart"><ResponsiveContainer width="100%" height={72}><AreaChart data={daily}><Area type="monotone" dataKey="revenue" stroke="#0f766e" fill="#0f766e" fillOpacity={0.12} strokeWidth={2.5} /></AreaChart></ResponsiveContainer></div>
          </div>
          <MetricCard label="Operating Profit" value={compactMoney(p.operating_profit)} meta={`${pct(profitMargin)} margin`} tone={Number(p.operating_profit) >= 0 ? "positive" : "negative"} />
          <MetricCard label="Food Cost" value={pct(fc.food_cost_pct)} meta={`COGS ${money(fc.cogs)}`} />
          <MetricCard label="Customer LTV" value={compactMoney(ltv.avg_ltv)} meta={`${ltv.customers || 0} customers tracked`} />
        </section>

        <nav className="ar-tabs" aria-label="Reporting sections">
          {[['overview','Overview'],['finance','Finance & COGS'],['operations','Operations'],['customers','Customers & Marketing'],['forecast','Forecasting']].map(([id,label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
        </nav>

        {tab === "overview" && <Overview daily={daily} payments={payments} outlets={outlets} staff={staff} maxRevenue={maxRevenue} paymentTotal={paymentTotal} bestOutlet={bestOutlet} />}
        {tab === "finance" && <Finance data={data} daily={daily} payments={payments} paymentTotal={paymentTotal} />}
        {tab === "operations" && <Operations staff={staff} kitchen={kitchen} aggregators={aggregators} outlets={outlets} />}
        {tab === "customers" && <Customers ltv={ltv} marketing={marketing} />}
        {tab === "forecast" && <Forecast data={forecast} />}

        <footer className="ar-footer"><span>Data period: {data.period?.start || "—"} → {data.period?.end || "—"}</span><span>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""} · Source: Anaira reporting engine</span></footer>
      </>}

      <style jsx global>{styles}</style>
    </main>
  )
}

function MetricCard({ label, value, meta, tone }) {
  return <div className="ar-metric-card"><div className="ar-card-label">{label}</div><div className={`ar-metric-value ${tone || ""}`}>{value}</div><div className="ar-card-meta">{meta}</div></div>
}

function Panel({ title, subtitle, children, action }) {
  return <section className="ar-panel"><div className="ar-panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>
}

function Overview({ daily, payments, outlets, staff, maxRevenue, paymentTotal, bestOutlet }) {
  return <div className="ar-stack">
    <div className="ar-grid-2">
      <Panel title="Revenue performance" subtitle="Daily revenue and order volume"><div className="ar-chart"><ResponsiveContainer width="100%" height={330}><AreaChart data={daily} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}><defs><linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0f766e" stopOpacity={0.28}/><stop offset="100%" stopColor="#0f766e" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf1f5"/><XAxis dataKey="date" tickFormatter={dateLabel} tickLine={false} axisLine={false}/><YAxis tickFormatter={compactMoney} tickLine={false} axisLine={false}/><Tooltip content={<ChartTooltip money />} /><Area type="monotone" dataKey="revenue" stroke="#0f766e" fill="url(#revFill)" strokeWidth={3} name="Revenue"/><Line type="monotone" dataKey="orders" yAxisId="orders" stroke="#2563eb" strokeWidth={2} dot={false} name="Orders"/></AreaChart></ResponsiveContainer></div></Panel>
      <Panel title="Payment settlement" subtitle={`${money(paymentTotal)} captured across recorded transactions`}><div className="ar-payment-layout"><ResponsiveContainer width="55%" height={270}><PieChart><Pie data={payments} dataKey="amount" nameKey="method" innerRadius={70} outerRadius={102} paddingAngle={3}>{payments.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip content={<ChartTooltip money />} /></PieChart></ResponsiveContainer><div className="ar-payment-list">{payments.slice(0,7).map((x,i)=><div className="ar-payment-row" key={x.method}><span><i style={{background:COLORS[i%COLORS.length]}}/>{x.method}</span><strong>{money(x.amount)}</strong><small>{paymentTotal ? `${((Number(x.amount||0)/paymentTotal)*100).toFixed(1)}%` : "0%"}</small></div>)}</div></div></Panel>
    </div>
    <div className="ar-grid-2">
      <Panel title="Outlet performance" subtitle={bestOutlet ? `Top revenue outlet: ${bestOutlet.outlet_name}` : "Enterprise outlet comparison"}><DataTable rows={outlets} columns={[['outlet_name','Outlet'],['orders','Orders'],['revenue','Revenue',money]]} /></Panel>
      <Panel title="Staff performance" subtitle="Revenue contribution by assigned staff"><DataTable rows={staff.slice(0,10)} columns={[['staff_name','Staff'],['orders','Orders'],['revenue','Revenue',money],['avg_order','Avg Order',money]]} /></Panel>
    </div>
  </div>
}

function Finance({ data, daily, payments, paymentTotal }) {
  const p = data?.pnl || {}, fc = data?.food_cost || {}, iv = data?.inventory_variance || {}
  return <div className="ar-stack">
    <div className="ar-grid-4"><MetricCard label="Gross Revenue" value={compactMoney(p.gross_revenue)} meta={`${money(p.discounts)} discounts`} /><MetricCard label="Net Revenue" value={compactMoney(p.net_revenue)} meta={`${money(p.taxes)} taxes`} /><MetricCard label="COGS" value={compactMoney(p.cogs)} meta={`Food cost ${pct(p.food_cost_pct)}`} /><MetricCard label="Operating Expenses" value={compactMoney(p.operating_expenses)} meta="Recorded operating expenses" /></div>
    <div className="ar-grid-2"><Panel title="P&L trend" subtitle="Revenue, COGS and gross margin"><ResponsiveContainer width="100%" height={350}><LineChart data={daily}><CartesianGrid vertical={false} stroke="#edf1f5"/><XAxis dataKey="date" tickFormatter={dateLabel} tickLine={false} axisLine={false}/><YAxis tickFormatter={compactMoney} tickLine={false} axisLine={false}/><Tooltip content={<ChartTooltip money />} /><Line dataKey="revenue" stroke="#0f766e" strokeWidth={3} dot={false} name="Revenue"/><Line dataKey="cogs" stroke="#dc2626" strokeWidth={2.5} dot={false} name="COGS"/><Line dataKey="gross_margin" stroke="#7c3aed" strokeWidth={2} dot={false} name="Gross Margin"/></LineChart></ResponsiveContainer></Panel><Panel title="Food cost & inventory control" subtitle="Cost structure and variance"><InsightRows items={[["Food cost %",pct(fc.food_cost_pct)], ["Theoretical COGS",money(fc.theoretical_cogs)], ["Actual COGS",money(fc.actual_cogs)], ["Recipe variance",money(fc.variance)], ["Current inventory value",money(iv.current_inventory_value)]]} /></Panel></div>
    <Panel title="Payment settlement detail" subtitle={`${payments.length} payment methods · ${money(paymentTotal)} captured`}><DataTable rows={payments} columns={[['method','Method'],['transactions','Transactions'],['amount','Amount',money]]} /></Panel>
  </div>
}

function Operations({ staff, kitchen, aggregators, outlets }) {
  return <div className="ar-stack"><div className="ar-grid-2"><Panel title="Kitchen performance" subtitle="Ticket throughput and on-time completion"><DataTable rows={kitchen} columns={[['station_name','Station'],['tickets','Tickets'],['avg_prep_minutes','Avg Prep'],['on_time','On Time']]}/></Panel><Panel title="Aggregator profitability" subtitle="Gross value, commissions and net contribution"><DataTable rows={aggregators} columns={[['provider','Provider'],['orders','Orders'],['gross_value','Gross',money],['commission','Commission',money],['net_payout','Net Payout',money],['contribution','Contribution',money]]}/></Panel></div><div className="ar-grid-2"><Panel title="Outlet comparison" subtitle="Live enterprise outlet performance"><DataTable rows={outlets} columns={[['outlet_name','Outlet'],['orders','Orders'],['revenue','Revenue',money]]}/></Panel><Panel title="Staff leaderboard" subtitle="Order and revenue contribution"><DataTable rows={staff} columns={[['staff_name','Staff'],['orders','Orders'],['revenue','Revenue',money],['avg_order','Avg Order',money]]}/></Panel></div></div>
}

function Customers({ ltv, marketing }) {
  return <div className="ar-stack"><div className="ar-grid-4"><MetricCard label="Customers" value={Number(ltv.customers || 0).toLocaleString("en-IN")} meta="Customers in restaurant profile"/><MetricCard label="Average LTV" value={compactMoney(ltv.avg_ltv)} meta="Average lifetime spend"/><MetricCard label="Lifetime Revenue" value={compactMoney(ltv.lifetime_revenue)} meta="Across tracked customers"/><MetricCard label="Average Orders" value={Number(ltv.avg_orders || 0).toFixed(1)} meta="Per tracked customer"/></div><Panel title="Marketing ROI" subtitle="Attributed revenue against campaign budget"><DataTable rows={marketing} columns={[['campaign','Campaign'],['attributed_revenue','Attributed Revenue',money],['budget','Budget',money],['roi_pct','ROI',pct]]}/></Panel></div>
}

function Forecast({ data = [] }) {
  return (
    <div className="ar-stack">
      <Panel
        title="Forecasting dataset"
        subtitle="Historical performance with rolling 7-day averages"
      >
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={data}>
            <CartesianGrid vertical={false} stroke="#edf1f5" />
            <XAxis
              dataKey="date"
              tickFormatter={dateLabel}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={compactMoney}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<ChartTooltip money />} />
            <Line
              dataKey="revenue"
              stroke="#0f766e"
              strokeWidth={2.5}
              dot={false}
              name="Revenue"
            />
            <Line
              dataKey="revenue_7d_avg"
              stroke="#0f766e"
              strokeDasharray="6 5"
              strokeWidth={2}
              dot={false}
              name="7D Revenue Avg"
            />
            <Line
              dataKey="cogs"
              stroke="#dc2626"
              strokeWidth={2}
              dot={false}
              name="COGS"
            />
            <Line
              dataKey="cogs_7d_avg"
              stroke="#dc2626"
              strokeDasharray="6 5"
              strokeWidth={1.8}
              dot={false}
              name="7D COGS Avg"
            />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <Panel
        title="Forecasting records"
        subtitle={`${data.length} daily records`}
      >
        <DataTable
          rows={data.slice(-30)}
          columns={[
            ["date", "Date"],
            ["revenue", "Revenue", money],
            ["cogs", "COGS", money],
            ["orders", "Orders"],
            ["revenue_7d_avg", "7D Rev Avg", money],
            ["cogs_7d_avg", "7D COGS Avg", money],
            ["orders_7d_avg", "7D Orders Avg", (v) => Number(v || 0).toFixed(1)],
          ]}
        />
      </Panel>
    </div>
  )
}

function InsightRows({ items }) { return <div className="ar-insights">{items.map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div> }
function DataTable({ rows = [], columns = [] }) { if (!rows.length) return <div className="ar-empty">No data recorded for this period.</div>; return <div className="ar-table-wrap"><table className="ar-table"><thead><tr>{columns.map(([key,label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.id || `${i}-${r[columns[0]?.[0]] || "row"}`}>{columns.map(([key,,format]) => <td key={key}>{format ? format(r[key]) : String(r[key] ?? "—")}</td>)}</tr>)}</tbody></table></div> }
function ChartTooltip({ active, payload, label, money: moneyMode }) { if (!active || !payload?.length) return null; return <div className="ar-tooltip"><strong>{dateLabel(label)}</strong>{payload.map(x=><div key={x.dataKey}><span>{x.name}</span><b>{moneyMode ? (x.dataKey === "orders" ? Number(x.value || 0).toLocaleString("en-IN") : money(x.value)) : x.value}</b></div>)}</div> }
function Loading() { return <div className="ar-loading"><div className="ar-spinner"/><strong>Building your intelligence dashboard…</strong><span>Loading finance, operations, customer and forecasting data.</span></div> }

const styles = `
.ar-page{min-height:100vh;background:linear-gradient(180deg,#f7faf9 0%,#f6f8fb 38%,#f4f6f8 100%);color:#142033;padding:30px clamp(16px,3vw,44px) 48px}
.ar-header{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap;margin-bottom:24px}.ar-eyebrow{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:900;letter-spacing:1.6px;color:#52716b}.ar-live-dot{width:7px;height:7px;border-radius:50%;background:#10b981;box-shadow:0 0 0 4px #d1fae5}.ar-header h1{margin:8px 0 7px;font-size:clamp(30px,4vw,44px);line-height:1.04;letter-spacing:-1.5px}.ar-header p{margin:0;color:#667085;max-width:720px;font-size:14px}.ar-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.ar-period{display:flex;padding:4px;border:1px solid #dce4e2;border-radius:12px;background:#fff;box-shadow:0 5px 18px rgba(16,24,40,.04)}.ar-period button{border:0;background:transparent;padding:8px 12px;border-radius:8px;font-size:12px;font-weight:800;color:#667085;cursor:pointer}.ar-period button.active{background:#0f766e;color:#fff}.ar-export{border:1px solid #0f766e;background:#0f766e;color:#fff;border-radius:11px;padding:11px 15px;font-weight:800;cursor:pointer;box-shadow:0 8px 20px rgba(15,118,110,.18)}.ar-export span{font-size:15px;margin-left:5px}
.ar-hero-grid{display:grid;grid-template-columns:1.6fr repeat(3,1fr);gap:14px;margin-bottom:20px}.ar-hero-card,.ar-metric-card{background:rgba(255,255,255,.94);border:1px solid #e3e9e7;border-radius:18px;padding:19px;box-shadow:0 10px 28px rgba(16,24,40,.055);min-width:0}.ar-hero-card{position:relative;overflow:hidden}.ar-hero-card:after{content:"";position:absolute;right:-70px;top:-70px;width:180px;height:180px;border-radius:50%;background:#dff5ef}.ar-card-label{font-size:10px;font-weight:900;letter-spacing:1.15px;color:#7b8794;text-transform:uppercase}.ar-hero-value{font-size:31px;font-weight:900;letter-spacing:-1px;margin-top:7px;position:relative;z-index:1}.ar-metric-value{font-size:27px;font-weight:900;letter-spacing:-.8px;margin-top:13px}.ar-metric-value.positive{color:#087f5b}.ar-metric-value.negative{color:#c92a2a}.ar-card-meta{font-size:11px;color:#7a8492;margin-top:6px;line-height:1.5}.ar-mini-chart{margin-top:8px;position:relative;z-index:1}
.ar-tabs{display:flex;gap:4px;padding:5px;background:#fff;border:1px solid #e2e7eb;border-radius:14px;margin-bottom:17px;overflow:auto;box-shadow:0 5px 18px rgba(16,24,40,.035)}.ar-tabs button{border:0;background:transparent;padding:10px 15px;border-radius:9px;color:#667085;font-size:12px;font-weight:800;white-space:nowrap;cursor:pointer}.ar-tabs button.active{background:#142033;color:#fff}.ar-stack{display:grid;gap:15px}.ar-grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}.ar-grid-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.ar-panel{background:rgba(255,255,255,.95);border:1px solid #e3e8ed;border-radius:17px;padding:18px;box-shadow:0 9px 25px rgba(16,24,40,.045);min-width:0}.ar-panel-head{display:flex;justify-content:space-between;gap:15px;align-items:flex-start;margin-bottom:13px}.ar-panel h2{font-size:15px;margin:0;font-weight:900;letter-spacing:-.15px}.ar-panel-head p{margin:4px 0 0;font-size:11px;color:#87909d}.ar-chart{min-width:0}.ar-payment-layout{display:flex;align-items:center;min-height:270px}.ar-payment-list{flex:1;display:grid;gap:10px}.ar-payment-row{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:9px;font-size:12px}.ar-payment-row span{display:flex;align-items:center;gap:7px}.ar-payment-row i{width:8px;height:8px;border-radius:50%}.ar-payment-row strong{font-size:12px}.ar-payment-row small{color:#89929e;width:38px;text-align:right}.ar-insights{display:grid;gap:0}.ar-insights>div{display:flex;justify-content:space-between;gap:18px;padding:15px 2px;border-bottom:1px solid #edf1f4;font-size:13px}.ar-insights>div:last-child{border-bottom:0}.ar-insights span{color:#667085}.ar-insights strong{font-weight:900}.ar-table-wrap{overflow:auto;border:1px solid #edf0f3;border-radius:12px}.ar-table{width:100%;border-collapse:collapse;font-size:12px}.ar-table th{text-align:left;background:#f8fafb;color:#7b8794;font-size:10px;letter-spacing:.7px;text-transform:uppercase;padding:11px 12px;white-space:nowrap}.ar-table td{padding:12px;border-top:1px solid #edf0f3;white-space:nowrap}.ar-table tbody tr:hover{background:#fbfdfd}.ar-table td:not(:first-child){font-variant-numeric:tabular-nums}.ar-empty{display:flex;align-items:center;justify-content:center;min-height:150px;color:#98a2b3;font-size:13px;background:#fafbfc;border:1px dashed #dce2e7;border-radius:12px}.ar-tooltip{background:#17212f;color:#fff;padding:10px 12px;border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.18);font-size:11px}.ar-tooltip strong{display:block;margin-bottom:7px;font-size:11px}.ar-tooltip div{display:flex;justify-content:space-between;gap:18px;margin-top:4px}.ar-tooltip span{color:#cbd5e1}.ar-error{display:flex;gap:10px;align-items:center;background:#fff1f2;border:1px solid #fecdd3;color:#9f1239;padding:12px 14px;border-radius:12px;margin-bottom:16px;font-size:12px}.ar-loading{min-height:460px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;color:#667085}.ar-loading strong{color:#344054}.ar-loading span{font-size:12px}.ar-spinner{width:32px;height:32px;border-radius:50%;border:3px solid #d9ece8;border-top-color:#0f766e;animation:arspin .8s linear infinite}@keyframes arspin{to{transform:rotate(360deg)}}.ar-footer{display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap;color:#98a2b3;font-size:10px;padding:18px 2px 0}
@media(max-width:1100px){.ar-hero-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ar-grid-4{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.ar-page{padding:20px 12px 35px}.ar-grid-2,.ar-grid-4,.ar-hero-grid{grid-template-columns:1fr}.ar-payment-layout{display:block}.ar-payment-list{padding:0 8px 12px}.ar-header h1{font-size:31px}.ar-period button{padding:8px 9px}.ar-tabs{border-radius:11px}.ar-panel{padding:14px}.ar-table{font-size:11px}}
`
