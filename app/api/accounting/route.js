import { requireFeature } from "@/lib/featureGateServer"
import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/serverAuth"
import { resolveRestaurantForUser } from "@/lib/restaurantContext"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"

export async function GET(req) {
  try {
    const user = await requireApiUser(req)
    const rid = await resolveRestaurantForUser(user)
    if (!rid) return NextResponse.json({ error: "Restaurant not found" }, { status: 400 })
    await requireFeature(rid, "restaurant-pro")
    const url = new URL(req.url)
    const days = Math.min(Math.max(Number(url.searchParams.get("days") || 30), 1), 365)
    const from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10)
    const to = new Date().toISOString().slice(0, 10)
    const [{ data: entries, error }, { data: closing }] = await Promise.all([
      supabaseCloudAdmin.from("p0_accounting_journal_entries").select("id,source_type,source_id,entry_date,account_code,account_name,debit,credit,reference,narration,metadata,created_at").eq("restaurant_id", rid).gte("entry_date", from).lte("entry_date", to).order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(20000),
      supabaseCloudAdmin.from("cash_closings").select("business_date,expected_cash,actual_cash,difference").eq("restaurant_id", rid).gte("business_date", from).lte("business_date", to).order("business_date", { ascending: false })
    ])
    if (error) throw error
    const rows = entries || []
    const totalDebit = rows.reduce((s, r) => s + Number(r.debit || 0), 0)
    const totalCredit = rows.reduce((s, r) => s + Number(r.credit || 0), 0)
    const accounts = {}
    for (const r of rows) {
      const key = r.account_code || "OTHER"
      accounts[key] ||= { account_code: key, account_name: r.account_name, debit: 0, credit: 0 }
      accounts[key].debit += Number(r.debit || 0)
      accounts[key].credit += Number(r.credit || 0)
    }
    return NextResponse.json({ success: true, range: { from, to, days }, summary: { entries: rows.length, debit: totalDebit, credit: totalCredit, difference: totalDebit - totalCredit }, accounts: Object.values(accounts).sort((a,b) => Math.abs(b.debit-b.credit) - Math.abs(a.debit-a.credit)), entries: rows, cashClosings: closing || [] })
  } catch (e) {
    const status = /unauthorized|authentication|token/i.test(String(e?.message || "")) ? 401 : 500
    return NextResponse.json({ error: status === 401 ? "Unauthorized" : "Accounting report failed" }, { status })
  }
}

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const rid = await resolveRestaurantForUser(user)
    if (!rid) return NextResponse.json({ error: "Restaurant not found" }, { status: 400 })
    await requireFeature(rid, "restaurant-pro")
    const body = await req.json().catch(() => ({}))
    const from = String(body.from || new Date().toISOString().slice(0, 10))
    const to = String(body.to || from)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return NextResponse.json({ error: "Invalid date range" }, { status: 400 })
    const { data, error } = await supabaseCloudAdmin.rpc("p0_5_sync_accounting", { p_restaurant_id: rid, p_from: from, p_to: to })
    if (error) throw error
    return NextResponse.json(data || { success: true })
  } catch (e) {
    const status = /unauthorized|authentication|token/i.test(String(e?.message || "")) ? 401 : 500
    return NextResponse.json({ error: status === 401 ? "Unauthorized" : e?.message || "Accounting sync failed" }, { status })
  }
}
