"use client"
import { formatIndiaDate, formatIndiaDateTime } from "@/lib/indiaTime"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { sendThermalPrint } from "@/lib/thermalPrintClient"
import { printHtmlInFrame } from "@/lib/printUtils"

const TABS = [
  ["overview", "▦ Overview"],
  ["customers", "👥 Customers"],
  ["modifiers", "➕ Modifiers"],
  ["kot", "🍳 KOT"],
  ["expenses", "💸 Expenses"],
  ["attendance", "🕒 Attendance"],
  ["loyalty", "⭐ Loyalty"],
  ["feedback", "💬 Feedback"],
  ["permissions", "🔐 Permissions"],
]

const PERMS = ["orders", "kitchen", "billing", "tables", "customers", "expenses", "attendance", "reports", "settings"]
const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

export default function BusinessOperations() {
  const searchParams = useSearchParams()
  const [rid, setRid] = useState(null)
  const [name, setName] = useState("Restaurant")
  const [tab, setTab] = useState(searchParams.get("tab") || "overview")
  const [loading, setLoading] = useState(true)
  const [pluginEnabled, setPluginEnabled] = useState(true)
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false)
  const [toast, setToast] = useState("")
  const [loyaltyError, setLoyaltyError] = useState("")
  const [customers, setCustomers] = useState([])
  const [groups, setGroups] = useState([])
  const [mods, setMods] = useState([])
  const [expenses, setExpenses] = useState([])
  const [attendance, setAttendance] = useState([])
  const [feedback, setFeedback] = useState([])
  const [loyaltyTransactions, setLoyaltyTransactions] = useState([])
  const [staff, setStaff] = useState([])
  const [kots, setKots] = useState([])
  const [orders, setOrders] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [selectedMenuItem, setSelectedMenuItem] = useState("")
  const [kotBusy, setKotBusy] = useState(null)
  const [kotFilter, setKotFilter] = useState("all")
  const [customerSearch, setCustomerSearch] = useState("")
  const [loyaltySubTab, setLoyaltySubTab] = useState("overview")
  const [loyaltySearch, setLoyaltySearch] = useState("")
  const [selectedLoyaltyCustomer, setSelectedLoyaltyCustomer] = useState(null)
  const [loyaltySettings, setLoyaltySettings] = useState({ enabled: true, points_per_rupee: 0.1, min_bill_amount: 0, max_points_per_order: "", expiry_days: "", review_reward_points: 0 })
  const [loyaltyTiers, setLoyaltyTiers] = useState([])
  const [loyaltyRewards, setLoyaltyRewards] = useState([])
  const [loyaltyCampaigns, setLoyaltyCampaigns] = useState([])
  const [loyaltyReferrals, setLoyaltyReferrals] = useState([])
  const [loyaltyRedemptions, setLoyaltyRedemptions] = useState([])
  const [loyaltySaving, setLoyaltySaving] = useState(false)
  const [rewardForm, setRewardForm] = useState({ name: "", description: "", points_cost: "", reward_type: "discount", reward_value: "", min_order_amount: "", usage_limit: "", expires_days: "" })
  const [tierForm, setTierForm] = useState({ name: "", min_points: "", multiplier: "1", benefits: "" })
  const [campaignForm, setCampaignForm] = useState({ name: "", description: "", bonus_points: "", starts_at: "", ends_at: "" })

  const [cf, setCf] = useState({ name: "", phone: "", email: "" })
  const [gf, setGf] = useState({ name: "", selection_type: "single", required: false, min_select: 0, max_select: "" })
  const [mf, setMf] = useState({ name: "", price: "", group_id: "" })
  const [ef, setEf] = useState({ category: "General", description: "", amount: "", payment_method: "cash" })
  const [ff, setFf] = useState({ rating: 5, feedback: "" })

  const notify = (message) => {
    setToast(message)
    window.clearTimeout(window.__anairaOpsToast)
    window.__anairaOpsToast = window.setTimeout(() => setToast(""), 2500)
  }

  useEffect(() => {
    const requested = searchParams.get("tab")
    const saved = !requested && typeof window !== "undefined" ? window.sessionStorage.getItem("anaira.operations.tab") : null
    const next = requested || saved || "overview"
    const allowed = TABS.some(([id]) => id === next) ? next : "overview"
    setTab(allowed)
  }, [searchParams])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.sessionStorage.setItem("anaira.operations.tab", tab)
  }, [tab])

  useEffect(() => {
    init()
    const handlePageShow = (event) => {
      // Browser print-preview/back and bfcache restores can resume this page
      // without a normal React remount. Re-sync Cloud data when that happens.
      if (event.persisted) init()
    }
    window.addEventListener("pageshow", handlePageShow)
    return () => {
      window.removeEventListener("pageshow", handlePageShow)
      window.clearTimeout(window.__anairaOpsToast)
    }
  }, [])

  async function init() {
    try {
      const { data: u } = await supabaseCloud.auth.getSession()
      const token = u?.session?.access_token
      if (!token) return setLoading(false)

      const response = await fetch("/api/restaurant-operations", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.success) {
        console.error("Operations Hub load failed", payload)
        return setLoading(false)
      }

      setRid(payload.restaurant_id || null)
      setName(payload.name || "Restaurant")
      setPluginEnabled(payload.enabled === true)
      if (payload.enabled !== true) return setLoading(false)

      const d = payload.data || {}
      // A single failed Cloud query must never wipe an already loaded module.
      // The API reports failed query keys in payload.errors; retain the current
      // state for those keys and only replace datasets that actually loaded.
      const failed = new Set((payload.errors || []).map(e => e.key))
      if (!failed.has("customers")) setCustomers(d.customers || [])
      if (!failed.has("groups")) setGroups(d.groups || [])
      if (!failed.has("mods")) setMods(d.mods || [])
      if (!failed.has("menu")) setMenuItems(d.menu || [])
      if (!failed.has("expenses")) setExpenses(d.expenses || [])
      if (!failed.has("attendance")) setAttendance(d.attendance || [])
      if (!failed.has("feedback")) setFeedback(d.feedback || [])
      if (!failed.has("staff")) setStaff(d.staff || [])
      if (!failed.has("kots")) setKots(d.kots || [])
      if (!failed.has("orders")) setOrders(d.orders || [])
      if (!failed.has("loyaltyTx")) setLoyaltyTransactions(d.loyaltyTx || [])
      if (!failed.has("loyaltySettings") && d.loyaltySettings) setLoyaltySettings(prev => ({ ...prev, ...d.loyaltySettings, max_points_per_order: d.loyaltySettings.max_points_per_order ?? "", expiry_days: d.loyaltySettings.expiry_days ?? "" }))
      if (!failed.has("loyaltyTiers")) setLoyaltyTiers(d.loyaltyTiers || [])
      if (!failed.has("loyaltyRewards")) setLoyaltyRewards(d.loyaltyRewards || [])
      if (!failed.has("loyaltyCampaigns")) setLoyaltyCampaigns(d.loyaltyCampaigns || [])
      if (!failed.has("loyaltyReferrals")) setLoyaltyReferrals(d.loyaltyReferrals || [])
      if (!failed.has("loyaltyRedemptions")) setLoyaltyRedemptions(d.loyaltyRedemptions || [])
      const pluginMap = payload.plugins || {}
      const loyaltyOn = pluginMap.loyalty === true
      setLoyaltyEnabled(loyaltyOn)
      if (searchParams.get("tab") === "loyalty" && !loyaltyOn) setTab("overview")
      if (payload.errors?.length) console.warn("Operations Hub partial data errors", payload.errors)
    } catch (e) {
      console.error("Operations Hub init error", e)
    } finally {
      setLoading(false)
    }
  }

  const loadCustomers = async (r) => {
    const { data } = await supabaseCloud.from("customers").select("*").eq("restaurant_id", r).order("updated_at", { ascending: false })
    setCustomers(data || [])
  }
  const loadMods = async (r) => {
    const [{ data: g }, { data: m }] = await Promise.all([
      supabaseCloud.from("modifier_groups").select("*").eq("restaurant_id", r).order("created_at"),
      supabaseCloud.from("modifiers").select("*").eq("restaurant_id", r).order("created_at"),
    ])
    setGroups(g || [])
    setMods(m || [])
    const { data: menu } = await supabaseCloud.from("menu_items").select("id,name,category,price").eq("restaurant_id", r).order("name")
    setMenuItems(menu || [])
  }
  const loadExpenses = async (r) => {
    const { data } = await supabaseCloud.from("expenses").select("*").eq("restaurant_id", r).order("expense_date", { ascending: false }).limit(100)
    setExpenses(data || [])
  }
  const loadAttendance = async (r) => {
    const { data } = await supabaseCloud.from("staff_attendance").select("*").eq("restaurant_id", r).order("clock_in", { ascending: false }).limit(100)
    setAttendance(data || [])
  }
  const loadFeedback = async (r) => {
    const { data } = await supabaseCloud.from("customer_feedback").select("*").eq("restaurant_id", r).order("created_at", { ascending: false }).limit(100)
    setFeedback(data || [])
  }
  const loadLoyaltyTransactions = async (r) => {
    setLoyaltyError("")
    const { data, error } = await supabaseCloud
      .from("loyalty_transactions")
      .select("id,customer_id,points,transaction_type,note,created_at")
      .eq("restaurant_id", r)
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) {
      console.error("Loyalty transactions:", error)
      setLoyaltyTransactions([])
      setLoyaltyError(error.message || "Loyalty history could not be loaded.")
      return
    }
    setLoyaltyTransactions(data || [])
  }
  const loadAdvancedLoyalty = async (r) => {
    try {
      await supabaseCloud.rpc("seed_default_loyalty_config", { p_restaurant_id: r })
    } catch (e) {
      console.warn("Loyalty defaults:", e)
    }
    const [settingsRes, tiersRes, rewardsRes, campaignsRes, referralsRes, redemptionsRes] = await Promise.all([
      supabaseCloud.from("loyalty_settings").select("*").eq("restaurant_id", r).maybeSingle(),
      supabaseCloud.from("loyalty_tiers").select("*").eq("restaurant_id", r).order("min_points", { ascending: true }),
      supabaseCloud.from("loyalty_rewards").select("*").eq("restaurant_id", r).order("points_cost", { ascending: true }),
      supabaseCloud.from("loyalty_campaigns").select("*").eq("restaurant_id", r).order("created_at", { ascending: false }),
      supabaseCloud.from("loyalty_referrals").select("*").eq("restaurant_id", r).order("created_at", { ascending: false }).limit(100),
      supabaseCloud.from("loyalty_redemptions").select("id,customer_id,reward_id,points,status,created_at").eq("restaurant_id", r).order("created_at", { ascending: false }).limit(100),
    ])
    if (settingsRes.data) setLoyaltySettings({ ...loyaltySettings, ...settingsRes.data, max_points_per_order: settingsRes.data.max_points_per_order ?? "", expiry_days: settingsRes.data.expiry_days ?? "" })
    setLoyaltyTiers(tiersRes.data || [])
    setLoyaltyRewards(rewardsRes.data || [])
    setLoyaltyCampaigns(campaignsRes.data || [])
    setLoyaltyReferrals(referralsRes.data || [])
    setLoyaltyRedemptions(redemptionsRes.data || [])
  }

  const loadStaff = async (r) => {
    const { data } = await supabaseCloud.from("profiles").select("id,email,role").eq("restaurant_id", r).order("email")
    setStaff(data || [])
  }
  const loadKots = async (r) => {
    const { data } = await supabaseCloud.from("kot_tickets").select("*").eq("restaurant_id", r).order("created_at", { ascending: false }).limit(50)
    setKots(data || [])
  }
  const loadOrders = async (r) => {
    const { data } = await supabaseCloud.from("orders").select("id,status,total_amount,created_at,source_type,source_id,source_label").eq("restaurant_id", r).order("created_at", { ascending: false }).limit(100)
    setOrders(data || [])
  }

  async function addCustomer(e) {
    e.preventDefault()
    if (!cf.name.trim()) return notify("Customer name is required")
    const { error } = await supabaseCloud.from("customers").insert({ restaurant_id: rid, ...cf })
    if (error) return notify(error.message)
    setCf({ name: "", phone: "", email: "" })
    await loadCustomers(rid)
    notify("Customer added")
  }

  async function addGroup(e) {
    e.preventDefault()
    if (!gf.name.trim()) return notify("Modifier group name is required")
    const minSelect = Math.max(0, Number(gf.min_select || 0))
    const maxSelect = gf.max_select === "" ? null : Math.max(0, Number(gf.max_select))
    if (maxSelect !== null && maxSelect < minSelect) return notify("Maximum selections cannot be less than minimum")
    const { error } = await supabaseCloud.from("modifier_groups").insert({
      restaurant_id: rid,
      name: gf.name.trim(),
      selection_type: gf.selection_type,
      required: !!gf.required,
      min_select: minSelect,
      max_select: maxSelect,
    })
    if (error) return notify(error.message)
    setGf({ name: "", selection_type: "single", required: false, min_select: 0, max_select: "" })
    await loadMods(rid)
    notify("Modifier group added")
  }

  async function addMod(e) {
    e.preventDefault()
    if (!mf.name.trim() || !mf.group_id) return notify("Choose a group and modifier name")
    const { error } = await supabaseCloud.from("modifiers").insert({
      restaurant_id: rid,
      group_id: mf.group_id,
      name: mf.name,
      price: Number(mf.price || 0),
    })
    if (error) return notify(error.message)
    setMf({ name: "", price: "", group_id: mf.group_id })
    await loadMods(rid)
    notify("Modifier added")
  }

  async function toggleMenuModifierGroup(menuItemId, groupId) {
    if (!menuItemId || !groupId) return
    const { data: existing } = await supabaseCloud
      .from("menu_item_modifier_groups")
      .select("id")
      .eq("restaurant_id", rid)
      .eq("menu_item_id", menuItemId)
      .eq("modifier_group_id", groupId)
      .maybeSingle()

    if (existing) {
      const { error } = await supabaseCloud.from("menu_item_modifier_groups").delete().eq("id", existing.id)
      if (error) return notify(error.message)
      notify("Modifier group unassigned")
    } else {
      const { error } = await supabaseCloud.from("menu_item_modifier_groups").insert({
        restaurant_id: rid,
        menu_item_id: menuItemId,
        modifier_group_id: groupId
      })
      if (error) return notify(error.message)
      notify("Modifier group assigned")
    }
  }

  async function isMenuGroupAssigned(menuItemId, groupId) {
    const { data } = await supabaseCloud.from("menu_item_modifier_groups").select("id").eq("restaurant_id", rid).eq("menu_item_id", menuItemId).eq("modifier_group_id", groupId).maybeSingle()
    return !!data
  }

  async function addExpense(e) {
    e.preventDefault()
    if (!Number(ef.amount)) return notify("Enter an expense amount")
    const { data: u } = await supabaseCloud.auth.getUser()
    const { error } = await supabaseCloud.from("expenses").insert({
      restaurant_id: rid,
      ...ef,
      amount: Number(ef.amount),
      created_by: u?.user?.id || null,
    })
    if (error) return notify(error.message)
    setEf({ category: "General", description: "", amount: "", payment_method: "cash" })
    await loadExpenses(rid)
    notify("Expense saved")
  }

  async function clockIn() {
    const { data: u } = await supabaseCloud.auth.getUser()
    if (!u?.user) return
    const { data: open } = await supabaseCloud.from("staff_attendance").select("id").eq("restaurant_id", rid).eq("staff_id", u.user.id).is("clock_out", null).limit(1).maybeSingle()
    if (open) return notify("You are already clocked in")
    const { error } = await supabaseCloud.from("staff_attendance").insert({ restaurant_id: rid, staff_id: u.user.id })
    if (error) return notify(error.message)
    await loadAttendance(rid)
    notify("Clocked in")
  }

  async function clockOut(id) {
    const { error } = await supabaseCloud.from("staff_attendance").update({ clock_out: new Date().toISOString() }).eq("id", id).eq("restaurant_id", rid)
    if (error) return notify(error.message)
    await loadAttendance(rid)
    notify("Clocked out")
  }

  async function createKotForOrder(order) {
    if (!order?.id || !rid) return notify("Select a valid active order")
    setKotBusy(order.id)
    try {
      const { data: existing } = await supabaseCloud
        .from("kot_tickets")
        .select("id,status")
        .eq("restaurant_id", rid)
        .eq("order_id", order.id)
        .not("status", "in", '("served","cancelled")')
        .limit(1)
        .maybeSingle()

      if (existing) {
        notify("An active KOT already exists for this order")
        return
      }

      const { error } = await supabaseCloud.from("kot_tickets").insert({
        restaurant_id: rid,
        order_id: order.id,
        status: "new"
      })
      if (error) throw new Error(error.message)
      await loadKots(rid)
      notify(`KOT created for ${order.source_label || "order"}`)
    } catch (e) {
      console.error("CREATE KOT ERROR", e)
      notify(e.message || "Unable to create KOT")
    } finally {
      setKotBusy(null)
    }
  }

  async function updateKotStatus(kot, status) {
    const { error } = await supabaseCloud
      .from("kot_tickets")
      .update({ status, printed_at: status === "new" ? null : kot.printed_at })
      .eq("id", kot.id)
      .eq("restaurant_id", rid)
    if (error) return notify(error.message)
    await loadKots(rid)
    notify(`KOT marked ${status}`)
  }

  async function printKotThermal(kot) {
    try {
      const { data: orderItems } = await supabaseCloud.from("order_items").select("item_name,quantity,cooking_request").eq("order_id", kot.order_id)
      const content = [
        name || "Restaurant",
        "KITCHEN ORDER TICKET",
        `KOT #${kot.kot_no || kot.id.slice(0,6).toUpperCase()}`,
        `Order: ${orders.find(o => o.id === kot.order_id)?.source_label || "Order"}`,
        formatIndiaDateTime(kot.created_at),
        "------------------------------",
        ...(orderItems || []).flatMap(i => [`${i.quantity || 0} x ${i.item_name || "Item"}`, i.cooking_request ? `NOTE: ${i.cooking_request}` : null].filter(Boolean)),
        "------------------------------",
        `Status: ${String(kot.status || "new").toUpperCase()}`,
        "Kitchen Copy"
      ]
      await sendThermalPrint({ type: "kot", content: content.join("\n"), data: { order_id: kot.order_id, kot_id: kot.id, size: "80mm" } })
      notify("Thermal KOT sent to printer")
    } catch (e) { notify(e.message || "Thermal KOT print failed") }
  }

  async function printKot(kot, reprint = false) {
    if (!kot?.id) return notify("KOT not found")
    try {
      const order = orders.find(o => o.id === kot.order_id)
      const { data: orderItems, error: itemError } = await supabaseCloud
        .from("order_items")
        .select("item_id,item_name,quantity,cooking_request")
        .eq("order_id", kot.order_id)
      if (itemError) throw itemError

      const itemIds = (orderItems || []).map(i => i.item_id).filter(Boolean)
      const { data: menuRows, error: menuError } = itemIds.length
        ? await supabaseCloud.from("menu_items").select("id,name").in("id", itemIds)
        : { data: [], error: null }
      if (menuError) throw menuError

      const menuMap = new Map((menuRows || []).map(m => [String(m.id), m.name]))
      const escape = value => String(value ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#039;")
      const itemsHtml = (orderItems || []).map(i => `
        <div class="item">
          <div class="itemRow"><span>${escape(i.item_name || menuMap.get(String(i.item_id)) || "Item")}</span><b>×${Number(i.quantity || 0)}</b></div>
          ${i.cooking_request ? `<div class="note">Note: ${escape(i.cooking_request)}</div>` : ""}
        </div>`).join("")

      const html = `
        <main class="kot">
          <header>
            <div class="title">KITCHEN ORDER TICKET</div>
            <div class="restaurant">${escape(name || "Restaurant")}</div>
            <div class="meta">KOT #${escape(kot.kot_no || kot.id.slice(0,6).toUpperCase())}</div>
            <div class="meta">${escape(order?.source_label || "Order")}</div>
            <div class="meta">${escape(formatIndiaDateTime(kot.created_at))}</div>
          </header>
          <div class="line"></div>
          <section>${itemsHtml || "<div>No items found</div>"}</section>
          <div class="line"></div>
          <div class="status"><span>Status</span><b>${escape(String(kot.status || "new").toUpperCase())}</b></div>
          <div class="foot">Kitchen Copy • KOT ${escape(String(kot.id || "").slice(0,8))}</div>
        </main>
        <style>
          @page{size:A5 portrait;margin:0}
          html,body{margin:0;padding:0;width:148mm;min-width:148mm;max-width:148mm;min-height:210mm;background:#fff;color:#111}
          *{box-sizing:border-box}
          .kot{width:148mm;min-height:210mm;padding:12mm 12mm 10mm;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.35}
          header{text-align:center}.title{font-size:22px;font-weight:900;letter-spacing:.7px}.restaurant{font-size:18px;font-weight:900;margin-top:5px}.meta{font-size:11px;color:#555;margin-top:2px}.line{border-top:1px dashed #555;margin:10px 0}.item{padding:8px 0;border-bottom:1px dotted #aaa;break-inside:avoid}.itemRow{display:flex;justify-content:space-between;gap:12px;font-size:15px;font-weight:800}.note{font-size:11px;color:#555;margin-top:3px}.status{display:flex;justify-content:space-between;font-size:12px}.foot{text-align:center;font-size:10px;color:#666;margin-top:18px}
          @media print{html,body{width:148mm!important;min-width:148mm!important;max-width:148mm!important;min-height:210mm!important}.kot{width:148mm!important;min-height:210mm!important}}
        </style>`

      await printHtmlInFrame(html, { title: `KOT ${kot.kot_no || ""}`, width: "148mm", height: "210mm" })

      const { error } = await supabaseCloud.from("kot_tickets").update({
        printed_at: new Date().toISOString(),
        reprint_count: Number(kot.reprint_count || 0) + (reprint ? 1 : 0)
      }).eq("id", kot.id).eq("restaurant_id", rid)
      if (error) return notify(error.message)
      // Refresh only this KOT list; the rest of the Operations Hub state stays intact.
      await loadKots(rid)
    } catch (e) {
      notify(e.message || "Unable to print KOT")
    }
  }

  async function deleteExpense(id) {
    const { error } = await supabaseCloud.from("expenses").delete().eq("id", id).eq("restaurant_id", rid)
    if (error) return notify(error.message)
    await loadExpenses(rid)
    notify("Expense deleted")
  }

  async function deleteCustomer(id) {
    if (!window.confirm("Delete this customer profile?")) return
    const { error } = await supabaseCloud.from("customers").delete().eq("id", id).eq("restaurant_id", rid)
    if (error) return notify(error.message)
    await loadCustomers(rid)
    notify("Customer deleted")
  }

  async function adjustLoyalty(customer, delta) {
    if (!rid || !customer?.id) return notify("Customer or restaurant is not ready")
    const current = Number(customer.loyalty_points || 0)
    const next = Math.max(0, current + Number(delta || 0))
    if (delta < 0 && next === current) return notify("Not enough points")

    const { error: updateError } = await supabaseCloud
      .from("customers")
      .update({ loyalty_points: next, updated_at: new Date().toISOString() })
      .eq("id", customer.id)
      .eq("restaurant_id", rid)

    if (updateError) return notify(`Points update failed: ${updateError.message}`)

    const { error: txError } = await supabaseCloud
      .from("loyalty_transactions")
      .insert({
        restaurant_id: rid,
        customer_id: customer.id,
        points: Number(delta),
        transaction_type: delta >= 0 ? "earn" : "redeem",
        note: delta >= 0 ? "Manual points added" : "Manual points redeemed"
      })

    if (txError) {
      await supabaseCloud
        .from("customers")
        .update({ loyalty_points: current, updated_at: new Date().toISOString() })
        .eq("id", customer.id)
        .eq("restaurant_id", rid)
      setLoyaltyError(txError.message || "Loyalty transaction could not be saved.")
      return notify(`Loyalty save failed: ${txError.message}`)
    }

    await Promise.all([loadCustomers(rid), loadLoyaltyTransactions(rid)])
    notify(delta >= 0 ? `+${delta} points added` : `${Math.abs(delta)} points redeemed`)
  }

  function getCustomerTier(points) {
    const ordered = [...loyaltyTiers].filter(t => t.active !== false).sort((a, b) => Number(b.min_points || 0) - Number(a.min_points || 0))
    return ordered.find(t => Number(points || 0) >= Number(t.min_points || 0)) || null
  }

  async function saveLoyaltySettings(e) {
    e.preventDefault()
    if (!rid) return
    setLoyaltySaving(true)
    const payload = {
      restaurant_id: rid,
      enabled: !!loyaltySettings.enabled,
      points_per_rupee: Math.max(0, Number(loyaltySettings.points_per_rupee || 0)),
      min_bill_amount: Math.max(0, Number(loyaltySettings.min_bill_amount || 0)),
      max_points_per_order: loyaltySettings.max_points_per_order === "" ? null : Math.max(0, Number(loyaltySettings.max_points_per_order)),
      expiry_days: loyaltySettings.expiry_days === "" ? null : Math.max(1, Number(loyaltySettings.expiry_days)),
      review_reward_points: Math.max(0, Number(loyaltySettings.review_reward_points || 0)),
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabaseCloud.from("loyalty_settings").upsert(payload, { onConflict: "restaurant_id" })
    setLoyaltySaving(false)
    if (error) return notify(`Loyalty settings failed: ${error.message}`)
    setLoyaltySettings({ ...loyaltySettings, ...payload })
    notify("Loyalty rules saved")
  }

  async function addLoyaltyTier(e) {
    e.preventDefault()
    if (!rid || !tierForm.name.trim()) return notify("Enter tier name")
    const { error } = await supabaseCloud.from("loyalty_tiers").insert({
      restaurant_id: rid, name: tierForm.name.trim(), min_points: Number(tierForm.min_points || 0), multiplier: Number(tierForm.multiplier || 1), benefits: tierForm.benefits.trim() || null, sort_order: loyaltyTiers.length + 1, active: true
    })
    if (error) return notify(error.message)
    setTierForm({ name: "", min_points: "", multiplier: "1", benefits: "" })
    await loadAdvancedLoyalty(rid)
    notify("Tier created")
  }

  async function addLoyaltyReward(e) {
    e.preventDefault()
    if (!rid || !rewardForm.name.trim()) return notify("Enter reward name")
    const { error } = await supabaseCloud.from("loyalty_rewards").insert({
      restaurant_id: rid, name: rewardForm.name.trim(), description: rewardForm.description.trim() || null, points_cost: Number(rewardForm.points_cost || 0), reward_type: rewardForm.reward_type, reward_value: Number(rewardForm.reward_value || 0), min_order_amount: Number(rewardForm.min_order_amount || 0), usage_limit: rewardForm.usage_limit === "" ? null : Number(rewardForm.usage_limit), expires_days: rewardForm.expires_days === "" ? null : Number(rewardForm.expires_days), active: true
    })
    if (error) return notify(error.message)
    setRewardForm({ name: "", description: "", points_cost: "", reward_type: "discount", reward_value: "", min_order_amount: "", usage_limit: "", expires_days: "" })
    await loadAdvancedLoyalty(rid)
    notify("Reward created")
  }

  async function addLoyaltyCampaign(e) {
    e.preventDefault()
    if (!rid || !campaignForm.name.trim()) return notify("Enter campaign name")
    const { error } = await supabaseCloud.from("loyalty_campaigns").insert({
      restaurant_id: rid, name: campaignForm.name.trim(), description: campaignForm.description.trim() || null, bonus_points: Number(campaignForm.bonus_points || 0), starts_at: campaignForm.starts_at || null, ends_at: campaignForm.ends_at || null, active: true
    })
    if (error) return notify(error.message)
    setCampaignForm({ name: "", description: "", bonus_points: "", starts_at: "", ends_at: "" })
    await loadAdvancedLoyalty(rid)
    notify("Campaign created")
  }

  async function redeemLoyaltyReward(customer, reward) {
    if (!rid || !customer || !reward) return
    const current = Number(customer.loyalty_points || 0)
    const cost = Number(reward.points_cost || 0)
    if (current < cost) return notify("Customer does not have enough points")
    if (!reward.active) return notify("Reward is inactive")
    if (reward.usage_limit != null && Number(reward.used_count || 0) >= Number(reward.usage_limit)) return notify("Reward usage limit reached")

    const next = current - cost
    const { error: customerError } = await supabaseCloud.from("customers").update({ loyalty_points: next, updated_at: new Date().toISOString() }).eq("id", customer.id).eq("restaurant_id", rid)
    if (customerError) return notify(`Redeem failed: ${customerError.message}`)

    const { data: userData } = await supabaseCloud.auth.getUser()
    const { error: txError } = await supabaseCloud.from("loyalty_transactions").insert({ restaurant_id: rid, customer_id: customer.id, points: -cost, transaction_type: "redeem", note: `Reward redeemed: ${reward.name}`, created_by: userData?.user?.id || null })
    const { error: redemptionError } = await supabaseCloud.from("loyalty_redemptions").insert({ restaurant_id: rid, customer_id: customer.id, reward_id: reward.id, points: cost, status: "redeemed", created_by: userData?.user?.id || null })
    if (txError || redemptionError) {
      await supabaseCloud.from("customers").update({ loyalty_points: current, updated_at: new Date().toISOString() }).eq("id", customer.id).eq("restaurant_id", rid)
      return notify(txError?.message || redemptionError?.message || "Reward redemption failed")
    }
    await supabaseCloud.from("loyalty_rewards").update({ used_count: Number(reward.used_count || 0) + 1 }).eq("id", reward.id).eq("restaurant_id", rid)
    await Promise.all([loadCustomers(rid), loadLoyaltyTransactions(rid), loadAdvancedLoyalty(rid)])
    const refreshed = { ...customer, loyalty_points: next }
    setSelectedLoyaltyCustomer(refreshed)
    notify(`${reward.name} redeemed for ${cost} points`)
  }

  async function createReferralCode(customer) {
    if (!rid || !customer) return
    const code = `${String(customer.name || "GUEST").replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase() || "GUEST"}${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    const { error } = await supabaseCloud.from("loyalty_referrals").insert({ restaurant_id: rid, referrer_customer_id: customer.id, code, status: "pending" })
    if (error) return notify(error.message)
    await loadAdvancedLoyalty(rid)
    notify(`Referral code ${code} created`)
  }

  async function toggleLoyaltyEntity(table, id, active) {
    const { error } = await supabaseCloud.from(table).update({ active: !active }).eq("id", id).eq("restaurant_id", rid)
    if (error) return notify(error.message)
    await loadAdvancedLoyalty(rid)
  }

  async function addFeedback(e) {
    e.preventDefault()
    const { error } = await supabaseCloud.from("customer_feedback").insert({ restaurant_id: rid, rating: Number(ff.rating), feedback: ff.feedback })
    if (error) return notify(error.message)
    setFf({ rating: 5, feedback: "" })
    await loadFeedback(rid)
    notify("Feedback saved")
  }

  async function permission(staffId, key, enabled) {
    const { error } = await supabaseCloud.from("staff_permissions").upsert(
      { restaurant_id: rid, staff_id: staffId, permission_key: key, enabled },
      { onConflict: "restaurant_id,staff_id,permission_key" }
    )
    if (error) return notify(error.message)
    notify("Permission updated")
  }

  const expenseTotal = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount || 0), 0), [expenses])
  const avgRating = useMemo(() => feedback.length ? feedback.reduce((s, f) => s + Number(f.rating || 0), 0) / feedback.length : 0, [feedback])
  const today = new Date().toISOString().slice(0, 10)
  const todayOrders = useMemo(() => orders.filter((o) => String(o.created_at || "").slice(0, 10) === today), [orders, today])
  const pending = orders.filter((o) => ["pending", "new"].includes(String(o.status || "").toLowerCase())).length
  const preparing = orders.filter((o) => ["preparing", "in_kitchen", "in-kitchen"].includes(String(o.status || "").toLowerCase())).length
  const ready = orders.filter((o) => String(o.status || "").toLowerCase() === "ready").length
  const openAttendance = attendance.filter((a) => !a.clock_out).length


  if(!pluginEnabled) return <main style={{minHeight:"100vh",padding:"40px",display:"grid",placeItems:"center",background:"var(--background)",color:"var(--text)"}}>
    <div style={{maxWidth:620,padding:32,borderRadius:24,background:"var(--surface)",border:"1px solid var(--border)",textAlign:"center"}}>
      <div style={{fontSize:48}}>🔒</div>
      <div style={{fontSize:11,fontWeight:900,letterSpacing:1.5,color:"var(--primary)"}}>SUPER ADMIN CONTROL</div>
      <h1 style={{margin:"8px 0"}}>Operations Hub</h1>
      <p style={{color:"var(--muted)",lineHeight:1.6}}>The central restaurant operations workspace is controlled by Super Admin.</p>
      <p style={{fontSize:12,color:"var(--muted)"}}>This module is locked until Super Admin activates its plugin for this restaurant.</p>
      <a href="/dashboard" style={{display:"inline-block",marginTop:10,padding:"11px 16px",borderRadius:12,background:"var(--primary)",color:"var(--text)",textDecoration:"none",fontWeight:800}}>← Back to Dashboard</a>
    </div>
  </main>

  if (loading) return <div style={page}><div style={hero}><div><div style={eyebrow}>ANAIRA POS • OPERATIONS HUB</div><h1 style={heroTitle}>Loading restaurant operations…</h1></div></div></div>

  return (
    <div style={page} className="operations-page">
      <style>{`
        .operations-page input,.operations-page select,.operations-page textarea{box-sizing:border-box;min-width:0}
        @media(max-width:1100px){.operations-page .purposeGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.operations-page .grid4{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media(max-width:760px){.operations-page{padding:14px 10px 35px!important}.operations-page .purposeGrid{grid-template-columns:1fr!important}.operations-page .featureList{grid-template-columns:1fr!important}.operations-page .grid4{grid-template-columns:1fr 1fr!important}.operations-page .loyaltyHero{grid-template-columns:1fr!important}.operations-page .loyalty-form2{grid-template-columns:1fr!important}.operations-page .loyalty-wallet{grid-template-columns:1fr!important}.operations-page .loyaltyMemberActions{width:100%;justify-content:flex-start}.operations-page .row{align-items:flex-start;flex-wrap:wrap}.operations-page .heroStats{min-width:100%!important}.operations-page .tabs{overflow-x:auto;flex-wrap:nowrap!important}.operations-page .tabs button{flex:0 0 auto}.operations-main .metric{min-height:96px;padding:14px 15px}.operations-main .operations-metric-value{font-size:26px}.operations-main .feature{grid-template-columns:40px minmax(0,1fr) auto;gap:10px}.operations-main .featureAction{padding:5px 7px}.operations-main .featureAction span{font-size:9px}}

        .operations-page{
          --ops-border: var(--border, rgba(148,163,184,.18));
          --ops-surface: var(--surface, var(--text));
          --ops-bg: var(--background, #f6f8fb);
          --ops-text: var(--text, var(--surface));
          --ops-muted: var(--muted, var(--muted));
        }
        .operations-page .operations-workspace{
          max-width:1480px;
          margin:0 auto;
          display:grid;
          grid-template-columns:250px minmax(0,1fr);
          gap:22px;
          align-items:start;
        }
        .operations-sidebar{
          position:sticky;
          top:18px;
          padding:14px;
          border:1px solid var(--ops-border);
          background:var(--ops-surface);
          border-radius:20px;
          box-shadow:0 12px 36px rgba(15,23,42,.06);
        }
        .operations-sidebar-head{
          display:flex;
          align-items:center;
          gap:11px;
          padding:9px 8px 18px;
          border-bottom:1px solid var(--ops-border);
        }
        .operations-sidebar-icon{
          width:38px;height:38px;border-radius:12px;display:grid;place-items:center;
          background:rgba(var(--primary-rgb),.10);font-size:18px;
        }
        .operations-sidebar-kicker,.operations-section-kicker{
          font-size:10px;font-weight:900;letter-spacing:1.4px;color:var(--ops-muted);
          text-transform:uppercase;
        }
        .operations-sidebar-head strong{display:block;margin-top:2px;font-size:15px;color:var(--ops-text)}
        .operations-sidebar-label{
          padding:18px 9px 8px;font-size:10px;font-weight:900;letter-spacing:1.3px;color:var(--ops-muted);
        }
        .operations-nav{display:grid;gap:4px}
        .operations-nav-item{
          position:relative;width:100%;display:grid;grid-template-columns:34px minmax(0,1fr) auto;
          align-items:center;gap:9px;text-align:left;padding:10px 9px;border-radius:12px;
          border:1px solid transparent;background:transparent;color:var(--ops-muted);
          cursor:pointer;transition:.15s ease;
        }
        .operations-nav-item:hover{background:rgba(var(--primary-rgb),.045);color:var(--ops-text)}
        .operations-nav-item.active{
          background:rgba(var(--primary-rgb),.09);
          border-color:rgba(var(--primary-rgb),.18);
          color:var(--primary);
        }
        .operations-nav-icon{
          width:34px;height:34px;border-radius:10px;display:grid;place-items:center;
          background:rgba(148,163,184,.08);font-size:16px;
        }
        .operations-nav-item.active .operations-nav-icon{background:rgba(var(--primary-rgb),.12)}
        .operations-nav-title{font-size:13px;font-weight:800}
        .operations-nav-dot{width:5px;height:5px;border-radius:50%;background:var(--primary)}
        .operations-sidebar-foot{
          display:flex;gap:9px;align-items:center;margin:16px 3px 2px;padding:12px 10px;
          border-radius:13px;background:var(--ops-bg);border:1px solid var(--ops-border);
        }
        .operations-sidebar-foot b{display:block;font-size:11px;color:var(--ops-text)}
        .operations-sidebar-foot small{display:block;margin-top:2px;font-size:10px;color:var(--ops-muted)}
        .operations-live-dot{width:8px;height:8px;border-radius:50%;background:var(--success);box-shadow:0 0 0 4px rgba(34,197,94,.10)}
        .operations-main{min-width:0}
        .operations-section-bar{
          display:flex;align-items:center;justify-content:space-between;gap:16px;
          margin-bottom:18px;padding:16px 20px;border:1px solid var(--ops-border);
          background:var(--ops-surface);border-radius:17px;
        }
        .operations-section-bar h2{margin:3px 0 0;font-size:20px;letter-spacing:-.025em;color:var(--ops-text)}
        .operations-section-meta{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
        .operations-section-meta span{
          padding:7px 10px;border-radius:999px;background:var(--ops-bg);
          border:1px solid var(--ops-border);font-size:10px;font-weight:800;color:var(--ops-muted);
        }
        .operations-main #operations-content{max-width:none!important;margin:0!important}
        .operations-main .stack{gap:20px}
        .operations-main .grid{gap:20px}
        .operations-main .card{min-width:0}
        .operations-main .card h2{font-size:17px;color:var(--ops-text);letter-spacing:-.015em}
        .operations-main .card p{color:var(--ops-muted)}
        .operations-main .metric{min-width:0;align-content:center}
        .operations-main .operations-metric-label{display:block;font-size:11px;font-weight:800;line-height:1.35;color:var(--ops-muted);white-space:normal}
        .operations-main .operations-metric-value{display:block;font-size:30px;line-height:1.05;font-weight:950;letter-spacing:-.03em;color:var(--ops-text);overflow-wrap:anywhere}
        .operations-main .operations-metric-hint{display:block;font-size:10px;line-height:1.4;color:var(--ops-muted)}
        .operations-main .metric strong{color:var(--ops-text)}
        .operations-main .metric span,.operations-main .metric small{color:var(--ops-muted)}
        .operations-main .row b,.operations-main .row strong{color:var(--ops-text)}
        .operations-main .row small{color:var(--ops-muted)}
        .operations-main .feature b{color:var(--ops-text)}
        .operations-main .feature small{color:var(--ops-muted)}
        .operations-main .purpose p{color:var(--ops-muted)}
        @media(max-width:1050px){
          .operations-page .operations-workspace{grid-template-columns:215px minmax(0,1fr);gap:16px}
          .operations-sidebar{padding:11px}
        }
        @media(max-width:760px){
          .operations-page .operations-workspace{display:block}
          .operations-sidebar{position:relative;top:auto;margin-bottom:14px}
          .operations-sidebar-head{padding-bottom:12px}
          .operations-nav{
            display:flex;overflow-x:auto;gap:5px;padding-bottom:2px;
            scrollbar-width:none;
          }
          .operations-nav::-webkit-scrollbar{display:none}
          .operations-nav-item{
            flex:0 0 auto;grid-template-columns:32px auto;min-width:max-content;
            padding:8px 10px;
          }
          .operations-nav-title{font-size:12px}
          .operations-nav-action{display:none}
          .operations-nav-dot{display:none}
          .operations-sidebar-label,.operations-sidebar-foot{display:none}
          .operations-section-bar{padding:13px 15px;margin-bottom:13px}
          .operations-section-bar h2{font-size:17px}
          .operations-section-meta{display:none}
        }
        .operations-sidebar-hint{
          margin:0 8px 9px;
          font-size:10px;
          line-height:1.45;
          color:var(--ops-muted);
        }
        .operations-nav-action{
          min-width:34px;
          padding-left:4px;
          text-align:right;
          font-size:10px;
          font-weight:900;
          letter-spacing:.7px;
          color:var(--ops-muted);
        }
        .operations-nav-item.active .operations-nav-action{color:var(--primary)}
        .operations-nav-item:hover .operations-nav-action{color:var(--primary)}
        .operations-nav-item:not(.active)::after{
          content:"";
          position:absolute;
          left:8px;right:8px;bottom:-3px;height:1px;
          background:transparent;
        }
        .operations-main .feature{
          position:relative;
          min-width:0;
          box-shadow:0 2px 0 rgba(15,23,42,.02);
          transition:transform .15s ease, border-color .15s ease, box-shadow .15s ease;
        }
        .operations-main .feature:hover{
          transform:translateY(-1px);
          border-color:rgba(var(--primary-rgb),.28);
          box-shadow:0 10px 25px rgba(var(--primary-rgb),.07);
        }
        .featureAction{
          display:flex;
          align-items:center;
          justify-content:flex-end;
          gap:3px;
          white-space:nowrap;
          color:var(--primary);
          font-size:10px;
          font-weight:900;
          text-transform:uppercase;
          letter-spacing:.7px;
        }
        .featureAction{padding:6px 8px;border:1px solid rgba(var(--primary-rgb),.18);border-radius:9px;background:rgba(var(--primary-rgb),.06)}
        .featureAction b{font-size:16px;line-height:1}
      `}</style>
      <header style={hero}>
        <div style={{ minWidth: 280, flex: 1 }}>
          <div style={eyebrow}>ANAIRA POS • OPERATIONS HUB</div>
          <h1 style={heroTitle}>{name}</h1>
          <p style={heroText}>A single control center for the restaurant's people, customers, kitchen tickets, modifiers, expenses, loyalty and feedback.</p>
          <div style={heroNote}>● Live operations workspace • {tab === "overview" ? "Overview" : TABS.find(([id]) => id === tab)?.[1]?.replace(/^[^ ]+ /,"") || "Operations"}</div>
        </div>
        <div style={heroStats}>
          <Stat n={customers.length} l="Customers" />
          <Stat n={kots.length} l="KOTs" />
          <Stat n={money(expenseTotal)} l="Expenses" />
          <Stat n={avgRating ? `${avgRating.toFixed(1)}/5` : "—"} l="Rating" />
        </div>
      </header>

      <div style={purposeGrid}>
        <Purpose icon="👥" title="Customers" text="Maintain customer profiles, order history and loyalty information." />
        <Purpose icon="🍳" title="KOT" text="Create and track kitchen ticket records for active orders." />
        <Purpose icon="💸" title="Expenses" text="Record operational spending and view the restaurant expense total." />
        <Purpose icon="🔐" title="Staff" text="Attendance and permission controls for your team." />
      </div>

      <div className="operations-workspace">
        <aside className="operations-sidebar">
          <div className="operations-sidebar-head">
            <div className="operations-sidebar-icon">⚙</div>
            <div>
              <div className="operations-sidebar-kicker">WORKSPACE</div>
              <strong>Operations Hub</strong>
            </div>
          </div>

          <div className="operations-sidebar-label">MODULES</div>
          <div className="operations-sidebar-hint">Select an option to open that workspace.</div>
          <nav className="operations-nav" aria-label="Operations sections">
            {TABS.map(([id, label]) => {
              const icon = label.split(" ")[0]
              const title = label.replace(/^[^ ]+\s*/, "")
              return (
                <button
                  key={id}
                  type="button"
                  className={`operations-nav-item ${tab === id ? "active" : ""}`}
                  aria-current={tab === id ? "page" : undefined}
                  onClick={() => {
                    setTab(id)
                    window.requestAnimationFrame(() => {
                      document.getElementById("operations-content")?.scrollIntoView({ behavior: "smooth", block: "start" })
                    })
                  }}
                >
                  <span className="operations-nav-icon">{icon}</span>
                  <span className="operations-nav-title">{title}</span>
                  <span className="operations-nav-action">{tab === id ? "OPEN" : "›"}</span>
                </button>
              )
            })}
          </nav>

          <div className="operations-sidebar-foot">
            <span className="operations-live-dot" />
            <div>
              <b>Live workspace</b>
              <small>Restaurant operations</small>
            </div>
          </div>
        </aside>

        <main className="operations-main">
          <div className="operations-section-bar">
            <div>
              <div className="operations-section-kicker">CURRENT WORKSPACE</div>
              <h2>{TABS.find(([id]) => id === tab)?.[1]?.replace(/^[^ ]+\s*/, "") || "Overview"}</h2>
            </div>
            <div className="operations-section-meta">
              <span>{customers.length} customers</span>
              <span>{kots.length} KOTs</span>
            </div>
          </div>

      <div id="operations-content" style={{...contentAnchor, maxWidth:1480, margin:"0 auto"}}>

      {tab === "overview" && (
        <div style={stack}>
          <section style={grid4}>
            <Metric title="Today's orders" value={todayOrders.length} hint="Orders created today" />
            <Metric title="Pending" value={pending} hint="Waiting for kitchen" />
            <Metric title="Preparing" value={preparing} hint="Currently in kitchen" />
            <Metric title="Ready" value={ready} hint="Ready for service" />
          </section>

          <section style={grid}>
            <Card title="What Operations is for" subtitle="These tools manage the day-to-day restaurant workflow around your core POS.">
              <div style={featureList}>
                <Feature icon="👥" title="Customer CRM" text="Save customer details and build a reusable customer directory." onClick={() => setTab("customers")} />
                <Feature icon="➕" title="Menu modifiers" text="Create size, add-on and customization groups without changing menu prices." onClick={() => setTab("modifiers")} />
                <Feature icon="🍳" title="KOT records" text="Create kitchen tickets linked to active orders." onClick={() => setTab("kot")} />
                <Feature icon="💸" title="Expenses" text="Track operating expenses such as utilities, transport and supplies." onClick={() => setTab("expenses")} />
                <Feature icon="🕒" title="Attendance" text="Track staff clock-in and clock-out records." onClick={() => setTab("attendance")} />
                <Feature icon="⭐" title="Loyalty" text="See customer points and top customers." onClick={() => setTab("loyalty")} />
                <Feature icon="💬" title="Feedback" text="Store customer ratings and comments." onClick={() => setTab("feedback")} />
                <Feature icon="🔐" title="Permissions" text="Control which operational areas staff can access." onClick={() => setTab("permissions")} />
              </div>
            </Card>
            <Card title="Current activity" subtitle="A quick snapshot of what needs attention now.">
              <div style={activityList}>
                <Activity label="Open attendance" value={openAttendance} tone="info" />
                <Activity label="Active KOTs" value={kots.filter(k => !["served", "completed"].includes(String(k.status || "").toLowerCase())).length} tone="warning" />
                <Activity label="Customers" value={customers.length} tone="success" />
                <Activity label="Reviews" value={feedback.length} tone="neutral" />
              </div>
            </Card>
          </section>
        </div>
      )}

      {tab === "customers" && <div style={grid}>
        <Card title="Add customer" subtitle="Create a restaurant-scoped customer profile.">
          <form onSubmit={addCustomer} style={form}>
            <Field label="Customer name *"><input placeholder="e.g. Rahul Sharma" value={cf.name} onChange={e => setCf({ ...cf, name: e.target.value })} /></Field>
            <Field label="Mobile"><input placeholder="10 digit mobile" value={cf.phone} onChange={e => setCf({ ...cf, phone: e.target.value })} /></Field>
            <Field label="Email"><input type="email" placeholder="customer@email.com" value={cf.email} onChange={e => setCf({ ...cf, email: e.target.value })} /></Field>
            <button style={primary}>＋ Add Customer</button>
          </form>
        </Card>
        <Card title={`Customer directory • ${customers.length}`} subtitle="Search, manage and adjust loyalty points.">
          <input style={searchInput} placeholder="Search name, phone or email…" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
          <List>{customers.filter(c => `${c.name} ${c.phone || ""} ${c.email || ""}`.toLowerCase().includes(customerSearch.toLowerCase())).map(c =>
            <Row key={c.id}>
              <div style={{minWidth:0}}><b>{c.name}</b><small>{c.phone || "No phone"}{c.email ? ` • ${c.email}` : ""}</small></div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
                <strong>{c.loyalty_points || 0} pts</strong>
                <button style={mini} onClick={() => adjustLoyalty(c, 10)}>+10</button>
                <button style={mini} onClick={() => adjustLoyalty(c, -10)}>-10</button>
                <button style={dangerMini} onClick={() => deleteCustomer(c.id)}>Delete</button>
              </div>
            </Row>
          )}</List>
        </Card>
      </div>}

      {tab === "modifiers" && <div style={grid}><Card title="Modifier groups" subtitle="Examples: Size, Add-ons, Spice level."><form onSubmit={addGroup} style={form}><Field label="Group name"><input placeholder="e.g. Add-ons" value={gf.name} onChange={e => setGf({ ...gf, name: e.target.value })} /></Field><Field label="Selection"><select value={gf.selection_type} onChange={e => setGf({ ...gf, selection_type: e.target.value })}><option value="single">Single choice</option><option value="multiple">Multiple choice</option></select></Field><Field label="Minimum choices"><input type="number" min="0" step="1" value={gf.min_select} onChange={e => setGf({ ...gf, min_select: e.target.value })} /></Field><Field label="Maximum choices"><input type="number" min="0" step="1" placeholder="No limit" value={gf.max_select} onChange={e => setGf({ ...gf, max_select: e.target.value })} /></Field><label style={check}><input type="checkbox" checked={gf.required} onChange={e => setGf({ ...gf, required: e.target.checked })} /> Required selection</label><button style={primary}>Create Group</button></form><hr style={divider} /><form onSubmit={addMod} style={form}><Field label="Group"><select value={mf.group_id} onChange={e => setMf({ ...mf, group_id: e.target.value })}><option value="">Choose group</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field><Field label="Modifier name"><input placeholder="e.g. Extra Cheese" value={mf.name} onChange={e => setMf({ ...mf, name: e.target.value })} /></Field><Field label="Additional price"><input type="number" min="0" step="0.01" placeholder="0" value={mf.price} onChange={e => setMf({ ...mf, price: e.target.value })} /></Field><button style={primary}>Add Modifier</button></form></Card><Card title="Modifier catalog" subtitle={`${groups.length} groups • ${mods.length} modifiers`}><List>{groups.map(g => <div key={g.id} style={group}><b>{g.name}</b><small>{g.selection_type} • {g.required ? "required" : "optional"}</small>{mods.filter(m => m.group_id === g.id).map(m => <Row key={m.id}><span>{m.name}</span><strong>{money(m.price)}</strong></Row>)}</div>)}</List></Card>
        <Card title="Assign modifiers to menu items" subtitle="This makes the modifier picker appear when staff adds that item to an order.">
          <Field label="Menu item"><select value={selectedMenuItem} onChange={e => setSelectedMenuItem(e.target.value)}><option value="">Choose menu item</option>{menuItems.map(m => <option key={m.id} value={m.id}>{m.name} • {money(m.price)}</option>)}</select></Field>
          {selectedMenuItem && <div style={{display:"grid",gap:8,marginTop:14}}>{groups.map(g => <ModifierAssignment key={g.id} rid={rid} menuItemId={selectedMenuItem} group={g} onToggle={toggleMenuModifierGroup} />)}</div>}
        </Card></div>}

      {tab === "kot" && <div style={stack}>
        <section style={grid4}>
          <Metric title="Active orders" value={orders.filter(o => ["pending","preparing","ready"].includes(String(o.status || "").toLowerCase())).length} hint="Available for KOT" />
          <Metric title="New KOTs" value={kots.filter(k => k.status === "new").length} hint="Waiting for kitchen" />
          <Metric title="Preparing" value={kots.filter(k => k.status === "preparing").length} hint="In kitchen" />
          <Metric title="Ready" value={kots.filter(k => k.status === "ready").length} hint="For service" />
        </section>
        <div style={grid}>
          <Card title="Create KOT" subtitle="Choose the exact active order. No more hidden/automatic selection.">
            <div style={callout}><b>How it works</b><span>Pick an active order → create KOT → print → move it through the kitchen workflow. The live Kitchen screen remains separate.</span></div>
            <List>{orders.filter(o => ["pending","preparing","ready"].includes(String(o.status || "").toLowerCase())).slice(0, 30).map(o =>
              <Row key={o.id}>
                <div><b>{o.source_label || "Order"}</b><small>{String(o.status).toUpperCase()} • ₹{Number(o.total_amount || 0).toLocaleString("en-IN")}</small></div>
                <button style={primarySmall} disabled={kotBusy === o.id} onClick={() => createKotForOrder(o)}>{kotBusy === o.id ? "Creating…" : "Create KOT"}</button>
              </Row>
            )}</List>
          </Card>
          <Card title="KOT queue" subtitle="Print, reprint and update kitchen status.">
            <div style={filterBar}>{["all","new","preparing","ready","served"].map(f => <button key={f} style={filterBtn(kotFilter === f)} onClick={() => setKotFilter(f)}>{f}</button>)}</div>
            <List>{kots.filter(k => kotFilter === "all" || k.status === kotFilter).map(k =>
              <Row key={k.id}>
                <div><b>KOT #{k.kot_no || k.id.slice(0,6).toUpperCase()}</b><small>{orders.find(o => o.id === k.order_id)?.source_label || `Order ${k.order_id?.slice(0,8)}`} • {formatIndiaDateTime(k.created_at)}</small></div>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
                  <select value={k.status} onChange={e => updateKotStatus(k, e.target.value)} style={miniSelect}><option value="new">New</option><option value="preparing">Preparing</option><option value="ready">Ready</option><option value="served">Served</option><option value="cancelled">Cancelled</option></select>
                  <button style={mini} onClick={() => printKot(k, false)}>Print</button>
                  <button style={mini} onClick={() => printKot(k, true)}>Reprint</button>
                  <button style={mini} onClick={() => printKotThermal(k)}>Thermal 80mm</button>
                </div>
              </Row>
            )}</List>
          </Card>
        </div>
      </div>}

      {tab === "expenses" && <div style={grid}><Card title="Record expense" subtitle="For operating costs and restaurant administration."><form onSubmit={addExpense} style={form}><Field label="Category"><input placeholder="General / Electricity / Transport" value={ef.category} onChange={e => setEf({ ...ef, category: e.target.value })} /></Field><Field label="Description"><input placeholder="Short description" value={ef.description} onChange={e => setEf({ ...ef, description: e.target.value })} /></Field><Field label="Amount"><input type="number" min="0" step="0.01" placeholder="₹0" value={ef.amount} onChange={e => setEf({ ...ef, amount: e.target.value })} /></Field><Field label="Payment method"><select value={ef.payment_method} onChange={e => setEf({ ...ef, payment_method: e.target.value })}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option></select></Field><button style={primary}>Save Expense</button></form></Card><Card title={`Expense report • ${money(expenseTotal)}`} subtitle="Latest 100 records"><List>{expenses.map(e => <Row key={e.id}><div><b>{e.category}</b><small>{e.description || "No description"} • {e.expense_date}</small></div><div style={{display:"flex",gap:7,alignItems:"center"}}><strong>{money(e.amount)}</strong><button style={dangerMini} onClick={() => deleteExpense(e.id)}>Delete</button></div></Row>)}</List></Card></div>}

      {tab === "attendance" && <div style={grid}><Card title="My attendance" subtitle="Clock in/out for the current logged-in user."><button style={primary} onClick={clockIn}>🟢 Clock In</button><List>{attendance.slice(0, 30).map(a => <Row key={a.id}><div><b>{formatIndiaDate(a.clock_in)}</b><small>{formatIndiaTime(a.clock_in)} → {a.clock_out ? formatIndiaTime(a.clock_out) : "Active"}</small></div>{!a.clock_out && <button style={mini} onClick={() => clockOut(a.id)}>Clock Out</button>}</Row>)}</List></Card><Card title="Attendance overview" subtitle="Restaurant-scoped records"><Metric title="Records loaded" value={attendance.length} hint="Recent attendance entries" /><Metric title="Currently active" value={openAttendance} hint="Open clock-in records" /></Card></div>}

      {tab === "loyalty" && loyaltyEnabled && (() => {
        const q = loyaltySearch.trim().toLowerCase()
        const loyaltyCustomers = customers.filter(c => !q || `${c.name} ${c.phone || ""} ${c.email || ""}`.toLowerCase().includes(q))
        const pointsIssued = loyaltyTransactions.filter(t => Number(t.points) > 0).reduce((s, t) => s + Number(t.points || 0), 0)
        const pointsRedeemed = loyaltyTransactions.filter(t => Number(t.points) < 0).reduce((s, t) => s + Math.abs(Number(t.points || 0)), 0)
        const activeMembers = customers.filter(c => Number(c.loyalty_points || 0) > 0).length
        const topCustomers = [...customers].sort((a,b) => Number(b.loyalty_points||0) - Number(a.loyalty_points||0)).slice(0, 10)
        const selectedTier = selectedLoyaltyCustomer ? getCustomerTier(selectedLoyaltyCustomer.loyalty_points) : null
        return (
          <div style={stack}>
            <div style={loyaltySubTabs}>
              {[['overview','Overview'],['members','Members'],['rewards','Rewards'],['tiers','Tiers'],['rules','Points Rules'],['campaigns','Campaigns'],['referrals','Referrals'],['transactions','Transactions'],['analytics','Analytics']].map(([id,label]) => (
                <button type="button" key={id} onClick={() => setLoyaltySubTab(id)} style={loyaltySubTabBtn(loyaltySubTab === id)}>{label}</button>
              ))}
            </div>

            {loyaltySubTab === 'overview' && <div style={stack}>
              <section style={grid4}>
                <Metric title="Loyalty members" value={activeMembers} hint={`${customers.length} customer profiles`} />
                <Metric title="Points issued" value={pointsIssued.toLocaleString('en-IN')} hint="Loaded transaction history" />
                <Metric title="Points redeemed" value={pointsRedeemed.toLocaleString('en-IN')} hint="Loaded transaction history" />
                <Metric title="Outstanding points" value={customers.reduce((s,c)=>s+Number(c.loyalty_points||0),0).toLocaleString('en-IN')} hint="Current customer balances" />
              </section>
              <div className="loyaltyHero" style={loyaltyHeroCard}>
                <div><div style={eyebrow}>ANAIRA REWARDS ENGINE</div><h2 style={loyaltyHeroTitle}>Turn every order into a reason to return.</h2><p style={heroText}>Automatic points, membership tiers, rewards, referrals and campaigns — all restaurant-scoped.</p></div>
                <div style={loyaltyHeroBadge}><span>Current rule</span><strong>₹100 = {Math.round(Number(loyaltySettings.points_per_rupee || 0) * 100)} pts</strong><small>{loyaltySettings.enabled ? 'Rewards active' : 'Rewards paused'}</small></div>
              </div>
              <div style={grid}>
                <Card title="Top loyal customers" subtitle="Highest current point balances">
                  <List>{topCustomers.map(c => { const t = getCustomerTier(c.loyalty_points); return <Row key={c.id}><div><b>{c.name}</b><small>{c.phone || 'No phone'} • {t?.name || 'Bronze'}</small></div><strong>{Number(c.loyalty_points||0).toLocaleString('en-IN')} pts</strong></Row> })}</List>
                </Card>
                <Card title="Rewards snapshot" subtitle="What customers can redeem today">
                  <List>{loyaltyRewards.filter(r=>r.active).slice(0,8).map(r => <Row key={r.id}><div><b>{r.name}</b><small>{r.description || r.reward_type}</small></div><strong>{r.points_cost} pts</strong></Row>)}{!loyaltyRewards.length && <div style={muted}>Create your first reward in Rewards.</div>}</List>
                </Card>
              </div>
            </div>}

            {loyaltySubTab === 'members' && <div style={grid}>
              <Card title="Member directory" subtitle="Search customers, open their profile and redeem rewards.">
                <input style={searchInput} placeholder="Search customer / mobile / email…" value={loyaltySearch} onChange={e=>setLoyaltySearch(e.target.value)} />
                <List>{loyaltyCustomers.map(c => { const t=getCustomerTier(c.loyalty_points); return <Row key={c.id}><div style={{minWidth:0}}><b>{c.name}</b><small>{c.phone || 'No phone'} • {c.total_orders || 0} orders • {money(c.total_spend)}</small></div><div style={loyaltyMemberActions}><span style={tierBadge}>{t?.name || 'Bronze'}</span><strong>{Number(c.loyalty_points||0).toLocaleString('en-IN')} pts</strong><button type="button" style={primarySmall} onClick={()=>setSelectedLoyaltyCustomer(c)}>Open</button></div></Row> })}{!loyaltyCustomers.length && <div style={muted}>No loyalty members match your search.</div>}</List>
              </Card>
              <Card title={selectedLoyaltyCustomer ? selectedLoyaltyCustomer.name : 'Customer profile'} subtitle={selectedLoyaltyCustomer ? 'Loyalty wallet and reward actions' : 'Select a customer from the directory.'}>
                {selectedLoyaltyCustomer ? <div style={stack}>
                  <div className="loyalty-wallet" style={customerWallet}><div><span>Current points</span><strong>{Number(selectedLoyaltyCustomer.loyalty_points||0).toLocaleString('en-IN')}</strong><small>{selectedTier?.name || 'Bronze'} member</small></div><div><span>Total spend</span><strong>{money(selectedLoyaltyCustomer.total_spend)}</strong><small>{selectedLoyaltyCustomer.total_orders || 0} orders</small></div></div>
                  <div style={callout}><b>{selectedTier?.name || 'Bronze'} tier</b><span>{selectedTier?.benefits || 'Base loyalty membership'} • {selectedTier?.multiplier || 1}× points multiplier</span></div>
                  <div><b>Redeem a reward</b><List>{loyaltyRewards.filter(r=>r.active).map(r=><Row key={r.id}><div><b>{r.name}</b><small>{r.description || `${r.reward_type} • ${r.reward_value}`} • {r.min_order_amount ? `Min ${money(r.min_order_amount)}` : 'No minimum'}</small></div><button type="button" style={{...primarySmall, opacity:Number(selectedLoyaltyCustomer.loyalty_points||0)>=Number(r.points_cost)?1:.45}} onClick={()=>redeemLoyaltyReward(selectedLoyaltyCustomer,r)}>{r.points_cost} pts</button></Row>)}</List></div>
                  <button type="button" style={mini} onClick={()=>createReferralCode(selectedLoyaltyCustomer)}>🔗 Create referral code</button>
                </div> : <div style={muted}>Choose Open beside any customer.</div>}
              </Card>
            </div>}

            {loyaltySubTab === 'rewards' && <div style={grid}>
              <Card title="Create reward" subtitle="Build a reward catalogue for your members."><form onSubmit={addLoyaltyReward} style={form}><Field label="Reward name"><input placeholder="₹100 OFF" value={rewardForm.name} onChange={e=>setRewardForm({...rewardForm,name:e.target.value})}/></Field><Field label="Description"><input placeholder="For bills above ₹500" value={rewardForm.description} onChange={e=>setRewardForm({...rewardForm,description:e.target.value})}/></Field><div className="loyalty-form2" style={form2}><Field label="Points"><input type="number" min="1" value={rewardForm.points_cost} onChange={e=>setRewardForm({...rewardForm,points_cost:e.target.value})}/></Field><Field label="Type"><select value={rewardForm.reward_type} onChange={e=>setRewardForm({...rewardForm,reward_type:e.target.value})}><option value="discount">Flat discount</option><option value="percent">Percentage discount</option><option value="free_item">Free item</option><option value="coupon">Coupon</option></select></Field></div><div className="loyalty-form2" style={form2}><Field label="Value"><input type="number" min="0" value={rewardForm.reward_value} onChange={e=>setRewardForm({...rewardForm,reward_value:e.target.value})}/></Field><Field label="Min order"><input type="number" min="0" value={rewardForm.min_order_amount} onChange={e=>setRewardForm({...rewardForm,min_order_amount:e.target.value})}/></Field></div><button style={primary}>＋ Create Reward</button></form></Card>
              <Card title={`Reward catalogue • ${loyaltyRewards.length}`} subtitle="Activate or pause rewards without deleting history."><List>{loyaltyRewards.map(r=><Row key={r.id}><div><b>{r.name}</b><small>{r.points_cost} pts • {r.reward_type} • {r.used_count || 0}{r.usage_limit != null ? `/${r.usage_limit}` : ''} used</small></div><div style={loyaltyMemberActions}><span style={r.active?activeBadge:inactiveBadge}>{r.active?'Active':'Paused'}</span><button type="button" style={mini} onClick={()=>toggleLoyaltyEntity('loyalty_rewards',r.id,r.active)}>{r.active?'Pause':'Activate'}</button></div></Row>)}</List></Card>
            </div>}

            {loyaltySubTab === 'tiers' && <div style={grid}>
              <Card title="Membership tiers" subtitle="Tier is calculated from the customer's current points."><form onSubmit={addLoyaltyTier} style={form}><Field label="Tier name"><input placeholder="Gold" value={tierForm.name} onChange={e=>setTierForm({...tierForm,name:e.target.value})}/></Field><div className="loyalty-form2" style={form2}><Field label="Minimum points"><input type="number" min="0" value={tierForm.min_points} onChange={e=>setTierForm({...tierForm,min_points:e.target.value})}/></Field><Field label="Points multiplier"><input type="number" min="0.1" step="0.05" value={tierForm.multiplier} onChange={e=>setTierForm({...tierForm,multiplier:e.target.value})}/></Field></div><Field label="Benefits"><textarea rows="3" placeholder="10% bonus points + priority offers" value={tierForm.benefits} onChange={e=>setTierForm({...tierForm,benefits:e.target.value})}/></Field><button style={primary}>＋ Add Tier</button></form></Card>
              <Card title="Tier ladder" subtitle="Default tiers are seeded automatically."><List>{[...loyaltyTiers].sort((a,b)=>Number(a.min_points)-Number(b.min_points)).map(t=><Row key={t.id}><div><b>{t.name}</b><small>{Number(t.min_points).toLocaleString('en-IN')}+ points • {t.multiplier}× multiplier • {t.benefits || 'No benefits configured'}</small></div><span style={t.active?activeBadge:inactiveBadge}>{t.active?'Active':'Paused'}</span></Row>)}</List></Card>
            </div>}

            {loyaltySubTab === 'rules' && <div style={grid}>
              <Card title="Points engine" subtitle="Automatic points are awarded when a customer-linked order is paid/completed."><form onSubmit={saveLoyaltySettings} style={form}><label style={check}><input type="checkbox" checked={!!loyaltySettings.enabled} onChange={e=>setLoyaltySettings({...loyaltySettings,enabled:e.target.checked})}/> Enable loyalty engine</label><div className="loyalty-form2" style={form2}><Field label="Points per ₹1"><input type="number" min="0" step="0.01" value={loyaltySettings.points_per_rupee} onChange={e=>setLoyaltySettings({...loyaltySettings,points_per_rupee:e.target.value})}/></Field><Field label="Minimum bill"><input type="number" min="0" value={loyaltySettings.min_bill_amount} onChange={e=>setLoyaltySettings({...loyaltySettings,min_bill_amount:e.target.value})}/></Field></div><div className="loyalty-form2" style={form2}><Field label="Max points / order"><input type="number" min="0" placeholder="No cap" value={loyaltySettings.max_points_per_order} onChange={e=>setLoyaltySettings({...loyaltySettings,max_points_per_order:e.target.value})}/></Field><Field label="Point expiry (days)"><input type="number" min="1" placeholder="Never" value={loyaltySettings.expiry_days} onChange={e=>setLoyaltySettings({...loyaltySettings,expiry_days:e.target.value})}/></Field></div><Field label="Review reward points"><input type="number" min="0" value={loyaltySettings.review_reward_points} onChange={e=>setLoyaltySettings({...loyaltySettings,review_reward_points:e.target.value})}/></Field><button style={primary} disabled={loyaltySaving}>{loyaltySaving?'Saving…':'Save Loyalty Rules'}</button></form></Card>
              <Card title="How points work" subtitle="Simple rules your staff can explain to customers."><div style={callout}><b>Example</b><span>With 0.10 points/₹, a ₹1,000 paid order earns 100 points before tier multiplier and caps.</span></div><div style={activityList}><Activity label="Automatic earn" value={loyaltySettings.enabled?'ON':'OFF'} tone="success"/><Activity label="Minimum bill" value={money(loyaltySettings.min_bill_amount)} tone="info"/><Activity label="Expiry policy" value={loyaltySettings.expiry_days?`${loyaltySettings.expiry_days} days`:'Never'} tone="warning"/><Activity label="Review reward" value={`${Number(loyaltySettings.review_reward_points||0)} pts`} tone="neutral"/></div></Card>
            </div>}

            {loyaltySubTab === 'campaigns' && <div style={grid}>
              <Card title="Create campaign" subtitle="Prepare bonus-point campaigns for seasonal or retention offers."><form onSubmit={addLoyaltyCampaign} style={form}><Field label="Campaign name"><input placeholder="Weekend Double Points" value={campaignForm.name} onChange={e=>setCampaignForm({...campaignForm,name:e.target.value})}/></Field><Field label="Description"><input placeholder="Double points on Saturday and Sunday" value={campaignForm.description} onChange={e=>setCampaignForm({...campaignForm,description:e.target.value})}/></Field><Field label="Bonus points"><input type="number" min="0" value={campaignForm.bonus_points} onChange={e=>setCampaignForm({...campaignForm,bonus_points:e.target.value})}/></Field><div className="loyalty-form2" style={form2}><Field label="Starts"><input type="datetime-local" value={campaignForm.starts_at} onChange={e=>setCampaignForm({...campaignForm,starts_at:e.target.value})}/></Field><Field label="Ends"><input type="datetime-local" value={campaignForm.ends_at} onChange={e=>setCampaignForm({...campaignForm,ends_at:e.target.value})}/></Field></div><button style={primary}>＋ Create Campaign</button></form></Card>
              <Card title={`Campaigns • ${loyaltyCampaigns.length}`} subtitle="Activate or pause campaigns."><List>{loyaltyCampaigns.map(c=><Row key={c.id}><div><b>{c.name}</b><small>{c.bonus_points} bonus pts • {c.starts_at?formatIndiaDateTime(c.starts_at):'No start'}{c.ends_at?` → ${formatIndiaDateTime(c.ends_at)}`:''}</small></div><div style={loyaltyMemberActions}><span style={c.active?activeBadge:inactiveBadge}>{c.active?'Active':'Paused'}</span><button type="button" style={mini} onClick={()=>toggleLoyaltyEntity('loyalty_campaigns',c.id,c.active)}>{c.active?'Pause':'Activate'}</button></div></Row>)}</List></Card>
            </div>}

            {loyaltySubTab === 'referrals' && <div style={grid}>
              <Card title="Referral program" subtitle="Give loyal customers a shareable code. Qualification/reward can be expanded later without changing the customer wallet."><div style={callout}><b>Referral flow</b><span>Generate a unique code for a customer, share it, then mark the referral qualified when the referred guest completes the qualifying action.</span></div><List>{topCustomers.map(c=><Row key={c.id}><div><b>{c.name}</b><small>{Number(c.loyalty_points||0).toLocaleString('en-IN')} pts</small></div><button type="button" style={primarySmall} onClick={()=>createReferralCode(c)}>＋ Generate Code</button></Row>)}</List></Card>
              <Card title={`Referral codes • ${loyaltyReferrals.length}`} subtitle="Restaurant-scoped referral history."><List>{loyaltyReferrals.map(r=>{const c=customers.find(x=>x.id===r.referrer_customer_id); return <Row key={r.id}><div><b>{r.code}</b><small>{c?.name || 'Customer'} • {r.status} • {r.points_awarded || 0} pts</small></div><span style={r.status==='qualified'?activeBadge:inactiveBadge}>{r.status}</span></Row>})}{!loyaltyReferrals.length&&<div style={muted}>No referral codes created yet.</div>}</List></Card>
            </div>}

            {loyaltySubTab === 'transactions' && <div style={grid}><Card title="Points ledger" subtitle="Every earn, redeem, adjustment and expiry event."><List>{loyaltyTransactions.map(tx=>{const c=customers.find(x=>x.id===tx.customer_id); return <Row key={tx.id}><div><b>{c?.name || 'Customer'}</b><small>{tx.note || tx.transaction_type} • {formatIndiaDateTime(tx.created_at)}</small></div><strong style={{color:Number(tx.points)>=0?'#34d399':'#fb7185'}}>{Number(tx.points)>=0?'+':''}{tx.points}</strong></Row>})}{!loyaltyTransactions.length&&<div style={muted}>No loyalty transactions yet.</div>}</List></Card><Card title="Redemption history" subtitle="Rewards claimed by customers."><List>{loyaltyRedemptions.map(r=>{const c=customers.find(x=>x.id===r.customer_id); const rw=loyaltyRewards.find(x=>x.id===r.reward_id); return <Row key={r.id}><div><b>{c?.name || 'Customer'}</b><small>{rw?.name || 'Reward'} • {formatIndiaDateTime(r.created_at)}</small></div><strong>{r.points} pts</strong></Row>})}{!loyaltyRedemptions.length&&<div style={muted}>No rewards redeemed yet.</div>}</List></Card></div>}

            {loyaltySubTab === 'analytics' && <div style={stack}><section style={grid4}><Metric title="Repeat members" value={customers.filter(c=>Number(c.total_orders||0)>1).length} hint="More than one order"/><Metric title="Member revenue" value={money(customers.reduce((s,c)=>s+Number(c.total_spend||0),0))} hint="Tracked customer spend"/><Metric title="Avg points/member" value={activeMembers?Math.round(customers.reduce((s,c)=>s+Number(c.loyalty_points||0),0)/activeMembers):0} hint="Current balance"/><Metric title="Redemption rate" value={pointsIssued?`${Math.round(pointsRedeemed/pointsIssued*100)}%`:'0%'} hint="Redeemed / issued"/></section><div style={grid}><Card title="Tier distribution" subtitle="Current customers by points tier"><List>{[...loyaltyTiers].sort((a,b)=>Number(a.min_points)-Number(b.min_points)).map(t=>{const count=customers.filter(c=>getCustomerTier(c.loyalty_points)?.id===t.id).length; return <Row key={t.id}><div><b>{t.name}</b><small>{t.min_points}+ points</small></div><strong>{count}</strong></Row>})}</List></Card><Card title="Loyalty health" subtitle="Quick operational signals"><div style={activityList}><Activity label="Active members" value={activeMembers} tone="success"/><Activity label="Rewards available" value={loyaltyRewards.filter(r=>r.active).length} tone="info"/><Activity label="Campaigns live" value={loyaltyCampaigns.filter(c=>c.active).length} tone="warning"/><Activity label="Referral codes" value={loyaltyReferrals.length} tone="neutral"/></div></Card></div></div>}
          </div>
        )
      })()}

      {tab === "feedback" && <div style={grid}><Card title="Add feedback" subtitle="Store a customer rating or comment."><form onSubmit={addFeedback} style={form}><Field label="Rating"><select value={ff.rating} onChange={e => setFf({ ...ff, rating: e.target.value })}>{[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} / 5</option>)}</select></Field><Field label="Feedback"><textarea rows="5" placeholder="What did the customer say?" value={ff.feedback} onChange={e => setFf({ ...ff, feedback: e.target.value })} /></Field><button style={primary}>Save Feedback</button></form></Card><Card title={`Reviews • ${feedback.length}`} subtitle={avgRating ? `Average ${avgRating.toFixed(1)} / 5` : "No reviews yet"}><List>{feedback.map(f => <div key={f.id} style={review}><b>{"★".repeat(Number(f.rating || 0))}{"☆".repeat(5 - Number(f.rating || 0))}</b><p>{f.feedback || "No written feedback"}</p><small>{formatIndiaDateTime(f.created_at)}</small></div>)}</List></Card></div>}

      {tab === "permissions" && <Card title="Staff permissions" subtitle="Enable access per staff member. Changes are restaurant-scoped."><div style={permissionHelp}>Tip: keep Billing, Settings and Reports restricted to trusted staff. Kitchen staff normally need Kitchen and Orders only.</div><div style={{ overflowX: "auto" }}><table style={table}><thead><tr><th>Staff</th>{PERMS.map(p => <th key={p}>{p}</th>)}</tr></thead><tbody>{staff.map(s => <tr key={s.id}><td><b>{s.email || s.id.slice(0, 8)}</b><small>{s.role}</small></td>{PERMS.map(p => <td key={p}><Permission rid={rid} staff={s.id} perm={p} save={permission} /></td>)}</tr>)}</tbody></table></div></Card>}

      </div>

        </main>
      </div>

      {toast && <div style={toastStyle} role="status">{toast}</div>}
    </div>
  )
}

function ModifierAssignment({ rid, menuItemId, group, onToggle }) {
  const [assigned, setAssigned] = useState(false)
  useEffect(() => {
    let alive = true
    supabaseCloud.from("menu_item_modifier_groups").select("id").eq("restaurant_id", rid).eq("menu_item_id", menuItemId).eq("modifier_group_id", group.id).maybeSingle().then(({ data }) => alive && setAssigned(!!data))
    return () => { alive = false }
  }, [rid, menuItemId, group.id])
  return <button type="button" onClick={async () => { await onToggle(menuItemId, group.id); setAssigned(v => !v) }} style={{...assignmentBtn, ...(assigned ? assignmentActive : {})}}><span>{assigned ? "✓" : "○"} {group.name}</span><small>{group.required ? "Required" : "Optional"} • {group.selection_type}</small></button>
}

function Permission({ rid, staff, perm, save }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let active = true
    supabaseCloud.from("staff_permissions").select("enabled").eq("restaurant_id", rid).eq("staff_id", staff).eq("permission_key", perm).maybeSingle().then(({ data }) => active && setOn(!!data?.enabled))
    return () => { active = false }
  }, [rid, staff, perm])
  return <input type="checkbox" checked={on} onChange={e => { setOn(e.target.checked); save(staff, perm, e.target.checked) }} />
}

function Stat({ n, l }) { return <div style={stat}><b>{n}</b><span>{l}</span></div> }
function Metric({ title, value, hint }) {
  return (
    <div style={metric} className="operations-metric">
      <span className="operations-metric-label">{title}</span>
      <strong className="operations-metric-value">{value}</strong>
      <small className="operations-metric-hint">{hint}</small>
    </div>
  )
}
function Purpose({ icon, title, text }) { return <div style={purpose}><span style={purposeIcon}>{icon}</span><div><b>{title}</b><p>{text}</p></div></div> }
function Feature({ icon, title, text, onClick }) {
  return (
    <button type="button" onClick={onClick} style={feature} aria-label={`Open ${title}`}>
      <span style={featureIcon}>{icon}</span>
      <span className="operations-feature-copy" style={{minWidth:0}}>
        <b style={{display:"block",fontSize:13,marginBottom:4}}>{title}</b>
        <small style={{display:"block",lineHeight:1.45}}>{text}</small>
      </span>
      <span style={featureAction}><span>Open</span><b>→</b></span>
    </button>
  )
}
function Activity({ label, value, tone }) { return <div style={activity}><span><i style={{ ...dot, ...(dotTones[tone] || {}) }} />{label}</span><strong>{value}</strong></div> }
function Card({ title, subtitle, children }) { return <section style={card}><div style={cardHead}><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>{children}</section> }
function Field({ label, children }) { return <label style={field}><span>{label}</span>{children}</label> }
function List({ children }) { return <div style={list}>{children}</div> }
function Row({ children }) { return <div style={row}>{children}</div> }

const page = { minHeight: "100vh", padding: "24px clamp(14px, 3vw, 42px) 64px", background: "var(--background)", color: "var(--text)", fontFamily: "Inter,system-ui,sans-serif" }
const hero = { display: "flex", justifyContent: "space-between", gap: 34, alignItems: "center", flexWrap: "wrap", maxWidth: 1480, margin: "0 auto 20px", padding: "32px clamp(22px, 4vw, 42px)", borderRadius: 28, background: "linear-gradient(135deg,var(--surface),rgba(var(--primary-rgb),.055))", border: "1px solid var(--border)", boxShadow: "0 18px 55px rgba(0,0,0,.10)" }
const eyebrow = { color: "var(--primary)", fontSize: 11, letterSpacing: 2.2, fontWeight: 900, textTransform: "uppercase" }
const heroTitle = { margin: "8px 0 8px", fontSize: "clamp(28px, 4vw, 46px)", lineHeight: 1.05, letterSpacing: "-0.04em" }
const heroText = { margin: 0, maxWidth: 760, color: "var(--muted)", lineHeight: 1.7, fontSize: 14 }
const heroNote = { display: "inline-flex", marginTop: 16, padding: "8px 12px", borderRadius: 999, background: "rgba(var(--primary-rgb),.07)", border: "1px solid rgba(var(--primary-rgb),.16)", color: "var(--primary)", fontSize: 11, fontWeight: 800 }
const heroStats = { display: "grid", gridTemplateColumns: "repeat(2,minmax(130px,1fr))", gap: 10, minWidth: 285 }
const stat = { padding: "16px 17px", borderRadius: 17, background: "var(--background)", border: "1px solid var(--border)", minHeight: 72, display:"flex", flexDirection:"column", justifyContent:"center" }
const purposeGrid = { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 14, maxWidth: 1480, margin: "0 auto 20px" }
const purpose = { display: "flex", gap: 13, alignItems: "flex-start", padding: 17, minHeight: 94, borderRadius: 18, background: "var(--surface)", border: "1px solid var(--border)" }
const purposeIcon = { width: 42, height: 42, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 13, background: "rgba(var(--primary-rgb),.08)", fontSize: 20 }
const tabs = { display: "flex", gap: 7, flexWrap: "wrap", padding: 8, maxWidth: 1480, margin: "0 auto 18px", borderRadius: 18, background: "var(--surface)", border: "1px solid var(--border)", boxShadow:"0 10px 35px rgba(0,0,0,.06)" }
const tabBtn = (active) => ({ border: `1px solid ${active ? "rgba(var(--primary-rgb),.30)" : "var(--border)"}`, background: active ? "rgba(var(--primary-rgb),.10)" : "var(--background)", color: active ? "var(--primary)" : "var(--muted)", padding: "10px 13px", borderRadius: 12, cursor: "pointer", whiteSpace: "nowrap", fontWeight: 850, boxShadow: active ? "0 6px 22px rgba(var(--primary-rgb),.08)" : "none" })
const stack = { display: "grid", gap: 22, maxWidth: 1480, margin: "0 auto" }
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: 22 }
const grid4 = { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 14 }
const metric = {
  display:"grid",
  gridTemplateColumns:"1fr",
  gridTemplateRows:"auto auto auto",
  rowGap:6,
  alignItems:"start",
  padding:"17px 18px",
  borderRadius:18,
  background:"var(--surface)",
  border:"1px solid var(--border)",
  minHeight:104,
  minWidth:0
}
const card = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "24px clamp(18px,2.4vw,28px)", boxShadow: "0 14px 45px rgba(0,0,0,.07)", minWidth:0 }
const cardHead = { marginBottom: 22, paddingBottom: 2 }
const featureList = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }
const feature = { display: "grid", gridTemplateColumns: "42px minmax(0,1fr) auto", gap: 13, alignItems: "center", width: "100%", minHeight: 78, textAlign: "left", padding: "13px 14px", borderRadius: 15, border: "1px solid var(--border)", background: "var(--background)", color: "var(--text)", cursor: "pointer" }
const featureAction = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 4,
  whiteSpace: "nowrap",
  color: "var(--primary)",
  fontSize: 10,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: ".7px"
}

const featureIcon = { width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(var(--primary-rgb),.08)" }
const activityList = { display: "grid", gap: 10 }
const activity = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 15px", borderRadius: 14, background: "var(--background)", border: "1px solid var(--border)" }
const dot = { display: "inline-block", width: 8, height: 8, borderRadius: 99, marginRight: 8, background: "var(--muted)" }
const dotTones = { info: { background: "var(--info)" }, warning: { background: "var(--warning)" }, success: { background: "#34d399" }, neutral: { background: "#a78bfa" } }
const form = { display: "grid", gap: 12 }
const field = { display: "grid", gap: 6 }
const muted = { color: "#a7b4c7", fontSize: 13, lineHeight: 1.6 }
const primary = { border: 0, borderRadius: 13, padding: "12px 16px", background: "var(--primary)", color: "var(--background)", fontWeight: 900, cursor: "pointer" }
const check = { display: "flex", gap: 8, alignItems: "center", color: "var(--border)", fontSize: 13 }
const divider = { border: 0, borderTop: "1px solid rgba(255,255,255,.07)", margin: "20px 0" }
const list = { display: "grid", gap: 9, maxHeight: 620, overflowY: "auto", paddingRight: 2 }
const row = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "14px 15px", minHeight: 54, borderRadius: 14, background: "var(--background)", border: "1px solid var(--border)" }
const group = { padding: 14, borderRadius: 16, background: "rgba(255,255,255,.025)", marginBottom: 10 }
const badge = { padding: "5px 9px", borderRadius: 999, background: "rgba(16,185,129,.12)", color: "var(--primary)", fontSize: 12, fontWeight: 800 }
const mini = { border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: "var(--text)", borderRadius: 10, padding: "8px 10px", cursor: "pointer" }
const review = { padding: 14, borderRadius: 14, background: "rgba(255,255,255,.035)" }
const workflow = { fontWeight: 900, color: "var(--primary)", fontSize: "clamp(14px,2vw,18px)", letterSpacing: 1, lineHeight: 2 }
const bigNumber = { fontSize: 40, fontWeight: 900, color: "var(--primary)", margin: "8px 0" }
const table = { width: "100%", borderCollapse: "collapse" }
const callout = { display: "grid", gap: 5, marginBottom: 16, padding: 14, borderRadius: 15, background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.13)", color: "#d7dee9" }
const permissionHelp = { marginBottom: 16, padding: 13, borderRadius: 14, background: "rgba(96,165,250,.06)", border: "1px solid rgba(96,165,250,.12)", color: "#b8c8df", fontSize: 13, lineHeight: 1.6 }
const assignmentBtn = { display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",padding:"12px 13px",borderRadius:13,border:"1px solid rgba(255,255,255,.08)",background:"rgba(255,255,255,.025)",color:"var(--text)",cursor:"pointer",textAlign:"left" }
const assignmentActive = { background:"rgba(var(--primary-rgb),.10)",borderColor:"rgba(var(--primary-rgb),.3)",color:"var(--primary)" }
const searchInput = { width:"100%", padding:"12px 14px", marginBottom:12, borderRadius:13, border:"1px solid rgba(255,255,255,.1)", background:"rgba(255,255,255,.04)", color:"var(--text)", outline:"none" }
const dangerMini = { ...mini, border:"1px solid rgba(239,68,68,.28)", color:"var(--danger)" }
const primarySmall = { ...primary, padding:"9px 12px", fontSize:12 }
const miniSelect = { ...mini, background:"var(--surface)", color:"var(--text)", border:"1px solid rgba(255,255,255,.12)" }
const filterBar = { display:"flex", gap:7, flexWrap:"wrap", marginBottom:12 }
const filterBtn = (active) => ({ ...mini, textTransform:"capitalize", background: active ? "rgba(16,185,129,.12)" : "transparent", color: active ? "var(--primary)" : "var(--border)", borderColor: active ? "rgba(16,185,129,.3)" : "rgba(255,255,255,.1)" })
const contentAnchor = { scrollMarginTop: 18 }
const loyaltyToolbar = { display:"flex", justifyContent:"space-between", gap:12, alignItems:"center", flexWrap:"wrap", marginBottom:12 }
const loyaltySubTabs = { display:"flex", gap:8, overflowX:"auto", padding:"4px 2px 14px", scrollbarWidth:"thin" }
const loyaltySubTabBtn = (active) => ({ border:`1px solid ${active ? "rgba(251,191,36,.38)" : "rgba(255,255,255,.09)"}`, background:active ? "linear-gradient(135deg,rgba(251,191,36,.16),rgba(16,185,129,.10))" : "rgba(255,255,255,.035)", color:active ? "var(--warning)" : "var(--border)", padding:"10px 13px", borderRadius:12, cursor:"pointer", whiteSpace:"nowrap", fontWeight:900, boxShadow:active?"0 10px 30px rgba(251,191,36,.08)":"none" })
const loyaltyHeroCard = { display:"grid", gridTemplateColumns:"1fr auto", gap:20, alignItems:"center", padding:"24px clamp(18px,3vw,30px)", borderRadius:24, background:"linear-gradient(135deg,rgba(251,191,36,.12),rgba(16,185,129,.08),rgba(15,23,42,.85))", border:"1px solid rgba(251,191,36,.18)", boxShadow:"0 20px 60px rgba(0,0,0,.2)" }
const loyaltyHeroTitle = { margin:"7px 0", fontSize:"clamp(24px,3vw,36px)", lineHeight:1.08, letterSpacing:"-.035em" }
const loyaltyHeroBadge = { minWidth:190, padding:18, borderRadius:18, background:"rgba(2,6,23,.45)", border:"1px solid rgba(255,255,255,.08)", display:"grid", gap:5 }
const loyaltyHeroBadgeSpan = { color:"#a7b4c7", fontSize:11 }
const loyaltyMemberActions = { display:"flex", gap:7, alignItems:"center", flexWrap:"wrap", justifyContent:"flex-end" }
const tierBadge = { padding:"5px 9px", borderRadius:999, background:"rgba(167,139,250,.12)", border:"1px solid rgba(167,139,250,.2)", color:"#c4b5fd", fontSize:11, fontWeight:900 }
const activeBadge = { padding:"5px 9px", borderRadius:999, background:"rgba(52,211,153,.10)", border:"1px solid rgba(52,211,153,.18)", color:"#6ee7b7", fontSize:11, fontWeight:900 }
const inactiveBadge = { padding:"5px 9px", borderRadius:999, background:"rgba(148,163,184,.08)", border:"1px solid rgba(148,163,184,.14)", color:"var(--muted)", fontSize:11, fontWeight:900 }
const customerWallet = { display:"grid", gridTemplateColumns:"repeat(2,minmax(0,1fr))", gap:10 }
const form2 = { display:"grid", gridTemplateColumns:"repeat(2,minmax(0,1fr))", gap:10 }
const errorCallout = { display:"grid", gap:5, marginBottom:12, padding:13, borderRadius:14, background:"rgba(239,68,68,.07)", border:"1px solid rgba(239,68,68,.2)", color:"var(--danger)", fontSize:12, lineHeight:1.5 }
const toastStyle = { position: "fixed", right: 20, bottom: 20, zIndex: 999, padding: "14px 18px", borderRadius: 14, background: "var(--surface)", border: "1px solid rgba(16,185,129,.35)", boxShadow: "0 20px 50px rgba(0,0,0,.4)" }