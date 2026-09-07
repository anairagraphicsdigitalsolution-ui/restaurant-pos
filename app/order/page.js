"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { connectBluetoothThermalPrinter, disconnectBluetoothThermalPrinter, disconnectNativeBluetoothThermalPrinter, getBluetoothThermalName, isBluetoothThermalConnected, isBluetoothThermalSupported, isNativeBluetoothPrinterAvailable, listNativeBluetoothPrinters, connectNativeBluetoothThermalPrinter, openNativeBluetoothSettings, makeEscPosReceipt, printBluetoothThermal, sendThermalPrint, connectLocalPrinter, listLocalPrinters, testLocalPrinter, getLocalBridgeStatus, startLocalPrintBridge, printLocalBridge } from "@/lib/thermalPrintClient"

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function OrderPage() {
  const router = useRouter()
  const params = useSearchParams()
  const route = useParams()
  const slug = route?.slug

  const [restaurantId, setRestaurantId] = useState(null)
  const [restaurantName, setRestaurantName] = useState("")
  const [restaurant, setRestaurant] = useState(null)
  const [menu, setMenu] = useState([])
  const [tables, setTables] = useState([])
  const [rooms, setRooms] = useState([])
  const [deliveryZones, setDeliveryZones] = useState([])
  const [offers, setOffers] = useState([])
  const [selectedOfferId, setSelectedOfferId] = useState("")
  const [printerName, setPrinterName] = useState("")
  const [printerConnecting, setPrinterConnecting] = useState(false)
  const [printerPrompt, setPrinterPrompt] = useState(null)
  const [localPrinters, setLocalPrinters] = useState([])
  const [localPrinterLoading, setLocalPrinterLoading] = useState(false)
  const [selectedLocalPort, setSelectedLocalPort] = useState("")
  const [modifierGroups, setModifierGroups] = useState([])
  const [modifiers, setModifiers] = useState([])
  const [modifierLinks, setModifierLinks] = useState([])
  const [operationsHubEnabled, setOperationsHubEnabled] = useState(false)

  const [type, setType] = useState("table")
  const [selected, setSelected] = useState(null)
  const [cart, setCart] = useState([])
  const [activeCategory, setActiveCategory] = useState("All")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [placing, setPlacing] = useState(false)
  const [screen, setScreen] = useState("order")
  const [currentOrder, setCurrentOrder] = useState(null)
  const [finalizedBill, setFinalizedBill] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [paymentReference, setPaymentReference] = useState("")
  const [discountMode, setDiscountMode] = useState("amount")
  const [discountValue, setDiscountValue] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [deliveryZone, setDeliveryZone] = useState("")
  const [deliveryCharge, setDeliveryCharge] = useState(0)
  const [customerNotes, setCustomerNotes] = useState("")
  const [orderNote, setOrderNote] = useState("")
  const [variantItem, setVariantItem] = useState(null)
  const [variantQuantities, setVariantQuantities] = useState({})
  const [modifierItem, setModifierItem] = useState(null)
  const [modifierItemQty, setModifierItemQty] = useState(1)
  const [modifierSelection, setModifierSelection] = useState({})
  const [variantBatch, setVariantBatch] = useState([])
  const [finalizing, setFinalizing] = useState(false)
  const [error, setError] = useState("")
  const [kitchenOrders, setKitchenOrders] = useState([])
  const [kitchenOpen, setKitchenOpen] = useState(true)
  const [kitchenLoading, setKitchenLoading] = useState(false)
  const [kitchenUpdating, setKitchenUpdating] = useState("")
  const [newKitchenOrder, setNewKitchenOrder] = useState(null)
  const kitchenInitialized = useRef(false)
  const kitchenSeen = useRef(new Set())
  const finalizeLock = useRef(false)

  useEffect(() => { init() }, [slug])

  useEffect(() => {
    const initialType = route?.type || params.get("type")
    const initialId = route?.id || params.get("id")
    if (!initialId || !["table", "room"].includes(initialType)) return
    const list = initialType === "table" ? tables : rooms
    const found = list.find(x => String(x.id) === String(initialId) || String(x.table_number ?? x.room_number) === String(initialId))
    if (found) { setType(initialType); setSelected(found) }
  }, [tables, rooms, route?.type, route?.id])

  async function init() {
    setLoading(true)
    setError("")
    try {
      let rid = params.get("rid")
      if (slug) {
        const { data, error: restError } = await supabaseCloud.from("restaurants").select("*").eq("slug", slug).maybeSingle()
        if (restError || !data) throw new Error(restError?.message || "Restaurant not found")
        rid = data.id
        setRestaurant(data)
        setRestaurantName(data.name || "")
      } else if (!rid) {
        const { data: auth, error: authError } = await supabaseCloud.auth.getUser()
        if (authError || !auth?.user) throw new Error("Please sign in first.")
        const { data: profile } = await supabaseCloud.from("profiles").select("restaurant_id").eq("id", auth.user.id).single()
        rid = profile?.restaurant_id
      }
      if (!rid) throw new Error("Restaurant profile not found")
      setRestaurantId(rid)
      await fetchAll(rid)
      const initialType = route?.type || params.get("type") || "table"
      const initialId = route?.id || params.get("id")
      if (["table", "room", "delivery", "takeaway"].includes(initialType)) setType(initialType)
    } catch (e) {
      console.error(e)
      setError(e.message || "Unable to load order screen")
    } finally { setLoading(false) }
  }

  async function fetchAll(rid) {
    const { data: rest } = await supabaseCloud.from("restaurants").select("*").eq("id", rid).maybeSingle()
    if (rest) { setRestaurant(rest); setRestaurantName(rest.name || "") }
    const { data: plugin } = await supabaseCloud.from("restaurant_plugins").select("enabled").eq("restaurant_id", rid).eq("plugin_code", "operations-hub").maybeSingle()
    const hubOn = plugin?.enabled === true
    setOperationsHubEnabled(hubOn)
    const empty = { data: [], error: null }
    const [menuResult, variantResult, tableResult, roomResult, zoneResult, offerResult, groupResult, modifierResult, linkResult] = await Promise.all([
      supabaseCloud.from("menu_items").select("*").eq("restaurant_id", rid).order("name"),
      supabaseCloud.from("menu_variants").select("id,menu_item_id,name,price_delta,active").eq("restaurant_id", rid).eq("active", true).order("created_at"),
      supabaseCloud.from("tables").select("*").eq("restaurant_id", rid).order("table_number"),
      supabaseCloud.from("rooms").select("*").eq("restaurant_id", rid).order("room_number"),
      supabaseCloud.from("delivery_zones").select("*").eq("restaurant_id", rid).eq("active", true).order("name"),
      supabaseCloud.from("offers").select("*").eq("restaurant_id", rid).eq("active", true).order("created_at", { ascending: false }),
      hubOn ? supabaseCloud.from("modifier_groups").select("*").eq("restaurant_id", rid).eq("active", true).order("created_at") : Promise.resolve(empty),
      hubOn ? supabaseCloud.from("modifiers").select("*").eq("restaurant_id", rid).eq("active", true).order("created_at") : Promise.resolve(empty),
      hubOn ? supabaseCloud.from("menu_item_modifier_groups").select("menu_item_id,modifier_group_id").eq("restaurant_id", rid) : Promise.resolve(empty),
    ])
    const variantMap = {}
    ;(variantResult.data || []).forEach(v => { (variantMap[v.menu_item_id] ||= []).push(v) })
    setMenu((menuResult.data || []).map(i => ({ ...i, variants: variantMap[i.id] || [] })))
    setTables(tableResult.data || [])
    setRooms(roomResult.data || [])
    setDeliveryZones(zoneResult.data || [])
    let loadedOffers = offerResult.data || []
    if (loadedOffers.length) {
      const ids = loadedOffers.map(o => o.id).filter(Boolean)
      const { data: offerProducts } = await supabaseCloud.from("offer_products").select("offer_id,menu_item_id,variant_id").in("offer_id", ids)
      const byOffer = {}
      ;(offerProducts || []).forEach(row => { (byOffer[row.offer_id] ||= []).push(row) })
      loadedOffers = loadedOffers.map(o => ({ ...o, offer_products: byOffer[o.id] || [] }))
    }
    setOffers(loadedOffers)
    setModifierGroups(groupResult.data || [])
    setModifiers(modifierResult.data || [])
    setModifierLinks(linkResult.data || [])
  }

  const categories = useMemo(() => ["All", ...new Set(menu.map(i => String(i.category || "Other").trim() || "Other"))], [menu])
  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return menu.filter(item => {
      const catOk = activeCategory === "All" || String(item.category || "Other").trim() === activeCategory
      const searchOk = !q || String(item.name || "").toLowerCase().includes(q)
      return catOk && searchOk
    })
  }, [menu, activeCategory, search])

  const subtotal = useMemo(() => cart.reduce((s, i) => s + (Number(i.price || 0) + Number(i.modifierTotal || 0)) * Number(i.qty || 0), 0), [cart])
  const manualDiscount = useMemo(() => {
    const v = Math.max(0, Number(discountValue || 0))
    return discountMode === "percent" ? Math.min(subtotal, Number((subtotal * Math.min(v, 100) / 100).toFixed(2))) : Math.min(subtotal, v)
  }, [subtotal, discountMode, discountValue])
  const eligibleOffers = useMemo(() => offers.filter(o => {
    if (o.active === false) return false
    const start = o.start_time ? new Date(o.start_time).getTime() : 0
    const end = o.end_time ? new Date(o.end_time).getTime() : Infinity
    if (start && Date.now() < start) return false
    if (end !== Infinity && Date.now() > end) return false
    return true
  }), [offers])
  const offerDiscounts = useMemo(() => eligibleOffers.map(o => {
    const target = String(o.target_type || "all").toLowerCase()
    const ids = new Set((o.offer_products || []).map(x => String(x.menu_item_id || x.item_id || "")))
    const eligible = cart.filter(i => String(i.item_type || "").toLowerCase() !== "combo").reduce((sum, i) => {
      const ok = target === "all" || (target === "products" && ids.has(String(i.id))) || (target === "category" && String(i.category || "") === String(o.target_category || ""))
      return ok ? sum + (Number(i.price || 0) + Number(i.modifierTotal || 0)) * Number(i.qty || 0) : sum
    }, 0)
    const value = Math.max(0, Number(o.discount || 0))
    let d = String(o.discount_type || "percent").toLowerCase() === "flat" ? Math.min(eligible, value) : Math.min(eligible, eligible * Math.min(value, 100) / 100)
    if (o.max_discount != null) d = Math.min(d, Number(o.max_discount || 0))
    return { ...o, calculated_discount: Number(d.toFixed(2)) }
  }).filter(o => o.calculated_discount > 0), [eligibleOffers, cart])
  const activeOffer = offerDiscounts.find(o => String(o.id) === String(selectedOfferId)) || offerDiscounts[0] || null
  const offerDiscount = Number(activeOffer?.calculated_discount || 0)
  const discount = Math.min(subtotal, Number((offerDiscount + manualDiscount).toFixed(2)))
  const gst = restaurant?.gst_enabled ? Number(((Math.max(0, subtotal - discount) * Number(restaurant?.gst_rate || 0)) / 100).toFixed(2)) : 0
  const total = Number((Math.max(0, subtotal - discount) + gst + Number(deliveryCharge || 0)).toFixed(2))
  const cartCount = cart.reduce((s, i) => s + Number(i.qty || 0), 0)

  function itemGroups(item) {
    if (!operationsHubEnabled || !item) return []
    const ids = modifierLinks.filter(x => String(x.menu_item_id) === String(item.id)).map(x => x.modifier_group_id)
    return modifierGroups.filter(g => ids.includes(g.id))
  }

  function addToCart(item) {
    const variants = (item.variants || []).filter(v => v.active !== false)
    if (item.item_type !== "combo" && variants.length) {
      const initial = {}
      variants.forEach(v => { initial[v.id] = 0 })
      setVariantItem(item); setVariantQuantities(initial); return
    }
    addToCartWithConfig(item)
  }

  function addToCartWithConfig(item) {
    const groups = itemGroups(item)
    if (groups.length) {
      const initial = {}
      groups.forEach(g => { initial[g.id] = [] })
      setModifierItem(item); setModifierItemQty(1); setModifierSelection(initial); return
    }
    addConfiguredItem(item, [], 1)
  }

  function addConfiguredItem(item, selectedModifiers = [], quantity = 1) {
    const modifierTotal = selectedModifiers.reduce((s, m) => s + Number(m.price || 0) * Number(m.quantity || 1), 0)
    const modifierKey = selectedModifiers.map(m => m.id).sort().join(",") || "base"
    const key = `${item.id}:${item.variant_id || "base"}:${modifierKey}`
    setCart(prev => {
      const existing = prev.find(x => x.cartKey === key)
      if (existing) return prev.map(x => x.cartKey === key ? { ...x, qty: Number(x.qty || 0) + Number(quantity || 1) } : x)
      return [...prev, { ...item, qty: Number(quantity || 1), cartKey: key, selectedModifiers, modifierTotal }]
    })
  }

  function continueVariants() {
    if (!variantItem) return
    const selectedVariants = (variantItem.variants || []).filter(v => Number(variantQuantities[v.id] || 0) > 0).map(v => ({
      ...variantItem,
      price: Number(variantItem.price || 0) + Number(v.price_delta || 0),
      variant_id: v.id,
      variant_name: v.name,
      variantQty: Number(variantQuantities[v.id] || 0),
    }))
    if (!selectedVariants.length) return alert("Select at least one variant quantity.")
    setVariantItem(null); setVariantQuantities({}); processVariantBatch(selectedVariants)
  }

  function processVariantBatch(queue) {
    const rest = queue.slice()
    while (rest.length) {
      const item = rest.shift()
      const groups = itemGroups(item)
      if (groups.length) {
        const initial = {}; groups.forEach(g => { initial[g.id] = [] })
        setVariantBatch(rest); setModifierItem(item); setModifierItemQty(item.variantQty || 1); setModifierSelection(initial); return
      }
      addConfiguredItem(item, [], item.variantQty || 1)
    }
    setVariantBatch([])
  }

  function toggleModifier(group, modifier) {
    setModifierSelection(prev => {
      const current = prev[group.id] || []
      if (group.selection_type === "single") return { ...prev, [group.id]: [modifier] }
      const exists = current.some(x => x.id === modifier.id)
      const max = group.max_select == null ? null : Number(group.max_select)
      if (!exists && max !== null && current.length >= max) return prev
      return { ...prev, [group.id]: exists ? current.filter(x => x.id !== modifier.id) : [...current, modifier] }
    })
  }

  function confirmModifiers() {
    if (!modifierItem) return
    for (const group of itemGroups(modifierItem)) {
      const chosen = modifierSelection[group.id] || []
      const min = Math.max(Number(group.min_select || 0), group.required ? 1 : 0)
      const max = group.max_select == null ? null : Number(group.max_select)
      if (chosen.length < min) return alert(`Choose at least ${min} option${min === 1 ? "" : "s"} from ${group.name}.`)
      if (max !== null && chosen.length > max) return alert(`Choose no more than ${max} option${max === 1 ? "" : "s"} from ${group.name}.`)
    }
    const chosen = Object.values(modifierSelection).flat()
    addConfiguredItem(modifierItem, chosen, modifierItemQty)
    const rest = variantBatch.slice()
    setModifierItem(null); setModifierSelection({}); setModifierItemQty(1); setVariantBatch([])
    if (rest.length) processVariantBatch(rest)
  }

  function updateQty(key, delta) {
    setCart(prev => prev.flatMap(i => i.cartKey !== key ? [i] : (Number(i.qty || 0) + delta <= 0 ? [] : [{ ...i, qty: Number(i.qty || 0) + delta }])))
  }
  function removeItem(key) { setCart(prev => prev.filter(i => i.cartKey !== key)) }

  function changeType(next) {
    setType(next); setSelected(null); setDeliveryCharge(0); setDeliveryZone("")
    if (next !== "delivery") { setCustomerName(""); setCustomerPhone(""); setDeliveryAddress(""); setCustomerNotes("") }
  }

  async function authToken() {
    const { data, error: sessionError } = await supabaseCloud.auth.getSession()
    if (sessionError || !data?.session?.access_token) throw new Error("Login session expired. Please login again.")
    return data.session.access_token
  }

  async function refreshKitchenOrders({ silent = false } = {}) {
    if (!restaurantId) return
    if (!silent) setKitchenLoading(true)
    try {
      const token = await authToken()
      const response = await fetch("/api/kitchen/orders", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to load kitchen orders")
      const live = (result.orders || []).filter(o => !["done", "completed", "complete", "cancelled", "canceled"].includes(String(o.status || "").toLowerCase()))
      setKitchenOrders(live)

      if (!kitchenInitialized.current) {
        ;(live || []).forEach(o => kitchenSeen.current.add(String(o.id)))
        kitchenInitialized.current = true
      } else {
        const fresh = live.find(o => !kitchenSeen.current.has(String(o.id)) && ["pending", "new", "received", "confirmed", "accepted", "queued"].includes(String(o.status || "pending").toLowerCase()))
        live.forEach(o => kitchenSeen.current.add(String(o.id)))
        if (fresh) setNewKitchenOrder(fresh)
      }
    } catch (e) {
      if (!silent) console.warn("KITCHEN ORDERS:", e)
    } finally {
      if (!silent) setKitchenLoading(false)
    }
  }

  useEffect(() => {
    if (!restaurantId) return
    refreshKitchenOrders()
    const timer = setInterval(() => refreshKitchenOrders({ silent: true }), 10000)
    return () => clearInterval(timer)
  }, [restaurantId])

  function kitchenItemToCart(item) {
    const menuItem = menu.find(m => String(m.id) === String(item.item_id)) || {}
    let selectedModifiers = item.selected_modifiers || item.modifiers || []
    if (typeof selectedModifiers === "string") {
      try { selectedModifiers = JSON.parse(selectedModifiers) } catch { selectedModifiers = [] }
    }
    if (!Array.isArray(selectedModifiers)) selectedModifiers = []
    const qty = Number(item.quantity || item.qty || 1)
    const unitPrice = Number(item.unit_price ?? item.price ?? menuItem.price ?? 0)
    const modifierTotal = selectedModifiers.reduce((sum, m) => sum + Number(m.price || 0) * Number(m.quantity || 1), 0)
    return {
      ...menuItem,
      id: item.item_id || menuItem.id,
      name: item.item_name || item.name || menuItem.name || "Item",
      image: menuItem.image || item.image || null,
      price: unitPrice,
      qty,
      variant_id: item.variant_id || null,
      variant_name: item.variant_name || null,
      selectedModifiers,
      modifierTotal,
      cartKey: `kitchen:${item.id || item.item_id}:${item.variant_id || "base"}:${selectedModifiers.map(m => m.id).sort().join(",") || "base"}`
    }
  }

  function openKitchenOrder(order) {
    const orderType = String(order.source_type || order.order_type || "takeaway").toLowerCase()
    setType(["table", "room", "delivery", "takeaway"].includes(orderType) ? orderType : "takeaway")
    const sourceId = order.source_id
    if (orderType === "table") setSelected(tables.find(t => String(t.id) === String(sourceId)) || null)
    else if (orderType === "room") setSelected(rooms.find(r => String(r.id) === String(sourceId)) || null)
    else setSelected(null)
    setCustomerName(order.customer_name || "")
    setCustomerPhone(order.customer_phone || "")
    setDeliveryAddress(order.delivery_address || "")
    setCustomerNotes(order.customer_notes || "")
    setDeliveryCharge(Number(order.delivery_charge || 0))
    setCurrentOrder(order)
    setFinalizedBill(null)
    setScreen("order")
    setCart((order.items || []).map(kitchenItemToCart))
    setNewKitchenOrder(null)
  }

  async function updateKitchenStatus(order, status) {
    if (!order?.id || kitchenUpdating) return
    setKitchenUpdating(`${order.id}:${status}`)
    try {
      const token = await authToken()
      const response = await fetch("/api/kitchen/order-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_id: order.id, status })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to update kitchen status")
      const updated = { ...order, ...(result.order || {}), status }
      setKitchenOrders(prev => status === "done" || status === "cancelled" ? prev.filter(o => o.id !== order.id) : prev.map(o => o.id === order.id ? updated : o))
      if (currentOrder?.id === order.id) setCurrentOrder(prev => ({ ...prev, ...updated, status }))
    } catch (e) {
      alert(e.message || "Kitchen status update failed")
    } finally {
      setKitchenUpdating("")
    }
  }

  async function connectWebBluetoothFromUserGesture() {
    setPrinterConnecting(true)
    try {
      if (!isBluetoothThermalSupported() || typeof navigator === "undefined" || !navigator.bluetooth) {
        throw new Error("Chrome Web Bluetooth is not available in this browser. Use the Anaira Windows bridge for MPT-III classic Bluetooth.")
      }
      const result = await connectBluetoothThermalPrinter()
      setPrinterName(result.name || getBluetoothThermalName())
      setPrinterPrompt(null)
      alert(`Bluetooth printer connected: ${result.name || "Bluetooth Thermal Printer"}`)
      return true
    } catch (e) {
      if (e?.name === "NotFoundError" || e?.name === "AbortError") return false
      alert(e?.message || "Bluetooth printer connection failed")
      return false
    } finally { setPrinterConnecting(false) }
  }

  async function refreshLocalPrinters() {
    if (typeof window === "undefined" || !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) return []
    setLocalPrinterLoading(true)
    try {
      const printers = await listLocalPrinters()
      setLocalPrinters(printers)
      if (!selectedLocalPort && printers[0]?.port) setSelectedLocalPort(printers[0].port)
      return printers
    } catch (e) {
      setLocalPrinters([])
      throw e
    } finally { setLocalPrinterLoading(false) }
  }

  async function openPrinterChooser() {
    const local = typeof window !== "undefined" && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
    setPrinterPrompt({
      title: "CONNECT PRINTER",
      message: local
        ? "MPT-III uses classic Bluetooth/COM on Windows. Select the MPT-III COM port below and connect it. The browser Bluetooth button is only for BLE ESC/POS printers."
        : "CONNECT BLUETOOTH opens the browser Bluetooth chooser for a supported BLE ESC/POS printer."
    })
    if (local) {
      try { await refreshLocalPrinters() } catch (e) {
        setPrinterPrompt(prev => ({ ...prev, message: `Windows print bridge: ${e?.message || "not running"}. Pair MPT-III in Windows Bluetooth and make sure a COM port exists.` }))
      }
    }
  }

  async function connectSelectedLocalPrinter() {
    setPrinterConnecting(true)
    try {
      const result = await connectLocalPrinter(selectedLocalPort || null)
      setPrinterName(result.printer || result.port || "MPT-III")
      setPrinterPrompt(null)
      alert(`MPT-III connected on ${result.port || result.printer || "COM port"}`)
      return true
    } catch (e) {
      setPrinterPrompt(prev => ({ ...(prev || {}), title: "MPT-III NOT CONNECTED", message: e?.message || "Unable to connect the selected Windows COM port." }))
      return false
    } finally { setPrinterConnecting(false) }
  }

  async function testSelectedLocalPrinter() {
    setPrinterConnecting(true)
    try {
      const result = await testLocalPrinter(selectedLocalPort || null)
      alert(`Test print sent to ${result.port || selectedLocalPort || "MPT-III"}.`)
    } catch (e) {
      alert(e?.message || "MPT-III test print failed")
    } finally { setPrinterConnecting(false) }
  }

  async function connectPrinter({ silent = false } = {}) {
    setPrinterConnecting(true)
    try {
      if (isNativeBluetoothPrinterAvailable()) {
        const paired = await listNativeBluetoothPrinters()
        if (!paired.length) {
          setPrinterPrompt({ title: "CONNECT PRINTER", message: "No paired Bluetooth printer was found. Pair your MPT-III / thermal printer first, then print again.", native: true })
          if (!silent && confirm("No paired Bluetooth printer found. Open Android Bluetooth settings to pair the printer now?")) await openNativeBluetoothSettings()
          return false
        }
        const preferred = paired.find(p => /MPT|MTP|thermal|printer|pos/i.test(p.name || "")) || paired[0]
        const result = await connectNativeBluetoothThermalPrinter(preferred.address)
        setPrinterName(result.name || preferred.name || "Bluetooth Thermal Printer")
        if (!silent) alert(`Printer connected: ${result.name || preferred.name}`)
        return true
      }

      // On Windows localhost, MPT-III classic Bluetooth is exposed as a COM port.
      // Prefer the local Anaira bridge over Chrome Web Bluetooth.
      if (typeof window !== "undefined" && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
        try {
          const result = await connectLocalPrinter()
          setPrinterName(result.printer || result.port || "MPT-III")
          if (!silent) alert(`Printer connected: ${result.printer || result.port || "MPT-III"}`)
          return true
        } catch (localError) {
          if (!silent) setPrinterPrompt({ title: "PRINTER NOT CONNECTED", message: `${localError?.message || "Windows local printer bridge could not connect to MPT-III."} You can also use CONNECT BLUETOOTH for a supported BLE ESC/POS printer.`, showBluetooth: true })
          return false
        }
      }

      if (!isBluetoothThermalSupported()) {
        setPrinterPrompt({ title: "CONNECT BLUETOOTH PRINTER", message: "Chrome Web Bluetooth needs a supported BLE ESC/POS printer and HTTPS. Classic MPT-III Bluetooth uses the Anaira Windows local bridge or Android app." })
        return false
      }
      const result = await connectBluetoothThermalPrinter()
      setPrinterName(result.name || getBluetoothThermalName())
      if (!silent) alert(`Printer connected: ${result.name || "Bluetooth Thermal Printer"}`)
      return true
    } catch (e) {
      if (e?.name === "NotFoundError" || e?.name === "AbortError") {
        if (!silent) setPrinterPrompt({ title: "PRINTER NOT CONNECTED", message: "Select your Bluetooth printer from the Chrome chooser to continue printing." })
        return false
      }
      if (!silent) setPrinterPrompt({ title: "PRINTER CONNECTION FAILED", message: e?.message || "Unable to connect printer." })
      return false
    } finally { setPrinterConnecting(false) }
  }

  async function printThermal(kind, order = currentOrder, bill = finalizedBill) {
    if (!order?.id) throw new Error("Create or select an order first.")
    const printItems = Array.isArray(order?.items) && order.items.length ? order.items.map(i => ({ ...i, name: i.name || i.item_name, qty: i.qty ?? i.quantity, price: i.price ?? i.unit_price })) : cart
    const lines = [`Order: ${String(order.id).slice(0, 8).toUpperCase()}`, `Type: ${sourceLabel}`, "--------------------------------"]
    printItems.forEach(i => {
      const qty = Number(i.qty || 0); const unit = Number(i.price || 0) + Number(i.modifierTotal || 0)
      lines.push(`${qty} x ${i.name || "Item"}`, `  ${money(unit)}    ${money(unit * qty)}`)
      if (i.variant_name) lines.push(`  Variant: ${i.variant_name}`)
      if (i.selectedModifiers?.length) lines.push(`  Add: ${i.selectedModifiers.map(m => m.name).join(", ")}`)
    })
    if (kind === "kot") {
      const bytes = makeEscPosReceipt({ title: `${restaurantName || "ANAIRA"} - KOT`, lines, footer: "KITCHEN COPY" })
      if (typeof window !== "undefined" && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
        try { return await printLocalBridge({ bytes, type: "kot", content: lines.join("\n"), data: { order_id: order.id, items: printItems } }) }
        catch (_) {}
      }
      if (!isBluetoothThermalConnected()) {
        const connected = await connectPrinter({ silent: true })
        if (!connected) {
          setPrinterPrompt({ title: "CONNECT PRINTER", message: "Printer is not connected. Connect the Windows MPT-III local printer or choose a supported BLE ESC/POS printer from the Bluetooth chooser, then print again.", showBluetooth: true })
          return { success: false, requiresConnection: true }
        }
      }
      if (isBluetoothThermalConnected()) return printBluetoothThermal(bytes)
      return sendThermalPrint({ type: "kot", content: lines.join("\n"), data: { order_id: order.id, items: printItems } })
    }
    lines.push("--------------------------------", `Subtotal: ${money(subtotal)}`)
    if (activeOffer) lines.push(`Offer ${activeOffer.title || activeOffer.name || "Discount"}: -${money(offerDiscount)}`)
    if (manualDiscount > 0) lines.push(`Manual Discount: -${money(manualDiscount)}`)
    lines.push(`GST: ${money(gst)}`)
    if (type === "delivery") lines.push(`Delivery: ${money(deliveryCharge)}`)
    lines.push(`TOTAL: ${money(bill?.total_amount ?? total)}`)
    if (bill?.invoice_no) lines.push(`Invoice: ${bill.invoice_no}`)
    lines.push(`Payment: ${bill?.payment_method || paymentMethod}`)
    const bytes = makeEscPosReceipt({ title: `${restaurantName || "ANAIRA"} - BILL`, lines, footer: bill?.payment_status === "paid" ? "PAID - THANK YOU" : "THANK YOU" })
    if (typeof window !== "undefined" && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
      try { return await printLocalBridge({ bytes, type: "receipt", content: lines.join("\n"), data: { order_id: order.id, bill, items: printItems, subtotal, discount, offer_discount: offerDiscount, manual_discount: manualDiscount, gst, delivery_charge: deliveryCharge, total } }) }
      catch (_) {}
    }
    if (!isBluetoothThermalConnected()) {
      const connected = await connectPrinter({ silent: true })
      if (!connected) throw new Error("Printer connection required. Open Connect Printer and pair/select the thermal printer.")
    }
    if (isBluetoothThermalConnected()) return printBluetoothThermal(bytes)
    return sendThermalPrint({ type: "receipt", content: lines.join("\n"), data: { order_id: order.id, bill, items: printItems, subtotal, discount, offer_discount: offerDiscount, manual_discount: manualDiscount, gst, delivery_charge: deliveryCharge, total } })
  }

  async function printKot(orderId = currentOrder?.id) {
    if (!orderId) return alert("Create or select an order first.")
    try {
      const order = currentOrder?.id === orderId ? currentOrder : kitchenOrders.find(o => String(o.id) === String(orderId))
      const result = await printThermal("kot", order || { id: orderId })
      if (result?.requiresConnection) return
      alert("KOT printed successfully.")
    } catch (e) { console.error("KOT PRINT:", e); alert(e.message || "KOT print failed") }
  }

  async function createOrder({ forBilling = false } = {}) {
    if (placing) return null
    if (!restaurantId) throw new Error("Restaurant missing")
    if (!cart.length) throw new Error("Cart is empty")
    if ((type === "table" || type === "room") && !selected) throw new Error(`Select a ${type}.`)
    if (type === "delivery" && (!customerName.trim() || !customerPhone.trim() || !deliveryAddress.trim())) throw new Error("Customer name, phone and delivery address are required.")
    const token = await authToken()
    setPlacing(true)
    try {
      const response = await fetch("/api/pos/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          source_type: type,
          source_id: selected?.id || null,
          subtotal,
          discount_amount: discount,
          tax_amount: gst,
          delivery_charge: type === "delivery" ? Number(deliveryCharge || 0) : 0,
          total_amount: total,
          payment_method: forBilling ? paymentMethod : null,
          customer_name: customerName.trim() || null,
          customer_phone: customerPhone.trim() || null,
          delivery_address: type === "delivery" ? deliveryAddress.trim() : null,
          customer_notes: customerNotes.trim() || orderNote.trim() || null,
          items: cart.map(i => ({
            item_id: i.id,
            quantity: Number(i.qty || 0),
            item_name: i.name,
            name: i.name,
            variant_id: i.variant_id || null,
            variant_name: i.variant_name || null,
            unit_price: Number(i.price || 0),
            line_total: (Number(i.price || 0) + Number(i.modifierTotal || 0)) * Number(i.qty || 0),
            cooking_request: i.cooking_request || null,
            selected_modifiers: Array.isArray(i.selectedModifiers) ? i.selectedModifiers : [],
          }))
        })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success || !result.order) throw new Error(result.error || "Order could not be created.")
      const order = result.order
      kitchenSeen.current.add(String(order.id))
      setTimeout(() => refreshKitchenOrders({ silent: true }), 0)

      if (type === "delivery") {
        try {
          const deliveryResponse = await fetch("/api/delivery", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              action: "create", order_id: order.id, order_mode: "delivery",
              customer_name: customerName.trim(), phone: customerPhone.trim(),
              address: deliveryAddress.trim(), zone: deliveryZone || null,
              delivery_charge: Number(deliveryCharge || 0), payment_method: paymentMethod,
              customer_notes: customerNotes.trim()
            })
          })
          const deliveryResult = await deliveryResponse.json().catch(() => ({}))
          if (!deliveryResponse.ok || !deliveryResult.success) console.warn("DELIVERY CREATE:", deliveryResult.error || "Unable to save delivery details")
        } catch (e) { console.warn("DELIVERY CREATE:", e) }
      }

      setCurrentOrder(order)
      setScreen(forBilling ? "bill" : "order")
      return { order, token }
    } finally { setPlacing(false) }
  }

  async function saveOrder() {
    try {
      const result = await createOrder({ forBilling: false })
      await printKot(result.order.id)
      alert("Order saved and KOT printed.")
    } catch (e) { alert(e.message) }
  }

  async function finalizeBill() {
    if (finalizing || finalizeLock.current) return
    if (!currentOrder?.id) return alert("Save/create the order first.")
    setFinalizing(true); finalizeLock.current = true
    try {
      const token = await authToken()
      // Kitchen is the source of truth: billing is finalized only after the
      // cashier explicitly marks this order Done from this same POS page.
      if (String(currentOrder.status || "").toLowerCase() !== "done") {
        throw new Error("Please PREPARE the order and then MARK DONE before finalizing the bill.")
      }
      const response = await fetch("/api/billing/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          order_id: currentOrder.id,
          idempotency_key: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `billing:${currentOrder.id}:${Date.now()}`,
          payment_method: paymentMethod,
          paid_amount: total,
          payment_reference: paymentReference.trim() || null,
          customer_name: customerName.trim() || null,
          customer_phone: customerPhone.trim() || null,
          discount_amount: discount,
          manual_discount_amount: discount,
          manual_discount_mode: discountMode,
          final_total: total,
        })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to finalize bill")
      setFinalizedBill(result.bill || { ...currentOrder, invoice_no: currentOrder.id.slice(0, 8).toUpperCase(), total_amount: total, payment_status: "paid", paid_amount: total })
      const completedBill = result.bill || { ...currentOrder, invoice_no: currentOrder.id.slice(0, 8).toUpperCase(), total_amount: total, payment_status: "paid", paid_amount: total }
      setCurrentOrder(prev => ({ ...prev, ...completedBill, status: "done", payment_status: completedBill.payment_status || "paid", paid_amount: Number(completedBill.paid_amount ?? total) }))
      try {
        const printResult = await printThermal("bill", { ...currentOrder, ...completedBill, items: cart }, completedBill)
        if (printResult?.requiresConnection) {
          alert(`Invoice ${completedBill.invoice_no || "generated"} finalized. Connect the printer from the popup, then print the bill.`)
          return
        }
      } catch (printError) {
        console.warn("AUTO BILL PRINT:", printError)
        alert(`Invoice ${completedBill.invoice_no || "generated"} finalized. Bill print needs attention: ${printError.message}`)
        return
      }
      alert(`Invoice ${completedBill.invoice_no || "generated"} finalized and printed.`)
    } catch (e) {
      console.error(e); alert(e.message || "Billing failed")
      finalizeLock.current = false
    } finally { setFinalizing(false) }
  }

  async function printBill() {
    if (!currentOrder && !finalizedBill) return
    try {
      const result = await printThermal("bill", currentOrder, finalizedBill)
      if (result?.requiresConnection) return
      alert("Bill printed successfully.")
    } catch (e) { console.error(e); alert(e.message || "Bill print failed") }
  }

  const sourceLabel = type === "table" ? (selected ? `Table ${selected.table_number}` : "Select Table") : type === "room" ? (selected ? `Room ${selected.room_number}` : "Select Room") : type === "delivery" ? "Delivery" : "Takeaway"

  if (loading) return <div className="pos-loading">Loading Anaira POS…</div>
  if (error) return <div className="pos-error"><strong>{error}</strong><button onClick={() => router.back()}>← Back</button></div>

  return (
    <div className="anaira-pos">
      <header className="pos-topbar">
        <button className="back-btn" onClick={() => router.back()}>← <span>Back</span></button>
        <div className="brand-block"><strong>{restaurantName || "Anaira POS"}</strong><span>{currentOrder?.invoice_no ? `Invoice ${currentOrder.invoice_no}` : currentOrder?.id ? `Order ${String(currentOrder.id).slice(0, 8).toUpperCase()}` : "New Order"}</span></div>
        <div className="top-actions"><button className="printer-btn" onClick={printerName ? async () => { await disconnectNativeBluetoothThermalPrinter(); disconnectBluetoothThermalPrinter(); setPrinterName("") } : openPrinterChooser} disabled={printerConnecting}>{printerConnecting ? "CONNECTING…" : printerName ? `🖨 ${printerName}` : "🖨 PRINTER"}</button><button onClick={() => { setCart([]); setCurrentOrder(null); setFinalizedBill(null); setScreen("order"); setDiscountValue("") }}>NEW ORDER</button><span className="live-pill">● POS ONLINE</span></div>
      </header>

      <div className="order-mode-bar">
        {[['table', 'TABLE'], ['room', 'ROOM'], ['delivery', 'DELIVERY'], ['takeaway', 'TAKEAWAY']].map(([key, label]) => <button key={key} className={type === key ? "mode active" : "mode"} onClick={() => { changeType(key); setScreen("order") }}>{label}</button>)}
        <button className={kitchenOpen ? "kitchen-toggle active" : "kitchen-toggle"} onClick={() => setKitchenOpen(v => !v)}>KITCHEN {kitchenOrders.length ? `(${kitchenOrders.length})` : ""}</button>
        {screen === "bill" && <span className="bill-mode-label">BILL / FINALIZE</span>}
      </div>

      {kitchenOpen && <section className="kitchen-strip">
        <div className="kitchen-strip-head"><div><small>KITCHEN / LIVE ORDERS</small><strong>{kitchenOrders.length ? `${kitchenOrders.length} active order${kitchenOrders.length === 1 ? "" : "s"}` : "No active kitchen orders"}</strong></div><button onClick={() => refreshKitchenOrders()} disabled={kitchenLoading}>{kitchenLoading ? "Refreshing…" : "↻ Refresh"}</button></div>
        <div className="kitchen-order-list">
          {kitchenOrders.map(order => {
            const status = String(order.status || "pending").toLowerCase()
            const isCurrent = currentOrder?.id === order.id
            return <div className={isCurrent ? "kitchen-card current" : "kitchen-card"} key={order.id}>
              <button className="kitchen-card-main" onClick={() => openKitchenOrder(order)}>
                <div className="kitchen-card-top"><strong>{order.display || order.source_label || "Order"}</strong><span className={`k-status ${status}`}>{status.toUpperCase()}</span></div>
                <div className="kitchen-card-items">{(order.items || []).slice(0, 3).map((i, idx) => <span key={idx}>{i.quantity || i.qty || 1}× {i.name || i.item_name}</span>)}{(order.items || []).length > 3 && <span>+{order.items.length - 3} more</span>}</div>
                <div className="kitchen-card-total">{money(order.total_amount)} {order.customer_name ? `• ${order.customer_name}` : ""}</div>
              </button>
              <div className="kitchen-actions">
                <button onClick={() => printKot(order.id)}>KOT</button>
                {status !== "preparing" && status !== "done" && <button onClick={() => updateKitchenStatus(order, "preparing")} disabled={kitchenUpdating}>{kitchenUpdating === `${order.id}:preparing` ? "…" : "PREPARE"}</button>}
                {status === "preparing" && <button className="done-btn" onClick={() => updateKitchenStatus(order, "done")} disabled={kitchenUpdating}>{kitchenUpdating === `${order.id}:done` ? "…" : "MARK DONE"}</button>}
              </div>
            </div>
          })}
        </div>
      </section>}


      <section className="pos-info-row">
        <div className="info-cell"><label>{type === "table" ? "Table No." : type === "room" ? "Room No." : "Order Type"}</label>
          {(type === "table" || type === "room") ? <select value={selected?.id || ""} onChange={e => setSelected((type === "table" ? tables : rooms).find(x => String(x.id) === e.target.value) || null)}><option value="">Select {type}</option>{(type === "table" ? tables : rooms).map(x => <option key={x.id} value={x.id}>{type === "table" ? `Table ${x.table_number}` : `Room ${x.room_number}`}</option>)}</select> : <strong>{type === "delivery" ? "Delivery Order" : "Takeaway Order"}</strong>}
        </div>
        <div className="info-cell"><label>Customer</label><input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder={type === "delivery" ? "Customer name *" : "Optional"} /></div>
        <div className="info-cell"><label>Mobile</label><input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Mobile number" inputMode="tel" /></div>
        {type === "delivery" ? <div className="info-cell wide"><label>Address</label><input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Delivery address *" /></div> : <div className="info-cell"><label>Waiter / Staff</label><input placeholder="Staff" /></div>}
      </section>

      <main className="pos-grid">
        <aside className="category-panel">
          <div className="panel-title">CATEGORIES</div>
          <button className={activeCategory === "All" ? "category active" : "category"} onClick={() => setActiveCategory("All")}>Popular <span>{menu.length}</span></button>
          {categories.filter(c => c !== "All").map(c => <button key={c} className={activeCategory === c ? "category active" : "category"} onClick={() => setActiveCategory(c)}>{c}<span>{menu.filter(i => String(i.category || "Other").trim() === c).length}</span></button>)}
        </aside>

        <section className="menu-panel">
          <div className="menu-toolbar"><div><small>MENU</small><h1>{activeCategory === "All" ? "Popular Items" : activeCategory}</h1></div><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item…" /></div>
          <div className="product-grid">
            {visibleItems.map(item => <button className="product-card" key={item.id} onClick={() => addToCart(item)}>
              <div className="product-photo">{item.image ? <img src={item.image} alt={item.name} loading="lazy" /> : <div className="photo-fallback">🍽️</div>}</div>
              <div className="product-meta"><strong>{item.name}</strong><span>{money(item.price)}</span></div>
              {(item.variants?.length || itemGroups(item).length) ? <small className="customizable">CUSTOMIZE</small> : null}
            </button>)}
            {!visibleItems.length && <div className="empty-menu">No products found.</div>}
          </div>
        </section>

        <aside className="cart-panel">
          <div className="cart-title"><div><small>ITEMS</small><h2>Current Order</h2>{currentOrder?.id && <span className={`cart-status ${String(currentOrder.status || "pending").toLowerCase()}`}>{String(currentOrder.status || "pending").toUpperCase()}</span>}</div><div className="cart-title-actions"><span>{cartCount}</span>{currentOrder?.id && String(currentOrder.status || "pending").toLowerCase() !== "done" && <>{String(currentOrder.status || "pending").toLowerCase() !== "preparing" && <button onClick={() => updateKitchenStatus(currentOrder, "preparing")} disabled={!!kitchenUpdating}>PREPARE</button>}<button className="done-mini" onClick={() => updateKitchenStatus(currentOrder, "done")} disabled={!!kitchenUpdating}>MARK DONE</button></>}</div></div>
          <div className="cart-list">
            {cart.map(item => <div className="cart-item" key={item.cartKey}>
              <div className="cart-thumb">{item.image ? <img src={item.image} alt="" /> : <span>🍽️</span>}</div>
              <div className="cart-info"><strong>{item.name}{item.variant_name ? ` • ${item.variant_name}` : ""}</strong>{item.selectedModifiers?.length ? <small>{item.selectedModifiers.map(m => m.name).join(", ")}</small> : null}<span>{money(Number(item.price || 0) + Number(item.modifierTotal || 0))}</span></div>
              <div className="qty"><button onClick={() => updateQty(item.cartKey, -1)}>−</button><b>{item.qty}</b><button onClick={() => updateQty(item.cartKey, 1)}>+</button></div>
              <button className="delete" onClick={() => removeItem(item.cartKey)}>×</button>
            </div>)}
            {!cart.length && <div className="empty-cart">Add products from the menu.<br /><span>Tap a product photo/card to add it.</span></div>}
          </div>

          {type === "delivery" && <div className="delivery-mini"><select value={deliveryZone} onChange={e => { const z = deliveryZones.find(x => x.name === e.target.value); setDeliveryZone(e.target.value); setDeliveryCharge(Number(z?.charge || 0)) }}><option value="">Delivery zone</option>{deliveryZones.map(z => <option key={z.id} value={z.name}>{z.name} — {money(z.charge)}</option>)}</select><span>Delivery {money(deliveryCharge)}</span></div>}

          {(offerDiscounts.length > 0 || manualDiscount > 0) && <div className="offer-box"><div className="offer-head"><span>OFFERS & DISCOUNTS</span><b>{activeOffer ? `-${money(offerDiscount)}` : ""}</b></div>{offerDiscounts.length > 0 && <select value={activeOffer?.id || ""} onChange={e => setSelectedOfferId(e.target.value)}><option value="">Select offer</option>{offerDiscounts.map(o => <option key={o.id} value={o.id}>{o.title || o.name || "Offer"} • -{money(o.calculated_discount)}</option>)}</select>}<div className="offer-chips">{activeOffer && <span>🏷 {activeOffer.title || activeOffer.name || "Offer"} -{money(offerDiscount)}</span>}{manualDiscount > 0 && <span>Manual -{money(manualDiscount)}</span>}</div></div>}

          <div className="bill-summary">
            <div><span>Subtotal</span><b>{money(subtotal)}</b></div>
            <div className="discount-line"><span>Discount</span><div><button className={discountMode === "amount" ? "mini active" : "mini"} onClick={() => setDiscountMode("amount")}>₹</button><button className={discountMode === "percent" ? "mini active" : "mini"} onClick={() => setDiscountMode("percent")}>%</button><input value={discountValue} onChange={e => setDiscountValue(e.target.value)} placeholder="0" /></div><b>-{money(discount)}</b></div>
            <div><span>Tax {restaurant?.gst_enabled ? `(${restaurant?.gst_rate || 0}%)` : ""}</span><b>{money(gst)}</b></div>
            {type === "delivery" && <div><span>Delivery</span><b>{money(deliveryCharge)}</b></div>}
            <div className="grand"><span>Total</span><b>{money(total)}</b></div>
          </div>

          {screen === "bill" && <div className="inline-bill-box">
            <div className="inline-bill-head"><div><small>PAYMENT</small><strong>Finalize Bill</strong></div><span>{sourceLabel}</span></div>
            <div className="payment-row">
              <label>Method<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="online">Online</option></select></label>
              <label>Reference<input value={paymentReference} onChange={e => setPaymentReference(e.target.value)} placeholder="Optional" /></label>
            </div>
            <div className="payable-row"><span>PAYABLE</span><strong>{money(finalizedBill?.total_amount ?? total)}</strong></div>
            {finalizedBill && <div className="paid-banner">✓ Paid • {finalizedBill.invoice_no || "Invoice generated"}</div>}
            <button className="print-bill-btn" onClick={printBill} disabled={!finalizedBill}>PRINT BILL</button>
          </div>}

          <div className="pos-buttons">
            {screen === "order" ? <>
              <button className="save" onClick={saveOrder} disabled={placing || !cart.length}>{placing ? "Saving…" : "SAVE / KOT"}</button>
              <button className="kot-action" onClick={() => printKot()} disabled={!currentOrder?.id}>PRINT KOT</button>
              <button className="finalize" onClick={async () => { try { if (!currentOrder) await createOrder({ forBilling: false }); setScreen("bill") } catch (e) { alert(e.message) } }} disabled={placing || !cart.length}>FINALIZE BILL</button>
            </> : <>
              <button className="save" onClick={() => setScreen("order")}>← EDIT ORDER</button>
              <button className="kot-action" onClick={() => printKot()} disabled={!currentOrder?.id}>PRINT KOT</button>
              <button className="finalize" onClick={finalizeBill} disabled={finalizing || !!finalizedBill}>{finalizedBill ? "✓ FINALIZED" : finalizing ? "FINALIZING…" : "FINALIZE & PAY"}</button>
            </>}
          </div>
        </aside>
      </main>

      {printerPrompt && <div className="modal-backdrop" onClick={() => setPrinterPrompt(null)}><div className="modal printer-prompt" onClick={e => e.stopPropagation()}><div className="modal-head"><div><small>THERMAL PRINTING</small><h2>{printerPrompt.title}</h2></div><button onClick={() => setPrinterPrompt(null)}>×</button></div><p className="printer-prompt-text">{printerPrompt.message}</p>{typeof window !== "undefined" && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) && <div className="local-printer-box"><div className="local-printer-head"><strong>WINDOWS MPT-III / COM</strong><button className="mini" onClick={refreshLocalPrinters} disabled={localPrinterLoading}>{localPrinterLoading ? "…" : "↻"}</button></div>{localPrinters.length ? <><select value={selectedLocalPort} onChange={e => setSelectedLocalPort(e.target.value)}>{localPrinters.map(p => <option key={p.port} value={p.port}>{p.port} — {p.name || p.description || "Serial/Bluetooth"}</option>)}</select><small>Pair MPT-III in Windows Bluetooth. The correct entry normally appears under Device Manager → Ports (COM & LPT) as a Bluetooth/Serial COM port.</small><div className="local-printer-actions"><button className="save" onClick={connectSelectedLocalPrinter} disabled={printerConnecting}>{printerConnecting ? "CONNECTING…" : "CONNECT SELECTED COM"}</button><button className="kot-action" onClick={testSelectedLocalPrinter} disabled={printerConnecting}>TEST PRINT</button></div></> : <><div className="local-empty">No COM printer port detected.</div><small>Open Windows Bluetooth settings and pair MPT-III. Then check Device Manager → Ports (COM & LPT). If no COM port appears, Windows has not exposed the classic Bluetooth serial service yet.</small></>}</div>}{<div className="printer-prompt-actions"><button className="save" onClick={connectWebBluetoothFromUserGesture} disabled={printerConnecting}>{printerConnecting ? "CONNECTING…" : "CONNECT BLUETOOTH (BLE)"}</button>{printerPrompt.native && <button className="kot-action" onClick={async () => { try { await openNativeBluetoothSettings() } catch (e) { alert(e.message) } }}>OPEN BLUETOOTH SETTINGS</button>}<button className="finalize" onClick={() => setPrinterPrompt(null)}>CLOSE</button></div>}</div></div>}

      {newKitchenOrder && <div className="modal-backdrop kitchen-alert-backdrop" onClick={() => setNewKitchenOrder(null)}><div className="modal kitchen-alert" onClick={e => e.stopPropagation()}><div className="modal-head"><div><small>NEW KITCHEN ORDER</small><h2>{newKitchenOrder.display || "New Order"}</h2></div><button onClick={() => setNewKitchenOrder(null)}>×</button></div><div className="new-order-summary">{(newKitchenOrder.items || []).map((i, idx) => <div key={idx}><span>{i.quantity || i.qty || 1}× {i.name || i.item_name}</span><b>{money(i.line_total ?? ((i.quantity || i.qty || 1) * Number(i.unit_price || 0)))}</b></div>)}</div><div className="new-order-actions"><button className="save" onClick={() => { openKitchenOrder(newKitchenOrder); updateKitchenStatus(newKitchenOrder, "preparing") }}>PREPARE</button><button className="done-popup" onClick={() => { openKitchenOrder(newKitchenOrder); updateKitchenStatus(newKitchenOrder, "done") }}>MARK DONE</button><button className="finalize" onClick={() => openKitchenOrder(newKitchenOrder)}>OPEN ORDER</button></div></div></div>}

      {variantItem && <div className="modal-backdrop" onClick={() => { setVariantItem(null); setVariantQuantities({}) }}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div><small>SELECT VARIANT</small><h2>{variantItem.name}</h2></div><button onClick={() => { setVariantItem(null); setVariantQuantities({}) }}>×</button></div>{variantItem.variants.map(v => <div className="variant-row" key={v.id}><span>{v.name}<small>{money(Number(variantItem.price || 0) + Number(v.price_delta || 0))}</small></span><div><button onClick={() => setVariantQuantities(p => ({ ...p, [v.id]: Math.max(0, Number(p[v.id] || 0) - 1) }))}>−</button><b>{variantQuantities[v.id] || 0}</b><button onClick={() => setVariantQuantities(p => ({ ...p, [v.id]: Number(p[v.id] || 0) + 1 }))}>+</button></div></div>)}<button className="modal-primary" onClick={continueVariants}>CONTINUE</button></div></div>}

      {modifierItem && <div className="modal-backdrop" onClick={() => setModifierItem(null)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div><small>CUSTOMIZE ITEM</small><h2>{modifierItem.name}</h2></div><button onClick={() => setModifierItem(null)}>×</button></div>{itemGroups(modifierItem).map(group => <div key={group.id} className="modifier-group"><div><b>{group.name}</b><small>{group.required ? "Required" : "Optional"}</small></div>{modifiers.filter(m => m.group_id === group.id).map(mod => { const chosen = (modifierSelection[group.id] || []).some(x => x.id === mod.id); return <button className={chosen ? "modifier active" : "modifier"} key={mod.id} onClick={() => toggleModifier(group, mod)}><span>{chosen ? "✓" : "○"} {mod.name}</span><b>+{money(mod.price)}</b></button> })}</div>)}<button className="modal-primary" onClick={confirmModifiers}>ADD TO ORDER</button></div></div>}

      <style jsx global>{`
        *{box-sizing:border-box}
        .anaira-pos{min-height:100vh;background:var(--background);color:var(--text);font-family:Inter,Arial,sans-serif}
        .pos-topbar{height:58px;background:var(--surface);border-bottom:1px solid rgba(var(--primary-rgb),.16);display:flex;align-items:center;gap:16px;padding:0 18px;position:sticky;top:0;z-index:20;box-shadow:0 4px 20px rgba(0,0,0,.18)}
        .back-btn{border:1px solid rgba(var(--primary-rgb),.25);background:rgba(var(--primary-rgb),.07);font-weight:800;color:var(--text);font-size:13px;cursor:pointer;border-radius:10px;padding:8px 12px}.back-btn:hover{background:rgba(var(--primary-rgb),.15)}
        .brand-block{display:flex;align-items:baseline;gap:12px;min-width:0}.brand-block strong{font-size:17px;color:var(--primary)}.brand-block span{font-size:11px;color:rgba(255,255,255,.62)}
        .top-actions{margin-left:auto;display:flex;align-items:center;gap:10px}.top-actions button{border:1px solid rgba(var(--primary-rgb),.35);background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 60%,var(--accent)));color:#111827;border-radius:9px;padding:8px 12px;font-size:10px;font-weight:900;cursor:pointer}.live-pill{font-size:9px;color:var(--accent);font-weight:900}
        .order-mode-bar{height:48px;background:var(--surface-2);border-bottom:1px solid rgba(var(--primary-rgb),.14);display:flex;padding-left:18px;align-items:stretch;gap:3px}.mode{border:0;background:transparent;color:rgba(255,255,255,.62);padding:0 24px;font-size:11px;font-weight:900;cursor:pointer;border-bottom:3px solid transparent}.mode:hover{color:var(--text);background:rgba(var(--primary-rgb),.05)}.mode.active{color:#111827;background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 65%,var(--accent)));border-bottom-color:var(--primary)}.bill-mode-label{margin-left:auto;align-self:center;margin-right:18px;font-size:9px;font-weight:900;color:var(--primary)}
        .kitchen-strip{background:var(--surface);border-bottom:1px solid rgba(var(--primary-rgb),.15);padding:8px 14px}.kitchen-strip-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}.kitchen-strip-head>div{display:flex;flex-direction:column;gap:2px}.kitchen-strip-head small{font-size:7px;font-weight:900;color:rgba(255,255,255,.42);letter-spacing:1px}.kitchen-strip-head strong{font-size:10px;color:var(--text)}.kitchen-strip-head button{border:1px solid rgba(var(--primary-rgb),.2);background:rgba(var(--primary-rgb),.06);color:var(--primary);border-radius:6px;padding:6px 9px;font-size:8px;font-weight:900;cursor:pointer}.kitchen-order-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:7px;max-height:180px;overflow:auto}.kitchen-card{border:1px solid rgba(var(--primary-rgb),.14);background:var(--surface-2);border-radius:8px;padding:7px;display:flex;gap:7px;align-items:stretch}.kitchen-card.current{border-color:var(--primary);box-shadow:0 0 0 1px rgba(var(--primary-rgb),.12)}.kitchen-card-main{flex:1;min-width:0;border:0;background:transparent;color:var(--text);text-align:left;padding:0;cursor:pointer}.kitchen-card-top{display:flex;justify-content:space-between;gap:5px;align-items:center}.kitchen-card-top strong{font-size:10px}.k-status{font-size:6px;font-weight:900;padding:3px 5px;border-radius:4px;background:rgba(var(--primary-rgb),.10);color:var(--primary)}.k-status.preparing{color:#fbbf24;background:rgba(251,191,36,.10)}.k-status.done{color:#4ade80}.kitchen-card-items{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}.kitchen-card-items span{font-size:7px;color:rgba(255,255,255,.55)}.kitchen-card-total{margin-top:5px;font-size:8px;font-weight:900;color:var(--primary)}.kitchen-actions{display:flex;flex-direction:column;gap:4px;justify-content:center}.kitchen-actions button{border:1px solid rgba(var(--primary-rgb),.18);background:rgba(var(--primary-rgb),.06);color:var(--text);border-radius:5px;padding:5px 7px;font-size:7px;font-weight:900;cursor:pointer}.kitchen-actions button:hover{border-color:var(--primary)}.kitchen-actions .done-btn{background:rgba(74,222,128,.10);border-color:rgba(74,222,128,.25);color:#4ade80}.kitchen-toggle{border:1px solid rgba(var(--primary-rgb),.18)!important;background:rgba(var(--primary-rgb),.05)!important;color:rgba(255,255,255,.65)!important;margin-left:8px!important;padding:0 14px!important;font-size:9px!important}.kitchen-toggle.active{color:var(--primary)!important;border-color:rgba(var(--primary-rgb),.35)!important;background:rgba(var(--primary-rgb),.10)!important}.new-order-summary{border:1px solid rgba(var(--primary-rgb),.14);border-radius:8px;padding:8px;background:var(--surface-2)}.new-order-summary>div{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:10px}.new-order-summary>div:last-child{border-bottom:0}.new-order-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}.new-order-actions .done-popup{background:rgba(74,222,128,.10);color:#4ade80;border:1px solid rgba(74,222,128,.25)}.new-order-actions button{border-radius:7px;padding:10px;border:0;font-size:9px;font-weight:900;cursor:pointer}.kitchen-alert{width:min(430px,100%)}
.pos-info-row{display:grid;grid-template-columns:190px 1fr 180px 1.5fr;gap:8px;padding:9px 14px;background:var(--background);border-bottom:1px solid rgba(var(--primary-rgb),.12)}.info-cell{background:var(--surface);border:1px solid rgba(var(--primary-rgb),.14);border-radius:9px;padding:6px 9px;display:flex;align-items:center;gap:8px;min-width:0;box-shadow:0 3px 14px rgba(0,0,0,.12)}.info-cell label{font-size:8px;color:rgba(255,255,255,.52);font-weight:800;white-space:nowrap}.info-cell input,.info-cell select{border:0;outline:0;width:100%;font-size:11px;background:transparent;color:var(--text);min-width:0}.info-cell select option{background:var(--surface);color:var(--text)}.info-cell strong{font-size:11px;color:var(--primary)}
        .pos-grid{display:grid;grid-template-columns:175px minmax(0,1fr) 365px;min-height:calc(100vh - 114px);gap:0}.category-panel{background:var(--surface);border-right:1px solid rgba(var(--primary-rgb),.14);padding:12px 8px;overflow:auto}.panel-title{font-size:9px;font-weight:900;color:rgba(255,255,255,.48);padding:5px 8px 10px;letter-spacing:1px}.category{width:100%;border:1px solid transparent;background:transparent;text-align:left;padding:11px 10px;border-radius:9px;display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:800;color:rgba(255,255,255,.78);cursor:pointer;margin-bottom:3px}.category span{font-size:8px;background:rgba(var(--primary-rgb),.10);border-radius:10px;padding:3px 6px;color:rgba(255,255,255,.55)}.category:hover{background:rgba(var(--primary-rgb),.07);border-color:rgba(var(--primary-rgb),.12)}.category.active{background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 62%,var(--accent)));color:#111827;border-color:var(--primary);box-shadow:0 4px 16px rgba(var(--primary-rgb),.18)}.category.active span{background:rgba(0,0,0,.12);color:#111827}
        .menu-panel{padding:14px;background:var(--background);min-width:0;overflow:auto}.menu-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:11px}.menu-toolbar small,.cart-title small,.modal-head small,.inline-bill-head small{font-size:8px;font-weight:900;color:rgba(255,255,255,.45);letter-spacing:1px}.menu-toolbar h1,.cart-title h2{margin:2px 0 0;font-size:17px;color:var(--text)}.menu-toolbar input{width:250px;border:1px solid rgba(var(--primary-rgb),.16);background:var(--surface);color:var(--text);border-radius:9px;padding:10px 11px;outline:0;font-size:11px}.menu-toolbar input:focus{border-color:rgba(var(--primary-rgb),.55);box-shadow:0 0 0 3px rgba(var(--primary-rgb),.07)}
        .product-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.product-card{position:relative;border:1px solid rgba(var(--primary-rgb),.13);background:var(--surface);color:var(--text);border-radius:11px;padding:6px;text-align:left;cursor:pointer;box-shadow:0 5px 16px rgba(0,0,0,.16);transition:.15s;min-width:0}.product-card:hover{transform:translateY(-2px);border-color:rgba(var(--primary-rgb),.55);box-shadow:0 8px 22px rgba(var(--primary-rgb),.10)}.product-photo{width:100%;aspect-ratio:1/.78;border-radius:8px;overflow:hidden;background:linear-gradient(145deg,var(--surface-2),var(--surface));border:1px solid rgba(var(--primary-rgb),.10)}.product-photo img{width:100%;height:100%;object-fit:cover;display:block}.photo-fallback{height:100%;display:grid;place-items:center;font-size:28px;color:var(--primary)}.product-meta{padding:7px 3px 3px;display:flex;flex-direction:column;gap:3px}.product-meta strong{font-size:11px;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.product-meta span{font-size:11px;font-weight:900;color:var(--primary)}.customizable{position:absolute;right:8px;top:8px;background:var(--surface);border:1px solid rgba(var(--primary-rgb),.35);border-radius:5px;padding:3px 5px;font-size:6px;font-weight:900;color:var(--primary);box-shadow:0 2px 8px rgba(0,0,0,.25)}.empty-menu,.empty-cart{padding:50px 10px;text-align:center;color:rgba(255,255,255,.42);font-size:11px}.empty-cart span{font-size:9px}
        .cart-panel{background:var(--surface);border-left:1px solid rgba(var(--primary-rgb),.16);display:flex;flex-direction:column;min-width:0}.cart-title{padding:10px 12px;border-bottom:1px solid rgba(var(--primary-rgb),.13);display:flex;justify-content:space-between;align-items:center}.cart-status{display:block!important;margin-top:3px;font-size:7px!important;color:var(--primary)!important;font-weight:900!important;letter-spacing:.6px}.cart-status.preparing{color:#fbbf24!important}.cart-status.done{color:#4ade80!important}.cart-title-actions{display:flex;align-items:center;gap:5px}.cart-title-actions>span{background:rgba(var(--primary-rgb),.12);color:var(--primary);border:1px solid rgba(var(--primary-rgb),.18);border-radius:12px;padding:4px 7px;font-size:9px;font-weight:900}.cart-title-actions button{border:1px solid rgba(var(--primary-rgb),.18);background:rgba(var(--primary-rgb),.06);color:var(--primary);border-radius:5px;padding:5px 6px;font-size:6px;font-weight:900;cursor:pointer}.cart-title-actions .done-mini{color:#4ade80;border-color:rgba(74,222,128,.25);background:rgba(74,222,128,.08)}.cart-title>span{background:rgba(var(--primary-rgb),.12);color:var(--primary);border:1px solid rgba(var(--primary-rgb),.18);border-radius:12px;padding:4px 7px;font-size:9px;font-weight:900}.cart-list{padding:8px;overflow:auto;max-height:calc(100vh - 430px)}.cart-item{display:grid;grid-template-columns:42px minmax(0,1fr) auto auto;gap:7px;align-items:center;padding:7px 4px;border-bottom:1px solid rgba(255,255,255,.06)}.cart-thumb{width:42px;height:42px;border-radius:7px;overflow:hidden;background:var(--surface-2);display:grid;place-items:center;color:var(--primary)}.cart-thumb img{width:100%;height:100%;object-fit:cover}.cart-info{min-width:0;display:flex;flex-direction:column;gap:2px}.cart-info strong{font-size:10px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cart-info small{font-size:8px;color:rgba(255,255,255,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cart-info span{font-size:9px;font-weight:900;color:var(--primary)}.qty{display:flex;align-items:center;gap:3px}.qty button,.delete{width:22px;height:22px;border:1px solid rgba(var(--primary-rgb),.20);background:rgba(var(--primary-rgb),.05);color:var(--text);border-radius:5px;cursor:pointer;font-weight:900}.qty button:hover{border-color:var(--primary)}.qty b{font-size:9px;min-width:14px;text-align:center}.delete{color:#f87171}.delivery-mini{padding:8px 10px;border-top:1px solid rgba(var(--primary-rgb),.12);display:flex;gap:8px;align-items:center}.delivery-mini select{flex:1;border:1px solid rgba(var(--primary-rgb),.18);background:var(--surface-2);color:var(--text);border-radius:6px;padding:7px;font-size:9px}.delivery-mini span{font-size:8px;font-weight:800;color:var(--primary)}
        .printer-prompt-text{margin:0 0 14px;padding:0 2px;color:rgba(255,255,255,.72);font-size:10px;line-height:1.55}.printer-prompt-actions{display:grid;grid-template-columns:1fr;gap:7px}.printer-prompt-actions button{min-height:38px}.printer-prompt{max-width:430px}
        .printer-btn{border:1px solid rgba(var(--primary-rgb),.22);background:rgba(var(--primary-rgb),.06);color:var(--primary);border-radius:7px;padding:8px 10px;font-size:8px;font-weight:900;cursor:pointer}.printer-btn:disabled{opacity:.5}.offer-box{margin:0 10px 8px;padding:8px 10px;border:1px solid rgba(var(--primary-rgb),.18);background:rgba(var(--primary-rgb),.045);border-radius:8px}.offer-head{display:flex;justify-content:space-between;font-size:8px;font-weight:900;color:var(--primary);margin-bottom:6px}.offer-box select{width:100%;border:1px solid rgba(var(--primary-rgb),.16);background:var(--surface-2);color:var(--text);border-radius:5px;padding:7px;font-size:9px}.offer-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.offer-chips span{padding:4px 6px;border-radius:5px;background:rgba(var(--accent-rgb),.09);color:var(--accent);font-size:7px;font-weight:800}.bill-summary{margin-top:auto;border-top:1px solid rgba(var(--primary-rgb),.13);padding:10px 12px}.bill-summary>div{display:flex;justify-content:space-between;align-items:center;margin:5px 0;font-size:9px;color:rgba(255,255,255,.70)}.bill-summary b{color:var(--text)}.bill-summary .discount-line>div{display:flex;align-items:center;gap:2px}.mini{border:1px solid rgba(var(--primary-rgb),.18);background:rgba(var(--primary-rgb),.05);color:var(--text);width:22px;height:22px;font-size:8px;font-weight:900;cursor:pointer}.mini.active{background:var(--primary);color:#111827;border-color:var(--primary)}.discount-line input{width:54px;height:22px;border:1px solid rgba(var(--primary-rgb),.18);background:var(--surface-2);color:var(--text);border-radius:4px;padding:3px;font-size:9px}.grand{margin:8px -12px -10px!important;padding:12px;background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 62%,var(--accent)));color:#111827!important;font-size:15px!important}.grand span,.grand b{color:#111827!important}.grand b{font-size:17px}
        .pos-buttons{display:grid;grid-template-columns:1fr 1fr 1.35fr;gap:7px;padding:10px 12px;background:var(--surface);border-top:1px solid rgba(var(--primary-rgb),.13)}.pos-buttons button{border:0;border-radius:8px;padding:11px 6px;font-size:9px;font-weight:900;cursor:pointer}.pos-buttons button:disabled{opacity:.45;cursor:not-allowed}.kot-action{background:rgba(var(--accent-rgb),.08);color:var(--accent);border:1px solid rgba(var(--accent-rgb),.20)!important}.kot-action:hover{filter:brightness(1.05)}.save{background:rgba(var(--primary-rgb),.13);color:var(--primary);border:1px solid rgba(var(--primary-rgb),.25)!important}.finalize{background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 62%,var(--accent)));color:#111827}.save:hover,.finalize:hover{filter:brightness(1.05)}
        .inline-bill-box{margin:0 10px 8px;padding:10px;border:1px solid rgba(var(--primary-rgb),.20);background:linear-gradient(145deg,rgba(var(--primary-rgb),.07),rgba(var(--accent-rgb),.04));border-radius:9px}.inline-bill-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.inline-bill-head>div{display:flex;flex-direction:column;gap:2px}.inline-bill-head strong{font-size:12px;color:var(--text)}.inline-bill-head>span{font-size:8px;color:var(--primary);font-weight:900}.payment-row{display:grid;grid-template-columns:1fr 1fr;gap:6px}.payment-row label{display:flex;flex-direction:column;gap:3px;font-size:7px;color:rgba(255,255,255,.5);font-weight:900}.payment-row select,.payment-row input{width:100%;border:1px solid rgba(var(--primary-rgb),.16);background:var(--surface-2);color:var(--text);border-radius:5px;padding:7px;font-size:9px;outline:0}.payment-row select option{background:var(--surface);color:var(--text)}.payable-row{display:flex;justify-content:space-between;align-items:end;padding-top:9px}.payable-row span{font-size:7px;color:rgba(255,255,255,.45);font-weight:900}.payable-row strong{font-size:18px;color:var(--primary)}.print-bill-btn{width:100%;margin-top:8px;border:1px solid rgba(var(--primary-rgb),.28);background:rgba(var(--primary-rgb),.09);color:var(--primary);border-radius:6px;padding:8px;font-size:8px;font-weight:900}.print-bill-btn:disabled{opacity:.4}.paid-banner{margin-top:7px;background:rgba(var(--accent-rgb),.12);border:1px solid rgba(var(--accent-rgb),.22);color:var(--accent);border-radius:6px;padding:7px;font-size:8px;font-weight:900}
        .modal-backdrop{position:fixed;inset:0;background:rgba(2,6,23,.72);backdrop-filter:blur(5px);z-index:50;display:grid;place-items:center;padding:18px}.modal{width:min(480px,100%);max-height:85vh;overflow:auto;background:var(--surface);color:var(--text);border:1px solid rgba(var(--primary-rgb),.22);border-radius:12px;padding:16px;box-shadow:0 25px 70px rgba(0,0,0,.45)}.modal-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}.modal-head h2{margin:3px 0;font-size:18px}.modal-head button{border:1px solid rgba(var(--primary-rgb),.15);background:rgba(var(--primary-rgb),.06);color:var(--text);border-radius:5px;font-size:17px;cursor:pointer}.variant-row{display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid rgba(var(--primary-rgb),.13);background:var(--surface-2);border-radius:7px;margin:6px 0}.variant-row span{font-size:11px;font-weight:800}.variant-row small{display:block;color:rgba(255,255,255,.48);font-size:9px;margin-top:2px}.variant-row>div{display:flex;align-items:center;gap:7px}.variant-row button{width:28px;height:28px;border:1px solid rgba(var(--primary-rgb),.18);background:rgba(var(--primary-rgb),.05);color:var(--text);border-radius:5px}.modifier-group{margin:10px 0}.modifier-group>div:first-child{display:flex;justify-content:space-between;margin-bottom:5px;font-size:11px}.modifier-group>div:first-child small{color:rgba(255,255,255,.45);font-size:8px}.modifier{width:100%;display:flex;justify-content:space-between;border:1px solid rgba(var(--primary-rgb),.13);background:var(--surface-2);color:var(--text);border-radius:7px;padding:9px;margin:4px 0;font-size:10px;cursor:pointer}.modifier.active{border-color:var(--primary);background:rgba(var(--primary-rgb),.10);color:var(--primary)}.modal-primary{width:100%;border:0;background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 62%,var(--accent)));color:#111827;border-radius:7px;padding:11px;font-weight:900;font-size:10px;margin-top:8px}
        .pos-loading,.pos-error{min-height:100vh;display:grid;place-items:center;align-content:center;gap:12px;background:var(--background);color:var(--text);font-family:Inter,Arial,sans-serif}.pos-loading{font-weight:800}.pos-error{padding:20px;text-align:center}.pos-error strong{max-width:600px;color:#fca5a5}.pos-error button{border:1px solid rgba(var(--primary-rgb),.28);background:var(--primary);color:#111827;padding:10px 15px;border-radius:8px;font-weight:800}
        @media(max-width:1100px){.pos-grid{grid-template-columns:135px minmax(0,1fr) 325px}.product-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.pos-info-row{grid-template-columns:150px 1fr 150px}.info-cell.wide{grid-column:1/-1}}
        @media(max-width:800px){.pos-topbar{padding:0 10px}.brand-block span,.live-pill{display:none}.order-mode-bar{overflow:auto;padding-left:8px}.mode{padding:0 16px}.pos-info-row{grid-template-columns:1fr 1fr}.pos-grid{grid-template-columns:1fr;display:block}.category-panel{display:flex;gap:5px;overflow:auto;border-right:0;border-bottom:1px solid rgba(var(--primary-rgb),.13);padding:7px}.panel-title{display:none}.category{width:auto;min-width:max-content;margin:0}.menu-panel{padding:8px}.product-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.cart-panel{border-left:0;border-top:1px solid rgba(var(--primary-rgb),.13)}.cart-list{max-height:330px}.back-btn span{display:none}}
        @media(max-width:520px){.kitchen-order-list{grid-template-columns:1fr}.kitchen-toggle{margin-left:3px!important;padding:0 10px!important}.pos-info-row{grid-template-columns:1fr}.product-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.menu-toolbar{align-items:stretch;flex-direction:column}.menu-toolbar input{width:100%}.cart-item{grid-template-columns:38px minmax(0,1fr) auto}.delete{grid-column:3;grid-row:1}.qty{grid-column:2;justify-self:end;grid-row:1}.cart-info{padding-right:45px}.pos-buttons{position:sticky;bottom:0;z-index:5}.brand-block strong{font-size:13px}}
        @media print{.pos-topbar,.order-mode-bar,.kitchen-strip,.pos-info-row,.category-panel,.menu-panel,.pos-buttons,.inline-bill-box{display:none!important}.anaira-pos{background:#fff;color:#111}.pos-grid{display:block}.cart-panel{border:0;width:100%;background:#fff;color:#111}.cart-list{max-height:none}.cart-title{border-bottom:1px solid #111}.cart-title h2,.cart-info strong,.bill-summary b{color:#111!important}.bill-summary{color:#111;border-top:1px solid #111}.grand{background:#ddd!important;color:#111!important}.grand span,.grand b{color:#111!important}}
      `}</style>
    </div>
  )
}
