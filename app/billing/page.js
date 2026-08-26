"use client"
import { formatIndiaDateTime } from "@/lib/indiaTime"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import SalesChart from "@/components/SalesChart"
import ItemChart from "@/components/ItemChart"
import jsPDF from "jspdf"
import html2canvas from "html2canvas"
import { printHtmlInFrame } from "@/lib/printUtils"
import { sendThermalPrint } from "@/lib/thermalPrintClient"

function indiaDateKey(value) {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d)
}

export default function BillingPage() {

  const router = useRouter()
  const pathname = usePathname()
  const isDedicatedBillPage = pathname === "/billing/bill"
  const [billView, setBillView] = useState(false)
  const isBillScreen = isDedicatedBillPage || billView
  const [printSize, setPrintSize] = useState("A4")
  const [customPrintWidth, setCustomPrintWidth] = useState("210")
  const [customPrintHeight, setCustomPrintHeight] = useState("297")

  const [orders, setOrders] = useState([])
  const [selectedOrder, setSelectedOrder] = useState("")
  const [items, setItems] = useState([])
  const [restaurant, setRestaurant] = useState(null)
  const [currentOrder, setCurrentOrder] = useState(null)
  const [offers, setOffers] = useState([])
  const [selectedOffer, setSelectedOffer] = useState(null)
  const [availableOffers, setAvailableOffers] = useState([])
  const [offerUnavailableNotice, setOfferUnavailableNotice] = useState("")
  const [availableLoyaltyRewards, setAvailableLoyaltyRewards] = useState([])
  const [selectedLoyaltyReward, setSelectedLoyaltyReward] = useState(null)

  const [showAllOrders, setShowAllOrders] = useState(false)
  const [billingRefresh, setBillingRefresh] = useState(0)

  const [editMode, setEditMode] = useState(false)

  const [reportDate, setReportDate] = useState("")
  const [reportEndDate, setReportEndDate] = useState("")

  const [reportTotals, setReportTotals] = useState({})
  const [paymentLedgerByOrder, setPaymentLedgerByOrder] = useState({})
  const [itemChartData, setItemChartData] = useState([])
  const [itemSalesRows, setItemSalesRows] = useState([])

  const [invoiceNo, setInvoiceNo] = useState("")
  const [offerDiscount, setOfferDiscount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [paidAmount, setPaidAmount] = useState("")
  const [paymentReference, setPaymentReference] = useState("")
  const [finalizing, setFinalizing] = useState(false)
  const [finalizedBill, setFinalizedBill] = useState(null)
  // Prevent a successfully finalized order from being submitted a second time
  // while background order/offer refreshes are still reconciling the UI.
  const finalizeLockRef = useRef(null)
  const [gstSaving, setGstSaving] = useState(false)
  // Keep both legacy loyalty flags so all three billing versions remain compatible.
  const [loyaltyFeatureEnabled, setLoyaltyFeatureEnabled] = useState(false)
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false)

  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [customerProfile, setCustomerProfile] = useState(null)
  const [customerSaving, setCustomerSaving] = useState(false)
  const [customerLookup, setCustomerLookup] = useState(false)
  const [customerLookupLoading, setCustomerLookupLoading] = useState(false)
  const [customerFound, setCustomerFound] = useState(false)

  // Manual discount from the third billing version.
  const [manualDiscount, setManualDiscount] = useState("")
  const [manualDiscountMode, setManualDiscountMode] = useState("amount")

  const invoiceRef = useRef(null)

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Keep the normal Billing Dashboard clean. The bill panel opens only
      // when the user presses the top "Open Bill" button.
      setBillView(isDedicatedBillPage)
    }
    init()
  }, [billingRefresh, isDedicatedBillPage, pathname])

  useEffect(() => {
    if (!currentOrder?.restaurant_id || !customerProfile?.id || !items.length) {
      setAvailableLoyaltyRewards([])
      setSelectedLoyaltyReward(null)
      return
    }

    const orderSubtotal = items.reduce(
      (sum, item) => sum + Number(item.line_total || 0),
      0
    )

    loadLoyaltyRewardsForCustomer(
      customerProfile,
      currentOrder.restaurant_id,
      orderSubtotal
    )
  }, [customerProfile?.id, currentOrder?.restaurant_id, items.length])

  // When the user opens the dedicated Bill view, restore the last selected
  // order so the workflow is: open bill -> review -> finalize -> print.
  useEffect(() => {
    if (!isBillScreen || selectedOrder || !orders.length) return
    const savedOrder = typeof window !== "undefined"
      ? window.localStorage.getItem("anaira_pos_selected_order")
      : null
    const orderId = savedOrder && orders.some(o => o.id === savedOrder)
      ? savedOrder
      : orders[0]?.id
    if (orderId) loadBill(orderId)
  }, [isBillScreen, orders, selectedOrder])

  async function init() {
    const { data: auth } = await supabase.auth.getUser()

    if (!auth?.user) return

    const { data: profile } = await supabase
      .from("profiles")
      .select("restaurant_id")
      .eq("id", auth.user.id)
      .single()

    const restId = profile?.restaurant_id

    if (!restId) return

    fetchRestaurant(restId)
    fetchOrders(restId)
    fetchOffers(restId)
    const { data: loyaltyPlugin } = await supabase
      .from("restaurant_plugins")
      .select("enabled")
      .eq("restaurant_id", restId)
      .in("plugin_code", ["loyalty", "crm"])
      .eq("enabled", true)
      .limit(1)
    const loyaltyIsEnabled = Boolean(loyaltyPlugin?.length)
    setLoyaltyFeatureEnabled(loyaltyIsEnabled)
    setLoyaltyEnabled(loyaltyIsEnabled)
  }

  async function saveGstSetting(patch) {
    if (!restaurant?.id) return
    setGstSaving(true)
    const next = { ...restaurant, ...patch }
    setRestaurant(next)
    const { error } = await supabase.from("restaurants").update(patch).eq("id", restaurant.id)
    if (error) {
      console.error("GST setting save:", error)
      setRestaurant(restaurant)
      window.alert(error.message || "Unable to save GST setting")
    }
    setGstSaving(false)
  }

  async function fetchRestaurant(restId) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", restId)
      .single()

    if (error) {
      console.error("Billing restaurant:", error)
      return
    }

    setRestaurant(data)
  }

  async function fetchOffers(restId) {
    if (!restId) return

    const [{data:plugin},{data:settings}] = await Promise.all([
      supabase.from("restaurant_plugins").select("enabled").eq("restaurant_id",restId).eq("plugin_code","offers").maybeSingle(),
      supabase.from("plugin_settings").select("config").eq("restaurant_id",restId).eq("plugin_code","offers").maybeSingle()
    ])
    if (plugin?.enabled !== true || settings?.config?.offers_enabled === false) {
      setOffers([])
      return
    }

    const { data, error } = await supabase
      .from("offers")
      .select("*, offer_products(menu_item_id)")
      .eq("restaurant_id", restId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Billing offers:", error)
      setOffers([])
      return
    }

    setOffers(data || [])
  }

  async function fetchOrders(restId) {
    if (!restId) return

    // Billing must not depend on one exact order status. Older POS builds
    // used "done", while newer builds may use completed/served/paid.
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restId)
      .not("status", "in", '("cancelled","canceled")')
      .order("created_at", { ascending: false })
      .limit(500)

    if (error) {
      console.error("Billing orders:", error)
      setOrders([])
      setReportTotals({})
      setItemChartData([])
      setItemSalesRows([])
      setPaymentLedgerByOrder({})
      return
    }

    // Takeaway/table/room orders become billable only after Kitchen marks Done.
    // Delivery keeps its existing Billing visibility behavior.
    const orderRows = (data || []).filter(order =>
      String(order.source_type || "").toLowerCase() === "delivery" ||
      ["done", "completed", "served", "paid"].includes(
        String(order.status || "").toLowerCase()
      )
    )

    const orderIds = orderRows.map(o => o.id)

    const { data: paymentRows, error: paymentError } = orderIds.length
      ? await supabase
          .from("order_payments")
          .select("id,order_id,payment_method,amount,status,reference,paid_at,created_at")
          .in("order_id", orderIds)
      : { data: [], error: null }

    const { data: refundRows, error: refundError } = orderIds.length
      ? await supabase
          .from("order_refunds")
          .select("id,order_id,amount,status,created_at")
          .in("order_id", orderIds)
      : { data: [], error: null }

    if (paymentError) console.error("Billing payments:", paymentError)
    if (refundError) console.error("Billing refunds:", refundError)

    const ledger = {}
    ;(paymentRows || []).forEach(p => {
      const key = p.order_id
      if (!ledger[key]) ledger[key] = { paid: 0, refunds: 0, methods: {}, latestReference: null, latestPaidAt: null }
      if (p.status === "paid") {
        ledger[key].paid += Number(p.amount || 0)
        const method = p.payment_method || "other"
        ledger[key].methods[method] = (ledger[key].methods[method] || 0) + Number(p.amount || 0)
        if (!ledger[key].latestPaidAt || new Date(p.paid_at || p.created_at || 0) > new Date(ledger[key].latestPaidAt || 0)) {
          ledger[key].latestPaidAt = p.paid_at || p.created_at
          ledger[key].latestReference = p.reference || null
        }
      }
    })
    ;(refundRows || []).forEach(r => {
      const key = r.order_id
      if (!ledger[key]) ledger[key] = { paid: 0, refunds: 0, methods: {}, latestReference: null, latestPaidAt: null }
      if (r.status === "refunded") ledger[key].refunds += Number(r.amount || 0)
    })
    Object.values(ledger).forEach(v => {
      v.net = Math.max(0, v.paid - v.refunds)
    })
    setPaymentLedgerByOrder(ledger)

    const reconciledOrders = orderRows.map(o => {
      const l = ledger[o.id]
      const ledgerPaid = Number(l?.net || 0)
      const storedPaid = Number(o.paid_amount || 0)
      const total = Number(o.total_amount || 0)
      const storedStatus = String(o.payment_status || "").toLowerCase()

      // Never downgrade a database-finalized order merely because an older or
      // externally-created payment row is missing from the browser query.
      // The finalize RPC is authoritative; the ledger is a reporting aid.
      if (storedStatus === "paid") {
        return {
          ...o,
          paid_amount: Math.max(storedPaid, ledgerPaid, total),
          payment_status: "paid",
          payment_method: Object.entries(l?.methods || {}).sort((a,b) => b[1] - a[1])[0]?.[0] || o.payment_method || null
        }
      }

      const paid = Math.max(storedPaid, ledgerPaid)
      return {
        ...o,
        paid_amount: paid,
        payment_status: total > 0 && paid >= total ? "paid" : paid > 0 ? "partially_paid" : "unpaid",
        payment_method: Object.entries(l?.methods || {}).sort((a,b) => b[1] - a[1])[0]?.[0] || o.payment_method || null
      }
    })
    setOrders(reconciledOrders)


    const { data: orderItems, error: orderItemsError } = orderIds.length
      ? await supabase
          .from("order_items")
          .select("id,order_id,item_id,item_name,unit_price,quantity,line_total")
          .in("order_id", orderIds)
      : { data: [], error: null }

    if (orderItemsError) console.error("Billing order items:", orderItemsError)

    const orderItemIds = (orderItems || []).map(i => i.id).filter(Boolean)
    const { data: modifierRows, error: modifierError } = orderItemIds.length
      ? await supabase
          .from("order_item_modifiers")
          .select("order_item_id,modifier_name,price,quantity")
          .in("order_item_id", orderItemIds)
      : { data: [], error: null }

    if (modifierError) console.error("Billing modifiers:", modifierError)

    const modifiersByItem = {}
    ;(modifierRows || []).forEach(m => {
      if (!modifiersByItem[m.order_item_id]) modifiersByItem[m.order_item_id] = []
      modifiersByItem[m.order_item_id].push(m)
    })

    const itemIds = [
      ...new Set((orderItems || []).map(i => i.item_id).filter(Boolean))
    ]

    const { data: menuRows, error: menuError } = itemIds.length
      ? await supabase
          .from("menu_items")
          .select("id,name,price,category")
          .in("id", itemIds)
      : { data: [], error: null }

    if (menuError) console.error("Billing menu items:", menuError)

    const menuMap = new Map((menuRows || []).map(m => [String(m.id), m]))
    const itemsByOrder = {}

    ;(orderItems || []).forEach(item => {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = []
      itemsByOrder[item.order_id].push(item)
    })

    function resolveOrderItem(item) {
      const menu = item.item_id ? menuMap.get(String(item.item_id)) : null
      const quantity = Math.max(1, Number(item.quantity || 1))
      const storedUnitPrice = Number(item.unit_price)
      const menuPrice = Number(menu?.price)
      const unitPrice =
        Number.isFinite(storedUnitPrice) && storedUnitPrice > 0
          ? storedUnitPrice
          : Number.isFinite(menuPrice) && menuPrice >= 0
            ? menuPrice
            : 0

      const storedLineTotal = Number(item.line_total)
      const baseLine =
        Number.isFinite(storedLineTotal) && storedLineTotal > 0
          ? storedLineTotal
          : unitPrice * quantity

      const modifierUnitTotal = (modifiersByItem[item.id] || []).reduce(
        (sum, m) => sum + Number(m.price || 0) * Math.max(1, Number(m.quantity || 1)),
        0
      )

      return {
        name: item.item_name || menu?.name || "Item",
        quantity,
        unitPrice,
        lineTotal: baseLine + modifierUnitTotal * quantity
      }
    }

    const totals = {}

    for (const order of orderRows) {
      const rows = itemsByOrder[order.id] || []
      const calculated = rows.reduce(
        (sum, item) => sum + resolveOrderItem(item).lineTotal,
        0
      )

      const storedTotal = Number(order.total_amount)
      // Prefer a valid stored finalized total, otherwise calculate from
      // order_items so legacy orders with zero totals still appear.
      totals[order.id] =
        Number.isFinite(storedTotal) && storedTotal > 0
          ? storedTotal
          : calculated
    }

    const salesRows = (orderItems || []).map(item => {
      const resolved = resolveOrderItem(item)
      return { orderId: item.order_id, name: resolved.name, total: resolved.lineTotal }
    })

    const itemMap = {}
    salesRows.forEach(row => {
      itemMap[row.name] = (itemMap[row.name] || 0) + row.total
    })

    setReportTotals(totals)
    setItemSalesRows(salesRows)
    setItemChartData(
      Object.entries(itemMap)
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
    )
  }

  async function loadLoyaltyRewardsForCustomer(customer, restaurantId, orderSubtotal) {
    if (!customer?.id || !restaurantId) {
      setAvailableLoyaltyRewards([])
      setSelectedLoyaltyReward(null)
      return
    }
    const { data, error } = await supabase
      .from("loyalty_rewards")
      .select("id,name,description,points_cost,reward_type,reward_value,min_order_amount,usage_limit,used_count,active")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .order("points_cost", { ascending: true })
    if (error) {
      console.error("Loyalty rewards:", error)
      setAvailableLoyaltyRewards([])
      return
    }
    const points = Number(customer.loyalty_points || 0)
    const eligible = (data || []).filter(r =>
      String(r.reward_type || "").toLowerCase() !== "free_item" &&
      points >= Number(r.points_cost || 0) &&
      Number(orderSubtotal || 0) >= Number(r.min_order_amount || 0) &&
      (r.usage_limit == null || Number(r.used_count || 0) < Number(r.usage_limit))
    )
    setAvailableLoyaltyRewards(eligible)
    setSelectedLoyaltyReward(null)
  }

  async function lookupCustomerByPhone(phoneValue, orderIdOverride = null) {
    const phone = String(phoneValue || "").replace(/\D/g, "").slice(-15)
    const targetOrderId = orderIdOverride || currentOrder?.id
    if (!phone || phone.length < 10 || !targetOrderId) return

    setCustomerLookup(true)
    setCustomerLookupLoading(true)

    try {
      // Primary lookup keeps the customer API from the first/second billing version.
      const { data: authData, error: authError } = await supabase.auth.getSession()
      if (authError || !authData?.session?.access_token) {
        throw new Error("Login session expired. Please login again.")
      }

      const response = await fetch(
        `/api/billing/customer?order_id=${encodeURIComponent(targetOrderId)}&phone=${encodeURIComponent(phone)}`,
        {
          headers: {
            Authorization: `Bearer ${authData.session.access_token}`
          }
        }
      )
      const result = await response.json()

      if (response.ok && result.customer) {
        setCustomerProfile(result.customer)
        setCustomerFound(true)
        setCustomerName(result.customer.name || "")
        setCustomerPhone(result.customer.phone || phone)
        setCustomerEmail(result.customer.email || "")
        await loadLoyaltyRewardsForCustomer(result.customer, currentOrder?.restaurant_id, items.reduce((sum, item) => sum + Number(item.line_total || 0), 0))
        return result.customer
      }

      // Fallback to Supabase customer table used by the third billing version.
      if (restaurant?.id) {
        const { data, error } = await supabase
          .from("customers")
          .select("id,name,phone,email,loyalty_points,total_orders,total_spend")
          .eq("restaurant_id", restaurant.id)
          .eq("phone", phone)
          .maybeSingle()

        if (!error && data) {
          setCustomerProfile(data)
          setCustomerFound(true)
          setCustomerName(data.name || "")
          setCustomerPhone(data.phone || phone)
          setCustomerEmail(data.email || "")
          return data
        }
      }

      setCustomerProfile(null)
      setCustomerFound(false)
      setCustomerPhone(phone)
      return null
    } catch (error) {
      console.error("Customer lookup:", error)

      // Even if the API is unavailable, try the direct customer table.
      try {
        if (restaurant?.id) {
          const { data } = await supabase
            .from("customers")
            .select("id,name,phone,email,loyalty_points,total_orders,total_spend")
            .eq("restaurant_id", restaurant.id)
            .eq("phone", phone)
            .maybeSingle()

          if (data) {
            setCustomerProfile(data)
            setCustomerFound(true)
            setCustomerName(data.name || "")
            setCustomerPhone(data.phone || phone)
            setCustomerEmail(data.email || "")
            return data
          }
        }
      } catch (fallbackError) {
        console.error("Customer fallback lookup:", fallbackError)
      }
    } finally {
      setCustomerLookup(false)
      setCustomerLookupLoading(false)
    }

    return null
  }

  async function saveBillCustomer() {
    if (!selectedOrder) return null

    const name = String(customerName || "").trim()
    const phone = String(customerPhone || "").replace(/\D/g, "").slice(-15)
    const email = String(customerEmail || "").trim()

    if (!name) throw new Error("Customer name is required")
    if (phone.length < 10) throw new Error("Valid customer mobile number is required")

    setCustomerSaving(true)

    try {
      const { data: authData, error: authError } = await supabase.auth.getSession()
      if (authError || !authData?.session?.access_token) {
        throw new Error("Login session expired. Please login again.")
      }

      const response = await fetch("/api/billing/customer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authData.session.access_token}`
        },
        body: JSON.stringify({
          order_id: selectedOrder,
          name,
          phone,
          email: email || null
        })
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to save customer")
      }

      setCustomerProfile(result.customer)
      setCustomerFound(true)
      setCustomerName(result.customer?.name || name)
      setCustomerPhone(result.customer?.phone || phone)
      setCustomerEmail(result.customer?.email || email)
      setCurrentOrder(prev =>
        prev
          ? {
              ...prev,
              customer_id: result.customer?.id
            }
          : prev
      )

      return result.customer
    } finally {
      setCustomerSaving(false)
    }
  }

  async function loadBill(orderId) {

    const selectedFromOrders = orders.find(o => o.id === orderId)

    // Always re-read the selected order from Supabase before opening the bill.
    // The order list is intentionally cached/reconciled for reporting, but it
    // can lag immediately after a finalize or delivery settlement. Billing
    // must use the database row as its authoritative payment state.
    let freshOrder = null
    try {
      const { data: remoteOrder, error: remoteOrderError } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle()
      if (!remoteOrderError) freshOrder = remoteOrder || null
    } catch (error) {
      console.warn("Billing selected-order refresh:", error)
    }

    // Reconcile the selected order from its payment ledger as well as the order row.
    // This protects Billing from legacy rows whose payment_status/paid_amount was not
    // updated even though an actual paid payment already exists.
    let selectedLedgerPaid = 0
    try {
      const { data: selectedPayments } = await supabase
        .from("order_payments")
        .select("amount,status")
        .eq("order_id", orderId)
      selectedLedgerPaid = (selectedPayments || [])
        .filter(p => String(p.status || "").toLowerCase() === "paid")
        .reduce((sum, p) => sum + Number(p.amount || 0), 0)
      const refundQuery = await supabase
        .from("order_refunds")
        .select("amount,status")
        .eq("order_id", orderId)
      const refunded = (refundQuery.data || [])
        .filter(r => String(r.status || "").toLowerCase() === "refunded")
        .reduce((sum, r) => sum + Number(r.amount || 0), 0)
      selectedLedgerPaid = Math.max(0, selectedLedgerPaid - refunded)
    } catch (error) {
      console.warn("Billing selected payment ledger refresh:", error)
    }

    const selectedTotalForReconcile = Number((freshOrder || selectedFromOrders)?.total_amount || 0)
    const ledgerPaidState = selectedLedgerPaid >= selectedTotalForReconcile && selectedTotalForReconcile > 0
      ? "paid"
      : selectedLedgerPaid > 0 ? "partially_paid" : null

    const selectedBase = freshOrder || selectedFromOrders
    const preservedPaidOrder =
      currentOrder?.id === orderId &&
      String(currentOrder?.payment_status || "").toLowerCase() === "paid"
    const selected = preservedPaidOrder
      ? { ...selectedBase, ...currentOrder, payment_status: "paid" }
      : selectedBase
        ? {
            ...selectedBase,
            ...(ledgerPaidState ? { payment_status: ledgerPaidState, paid_amount: Math.max(Number(selectedBase.paid_amount || 0), selectedLedgerPaid) } : {})
          }
        : selectedBase
    const sameFinalizedOrder =
      finalizeLockRef.current === orderId ||
      finalizedBill?.order_id === orderId ||
      String(selected?.payment_status || "").toLowerCase() === "paid"

    // Keep a successful finalize locked for the same order. Background order,
    // offer or payment-ledger refreshes must never replace a paid snapshot with
    // an older unpaid row and force the operator to finalize the same bill again.
    if (finalizeLockRef.current && finalizeLockRef.current !== orderId) {
      finalizeLockRef.current = null
    }

    setCurrentOrder(selected)
    setSelectedOrder(orderId)
    setCustomerProfile(null)
    setCustomerFound(false)
    setCustomerName("")
    setCustomerPhone("")
    setCustomerEmail("")
    setAvailableLoyaltyRewards([])
    setSelectedLoyaltyReward(null)
    setManualDiscount("")
    setManualDiscountMode("amount")
    if (typeof window !== "undefined") {
      window.localStorage.setItem("anaira_pos_selected_order", orderId)
    }
    if (!sameFinalizedOrder) {
      setFinalizedBill(null)
      setPaymentReference("")
    }
    setEditMode(false)

    if (!selected) {
      setItems([])
      setAvailableOffers([])
      setSelectedOffer(null)
      setOfferUnavailableNotice("")
      return
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.getSession()
      if (authError || !authData?.session?.access_token) {
        throw new Error("Login session expired. Please login again.")
      }

      const customerResponse = await fetch(
        `/api/billing/customer?order_id=${encodeURIComponent(orderId)}`,
        {
          headers: {
            Authorization: `Bearer ${authData.session.access_token}`
          }
        }
      )
      const customerResult = await customerResponse.json()
        if (customerResponse.ok && customerResult.customer) {
          setCustomerProfile(customerResult.customer)
          setCustomerFound(true)
          setCustomerName(customerResult.customer.name || "")
          setCustomerPhone(customerResult.customer.phone || "")
          setCustomerEmail(customerResult.customer.email || "")
        } else if (selected.order_type === "delivery" || selected.order_type === "takeaway") {
          const { data: delivery } = await supabase
            .from("restaurant_deliveries")
            .select("customer_name,phone")
            .eq("order_id", orderId)
            .maybeSingle()
          if (delivery) {
            setCustomerName(delivery.customer_name || "")
            setCustomerPhone(delivery.phone || "")
            if (delivery.phone) await lookupCustomerByPhone(delivery.phone, orderId)
          }
        }
    } catch (error) {
      console.error("Billing customer load:", error)
    }

    const { data: orderItems, error } =
      await supabase
        .from("order_items")
        .select(
          "id,item_id,item_name,unit_price,quantity,line_total,cooking_request"
        )
        .eq("order_id", orderId)
        .order("id")

    if (error) {
      alert(error.message)
      return
    }

    const orderItemIds = (orderItems || []).map(i => i.id)
    const { data: modifierRows } = orderItemIds.length
      ? await supabase
          .from("order_item_modifiers")
          .select("order_item_id,modifier_name,price,quantity")
          .in("order_item_id", orderItemIds)
      : { data: [] }

    const modifiersByItem = {}
    ;(modifierRows || []).forEach(m => {
      if (!modifiersByItem[m.order_item_id]) modifiersByItem[m.order_item_id] = []
      modifiersByItem[m.order_item_id].push(m)
    })

    /*
      Resolve menu items from item_id.

      This fixes invoices showing:

      Item
      1
      ₹0
      ₹0

      when order_items.unit_price is empty/zero.
    */

    const itemIds = [
      ...new Set(
        (orderItems || [])
          .map(i => i.item_id)
          .filter(Boolean)
      )
    ]

    const {
      data: menuRows,
      error: menuError
    } = itemIds.length
      ? await supabase
          .from("menu_items")
          .select("id,name,price,category")
          .in("id", itemIds)
      : {
          data: [],
          error: null
        }

    if (menuError) {
      console.error(
        "Billing menu lookup:",
        menuError
      )
    }

    const menuMap = new Map(
      (menuRows || []).map(m => [
        String(m.id),
        m
      ])
    )

    const finalItems =
      (orderItems || []).map(i => {

        const menu =
          i.item_id
            ? menuMap.get(
                String(i.item_id)
              )
            : null

        const storedPrice =
          Number(i.unit_price)

        const menuPrice =
          Number(menu?.price)

        const price =
          Number.isFinite(storedPrice) &&
          storedPrice > 0
            ? storedPrice
            : Number.isFinite(menuPrice) &&
              menuPrice >= 0
              ? menuPrice
              : 0

        const quantity = Number(i.quantity || 0)
        const modifiers = modifiersByItem[i.id] || []
        const modifierUnitTotal = modifiers.reduce((sum, m) => sum + Number(m.price || 0) * Number(m.quantity || 1), 0)
        const baseLine = Number(i.line_total || 0) > 0 ? Number(i.line_total) : price * quantity
        const lineTotal = baseLine + modifierUnitTotal * quantity

        return {
          id: i.id,
          item_id: i.item_id,
          quantity,
          line_total: lineTotal,
          modifier_total: modifierUnitTotal,
          modifiers,
          cooking_request: i.cooking_request || null,
          menu_items: {
            id: i.item_id,
            name: i.item_name || menu?.name || "Item",
            price,
            category: menu?.category || null
          }
        }
      })

    setItems(finalItems)

    const orderSubtotal =
      finalItems.reduce(
        (sum, item) =>
          sum +
          Number(item.line_total || 0),
        0
      )

    /*
      Offers
    */

    // The database offer engine is authoritative.  It handles product/category
    // targeting, schedule, customer eligibility, BOGO/free-item rules,
    // usage limits and max discounts.  The UI only presents its result.
    let rankedOffers = []
    if (offers?.length) {
      const { data: preview, error: previewError } = await supabase.rpc(
        "preview_order_offers",
        {
          p_order_id: orderId,
          p_subtotal: orderSubtotal
        }
      )
      if (previewError) {
        console.error("Billing offer preview:", previewError)
      } else {
        rankedOffers = Array.isArray(preview) ? preview : []
      }
    }

    // The preview RPC is authoritative. Never reconstruct an offer discount
    // locally after the RPC returns an offer with calculated_discount=0.
    // The server applies usage limits, targeting, dates, time windows and
    // customer eligibility; a local fallback can resurrect an exhausted offer
    // and make the screen show a lower total than the finalize RPC.
    rankedOffers = (rankedOffers || [])
      .map(offer => {
        const calculated = Number(
          offer?.calculated_discount ??
          offer?.discount_amount ??
          0
        )
        return {
          ...offer,
          calculated_discount: Number.isFinite(calculated)
            ? Math.max(0, Number(calculated.toFixed(2)))
            : 0
        }
      })
      .filter(offer => Number(offer?.calculated_discount || 0) > 0)
      .sort((a, b) =>
        Number(b.calculated_discount || 0) - Number(a.calculated_discount || 0)
      )

    const storedOfferWasRequested = Boolean(selected?.offer_id)
    const bestOffer = rankedOffers[0] || null

    setAvailableOffers(rankedOffers)
    setSelectedOffer(bestOffer)

    if (storedOfferWasRequested && !rankedOffers.some(offer => offer.id === selected.offer_id)) {
      setOfferUnavailableNotice(
        "The previously selected offer is no longer valid for this bill (for example, its usage limit/date/eligibility may have changed). The current payable amount has been restored to the server-authoritative total."
      )
    } else {
      setOfferUnavailableNotice("")
    }

    // Loyalty rewards are loaded only for the identified customer. Points are
    // NOT deducted here; the server redeems them atomically during finalization.
    if (customerProfile?.id) {
      const { data: rewardRows, error: rewardError } = await supabase
        .from("loyalty_rewards")
        .select("id,name,description,points_cost,reward_type,reward_value,min_order_amount,usage_limit,used_count,active")
        .eq("restaurant_id", selected.restaurant_id)
        .eq("active", true)
        .order("points_cost", { ascending: true })
      if (rewardError) {
        console.error("Billing loyalty rewards:", rewardError)
        setAvailableLoyaltyRewards([])
      } else {
        const customerPoints = Number(customerProfile.loyalty_points || 0)
        setAvailableLoyaltyRewards((rewardRows || []).filter(r =>
          String(r.reward_type || "").toLowerCase() !== "free_item" &&
          customerPoints >= Number(r.points_cost || 0) &&
          orderSubtotal >= Number(r.min_order_amount || 0) &&
          (r.usage_limit == null || Number(r.used_count || 0) < Number(r.usage_limit))
        ))
      }
    } else {
      setAvailableLoyaltyRewards([])
    }
    setSelectedLoyaltyReward(null)

    const previewDiscount =
      Number(
        selected?.discount_amount || 0
      ) > 0
        ? Number(
            selected.discount_amount
          )
        : Number(
            bestOffer?.calculated_discount ||
            0
          )

    setOfferDiscount(
      orderSubtotal > 0
        ? (
            previewDiscount /
            orderSubtotal
          ) *
          100
        : 0
    )

    const previewTax = Number(selected?.tax_amount || 0) > 0
      ? Number(selected.tax_amount)
      : restaurant?.gst_enabled
        ? Number(((Math.max(0, orderSubtotal - previewDiscount) * Number(restaurant?.gst_rate || 0)) / 100).toFixed(2))
        : 0
    const selectedTotal = rankedOffers.length || selected?.offer_id
      ? Number((Math.max(0, orderSubtotal - previewDiscount) + previewTax).toFixed(2))
      : Number(selected?.total_amount || 0)
    const selectedPaid = Number(selected?.paid_amount || 0)

    // Offer-adjusted outstanding amount.
    // If the order is already paid, it is always exactly zero.
    const outstanding =
      String(selected?.payment_status || "").toLowerCase() === "paid"
        ? 0
        : Math.max(0, Number((selectedTotal - selectedPaid).toFixed(2)))
    setPaymentReference(paymentLedgerByOrder[orderId]?.latestReference || "")
    setPaidAmount(
      String(selected?.payment_status || "").toLowerCase() === "paid"
        ? ""
        : outstanding > 0 ? String(outstanding.toFixed(2)) : ""
    )
  }

  function updateQty(index, value) {

    const updated = [...items]

    updated[index].quantity =
      Number(value)

    setItems(updated)
  }

  function updatePrice(index, value) {

    const updated = [...items]

    updated[index]
      .menu_items
      .price =
      Number(value)

    setItems(updated)
  }

  /*
    Invoice subtotal
  */

  const subtotal =
    items.reduce(
      (s, i) => s + Number(
        i.line_total ||
        (Number(i.quantity || 0) * Number(i.menu_items?.price || 0))
      ),
      0
    )

  /*
    Discount
  */

  const serverDiscount =
    Number(
      currentOrder?.discount_amount ||
      0
    )

  const serverOfferId = currentOrder?.offer_id || null
  const selectedOfferId = selectedOffer?.id || null

  const manualDiscountValue = Math.max(
    0,
    Number(manualDiscount || 0)
  )

  const manualDiscountAmount =
    manualDiscountMode === "percent"
      ? Math.min(
          subtotal,
          Number(
            (
              subtotal *
              manualDiscountValue /
              100
            ).toFixed(2)
          )
        )
      : Math.min(
          subtotal,
          manualDiscountValue
        )

  const useServerDiscount =
    serverDiscount > 0 &&
    manualDiscountValue <= 0 &&
    (!selectedOfferId || selectedOfferId === serverOfferId)

  const previewDiscount =
    useServerDiscount
      ? serverDiscount
      : Number(
          selectedOffer?.calculated_discount ||
          0
        )

  const discountAmount =
    manualDiscountValue > 0
      ? manualDiscountAmount
      : previewDiscount

  const loyaltyRewardDiscount = (() => {
    const reward = selectedLoyaltyReward
    if (!reward || !customerProfile) return 0
    const remainingBase = Math.max(0, subtotal - discountAmount)
    const type = String(reward.reward_type || "discount").toLowerCase()
    const value = Math.max(0, Number(reward.reward_value || 0))
    if (type === "percent") {
      return Math.min(remainingBase, Number((remainingBase * Math.min(value, 100) / 100).toFixed(2)))
    }
    if (type === "discount" || type === "coupon") {
      return Math.min(remainingBase, value)
    }
    // Free-item rewards cannot be converted to a monetary discount because
    // the current reward schema has no menu_item_id. Do not invent a price.
    return 0
  })()

  const combinedDiscountAmount = Math.min(
    subtotal,
    Number((discountAmount + loyaltyRewardDiscount).toFixed(2))
  )

  // Delivery charge is separate from food-item discounts.
  const deliveryCharge = Number(
    currentOrder?.delivery_charge || 0
  )

  const taxableAmount =
    Math.max(
      0,
      subtotal -
        combinedDiscountAmount
    )

  /*
    GST
  */

  const gst =
    Number(
      currentOrder?.tax_amount || 0
    ) > 0

      ? Number(
          currentOrder.tax_amount
        )

      : restaurant?.gst_enabled

        ? Number(
            (
              taxableAmount *
              Number(
                restaurant?.gst_rate ||
                0
              ) /
              100
            ).toFixed(2)
          )

        : 0

  /*
    FINAL PAYABLE

    IMPORTANT:
    Never use currentOrder.total_amount as the payment amount here.
    That value can be the old pre-billing snapshot and may not include
    the current offer/loyalty/delivery/GST calculation.

    Billing must pay the amount currently displayed by this screen.
    The finalize RPC remains authoritative and recalculates the same
    components server-side.
  */
  const total = Number(
    (
      taxableAmount +
      gst +
      deliveryCharge
    ).toFixed(2)
  )

  async function finalizeBill() {

    // A bill that has already completed successfully must never be posted
    // again. The ref is intentionally synchronous, so rapid double-clicks
    // are blocked before React state has a chance to re-render.
    if (
      finalizing ||
      finalizeLockRef.current === selectedOrder ||
      finalizedBill?.order_id === selectedOrder ||
      String(currentOrder?.payment_status || "").toLowerCase() === "paid"
    ) {
      return
    }

    if (
      !selectedOrder ||
      !currentOrder
    ) {
      return
    }

    const orderType = String(
      currentOrder?.order_type ||
      currentOrder?.type ||
      ""
    ).toLowerCase()

    const loyaltyActive = loyaltyFeatureEnabled || loyaltyEnabled

    if (
      loyaltyActive &&
      orderType === "delivery" &&
      (!customerName.trim() || !customerPhone.trim())
    ) {
      alert("Delivery bills require customer name and mobile number.")
      return
    }

    if (
      loyaltyActive &&
      customerPhone.trim() &&
      customerPhone.replace(/\D/g, "").length < 10
    ) {
      alert("Please enter a valid 10-digit mobile number.")
      return
    }

    setFinalizing(true)
    finalizeLockRef.current = selectedOrder

    try {
      const hasCustomerDetails =
        Boolean(
          String(customerName || "").trim() ||
          String(customerPhone || "").trim()
        )

      const savedCustomer = hasCustomerDetails
        ? await saveBillCustomer()
        : null

      const {
        data: sessionData,
        error: sessionError
      } =
        await supabase.auth.getSession()

      if (
        sessionError ||
        !sessionData?.session
          ?.access_token
      ) {
        throw new Error(
          "Login session expired. Please login again."
        )
      }

      const response =
        await fetch(
          "/api/billing/finalize",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${sessionData.session.access_token}`
            },

            body: JSON.stringify({

              order_id:
                selectedOrder,

              // Each click is a distinct payment attempt. The server still
              // protects true retries through paid-state/idempotency handling.
              idempotency_key:
                (typeof crypto !== "undefined" && crypto.randomUUID)
                  ? crypto.randomUUID()
                  : `billing-finalize:${selectedOrder}:${Date.now()}`,

              payment_method:
                paymentMethod,

              // Send the current calculated payable amount.
              // Never send the stale orders.total_amount snapshot.
              paid_amount:
                Number(Math.max(0, total || 0)),

              payment_reference:
                paymentReference || null,

              offer_id:
                selectedOffer?.id ||
                null,

              loyalty_reward_id:
                selectedLoyaltyReward?.id ||
                null,

              customer_id:
                savedCustomer?.id ||
                customerProfile?.id ||
                currentOrder?.customer_id ||
                null,

              customer_name:
                customerName ||
                savedCustomer?.name ||
                null,

              customer_phone:
                customerPhone ||
                savedCustomer?.phone ||
                null,

              customer_email:
                customerEmail ||
                savedCustomer?.email ||
                null,

              discount_amount:
                Number(discountAmount || 0),

              // Compatibility aliases for older finalize API versions.
              offer_discount_amount:
                manualDiscountValue > 0
                  ? 0
                  : Number(discountAmount || 0),

              offer_title:
                selectedOffer?.title ||
                selectedOffer?.name ||
                null,

              manual_discount_amount:
                manualDiscountValue > 0
                  ? Number(manualDiscountAmount || 0)
                  : 0,

              manual_discount_mode:
                manualDiscountValue > 0
                  ? manualDiscountMode
                  : null,

              final_total:
                Number(Math.max(0, total || 0)),

              // ₹100 = 10 points. The finalize API can persist this value
              // atomically with the successful payment.
              loyalty_points_earned:
                loyaltyActive
                  ? Math.floor(
                      Math.max(
                        0,
                        Number(total || 0)
                      ) / 100
                    ) * 10
                  : 0

            })
          }
        )

      const result =
        await response.json()

      if (
        !response.ok ||
        !result.success
      ) {

        throw new Error(
          result.error ||
          "Unable to finalize bill"
        )
      }

      setFinalizedBill(
        result.bill
      )

      // WhatsApp is an optional integration. Billing remains successful even
      // if WhatsApp is disabled or Meta rejects the message.
      if (customerPhone && result.bill?.invoice_no) {
        fetch("/api/whatsapp/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session.access_token}`
          },
          body: JSON.stringify({
            action: "invoice",
            to: customerPhone,
            bill: {
              customer_name: customerName || savedCustomer?.name || "Customer",
              customer_phone: customerPhone,
              invoice_no: result.bill.invoice_no,
              total_amount: Number(result.bill.total_amount ?? total ?? 0)
            }
          })
        }).then(async r => {
          const wa = await r.json().catch(() => ({}))
          if (!r.ok || !wa.success) console.warn("WhatsApp invoice:", wa.error || "Message not sent")
        }).catch(err => console.warn("WhatsApp invoice:", err))
      }

      alert(
        `Invoice ${result.bill.invoice_no} generated successfully.`
      )

      setCurrentOrder(
        prev => ({
          ...prev,
          ...result.bill,
          payment_status: result.bill?.payment_status || "unpaid",
          paid_amount: Number(result.bill?.paid_amount ?? 0),
        })
      )

      setOfferDiscount(
        Number(
          result.bill?.subtotal ||
          0
        ) > 0

          ? (
              Number(
                result.bill.discount ||
                0
              ) /
              Number(
                result.bill.subtotal
              )
            ) *
            100

          : 0
      )

      // Keep the successful result as the single source of truth for this
      // screen. Do NOT immediately call fetchOrders() here: that async refresh
      // can race with loadBill() and temporarily put the old unpaid order back,
      // which is why the user could previously be forced to click Finalize
      // again. The database has already been finalized by the API at this point.
      const finalizedOrderPatch = {
        ...result.bill,
        id: selectedOrder,
        payment_status: result.bill?.payment_status || "unpaid",
        paid_amount: Number(result.bill?.paid_amount ?? 0),
        total_amount: Number(result.bill?.total_amount ?? total ?? 0),
        discount_amount: Number(result.bill?.discount_amount ?? result.bill?.discount ?? discountAmount ?? 0)
      }

      setCurrentOrder(prev => ({
        ...prev,
        ...finalizedOrderPatch
      }))

      setOrders(prev =>
        prev.map(order =>
          order.id === selectedOrder
            ? {
                ...order,
                ...finalizedOrderPatch,
                payment_status: finalizedOrderPatch.payment_status || "unpaid",
                paid_amount: Number(finalizedOrderPatch.paid_amount || 0)
              }
            : order
        )
      )

    } catch (error) {

      // The request did not complete successfully, so the order may be
      // retried. Clear the synchronous lock only on failure.
      finalizeLockRef.current = null

      console.error(error)

      alert(
        error.message ||
        "Billing failed"
      )

    } finally {

      setFinalizing(false)

    }
  }

  function formatDate(date) {

    if (!date) return ""

    return formatIndiaDateTime(date)
  }

  const today = indiaDateKey(new Date())

  /*
    Reports: blank dates mean ALL orders.
    One date means that day. Two dates mean an inclusive range.
  */

  const filteredOrders = orders.filter(o => {
    const orderDate = indiaDateKey(o.billed_at || o.created_at)
    if (!orderDate) return false
    if (!reportDate && !reportEndDate) return true
    if (reportDate && !reportEndDate) return orderDate === reportDate
    if (!reportDate && reportEndDate) return orderDate <= reportEndDate
    return orderDate >= reportDate && orderDate <= reportEndDate
  })

  const filteredItemMap = {}
  itemSalesRows.forEach(row => {
    if (!filteredOrders.some(order => order.id === row.orderId)) return
    filteredItemMap[row.name] = (filteredItemMap[row.name] || 0) + Number(row.total || 0)
  })
  const filteredItemChartData = Object.entries(filteredItemMap)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)

  const reportTotal =
    filteredOrders.reduce(
      (s, o) =>
        s +
        (
          reportTotals[o.id] ||
          0
        ),
      0
    )

  const reportGstTotal = filteredOrders.reduce(
    (sum, o) => sum + Number(o.tax_amount || 0),
    0
  )

  const pendingOrders = filteredOrders
    .map(o => {
      const totalForOrder = Number(reportTotals[o.id] || o.total_amount || 0)
      const paidForOrder = Number(o.paid_amount || 0)
      const balance = String(o.payment_status || "").toLowerCase() === "paid"
        ? 0
        : Math.max(0, Number((totalForOrder - paidForOrder).toFixed(2)))
      return { ...o, billing_balance: balance }
    })
    .filter(o => o.billing_balance > 0)
    .sort((a,b) => b.billing_balance - a.billing_balance)

  const paidOrderCount = filteredOrders.filter(
    o => String(o.payment_status || "").toLowerCase() === "paid"
  ).length

  // Pending balance is based on the reconciled payment status.
  // A finalized/paid bill has ZERO outstanding balance even when an older
  // stored order total still contains the pre-offer amount.
  const pendingAmount = filteredOrders.reduce((sum, o) => {
    const status = String(o.payment_status || "").toLowerCase()

    if (status === "paid") return sum

    const orderTotal = Number(reportTotals[o.id] || 0)
    const paid = Number(o.paid_amount || 0)

    return sum + Math.max(0, Number((orderTotal - paid).toFixed(2)))
  }, 0)

  const collectedAmount = filteredOrders.reduce((sum, o) => {
    return sum + Number(o.paid_amount || 0)
  }, 0)

  const paymentMethodTotals = {}
  filteredOrders.forEach(o => {
    const methods = paymentLedgerByOrder[o.id]?.methods || {}
    Object.entries(methods).forEach(([method, amount]) => {
      paymentMethodTotals[method] = (paymentMethodTotals[method] || 0) + Number(amount || 0)
    })
  })

  /*
    Sales chart
  */

  const chartMap = {}

  filteredOrders.forEach(o => {

    const date =
      o.created_at
        .split("T")[0]

    if (!chartMap[date]) {
      chartMap[date] = 0
    }

    chartMap[date] +=
      reportTotals[o.id] ||
      0
  })

  const chartData =
    Object.keys(chartMap)
      .map(date => ({
        date,
        total:
          chartMap[date]
      }))

  async function generateInvoicePdf() {
    const element = invoiceRef.current
    if (!element) {
      alert("Please select an order first.")
      return
    }

    try {
      // Render a dedicated printer-width copy instead of capturing the
      // responsive dashboard card. This keeps A4/A5/58/80mm PDFs consistent
      // with the actual paper/printer selected by the operator.
      const printDimensions = {
        A4: [210, 297],
        A5: [148, 210],
        THERMAL_80: [80, 200],
        THERMAL_58: [58, 200],
        CUSTOM: [
          Math.max(40, Number(customPrintWidth) || 210),
          Math.max(60, Number(customPrintHeight) || 297),
        ],
      }
      const [pageWidth, pageHeight] = printDimensions[printSize] || printDimensions.A4
      const thermal = printSize === "THERMAL_58" || printSize === "THERMAL_80"
      const clone = element.cloneNode(true)
      clone.querySelectorAll("[data-html2canvas-ignore], button, select, input, textarea").forEach(node => node.remove())
      clone.querySelectorAll("[contenteditable]").forEach(node => node.removeAttribute("contenteditable"))
      clone.style.cssText = `width:${pageWidth}mm!important;max-width:${pageWidth}mm!important;min-width:0!important;margin:0!important;padding:${thermal ? 3 : 8}mm!important;background:#fff!important;color:#111!important;border:0!important;box-shadow:none!important;border-radius:0!important;overflow:visible!important;`
      const header = clone.querySelector(".billing-invoice-card") || clone
      header.style.background = "#fff"
      header.style.color = "#111"

      const host = document.createElement("div")
      host.style.position = "fixed"
      host.style.left = "-100000px"
      host.style.top = "0"
      host.style.width = `${pageWidth}mm`
      host.style.background = "#fff"
      host.style.color = "#111"
      host.style.zIndex = "-1"
      host.appendChild(clone)
      document.body.appendChild(host)

      const canvas = await html2canvas(clone, {
        scale: Math.min(2, Math.max(1.5, window.devicePixelRatio || 1.5)),
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        width: Math.max(240, Math.round(pageWidth * 3.7795)),
        windowWidth: Math.max(240, Math.round(pageWidth * 3.7795)),
      })
      host.remove()

      const margin = thermal ? 3 : 8
      const usableWidth = pageWidth - margin * 2
      const imageHeight = (canvas.height * usableWidth) / canvas.width
      const pageContentHeight = pageHeight - margin * 2
      const actualHeight = thermal ? Math.max(60, imageHeight + margin * 2) : pageHeight
      const pdf = new jsPDF({
        orientation: pageWidth > actualHeight ? "landscape" : "portrait",
        unit: "mm",
        format: [pageWidth, actualHeight],
        compress: true,
      })
      const imageData = canvas.toDataURL("image/jpeg", 0.94)
      if (thermal || imageHeight <= pageContentHeight) {
        pdf.addImage(imageData, "JPEG", margin, margin, usableWidth, imageHeight, undefined, "FAST")
      } else {
        let offset = 0
        let remaining = imageHeight
        let first = true
        while (remaining > 0) {
          if (!first) pdf.addPage([pageWidth, pageHeight])
          pdf.addImage(imageData, "JPEG", margin, margin - offset, usableWidth, imageHeight, undefined, "FAST")
          remaining -= pageContentHeight
          offset += pageContentHeight
          first = false
        }
      }

      const invoiceNumber = currentOrder?.invoice_no || finalizedBill?.invoice_no || selectedOrder?.slice(0, 8) || "invoice"
      pdf.save(`${restaurant?.name || "restaurant"}-invoice-${invoiceNumber}.pdf`.replace(/[^a-z0-9._-]+/gi, "-"))
    } catch (error) {
      console.error("PDF GENERATION ERROR:", error)
      alert("Unable to generate invoice PDF on this device.")
    }
  }

  async function generateReportPdf(printAfter = false) {
    try {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      })

      const margin = 14
      const pageWidth = 210
      const pageHeight = 297
      const contentWidth = pageWidth - margin * 2
      let y = margin
      let pageNo = 1

      const reportPeriod = reportDate || reportEndDate
        ? `${reportDate || "Start"}${reportEndDate ? ` → ${reportEndDate}` : ""}`
        : "All available orders"

      const money = value => `₹${Number(value || 0).toFixed(2)}`
      const text = value => String(value ?? "").replace(/\s+/g, " ").trim()

      const drawHeader = () => {
        y = margin
        pdf.setFont("helvetica", "bold")
        pdf.setFontSize(16)
        pdf.setTextColor(17, 24, 39)
        pdf.text(text(restaurant?.name || "Restaurant"), margin, y)
        y += 6

        pdf.setFont("helvetica", "normal")
        pdf.setFontSize(9)
        pdf.setTextColor(75, 85, 99)

        const address = text(restaurant?.address)
        if (address) {
          const lines = pdf.splitTextToSize(address, contentWidth)
          pdf.text(lines, margin, y)
          y += lines.length * 4
        }

        const contact = [restaurant?.phone, restaurant?.gst_number && restaurant?.gst_enabled ? `GSTIN: ${restaurant.gst_number}` : ""]
          .filter(Boolean).join("  •  ")
        if (contact) {
          pdf.text(contact, margin, y)
          y += 5
        }

        pdf.setFont("helvetica", "bold")
        pdf.setFontSize(13)
        pdf.setTextColor(17, 24, 39)
        pdf.text("SALES REPORT", margin, y + 4)

        pdf.setFont("helvetica", "normal")
        pdf.setFontSize(9)
        pdf.setTextColor(75, 85, 99)
        pdf.text(`Report period: ${reportPeriod}`, pageWidth - margin, y + 4, { align: "right" })

        y += 11
        pdf.setDrawColor(209, 213, 219)
        pdf.line(margin, y, pageWidth - margin, y)
        y += 7
      }

      const drawFooter = () => {
        pdf.setFont("helvetica", "normal")
        pdf.setFontSize(7)
        pdf.setTextColor(107, 114, 128)
        pdf.text("Powered by Anaira Graphics", pageWidth / 2, pageHeight - 8, { align: "center" })
        pdf.text(`Page ${pageNo}`, pageWidth - margin, pageHeight - 8, { align: "right" })
      }

      const newPage = () => {
        drawFooter()
        pdf.addPage()
        pageNo += 1
        drawHeader()
      }

      const ensureSpace = (height = 10) => {
        if (y + height > pageHeight - 18) newPage()
      }

      const sectionTitle = title => {
        ensureSpace(10)
        pdf.setFont("helvetica", "bold")
        pdf.setFontSize(11)
        pdf.setTextColor(17, 24, 39)
        pdf.text(title, margin, y)
        y += 6
      }

      const table = (headers, rows, widths) => {
        const rowHeight = 6
        const headerHeight = 7
        const totalWidth = widths.reduce((a,b) => a+b, 0)
        const drawRow = (cells, isHeader = false) => {
          const linesPerCell = cells.map((cell, i) =>
            pdf.splitTextToSize(text(cell), Math.max(10, widths[i] - 4))
          )
          const h = isHeader ? headerHeight : Math.max(rowHeight, Math.min(18, Math.max(...linesPerCell.map(l => l.length)) * 4 + 2))
          ensureSpace(h + 1)

          let x = margin
          pdf.setFillColor(...(isHeader ? [243,244,246] : [255,255,255]))
          pdf.setDrawColor(209,213,219)
          pdf.rect(x, y, totalWidth, h, "FD")

          cells.forEach((cell, i) => {
            if (i > 0) pdf.line(x, y, x, y + h)
            const lines = linesPerCell[i]
            pdf.setFont("helvetica", isHeader ? "bold" : "normal")
            pdf.setFontSize(isHeader ? 7.5 : 7.2)
            pdf.setTextColor(31,41,55)
            pdf.text(lines, x + 2, y + 4)
            x += widths[i]
          })
          y += h
        }

        drawRow(headers, true)
        rows.forEach(row => drawRow(row, false))
        y += 4
      }

      drawHeader()

      sectionTitle("Summary")
      table(
        ["Metric", "Value", "Metric", "Value"],
        [
          ["Revenue", money(reportTotal), "Orders", filteredOrders.length],
          ["Average bill", money(reportTotal / (filteredOrders.length || 1)), "GST", money(reportGstTotal)],
          ["Paid orders", paidOrderCount, "Pending", money(pendingAmount)],
          ["Collected", money(collectedAmount), "Outstanding", money(pendingAmount)]
        ],
        [48, 48, 48, 48]
      )

      sectionTitle("Complete Order Details")
      table(
        ["Order", "Date", "Status", "Amount", "Collected"],
        filteredOrders.map(o => [
          `#${String(o.id).slice(0, 8)}`,
          formatDate(o.billed_at || o.created_at),
          String(o.delivery_status || o.status || "pending").replaceAll("_", " "),
          money(reportTotals[o.id]),
          money(o.paid_amount)
        ]),
        [30, 45, 43, 26, 26]
      )

      sectionTitle("Payment Breakdown")
      table(
        ["Payment method", "Collected"],
        Object.entries(paymentMethodTotals).map(([method, amount]) => [
          method.toUpperCase(), money(amount)
        ]),
        [120, 50]
      )

      const dailyMap = {}
      filteredOrders.forEach(o => {
        const key = indiaDateKey(o.billed_at || o.created_at)
        dailyMap[key] = (dailyMap[key] || 0) + Number(reportTotals[o.id] || 0)
      })

      sectionTitle("Daily Revenue")
      table(
        ["Date", "Revenue"],
        Object.entries(dailyMap).sort(([a],[b]) => a.localeCompare(b)).map(([date, amount]) => [
          date, money(amount)
        ]),
        [120, 50]
      )

      sectionTitle("Item Summary")
      table(
        ["Item", "Sales"],
        filteredItemChartData.map(item => [item.name, money(item.total)]),
        [120, 50]
      )

      sectionTitle("GST Summary")
      table(
        ["GST", "Amount"],
        [
          ["GST collected", money(reportGstTotal)],
          ["GST status", restaurant?.gst_enabled ? "Enabled" : "Disabled"],
          ["GST rate", restaurant?.gst_enabled ? `${Number(restaurant?.gst_rate || 0)}%` : "0%"]
        ],
        [120, 50]
      )

      drawFooter()
      const suffix = reportDate || reportEndDate
        ? `${reportDate || "start"}-${reportEndDate || reportDate || "end"}`
        : "all"
      const filename = `sales-report-${suffix}.pdf`
      // Download the PDF instead of opening a blob in a new tab. On mobile,
      // third-party PDF viewers can hide navigation/back controls. The app
      // stays on the same route and the downloaded PDF can still be shared.
      pdf.save(filename)
    } catch (error) {
      console.error("REPORT PDF GENERATION ERROR:", error)
      alert("Unable to generate the complete report PDF on this device.")
    }
  }

  async function printThermalReport() {
    try {
      const el = document.getElementById("report-print")
      if (!el) throw new Error("Report preview not found")
      await sendThermalPrint({ type: "sales-report", content: el.innerText || el.textContent || "", data: { size: "80mm" } })
    } catch (e) { alert(e.message || "Thermal report print failed") }
  }

  async function printThermalInvoice() {
    try {
      const el = document.getElementById("bill-print")
      if (!el) throw new Error("Invoice preview not found")
      await sendThermalPrint({
        type: "receipt",
        content: el.innerText || el.textContent || "",
        data: { order_id: selectedOrder, size: printSize === "THERMAL_58" ? "58mm" : "80mm" }
      })
    } catch (e) {
      alert(e.message || "Thermal invoice print failed")
    }
  }

  async function printContent(id, selectedPrintSize = printSize) {

    const element =
      document.getElementById(id)

    if (!element) return

    const clone = element.cloneNode(true)

    if (id === "report-print") {
      clone.style.maxHeight = "none"
      clone.style.height = "auto"
      clone.style.overflow = "visible"
      clone.style.overflowY = "visible"
      clone.style.width = "100%"
    }

    clone
      .querySelectorAll("[data-html2canvas-ignore]")
      .forEach(node => node.remove())

    const content = clone.innerHTML


    const printDimensions = {
      "A4": ["210mm", "297mm"],
      "A5": ["148mm", "210mm"],
      "THERMAL_80": ["80mm", "200mm"],
      "THERMAL_58": ["58mm", "200mm"],
      "CUSTOM": [
        `${Math.max(40, Number(customPrintWidth) || 210)}mm`,
        `${Math.max(60, Number(customPrintHeight) || 297)}mm`,
      ],
    }

    const [printWidth, printHeight] =
      printDimensions[selectedPrintSize] || printDimensions.A4

    const printPadding =
      selectedPrintSize === "THERMAL_58" || selectedPrintSize === "THERMAL_80"
        ? "3mm"
        : "8mm"

    const printHtml = `<html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>Invoice</title>
          <style>
            :root { --text:#111; --muted:#555; --border:#ddd; --primary:#b7791f; }
            @page { size:${printWidth} ${printHeight}; margin:0; }
            *{box-sizing:border-box}
            html,body{margin:0;padding:0;width:${printWidth};background:#fff;color:#111}
            body{font-family:Arial,sans-serif;padding:${printPadding};font-size:${selectedPrintSize.startsWith("THERMAL") ? "11px" : "13px"};overflow-wrap:anywhere}
            table{width:100%;border-collapse:collapse;table-layout:fixed}
            th,td{padding:${selectedPrintSize.startsWith("THERMAL") ? "5px 3px" : "8px 5px"};border-bottom:1px solid #ddd;text-align:left;overflow-wrap:anywhere;word-break:break-word}
            th:nth-child(1),td:nth-child(1){width:46%} th:nth-child(2),td:nth-child(2){width:14%} th:nth-child(3),td:nth-child(3){width:20%} th:nth-child(4),td:nth-child(4){width:20%}
            h1,h2,h3,h4,p{max-width:100%;overflow-wrap:anywhere}
            .billing-invoice-card{width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;box-shadow:none!important;border:0!important;border-radius:0!important;background:#fff!important;color:#111!important}
            .billing-invoice-meta{background:#fff!important;color:#111!important;border-color:#ddd!important}
            .print-powered-by{display:block;margin-top:12px;padding-top:7px;border-top:1px solid #eee;text-align:center;color:#777;font-size:8px}
            [data-html2canvas-ignore],button,select,input,textarea{display:none!important}
            #report-print{max-height:none!important;height:auto!important;overflow:visible!important;background:#fff!important;color:#111!important;border:0!important;box-shadow:none!important}
            #report-print .report-table-wrap{max-height:none!important;height:auto!important;overflow:visible!important}
            #report-print .report-actions{display:none!important}
            #report-print thead{display:table-header-group}
            #report-print tr{page-break-inside:avoid}
          </style>
        </head>
        <body>${content}</body>
      </html>`

    try {
      await printHtmlInFrame(printHtml, { title: "Invoice", width: printWidth, height: printHeight })
    } catch (error) {
      console.error("PRINT ERROR:", error)
      alert(error?.message || "Unable to print")
    }
  }

  return (
    <>
      <style>{`
        .billing-bill-view .billing-summary-wrap,
        .billing-bill-view .billing-chart-grid,
        .billing-bill-view .billing-left-panel {
          display: none !important;
        }

        .billing-bill-view .billing-topbar > :not(.billing-bill-jump) {
          display: none !important;
        }

        .billing-bill-view .billing-topbar {
          grid-template-columns: 1fr !important;
        }

        .billing-bill-view .billing-main-grid {
          grid-template-columns: minmax(0, 1fr) !important;
        }


        /* Reports stay visible on the normal Billing Dashboard.
           Only the invoice/bill column is hidden outside Bill View. */
        .billing-main-grid.billing-report-only {
          grid-template-columns: minmax(0, 1fr) !important;
        }

        .billing-main-grid.billing-report-only > .billing-bill-section {
          display: none !important;
        }

        .billing-main-grid.billing-report-only > .billing-left-panel {
          position: static !important;
          width: 100% !important;
          max-width: 100% !important;
        }

        .billing-main-grid.billing-report-only .billing-report-print {
          max-height: none !important;
          overflow: visible !important;
        }

        .billing-print-settings {
          display: grid;
          grid-template-columns: minmax(180px, 1fr) minmax(140px, .7fr) minmax(140px, .7fr);
          gap: 10px;
          align-items: end;
          padding: 14px;
          margin: 14px 0 18px;
          border: 1px solid rgba(0,0,0,.08);
          border-radius: 14px;
          background: var(--surface-2);
        }

        .billing-print-settings .billing-field-label {
          display: block;
          margin-bottom: 6px;
        }

        @media(max-width:700px){
          .billing-print-settings {
            grid-template-columns: 1fr;
          }

          .billing-bill-view .billing-topbar {
            padding: 12px !important;
          }

          .billing-bill-view .billing-invoice-card {
            padding: 14px !important;
          }
        }
      `}</style>
    <div className={`billing-page${isBillScreen ? " billing-bill-view" : ""}`} style={layout}>

      {/* HEADER */}

      <div
        style={{
          marginBottom: 30,
          padding: 30,
          borderRadius: 30,

          background:
            "linear-gradient(135deg,var(--surface),var(--surface-2))",

          border:
            "1px solid rgba(var(--primary-rgb),.2)",

          boxShadow:
            "0 25px 60px rgba(0,0,0,.45)"
        }}
      >

        <div
          style={{
            color:"var(--primary)",
            letterSpacing:2,
            fontSize:13
          }}
        >
          PREMIUM BILLING
        </div>

        <h1 className="billing-title" style={title}>
          {isBillScreen ? "🧾 Bill" : "💰 Billing Dashboard"}
        </h1>

        <p
          style={{
            color:"var(--muted)"
          }}
        >
          {isBillScreen
            ? "Review bill, finalize payment and print the invoice."
            : "Reports, invoices and sales analytics"}
        </p>

      </div>

      {/* TOP BAR */}

      <div className="billing-topbar" style={topBar}>

        <button
          type="button"
          onClick={() => {
            if (isDedicatedBillPage) {
              router.push("/billing")
              return
            }

            setBillView(v => {
              const next = !v
              if (!v && typeof window !== "undefined") {
                window.setTimeout(() => {
                  document
                    .getElementById("billing-bill-section")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }, 50)
              }
              return next
            })
          }}
          className="billing-action billing-bill-jump"
          style={{ ...btnGreen, marginTop: 0, width: "auto", minWidth: 150 }}
          aria-expanded={isBillScreen}
          aria-controls="billing-bill-section"
        >
          {isBillScreen ? "← Billing Dashboard" : "🧾 Open Bill"}
        </button>

        <button
          type="button"
          onClick={() =>
            setShowAllOrders(
              !showAllOrders
            )
          }
          className="billing-action" style={btnBlue}
        >
          {showAllOrders
            ? "📋 Recent 5 Orders"
            : "👑 All Orders"}
        </button>

        <select
          value={selectedOrder}
          onChange={e =>
            loadBill(
              e.target.value
            )
          }
          className="billing-input" style={input}
        >

          <option value="">
            Select Order
          </option>

          {(showAllOrders
            ? orders
            : orders.slice(0,5)
          ).map(o => (

            <option
              key={o.id}
              value={o.id}
            >
              #{o.id.slice(0,5)}
              {" | "}
              {formatDate(
                o.created_at
              )}
              {String(o.payment_status || "").toLowerCase() !== "paid" ? ` • PENDING ₹${Math.max(0, Number((reportTotals[o.id] || o.total_amount || 0) - Number(o.paid_amount || 0))).toFixed(0)}` : " • PAID"}
            </option>

          ))}

        </select>

        <input
          type="date"
          value={reportDate}
          onChange={e =>
            setReportDate(
              e.target.value
            )
          }
          className="billing-input" style={input}
        />

        <input
          type="date"
          value={reportEndDate}
          onChange={e =>
            setReportEndDate(
              e.target.value
            )
          }
          className="billing-input" style={input}
        />

        <button
          type="button"
          onClick={() => { setReportDate(""); setReportEndDate("") }}
          style={reportDate || reportEndDate ? clearFilterBtn : activeFilterBtn}
        >
          📊 All
        </button>

        <button
          type="button"
          onClick={() => { setReportDate(today); setReportEndDate("") }}
          style={reportDate === today && !reportEndDate ? activeFilterBtn : clearFilterBtn}
        >
          📅 Today
        </button>

      </div>

      {/* SUMMARY */}

      <div style={summaryWrap} className="billing-summary-wrap">

        <div className="billing-summary-card" style={summaryCard}>

          <p
            style={{
              color:"var(--muted)"
            }}
          >
            Revenue
          </p>

          <h2>
            ₹{reportTotal.toFixed(0)}
          </h2>

        </div>

        <div className="billing-summary-card" style={summaryCard}>

          <p
            style={{
              color:"var(--muted)"
            }}
          >
            Orders
          </p>

          <h2>
            {filteredOrders.length}
          </h2>

        </div>

        <div className="billing-summary-card" style={summaryCard}>

          <p style={{ color:"var(--muted)" }}>Average Bill</p>

          <h2>₹{(reportTotal / (filteredOrders.length || 1)).toFixed(0)}</h2>

        </div>

        <div className="billing-summary-card" style={summaryCard}>
          <p style={{ color:"var(--muted)" }}>Paid Orders</p>
          <h2>{paidOrderCount}</h2>
          <small style={{ color:"var(--success)" }}>Collected ₹{collectedAmount.toFixed(0)}</small>
        </div>

        <div className="billing-summary-card" style={summaryCard}>
          <p style={{ color:"var(--muted)" }}>Pending Balance</p>
          <h2>₹{pendingAmount.toFixed(0)}</h2>
          <small style={{ color:"var(--warning)" }}>Outstanding</small>
        </div>

      </div>

      <div className="billing-payment-breakdown" style={{ display:"flex", flexWrap:"wrap", gap:10, marginBottom:18 }}>
        {Object.entries(paymentMethodTotals).map(([method, amount]) => (
          <div key={method} style={{ padding:"10px 14px", borderRadius:12, background:"var(--card)", border:"1px solid var(--border)" }}>
            <strong>{method.toUpperCase()}</strong> · ₹{Number(amount).toFixed(2)}
          </div>
        ))}
      </div>

      {pendingOrders.length > 0 && (
        <section className="billing-pending-panel" style={{
          marginBottom: 18, padding: 16, borderRadius: 18,
          border: "1px solid rgba(245,158,11,.45)",
          background: "linear-gradient(135deg,rgba(245,158,11,.10),var(--surface))"
        }}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <div>
              <strong style={{fontSize:17,color:"var(--warning)"}}>⚠ Unpaid / Partially Paid Bills</strong>
              <div style={{fontSize:12,color:"var(--muted)",marginTop:4}}>Click any bill to open it and collect payment. It stays highlighted until fully finalized.</div>
            </div>
            <strong style={{color:"var(--warning)"}}>₹{pendingAmount.toFixed(2)} outstanding</strong>
          </div>
          <div style={{display:"grid",gap:8,marginTop:12}}>
            {pendingOrders.map(o => (
              <button key={o.id} type="button" onClick={() => { setSelectedOrder(o.id); loadBill(o.id); setBillView(true) }} style={{
                display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:12,textAlign:"left",
                width:"100%",padding:"12px 14px",borderRadius:12,
                border:"1px solid rgba(245,158,11,.35)",background:"var(--surface-2)",color:"var(--text)",cursor:"pointer"
              }}>
                <span style={{minWidth:0}}>
                  <strong>{o.source_label || o.source_type || "Order"}</strong>
                  <span style={{display:"block",fontSize:12,color:"var(--muted)",marginTop:3}}>
                    #{String(o.id).slice(0,8)} • {o.customer_name || "Walk-in customer"} • {formatDate(o.created_at)}
                  </span>
                </span>
                <span style={{textAlign:"right",whiteSpace:"nowrap"}}>
                  <strong style={{color:"var(--warning)"}}>₹{o.billing_balance.toFixed(2)} due</strong>
                  <span style={{display:"block",fontSize:11,color:"var(--muted)"}}>Open & Pay →</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* CHARTS */}

      <div className="billing-chart-grid" style={chartGrid}>

        <div className="billing-chart-card" style={chartCard}>

          <h3>
            📈 Sales Analytics
          </h3>

          <SalesChart
            data={chartData}
          />

        </div>

        <div className="billing-chart-card" style={chartCard}>

          <h3>
            🏆 Top Selling Items
          </h3>

          <ItemChart
            data={filteredItemChartData}
          />

        </div>

      </div>

      {/* MAIN GRID */}

      <div className={`billing-main-grid${isBillScreen ? "" : " billing-report-only"}`} style={mainGrid}>

        {/* BILL */}

        <div
          id="billing-bill-section"
          className="billing-bill-section"
          style={{
            overflowX:"auto",
            scrollMarginTop: 20
          }}
        >

          {!selectedOrder ? (
            <div className="billing-empty-state">
              <div className="billing-empty-icon">🧾</div>
              <h2>Select an order to open billing</h2>
              <p>Choose a completed order from the selector above. You can then review items, apply offers, collect payment, print the invoice and download a PDF.</p>
            </div>
          ) : (
            <div
              id="bill-print"
              ref={invoiceRef}
              className="billing-invoice-card billing-bill-card" style={billCard}
            >

              {/* INVOICE HEADER */}

              <div style={invoiceHeader}>

                <div>

                  <h2>
                    {restaurant?.name}
                  </h2>

                  <p>
                    {restaurant?.address}
                  </p>
                  {restaurant?.phone ? <p>{restaurant.phone}</p> : null}
                  {restaurant?.gst_enabled && restaurant?.gst_number ? <p>GSTIN: {restaurant.gst_number}</p> : null}

                </div>

                <div
                  style={{
                    textAlign:"right"
                  }}
                >

                  <h3>
                    INVOICE
                  </h3>

                  <p>
                    #
                    {currentOrder?.invoice_no ||
                      selectedOrder}
                  </p>

                  <p>
                    {formatDate(
                      currentOrder?.created_at
                    )}
                  </p>

                </div>

              </div>

              {/* ITEMS */}

              <div className="billing-invoice-toolbar" data-html2canvas-ignore="true">
                <div>
                  <span className="billing-toolbar-label">Order</span>
                  <strong>#{String(selectedOrder).slice(0, 8)}</strong>
                </div>

                <select
                  value={selectedOrder}
                  onChange={e => loadBill(e.target.value)}
                  className="billing-input"
                  style={{ ...input, minWidth: 180 }}
                  aria-label="Select order for bill"
                >
                  {(showAllOrders ? orders : orders.slice(0, 5)).map(o => (
                    <option key={o.id} value={o.id}>
                      #{String(o.id).slice(0, 8)} | {formatDate(o.created_at)}
                    </option>
                  ))}
                </select>

                <button type="button" onClick={() => setEditMode(v => !v)} className="billing-edit-btn">
                  {editMode ? "✓ Done Editing" : "✏️ Edit Items"}
                </button>
              </div>

              <div className="billing-print-settings" data-html2canvas-ignore="true">
                <div>
                  <label className="billing-field-label">Print / Paper Size</label>
                  <select
                    value={printSize}
                    onChange={e => setPrintSize(e.target.value)}
                    className="billing-input"
                    style={{ ...input, color:"var(--surface)", background:"var(--text)", border:"1px solid var(--border)" }}
                  >
                    <option value="A4">A4 — 210 × 297 mm</option>
                    <option value="A5">A5 — 148 × 210 mm</option>
                    <option value="THERMAL_80">Thermal 80mm</option>
                    <option value="THERMAL_58">Thermal 58mm</option>
                    <option value="CUSTOM">Custom Size</option>
                  </select>
                </div>

                {printSize === "CUSTOM" && (
                  <>
                    <div>
                      <label className="billing-field-label">Width (mm)</label>
                      <input
                        type="number"
                        min="40"
                        value={customPrintWidth}
                        onChange={e => setCustomPrintWidth(e.target.value)}
                        className="billing-input"
                        style={{ ...input, color:"var(--surface)", background:"var(--text)", border:"1px solid var(--border)" }}
                      />
                    </div>
                    <div>
                      <label className="billing-field-label">Height (mm)</label>
                      <input
                        type="number"
                        min="60"
                        value={customPrintHeight}
                        onChange={e => setCustomPrintHeight(e.target.value)}
                        className="billing-input"
                        style={{ ...input, color:"var(--surface)", background:"var(--text)", border:"1px solid var(--border)" }}
                      />
                    </div>
                  </>
                )}
              </div>

              <table className="billing-invoice-table" style={table}>

                <thead>

                  <tr>

                    <th style={th}>
                      Item
                    </th>

                    <th style={th}>
                      Qty
                    </th>

                    <th style={th}>
                      Price
                    </th>

                    <th style={th}>
                      Total
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {items.map(
                    (i, idx) => {

                      const itemPrice =
                        Number(
                          i.menu_items?.price ||
                          0
                        )

                      const itemQty =
                        Number(
                          i.quantity ||
                          0
                        )

                      const lineTotal =
                        Number(i.line_total || (itemPrice * itemQty))

                      return (

                        <tr
                          key={
                            i.id ||
                            idx
                          }
                        >

                          <td style={td}>
                            <div>
                              {i.menu_items?.name || "Item"}
                              {i.modifiers?.length > 0 && (
                                <div style={{fontSize:11,color:"var(--muted)",marginTop:3}}>
                                  + {i.modifiers.map(m => `${m.modifier_name} ₹${Number(m.price || 0).toFixed(0)}`).join(" • ")}
                                </div>
                              )}
                            </div>
                          </td>

                          <td style={td}>

                            {editMode ? (

                              <input
                                type="number"
                                min="1"
                                value={
                                  i.quantity
                                }
                                onChange={
                                  e =>
                                    updateQty(
                                      idx,
                                      e.target.value
                                    )
                                }
                                style={{
                                  ...input,
                                  minWidth:80,
                                  color:"#111"
                                }}
                              />

                            ) : (

                              itemQty

                            )}

                          </td>

                          <td style={td}>

                            {editMode ? (

                              <input
                                type="number"
                                min="0"
                                value={
                                  i.menu_items?.price ||
                                  0
                                }
                                onChange={
                                  e =>
                                    updatePrice(
                                      idx,
                                      e.target.value
                                    )
                                }
                                style={{
                                  ...input,
                                  minWidth:100,
                                  color:"#111"
                                }}
                              />

                            ) : (

                              `₹${itemPrice.toFixed(2)}`

                            )}

                          </td>

                          <td style={td}>

                            ₹
                            {lineTotal.toFixed(2)}

                          </td>

                        </tr>

                      )
                    }
                  )}

                </tbody>

              </table>

              {/* CUSTOMER + APPLIED OFFER ON INVOICE */}
              {(customerName || customerPhone || selectedOffer) ? (
                <div
                  className="billing-invoice-meta"
                  style={{
                    marginTop:18,
                    padding:"12px 14px",
                    border:"1px solid #e5e7eb",
                    borderRadius:12,
                    background:"var(--surface-2)",
                    display:"grid",
                    gap:5,
                    fontSize:13
                  }}
                >
                  {(customerName || customerPhone) ? (
                    <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                      <span><strong>Customer:</strong> {customerName || "—"}</span>
                      {customerPhone ? <span><strong>Mobile:</strong> {customerPhone}</span> : null}
                      {customerEmail ? <span><strong>Email:</strong> {customerEmail}</span> : null}
                    </div>
                  ) : null}
                  {selectedOffer ? (
                    <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                      <span><strong>Offer:</strong> {selectedOffer.title || selectedOffer.name || "Offer"}</span>
                      <span><strong>Saved:</strong> -₹{Number(combinedDiscountAmount || 0).toFixed(2)}</span>
                {selectedLoyaltyReward ? (
                  <span><strong>Loyalty:</strong> {selectedLoyaltyReward.name} • -₹{loyaltyRewardDiscount.toFixed(2)}</span>
                ) : null}
                    </div>
                  ) : null}
                  {(loyaltyFeatureEnabled || loyaltyEnabled) && customerPhone ? (
                    <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                      <span><strong>Loyalty:</strong> +{Math.floor(Math.max(0, Number(total || 0)) / 100) * 10} points after successful payment</span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* TOTALS */}

              <div style={totalBox}>

                <p>
                  Subtotal:
                  {" "}
                  ₹
                  {subtotal.toFixed(2)}
                </p>

                {selectedOffer ? (
                  <p>
                    Offer: {selectedOffer.title || selectedOffer.name || "Offer"}
                  </p>
                ) : null}

                <p>
                  {manualDiscountValue > 0 ? "Manual Discount:" : "Offer Discount:"}
                  {" "}
                  -₹
                  {combinedDiscountAmount.toFixed(2)}
                </p>

                {restaurant?.gst_enabled && (

                  <p>
                    GST:
                    {" "}
                    ₹
                    {gst.toFixed(2)}
                  </p>

                )}

                {deliveryCharge > 0 && (
                  <p>
                    Delivery Charge:
                    {" "}
                    ₹
                    {deliveryCharge.toFixed(2)}
                  </p>
                )}

                <h2>
                  Total:
                  {" "}
                  ₹
                  {total.toFixed(2)}
                </h2>

              </div>

              {/* PAYMENT */}

              <div
                data-html2canvas-ignore="true"
                style={{
                  marginTop:20,
                  padding:18,
                  borderRadius:18,
                  background:"var(--surface-2)",
                  color:"var(--surface)",
                  display:"grid",
                  gap:12
                }}
              >

                <strong>Payment</strong>

                <div style={{display:"grid",gap:10,padding:12,border:"1px solid var(--border)",borderRadius:14,background:"var(--surface2)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                      <span><strong>Customer</strong><br/><small style={{color:"var(--muted)"}}>Phone match links the customer. Points are added automatically after successful payment.</small></span>
                      {customerProfile ? <span style={{fontSize:11,fontWeight:800,color:"var(--primary)"}}>{Number(customerProfile.loyalty_points || 0)} pts</span> : null}
                    </div>
                    <input
                      type="text"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      placeholder="Customer name"
                      style={{...input,color:"var(--surface)",background:"var(--text)",border:"1px solid var(--border)"}}
                    />
                    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8}}>
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={e => {
                          setCustomerPhone(e.target.value.replace(/[^0-9+ ]/g, "").slice(0,16))
                          setCustomerFound(false)
                        }}
                        onBlur={() => lookupCustomerByPhone(customerPhone)}
                        placeholder="Customer mobile number"
                        style={{...input,color:"var(--surface)",background:"var(--text)",border:"1px solid var(--border)",minWidth:0}}
                      />
                      <button
                        type="button"
                        onClick={() => lookupCustomerByPhone(customerPhone)}
                        disabled={customerLookupLoading}
                        style={{...btnBlue,marginTop:0,padding:"10px 14px",minWidth:90}}
                      >
                        {customerLookupLoading ? "Searching..." : "Find"}
                      </button>
                    </div>
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={e => setCustomerEmail(e.target.value)}
                      placeholder="Customer email (optional)"
                      style={{...input,color:"var(--surface)",background:"var(--text)",border:"1px solid var(--border)"}}
                    />
                    {customerLookup ? <small style={{color:"var(--muted)"}}>Checking customer…</small> : null}
                    {customerFound ? (
                      <small style={{color:"var(--success)",fontWeight:700}}>✓ Existing customer found — details loaded.</small>
                    ) : customerProfile ? (
                      <small style={{color:"var(--muted)"}}>Existing customer • {Number(customerProfile.total_orders || 0)} orders • ₹{Number(customerProfile.total_spend || 0).toFixed(2)} spent</small>
                    ) : (
                      <small style={{color:"var(--muted)"}}>New customer will be created when the bill is finalized.</small>
                    )}
                    <small style={{fontWeight:800,color:"var(--primary)"}}>Loyalty: ₹100 = 10 points.</small>
                    <small style={{fontWeight:800,color:"var(--text)"}}>This bill: +{Math.floor(Math.max(0, Number(total || 0)) / 100) * 10} points after successful payment.</small>
                  </div>

                <label className="billing-field-label">Offer / Discount</label>
                <select
                  value={selectedOffer?.id || ""}
                  onChange={e => {
                    const next = availableOffers.find(o => o.id === e.target.value) || null
                    setSelectedOffer(next)
                  }}
                  style={{ ...input, color:"var(--surface)", background:"var(--text)", border:"1px solid var(--border)" }}
                >
                  <option value="">No offer</option>
                  {availableOffers.map(offer => (
                    <option key={offer.id} value={offer.id}>
                      {offer.title || offer.name || "Offer"} — save ₹{Number(offer.calculated_discount || 0).toFixed(2)}
                    </option>
                  ))}
                </select>
                {selectedOffer ? (
                  <small style={{color:"var(--primary)",fontWeight:800}}>
                    ✓ Auto-applied: {selectedOffer.title || selectedOffer.name || "Offer"} — ₹{Number(selectedOffer.calculated_discount || discountAmount || 0).toFixed(2)} saved
                  </small>
                ) : null}
                {offerUnavailableNotice ? (
                  <small style={{display:"block",marginTop:6,color:"var(--warning)",fontWeight:800}}>
                    ⚠ {offerUnavailableNotice}
                  </small>
                ) : null}

                {customerProfile ? (
                  <div style={{display:"grid",gap:8,padding:12,border:"1px solid var(--border)",borderRadius:14,background:"var(--surface2)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                      <strong>⭐ Loyalty Reward</strong>
                      <span style={{fontSize:12,fontWeight:800,color:"var(--primary)"}}>
                        {Number(customerProfile.loyalty_points || 0)} pts available
                      </span>
                    </div>
                    <select
                      value={selectedLoyaltyReward?.id || ""}
                      onChange={e => {
                        const next = availableLoyaltyRewards.find(r => r.id === e.target.value) || null
                        setSelectedLoyaltyReward(next)
                      }}
                      style={{...input,color:"var(--surface)",background:"var(--text)",border:"1px solid var(--border)"}}
                    >
                      <option value="">No loyalty reward</option>
                      {availableLoyaltyRewards.map(reward => (
                        <option key={reward.id} value={reward.id}>
                          {reward.name} — {reward.points_cost} pts
                          {String(reward.reward_type).toLowerCase() === "percent"
                            ? ` • ${reward.reward_value}% OFF`
                            : String(reward.reward_type).toLowerCase() === "free_item"
                              ? " • Free item"
                              : ` • ₹${Number(reward.reward_value || 0).toFixed(2)} OFF`}
                        </option>
                      ))}
                    </select>
                    {selectedLoyaltyReward ? (
                      <small style={{color:"var(--success)",fontWeight:800}}>
                        ✓ {selectedLoyaltyReward.name} — ₹{loyaltyRewardDiscount.toFixed(2)} discount • {selectedLoyaltyReward.points_cost} points will be redeemed only after successful payment.
                      </small>
                    ) : (
                      <small style={{color:"var(--muted)"}}>
                        Select an eligible reward. Points are not deducted until the bill is successfully finalized.
                      </small>
                    )}
                  </div>
                ) : null}

                <div
                  style={{
                    display:"grid",
                    gridTemplateColumns:"minmax(0,1fr) minmax(120px,160px)",
                    gap:10,
                    alignItems:"end"
                  }}
                >
                  <label className="billing-field-label" style={{display:"grid",gap:6}}>
                    <span>Manual Discount</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={manualDiscount}
                      onChange={e => setManualDiscount(e.target.value)}
                      placeholder={manualDiscountMode === "percent" ? "0" : "₹0.00"}
                      style={{...input,color:"var(--surface)",background:"var(--text)",border:"1px solid var(--border)"}}
                    />
                  </label>
                  <select
                    value={manualDiscountMode}
                    onChange={e => setManualDiscountMode(e.target.value)}
                    style={{...input,color:"var(--surface)",background:"var(--text)",border:"1px solid var(--border)",minWidth:0}}
                    aria-label="Discount type"
                  >
                    <option value="amount">₹ Amount</option>
                    <option value="percent">% Percent</option>
                  </select>
                </div>

                <label className="billing-field-label">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={e =>
                    setPaymentMethod(
                      e.target.value
                    )
                  }
                  style={{
                    ...input,
                    color:"var(--surface)",
                    background:"var(--text)",
                    border:"1px solid var(--border)"
                  }}
                >

                  <option value="cash">
                    Cash
                  </option>

                  <option value="card">
                    Card
                  </option>

                  <option value="upi">
                    UPI
                  </option>

                  <option value="online">
                    Online
                  </option>

                </select>

                <input
                  type="number"
                  min="0"
                  value={Number(total || 0).toFixed(2)}
                  readOnly
                  aria-label="Paid amount"
                  style={{
                    ...input,
                    color:"var(--surface)",
                    background:"#f3f4f6",
                    border:"1px solid var(--border)",
                    cursor:"not-allowed"
                  }}
                />

                <input
                  type="text"
                  value={paymentReference}
                  onChange={e => setPaymentReference(e.target.value)}
                  placeholder="UTR / Transaction reference (optional)"
                  style={{
                    ...input,
                    color:"var(--surface)",
                    background:"var(--text)",
                    border:"1px solid var(--border)"
                  }}
                />

                <button
                  onClick={
                    finalizeBill
                  }
                  disabled={
                    finalizing ||
                    finalizeLockRef.current === selectedOrder ||
                    finalizedBill?.order_id === selectedOrder ||
                    String(currentOrder?.payment_status || "").toLowerCase() ===
                      "paid"
                  }
                  style={{
                    ...btnGreen,
                    marginTop:0,
                    opacity:
                      finalizing
                        ? .6
                        : 1
                  }}
                >

                  {finalizing

                    ? "Finalizing..."

                    : (
                        String(currentOrder?.payment_status || "").toLowerCase() === "paid" ||
                        finalizeLockRef.current === selectedOrder ||
                        finalizedBill?.order_id === selectedOrder
                      )
                      ? "Paid"
                      : "Finalize & Generate Invoice"}

                </button>

              </div>

              <div style={{ marginTop:16, padding:14, borderTop:"1px solid #e5e7eb", display:"grid", gap:6 }}>
                <strong>Payment Receipt</strong>
                <span>Method: {String(currentOrder?.payment_method || paymentMethod || "—").toUpperCase()}</span>
                <span>Collected: ₹{Number(currentOrder?.paid_amount || 0).toFixed(2)}</span>
                {paymentReference ? <span>UTR / Reference: {paymentReference}</span> : null}
              </div>

              <div className="print-powered-by">Powered by Anaira Graphics</div>

              <div className="billing-invoice-actions" data-html2canvas-ignore="true">
                <button
                  onClick={generateInvoicePdf}
                  className="billing-action" style={btnGreen}
                  type="button"
                  disabled={!finalizedBill && String(currentOrder?.payment_status || "").toLowerCase() !== "paid"}
                >
                  📄 Download Invoice PDF
                </button>

                <button
                  onClick={() => printContent("bill-print", printSize)}
                  className="billing-action" style={btnGreen}
                  type="button"
                  disabled={!finalizedBill && String(currentOrder?.payment_status || "").toLowerCase() !== "paid"}
                >
                  🖨 Print Invoice
                </button>

                <button
                  onClick={printThermalInvoice}
                  className="billing-action" style={btnGreen}
                  type="button"
                  disabled={!finalizedBill && String(currentOrder?.payment_status || "").toLowerCase() !== "paid"}
                >
                  🖨 Thermal 80mm
                </button>
              </div>

            </div>
          )}

        </div>

        {/* LEFT */}

        <div className="billing-left-panel" style={leftPanel}>

          {/* GST */}

          <div className="billing-card" style={card}>

            <h3
              style={{
                color:"var(--primary)",
                marginBottom:15
              }}
            >
              ⚙ GST Settings
            </h3>

            <div
              style={{
                color:"var(--text)",
                lineHeight:1.7
              }}
            >

              <label style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"10px 12px",border:"1px solid var(--border)",borderRadius:12,background:"var(--surface2)",cursor:"pointer"}}>
                <span><strong>GST on bill</strong><br/><small style={{color:"var(--muted)"}}>{restaurant?.gst_enabled ? "GST will be calculated and printed." : "Bill will be generated without GST."}</small></span>
                <input type="checkbox" checked={!!restaurant?.gst_enabled} disabled={gstSaving} onChange={e=>saveGstSetting({gst_enabled:e.target.checked})} style={{width:20,height:20,accentColor:"var(--primary)"}} />
              </label>

              <div>
                Rate:
                {" "}
                <strong>
                  {Number(
                    restaurant?.gst_rate ??
                    0
                  )}
                  %
                </strong>
              </div>

              <small
                style={{
                  color:"var(--muted)"
                }}
              >
                Billing uses the
                restaurant's
                server-side GST
                configuration.
              </small>

            </div>

          </div>

          {/* REPORT */}

          <div
            id="report-print"
            className="billing-report-print"
            style={{
              ...card,
              maxHeight:"560px",
              overflowY:"auto"
            }}
          >
            <div className="report-print-header" style={{marginBottom:18}}>
              <h3 style={{color:"var(--primary)",marginBottom:6}}>
                📊 Revenue Report
              </h3>
              <p style={{margin:0,color:"var(--muted)"}}>
                {reportDate || reportEndDate
                  ? `Period: ${reportDate || "Start"}${reportEndDate ? ` → ${reportEndDate}` : ""}`
                  : "All available orders"}
              </p>
              {restaurant?.name ? (
                <p style={{margin:"5px 0 0",fontWeight:800,color:"var(--text)"}}>
                  {restaurant.name}
                </p>
              ) : null}
            </div>

            <div
              className="report-summary-grid"
              style={{
                display:"grid",
                gridTemplateColumns:"repeat(6,minmax(0,1fr))",
                gap:8,
                marginBottom:10
              }}
            >
              {[
                ["Revenue", `₹${reportTotal.toFixed(2)}`],
                ["Orders", filteredOrders.length],
                ["Average Bill", `₹${(reportTotal / (filteredOrders.length || 1)).toFixed(2)}`],
                ["GST", `₹${reportGstTotal.toFixed(2)}`],
                ["Paid Orders", paidOrderCount],
                ["Pending", `₹${pendingAmount.toFixed(2)}`]
              ].map(([label,value]) => (
                <div key={label} className="report-summary-card" style={{
                  padding:"8px 10px",
                  border:"1px solid var(--border)",
                  borderRadius:10,
                  background:"var(--surface2)"
                }}>
                  <div style={{fontSize:10,color:"var(--muted)",fontWeight:700,whiteSpace:"nowrap"}}>{label}</div>
                  <div style={{fontSize:15,fontWeight:900,color:"var(--text)",marginTop:2,whiteSpace:"nowrap"}}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{
              display:"grid",
              gridTemplateColumns:"minmax(0,1fr) minmax(220px,300px)",
              gap:12,
              marginBottom:10
            }}>
              <div style={{minWidth:0}}>
                <h4 style={{margin:"0 0 5px",color:"var(--text)",fontSize:13}}>Order Details</h4>
                <div
                  className="report-table-wrap"
                  style={{
                    height:"150px",
                    maxHeight:"150px",
                    overflowY:"auto",
                    borderRadius:10,
                    border:"1px solid var(--border)"
                  }}
                >
                  <table className="billing-invoice-table" style={{...table,fontSize:12}}>
                    <thead>
                      <tr>
                        <th style={th}>Order</th>
                        <th style={th}>Date</th>
                        <th style={th}>Status</th>
                        <th style={th}>Amount</th>
                        <th style={th}>Collected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map(o => (
                        <tr key={o.id}>
                          <td style={td}>#{o.id.slice(0,5)}</td>
                          <td style={td}>{formatDate(o.created_at)}</td>
                          <td style={td}>{String(o.delivery_status || o.status || "pending").replaceAll("_"," ")}</td>
                          <td style={td}>₹{Number(reportTotals[o.id] || 0).toFixed(2)}</td>
                          <td style={td}>₹{Number(o.paid_amount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      {!filteredOrders.length ? (
                        <tr><td colSpan={5} style={{...td,textAlign:"center"}}>No orders for this period.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <h4 style={{margin:"10px 0 5px",color:"var(--text)",fontSize:13}}>Top Selling Items</h4>
                <div
                  className="report-table-wrap"
                  style={{
                    height:"150px",
                    maxHeight:"150px",
                    overflowY:"auto",
                    borderRadius:10,
                    border:"1px solid var(--border)"
                  }}
                >
                  <table className="billing-invoice-table" style={{...table,fontSize:12}}>
                    <thead>
                      <tr>
                        <th style={th}>Item</th>
                        <th style={th}>Sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItemChartData.map(item => (
                        <tr key={item.name}>
                          <td style={td}>{item.name}</td>
                          <td style={td}>₹{Number(item.total).toFixed(2)}</td>
                        </tr>
                      ))}
                      {!filteredItemChartData.length ? (
                        <tr><td colSpan={2} style={{...td,textAlign:"center"}}>No item sales.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{minWidth:0}}>
                <h4 style={{margin:"0 0 5px",color:"var(--text)",fontSize:13}}>Payment Breakdown</h4>
                <div
                  className="report-table-wrap"
                  style={{
                    height:"310px",
                    maxHeight:"310px",
                    overflowY:"auto",
                    borderRadius:10,
                    border:"1px solid var(--border)"
                  }}
                >
                  <table className="billing-invoice-table" style={{...table,fontSize:12}}>
                    <thead>
                      <tr>
                        <th style={th}>Method</th>
                        <th style={th}>Collected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(paymentMethodTotals).map(([method, amount]) => (
                        <tr key={method}>
                          <td style={td}>{method.toUpperCase()}</td>
                          <td style={td}>₹{Number(amount).toFixed(2)}</td>
                        </tr>
                      ))}
                      {!Object.keys(paymentMethodTotals).length ? (
                        <tr><td colSpan={2} style={{...td,textAlign:"center"}}>No payments recorded.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="report-total-box" style={{
              marginTop:8,
              padding:"10px 14px",
              borderRadius:12,
              background:"var(--surface2)",
              border:"1px solid var(--border)"
            }}>
              <div style={{display:"flex",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
                <strong>Total Revenue</strong>
                <strong style={{fontSize:18,color:"var(--primary)"}}>₹{reportTotal.toFixed(2)}</strong>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",gap:16,flexWrap:"wrap",marginTop:3,color:"var(--muted)",fontSize:12}}>
                <span>GST: ₹{reportGstTotal.toFixed(2)}</span>
                <span>Collected: ₹{collectedAmount.toFixed(2)}</span>
                <span>Outstanding: ₹{pendingAmount.toFixed(2)}</span>
              </div>
            </div>

            <div className="report-print-footer" style={{
              marginTop:8,
              paddingTop:7,
              borderTop:"1px solid var(--border)",
              textAlign:"center",
              fontSize:9,
              color:"var(--muted)"
            }}>
              Powered by Anaira Graphics
            </div>

            <div
              className="report-actions"
              style={{
                display:"flex",
                gap:8,
                marginTop:8,
                flexWrap:"wrap",
                alignItems:"center"
              }}
            >
              <button
                type="button"
                onClick={() => printContent("report-print", "A4")}
                className="billing-action"
                style={{...luxuryBtn, fontWeight:800}}
                title="Print the complete report using the browser print dialog"
              >
                🖨 Print Full Report
              </button>
                <button onClick={printThermalReport} className="billing-action" style={btnGreen} type="button">🖨 Thermal 80mm</button>
              <button
                type="button"
                onClick={() => generateReportPdf(true)}
                className="billing-action"
                style={{...luxuryBtn, fontWeight:800}}
                title="Generate the complete A4 report PDF and open its print dialog"
              >
                🖨 Print All Report (PDF)
              </button>
              <button
                type="button"
                onClick={generateReportPdf}
                className="billing-action"
                style={{...btnBlue, fontWeight:800}}
                title="Download the complete A4 report as a PDF"
              >
                📄 Download Full Report PDF
              </button>
              <span
                style={{
                  fontSize:12,
                  color:"var(--muted)",
                  fontWeight:700
                }}
              >
                Includes summary, orders, payments, daily revenue, item sales and GST.
              </span>
            </div>
          </div>

        </div>



      </div>

    </div>
    </>
  )
}

/* =========================================================
   UI
========================================================= */

const layout = {
  minHeight:"100vh",
  padding:30,
  background:
    "radial-gradient(circle at top,var(--surface-2),var(--background),#000)",
  color:"var(--text)"
}

const title = {
  fontSize:42,
  fontWeight:800,
  marginBottom:30,
  color:"var(--primary)",
  letterSpacing:1,
  textShadow:
    "0 0 25px rgba(var(--primary-rgb),.35)"
}

const topBar = {
  display:"flex",
  alignItems:"center",
  gap:15,
  marginBottom:30,
  flexWrap:"wrap",
  padding:20,
  borderRadius:24,

  background:
    "linear-gradient(145deg,var(--surface),var(--surface-2))",

  border:
    "1px solid rgba(var(--primary-rgb),.15)",

  boxShadow:
    "0 15px 35px rgba(0,0,0,.3)"
}

const mainGrid = {
  display:"grid",
  gridTemplateColumns:"minmax(0,1fr) minmax(280px,420px)",
  gap:20,
  alignItems:"start",
  width:"100%",
  minWidth:0
}

const leftPanel = {
  display:"flex",
  flexDirection:"column",
  gap:20,
  position:"sticky",
  top:20,
  height:"fit-content"
}

const card = {
  padding:24,
  borderRadius:24,

  background:
    "linear-gradient(145deg,var(--surface),var(--surface-2))",

  border:
    "1px solid rgba(var(--primary-rgb),.18)",

  boxShadow:
    "0 20px 40px rgba(0,0,0,.35)"
}

const billCard = {
  background:"var(--text)",
  color:"#111",
  padding:40,
  borderRadius:30,
  overflowX:"auto",

  boxShadow:
    "0 25px 60px rgba(0,0,0,.45)"
}

const invoiceHeader = {
  display:"flex",
  justifyContent:"space-between",
  marginBottom:10
}

const table = {
  width:"100%",
  borderCollapse:"collapse",
  tableLayout:"fixed",
  marginTop:20
}

const th = {
  borderBottom:"2px solid #ccc",
  padding:"10px",
  textAlign:"left"
}

const td = {
  padding:"10px",
  borderBottom:"1px solid #eee",
  wordBreak:"break-word"
}

const totalBox = {
  textAlign:"right",
  marginTop:15
}

const input = {
  padding:"14px 18px",
  borderRadius:16,

  border:
    "1px solid rgba(var(--primary-rgb),.25)",

  background:"var(--surface-2)",
  color:"var(--text)",
  minWidth:180,
  outline:"none"
}

const btnBlue = {
  padding:"14px 22px",
  borderRadius:16,

  border:
    "1px solid rgba(var(--info-rgb),.35)",

  background:
    "linear-gradient(135deg,var(--info),var(--info))",

  color:"var(--text)",
  fontWeight:700,
  cursor:"pointer",
  transition:"all .3s ease"
}

const btnGreen = {
  marginTop:15,
  width:"100%",
  padding:"16px",
  borderRadius:18,

  border:
    "1px solid rgba(var(--primary-rgb),.35)",

  background:
    "linear-gradient(135deg,var(--primary),var(--warning))",

  color:"#111",
  fontWeight:800,
  cursor:"pointer",
  transition:"all .3s ease"
}

const summaryWrap = {
  display:"grid",
  gridTemplateColumns:"repeat(5,minmax(0,1fr))",
  gap:15,
  marginBottom:20,
  width:"100%",
  minWidth:0
}

const summaryCard = {
  minWidth:0,
  width:"100%",
  padding:"22px 18px",
  borderRadius:22,
  textAlign:"center",
  overflow:"hidden",
  overflowWrap:"anywhere",
  wordBreak:"break-word",

  background:
    "linear-gradient(145deg,var(--surface),var(--surface-2))",

  border:
    "1px solid rgba(var(--primary-rgb),.18)",

  boxShadow:
    "0 20px 40px rgba(0,0,0,.35)"
}

const chartGrid = {
  display:"grid",
  gridTemplateColumns:"1fr 1fr",
  gap:20,
  marginBottom:30
}

const chartCard = {
  padding:25,
  borderRadius:28,

  background:
    "linear-gradient(145deg,var(--surface),var(--surface-2))",

  border:
    "1px solid rgba(var(--primary-rgb),.15)",

  boxShadow:
    "0 20px 40px rgba(0,0,0,.35)"
}

const clearFilterBtn = {
  padding:"12px 14px",
  borderRadius:14,
  border:"1px solid rgba(255,255,255,.10)",
  background:"rgba(255,255,255,.04)",
  color:"var(--border)",
  fontWeight:800,
  cursor:"pointer"
}

const activeFilterBtn = {
  ...clearFilterBtn,
  border:"1px solid rgba(var(--primary-rgb),.35)",
  background:"rgba(var(--primary-rgb),.12)",
  color:"var(--primary)"
}

const luxuryBtn = {
  marginTop:25,
  width:"100%",
  padding:"16px",
  borderRadius:18,

  border:
    "1px solid rgba(var(--primary-rgb),.4)",

  background:
    "rgba(var(--primary-rgb),.04)",

  color:"var(--primary)",
  fontWeight:800,
  letterSpacing:1,
  cursor:"pointer",

  backdropFilter:"blur(20px)",

  boxShadow:
    "0 10px 25px rgba(var(--primary-rgb),.12)",

  transition:"all .35s ease"
}