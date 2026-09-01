"use client"

import { useEffect, useMemo, useState } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { useTheme } from "@/components/ThemeProvider"

const money = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`

const allTabs = [
  ["tables", "Tables"],
  ["billing", "Billing"],
  ["menu", "Menu"],
  ["kds", "KOT / KDS"],
  ["delivery", "Delivery"],
  ["online", "QR / Online"],
  ["crm", "Loyalty / Feedback"],
  ["staff", "Staff / Security"],
  ["enterprise", "Branches"],
  ["devices", "Printing / Payments"],
  ["reports", "Reports"],
]

const tabPlugins = {
  tables: ["table-management"],
  billing: ["payments", "discount-engine"],
  menu: ["menu-variants"],
  kds: ["kds", "kot-routing"],
  delivery: ["delivery", "delivery-otp"],
  online: ["qr-ordering-pro", "scan-pay"],
  crm: ["loyalty", "feedback-reviews"],
  staff: ["permissions"],
  enterprise: ["multi-branch", "branch-menu-control"],
  devices: ["thermal-printing", "payment-settings", "payment-accounts"],
  reports: ["analytics", "pos-audit"],
}

export default function AdvancedRestaurantSuite() {
  const { refreshTheme } = useTheme()
  const [rid, setRid] = useState("")
  const [tab, setTab] = useState("tables")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [data, setData] = useState({})
  const [plugins, setPlugins] = useState({})

  const [area, setArea] = useState({ name: "" })
  const [table, setTable] = useState({ table_no: "", capacity: 2, area_id: "", shape: "square" })
  const [selectedOrder, setSelectedOrder] = useState("")
  const [splitAmount, setSplitAmount] = useState("")
  const [payment, setPayment] = useState({ order_id: "", method: "cash", amount: "", reference: "" })
  const [discount, setDiscount] = useState({ name: "", code: "", discount_type: "percent", value: "", min_order: "", max_discount: "" })
  const [variant, setVariant] = useState({ menu_item_id: "", name: "", price_delta: "" })
  const [kotRoute, setKotRoute] = useState({ station_id: "", category: "", printer_id: "" })
  const [assignment, setAssignment] = useState({ order_id: "", rider_id: "", address: "", delivery_charge: "" })
  const [otp, setOtp] = useState({ order_id: "", code: "" })
  const [feedback, setFeedback] = useState({ order_id: "", customer_id: "", channel: "qr" })
  const [loyalty, setLoyalty] = useState({ customer_id: "", points: "", type: "earn", note: "" })
  const [permission, setPermission] = useState({ role: "cashier", permission: "billing.view", allowed: true })
  const [branchMenu, setBranchMenu] = useState({ branch_id: "", menu_item_id: "", available: true, price_override: "" })
  const [printer, setPrinter] = useState({ name: "", printer_type: "thermal", ip_address: "", port: 9100 })
  const [gateway, setGateway] = useState({ provider: "razorpay", display_name: "Razorpay", active: false })
  const [paymentSetting, setPaymentSetting] = useState({ payment_method: "cash", enabled: true, instructions: "" })
  const [report, setReport] = useState({ name: "", report_type: "sales", filters: "{}" })
  const [kiosk, setKiosk] = useState({ name: "", kiosk_code: "" })
  const [display, setDisplay] = useState({ name: "", screen_type: "menu" })
  const [callingDevice, setCallingDevice] = useState({ name: "", device_code: "", location: "" })
  const [website, setWebsite] = useState({ enabled: false, slug: "" })
  const [eBill, setEBill] = useState({ order_id: "", recipient: "", channel: "download" })
  const [kitchen, setKitchen] = useState({ name: "", code: "", address: "" })
  const [forecast, setForecast] = useState({ forecast_date: "", metric: "sales", predicted_value: "", confidence: "" })

  useEffect(() => {
    refreshTheme().catch(() => {})
    init()
  }, [refreshTheme])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(""), 4500)
    return () => clearTimeout(timer)
  }, [message])

  async function init() {
    try {
      const { data: auth } = await supabaseCloud.auth.getUser()
      if (!auth?.user) {
        setLoading(false)
        return
      }

      const { data: profile, error } = await supabaseCloud
        .from("profiles")
        .select("restaurant_id")
        .eq("id", auth.user.id)
        .maybeSingle()

      if (error || !profile?.restaurant_id) {
        setMessage(error?.message || "Restaurant not found.")
        setLoading(false)
        return
      }

      setRid(profile.restaurant_id)
      await load(profile.restaurant_id)
    } catch (error) {
      setMessage(error?.message || "Unable to initialize.")
      setLoading(false)
    }
  }

  async function load(r = rid) {
    if (!r) return
    setLoading(true)

    const q = {
      areas: supabaseCloud.from("restaurant_areas").select("*").eq("restaurant_id", r).order("sort_order").order("name"),
      tables: supabaseCloud.from("dining_tables").select("*").eq("restaurant_id", r).order("table_no"),
      orders: supabaseCloud.from("orders").select("id,source_label,order_mode,status,total_amount,subtotal,discount_amount,tax_amount,payment_status,table_id,created_at").eq("restaurant_id", r).order("created_at", { ascending: false }).limit(50),
      splits: supabaseCloud.from("order_splits").select("*").eq("restaurant_id", r).order("created_at", { ascending: false }).limit(50),
      payments: supabaseCloud.from("order_payments").select("*").eq("restaurant_id", r).order("created_at", { ascending: false }).limit(50),
      discounts: supabaseCloud.from("discount_rules").select("*").eq("restaurant_id", r).order("created_at", { ascending: false }),
      variants: supabaseCloud.from("menu_variants").select("*").eq("restaurant_id", r).order("name"),
      menu: supabaseCloud.from("menu_items").select("id,name,price").eq("restaurant_id", r).order("name"),
      stations: supabaseCloud.from("kitchen_stations").select("*").eq("restaurant_id", r).order("sort_order").order("name"),
      kot: supabaseCloud.from("kot_tickets").select("*").eq("restaurant_id", r).order("created_at", { ascending: false }).limit(50),
      routes: supabaseCloud.from("kot_routes").select("*").eq("restaurant_id", r).order("created_at", { ascending: false }),
      riders: supabaseCloud.from("delivery_riders").select("*").eq("restaurant_id", r).order("name"),
      assignments: supabaseCloud.from("restaurant_deliveries").select("*").eq("restaurant_id", r).order("assigned_at", { ascending: false }).limit(50),
      channels: supabaseCloud.from("online_channels").select("*").eq("restaurant_id", r).order("channel_name"),
      scanPay: supabaseCloud.from("scan_pay_requests").select("*").eq("restaurant_id", r).order("created_at", { ascending: false }).limit(50),
      feedback: supabaseCloud.from("customer_feedback").select("*").eq("restaurant_id", r).order("created_at", { ascending: false }).limit(50),
      feedbackRequests: supabaseCloud.from("feedback_requests").select("*").eq("restaurant_id", r).order("created_at", { ascending: false }).limit(50),
      customers: supabaseCloud.from("customers").select("id,name,phone").eq("restaurant_id", r).order("name").limit(100),
      loyalty: supabaseCloud.from("loyalty_transactions").select("*").eq("restaurant_id", r).order("created_at", { ascending: false }).limit(50),
      permissions: supabaseCloud.from("role_permissions").select("*").eq("restaurant_id", r).order("role").order("permission"),
      branches: supabaseCloud.from("restaurant_branches").select("*").eq("parent_restaurant_id", r).order("name"),
      branchMenu: supabaseCloud.from("branch_menu_overrides").select("*").eq("restaurant_id", r).order("updated_at", { ascending: false }).limit(100),
      printers: supabaseCloud.from("printer_devices").select("*").eq("restaurant_id", r).order("name"),
      gateways: supabaseCloud.from("payment_gateway_configs").select("*").eq("restaurant_id", r).order("display_name"),
      paymentSettings: supabaseCloud.from("restaurant_payment_settings").select("*").eq("restaurant_id", r).order("payment_method"),
      reports: supabaseCloud.from("dynamic_report_definitions").select("*").eq("restaurant_id", r).order("updated_at", { ascending: false }),
      kiosks: supabaseCloud.from("self_service_kiosks").select("*").eq("restaurant_id", r).order("name"),
      displays: supabaseCloud.from("digital_display_playlists").select("*").eq("restaurant_id", r).order("name"),
      callingDevices: supabaseCloud.from("calling_devices").select("*").eq("restaurant_id", r).order("name"),
      websiteSettings: supabaseCloud.from("website_order_settings").select("*").eq("restaurant_id", r).maybeSingle(),
      ebills: supabaseCloud.from("e_bill_documents").select("*").eq("restaurant_id", r).order("created_at", { ascending: false }).limit(50),
      kitchens: supabaseCloud.from("central_kitchens").select("*").eq("restaurant_id", r).order("name"),
      forecasts: supabaseCloud.from("forecast_snapshots").select("*").eq("restaurant_id", r).order("forecast_date", { ascending: false }).limit(50),
      pluginRows: supabaseCloud.from("restaurant_plugins").select("plugin_code,enabled").eq("restaurant_id", r),
    }

    const entries = await Promise.all(Object.entries(q).map(async ([key, query]) => [key, (await query).data || []]))
    const result = Object.fromEntries(entries)
    const pluginState = Object.fromEntries((result.pluginRows || []).map((x) => [x.plugin_code, x.enabled === true]))
    setPlugins(pluginState)
    delete result.pluginRows
    setData(result)
    setLoading(false)
  }

  async function save(tableName, payload, reset) {
    if (!rid) return
    setBusy(true)
    const { error } = await supabaseCloud.from(tableName).insert({ ...payload, restaurant_id: rid })
    setBusy(false)
    setMessage(error?.message || "Saved successfully.")
    if (!error) {
      reset?.()
      await load()
    }
  }

  async function upsert(tableName, payload, conflict) {
    if (!rid) return
    setBusy(true)
    const { error } = await supabaseCloud.from(tableName).upsert({ ...payload, restaurant_id: rid }, { onConflict: conflict })
    setBusy(false)
    setMessage(error?.message || "Saved successfully.")
    if (!error) await load()
  }

  async function assignDelivery() {
    if (!rid || !assignment.order_id || !assignment.rider_id) {
      setMessage("Select a delivery order and rider.")
      return
    }
    setBusy(true)
    try {
      const { data: session } = await supabaseCloud.auth.getSession()
      const response = await fetch("/api/restaurant-operations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.session?.access_token || ""}`,
        },
        body: JSON.stringify({ action: "delivery_assign", ...assignment }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to assign rider")
      setAssignment({ order_id: "", rider_id: "", address: "", delivery_charge: "" })
      setMessage("Rider assigned and saved to Cloud.")
      await load()
    } catch (error) {
      setMessage(error?.message || "Unable to assign rider")
    } finally {
      setBusy(false)
    }
  }

  async function update(tableName, id, patch) {
    setBusy(true)
    const { error } = await supabaseCloud.from(tableName).update(patch).eq("id", id).eq("restaurant_id", rid)
    setBusy(false)
    setMessage(error?.message || "Updated successfully.")
    if (!error) await load()
  }

  async function applyDiscount() {
    if (!rid || !selectedOrder || !discountRuleId) return
    setBusy(true)
    const { data: result, error } = await supabaseCloud.rpc("apply_discount_rule", {
      p_restaurant_id: rid,
      p_order_id: selectedOrder,
      p_rule_id: discountRuleId,
      p_reason: "POS manual discount",
    })
    setBusy(false)
    setMessage(error?.message || `Discount applied • ${money(result?.discount_amount)}`)
    if (!error) await load()
  }

  const [discountRuleId, setDiscountRuleId] = useState("")

  async function createSplit() {
    if (!rid || !selectedOrder || Number(splitAmount) <= 0) return
    const order = (data.orders || []).find((x) => x.id === selectedOrder)
    if (!order) return

    const existing = (data.splits || []).filter((x) => x.order_id === selectedOrder)
    const { error } = await supabaseCloud.from("order_splits").insert({
      restaurant_id: rid,
      order_id: selectedOrder,
      split_no: existing.length + 1,
      amount: Number(splitAmount),
      payment_status: "unpaid",
    })

    setMessage(error?.message || "Split bill created.")
    if (!error) {
      setSplitAmount("")
      await load()
    }
  }

  async function addPayment() {
    const amount = Number(payment.amount || 0)
    if (!rid || !payment.order_id || amount <= 0) return

    const { error } = await supabaseCloud.from("order_payments").insert({
      restaurant_id: rid,
      order_id: payment.order_id,
      payment_method: payment.method,
      amount,
      reference: payment.reference || null,
      status: "paid",
      paid_at: new Date().toISOString(),
    })

    setMessage(error?.message || "Payment recorded.")
    if (!error) {
      setPayment({ order_id: "", method: "cash", amount: "", reference: "" })
      await load()
    }
  }

  async function verifyOtp() {
    const assignment = (data.assignments || []).find((x) => x.order_id === otp.order_id)
    if (!assignment || !otp.code) return

    const { data: rows, error } = await supabaseCloud
      .from("delivery_otps")
      .select("*")
      .eq("restaurant_id", rid)
      .eq("order_id", otp.order_id)
      .is("verified_at", null)
      .order("created_at", { ascending: false })
      .limit(1)

    const row = rows?.[0]
    if (error || !row) {
      setMessage(error?.message || "No active OTP found.")
      return
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      setMessage("OTP expired.")
      return
    }

    const { error: updateError } = await supabaseCloud
      .from("delivery_otps")
      .update({ verified_at: new Date().toISOString(), attempts: Number(row.attempts || 0) + 1 })
      .eq("id", row.id)
      .eq("restaurant_id", rid)

    setMessage(updateError?.message || "OTP verification recorded.")
    if (!updateError) await load()
  }

  async function generateOtp() {
    if (!rid || !otp.order_id) return
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const cryptoHash = await hashText(code)
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { error } = await supabaseCloud.from("delivery_otps").insert({
      restaurant_id: rid,
      order_id: otp.order_id,
      otp_hash: cryptoHash,
      expires_at: expires,
    })

    setMessage(error?.message || `OTP generated: ${code} (share securely with customer)`)
    if (!error) await load()
  }

  async function hashText(value) {
    if (typeof window !== "undefined" && window.crypto?.subtle) {
      const buffer = await window.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value)
      )
      return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("")
    }
    return value
  }

  const todayOrders = useMemo(() => {
    const day = new Date().toISOString().slice(0, 10)
    return (data.orders || []).filter((o) => String(o.created_at || "").slice(0, 10) === day)
  }, [data.orders])

  const visibleTabs = allTabs.filter(([id]) => {
    const required = tabPlugins[id] || []
    if (!required.length) return true
    return required.some((code) => plugins[code] === true)
  })

  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some(([id]) => id === tab)) {
      setTab(visibleTabs[0][0])
    }
  }, [visibleTabs, tab])

  return (
    <main className="ops">
      <header className="hero">
        <div>
          <div className="eyebrow">ANAIRA • ADVANCED OPERATIONS</div>
          <h1>Restaurant Operations Control</h1>
          <p>
            Real workflows for tables, billing, KOT, delivery, online ordering,
            loyalty, staff, branches, payments and reporting.
          </p>
        </div>
        <button className="refresh" onClick={() => load()} disabled={loading}>↻ Refresh</button>
      </header>

      <nav className="tabs">
        {visibleTabs.map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {message && <div className="notice">{message}</div>}
      {busy && <div className="busy">Saving…</div>}

      {tab === "tables" && (
        <div className="grid">
          <Panel title="Floor / Areas">
            <form className="form" onSubmit={(e) => { e.preventDefault(); save("restaurant_areas", area, () => setArea({ name: "" })) }}>
              <input required value={area.name} onChange={(e) => setArea({ name: e.target.value })} placeholder="Area name e.g. Ground Floor" />
              <button>Add Area</button>
            </form>
            <List items={data.areas} empty="No areas created." render={(x) => <><b>{x.name}</b><span>{x.active ? "Active" : "Off"}</span></>} />
          </Panel>

          <Panel title="Table Management">
            <form className="form" onSubmit={(e) => { e.preventDefault(); save("dining_tables", { ...table, capacity: Number(table.capacity), area_id: table.area_id || null }, () => setTable({ table_no: "", capacity: 2, area_id: "", shape: "square" })) }}>
              <input required value={table.table_no} onChange={(e) => setTable({ ...table, table_no: e.target.value })} placeholder="Table number" />
              <input type="number" min="1" value={table.capacity} onChange={(e) => setTable({ ...table, capacity: e.target.value })} placeholder="Capacity" />
              <select value={table.area_id} onChange={(e) => setTable({ ...table, area_id: e.target.value })}>
                <option value="">No area</option>
                {(data.areas || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <select value={table.shape} onChange={(e) => setTable({ ...table, shape: e.target.value })}>
                <option value="square">Square</option><option value="round">Round</option><option value="rectangle">Rectangle</option>
              </select>
              <button>Add Table</button>
            </form>
            <div className="tableGrid">
              {(data.tables || []).map((x) => (
                <div className={`tableCard ${x.status}`} key={x.id}>
                  <strong>{x.table_no}</strong>
                  <small>{x.capacity} seats</small>
                  <select value={x.status} onChange={(e) => update("dining_tables", x.id, { status: e.target.value })}>
                    <option value="available">Available</option><option value="occupied">Occupied</option><option value="reserved">Reserved</option><option value="cleaning">Cleaning</option>
                  </select>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {tab === "billing" && (
        <div className="grid">
          <Panel title="Split Bill">
            <select value={selectedOrder} onChange={(e) => setSelectedOrder(e.target.value)}>
              <option value="">Select order</option>
              {(data.orders || []).map((o) => <option key={o.id} value={o.id}>{o.source_label || o.id.slice(0, 8)} • {money(o.total_amount)}</option>)}
            </select>
            <div className="form inline">
              <input type="number" min="0.01" step="0.01" value={splitAmount} onChange={(e) => setSplitAmount(e.target.value)} placeholder="Split amount" />
              <button onClick={createSplit}>Create Split</button>
            </div>
            <List items={(data.splits || []).filter((x) => !selectedOrder || x.order_id === selectedOrder)} empty="No splits." render={(x) => <><b>Split #{x.split_no}</b><span>{money(x.amount)} • {x.payment_status}</span></>} />
          </Panel>

          <Panel title="Payments">
            <div className="form">
              <select value={payment.order_id} onChange={(e) => setPayment({ ...payment, order_id: e.target.value })}>
                <option value="">Order</option>
                {(data.orders || []).map((o) => <option key={o.id} value={o.id}>{o.source_label || o.id.slice(0, 8)} • {money(o.total_amount)}</option>)}
              </select>
              <select value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })}>
                <option>cash</option><option>card</option><option>upi</option><option>online</option><option>credit</option>
              </select>
              <input type="number" min="0.01" step="0.01" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} placeholder="Amount" />
              <input value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} placeholder="Reference / UTR" />
              <button onClick={addPayment}>Record Payment</button>
            </div>
            <List items={data.payments} empty="No payments." render={(x) => <><b>{x.payment_method}</b><span>{money(x.amount)} • {x.status}</span></>} />
          </Panel>

          <Panel title="Discount Engine">
            <form className="form" onSubmit={(e) => { e.preventDefault(); save("discount_rules", { ...discount, value: Number(discount.value || 0), min_order: Number(discount.min_order || 0), max_discount: discount.max_discount === "" ? null : Number(discount.max_discount) }, () => setDiscount({ name: "", code: "", discount_type: "percent", value: "", min_order: "", max_discount: "" })) }}>
              <input required value={discount.name} onChange={(e) => setDiscount({ ...discount, name: e.target.value })} placeholder="Discount name" />
              <input value={discount.code} onChange={(e) => setDiscount({ ...discount, code: e.target.value })} placeholder="Coupon code" />
              <select value={discount.discount_type} onChange={(e) => setDiscount({ ...discount, discount_type: e.target.value })}><option value="percent">Percent</option><option value="flat">Flat</option></select>
              <input type="number" min="0" value={discount.value} onChange={(e) => setDiscount({ ...discount, value: e.target.value })} placeholder="Value" />
              <input type="number" min="0" value={discount.min_order} onChange={(e) => setDiscount({ ...discount, min_order: e.target.value })} placeholder="Minimum order" />
              <input type="number" min="0" value={discount.max_discount} onChange={(e) => setDiscount({ ...discount, max_discount: e.target.value })} placeholder="Maximum discount (optional)" />
              <button>Save Discount</button>
            </form>
            <select value={discountRuleId} onChange={(e) => setDiscountRuleId(e.target.value)}>
              <option value="">Choose active rule</option>
              {(data.discounts || []).filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <button className="secondary" onClick={applyDiscount}>Apply to Selected Order</button>
          </Panel>
        </div>
      )}

      {tab === "menu" && (
        <div className="grid">
          <Panel title="Menu Variants">
            <form className="form" onSubmit={(e) => { e.preventDefault(); save("menu_variants", { ...variant, price_delta: Number(variant.price_delta || 0) }, () => setVariant({ menu_item_id: "", name: "", price_delta: "" })) }}>
              <select required value={variant.menu_item_id} onChange={(e) => setVariant({ ...variant, menu_item_id: e.target.value })}>
                <option value="">Menu item</option>
                {(data.menu || []).map((x) => <option key={x.id} value={x.id}>{x.name} • {money(x.price)}</option>)}
              </select>
              <input required value={variant.name} onChange={(e) => setVariant({ ...variant, name: e.target.value })} placeholder="Variant e.g. Large" />
              <input type="number" step="0.01" value={variant.price_delta} onChange={(e) => setVariant({ ...variant, price_delta: e.target.value })} placeholder="Price + / -" />
              <button>Add Variant</button>
            </form>
            <List items={data.variants} empty="No variants." render={(x) => <><b>{x.name}</b><span>{money(x.price_delta)}</span></>} />
          </Panel>

          <Panel title="Modifiers / Add-ons">
            <p className="muted">Modifier groups and paid add-ons already use the same restaurant scope. Manage them from the existing Operations Hub.</p>
            <a className="link" href="/dashboard/business?tab=modifiers">Open Modifier Manager →</a>
          </Panel>
        </div>
      )}

      {tab === "kds" && (
        <div className="grid">
          <Panel title="KOT / KDS Queue">
            <List items={data.kot} empty="No KOT tickets." render={(x) => (
              <>
                <b>KOT #{x.kot_no}</b>
                <span>
                  <select value={x.status} onChange={(e) => update("kot_tickets", x.id, { status: e.target.value })}>
                    <option>new</option><option>preparing</option><option>ready</option><option>served</option><option>cancelled</option>
                  </select>
                </span>
              </>
            )} />
            <a className="link" href="/kitchen">Open full KDS →</a>
          </Panel>

          <Panel title="Station Routing">
            <form className="form" onSubmit={(e) => { e.preventDefault(); save("kot_routes", { ...kotRoute, station_id: kotRoute.station_id || null, printer_id: kotRoute.printer_id || null }, () => setKotRoute({ station_id: "", category: "", printer_id: "" })) }}>
              <select value={kotRoute.station_id} onChange={(e) => setKotRoute({ ...kotRoute, station_id: e.target.value })}>
                <option value="">Station</option>
                {(data.stations || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <input value={kotRoute.category} onChange={(e) => setKotRoute({ ...kotRoute, category: e.target.value })} placeholder="Item category e.g. Bar" />
              <select value={kotRoute.printer_id} onChange={(e) => setKotRoute({ ...kotRoute, printer_id: e.target.value })}>
                <option value="">Printer</option>
                {(data.printers || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <button>Add Route</button>
            </form>
            <List items={data.routes} empty="No KOT routes." render={(x) => <><b>{x.category || "All items"}</b><span>{x.active ? "Active" : "Off"}</span></>} />
          </Panel>
        </div>
      )}

      {tab === "delivery" && (
        <div className="grid">
          <Panel title="Delivery Assignment">
            <form className="form" onSubmit={(e) => { e.preventDefault(); assignDelivery() }}>
              <select required value={assignment.order_id} onChange={(e) => setAssignment({ ...assignment, order_id: e.target.value })}>
                <option value="">Delivery order</option>
                {(data.orders || []).filter((x) => x.order_mode === "delivery").map((x) => <option key={x.id} value={x.id}>{x.source_label || x.id.slice(0, 8)}</option>)}
              </select>
              <select value={assignment.rider_id} onChange={(e) => setAssignment({ ...assignment, rider_id: e.target.value })}>
                <option value="">Rider</option>
                {(data.riders || []).map((x) => <option key={x.id} value={x.id}>{x.name} • {x.phone || ""}</option>)}
              </select>
              <input value={assignment.address} onChange={(e) => setAssignment({ ...assignment, address: e.target.value })} placeholder="Delivery address" />
              <input type="number" min="0" value={assignment.delivery_charge} onChange={(e) => setAssignment({ ...assignment, delivery_charge: e.target.value })} placeholder="Delivery charge" />
              <button>Assign Rider</button>
            </form>
            <List items={data.assignments} empty="No assignments." render={(x) => <><b>{x.status}</b><span>{money(x.delivery_charge)}</span></>} />
          </Panel>

          <Panel title="Delivery OTP">
            <select value={otp.order_id} onChange={(e) => setOtp({ ...otp, order_id: e.target.value })}>
              <option value="">Delivery order</option>
              {(data.orders || []).filter((x) => x.order_mode === "delivery").map((x) => <option key={x.id} value={x.id}>{x.source_label || x.id.slice(0, 8)}</option>)}
            </select>
            <div className="form inline">
              <input value={otp.code} onChange={(e) => setOtp({ ...otp, code: e.target.value })} placeholder="Customer OTP" />
              <button onClick={generateOtp}>Generate</button>
              <button className="secondary" onClick={verifyOtp}>Verify</button>
            </div>
            <p className="muted">OTP is stored as a SHA-256 hash. Provider SMS/WhatsApp delivery remains connector-specific.</p>
          </Panel>
        </div>
      )}

      {tab === "online" && (
        <div className="grid">
          <Panel title="QR / Scan & Pay">
            <form className="form" onSubmit={(e) => { e.preventDefault(); save("scan_pay_requests", { order_id: selectedOrder || null, amount: Number(splitAmount || 0), payment_method: "upi", status: "pending", expires_at: new Date(Date.now() + 15 * 60000).toISOString() }, () => {}) }}>
              <select value={selectedOrder} onChange={(e) => setSelectedOrder(e.target.value)}>
                <option value="">Order</option>
                {(data.orders || []).map((x) => <option key={x.id} value={x.id}>{x.source_label || x.id.slice(0, 8)} • {money(x.total_amount)}</option>)}
              </select>
              <input type="number" min="0" value={splitAmount} onChange={(e) => setSplitAmount(e.target.value)} placeholder="Amount" />
              <button>Create Scan & Pay Request</button>
            </form>
            <List items={data.scanPay} empty="No payment requests." render={(x) => <><b>{x.status}</b><span>{money(x.amount)} • {x.payment_method || "upi"}</span></>} />
          </Panel>

          <Panel title="Online Channels">
            <List items={data.channels} empty="No channels." render={(x) => <><b>{x.channel_name}</b><span>{x.active ? "ACTIVE" : "OFF"}</span></>} />
            <a className="link" href="/dashboard/qr">Open QR Center →</a>
          </Panel>
        </div>
      )}

      {tab === "crm" && (
        <div className="grid">
          <Panel title="Loyalty">
            <form className="form" onSubmit={(e) => { e.preventDefault(); save("loyalty_transactions", { customer_id: loyalty.customer_id, points: Number(loyalty.points), transaction_type: loyalty.type, note: loyalty.note }, () => setLoyalty({ customer_id: "", points: "", type: "earn", note: "" })) }}>
              <select required value={loyalty.customer_id} onChange={(e) => setLoyalty({ ...loyalty, customer_id: e.target.value })}>
                <option value="">Customer</option>
                {(data.customers || []).map((x) => <option key={x.id} value={x.id}>{x.name || x.phone}</option>)}
              </select>
              <select value={loyalty.type} onChange={(e) => setLoyalty({ ...loyalty, type: e.target.value })}><option value="earn">Earn</option><option value="redeem">Redeem</option><option value="adjustment">Adjustment</option><option value="expiry">Expiry</option></select>
              <input type="number" value={loyalty.points} onChange={(e) => setLoyalty({ ...loyalty, points: e.target.value })} placeholder="Points" />
              <input value={loyalty.note} onChange={(e) => setLoyalty({ ...loyalty, note: e.target.value })} placeholder="Reason" />
              <button>Post Loyalty Transaction</button>
            </form>
            <List items={data.loyalty} empty="No loyalty transactions." render={(x) => <><b>{x.transaction_type}</b><span>{x.points} points</span></>} />
          </Panel>

          <Panel title="Feedback / Reviews">
            <form className="form" onSubmit={(e) => { e.preventDefault(); save("feedback_requests", { order_id: feedback.order_id || null, customer_id: feedback.customer_id || null, channel: feedback.channel, token: crypto.randomUUID() }, () => setFeedback({ order_id: "", customer_id: "", channel: "qr" })) }}>
              <select value={feedback.order_id} onChange={(e) => setFeedback({ ...feedback, order_id: e.target.value })}><option value="">Order optional</option>{(data.orders || []).map((x) => <option key={x.id} value={x.id}>{x.source_label || x.id.slice(0, 8)}</option>)}</select>
              <select value={feedback.customer_id} onChange={(e) => setFeedback({ ...feedback, customer_id: e.target.value })}><option value="">Customer optional</option>{(data.customers || []).map((x) => <option key={x.id} value={x.id}>{x.name || x.phone}</option>)}</select>
              <select value={feedback.channel} onChange={(e) => setFeedback({ ...feedback, channel: e.target.value })}><option value="qr">QR</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select>
              <button>Create Feedback Request</button>
            </form>
            <List items={data.feedback} empty="No feedback yet." render={(x) => <><b>{x.rating}/5</b><span>{x.feedback || "No comment"}</span></>} />
          </Panel>
        </div>
      )}

      {tab === "staff" && (
        <div className="grid">
          <Panel title="Role Permissions">
            <form className="form" onSubmit={(e) => { e.preventDefault(); upsert("role_permissions", permission, "restaurant_id,role,permission") }}>
              <select value={permission.role} onChange={(e) => setPermission({ ...permission, role: e.target.value })}><option>owner</option><option>manager</option><option>cashier</option><option>waiter</option><option>kitchen</option><option>delivery</option></select>
              <input value={permission.permission} onChange={(e) => setPermission({ ...permission, permission: e.target.value })} placeholder="permission.key" />
              <label className="check"><input type="checkbox" checked={permission.allowed} onChange={(e) => setPermission({ ...permission, allowed: e.target.checked })} /> Allowed</label>
              <button>Save Permission</button>
            </form>
            <List items={data.permissions} empty="No role permissions." render={(x) => <><b>{x.role}</b><span>{x.permission} • {x.allowed ? "Allowed" : "Denied"}</span></>} />
          </Panel>

          <Panel title="Security / Audit">
            <p className="muted">Discount, refund, void and operational actions are written to the restaurant-scoped audit layer.</p>
            <a className="link" href="/super-admin/audit">Open Audit Logs →</a>
          </Panel>
        </div>
      )}

      {tab === "enterprise" && (
        <div className="grid">
          <Panel title="Branches">
            <List items={data.branches} empty="No child branches." render={(x) => <><b>{x.name}</b><span>{x.code || "—"} • {x.active === false ? "OFF" : "ACTIVE"}</span></>} />
            <a className="link" href="/super-admin/restaurants">Manage branches from Super Admin →</a>
          </Panel>

          <Panel title="Central Kitchen">
            <form className="form" onSubmit={(e) => { e.preventDefault(); save("central_kitchens", { ...kitchen, active: true }, () => setKitchen({ name: "", code: "", address: "" })) }}>
              <input required value={kitchen.name} onChange={(e) => setKitchen({ ...kitchen, name: e.target.value })} placeholder="Kitchen name" />
              <input value={kitchen.code} onChange={(e) => setKitchen({ ...kitchen, code: e.target.value })} placeholder="Kitchen code" />
              <input value={kitchen.address} onChange={(e) => setKitchen({ ...kitchen, address: e.target.value })} placeholder="Address" />
              <button>Add Central Kitchen</button>
            </form>
            <List items={data.kitchens} empty="No central kitchens." render={(x) => <><b>{x.name}</b><span>{x.code || "—"} • {x.active ? "ACTIVE" : "OFF"}</span></>} />
          </Panel>

          <Panel title="Branch Menu Publishing">
            <form className="form" onSubmit={(e) => { e.preventDefault(); save("branch_menu_overrides", { ...branchMenu, branch_id: branchMenu.branch_id || null, price_override: branchMenu.price_override === "" ? null : Number(branchMenu.price_override) }, () => setBranchMenu({ branch_id: "", menu_item_id: "", available: true, price_override: "" })) }}>
              <select required value={branchMenu.branch_id} onChange={(e) => setBranchMenu({ ...branchMenu, branch_id: e.target.value })}><option value="">Branch</option>{(data.branches || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              <select required value={branchMenu.menu_item_id} onChange={(e) => setBranchMenu({ ...branchMenu, menu_item_id: e.target.value })}><option value="">Menu item</option>{(data.menu || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              <input type="number" step="0.01" value={branchMenu.price_override} onChange={(e) => setBranchMenu({ ...branchMenu, price_override: e.target.value })} placeholder="Price override" />
              <label className="check"><input type="checkbox" checked={branchMenu.available} onChange={(e) => setBranchMenu({ ...branchMenu, available: e.target.checked })} /> Available</label>
              <button>Publish Override</button>
            </form>
            <List items={data.branchMenu} empty="No branch overrides." render={(x) => <><b>{x.menu_item_id?.slice(0, 8)}</b><span>{x.published ? "Published" : "Draft"}</span></>} />
          </Panel>
        </div>
      )}

      {tab === "devices" && (
        <div className="grid">
          <Panel title="Thermal / A4 Printing">
            <form className="form" onSubmit={(e) => { e.preventDefault(); save("printer_devices", { ...printer, port: Number(printer.port) }, () => setPrinter({ name: "", printer_type: "thermal", ip_address: "", port: 9100 })) }}>
              <input required value={printer.name} onChange={(e) => setPrinter({ ...printer, name: e.target.value })} placeholder="Printer name" />
              <select value={printer.printer_type} onChange={(e) => setPrinter({ ...printer, printer_type: e.target.value })}><option value="thermal">Thermal</option><option value="a4">A4</option></select>
              <input value={printer.ip_address} onChange={(e) => setPrinter({ ...printer, ip_address: e.target.value })} placeholder="IP address" />
              <input type="number" value={printer.port} onChange={(e) => setPrinter({ ...printer, port: e.target.value })} placeholder="Port" />
              <button>Register Printer</button>
            </form>
            <List items={data.printers} empty="No printers." render={(x) => <><b>{x.name}</b><span>{x.printer_type} • {x.active ? "Active" : "Off"}</span></>} />
          </Panel>

          <Panel title="Kiosk / Digital Display / Calling">
            <form className="form" onSubmit={(e) => { e.preventDefault(); save("self_service_kiosks", { ...kiosk, active: true }, () => setKiosk({ name: "", kiosk_code: "" })) }}>
              <input required value={kiosk.name} onChange={(e) => setKiosk({ ...kiosk, name: e.target.value })} placeholder="Kiosk name" />
              <input value={kiosk.kiosk_code} onChange={(e) => setKiosk({ ...kiosk, kiosk_code: e.target.value })} placeholder="Kiosk code" />
              <button>Register Kiosk</button>
            </form>
            <List items={data.kiosks} empty="No kiosks." render={(x) => <><b>{x.name}</b><span>{x.active ? "ACTIVE" : "OFF"}</span></>} />

            <form className="form" onSubmit={(e) => { e.preventDefault(); save("digital_display_playlists", { ...display, items: [], active: true }, () => setDisplay({ name: "", screen_type: "menu" })) }}>
              <input required value={display.name} onChange={(e) => setDisplay({ ...display, name: e.target.value })} placeholder="Display playlist" />
              <select value={display.screen_type} onChange={(e) => setDisplay({ ...display, screen_type: e.target.value })}><option>menu</option><option>token</option><option>ready</option><option>advertisement</option></select>
              <button>Create Display Playlist</button>
            </form>
            <List items={data.displays} empty="No display playlists." render={(x) => <><b>{x.name}</b><span>{x.screen_type}</span></>} />

            <form className="form" onSubmit={(e) => { e.preventDefault(); save("calling_devices", { ...callingDevice, active: true }, () => setCallingDevice({ name: "", device_code: "", location: "" })) }}>
              <input required value={callingDevice.name} onChange={(e) => setCallingDevice({ ...callingDevice, name: e.target.value })} placeholder="Calling device" />
              <input value={callingDevice.device_code} onChange={(e) => setCallingDevice({ ...callingDevice, device_code: e.target.value })} placeholder="Device code" />
              <input value={callingDevice.location} onChange={(e) => setCallingDevice({ ...callingDevice, location: e.target.value })} placeholder="Location" />
              <button>Register Calling Device</button>
            </form>
            <List items={data.callingDevices} empty="No calling devices." render={(x) => <><b>{x.name}</b><span>{x.location || "—"} • {x.active ? "ACTIVE" : "OFF"}</span></>} />
          </Panel>

          <Panel title="Payment Gateways">
            <form className="form" onSubmit={(e) => { e.preventDefault(); upsert("payment_gateway_configs", gateway, "restaurant_id,provider") }}>
              <select value={gateway.provider} onChange={(e) => setGateway({ ...gateway, provider: e.target.value, display_name: e.target.value === "razorpay" ? "Razorpay" : e.target.value })}><option value="razorpay">Razorpay</option><option value="stripe">Stripe</option><option value="cashfree">Cashfree</option><option value="custom">Custom</option></select>
              <input value={gateway.display_name} onChange={(e) => setGateway({ ...gateway, display_name: e.target.value })} placeholder="Display name" />
              <label className="check"><input type="checkbox" checked={gateway.active} onChange={(e) => setGateway({ ...gateway, active: e.target.checked })} /> Active</label>
              <button>Save Gateway</button>
            </form>
            <List items={data.gateways} empty="No gateway configuration." render={(x) => <><b>{x.display_name}</b><span>{x.active ? "ACTIVE" : "OFF"}</span></>} />
          </Panel>

          <Panel title="Payment Method Controls">
            <form className="form" onSubmit={(e) => { e.preventDefault(); upsert("restaurant_payment_settings", paymentSetting, "restaurant_id,payment_method") }}>
              <select value={paymentSetting.payment_method} onChange={(e) => setPaymentSetting({ ...paymentSetting, payment_method: e.target.value })}><option>cash</option><option>card</option><option>upi</option><option>online</option><option>credit</option></select>
              <label className="check"><input type="checkbox" checked={paymentSetting.enabled} onChange={(e) => setPaymentSetting({ ...paymentSetting, enabled: e.target.checked })} /> Enabled</label>
              <input value={paymentSetting.instructions} onChange={(e) => setPaymentSetting({ ...paymentSetting, instructions: e.target.value })} placeholder="Customer instructions" />
              <button>Save Payment Setting</button>
            </form>
          </Panel>

          <Panel title="Website Ordering / E-Bill">
            <form className="form" onSubmit={(e) => { e.preventDefault(); upsert("website_order_settings", { ...website, settings: { pickup: true, delivery: true, payments: true } }, "restaurant_id") }}>
              <label className="check"><input type="checkbox" checked={website.enabled} onChange={(e) => setWebsite({ ...website, enabled: e.target.checked })} /> Website ordering enabled</label>
              <input value={website.slug} onChange={(e) => setWebsite({ ...website, slug: e.target.value })} placeholder="Restaurant slug" />
              <button>Save Website Settings</button>
            </form>
            <form className="form" onSubmit={(e) => { e.preventDefault(); save("e_bill_documents", { order_id: eBill.order_id || null, recipient: eBill.recipient || null, delivery_channel: eBill.channel, status: "generated" }, () => setEBill({ order_id: "", recipient: "", channel: "download" })) }}>
              <select value={eBill.order_id} onChange={(e) => setEBill({ ...eBill, order_id: e.target.value })}><option value="">Order</option>{(data.orders || []).map((x) => <option key={x.id} value={x.id}>{x.source_label || x.id.slice(0, 8)} • {money(x.total_amount)}</option>)}</select>
              <select value={eBill.channel} onChange={(e) => setEBill({ ...eBill, channel: e.target.value })}><option value="download">Download</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="email">Email</option></select>
              <input value={eBill.recipient} onChange={(e) => setEBill({ ...eBill, recipient: e.target.value })} placeholder="Recipient" />
              <button>Generate E-Bill Record</button>
            </form>
            <List items={data.ebills} empty="No e-bills." render={(x) => <><b>{x.invoice_no || "E-Bill"}</b><span>{x.delivery_channel} • {x.status}</span></>} />
          </Panel>
        </div>
      )}

      {tab === "reports" && (
        <div className="grid">
          <Panel title="Dynamic Reports">
            <form className="form" onSubmit={(e) => {
              e.preventDefault()
              let filters = {}
              try { filters = JSON.parse(report.filters || "{}") } catch { setMessage("Filters must be valid JSON."); return }
              save("dynamic_report_definitions", { ...report, filters, columns_config: [], active: true }, () => setReport({ name: "", report_type: "sales", filters: "{}" }))
            }}>
              <input required value={report.name} onChange={(e) => setReport({ ...report, name: e.target.value })} placeholder="Report name" />
              <select value={report.report_type} onChange={(e) => setReport({ ...report, report_type: e.target.value })}><option>sales</option><option>orders</option><option>payments</option><option>staff</option><option>customers</option><option>tax</option></select>
              <textarea rows={4} value={report.filters} onChange={(e) => setReport({ ...report, filters: e.target.value })} placeholder='{"date_from":"2026-08-01","date_to":"2026-08-31"}' />
              <button>Save Report Definition</button>
            </form>
            <List items={data.reports} empty="No custom reports." render={(x) => <><b>{x.name}</b><span>{x.report_type} • {x.active ? "Active" : "Off"}</span></>} />
          </Panel>

          <Panel title="Forecasting">
            <form className="form" onSubmit={(e) => { e.preventDefault(); save("forecast_snapshots", { ...forecast, predicted_value: Number(forecast.predicted_value || 0), confidence: forecast.confidence === "" ? null : Number(forecast.confidence) }, () => setForecast({ forecast_date: "", metric: "sales", predicted_value: "", confidence: "" })) }}>
              <input type="date" required value={forecast.forecast_date} onChange={(e) => setForecast({ ...forecast, forecast_date: e.target.value })} />
              <select value={forecast.metric} onChange={(e) => setForecast({ ...forecast, metric: e.target.value })}><option>sales</option><option>orders</option><option>covers</option><option>average_bill</option></select>
              <input type="number" min="0" value={forecast.predicted_value} onChange={(e) => setForecast({ ...forecast, predicted_value: e.target.value })} placeholder="Predicted value" />
              <input type="number" min="0" max="100" value={forecast.confidence} onChange={(e) => setForecast({ ...forecast, confidence: e.target.value })} placeholder="Confidence %" />
              <button>Save Forecast Snapshot</button>
            </form>
            <List items={data.forecasts} empty="No forecast snapshots." render={(x) => <><b>{x.metric}</b><span>{x.forecast_date} • {x.predicted_value}</span></>} />
          </Panel>
        </div>
      )}

      {loading && <div className="loading">Loading operations…</div>}

      <style jsx>{`
        .ops {
          min-height: 100vh;
          padding: 24px;
          background: var(--background, #050a08);
          color: var(--text, var(--surface-2));
        }

        .hero, .panel, .stat {
          background: var(--surface, #0d1712);
          border: 1px solid var(--border, rgba(255,255,255,.1));
          border-radius: var(--radius, 18px);
          color: var(--text, var(--surface-2));
        }

        .hero {
          padding: 26px;
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: center;
        }

        .eyebrow {
          color: var(--primary, var(--primary));
          font-size: 11px;
          font-weight: 900;
          letter-spacing: .16em;
        }

        h1 {
          margin: 8px 0;
          font-size: clamp(28px, 4vw, 46px);
          line-height: 1.05;
        }

        .hero p, .muted, .empty {
          color: var(--muted, #a9b6ae);
          line-height: 1.6;
        }

        .tabs {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 14px 0;
        }

        .tabs button, button, select, input, textarea {
          font: inherit;
        }

        button {
          cursor: pointer;
          border: 1px solid var(--border, rgba(255,255,255,.1));
          border-radius: 10px;
          padding: 10px 13px;
          background: var(--surface-2, #14231b);
          color: var(--text, var(--surface-2));
          font-weight: 800;
        }

        button:hover {
          border-color: var(--primary, var(--primary));
          transform: translateY(-1px);
        }

        button.active, .form button {
          background: var(--primary, var(--primary));
          color: var(--primary-foreground, #07110a);
          border-color: var(--primary, var(--primary));
        }

        button.secondary {
          margin-top: 10px;
          background: var(--accent, #1c3328);
        }

        .refresh {
          flex: 0 0 auto;
        }

        .notice, .busy {
          padding: 12px 14px;
          border-radius: 12px;
          margin-bottom: 12px;
          background: var(--surface-2, #14231b);
          border: 1px solid var(--border, rgba(255,255,255,.1));
        }

        .busy {
          color: var(--primary, var(--primary));
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .panel {
          padding: 20px;
          margin-bottom: 16px;
          overflow: hidden;
        }

        .panel h2 {
          margin: 0 0 16px;
          font-size: 21px;
        }

        .form {
          display: grid;
          gap: 9px;
          margin-bottom: 16px;
        }

        .form.inline {
          grid-template-columns: 1fr auto;
          align-items: center;
        }

        input, select, textarea {
          width: 100%;
          box-sizing: border-box;
          padding: 11px;
          border-radius: 10px;
          border: 1px solid var(--border, rgba(255,255,255,.1));
          background: var(--background, #050a08);
          color: var(--text, var(--surface-2));
          outline: none;
        }

        input:focus, select:focus, textarea:focus {
          border-color: var(--primary, var(--primary));
          box-shadow: 0 0 0 3px rgba(var(--primary-rgb, 217,173,85), .12);
        }

        .check {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 38px;
        }

        .check input {
          width: 18px;
          height: 18px;
          accent-color: var(--primary, var(--primary));
        }

        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 11px 0;
          border-bottom: 1px solid var(--border, rgba(255,255,255,.08));
        }

        .row:last-child {
          border-bottom: 0;
        }

        .row span {
          color: var(--muted, #a9b6ae);
          text-align: right;
        }

        .tableGrid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 10px;
        }

        .tableCard {
          min-height: 130px;
          padding: 14px;
          border-radius: 14px;
          border: 1px solid var(--border, rgba(255,255,255,.1));
          background: var(--surface-2, #14231b);
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .tableCard strong {
          font-size: 28px;
          color: var(--primary, var(--primary));
        }

        .tableCard small {
          color: var(--muted, #a9b6ae);
        }

        .tableCard.available {
          border-color: color-mix(in srgb, var(--success, var(--success)) 40%, var(--border));
        }

        .tableCard.occupied {
          border-color: color-mix(in srgb, var(--danger, var(--danger)) 50%, var(--border));
        }

        .link {
          display: block;
          margin-top: 12px;
          color: var(--primary, var(--primary));
          font-weight: 800;
          text-decoration: none;
        }

        .loading {
          padding: 24px;
          text-align: center;
          color: var(--muted, #a9b6ae);
        }

        @media (max-width: 900px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 600px) {
          .ops {
            padding: 12px;
          }

          .hero {
            flex-direction: column;
            align-items: stretch;
            padding: 20px;
          }

          .form.inline {
            grid-template-columns: 1fr;
          }

          .row {
            align-items: flex-start;
            flex-direction: column;
          }

          .row span {
            text-align: left;
          }
        }
      `}</style>
    </main>
  )
}

function Panel({ title, children }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function List({ items = [], empty, render }) {
  if (!items.length) return <div className="empty">{empty}</div>

  return (
    <div>
      {items.map((item) => (
        <div className="row" key={item.id}>
          {render(item)}
        </div>
      ))}
    </div>
  )
}
