"use client"
import { indiaDateKey } from "@/lib/indiaTime"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const money = n => `₹${Number(n || 0).toFixed(2)}`

export default function CashClosing() {
  const [rid, setRid] = useState(null)
  const [opening, setOpening] = useState(0)
  const [actual, setActual] = useState(0)
  const [sales, setSales] = useState(0)
  const [refunds, setRefunds] = useState(0)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)

  async function load() {
    const { data: u } = await supabase.auth.getUser()
    if (!u?.user) return

    const { data: p } = await supabase
      .from("profiles")
      .select("restaurant_id")
      .eq("id", u.user.id)
      .single()

    if (!p?.restaurant_id) return
    setRid(p.restaurant_id)

    const now = new Date()
    const day = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    const start = new Date(`${day}T00:00:00+05:30`).toISOString()
    const end = new Date(`${day}T23:59:59.999+05:30`).toISOString()

    // Cash closing must use the payment ledger, not order.total_amount.
    // This correctly handles partial payments, split payments and refunds.
    const { data: payments, error: paymentError } = await supabase
      .from("order_payments")
      .select("amount,payment_method,status,paid_at,created_at")
      .eq("restaurant_id", p.restaurant_id)
      .eq("payment_method", "cash")
      .eq("status", "paid")
      .gte("paid_at", start)
      .lte("paid_at", end)

    if (paymentError) console.error("Cash closing payments:", paymentError)

    const { data: refundRows, error: refundError } = await supabase
      .from("order_refunds")
      .select("amount,status,created_at")
      .eq("restaurant_id", p.restaurant_id)
      .eq("status", "refunded")
      .gte("created_at", start)
      .lte("created_at", end)

    if (refundError) console.error("Cash closing refunds:", refundError)

    setSales((payments || []).reduce((sum, x) => sum + Number(x.amount || 0), 0))
    setRefunds((refundRows || []).reduce((sum, x) => sum + Number(x.amount || 0), 0))

    const { data: h } = await supabase
      .from("cash_closings")
      .select("*")
      .eq("restaurant_id", p.restaurant_id)
      .order("business_date", { ascending: false })
      .limit(10)

    setHistory(h || [])
  }

  useEffect(() => { load() }, [])

  const expected = Number(opening) + Number(sales) - Number(refunds)
  const difference = Number(actual) - expected

  async function close() {
    if (!rid || loading) return
    setLoading(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const businessDate = indiaDateKey(new Date())

      const { error } = await supabase
        .from("cash_closings")
        .upsert({
          restaurant_id: rid,
          business_date: businessDate,
          opening_cash: Number(opening),
          cash_sales: Number(sales),
          refunds: Number(refunds),
          expected_cash: expected,
          actual_cash: Number(actual),
          difference,
          closed_by: userData?.user?.id || null,
          closed_at: new Date().toISOString()
        }, { onConflict: "restaurant_id,business_date" })

      if (error) throw error
      await load()
    } catch (error) {
      alert(error.message || "Unable to close cash day")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="shell">
      <main className="page">
        <div className="head">
          <div>
            <span>FINANCE</span>
            <h1>Cash Closing</h1>
            <p>Close the cashier day from the actual payment ledger.</p>
          </div>
        </div>

        <div className="grid">
          {[
            ["Opening Cash", opening],
            ["Cash Collected", sales],
            ["Cash Refunds", refunds],
            ["Expected Cash", expected],
            ["Actual Cash", actual],
            ["Difference", difference]
          ].map(([label, value]) => (
            <div className="metric" key={label}>
              <span>{label}</span>
              <b>{money(value)}</b>
            </div>
          ))}
        </div>

        <div className="card">
          <label>
            Opening Cash
            <input value={opening} onChange={e => setOpening(e.target.value)} type="number" min="0" step="0.01" />
          </label>
          <label>
            Actual Cash
            <input value={actual} onChange={e => setActual(e.target.value)} type="number" min="0" step="0.01" />
          </label>
          <button className="primary" onClick={close} disabled={loading}>
            {loading ? "Closing..." : "🔒 Close Cashier Day"}
          </button>
        </div>

        <div className="card">
          <h2>Recent Closings</h2>
          {history.map(h => (
            <div className="row" key={h.id}>
              <span>{h.business_date}</span>
              <span>Expected {money(h.expected_cash)}</span>
              <b>{money(h.difference)}</b>
            </div>
          ))}
        </div>
      </main>

      <style jsx global>{`\n        .shell{min-height:100vh;background:var(--background);color:var(--text)}\n        .page{margin-left:0;padding:32px}\n        .head span{font-size:11px;letter-spacing:.14em;color:var(--info);font-weight:900}\n        .head h1{font-size:34px;margin:5px 0}\n        .head p{color:var(--muted)}\n        .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:24px 0}\n        .metric,.card{background:var(--surface);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:20px}\n        .metric span{display:block;color:var(--muted)}\n        .metric b{display:block;font-size:25px;margin-top:7px}\n        .card{margin-bottom:16px}\n        .card label{display:block;color:var(--muted);margin-bottom:14px}\n        .card input{display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:12px;border-radius:10px;border:1px solid rgba(var(--primary-rgb),.24);background:var(--background);color:var(--text)}\n        .primary{background:var(--info);border:0;color:var(--text);padding:13px 16px;border-radius:12px;font-weight:800}\n        .primary:disabled{opacity:.6}\n        .row{display:flex;justify-content:space-between;padding:13px 0;border-bottom:1px solid rgba(255,255,255,.06)}\n        @media(max-width:900px){.page{margin-left:0;padding:20px}.grid{grid-template-columns:1fr 1fr}}\n        @media(max-width:520px){.page{padding:15px}.grid{grid-template-columns:1fr 1fr}.head h1{font-size:28px}.row{gap:8px;flex-wrap:wrap}}\n      `}</style>
    </div>
  )
}
