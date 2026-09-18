"use client"

import { createClientUuid } from "@/lib/clientUuid"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { connectBluetoothThermalPrinter, disconnectBluetoothThermalPrinter, disconnectNativeBluetoothThermalPrinter, disconnectLocalPrinter, getBluetoothThermalName, isBluetoothThermalConnected, isBluetoothThermalSupported, isNativeBluetoothPrinterAvailable, listNativeBluetoothPrinters, connectNativeBluetoothThermalPrinter, openNativeBluetoothSettings, makeEscPosReceipt, printBluetoothThermal, sendThermalPrint, connectLocalPrinter, listLocalPrinters, testLocalPrinter, getLocalBridgeStatus, startLocalPrintBridge, printLocalBridge } from "@/lib/thermalPrintClient"
import { enqueueCloudPrintJob } from "@/lib/cloudPrintQueue"
import Sidebar from "@/components/Sidebar"
import { useAuth } from "@/components/AuthProvider"

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function OrderPage() {
  const router = useRouter()
  const { role } = useAuth()
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [menuMoreOpen, setMenuMoreOpen] = useState(false)
  const [cartMoreOpen, setCartMoreOpen] = useState(false)
  const params = useSearchParams()
  const route = useParams()
  const slug = route?.slug

  const [restaurantId, setRestaurantId] = useState(null)
  const [restaurantName, setRestaurantName] = useState("")
  const [restaurant, setRestaurant] = useState(null)
  const [menu, setMenu] = useState([])
  const [tables, setTables] = useState([])
  const [rooms, setRooms] = useState([])
  const [floors, setFloors] = useState([])
  const [activeFloor, setActiveFloor] = useState("All Floors")
  const [deliveryZones, setDeliveryZones] = useState([])
  const [offers, setOffers] = useState([])
  const [selectedOfferId, setSelectedOfferId] = useState("")
  const [printerName, setPrinterName] = useState("")
  const [printerConnecting, setPrinterConnecting] = useState(false)
  const [printerPrompt, setPrinterPrompt] = useState(null)
  const [deliveryPrintPrompt, setDeliveryPrintPrompt] = useState(null)
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
  const [posView, setPosView] = useState("floor")
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
  const [billingOrders, setBillingOrders] = useState([])
  const [deliveryRiders, setDeliveryRiders] = useState([])
  const [activeDelivery, setActiveDelivery] = useState(null)
  const [deliveryPopupOpen, setDeliveryPopupOpen] = useState(false)
  const [deliveryAction, setDeliveryAction] = useState("")
  const [deliveryPersonType, setDeliveryPersonType] = useState("rider")
  const [deliveryRiderId, setDeliveryRiderId] = useState("")
  const [deliveryOwnerName, setDeliveryOwnerName] = useState("Restaurant Owner")
  const [deliveryOwnerPhone, setDeliveryOwnerPhone] = useState("")
  const [deliveryCash, setDeliveryCash] = useState("")
  const [deliveryUpi, setDeliveryUpi] = useState("")
  const [deliveryCard, setDeliveryCard] = useState("")
  const [deliveryNote, setDeliveryNote] = useState("")
  const [kitchenOpen, setKitchenOpen] = useState(true)
  const [kitchenLoading, setKitchenLoading] = useState(false)
  const [kitchenUpdating, setKitchenUpdating] = useState("")
  const [newKitchenOrder, setNewKitchenOrder] = useState(null)
  const [qrServiceNotice, setQrServiceNotice] = useState(null)
  const kitchenInitialized = useRef(false)
  const kitchenSeen = useRef(new Set())
  const finalizeLock = useRef(false)

  useEffect(() => {
    const handler = (event) => {
      const row = event?.detail
      const text = String(row?.message || "")
      if (!row?.id || (!/bill requested/i.test(String(row?.title || "")) && !/waiter requested/i.test(String(row?.title || "")))) return
      const match = text.match(/Order #([0-9]{4,})/i)
      setQrServiceNotice({ ...row, order_number: match?.[1] || "" })
      window.setTimeout(() => setQrServiceNotice(current => current?.id === row.id ? null : current), 15000)
    }
    window.addEventListener("anaira:notification", handler)
    return () => window.removeEventListener("anaira:notification", handler)
  }, [])

  useEffect(() => { init() }, [slug])

  useEffect(() => {
    const initialType = route?.type || params.get("type")
    const initialId = route?.id || params.get("id")
    if (!initialId || !["table", "room"].includes(initialType)) return
    const list = initialType === "table" ? tables : rooms
    const found = list.find(x => String(x.id) === String(initialId) || String(x.table_number ?? x.room_number) === String(initialId))
    if (found) { setType(initialType); setSelected(found); setPosView("order") }
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
        const { data: sessionData, error: sessionError } = await supabaseCloud.auth.getSession()
        if (sessionError || !sessionData?.session?.user) throw new Error("Please sign in first.")
        const user = sessionData.session.user
        const { data: profile } = await supabaseCloud.from("profiles").select("restaurant_id").eq("id", user.id).single()
        rid = profile?.restaurant_id
      }
      if (!rid) throw new Error("Restaurant profile not found")
      setRestaurantId(rid)
      await fetchAll(rid, restaurant)
      const initialType = route?.type || params.get("type") || "table"
      const initialId = route?.id || params.get("id")
      if (["table", "room", "delivery", "takeaway"].includes(initialType)) { setType(initialType); setPosView(route?.id || params.get("id") ? "order" : "floor") }
    } catch (e) {
      console.error(e)
      setError(e.message || "Unable to load order screen")
    } finally { setLoading(false) }
  }

  async function fetchAll(rid, knownRestaurant = null) {
    // Reuse the restaurant fetched during slug bootstrap; avoid a duplicate
    // restaurant query on every hard navigation to the POS.
    if (knownRestaurant) {
      setRestaurant(knownRestaurant)
      setRestaurantName(knownRestaurant.name || "")
    }
    const { data: plugin } = await supabaseCloud.from("restaurant_plugins").select("enabled").eq("restaurant_id", rid).eq("plugin_code", "operations-hub").maybeSingle()
    const hubOn = plugin?.enabled === true
    setOperationsHubEnabled(hubOn)
    if (!knownRestaurant) {
      const { data: rest } = await supabaseCloud.from("restaurants").select("*").eq("id", rid).maybeSingle()
      if (rest) { setRestaurant(rest); setRestaurantName(rest.name || "") }
    }
    const empty = { data: [], error: null }
    const [menuResult, variantResult, tableResult, roomResult, floorResult, zoneResult, offerResult, groupResult, modifierResult, linkResult] = await Promise.all([
      supabaseCloud.from("menu_items").select("*").eq("restaurant_id", rid).order("name"),
      supabaseCloud.from("menu_variants").select("id,menu_item_id,name,price_delta,active").eq("restaurant_id", rid).eq("active", true).order("created_at"),
      supabaseCloud.from("tables").select("*").eq("restaurant_id", rid).order("table_number"),
      supabaseCloud.from("rooms").select("*").eq("restaurant_id", rid).order("room_number"),
      supabaseCloud.from("floors").select("id,name,display_order,active").eq("restaurant_id", rid).eq("active", true).order("display_order").order("name"),
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

  const tableFloors = useMemo(() => {
    const names = floors.map(f => String(f.name || "").trim()).filter(Boolean)
    const legacy = tables.map(t => String(t.floor || "").trim()).filter(Boolean)
    return [...new Set([...names, ...legacy])]
  }, [floors, tables])
  const visibleTables = useMemo(() => {
    if (activeFloor === "All Floors") return tables
    return tables.filter(t => String(t.floor || "Ground Floor") === activeFloor)
  }, [tables, activeFloor])
  const visibleRooms = useMemo(() => {
    if (activeFloor === "All Floors") return rooms
    return rooms.filter(r => String(r.floor || "Ground Floor") === activeFloor)
  }, [rooms, activeFloor])
  const categories = useMemo(() => ["All", ...new Set(menu.map(i => String(i.category || "Other").trim() || "Other"))], [menu])
  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return menu.filter(item => {
      const catOk = activeCategory === "All" || String(item.category || "Other").trim() === activeCategory
      const searchOk = !q || String(item.name || "").toLowerCase().includes(q)
      return catOk && searchOk
    })
  }, [menu, activeCategory, search])
  // Keep the counter screen compact. The first six items fit into a
  // predictable 2-row desktop / 3-row mobile grid; the complete category
  // remains available through the View More overlay.
  const compactVisibleItems = useMemo(() => visibleItems.slice(0, 10), [visibleItems])

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
    if (next === "table" || next === "room") setPosView("floor")
    else setPosView("order")
    if (next !== "delivery") { setCustomerName(""); setCustomerPhone(""); setDeliveryAddress(""); setCustomerNotes("") }
  }

  async function authToken() {
    const { data, error: sessionError } = await supabaseCloud.auth.getSession()
    if (sessionError || !data?.session?.access_token) throw new Error("Login session expired. Please login again.")
    return data.session.access_token
  }

  function normalizeInputValue(value) {
    return value == null ? "" : String(value)
  }

  function hydrateDeliveryPopup(delivery, { open = true } = {}) {
    if (!delivery?.id) return
    setActiveDelivery({ ...delivery })
    const assignedType = String(delivery.delivery_person_type || "rider").toLowerCase()
    setDeliveryPersonType(assignedType === "owner" ? "owner" : "rider")
    setDeliveryRiderId(normalizeInputValue(delivery.rider_id))
    setDeliveryOwnerName(normalizeInputValue(delivery.delivery_person_name || "Restaurant Owner"))
    setDeliveryOwnerPhone(normalizeInputValue(delivery.delivery_person_phone))
    if (open && String(delivery.settlement_status || "pending").toLowerCase() !== "settled") setDeliveryPopupOpen(true)
  }

  async function refreshDeliveries({ silent = false, orderId = null } = {}) {
    if (!restaurantId) return []
    try {
      const token = await authToken()
      const response = await fetch("/api/delivery", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to load delivery workflow")
      const deliveries = result.deliveries || []
      setDeliveryRiders(result.riders || [])
      const targetId = orderId || currentOrder?.id
      const target = targetId ? deliveries.find(d => String(d.order_id) === String(targetId)) : null
      if (target) {
        setActiveDelivery(target)
        if (String(target.settlement_status || "pending").toLowerCase() !== "settled") setDeliveryPopupOpen(true)
      } else if (activeDelivery?.id) {
        const refreshed = deliveries.find(d => String(d.id) === String(activeDelivery.id))
        if (refreshed) {
          setActiveDelivery(refreshed)
          if (String(refreshed.settlement_status || "pending").toLowerCase() !== "settled") setDeliveryPopupOpen(true)
        }
      }
      return deliveries
    } catch (e) {
      if (!silent) console.warn("DELIVERY WORKFLOW:", e)
      return []
    }
  }

  async function deliveryActionRequest(action, payload = {}) {
    if (!activeDelivery?.id) throw new Error("Delivery record not found.")
    setDeliveryAction(action)
    try {
      const token = await authToken()
      const response = await fetch("/api/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, delivery_id: activeDelivery.id, ...payload })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.error || "Delivery operation failed")
      if (result.delivery) setActiveDelivery(result.delivery)
      return result
    } finally { setDeliveryAction("") }
  }

  async function assignActiveDelivery() {
    if (!activeDelivery?.id) return
    if (deliveryPersonType === "rider" && !deliveryRiderId) return alert("Select a delivery rider.")
    try {
      const rider = deliveryRiders.find(r => String(r.id) === String(deliveryRiderId))
      const result = await deliveryActionRequest("assign", {
        delivery_person_type: deliveryPersonType,
        rider_id: deliveryPersonType === "rider" ? deliveryRiderId : null,
        delivery_person_name: deliveryPersonType === "owner" ? normalizeInputValue(deliveryOwnerName).trim() || "Restaurant Owner" : undefined,
        delivery_person_phone: deliveryPersonType === "owner" ? normalizeInputValue(deliveryOwnerPhone).trim() || null : undefined,
        rider_name: deliveryPersonType === "rider" ? rider?.name : undefined,
        rider_phone: deliveryPersonType === "rider" ? rider?.phone : undefined,
      })
      hydrateDeliveryPopup(result.delivery, { open: true })
      if (result.delivery_slip_queued) {
        // Assignment itself is the trigger. If this browser already has a BLE
        // printer connected, claim this exact cloud job and print it now. If
        // not, keep the cloud job queued and show a small popup with an
        // explicit Print option instead of forcing the user to visit Delivery.
        let autoPrinted = false
        if (result.print_job?.id && isBluetoothThermalConnected()) {
          try {
            const token = await authToken()
            const claimResponse = await fetch("/api/printing/claim-job", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ job_id: result.print_job.id })
            })
            const claim = await claimResponse.json().catch(() => ({}))
            if (claimResponse.ok && claim?.success && claim?.job?.payload?.content) {
              const bytes = makeEscPosReceipt({
                title: "DELIVERY SLIP",
                lines: String(claim.job.payload.content).split(/\r?\n/).filter(Boolean),
                footer: "DELIVERY COPY"
              })
              await printBluetoothThermal(bytes)
              await fetch("/api/printing/complete-job", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ job_id: result.print_job.id, success: true })
              }).catch(() => {})
              autoPrinted = true
            }
          } catch (printError) {
            console.warn("AUTO DELIVERY SLIP PRINT:", printError)
            try {
              const token = await authToken()
              await fetch("/api/printing/complete-job", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ job_id: result.print_job.id, success: false })
              })
            } catch (_) {}
          }
        }
        if (autoPrinted) {
          setDeliveryPrintPrompt({ type: "success", title: "DELIVERY SLIP PRINTED", message: `Delivery ${result.delivery?.slip_no || "slip"} assigned and the delivery slip was printed automatically.` })
        } else {
          setDeliveryPrintPrompt({
            type: "ready",
            title: "DELIVERY SLIP READY",
            message: `Delivery ${result.delivery?.slip_no || "slip"} assigned. The slip is saved in Supabase print queue. Print it now from this popup or leave it queued for the connected Anaira printer agent.`,
            jobId: result.print_job?.id || null,
            content: result.print_job?.payload?.content || ""
          })
        }
      } else {
        setDeliveryPrintPrompt({ type: "error", title: "DELIVERY SLIP NOT QUEUED", message: `Delivery ${result.delivery?.slip_no || "slip"} was assigned, but the cloud print job could not be created.`, jobId: null })
      }
    } catch (e) { alert(e.message || "Unable to assign delivery") }
  }

  async function requestDeliverySlipPrint(delivery) {
    if (!delivery?.id) return
    try {
      const token = await authToken()
      const response = await fetch("/api/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "print_slip", delivery_id: delivery.id })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.success || !result?.print_job?.id) {
        throw new Error(result?.error || "Unable to create delivery slip print job.")
      }

      const job = result.print_job
      const content = job?.payload?.content || ""

      // If this browser already has the BLE thermal printer connected, print
      // the exact cloud job immediately. Otherwise keep it queued and show the
      // Order Page popup so the user can connect/print without visiting
      // Dashboard > Delivery.
      if (isBluetoothThermalConnected() && content) {
        await printQueuedDeliverySlip(job.id, content)
        return
      }

      setDeliveryPrintPrompt({
        type: "ready",
        title: "DELIVERY SLIP READY",
        message: `${delivery.slip_no || "Delivery slip"} is saved in the Supabase print queue. Connect the Bluetooth printer and print it from here.`,
        jobId: job.id,
        content,
      })
    } catch (e) {
      setDeliveryPrintPrompt({
        type: "error",
        title: "DELIVERY SLIP PRINT FAILED",
        message: e?.message || "Unable to prepare the delivery slip for printing.",
        jobId: null,
        content: "",
      })
    }
  }

  async function printQueuedDeliverySlip(jobId, content) {
    if (!jobId || !content) return
    try {
      if (!isBluetoothThermalConnected()) {
        throw new Error("Bluetooth printer is not connected. Connect the printer first, then try again.")
      }
      const token = await authToken()
      const claimResponse = await fetch("/api/printing/claim-job", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ job_id: jobId })
      })
      const claim = await claimResponse.json().catch(() => ({}))
      if (!claimResponse.ok || !claim?.success || !claim?.job?.payload?.content) throw new Error(claim?.error || "Delivery slip is already being handled by another printer agent.")
      const bytes = makeEscPosReceipt({ title: "DELIVERY SLIP", lines: String(claim.job.payload.content).split(/\r?\n/).filter(Boolean), footer: "DELIVERY COPY" })
      await printBluetoothThermal(bytes)
      await fetch("/api/printing/complete-job", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ job_id: jobId, success: true })
      })
      setDeliveryPrintPrompt({ type: "success", title: "DELIVERY SLIP PRINTED", message: "Delivery slip printed successfully." })
    } catch (e) {
      try {
        const token = await authToken()
        await fetch("/api/printing/complete-job", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ job_id: jobId, success: false })
        })
      } catch (_) {}
      setDeliveryPrintPrompt(prev => ({ ...(prev || {}), type: "error", title: "DELIVERY SLIP PRINT FAILED", message: e?.message || "Unable to print delivery slip." }))
    }
  }

  async function advanceActiveDelivery(nextStatus) {
    if (!activeDelivery?.id) return
    try {
      const result = await deliveryActionRequest("status", { status: nextStatus })
      hydrateDeliveryPopup(result.delivery, { open: true })
    } catch (e) { alert(e.message || "Unable to update delivery status") }
  }

  async function settleActiveDelivery() {
    if (!activeDelivery?.id) return
    const expected = Number(activeDelivery.collection_expected ?? activeDelivery.expected_amount ?? 0)
    const cash = Number(deliveryCash || 0)
    const upi = Number(deliveryUpi || 0)
    const card = Number(deliveryCard || 0)
    if (cash + upi + card <= 0 && expected > 0) return alert(`Enter amount collected. Expected ${money(expected)}.`)
    try {
      const result = await deliveryActionRequest("settle", {
        cash_collected: cash, upi_collected: upi, card_collected: card, collection_notes: normalizeInputValue(deliveryNote).trim() || null
      })
      setActiveDelivery(result.delivery)
      setDeliveryCash(""); setDeliveryUpi(""); setDeliveryCard(""); setDeliveryNote("")
      await refreshKitchenOrders({ silent: true })
    } catch (e) { alert(e.message || "Unable to settle delivery") }
  }

  async function completeActiveDelivery() {
    if (!activeDelivery?.id) return
    if (String(activeDelivery.settlement_status || "").toLowerCase() !== "settled") return alert("Settle the delivery first.")
    try {
      const result = await deliveryActionRequest("complete")
      if (result.order) {
        setCurrentOrder(prev => ({ ...(prev || {}), ...result.order, status: result.order.status || "done" }))
        setActiveDelivery(result.delivery || null)
        setDeliveryPopupOpen(false)
        setScreen("bill")
        setPosView("order")
        await refreshKitchenOrders({ silent: true })
      }
    } catch (e) { alert(e.message || "Unable to complete delivery order") }
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
      const allOrders = result.orders || []
      const live = allOrders.filter(o => !["done", "completed", "complete", "cancelled", "canceled"].includes(String(o.status || "").toLowerCase()))
      const billQueue = allOrders
        .filter(o => ["done", "completed", "complete"].includes(String(o.status || "").toLowerCase()))
        .filter(o => !["paid", "settled", "completed"].includes(String(o.payment_status || "").toLowerCase()))
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      setKitchenOrders(live)
      setBillingOrders(billQueue)

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
    const tick = () => {
      if (document.visibilityState === "visible") refreshKitchenOrders({ silent: true })
    }
    const timer = setInterval(tick, 30000)
    document.addEventListener("visibilitychange", tick)
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick) }
  }, [restaurantId])

  useEffect(() => {
    if (!restaurantId) return
    refreshDeliveries({ silent: true })
    const tick = () => {
      if (document.visibilityState === "visible") refreshDeliveries({ silent: true })
    }
    const timer = setInterval(tick, 30000)
    document.addEventListener("visibilitychange", tick)
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick) }
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
    setPosView("order")
    setCart((order.items || []).map(kitchenItemToCart))
    setNewKitchenOrder(null)
    if (orderType === "delivery") {
      refreshDeliveries({ silent: true, orderId: order.id }).then(deliveries => {
        const delivery = deliveries.find(d => String(d.order_id) === String(order.id))
        if (delivery && String(delivery.settlement_status || "pending").toLowerCase() !== "settled") hydrateDeliveryPopup(delivery, { open: true })
      })
    }
  }

  function openBillingOrder(order) {
    if (!order?.id) return
    openKitchenOrder(order)
    setScreen("bill")
    setPosView("order")
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
      if (status === "done") {
        setBillingOrders(prev => [updated, ...prev.filter(o => o.id !== order.id)])
      } else if (status === "cancelled") {
        setBillingOrders(prev => prev.filter(o => o.id !== order.id))
      }
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
    if (typeof window === "undefined") return []
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
    const native = isNativeBluetoothPrinterAvailable()
    const bleAvailable = typeof window !== "undefined" && typeof navigator !== "undefined" && !!navigator.bluetooth && window.isSecureContext
    setPrinterPrompt({
      title: "CONNECT PRINTER",
      message: native
        ? "Cloud printing is active. Scan for the BLE thermal printer in this Anaira Android app. Print jobs are stored in Supabase and delivered to this connected printer."
        : "Cloud printing is active. This browser can print directly only when Web Bluetooth supports your BLE ESC/POS printer. Otherwise print jobs are queued in Supabase for the connected Anaira Android printer app.",
      allowBle: bleAvailable,
      native,
    })
  }

  async function connectSelectedLocalPrinter() {
    setPrinterConnecting(true)
    try {
      const result = await connectLocalPrinter(selectedLocalPort || null)
      const connectedPort = result.port || result.printer?.port || result.printer?.name || selectedLocalPort || "COM port"
      setPrinterName(connectedPort)
      setPrinterPrompt(null)
      alert(`MPT-III connected on ${connectedPort}`)
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
      alert(`Test print sent to ${result.port || result.printer?.port || selectedLocalPort || "MPT-III"}.`)
    } catch (e) {
      alert(e?.message || "MPT-III test print failed")
    } finally { setPrinterConnecting(false) }
  }

  async function connectPrinter({ silent = false } = {}) {
    setPrinterConnecting(true)
    try {
      if (isNativeBluetoothPrinterAvailable()) {
        const found = await listNativeBluetoothPrinters()
        if (!found.length) {
          setPrinterPrompt({ title: "BLUETOOTH PRINTER", message: "No BLE printer found. Turn Bluetooth on, keep the thermal printer powered on and nearby, then scan again.", native: true })
          return false
        }
        const preferred = found.find(p => /MPT|MTP|thermal|printer|pos/i.test(p.name || "")) || found[0]
        const result = await connectNativeBluetoothThermalPrinter(preferred.address, { ble: true })
        setPrinterName(result.name || preferred.name || "Bluetooth Thermal Printer")
        setPrinterPrompt(null)
        if (!silent) alert(`Bluetooth printer connected: ${result.name || preferred.name}`)
        return true
      }

      // Cloud-first mode: never require the localhost print bridge. On Windows,
      // use browser BLE when supported; otherwise print jobs remain in Supabase
      // for the connected Anaira Android printer agent.

      if (!isBluetoothThermalSupported()) {
        setPrinterPrompt({ title: "CONNECT BLUETOOTH PRINTER", message: "This browser cannot connect to the BLE printer directly. The print job can still be queued in Supabase and printed by a connected Anaira Android printer agent." })
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
      if (isBluetoothThermalConnected()) return printBluetoothThermal(bytes)
      try {
        const job = await enqueueCloudPrintJob({ restaurantId, jobType: "kot", referenceId: order.id, content: lines.join("\n"), data: { order_id: order.id, items: printItems, title: `${restaurantName || "ANAIRA"} - KOT`, footer: "KITCHEN COPY" } })
        return { success: true, queued: true, cloud: true, job_id: job.id }
      } catch (queueError) {
        console.warn("Cloud print queue failed:", queueError)
      }
      throw new Error("Cloud print queue is unavailable. Check your Supabase connection and try again.")
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
    if (isBluetoothThermalConnected()) return printBluetoothThermal(bytes)
    try {
      const job = await enqueueCloudPrintJob({ restaurantId, jobType: "bill", referenceId: order.id, content: lines.join("\n"), data: { order_id: order.id, bill, items: printItems, subtotal, discount, offer_discount: offerDiscount, manual_discount: manualDiscount, gst, delivery_charge: deliveryCharge, total, title: `${restaurantName || "ANAIRA"} - BILL`, footer: bill?.payment_status === "paid" ? "PAID - THANK YOU" : "THANK YOU" } })
      return { success: true, queued: true, cloud: true, job_id: job.id }
    } catch (queueError) {
      console.warn("Cloud print queue failed:", queueError)
    }
    throw new Error("Cloud print queue is unavailable. Check your Supabase connection and try again.")
  }

  async function printKot(orderId = currentOrder?.id) {
    if (!orderId) return alert("Create or select an order first.")
    try {
      const order = currentOrder?.id === orderId ? currentOrder : kitchenOrders.find(o => String(o.id) === String(orderId))
      const result = await printThermal("kot", order || { id: orderId })
      if (result?.requiresConnection) return
      alert(result?.queued ? "KOT cloud print queue mein bhej diya gaya. Connected Anaira printer app ise print karega." : "KOT printed successfully.")
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
          else if (deliveryResult.delivery) hydrateDeliveryPopup(deliveryResult.delivery, { open: true })
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
          idempotency_key: createClientUuid("billing"),
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
      const finalizedItems = [...cart]
      const completedBill = result.bill || { ...currentOrder, invoice_no: currentOrder.id.slice(0, 8).toUpperCase(), total_amount: total, payment_status: "paid", paid_amount: total }
      const completedOrder = { ...currentOrder, ...completedBill, status: "done", payment_status: completedBill.payment_status || "paid", paid_amount: Number(completedBill.paid_amount ?? total), items: finalizedItems }

      // FINALIZE is the point at which the active POS order is finished.
      // Clear the working cart immediately after the server confirms payment;
      // printing is only a side effect and must never keep the cart/order alive.
      setBillingOrders(prev => prev.filter(o => o.id !== currentOrder.id))
      setCurrentOrder(null)
      setFinalizedBill(null)
      setCart([])
      setSelected(null)
      setActiveDelivery(null)
      setDeliveryPopupOpen(false)
      setScreen("order")
      setPosView("floor")
      setDiscountValue("")
      setPaymentReference("")
      setCustomerName("")
      setCustomerPhone("")
      setDeliveryAddress("")
      setDeliveryZone("")
      setDeliveryCharge(0)
      setCustomerNotes("")
      setOrderNote("")
      setTimeout(() => refreshKitchenOrders({ silent: true }), 0)

      // Printing is attempted after the POS is cleared. Whether the printer
      // is connected, disconnected, or fails, the finalized order stays closed.
      try {
        const printResult = await printThermal("bill", completedOrder, completedBill)
        if (printResult?.requiresConnection) {
          alert(`Invoice ${completedBill.invoice_no || "generated"} finalized. Printer is not connected; the cart has been cleared.`)
          return
        }
      } catch (printError) {
        console.warn("AUTO BILL PRINT:", printError)
        alert(`Invoice ${completedBill.invoice_no || "generated"} finalized. Bill print needs attention: ${printError.message || "Printer error"}. The cart has been cleared.`)
        return
      }
      alert(`Invoice ${completedBill.invoice_no || "generated"} finalized and printed.`)
    } catch (e) {
      console.error(e); alert(e.message || "Billing failed")
    } finally {
      finalizeLock.current = false
      setFinalizing(false)
    }
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
      {qrServiceNotice && <div style={{position:"fixed",top:14,right:14,zIndex:99999,maxWidth:520,display:"flex",alignItems:"center",gap:10,padding:"13px 15px",border:"1px solid rgba(239,68,68,.45)",borderRadius:16,background:"var(--surface)",boxShadow:"0 20px 60px rgba(0,0,0,.35)"}}><div style={{minWidth:0,display:"grid",gap:3}}><strong>{qrServiceNotice.title || "QR Service Request"}</strong><span style={{color:"var(--muted)",fontSize:12}}>{qrServiceNotice.message}</span></div><button onClick={()=>{if(qrServiceNotice.action_url) window.location.href=qrServiceNotice.action_url}} style={{border:0,borderRadius:9,padding:"8px 10px",fontWeight:800,cursor:"pointer"}}>OPEN</button><button onClick={()=>setQrServiceNotice(null)} style={{border:0,background:"transparent",color:"var(--text)",fontSize:20,cursor:"pointer"}}>×</button></div>}
      {navigationOpen && (
        <div className="pos-navigation-drawer-layer" role="presentation">
          <button
            type="button"
            className="pos-navigation-drawer-backdrop"
            aria-label="Close navigation"
            onClick={() => setNavigationOpen(false)}
          />
          <Sidebar role={role} drawer onNavigate={() => setNavigationOpen(false)} />
        </div>
      )}

      <header className="pos-topbar">
        <button
          type="button"
          className="pos-menu-btn"
          aria-label="Open navigation menu"
          onClick={() => setNavigationOpen(true)}
        >
          ☰ <span>MENU</span>
        </button>
        <button className="back-btn" onClick={() => router.back()}>← <span>Back</span></button>
        <div className="brand-block"><strong>{restaurantName || "Anaira POS"}</strong><span>{currentOrder?.invoice_no ? `Invoice ${currentOrder.invoice_no}` : currentOrder?.id ? `Order ${String(currentOrder.id).slice(0, 8).toUpperCase()}` : "New Order"}</span></div>
        <div className="top-actions"><button className="printer-btn" onClick={printerName ? async () => { await disconnectLocalPrinter().catch(() => {}); await disconnectNativeBluetoothThermalPrinter(); disconnectBluetoothThermalPrinter(); setPrinterName(""); setSelectedLocalPort("") } : openPrinterChooser} disabled={printerConnecting}>{printerConnecting ? "CONNECTING…" : printerName ? `🖨 ${printerName}` : "🖨 PRINTER"}</button><button onClick={() => { setCart([]); setCurrentOrder(null); setFinalizedBill(null); setScreen("order"); setPosView("floor"); setSelected(null); setDiscountValue("") }}>NEW ORDER</button><span className="live-pill">● POS ONLINE</span></div>
      </header>

      <div className="order-mode-bar">
        <button className={posView === "floor" && screen === "order" ? "mode active" : "mode"} onClick={() => { setScreen("order"); setPosView("floor") }}>FLOOR</button>
        {[['table', 'TABLE'], ['room', 'ROOM'], ['delivery', 'DELIVERY'], ['takeaway', 'TAKEAWAY']].map(([key, label]) => <button key={key} className={type === key && posView === "order" && screen === "order" ? "mode active" : "mode"} onClick={() => { changeType(key); setScreen("order") }}>{label}</button>)}
        <button className={posView === "running" ? "mode active" : "mode"} onClick={() => { setScreen("order"); setPosView("running") }}>RUNNING {kitchenOrders.length ? `(${kitchenOrders.length})` : ""}</button>
        <button className={posView === "billing" ? "mode active" : "mode"} onClick={() => { setScreen("order"); setPosView("billing") }}>BILLING {billingOrders.length ? `(${billingOrders.length})` : ""}</button>
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


      {posView === "billing" && screen === "order" && <section className="billing-dashboard">
        <div className="floor-head"><div><small>ANAIRA POS • BILLING QUEUE</small><h1>Latest Bills to Finalize</h1><p>DONE orders stay here until payment and invoice finalization are completed. Open any bill to review customer, items, payment and invoice.</p></div><button className="floor-primary" onClick={() => refreshKitchenOrders()}>↻ REFRESH</button></div>
        <div className="billing-grid">
          {billingOrders.slice(0, 20).map(order => {
            const status = String(order.payment_status || "unpaid").toLowerCase()
            const source = order.display || order.source_label || "Order"
            return <article key={order.id} className="billing-card">
              <div className="billing-card-top"><div><strong>{source}</strong><span>{order.invoice_no ? `Invoice ${order.invoice_no}` : `Order ${String(order.id).slice(0, 8).toUpperCase()}`}</span></div><b className={`billing-payment ${status}`}>{status.toUpperCase()}</b></div>
              <div className="billing-card-items">{(order.items || []).slice(0, 3).map((i, idx) => <span key={idx}>{i.quantity || i.qty || 1}× {i.name || i.item_name}</span>)}{(order.items || []).length > 3 && <span>+{order.items.length - 3} more</span>}</div>
              {(order.customer_name || order.customer_phone || order.delivery_address) && <div className="billing-customer-highlight"><b>{order.customer_name || "Customer"}</b><span>📞 {order.customer_phone || "No phone"}</span>{order.delivery_address ? <span>📍 {order.delivery_address}</span> : null}</div>}
              <div className="billing-card-bottom"><strong>{money(order.total_amount)}</strong><button className="finalize" onClick={() => openBillingOrder(order)}>BILL • OPEN & FINALIZE</button></div>
            </article>
          })}
          {!billingOrders.length && <div className="floor-empty">No completed unpaid bills. Orders marked <b>DONE</b> will appear here automatically.</div>}
        </div>
      </section>}

      {posView === "floor" && screen === "order" && <section className="floor-dashboard">
        <div className="floor-head"><div><small>ANAIRA POS • TABLE MANAGEMENT</small><h1>{type === "room" ? "Rooms & Running Orders" : "Restaurant Floor"}</h1><p>Tap a table to open its running order, or start a new order.</p></div><div className="floor-actions"><button className={type === "table" ? "floor-type active" : "floor-type"} onClick={() => { setType("table"); setSelected(null) }}>TABLES</button><button className={type === "room" ? "floor-type active" : "floor-type"} onClick={() => { setType("room"); setSelected(null) }}>ROOMS</button><button className="floor-type" onClick={() => { setType("takeaway"); setSelected(null); setPosView("order") }}>TAKEAWAY</button><button className="floor-type" onClick={() => { setType("delivery"); setSelected(null); setPosView("order") }}>DELIVERY</button></div></div>
        <div className="floor-legend"><span><i className="dot free"/> AVAILABLE</span><span><i className="dot occupied"/> RUNNING</span><span><i className="dot preparing"/> KITCHEN</span></div>
        {(type === "table" || type === "room") && <div className="pos-floor-tabs">
          <button className={activeFloor === "All Floors" ? "active" : ""} onClick={() => setActiveFloor("All Floors")}>All Floors</button>
          {tableFloors.map(name => <button key={name} className={activeFloor === name ? "active" : ""} onClick={() => setActiveFloor(name)}>{name}</button>)}
        </div>}
        <div className="table-grid">
          {(type === "room" ? visibleRooms : visibleTables).map(x => {
            const number = type === "room" ? x.room_number : x.table_number
            const active = kitchenOrders.find(o => String(o.source_type || o.order_type).toLowerCase() === type && String(o.source_id) === String(x.id))
            const billDue = !active && billingOrders.find(o => String(o.source_type || o.order_type).toLowerCase() === type && String(o.source_id) === String(x.id))
            const status = String(active?.status || "").toLowerCase()
            const floorState = active ? "occupied" : billDue ? "bill-due" : "free"
            return <button key={x.id} className={`floor-table ${floorState} ${status === "preparing" ? "preparing" : ""}`} onClick={() => { setSelected(x); setPosView("order"); setScreen("order"); if (active) openKitchenOrder(active); else if (billDue) openBillingOrder(billDue) }}>
              <span className="table-no">{type === "room" ? "ROOM" : "TABLE"} {number}</span><strong>{active ? "RUNNING" : billDue ? "BILL DUE" : "AVAILABLE"}</strong>{active && <small>{status.toUpperCase()} • {money(active.total_amount)}</small>}{billDue && <small>BILL • {money(billDue.total_amount)} • OPEN</small>}
            </button>
          })}
          {!(type === "room" ? visibleRooms : visibleTables).length && <div className="floor-empty">No {type === "room" ? "rooms" : "tables"} configured on this floor.</div>}
        </div>
      </section>}

      {posView === "running" && screen === "order" && <section className="running-dashboard">
        <div className="floor-head"><div><small>LIVE ORDER QUEUE</small><h1>Running Orders</h1><p>Active kitchen orders stay here. Orders marked DONE remain visible below until their bill is finalized.</p></div><button className="floor-primary" onClick={() => { setCart([]); setCurrentOrder(null); setFinalizedBill(null); setSelected(null); setType("table"); setPosView("floor") }}>+ NEW ORDER</button></div>
        <div className="running-section-label"><span>ACTIVE ORDERS</span><b>{kitchenOrders.length}</b></div>
        <div className="running-grid">{kitchenOrders.map(order => { const status=String(order.status||"pending").toLowerCase(); return <button key={order.id} className="running-card" onClick={() => openKitchenOrder(order)}><div><strong>{order.display || order.source_label || "Order"}</strong><span className={`running-status ${status}`}>{status.toUpperCase()}</span></div><p>{(order.items||[]).slice(0,4).map(i => `${i.quantity||i.qty||1}× ${i.name||i.item_name}`).join(" • ")}</p><b>{money(order.total_amount)}</b></button> })}{!kitchenOrders.length && <div className="floor-empty">No active running orders.</div>}</div>
        <div className="running-section-label bill-due-label"><span>BILLS DUE — NOT FINALIZED</span><b>{billingOrders.length}</b></div>
        <div className="running-grid billing-due-grid">{billingOrders.slice(0,20).map(order => <button key={`due-${order.id}`} className="running-card bill-due-card" onClick={() => openBillingOrder(order)}><div><strong>{order.display || order.source_label || "Order"}</strong><span className="running-status done">BILL DUE</span></div><p>{(order.items||[]).slice(0,4).map(i => `${i.quantity||i.qty||1}× ${i.name||i.item_name}`).join(" • ")}{order.customer_name ? ` • ${order.customer_name}` : ""}</p><b>{money(order.total_amount)} → OPEN BILL</b></button>)}{!billingOrders.length && <div className="floor-empty">No unpaid completed bills.</div>}</div>
      </section>}

      {posView === "order" && screen !== "bill" && <div className="order-flow-crumb"><button onClick={() => setPosView("floor")}>← FLOOR</button><span>ORDER</span><b>{sourceLabel}</b><span>→</span><span>ADD ITEMS</span><span>→</span><span>KOT</span><span>→</span><span>BILL</span></div>}

      {posView === "order" && <section className="pos-info-row">
        <div className="info-cell"><label>{type === "table" ? "Table No." : type === "room" ? "Room No." : "Order Type"}</label>
          {(type === "table" || type === "room") ? <select value={selected?.id || ""} onChange={e => setSelected((type === "table" ? tables : rooms).find(x => String(x.id) === e.target.value) || null)}><option value="">Select {type}</option>{(type === "table" ? tables : rooms).map(x => <option key={x.id} value={x.id}>{type === "table" ? `Table ${x.table_number}` : `Room ${x.room_number}`}</option>)}</select> : <strong>{type === "delivery" ? "Delivery Order" : "Takeaway Order"}</strong>}
        </div>
        <div className={`info-cell ${type === "delivery" || type === "takeaway" ? "priority" : ""}`}><label>Customer</label><input value={normalizeInputValue(customerName)} onChange={e => setCustomerName(e.target.value)} placeholder={type === "delivery" ? "Customer name *" : "Customer name"} /></div>
        <div className={`info-cell ${type === "delivery" || type === "takeaway" ? "priority" : ""}`}><label>Mobile <span className="required-hint">{type === "delivery" ? "REQUIRED" : ""}</span></label><input value={normalizeInputValue(customerPhone)} onChange={e => setCustomerPhone(e.target.value)} placeholder="Mobile number" inputMode="tel" /></div>
        {(type === "delivery" || type === "takeaway") ? <div className="info-cell wide priority address-priority" key="customer-address"><label>{type === "delivery" ? "Delivery Address" : "Customer Address (optional)"}</label><input value={normalizeInputValue(deliveryAddress)} onChange={e => setDeliveryAddress(e.target.value)} placeholder={type === "delivery" ? "Enter full delivery address *" : "Enter address if needed"} /></div> : <div className="info-cell" key="waiter-staff"><label>Waiter / Staff</label><input defaultValue="" placeholder="Staff" /></div>}
      </section>}

      {posView === "order" && <main className="pos-grid">
        <aside className="category-panel">
          <div className="panel-title">CATEGORIES</div>
          <button className={activeCategory === "All" ? "category active" : "category"} onClick={() => setActiveCategory("All")}>Popular <span>{menu.length}</span></button>
          {categories.filter(c => c !== "All").map(c => <button key={c} className={activeCategory === c ? "category active" : "category"} onClick={() => setActiveCategory(c)}>{c}<span>{menu.filter(i => String(i.category || "Other").trim() === c).length}</span></button>)}
        </aside>

        <section className="menu-panel">
          <div className="menu-toolbar"><div><small>MENU</small><h1>{activeCategory === "All" ? "Popular Items" : activeCategory}</h1></div><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item…" /></div>
          <div className="product-grid">
            {compactVisibleItems.map(item => <button className="product-card" key={item.id} onClick={() => addToCart(item)}>
              <div className="product-photo">{item.image ? <img src={item.image} alt={item.name} loading="lazy" /> : <div className="photo-fallback">🍽️</div>}</div>
              <div className="product-meta"><strong>{item.name}</strong><span>{money(item.price)}</span></div>
              {(item.variants?.length || itemGroups(item).length) ? <small className="customizable">CUSTOMIZE</small> : null}
            </button>)}
            {!visibleItems.length && <div className="empty-menu">No products found.</div>}
          </div>
          {visibleItems.length > compactVisibleItems.length && <button type="button" className="menu-view-more" onClick={() => setMenuMoreOpen(true)}>VIEW MORE <span>+{visibleItems.length - compactVisibleItems.length} ITEMS</span></button>}
        </section>

        <aside className="cart-panel">
          <div className="cart-title"><div><small>ITEMS</small><h2>Current Order</h2>{currentOrder?.id && <span className={`cart-status ${String(currentOrder.status || "pending").toLowerCase()}`}>{String(currentOrder.status || "pending").toUpperCase()}</span>}</div><div className="cart-title-actions"><span>{cartCount}</span>{currentOrder?.id && String(currentOrder.status || "pending").toLowerCase() !== "done" && <>{String(currentOrder.status || "pending").toLowerCase() !== "preparing" && <button onClick={() => updateKitchenStatus(currentOrder, "preparing")} disabled={!!kitchenUpdating}>PREPARE</button>}<button className="done-mini" onClick={() => updateKitchenStatus(currentOrder, "done")} disabled={!!kitchenUpdating}>MARK DONE</button></>}</div></div>
          <div className="cart-list">
            {cart.slice(0, 3).map(item => <div className="cart-item" key={item.cartKey}>
              <div className="cart-thumb">{item.image ? <img src={item.image} alt="" /> : <span>🍽️</span>}</div>
              <div className="cart-info"><strong>{item.name}{item.variant_name ? ` • ${item.variant_name}` : ""}</strong>{item.selectedModifiers?.length ? <small>{item.selectedModifiers.map(m => m.name).join(", ")}</small> : null}<span>{money(Number(item.price || 0) + Number(item.modifierTotal || 0))}</span></div>
              <div className="qty"><button onClick={() => updateQty(item.cartKey, -1)}>−</button><b>{item.qty}</b><button onClick={() => updateQty(item.cartKey, 1)}>+</button></div>
              <button className="delete" onClick={() => removeItem(item.cartKey)}>×</button>
            </div>)}
            {!cart.length && <div className="empty-cart">Add products from the menu.<br /><span>Tap a product photo/card to add it.</span></div>}
            {cart.length > 3 && <button type="button" className="cart-view-more" onClick={() => setCartMoreOpen(true)}>VIEW MORE <span>+{cart.length - 3} ITEMS</span></button>}
          </div>

          {type === "delivery" && <div className="delivery-mini"><select value={deliveryZone} onChange={e => { const z = deliveryZones.find(x => x.name === e.target.value); setDeliveryZone(e.target.value); setDeliveryCharge(Number(z?.charge || 0)) }}><option value="">Delivery zone</option>{deliveryZones.map(z => <option key={z.id} value={z.name}>{z.name} — {money(z.charge)}</option>)}</select><span>Delivery {money(deliveryCharge)}</span></div>}

          {(offerDiscounts.length > 0 || manualDiscount > 0) && <div className="offer-box"><div className="offer-head"><span>OFFERS & DISCOUNTS</span><b>{activeOffer ? `-${money(offerDiscount)}` : ""}</b></div>{offerDiscounts.length > 0 && <select value={activeOffer?.id || ""} onChange={e => setSelectedOfferId(e.target.value)}><option value="">Select offer</option>{offerDiscounts.map(o => <option key={o.id} value={o.id}>{o.title || o.name || "Offer"} • -{money(o.calculated_discount)}</option>)}</select>}<div className="offer-chips">{activeOffer && <span>🏷 {activeOffer.title || activeOffer.name || "Offer"} -{money(offerDiscount)}</span>}{manualDiscount > 0 && <span>Manual -{money(manualDiscount)}</span>}</div></div>}

          <div className="bill-summary">
            <div><span>Subtotal</span><b>{money(subtotal)}</b></div>
            <div className="discount-line"><span>Discount</span><div><button className={discountMode === "amount" ? "mini active" : "mini"} onClick={() => setDiscountMode("amount")}>₹</button><button className={discountMode === "percent" ? "mini active" : "mini"} onClick={() => setDiscountMode("percent")}>%</button><input value={normalizeInputValue(discountValue)} onChange={e => setDiscountValue(e.target.value)} placeholder="0" /></div><b>-{money(discount)}</b></div>
            <div><span>Tax {restaurant?.gst_enabled ? `(${restaurant?.gst_rate || 0}%)` : ""}</span><b>{money(gst)}</b></div>
            {type === "delivery" && <div><span>Delivery</span><b>{money(deliveryCharge)}</b></div>}
            <div className="grand"><span>Total</span><b>{money(total)}</b></div>
          </div>

          {screen === "bill" && <div className="inline-bill-box">
            <div className="inline-bill-head"><div><small>PAYMENT</small><strong>Finalize Bill</strong></div><span>{sourceLabel}</span></div>
            <div className="payment-row">
              <label>Method<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="online">Online</option></select></label>
              <label>Reference<input value={normalizeInputValue(paymentReference)} onChange={e => setPaymentReference(e.target.value)} placeholder="Optional" /></label>
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
      </main>}

      {cartMoreOpen && <div className="modal-backdrop menu-more-backdrop" onClick={() => setCartMoreOpen(false)}><div className="modal menu-more-modal cart-more-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><div><small>CURRENT ORDER</small><h2>All Cart Items</h2><span className="menu-more-count">{cartCount} items</span></div><button type="button" onClick={() => setCartMoreOpen(false)}>×</button></div>
        <div className="cart-more-list">{cart.map(item => <div className="cart-item" key={`more-cart-${item.cartKey}`}>
          <div className="cart-thumb">{item.image ? <img src={item.image} alt="" /> : <span>🍽️</span>}</div>
          <div className="cart-info"><strong>{item.name}{item.variant_name ? ` • ${item.variant_name}` : ""}</strong>{item.selectedModifiers?.length ? <small>{item.selectedModifiers.map(m => m.name).join(", ")}</small> : null}<span>{money(Number(item.price || 0) + Number(item.modifierTotal || 0))}</span></div>
          <div className="qty"><button onClick={() => updateQty(item.cartKey, -1)}>−</button><b>{item.qty}</b><button onClick={() => updateQty(item.cartKey, 1)}>+</button></div>
          <button className="delete" onClick={() => removeItem(item.cartKey)}>×</button>
        </div>)}</div>
      </div></div>}

      {menuMoreOpen && <div className="modal-backdrop menu-more-backdrop" onClick={() => setMenuMoreOpen(false)}><div className="modal menu-more-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><div><small>MENU</small><h2>{activeCategory === "All" ? "All Menu Items" : activeCategory}</h2><span className="menu-more-count">{visibleItems.length} items</span></div><button type="button" onClick={() => setMenuMoreOpen(false)}>×</button></div>
        <div className="menu-more-grid">{visibleItems.map(item => <button className="product-card" key={`more-${item.id}`} onClick={() => { setMenuMoreOpen(false); addToCart(item) }}>
          <div className="product-photo">{item.image ? <img src={item.image} alt={item.name} loading="lazy" /> : <div className="photo-fallback">🍽️</div>}</div>
          <div className="product-meta"><strong>{item.name}</strong><span>{money(item.price)}</span></div>
          {(item.variants?.length || itemGroups(item).length) ? <small className="customizable">CUSTOMIZE</small> : null}
        </button>)}</div>
      </div></div>}

      {deliveryPopupOpen && activeDelivery && <div className="modal-backdrop delivery-flow-backdrop" onClick={() => setDeliveryPopupOpen(false)}><div className="modal delivery-flow-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><div><small>DELIVERY WORKFLOW • ORDER PAGE</small><h2>{activeDelivery.slip_no ? `Delivery ${activeDelivery.slip_no}` : "Delivery Order"}</h2></div><button onClick={() => setDeliveryPopupOpen(false)}>×</button></div>
        <div className="delivery-flow-customer"><div><b>{activeDelivery.customer_name || customerName || "Customer"}</b><span>{activeDelivery.phone || customerPhone || "No phone"}</span></div><div><b>{money(activeDelivery.collection_expected ?? activeDelivery.expected_amount)}</b><span>{activeDelivery.address || deliveryAddress || "No address"}</span></div></div>
        <div className="delivery-steps">{[["pending","ORDER"],["assigned","ASSIGNED"],["out_for_delivery","OUT FOR DELIVERY"],["delivered","DELIVERED"],["settled","SETTLED"]].map(([key,label], idx) => { const status = String(activeDelivery.status || "pending").toLowerCase(); const order = ["pending","assigned","out_for_delivery","delivered","settled"]; const current = order.indexOf(status); const done = idx <= current; return <div key={key} className={`delivery-step ${done ? "done" : ""} ${status === key ? "current" : ""}`}><span>{done ? "✓" : idx + 1}</span><b>{label}</b></div> })}</div>
        <div className="delivery-flow-body">
          <div className="delivery-slip-action-bar"><button className="save" onClick={() => requestDeliverySlipPrint(activeDelivery)} disabled={!!deliveryAction}>🖨 PRINT DELIVERY SLIP</button><span>Prints the saved Supabase delivery slip.</span></div>
          {String(activeDelivery.status || "pending").toLowerCase() === "pending" && <div className="delivery-action-card"><h3>Assign Delivery Person</h3><div className="delivery-choice"><button className={deliveryPersonType === "rider" ? "active" : ""} onClick={() => setDeliveryPersonType("rider")}>RIDER</button><button className={deliveryPersonType === "owner" ? "active" : ""} onClick={() => setDeliveryPersonType("owner")}>OWNER / SELF</button></div>{deliveryPersonType === "rider" ? <select value={normalizeInputValue(deliveryRiderId)} onChange={e => setDeliveryRiderId(e.target.value)}><option value="">Select rider</option>{deliveryRiders.filter(r => r.active !== false).map(r => <option key={r.id} value={r.id}>{r.name}{r.phone ? ` • ${r.phone}` : ""}</option>)}</select> : <div className="delivery-owner-fields"><input value={normalizeInputValue(deliveryOwnerName)} onChange={e => setDeliveryOwnerName(e.target.value)} placeholder="Owner name"/><input value={normalizeInputValue(deliveryOwnerPhone)} onChange={e => setDeliveryOwnerPhone(e.target.value)} placeholder="Phone" inputMode="tel"/></div>}<button className="delivery-main-action" onClick={assignActiveDelivery} disabled={!!deliveryAction}>{deliveryAction === "assign" ? "ASSIGNING…" : "ASSIGN & CONTINUE"}</button></div>}
          {String(activeDelivery.status || "pending").toLowerCase() === "assigned" && <div className="delivery-action-card"><h3>Rider Assigned</h3><p>{activeDelivery.delivery_person_name || activeDelivery.rider_name || "Delivery person"}{activeDelivery.delivery_person_phone ? ` • ${activeDelivery.delivery_person_phone}` : ""}</p><button className="delivery-main-action" onClick={() => advanceActiveDelivery("out_for_delivery")} disabled={!!deliveryAction}>{deliveryAction === "status" ? "UPDATING…" : "OUT FOR DELIVERY"}</button></div>}
          {String(activeDelivery.status || "pending").toLowerCase() === "out_for_delivery" && <div className="delivery-action-card"><h3>Delivery In Progress</h3><p>Rider has left the restaurant. Keep this delivery visible here until it is delivered and settled.</p><button className="delivery-main-action" onClick={() => advanceActiveDelivery("delivered")} disabled={!!deliveryAction}>{deliveryAction === "status" ? "UPDATING…" : "MARK DELIVERED"}</button></div>}
          {String(activeDelivery.status || "pending").toLowerCase() === "delivered" && String(activeDelivery.settlement_status || "pending").toLowerCase() !== "settled" && <div className="delivery-action-card"><h3>Delivery Delivered • Settlement Pending</h3><div className="delivery-amount-grid"><label>Cash<input value={normalizeInputValue(deliveryCash)} onChange={e => setDeliveryCash(e.target.value)} inputMode="decimal" placeholder="0"/></label><label>UPI<input value={normalizeInputValue(deliveryUpi)} onChange={e => setDeliveryUpi(e.target.value)} inputMode="decimal" placeholder="0"/></label><label>Card<input value={normalizeInputValue(deliveryCard)} onChange={e => setDeliveryCard(e.target.value)} inputMode="decimal" placeholder="0"/></label></div><div className="delivery-settle-total"><span>Expected</span><b>{money(activeDelivery.collection_expected ?? activeDelivery.expected_amount)}</b><span>Collected</span><b>{money(Number(deliveryCash || 0) + Number(deliveryUpi || 0) + Number(deliveryCard || 0))}</b></div><input value={normalizeInputValue(deliveryNote)} onChange={e => setDeliveryNote(e.target.value)} placeholder="Settlement note (optional)"/><button className="delivery-main-action" onClick={settleActiveDelivery} disabled={!!deliveryAction}>{deliveryAction === "settle" ? "SETTLING…" : "SETTLE PAYMENT"}</button></div>}
          {String(activeDelivery.settlement_status || "pending").toLowerCase() === "settled" && <div className="delivery-action-card"><h3>✓ Delivered & Settled</h3><p>Delivery collection is settled. Complete the delivery order now to move it into the same-page Billing / Finalize flow.</p><div className="delivery-settle-total"><span>Collected</span><b>{money(activeDelivery.collection_received ?? activeDelivery.collection_expected ?? activeDelivery.expected_amount)}</b><span>Difference</span><b>{money(activeDelivery.settlement_difference ?? activeDelivery.collection_difference ?? 0)}</b></div><button className="delivery-main-action" onClick={completeActiveDelivery} disabled={!!deliveryAction}>{deliveryAction === "complete" ? "COMPLETING…" : "MARK DONE & OPEN BILL"}</button></div>}
        </div>
        <div className="delivery-flow-footer"><button className="kot-action" onClick={() => { setDeliveryPopupOpen(false); setPosView("order") }}>KEEP ON ORDER PAGE</button><span>Delivery popup stays active through Delivered + Settled. After Mark Done, billing opens here.</span></div>
      </div></div>}

      {activeDelivery && String(activeDelivery.settlement_status || "pending").toLowerCase() === "settled" && currentOrder?.id === activeDelivery.order_id && !finalizedBill && <div className="delivery-settled-banner"><div><small>DELIVERY SETTLED</small><strong>{activeDelivery.slip_no || "Delivery"} • Ready for final billing</strong></div><button className="finalize" onClick={completeActiveDelivery} disabled={!!deliveryAction}>{deliveryAction === "complete" ? "UPDATING…" : "MARK DONE & OPEN BILL"}</button></div>}

      {deliveryPrintPrompt && <div className="modal-backdrop" onClick={() => setDeliveryPrintPrompt(null)}><div className="modal printer-prompt" onClick={e => e.stopPropagation()}><div className="modal-head"><div><small>DELIVERY PRINTING</small><h2>{deliveryPrintPrompt.title}</h2></div><button onClick={() => setDeliveryPrintPrompt(null)}>×</button></div><p className="printer-prompt-text">{deliveryPrintPrompt.message}</p><div className="printer-prompt-actions">{deliveryPrintPrompt.jobId && deliveryPrintPrompt.type !== "success" && <button className="save" onClick={() => printQueuedDeliverySlip(deliveryPrintPrompt.jobId, deliveryPrintPrompt.content)} disabled={printerConnecting}>{printerConnecting ? "PRINTING…" : "🖨 PRINT DELIVERY SLIP"}</button>}<button className="finalize" onClick={() => setDeliveryPrintPrompt(null)}>CLOSE</button></div></div></div>}
      {printerPrompt && <div className="modal-backdrop" onClick={() => setPrinterPrompt(null)}><div className="modal printer-prompt" onClick={e => e.stopPropagation()}><div className="modal-head"><div><small>THERMAL PRINTING</small><h2>{printerPrompt.title}</h2></div><button onClick={() => setPrinterPrompt(null)}>×</button></div><p className="printer-prompt-text">{printerPrompt.message}</p>{typeof window !== "undefined" && <div className="local-printer-box"><div className="local-printer-head"><strong>WINDOWS MPT-III / COM</strong><button className="mini" onClick={refreshLocalPrinters} disabled={localPrinterLoading}>{localPrinterLoading ? "…" : "↻"}</button></div>{localPrinters.length ? <><select value={selectedLocalPort} onChange={e => setSelectedLocalPort(e.target.value)}>{localPrinters.map(p => <option key={p.port} value={p.port}>{p.port} — {p.name || p.description || "Serial/Bluetooth"}</option>)}</select><small>Pair MPT-III in Windows Bluetooth. The correct entry normally appears under Device Manager → Ports (COM & LPT) as a Bluetooth/Serial COM port.</small></> : <><div className="local-empty">No COM printer port detected yet.</div><small>Click ↻ to scan again. Pair MPT-III in Windows Bluetooth first and confirm a Standard Serial over Bluetooth Link COM port exists in Device Manager → Ports (COM & LPT).</small></>}<div className="local-printer-actions"><button className="save" onClick={connectSelectedLocalPrinter} disabled={printerConnecting || !selectedLocalPort}>{printerConnecting ? "CONNECTING…" : "CONNECT MPT-III"}</button><button className="kot-action" onClick={testSelectedLocalPrinter} disabled={printerConnecting || !selectedLocalPort}>TEST PRINT</button></div></div>}{<div className="printer-prompt-actions">{printerPrompt?.allowBle && <button className="save" onClick={connectWebBluetoothFromUserGesture} disabled={printerConnecting}>{printerConnecting ? "CONNECTING…" : "CONNECT BLUETOOTH (BLE)"}</button>}{printerPrompt.native && <button className="kot-action" onClick={async () => { try { await openNativeBluetoothSettings() } catch (e) { alert(e.message) } }}>OPEN BLUETOOTH SETTINGS</button>}<button className="finalize" onClick={() => setPrinterPrompt(null)}>CLOSE</button></div>}</div></div>}

      {newKitchenOrder && <div className="modal-backdrop kitchen-alert-backdrop" onClick={() => setNewKitchenOrder(null)}><div className="modal kitchen-alert" onClick={e => e.stopPropagation()}><div className="modal-head"><div><small>NEW KITCHEN ORDER</small><h2>{newKitchenOrder.display || "New Order"}</h2></div><button onClick={() => setNewKitchenOrder(null)}>×</button></div><div className="new-order-summary">{(newKitchenOrder.items || []).map((i, idx) => <div key={idx}><span>{i.quantity || i.qty || 1}× {i.name || i.item_name}</span><b>{money(i.line_total ?? ((i.quantity || i.qty || 1) * Number(i.unit_price || 0)))}</b></div>)}</div><div className="new-order-actions"><button className="save" onClick={() => { openKitchenOrder(newKitchenOrder); updateKitchenStatus(newKitchenOrder, "preparing") }}>PREPARE</button><button className="done-popup" onClick={() => { openKitchenOrder(newKitchenOrder); updateKitchenStatus(newKitchenOrder, "done") }}>MARK DONE</button><button className="finalize" onClick={() => openKitchenOrder(newKitchenOrder)}>OPEN ORDER</button></div></div></div>}

      {variantItem && <div className="modal-backdrop" onClick={() => { setVariantItem(null); setVariantQuantities({}) }}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div><small>SELECT VARIANT</small><h2>{variantItem.name}</h2></div><button onClick={() => { setVariantItem(null); setVariantQuantities({}) }}>×</button></div>{variantItem.variants.map(v => <div className="variant-row" key={v.id}><span>{v.name}<small>{money(Number(variantItem.price || 0) + Number(v.price_delta || 0))}</small></span><div><button onClick={() => setVariantQuantities(p => ({ ...p, [v.id]: Math.max(0, Number(p[v.id] || 0) - 1) }))}>−</button><b>{variantQuantities[v.id] || 0}</b><button onClick={() => setVariantQuantities(p => ({ ...p, [v.id]: Number(p[v.id] || 0) + 1 }))}>+</button></div></div>)}<button className="modal-primary" onClick={continueVariants}>CONTINUE</button></div></div>}

      {modifierItem && <div className="modal-backdrop" onClick={() => setModifierItem(null)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div><small>CUSTOMIZE ITEM</small><h2>{modifierItem.name}</h2></div><button onClick={() => setModifierItem(null)}>×</button></div>{itemGroups(modifierItem).map(group => <div key={group.id} className="modifier-group"><div><b>{group.name}</b><small>{group.required ? "Required" : "Optional"}</small></div>{modifiers.filter(m => m.group_id === group.id).map(mod => { const chosen = (modifierSelection[group.id] || []).some(x => x.id === mod.id); return <button className={chosen ? "modifier active" : "modifier"} key={mod.id} onClick={() => toggleModifier(group, mod)}><span>{chosen ? "✓" : "○"} {mod.name}</span><b>+{money(mod.price)}</b></button> })}</div>)}<button className="modal-primary" onClick={confirmModifiers}>ADD TO ORDER</button></div></div>}

      <style jsx global>{`
        *{box-sizing:border-box}
        .floor-dashboard,.running-dashboard,.billing-dashboard{padding:20px 22px;background:var(--background);min-height:calc(100vh - 106px)}
        .billing-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}.billing-card{border:1px solid rgba(var(--primary-rgb),.15);background:var(--surface);border-radius:12px;padding:13px;box-shadow:0 8px 24px rgba(0,0,0,.12)}.billing-card-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.billing-card-top>div{display:flex;flex-direction:column;gap:3px}.billing-card-top strong{font-size:11px}.billing-card-top span{font-size:7px;color:rgba(255,255,255,.48)}.billing-payment{font-size:7px;padding:4px 6px;border-radius:5px;background:rgba(var(--primary-rgb),.1);color:var(--primary)}.billing-payment.partial{color:#f59e0b}.billing-card-items{display:flex;flex-direction:column;gap:4px;margin:12px 0;color:rgba(255,255,255,.62);font-size:8px}.billing-customer-highlight{display:flex;flex-wrap:wrap;gap:5px 10px;margin:8px 0;padding:7px 8px;border:1px solid rgba(var(--primary-rgb),.24);background:rgba(var(--primary-rgb),.055);border-radius:7px;font-size:7px}.billing-customer-highlight b{color:var(--text)}.billing-customer-highlight span{color:var(--primary);font-weight:800}.billing-card-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid rgba(var(--primary-rgb),.1);padding-top:10px}.billing-card-bottom strong{font-size:15px;color:var(--primary)}.billing-card-bottom button{border:0;border-radius:7px;padding:8px 10px;font-size:8px;font-weight:900;cursor:pointer}
        .floor-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:16px}.floor-head small{font-size:8px;letter-spacing:1.4px;font-weight:900;color:var(--primary)}.floor-head h1{margin:4px 0 5px;font-size:24px}.floor-head p{margin:0;color:rgba(255,255,255,.55);font-size:11px}.floor-actions{display:flex;gap:7px;flex-wrap:wrap}.floor-type,.floor-primary{border:1px solid rgba(var(--primary-rgb),.2);background:rgba(var(--primary-rgb),.06);color:var(--text);border-radius:8px;padding:9px 12px;font-size:9px;font-weight:900;cursor:pointer}.floor-type.active,.floor-primary{background:var(--primary);color:#111827;border-color:var(--primary)}.pos-floor-tabs{display:flex;gap:8px;overflow-x:auto;padding:0 0 12px;scrollbar-width:none}.pos-floor-tabs::-webkit-scrollbar{display:none}.pos-floor-tabs button{flex:0 0 auto;padding:10px 14px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--muted);font-size:12px;font-weight:900;cursor:pointer}.pos-floor-tabs button.active{background:var(--primary);border-color:var(--primary);color:#fff}.floor-legend{display:flex;gap:16px;margin-bottom:14px;flex-wrap:wrap}.floor-legend span{font-size:8px;font-weight:900;color:rgba(255,255,255,.52);display:flex;align-items:center;gap:5px}.dot{width:8px;height:8px;border-radius:50%;display:inline-block;background:#64748b}.dot.free{background:#4ade80}.dot.occupied{background:#f59e0b}.dot.preparing{background:#ef4444}.table-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}.floor-table{min-height:120px;text-align:left;border:1px solid rgba(var(--primary-rgb),.14);background:var(--surface);color:var(--text);border-radius:12px;padding:14px;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 8px 24px rgba(0,0,0,.12)}.floor-table:hover{transform:translateY(-1px);border-color:var(--primary)}.floor-table .table-no{font-size:10px;font-weight:900;letter-spacing:.5px}.floor-table strong{font-size:15px}.floor-table small{font-size:8px;color:rgba(255,255,255,.5)}.floor-table.free strong{color:#4ade80}.floor-table.occupied strong{color:#fbbf24}.floor-table.bill-due{border-color:rgba(var(--primary-rgb),.45);background:linear-gradient(145deg,rgba(var(--primary-rgb),.10),var(--surface))}.floor-table.bill-due strong{color:var(--primary)}.floor-table.preparing{border-color:rgba(239,68,68,.5)}.floor-empty{padding:35px;text-align:center;color:rgba(255,255,255,.45);font-size:11px;border:1px dashed rgba(var(--primary-rgb),.18);border-radius:10px;grid-column:1/-1}.running-section-label{display:flex;align-items:center;gap:8px;margin:2px 0 8px;color:rgba(255,255,255,.52);font-size:8px;font-weight:900;letter-spacing:1px}.running-section-label b{display:inline-grid;place-items:center;min-width:20px;height:20px;border-radius:10px;background:rgba(var(--primary-rgb),.10);color:var(--primary);font-size:8px}.bill-due-label{margin-top:18px}.billing-due-grid .bill-due-card{border-color:rgba(var(--primary-rgb),.30);background:linear-gradient(145deg,rgba(var(--primary-rgb),.08),var(--surface))}.bill-due-card b{color:var(--primary)}
        .running-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}.running-card{border:1px solid rgba(var(--primary-rgb),.14);background:var(--surface);color:var(--text);border-radius:11px;padding:13px;text-align:left;cursor:pointer}.running-card:hover{border-color:var(--primary)}.running-card>div{display:flex;justify-content:space-between;gap:8px;align-items:center}.running-card strong{font-size:12px}.running-card p{font-size:9px;color:rgba(255,255,255,.5);line-height:1.5;min-height:28px}.running-card>b{font-size:13px;color:var(--primary)}.running-status{font-size:7px;font-weight:900;padding:4px 6px;border-radius:5px;background:rgba(var(--primary-rgb),.09);color:var(--primary)}.running-status.preparing{color:#fbbf24}.running-status.done{color:#4ade80}.order-flow-crumb{display:flex;align-items:center;gap:9px;padding:7px 14px;background:var(--surface);border-bottom:1px solid rgba(var(--primary-rgb),.12);font-size:7px;font-weight:900;color:rgba(255,255,255,.4);overflow:auto;white-space:nowrap}.order-flow-crumb button{border:1px solid rgba(var(--primary-rgb),.16);background:rgba(var(--primary-rgb),.05);color:var(--primary);border-radius:5px;padding:5px 7px;font-size:7px;font-weight:900;cursor:pointer}.order-flow-crumb b{color:var(--text)}
         .anaira-pos{height:100dvh;min-height:0;overflow:hidden;background:var(--background);color:var(--text);font-family:Inter,Arial,sans-serif}
        .pos-navigation-drawer-layer{position:fixed;inset:0;z-index:10050;pointer-events:none}.pos-navigation-drawer-backdrop{position:absolute;inset:0;width:100%;height:100%;border:0;background:rgba(2,6,23,.58);backdrop-filter:blur(2px);cursor:pointer;pointer-events:auto}.pos-navigation-drawer-layer .pos-sidebar{pointer-events:auto}
        .pos-menu-btn{height:38px;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:0 12px;border:1px solid rgba(var(--primary-rgb),.25);border-radius:9px;background:rgba(var(--primary-rgb),.08);color:var(--primary);font-size:11px;font-weight:900;cursor:pointer;white-space:nowrap}.pos-menu-btn:hover{background:rgba(var(--primary-rgb),.14)}
        .pos-topbar{height:48px;min-height:48px;background:var(--surface);border-bottom:1px solid rgba(var(--primary-rgb),.16);display:flex;align-items:center;gap:16px;padding:0 18px;position:sticky;top:0;z-index:20;box-shadow:0 4px 20px rgba(0,0,0,.18)}
        .back-btn{border:1px solid rgba(var(--primary-rgb),.25);background:rgba(var(--primary-rgb),.07);font-weight:800;color:var(--text);font-size:13px;cursor:pointer;border-radius:10px;padding:8px 12px}.back-btn:hover{background:rgba(var(--primary-rgb),.15)}
        .brand-block{display:flex;align-items:baseline;gap:12px;min-width:0}.brand-block strong{font-size:17px;color:var(--primary)}.brand-block span{font-size:11px;color:rgba(255,255,255,.62)}
        .top-actions{margin-left:auto;display:flex;align-items:center;gap:10px}.top-actions button{border:1px solid rgba(var(--primary-rgb),.35);background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 60%,var(--accent)));color:#111827;border-radius:9px;padding:8px 12px;font-size:10px;font-weight:900;cursor:pointer}.live-pill{font-size:9px;color:var(--accent);font-weight:900}
        .order-mode-bar{height:48px;background:var(--surface-2);border-bottom:1px solid rgba(var(--primary-rgb),.14);display:flex;padding-left:18px;align-items:stretch;gap:3px}.mode{border:0;background:transparent;color:rgba(255,255,255,.62);padding:0 24px;font-size:11px;font-weight:900;cursor:pointer;border-bottom:3px solid transparent}.mode:hover{color:var(--text);background:rgba(var(--primary-rgb),.05)}.mode.active{color:#111827;background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 65%,var(--accent)));border-bottom-color:var(--primary)}.bill-mode-label{margin-left:auto;align-self:center;margin-right:18px;font-size:9px;font-weight:900;color:var(--primary)}
        .kitchen-strip{background:var(--surface);border-bottom:1px solid rgba(var(--primary-rgb),.15);padding:5px 10px;max-height:92px;overflow:hidden}.kitchen-strip-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}.kitchen-strip-head>div{display:flex;flex-direction:column;gap:2px}.kitchen-strip-head small{font-size:7px;font-weight:900;color:rgba(255,255,255,.42);letter-spacing:1px}.kitchen-strip-head strong{font-size:10px;color:var(--text)}.kitchen-strip-head button{border:1px solid rgba(var(--primary-rgb),.2);background:rgba(var(--primary-rgb),.06);color:var(--primary);border-radius:6px;padding:6px 9px;font-size:8px;font-weight:900;cursor:pointer}.kitchen-order-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px;max-height:58px;overflow:hidden}.kitchen-card{border:1px solid rgba(var(--primary-rgb),.14);background:var(--surface-2);border-radius:8px;padding:7px;display:flex;gap:7px;align-items:stretch}.kitchen-card.current{border-color:var(--primary);box-shadow:0 0 0 1px rgba(var(--primary-rgb),.12)}.kitchen-card-main{flex:1;min-width:0;border:0;background:transparent;color:var(--text);text-align:left;padding:0;cursor:pointer}.kitchen-card-top{display:flex;justify-content:space-between;gap:5px;align-items:center}.kitchen-card-top strong{font-size:10px}.k-status{font-size:6px;font-weight:900;padding:3px 5px;border-radius:4px;background:rgba(var(--primary-rgb),.10);color:var(--primary)}.k-status.preparing{color:#fbbf24;background:rgba(251,191,36,.10)}.k-status.done{color:#4ade80}.kitchen-card-items{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}.kitchen-card-items span{font-size:7px;color:rgba(255,255,255,.55)}.kitchen-card-total{margin-top:5px;font-size:8px;font-weight:900;color:var(--primary)}.kitchen-actions{display:flex;flex-direction:column;gap:4px;justify-content:center}.kitchen-actions button{border:1px solid rgba(var(--primary-rgb),.18);background:rgba(var(--primary-rgb),.06);color:var(--text);border-radius:5px;padding:5px 7px;font-size:7px;font-weight:900;cursor:pointer}.kitchen-actions button:hover{border-color:var(--primary)}.kitchen-actions .done-btn{background:rgba(74,222,128,.10);border-color:rgba(74,222,128,.25);color:#4ade80}.kitchen-toggle{border:1px solid rgba(var(--primary-rgb),.18)!important;background:rgba(var(--primary-rgb),.05)!important;color:rgba(255,255,255,.65)!important;margin-left:8px!important;padding:0 14px!important;font-size:9px!important}.kitchen-toggle.active{color:var(--primary)!important;border-color:rgba(var(--primary-rgb),.35)!important;background:rgba(var(--primary-rgb),.10)!important}.new-order-summary{border:1px solid rgba(var(--primary-rgb),.14);border-radius:8px;padding:8px;background:var(--surface-2)}.new-order-summary>div{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:10px}.new-order-summary>div:last-child{border-bottom:0}.new-order-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}.new-order-actions .done-popup{background:rgba(74,222,128,.10);color:#4ade80;border:1px solid rgba(74,222,128,.25)}.new-order-actions button{border-radius:7px;padding:10px;border:0;font-size:9px;font-weight:900;cursor:pointer}.kitchen-alert{width:min(430px,100%)}
.pos-info-row{display:grid;max-height:52px;grid-template-columns:190px 1fr 180px 1.5fr;gap:8px;padding:9px 14px;background:var(--background);border-bottom:1px solid rgba(var(--primary-rgb),.12)}.info-cell{background:var(--surface);border:1px solid rgba(var(--primary-rgb),.14);border-radius:9px;padding:6px 9px;display:flex;align-items:center;gap:8px;min-width:0;box-shadow:0 3px 14px rgba(0,0,0,.12)}.info-cell label{font-size:8px;color:rgba(255,255,255,.52);font-weight:800;white-space:nowrap}.info-cell input,.info-cell select{border:0;outline:0;width:100%;font-size:11px;background:transparent;color:var(--text);min-width:0}.info-cell select option{background:var(--surface);color:var(--text)}.info-cell strong{font-size:11px;color:var(--primary)}
        .pos-grid{display:grid;grid-template-columns:150px minmax(0,1fr) 340px;height:calc(100dvh - 250px);min-height:0;gap:0}.category-panel{background:var(--surface);border-right:1px solid rgba(var(--primary-rgb),.14);padding:12px 8px;overflow:auto}.panel-title{font-size:9px;font-weight:900;color:rgba(255,255,255,.48);padding:5px 8px 10px;letter-spacing:1px}.category{width:100%;border:1px solid transparent;background:transparent;text-align:left;padding:11px 10px;border-radius:9px;display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:800;color:rgba(255,255,255,.78);cursor:pointer;margin-bottom:3px}.category span{font-size:8px;background:rgba(var(--primary-rgb),.10);border-radius:10px;padding:3px 6px;color:rgba(255,255,255,.55)}.category:hover{background:rgba(var(--primary-rgb),.07);border-color:rgba(var(--primary-rgb),.12)}.category.active{background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 62%,var(--accent)));color:#111827;border-color:var(--primary);box-shadow:0 4px 16px rgba(var(--primary-rgb),.18)}.category.active span{background:rgba(0,0,0,.12);color:#111827}
        .menu-panel{padding:9px;background:var(--background);min-width:0;overflow:hidden}.menu-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:11px}.menu-toolbar small,.cart-title small,.modal-head small,.inline-bill-head small{font-size:8px;font-weight:900;color:rgba(255,255,255,.45);letter-spacing:1px}.menu-toolbar h1,.cart-title h2{margin:2px 0 0;font-size:17px;color:var(--text)}.menu-toolbar input{width:250px;border:1px solid rgba(var(--primary-rgb),.16);background:var(--surface);color:var(--text);border-radius:9px;padding:10px 11px;outline:0;font-size:11px}.menu-toolbar input:focus{border-color:rgba(var(--primary-rgb),.55);box-shadow:0 0 0 3px rgba(var(--primary-rgb),.07)}
        .product-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:7px;min-height:0}.product-card{position:relative;border:1px solid rgba(var(--primary-rgb),.13);background:var(--surface);color:var(--text);border-radius:11px;padding:5px;text-align:left;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.16);transition:.15s;min-width:0}.product-card:hover{transform:translateY(-2px);border-color:rgba(var(--primary-rgb),.55);box-shadow:0 8px 22px rgba(var(--primary-rgb),.10)}.product-photo{width:100%;aspect-ratio:1/.54;border-radius:8px;overflow:hidden;background:linear-gradient(145deg,var(--surface-2),var(--surface));border:1px solid rgba(var(--primary-rgb),.10)}.product-photo img{width:100%;height:100%;object-fit:cover;display:block}.photo-fallback{height:100%;display:grid;place-items:center;font-size:28px;color:var(--primary)}.product-meta{padding:4px 3px 1px;display:flex;flex-direction:column;gap:3px}.product-meta strong{font-size:9px;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.product-meta span{font-size:9px;font-weight:900;color:var(--primary)}.customizable{position:absolute;right:6px;top:6px;background:var(--surface);border:1px solid rgba(var(--primary-rgb),.35);border-radius:5px;padding:3px 5px;font-size:6px;font-weight:900;color:var(--primary);box-shadow:0 2px 8px rgba(0,0,0,.25)}.empty-menu,.empty-cart{padding:50px 10px;text-align:center;color:rgba(255,255,255,.42);font-size:11px}.empty-cart span{font-size:9px}
        .cart-panel{background:var(--surface);border-left:1px solid rgba(var(--primary-rgb),.16);display:flex;flex-direction:column;min-width:0}.cart-title{padding:10px 12px;border-bottom:1px solid rgba(var(--primary-rgb),.13);display:flex;justify-content:space-between;align-items:center}.cart-status{display:block!important;margin-top:3px;font-size:7px!important;color:var(--primary)!important;font-weight:900!important;letter-spacing:.6px}.cart-status.preparing{color:#fbbf24!important}.cart-status.done{color:#4ade80!important}.cart-title-actions{display:flex;align-items:center;gap:5px}.cart-title-actions>span{background:rgba(var(--primary-rgb),.12);color:var(--primary);border:1px solid rgba(var(--primary-rgb),.18);border-radius:12px;padding:4px 7px;font-size:9px;font-weight:900}.cart-title-actions button{border:1px solid rgba(var(--primary-rgb),.18);background:rgba(var(--primary-rgb),.06);color:var(--primary);border-radius:5px;padding:5px 6px;font-size:6px;font-weight:900;cursor:pointer}.cart-title-actions .done-mini{color:#4ade80;border-color:rgba(74,222,128,.25);background:rgba(74,222,128,.08)}.cart-title>span{background:rgba(var(--primary-rgb),.12);color:var(--primary);border:1px solid rgba(var(--primary-rgb),.18);border-radius:12px;padding:4px 7px;font-size:9px;font-weight:900}.cart-list{padding:7px;overflow:hidden;flex:0 0 auto;min-height:0;max-height:168px}.cart-view-more{width:100%;margin:6px 0 0;border:1px solid rgba(var(--primary-rgb),.28);background:rgba(var(--primary-rgb),.08);color:var(--primary);border-radius:7px;padding:8px 10px;font-size:8px;font-weight:900;letter-spacing:.5px;cursor:pointer}.cart-view-more span{opacity:.65;margin-left:5px}.cart-more-list{overflow:auto;max-height:58dvh;padding:2px 2px 6px}.cart-item{display:grid;grid-template-columns:42px minmax(0,1fr) auto auto;gap:7px;align-items:center;padding:7px 4px;border-bottom:1px solid rgba(255,255,255,.06)}.cart-thumb{width:42px;height:42px;border-radius:7px;overflow:hidden;background:var(--surface-2);display:grid;place-items:center;color:var(--primary)}.cart-thumb img{width:100%;height:100%;object-fit:cover}.cart-info{min-width:0;display:flex;flex-direction:column;gap:2px}.cart-info strong{font-size:10px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cart-info small{font-size:8px;color:rgba(255,255,255,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cart-info span{font-size:9px;font-weight:900;color:var(--primary)}.qty{display:flex;align-items:center;gap:3px}.qty button,.delete{width:22px;height:22px;border:1px solid rgba(var(--primary-rgb),.20);background:rgba(var(--primary-rgb),.05);color:var(--text);border-radius:5px;cursor:pointer;font-weight:900}.qty button:hover{border-color:var(--primary)}.qty b{font-size:9px;min-width:14px;text-align:center}.delete{color:#f87171}.delivery-mini{padding:8px 10px;border-top:1px solid rgba(var(--primary-rgb),.12);display:flex;gap:8px;align-items:center}.delivery-mini select{flex:1;border:1px solid rgba(var(--primary-rgb),.18);background:var(--surface-2);color:var(--text);border-radius:6px;padding:7px;font-size:9px}.delivery-mini span{font-size:8px;font-weight:800;color:var(--primary)}
        .delivery-flow-backdrop{z-index:70}.delivery-flow-modal{width:min(650px,calc(100vw - 24px));max-width:650px}.delivery-flow-customer{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}.delivery-flow-customer>div{background:var(--surface-2);border:1px solid rgba(var(--primary-rgb),.14);border-radius:9px;padding:10px;display:flex;flex-direction:column;gap:4px}.delivery-flow-customer b{font-size:12px}.delivery-flow-customer span{font-size:9px;color:rgba(255,255,255,.52);line-height:1.4}.delivery-steps{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:14px}.delivery-step{display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;color:rgba(255,255,255,.32)}.delivery-step span{width:25px;height:25px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(255,255,255,.12);font-size:8px;font-weight:900}.delivery-step b{font-size:6px;line-height:1.2}.delivery-step.done{color:#4ade80}.delivery-step.done span{border-color:rgba(74,222,128,.35);background:rgba(74,222,128,.10)}.delivery-step.current{color:var(--primary)}.delivery-step.current span{border-color:var(--primary);box-shadow:0 0 0 3px rgba(var(--primary-rgb),.08)}.delivery-action-card{border:1px solid rgba(var(--primary-rgb),.18);background:var(--surface-2);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:9px}.delivery-action-card h3{margin:0;font-size:13px}.delivery-action-card p{margin:0;font-size:9px;color:rgba(255,255,255,.55);line-height:1.5}.delivery-action-card select,.delivery-action-card input{width:100%;box-sizing:border-box;border:1px solid rgba(var(--primary-rgb),.16);background:var(--surface);color:var(--text);border-radius:7px;padding:9px;font-size:9px;outline:0}.delivery-choice{display:grid;grid-template-columns:1fr 1fr;gap:6px}.delivery-choice button{border:1px solid rgba(var(--primary-rgb),.16);background:rgba(var(--primary-rgb),.05);color:var(--text);border-radius:7px;padding:8px;font-size:8px;font-weight:900;cursor:pointer}.delivery-choice button.active{background:var(--primary);color:#111827}.delivery-owner-fields{display:grid;grid-template-columns:1fr 1fr;gap:7px}.delivery-main-action{border:0;border-radius:8px;padding:11px;background:var(--primary);color:#111827;font-size:9px;font-weight:900;cursor:pointer}.delivery-main-action:disabled{opacity:.55;cursor:wait}.delivery-amount-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.delivery-amount-grid label{display:flex;flex-direction:column;gap:4px;font-size:8px;font-weight:800;color:rgba(255,255,255,.5)}.delivery-settle-total{display:grid;grid-template-columns:1fr auto 1fr auto;gap:8px;align-items:center;padding:8px;border-radius:7px;background:rgba(var(--primary-rgb),.05);font-size:8px}.delivery-settle-total b{font-size:11px;color:var(--primary)}.delivery-flow-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}.delivery-flow-footer span{font-size:7px;color:rgba(255,255,255,.4);text-align:right}.delivery-settled-banner{margin:10px 14px;padding:11px;border:1px solid rgba(74,222,128,.25);background:rgba(74,222,128,.07);border-radius:9px;display:flex;justify-content:space-between;align-items:center;gap:10px}.delivery-settled-banner>div{display:flex;flex-direction:column;gap:3px}.delivery-settled-banner small{font-size:7px;color:#4ade80;font-weight:900}.delivery-settled-banner strong{font-size:10px}.delivery-settled-banner button{border:0;border-radius:7px;padding:9px 11px;font-size:8px;font-weight:900;cursor:pointer}@media(max-width:800px){.delivery-flow-customer,.delivery-owner-fields{grid-template-columns:1fr}.delivery-steps{gap:2px}.delivery-step b{font-size:5px}.delivery-amount-grid{grid-template-columns:1fr}.delivery-flow-footer{flex-direction:column;align-items:stretch}.delivery-flow-footer span{text-align:center}.delivery-settled-banner{flex-direction:column;align-items:stretch}}
        .printer-prompt-text{margin:0 0 14px;padding:0 2px;color:rgba(255,255,255,.72);font-size:10px;line-height:1.55}.printer-prompt-actions{display:grid;grid-template-columns:1fr;gap:7px}.printer-prompt-actions button{min-height:38px}.printer-prompt{max-width:430px}
        .printer-btn{border:1px solid rgba(var(--primary-rgb),.22);background:rgba(var(--primary-rgb),.06);color:var(--primary);border-radius:7px;padding:8px 10px;font-size:8px;font-weight:900;cursor:pointer}.printer-btn:disabled{opacity:.5}.offer-box{margin:0 10px 8px;padding:8px 10px;border:1px solid rgba(var(--primary-rgb),.18);background:rgba(var(--primary-rgb),.045);border-radius:8px}.offer-head{display:flex;justify-content:space-between;font-size:8px;font-weight:900;color:var(--primary);margin-bottom:6px}.offer-box select{width:100%;border:1px solid rgba(var(--primary-rgb),.16);background:var(--surface-2);color:var(--text);border-radius:5px;padding:7px;font-size:9px}.offer-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.offer-chips span{padding:4px 6px;border-radius:5px;background:rgba(var(--accent-rgb),.09);color:var(--accent);font-size:7px;font-weight:800}.bill-summary{margin-top:auto;border-top:1px solid rgba(var(--primary-rgb),.13);padding:10px 12px}.bill-summary>div{display:flex;justify-content:space-between;align-items:center;margin:5px 0;font-size:9px;color:rgba(255,255,255,.70)}.bill-summary b{color:var(--text)}.bill-summary .discount-line>div{display:flex;align-items:center;gap:2px}.mini{border:1px solid rgba(var(--primary-rgb),.18);background:rgba(var(--primary-rgb),.05);color:var(--text);width:22px;height:22px;font-size:8px;font-weight:900;cursor:pointer}.mini.active{background:var(--primary);color:#111827;border-color:var(--primary)}.discount-line input{width:54px;height:22px;border:1px solid rgba(var(--primary-rgb),.18);background:var(--surface-2);color:var(--text);border-radius:4px;padding:3px;font-size:9px}.grand{margin:8px -12px -10px!important;padding:12px;background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 62%,var(--accent)));color:#111827!important;font-size:15px!important}.grand span,.grand b{color:#111827!important}.grand b{font-size:17px}
        .pos-buttons{display:grid;grid-template-columns:1fr 1fr 1.35fr;gap:7px;padding:10px 12px;background:var(--surface);border-top:1px solid rgba(var(--primary-rgb),.13)}.pos-buttons button{border:0;border-radius:8px;padding:11px 6px;font-size:9px;font-weight:900;cursor:pointer}.pos-buttons button:disabled{opacity:.45;cursor:not-allowed}.kot-action{background:rgba(var(--accent-rgb),.08);color:var(--accent);border:1px solid rgba(var(--accent-rgb),.20)!important}.kot-action:hover{filter:brightness(1.05)}.save{background:rgba(var(--primary-rgb),.13);color:var(--primary);border:1px solid rgba(var(--primary-rgb),.25)!important}.finalize{background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 62%,var(--accent)));color:#111827}.save:hover,.finalize:hover{filter:brightness(1.05)}
        .inline-bill-box{margin:0 10px 8px;padding:10px;position:relative;z-index:4;border:1px solid rgba(var(--primary-rgb),.20);background:linear-gradient(145deg,rgba(var(--primary-rgb),.07),rgba(var(--accent-rgb),.04));border-radius:9px}.inline-bill-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.inline-bill-head>div{display:flex;flex-direction:column;gap:2px}.inline-bill-head strong{font-size:12px;color:var(--text)}.inline-bill-head>span{font-size:8px;color:var(--primary);font-weight:900}.payment-row{display:grid;grid-template-columns:1fr 1fr;gap:6px}.payment-row label{display:flex;flex-direction:column;gap:3px;font-size:7px;color:rgba(255,255,255,.5);font-weight:900}.payment-row select,.payment-row input{width:100%;border:1px solid rgba(var(--primary-rgb),.16);background:var(--surface-2);color:var(--text);border-radius:5px;padding:7px;font-size:9px;outline:0}.payment-row select option{background:var(--surface);color:var(--text)}.payable-row{display:flex;justify-content:space-between;align-items:end;padding-top:9px}.payable-row span{font-size:7px;color:rgba(255,255,255,.45);font-weight:900}.payable-row strong{font-size:18px;color:var(--primary)}.print-bill-btn{width:100%;margin-top:8px;border:1px solid rgba(var(--primary-rgb),.28);background:rgba(var(--primary-rgb),.09);color:var(--primary);border-radius:6px;padding:8px;font-size:8px;font-weight:900}.print-bill-btn:disabled{opacity:.4}.paid-banner{margin-top:7px;background:rgba(var(--accent-rgb),.12);border:1px solid rgba(var(--accent-rgb),.22);color:var(--accent);border-radius:6px;padding:7px;font-size:8px;font-weight:900}
        .modal-backdrop{position:fixed;inset:0;background:rgba(2,6,23,.72);backdrop-filter:blur(5px);z-index:50;display:grid;place-items:center;padding:18px}.modal{width:min(480px,100%);max-height:85vh;overflow:auto;background:var(--surface);color:var(--text);border:1px solid rgba(var(--primary-rgb),.22);border-radius:12px;padding:16px;box-shadow:0 25px 70px rgba(0,0,0,.45)}.modal-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}.modal-head h2{margin:3px 0;font-size:18px}.modal-head button{border:1px solid rgba(var(--primary-rgb),.15);background:rgba(var(--primary-rgb),.06);color:var(--text);border-radius:5px;font-size:17px;cursor:pointer}.variant-row{display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid rgba(var(--primary-rgb),.13);background:var(--surface-2);border-radius:7px;margin:6px 0}.variant-row span{font-size:11px;font-weight:800}.variant-row small{display:block;color:rgba(255,255,255,.48);font-size:9px;margin-top:2px}.variant-row>div{display:flex;align-items:center;gap:7px}.variant-row button{width:28px;height:28px;border:1px solid rgba(var(--primary-rgb),.18);background:rgba(var(--primary-rgb),.05);color:var(--text);border-radius:5px}.modifier-group{margin:10px 0}.modifier-group>div:first-child{display:flex;justify-content:space-between;margin-bottom:5px;font-size:11px}.modifier-group>div:first-child small{color:rgba(255,255,255,.45);font-size:8px}.modifier{width:100%;display:flex;justify-content:space-between;border:1px solid rgba(var(--primary-rgb),.13);background:var(--surface-2);color:var(--text);border-radius:7px;padding:9px;margin:4px 0;font-size:10px;cursor:pointer}.modifier.active{border-color:var(--primary);background:rgba(var(--primary-rgb),.10);color:var(--primary)}.modal-primary{width:100%;border:0;background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 62%,var(--accent)));color:#111827;border-radius:7px;padding:11px;font-weight:900;font-size:10px;margin-top:8px}
        .pos-loading,.pos-error{min-height:100vh;display:grid;place-items:center;align-content:center;gap:12px;background:var(--background);color:var(--text);font-family:Inter,Arial,sans-serif}.pos-loading{font-weight:800}.pos-error{padding:20px;text-align:center}.pos-error strong{max-width:600px;color:#fca5a5}.pos-error button{border:1px solid rgba(var(--primary-rgb),.28);background:var(--primary);color:#111827;padding:10px 15px;border-radius:8px;font-weight:800}
        @media(max-width:1100px){.pos-grid{grid-template-columns:125px minmax(0,1fr) 315px;height:calc(100dvh - 250px)}.product-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.pos-info-row{grid-template-columns:150px 1fr 150px}.info-cell.wide{grid-column:1/-1}}
        @media(max-width:800px){.anaira-pos{height:auto;min-height:100dvh;overflow:visible}.pos-grid{height:auto}.floor-dashboard,.running-dashboard,.billing-dashboard{padding:10px}.floor-head{flex-direction:column;gap:10px}.floor-actions{width:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.floor-type,.floor-primary{min-height:44px}.table-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.floor-table{min-height:105px;padding:11px}.order-flow-crumb{gap:5px;overflow:auto;white-space:nowrap;padding:7px 10px}.pos-topbar{height:52px;padding:0 8px;gap:8px}.brand-block span,.live-pill{display:none}.brand-block strong{font-size:13px}.order-mode-bar{height:48px;overflow-x:auto;overflow-y:hidden;padding-left:4px;-webkit-overflow-scrolling:touch;scrollbar-width:none}.order-mode-bar::-webkit-scrollbar{display:none}.mode{min-width:max-content;padding:0 14px;font-size:10px}.bill-mode-label{display:none}.pos-info-row{grid-template-columns:1fr 1fr;gap:6px;padding:6px 8px}.info-cell{min-height:44px;padding:7px}.pos-grid{display:flex;flex-direction:column;min-height:0}.category-panel{order:0;display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;border-right:0;border-bottom:1px solid rgba(var(--primary-rgb),.13);padding:7px 8px;-webkit-overflow-scrolling:touch;scrollbar-width:none}.category-panel::-webkit-scrollbar{display:none}.panel-title{display:none}.category{width:auto;min-width:max-content;margin:0;min-height:42px;padding:8px 12px}.menu-panel{order:1;padding:8px;overflow:visible}.menu-toolbar{position:sticky;top:0;z-index:8;background:var(--background);padding:2px 0 8px;margin:0}.menu-toolbar input{min-height:44px;font-size:13px}.product-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.product-card{min-height:132px;padding:8px}.product-card button{min-height:44px}.cart-panel{order:2;border-left:0;border-top:2px solid rgba(var(--primary-rgb),.20);position:sticky;bottom:0;z-index:12;max-height:52dvh;min-height:0;box-shadow:0 -10px 30px rgba(0,0,0,.25)}.cart-list{max-height:176px;padding:6px 8px;overflow:hidden}.cart-item{min-height:54px}.cart-title{min-height:48px;padding:8px}.bill-summary{padding:8px 10px}.pos-buttons{position:sticky;bottom:0;z-index:15;padding:8px;background:var(--surface);padding-bottom:max(8px,env(safe-area-inset-bottom));grid-template-columns:1fr 1fr 1.35fr}.pos-buttons button{min-height:46px;font-size:10px}.back-btn span{display:none}.inline-bill-box{margin:0 8px 7px}.payment-row select,.payment-row input{min-height:42px}.delivery-mini select{min-height:42px}.modal-backdrop{padding:max(8px,env(safe-area-inset-top)) 8px max(8px,env(safe-area-inset-bottom))}.modal{width:100%;max-width:520px;max-height:92dvh;border-radius:14px;padding:13px}.modal-head h2{font-size:17px}.modal-primary,.delivery-main-action{min-height:46px;font-size:10px}}
        @media(max-width:800px){.menu-more-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.menu-more-modal{width:calc(100vw - 16px);max-height:90dvh;padding:12px}.menu-more-grid .product-photo{aspect-ratio:1/.72}}
        @media(max-width:520px){.kitchen-order-list{grid-template-columns:1fr}.kitchen-toggle{margin-left:3px!important;padding:0 10px!important;min-height:42px}.pos-info-row{grid-template-columns:1fr}.product-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.product-card{min-height:124px}.menu-toolbar{align-items:stretch;flex-direction:column}.menu-toolbar input{width:100%}.cart-panel{max-height:58dvh}.cart-list{max-height:176px;overflow:hidden}.cart-item{grid-template-columns:38px minmax(0,1fr) auto;gap:6px}.delete{grid-column:3;grid-row:1}.qty{grid-column:2;justify-self:end;grid-row:1}.cart-info{padding-right:45px}.cart-info strong{font-size:11px}.pos-buttons{grid-template-columns:1fr 1fr 1.4fr}.brand-block strong{font-size:13px}.delivery-flow-customer,.delivery-owner-fields{grid-template-columns:1fr}.delivery-steps{grid-template-columns:repeat(5,minmax(46px,1fr));overflow-x:auto}.delivery-step{min-width:46px}.delivery-amount-grid{grid-template-columns:1fr}.delivery-flow-footer{gap:7px}.delivery-flow-footer button{width:100%;min-height:44px}}
        .menu-view-more{width:100%;margin:8px 0 0;border:1px solid rgba(var(--primary-rgb),.28);background:rgba(var(--primary-rgb),.08);color:var(--primary);border-radius:8px;padding:8px 10px;font-size:8px;font-weight:900;letter-spacing:.5px;cursor:pointer}.menu-view-more span{opacity:.65;margin-left:5px}.menu-more-backdrop{z-index:80}.menu-more-modal{width:min(980px,calc(100vw - 28px));max-width:980px;max-height:min(82dvh,760px);display:flex;flex-direction:column}.menu-more-count{display:block;margin-top:2px;font-size:8px;color:rgba(255,255,255,.45)}.menu-more-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;overflow:auto;padding:2px 2px 4px}.menu-more-grid .product-card{min-height:0}.menu-more-grid .product-photo{aspect-ratio:1/.68}.menu-more-grid .product-meta{padding-top:5px}.menu-more-grid .product-meta strong{font-size:10px}.menu-more-grid .product-meta span{font-size:10px}
                /* Counter POS: show 10 products (2 rows x 5) without sacrificing the fixed billing area. */
        .pos-grid{min-height:0}
        .menu-panel{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}
        .menu-toolbar{flex:0 0 auto}
        .product-grid{flex:0 0 auto}
        .product-card{min-height:0;height:100%;}
        .menu-view-more{flex:0 0 auto;min-height:34px}
        @media(min-width:1101px){.product-grid{grid-template-rows:repeat(2,minmax(0,1fr));}.product-card{min-height:0}.product-photo{aspect-ratio:1/.54}}
        @media(max-width:1100px) and (min-width:801px){.product-grid{grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));}.product-card{min-height:0}.product-photo{aspect-ratio:1/.54}}
        @media(max-width:800px){.product-grid{grid-template-rows:none}.product-photo{aspect-ratio:1/.68}}
        @media print{.pos-topbar,.order-mode-bar,.kitchen-strip,.pos-info-row,.category-panel,.menu-panel,.pos-buttons,.inline-bill-box{display:none!important}.anaira-pos{background:#fff;color:#111}.pos-grid{display:block}.cart-panel{border:0;width:100%;background:#fff;color:#111}.cart-list{max-height:none}.cart-title{border-bottom:1px solid #111}.cart-title h2,.cart-info strong,.bill-summary b{color:#111!important}.bill-summary{color:#111;border-top:1px solid #111}.grand{background:#ddd!important;color:#111!important}.grand span,.grand b{color:#111!important}}
        /* Final compact POS cart: only 3 rows in the main cart; remaining items open in View More. Keep action buttons visible. */
        @media(max-width:800px){
          .cart-panel{display:flex!important;flex-direction:column!important;overflow:hidden!important;max-height:58dvh!important;}
          .cart-list{flex:0 0 auto!important;max-height:158px!important;overflow:hidden!important;}
          .cart-view-more{flex:0 0 auto!important;min-height:32px!important;}
          .delivery-mini,.offer-box,.bill-summary,.inline-bill-box,.pos-buttons{flex:0 0 auto!important;}
          .pos-buttons{position:sticky!important;bottom:0!important;z-index:30!important;min-height:62px!important;}
          .pos-buttons button{min-height:44px!important;}
        }
        }`}</style>
    </div>
  )
}
