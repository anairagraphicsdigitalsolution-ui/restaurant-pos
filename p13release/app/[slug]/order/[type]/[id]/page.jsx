"use client"

import { createClientUuid } from "@/lib/clientUuid"

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import QRCode from "react-qr-code"
import { applyTheme, DEFAULT_THEME, BRAND_THEMES, useTheme } from "@/components/ThemeProvider"
import { supabasePublic } from "@/lib/supabasePublic"

export default function OrderPage() {

  const params = useParams()
  const searchParams = useSearchParams()
  const { refreshTheme } = useTheme()

  const comboModalBox = {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    border: "1px solid var(--border, #e5e7eb)",
    background: "var(--surface, #ffffff)"
  }
  const comboLine = {
    padding: "7px 9px",
    borderRadius: 8,
    background: "var(--surface-muted, #f8fafc)",
    color: "var(--text, #111827)"
  }
  const comboChoice = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid var(--border, #e5e7eb)",
    background: "var(--surface, #ffffff)",
    color: "var(--text, #111827)",
    cursor: "pointer",
    textAlign: "left"
  }
  const comboChoiceActive = {
    border: "1px solid var(--primary, #059669)",
    background: "var(--primary-soft, #ecfdf5)"
  }

  const slug = params?.slug
  const type = params?.type
  const id = params?.id

  const [menu, setMenu] = useState([])
  const [cart, setCart] = useState([])
  const [selected, setSelected] = useState(null)
  const [restaurant, setRestaurant] = useState(null)
  const [themeReady, setThemeReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [showCart, setShowCart] = useState(false)
  const [orderNote, setOrderNote] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [search, setSearch] = useState("")
  const [banners, setBanners] = useState([])
  const [offers,setOffers]=useState([])
const [currentBanner, setCurrentBanner] = useState(0)
const [touchStart,setTouchStart]=useState(null)

const [touchEnd,setTouchEnd]=useState(null)

function getUnitPrice(item, selection = [], variantId = null) {
  const variant = (item?.variants || []).find(v => String(v.id) === String(variantId))
  const base = Number(item?.price || 0) + Number(variant?.price_delta || 0)
  if (item?.item_type !== "combo") return base
  return getComboUnitPrice(item, selection)
}
function getComboUnitPrice(item, selection = []) {
  const variant = (item?.variants || []).find(v => String(v.id) === String(item?.variant_id))
  const base = Number(item?.comboBasePrice ?? item?.price ?? 0)
  if (item?.item_type !== "combo") return base + Number(variant?.price_delta || 0)
  const options = item?.combo_config?.groups?.[0]?.options || []
  return base + (selection || []).reduce((sum, row) => {
    const itemId = typeof row === "string" ? row : row?.item_id
    const option = options.find(o => String(o.item_id) === String(itemId))
    const component = menu.find(m => String(m.id) === String(itemId))
    const variantId = typeof row === "string" ? null : row?.variant_id
    const variant = (component?.variants || []).find(v => String(v.id) === String(variantId))
    return sum + Number(option?.price_delta || 0) + Number(variant?.price_delta || 0)
  }, 0)
}
const [ratingSummary, setRatingSummary] = useState({ average: 0, count: 0 })
const [feedbackEnabled, setFeedbackEnabled] = useState(false)
const [qrThemeEnabled, setQrThemeEnabled] = useState(true)
const [rating, setRating] = useState(0)
const [ratingHover, setRatingHover] = useState(0)
const [ratingFeedback, setRatingFeedback] = useState("")
const [ratingSending, setRatingSending] = useState(false)
const [ratingSent, setRatingSent] = useState(false)
const [ratingError, setRatingError] = useState("")
const [qrSessionToken, setQrSessionToken] = useState("")
const [trackedOrderId, setTrackedOrderId] = useState("")
const [trackedOrder, setTrackedOrder] = useState(null)
const [orderHistory, setOrderHistory] = useState([])
const [paymentConfig, setPaymentConfig] = useState({auto_enabled:false,manual_enabled:false,upi_id:"",manual_qr_image_url:"",merchant_name:""})
const [advancedQrEnabled, setAdvancedQrEnabled] = useState(false)
const [paymentRequest, setPaymentRequest] = useState(null)
const [showPayment, setShowPayment] = useState(false)
const [paymentReference, setPaymentReference] = useState("")
const [paymentBusy, setPaymentBusy] = useState(false)
const [serviceBusy, setServiceBusy] = useState("")
const [serviceMessage, setServiceMessage] = useState("")
const [statusMessage, setStatusMessage] = useState("")
const [trackingCopied, setTrackingCopied] = useState(false)
function nextBanner(){

if(!banners.length) return

setCurrentBanner(prev=>

prev===banners.length-1

?0

:prev+1

)

}

function prevBanner(){

if(!banners.length) return

setCurrentBanner(prev=>

prev===0

?banners.length-1

:prev-1

)

}

function handleTouchStart(e){

setTouchStart(e.targetTouches[0].clientX)

}

function handleTouchMove(e){

setTouchEnd(e.targetTouches[0].clientX)

}

function handleTouchEnd(){

if(touchStart===null||touchEnd===null)return

const distance=touchStart-touchEnd

if(distance>60){

nextBanner()

}

if(distance<-60){

prevBanner()

}

setTouchStart(null)

setTouchEnd(null)

}
const [showFoodModal, setShowFoodModal] = useState(false)

const [selectedFood, setSelectedFood] = useState(null)

const [modalQty, setModalQty] = useState(1)

const [modalRequest, setModalRequest] = useState("")
const [comboSelection, setComboSelection] = useState([])
const [variantSelection, setVariantSelection] = useState(null)
const [variantQuantities, setVariantQuantities] = useState({})

useEffect(() => {
  if (slug && type && id) {
    try {
      const key = `anaira:qr-session:${slug}:${type}:${id}`
      const saved = window.localStorage.getItem(key) || ""
      const lastOrderKey = `anaira:qr-last-order:${slug}:${type}:${id}`
      const savedOrderId = window.localStorage.getItem(lastOrderKey) || ""
      if (saved) setQrSessionToken(saved)
      if (savedOrderId) setTrackedOrderId(savedOrderId)

      // A shareable tracking link keeps the session token in the URL fragment,
      // so it is available to the browser without being sent in normal HTTP
      // referrer/request headers. The same link can be reopened after Back,
      // refresh, or closing the tab.
      const hash = String(window.location.hash || "")
      const match = hash.match(/(?:^|#|&)track=([^&]+)/)
      if (match?.[1]) {
        const tokenFromLink = decodeURIComponent(match[1])
        if (tokenFromLink) setQrSessionToken(tokenFromLink)
      }
    } catch {}
    init()
  }
}, [slug, type, id])

useEffect(() => {
  const orderId = String(searchParams?.get("order_id") || "").trim()
  if (orderId) {
    setTrackedOrderId(orderId)
    try {
      if (slug && type && id) window.localStorage.setItem(`anaira:qr-last-order:${slug}:${type}:${id}`, orderId)
    } catch {}
    if (searchParams?.get("payment") === "return") setShowPayment(true)
  }
}, [searchParams, slug, type, id])

useEffect(() => {
  if (!trackedOrderId || !qrSessionToken) return
  let stopped = false
  let recovering = false
  let channel = null
  const terminal = value => ["paid","settled","cancelled","canceled","void","voided","refunded"].includes(String(value || "").toLowerCase())
  const clearTrackedOrder = () => {
    try {
      if (slug && type && id) {
        window.localStorage.removeItem(`anaira:qr-last-order:${slug}:${type}:${id}`)
        window.localStorage.removeItem(`anaira:qr-session:${slug}:${type}:${id}`)
      }
    } catch {}
    setTrackedOrder(null); setTrackedOrderId(""); setQrSessionToken(""); setPaymentRequest(null); setShowPayment(false)
    try { window.history.replaceState(window.history.state, "", window.location.pathname) } catch {}
  }
  const recoverSession = async () => {
    if (recovering || stopped) return false
    recovering = true
    try {
      const r = await fetch("/api/public/qr-session", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ slug, type, source_id:selected?.id || id, order_id:trackedOrderId }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.success || !d.session_token) return false
      setQrSessionToken(d.session_token)
      try { window.localStorage.setItem(`anaira:qr-session:${slug}:${type}:${id}`, d.session_token) } catch {}
      return true
    } catch { return false } finally { recovering = false }
  }
  const poll = async (allowRecovery = true) => {
    try {
      const r = await fetch(`/api/public/qr-status?order_id=${encodeURIComponent(trackedOrderId)}&token=${encodeURIComponent(qrSessionToken)}`, { cache:"no-store" })
      const d = await r.json().catch(() => ({}))
      if (stopped) return
      if (r.ok && d.success) {
        const order=d.order||null
        if (terminal(order?.payment_status) || terminal(order?.status)) { clearTrackedOrder(); return }
        setTrackedOrder(order)
        if (order?.customer_phone && !customerPhone) setCustomerPhone(String(order.customer_phone))
        if (order?.customer_name && !customerName) setCustomerName(String(order.customer_name))
        setOrderHistory(d.history||[])
        const latest=(d.payments||[])[0]; if(latest) setPaymentRequest(latest)
        return
      }
      if (allowRecovery && [400,404].includes(r.status) && await recoverSession()) return poll(false)
      if ([400,404,410].includes(r.status)) clearTrackedOrder()
    } catch {}
  }
  const subscribe = async () => {
    try {
      const bytes = new TextEncoder().encode(qrSessionToken)
      const digest = await crypto.subtle.digest("SHA-256", bytes)
      const hash = Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("")
      if (stopped) return
      channel = supabasePublic.channel(`qr-track:${hash}`)
        .on("broadcast", { event:"order_update" }, payload => {
          if (String(payload?.payload?.order_id||"") === String(trackedOrderId)) poll(false)
        })
        .subscribe()
    } catch {}
  }
  poll(true); subscribe()
  const timer = setInterval(() => { if(document.visibilityState === "visible") poll(true) }, 30000)
  return () => { stopped=true; clearInterval(timer); if(channel) void supabasePublic.removeChannel(channel) }
}, [trackedOrderId, qrSessionToken, slug, type, id, selected?.id])

useEffect(() => {

  if (!banners.length) return

  const timer = setInterval(() => {

    setCurrentBanner(prev =>
      prev === banners.length - 1
        ? 0
        : prev + 1
    )

  }, 3000)

  return () => clearInterval(timer)

}, [banners])

async function init() {

    setLoading(true)
    setThemeReady(false)
    setPageError("")

    try {
      const query = new URLSearchParams({
        slug: String(slug),
        type: String(type),
        id: String(id)
      })

      const response = await fetch(
  `/api/public/qr-context?${query.toString()}`,
  {
    method: "GET",
    cache: "default",
    headers: { Accept: "application/json" }
  }
)

      const payload = await response.json()

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Restaurant not found")
      }

      const nextRestaurant = payload.restaurant || null
      setRestaurant(nextRestaurant)

      const nextFeedbackEnabled = payload?.feedback_enabled === true
      const nextQrThemeEnabled = payload?.theme_runtime?.qr_enabled !== false
      setFeedbackEnabled(nextFeedbackEnabled)
      setQrThemeEnabled(nextQrThemeEnabled)

      const selectedThemeId = payload?.theme_config?.selected
      const customThemes = Array.isArray(payload?.theme_config?.themes)
        ? payload.theme_config.themes
        : []
      const themePool = [...BRAND_THEMES, ...customThemes]
      const selectedTheme =
        themePool.find((item) => item?.id === selectedThemeId) || DEFAULT_THEME

      applyTheme(nextQrThemeEnabled ? selectedTheme : DEFAULT_THEME)
      setThemeReady(true)

      setBanners(payload.banners || [])
      setOffers(payload.offers || [])
      setMenu(payload.menu || [])
      setSelected(payload.source || null)
      setRatingSummary(payload.rating || { average: 0, count: 0 })
      setPaymentConfig(payload.payment_config || {auto_enabled:false,manual_enabled:false,upi_id:"",manual_qr_image_url:"",merchant_name:""})
      setAdvancedQrEnabled(payload?.qr_runtime?.advanced_ordering_enabled === true)
    } catch (error) {
      console.error("QR INIT ERROR:", error)
      setFeedbackEnabled(false)
      setQrThemeEnabled(false)
      applyTheme(DEFAULT_THEME)
      setThemeReady(true)
      setPageError(error?.message || "Unable to load restaurant")
    } finally {
      setLoading(false)
    }
  }
  function openFood(item){
  setSelectedFood(item)
  setModalQty(1)
  setModalRequest("")
  const cfg = item?.combo_config || {}
  const firstGroup = cfg?.groups?.[0] || null
  setComboSelection(item?.item_type === "combo" && firstGroup?.min === 1 && firstGroup?.max === 1 ? [] : [])
  setVariantSelection(null)
  const initialVariantQty = {}
  ;(item?.variants || []).forEach(v => { initialVariantQty[v.id] = 0 })
  setVariantQuantities(initialVariantQty)
  setShowFoodModal(true)
}
  
  // 🛒 ADD
  function addToCart(item) {
    const cartKey = item.cartKey || `${item.id}:base`
    setCart(prev => {
      const exist = prev.find(i => i.cartKey === cartKey)
      if (exist) {
        return prev.map(i => i.cartKey === cartKey
          ? { ...i, qty: i.qty + (item.qty || 1), cooking_request: item.cooking_request || i.cooking_request }
          : i
        )
      }
      return [...prev, { ...item, qty: item.qty || 1, cartKey, cooking_request: item.cooking_request || "" }]
    })
  }

  // ➕➖
  function updateQty(cartKey, change) {
    setCart(prev => prev.flatMap(item => {
      if (item.cartKey !== cartKey) return [item]
      const qty = Number(item.qty || 0) + change
      return qty <= 0 ? [] : [{ ...item, qty }]
    }))
  }
  function removeItem(cartKey) {
  setCart(cart.filter(item => item.cartKey !== cartKey))
}

  async function ensureQrSessionForOrder(orderId) {
    const response = await fetch("/api/public/qr-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, type, source_id: selected?.id || id, order_id: orderId })
    })
    const payload = await response.json()
    if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to start table session")
    const token = payload.session_token
    setQrSessionToken(token)
    try { window.localStorage.setItem(`anaira:qr-session:${slug}:${type}:${id}`, token) } catch {}
    return token
  }

  async function ensureQrSession() {
    if (qrSessionToken) return qrSessionToken
    return ensureQrSessionForOrder("")
  }

  // 🚀 PLACE ORDER
  async function placeOrder() {

    if (!selected) return alert("Select table/room")
    if (!restaurant) return alert("Restaurant missing")
    if (!cart.length) return alert("Cart empty")

    try {
      // Core order creation must never be blocked by the optional guest
      // tracking session. Older/partially migrated Supabase projects may not
      // have qr_guest_sessions yet. Create the order first; bind tracking
      // afterwards on a best-effort basis.
      let sessionToken = qrSessionToken || ""
      const clientRequestId = createClientUuid("qr-order")
      const response = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          source_type: type,
          source_id: selected.id,
          qr_session_token: sessionToken || null,
          client_request_id: clientRequestId,
          overall_note: orderNote,
          customer_name: customerName.trim() || null,
          customer_phone: customerPhone.replace(/\D/g, "").slice(0, 15) || null,
          offer_id: activeOffer?.id || null,
          items: cart.map(i => ({
            item_id: i.id,
            quantity: i.qty,
            variant_id: i.variant_id || null,
            cooking_request: i.cooking_request || null,
            combo_selection: i.combo_selection || []
          }))
        })
      })

      const payload = await response.json()

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Order failed")
      }

      if (payload.customer_whatsapp_url) {
        window.open(payload.customer_whatsapp_url, "_blank", "noopener,noreferrer")
      }

      const newOrderId = payload?.order?.order_id || payload?.order?.id || ""
      if (newOrderId) {
        // Tracking is an enhancement, not a prerequisite for a successful
        // order. If a session already exists use it; otherwise create/bind one
        // after the order has been committed.
        if (!sessionToken) {
          try {
            sessionToken = await ensureQrSessionForOrder(newOrderId)
          } catch (sessionError) {
            console.warn("QR SESSION AFTER ORDER:", sessionError)
            sessionToken = ""
          }
        }

        setTrackedOrderId(newOrderId)
        setTrackedOrder(payload.order)
        setShowCart(false)
        try {
          const lastOrderKey = `anaira:qr-last-order:${slug}:${type}:${id}`
          window.localStorage.setItem(lastOrderKey, String(newOrderId))
          const trackHash = sessionToken ? `#track=${encodeURIComponent(sessionToken)}` : ""
          window.history.replaceState(window.history.state, "", `${window.location.origin}${window.location.pathname}?order_id=${encodeURIComponent(newOrderId)}${trackHash}`)
        } catch {}
        setStatusMessage(sessionToken
          ? `Order #${String(payload?.order?.order_number || "").padStart(4,"0")} is now being tracked live.`
          : `Order #${String(payload?.order?.order_number || "").padStart(4,"0")} placed successfully.`)
      }
      alert("✅ Order placed successfully")
      setCart([])
      setOrderNote("")
    } catch (error) {
      console.error("ORDER ERROR:", error)
      alert(`❌ ${error.message || "Order failed"}`)
    }
  }
  const categories = [
  "All",
  ...new Set(
    menu
      .map(item => item.category)
      .filter(Boolean)
  )
]
const subtotal = cart.reduce(
  (t, i) => t + getComboUnitPrice(i, i.combo_selection || []) * Number(i.qty || 0),
  0
)

const now = new Date()

const eligibleOffers = (offers || [])
  .filter((o) => {
    const active = o.active !== false
    const fromOk = !o.valid_from || new Date(`${o.valid_from}T00:00:00`) <= now
    const tillOk = !o.valid_till || new Date(`${o.valid_till}T23:59:59`) >= now
    const minOrder = Number(o.min_order || 0)
    if (!active || !fromOk || !tillOk || subtotal < minOrder) return false

    if (o.usage_limit && Number(o.usage_limit) > 0) {
      // Usage is enforced authoritatively by the database. Client-side preview
      // only needs to know the targeting and current cart value.
    }
    return true
  })
  .map((o) => {
    const targetType = String(o.target_type || "all")
    // Normal offers must never discount combo menu items. Combo pricing is
    // already the configured selling price. Only explicitly non-combo items
    // can contribute to the client-side offer preview.
    const nonComboCart = cart.filter(item => String(item?.item_type || "").toLowerCase() !== "combo")
    let eligibleSubtotal = nonComboCart.reduce(
      (sum, item) => sum + getComboUnitPrice(item, item.combo_selection || []) * Number(item.qty || 0),
      0
    )

    if (targetType === "products") {
      const ids = new Set((o.offer_products || []).map(x => String(x?.menu_item_id ?? x?.item_id ?? "")).filter(Boolean))
      eligibleSubtotal = nonComboCart.reduce(
        (sum, item) => ids.has(String(item.id))
          ? sum + getComboUnitPrice(item, item.combo_selection || []) * Number(item.qty || 0)
          : sum,
        0
      )
    } else if (targetType === "category") {
      eligibleSubtotal = nonComboCart.reduce(
        (sum, item) => item.category === o.target_category
          ? sum + getComboUnitPrice(item, item.combo_selection || []) * Number(item.qty || 0)
          : sum,
        0
      )
    }

    if (eligibleSubtotal <= 0) return { ...o, calculated_discount: 0 }

    const value = Math.max(0, Number(o.discount || 0))
    const type = String(o.discount_type || "percent").toLowerCase()
    let discount = type === "flat"
      ? Math.min(eligibleSubtotal, value)
      : Math.min(eligibleSubtotal, eligibleSubtotal * Math.min(value, 100) / 100)

    if (o.max_discount != null) discount = Math.min(discount, Math.max(0, Number(o.max_discount)))

    return { ...o, calculated_discount: Number(discount.toFixed(2)) }
  })
  .filter((o) => o.calculated_discount > 0)
  .sort((a, b) => b.calculated_discount - a.calculated_discount)

const activeOffer = eligibleOffers[0] || null
const discountAmount = activeOffer?.calculated_discount || 0
const discountedSubtotal = Math.max(0, subtotal - discountAmount)

const qrGst = restaurant?.gst_enabled
  ? Number(
      (
        discountedSubtotal *
        Number(restaurant?.gst_rate || 0) /
        100
      ).toFixed(2)
    )
  : 0

const grandTotal = Number(
  (discountedSubtotal + qrGst).toFixed(2)
)

async function requestService(requestType) {
  if (!qrSessionToken) { try { await ensureQrSession() } catch (e) { setServiceMessage(e.message); return } }
  setServiceBusy(requestType); setServiceMessage("")
  try {
    const r = await fetch("/api/public/qr-service-request", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ session_token:qrSessionToken, request_type:requestType, order_id:trackedOrderId||null }) })
    const d = await r.json(); if (!r.ok || !d.success) throw new Error(d.error || "Unable to send request")
    setServiceMessage(requestType === "bill" ? "Bill request sent to the restaurant." : "Waiter has been notified.")
  } catch (e) { setServiceMessage(e.message || "Unable to send request") } finally { setServiceBusy("") }
}

function getTrackingLink() {
  if (!trackedOrderId || !qrSessionToken || typeof window === "undefined") return ""
  return `${window.location.origin}${window.location.pathname}?order_id=${encodeURIComponent(trackedOrderId)}#track=${encodeURIComponent(qrSessionToken)}`
}

async function copyTrackingLink() {
  const link = getTrackingLink()
  if (!link) return
  try {
    await navigator.clipboard.writeText(link)
    setTrackingCopied(true)
    window.setTimeout(() => setTrackingCopied(false), 1800)
  } catch {
    setStatusMessage("Tracking link could not be copied. You can use Share instead.")
  }
}

async function shareTrackingLink() {
  const link = getTrackingLink()
  if (!link) return
  try {
    if (navigator.share) {
      await navigator.share({ title: `Order #${String(trackedOrder?.order_number ?? trackedOrderId).padStart(4,"0")} · Anaira`, text: "Track your restaurant order live", url: link })
      return
    }
    await copyTrackingLink()
  } catch {}
}

async function loadPaymentConfig() {
  if (!restaurant?.id) return false
  try {
    const r = await fetch(`/api/public/qr-payment/config?restaurant_id=${encodeURIComponent(restaurant.id)}`, { cache:"no-store" })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d?.success) { setPaymentConfig(d.payment_config || {}); return true }
  } catch {}
  return false
}

async function openPayment() {
  setShowPayment(true)
  if (!paymentConfig.auto_enabled && !paymentConfig.manual_enabled) await loadPaymentConfig()
}

async function startPayment(method) {
  if (!trackedOrderId) { setStatusMessage("Place an order first."); return }
  if (method === "auto" && !customerPhone.trim()) { setShowPayment(false); setShowCart(true); setStatusMessage("Please enter your mobile number in checkout before automatic payment."); return }
  if (!qrSessionToken) { try { await ensureQrSession() } catch (e) { setStatusMessage(e.message); return } }
  setPaymentBusy(true); setStatusMessage("")
  try {
    const r = await fetch("/api/public/qr-payment/create", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ order_id:trackedOrderId, session_token:qrSessionToken, method, return_url:typeof window!=="undefined"?window.location.href.split("?")[0]:"" }) })
    const d = await r.json(); if (!r.ok || !d.success) throw new Error(d.error || "Unable to start payment")
    if (d.already_paid) { setStatusMessage("Payment is already received."); setShowPayment(false); return }
    setPaymentRequest({ id:d.request_id, amount:d.amount, method:d.mode === "auto" ? "cashfree" : "manual_qr", status:d.mode === "auto" ? "processing" : "pending" })
    setShowPayment(true)
    if (d.mode === "manual") { setPaymentRequest(p=>({...p,...d})); return }
    if (!window.Cashfree) {
      await new Promise((resolve,reject)=>{ const existing=document.querySelector('script[data-cashfree-sdk="v3"]'); if(existing){existing.addEventListener("load",resolve,{once:true});existing.addEventListener("error",()=>reject(new Error("Unable to load payment gateway")),{once:true});return} const script=document.createElement("script");script.src="https://sdk.cashfree.com/js/v3/cashfree.js";script.dataset.cashfreeSdk="v3";script.onload=resolve;script.onerror=()=>reject(new Error("Unable to load payment gateway"));document.head.appendChild(script) })
    }
    const cashfree=window.Cashfree({mode:d.environment === "production" ? "production" : "sandbox"})
    await cashfree.checkout({paymentSessionId:d.payment_session_id,redirectTarget:"_self"})
  } catch(e) { setStatusMessage(e.message || "Unable to start payment") } finally { setPaymentBusy(false) }
}

async function claimManualPayment() {
  if (!paymentRequest?.id) return
  setPaymentBusy(true); setStatusMessage("")
  try {
    const r=await fetch("/api/public/qr-payment/claim",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request_id:paymentRequest.id,session_token:qrSessionToken,reference:paymentReference.trim()||null})})
    const d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||"Unable to confirm payment")
    setPaymentRequest(p=>({...p,status:d.status}));setStatusMessage("Payment confirmation sent. Restaurant/waiter has been notified; they will verify and settle it.")
  } catch(e){setStatusMessage(e.message||"Unable to confirm payment")} finally{setPaymentBusy(false)}
}

async function submitRating() {
  if (!rating) { setRatingError("Please select a star rating first."); return }
  setRatingSending(true); setRatingError("")
  try {
    const response = await fetch("/api/public/qr-feedback", {
      method:"POST", headers:{"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({slug,type,id,rating,feedback:ratingFeedback})
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to save rating")
    const oldCount=Number(ratingSummary.count||0), oldAverage=Number(ratingSummary.average||0)
    setRatingSummary({count:oldCount+1,average:Number((((oldAverage*oldCount)+rating)/(oldCount+1)).toFixed(1))})
    setRatingSent(true); setRatingFeedback("")
  } catch(error) { setRatingError(error.message || "Unable to save rating") }
  finally { setRatingSending(false) }
}

const filteredMenu = menu
  .filter(item =>
    selectedCategory === "All"
      ? true
      : item.category === selectedCategory
  )
  .filter(item =>
    item.name
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  if (loading || !themeReady) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "var(--background)", color: "var(--text)" }}>
        <div style={{ padding: 28, borderRadius: "var(--radius)", background: "var(--surface)", border: "1px solid var(--border)", textAlign: "center" }}>
          <div style={{ fontSize: 38 }}>🍽️</div>
          <h2 style={{ margin: "10px 0 6px" }}>Loading restaurant menu…</h2>
          <p style={{ margin: 0, color: "var(--muted)" }}>Applying restaurant theme and menu settings.</p>
        </div>
      </div>
    )
  }

  if (pageError) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "var(--background)", color: "var(--text)" }}>
        <div style={{ maxWidth: 560, padding: 32, borderRadius: "var(--radius)", background: "var(--surface)", border: "1px solid var(--border)", textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>🔒</div>
          <h2 style={{ margin: "10px 0" }}>QR Menu unavailable</h2>
          <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.6 }}>{pageError}</p>
        </div>
      </div>
    )
  }

  return (
  <div style={layout} className="qr-page">

    <div style={blob1}></div>

    <div style={blob2}></div>

   <div

className="qr-hero"
style={{

height:320,

position:"relative",

overflow:"hidden"

}}

onTouchStart={handleTouchStart}

onTouchMove={handleTouchMove}

onTouchEnd={handleTouchEnd}

>

  {banners.length > 0 && (

<img
  key={currentBanner}
  src={banners[currentBanner]?.image_url}
  alt=""
  fetchPriority="high"
  decoding="async"
  style={{
    width:"100%",
    height:"100%",
    objectFit:"cover",
    transition:"all .5s ease",
    animation:"bannerFade .45s"
  }}
/>

)}
{

banners.length>1 && (

<>

<button

onClick={prevBanner}

style={leftArrow}

>

❮

</button>

<button

onClick={nextBanner}

style={rightArrow}

>

❯

</button>

</>

)

}

  <div
    style={{
      position:"absolute",
      inset:0,
      background:
        "linear-gradient(to top,var(--background),transparent)"
    }}
    />
    {offers.length>0 && (

<div style={offerTicker}>

<div style={offerTrack}>

{[
...offers,
...offers,
...offers
]
.filter((o) => {
  const active = o.active !== false
  const fromOk =
    !o.valid_from ||
    new Date(`${o.valid_from}T00:00:00`) <= new Date()
  const tillOk =
    !o.valid_till ||
    new Date(`${o.valid_till}T23:59:59`) >= new Date()
  return active && fromOk && tillOk
})
.map((o,index)=>(
<div key={index} style={offerItem}>
🎁 <b>{o.title}</b>
&nbsp;&nbsp;
🔥 {o.discount_type === "flat" ? `₹${o.discount} OFF` : `${o.discount}% OFF`}
&nbsp;&nbsp;
✨ Limited Time
</div>
))}

</div>

</div>

)}


    <div
  style={{
    position:"absolute",

    left:20,

    bottom:25,

    zIndex:5
  }}
>

  <div style={heroInfo}>

    ⭐ {Number(ratingSummary.average||0) > 0 ? Number(ratingSummary.average).toFixed(1) : "New"}
    <span>•</span>
    {restaurant?.cuisine || "Dining"}
    <span>•</span>
    {restaurant?.preparation_time_minutes ? `${restaurant.preparation_time_minutes} Min` : "Freshly Prepared"}

  </div>

</div>
  <div
    style={{
      position:"absolute",
      bottom:12,
      left:0,
      right:0,
      display:"flex",
      justifyContent:"center",
      gap:8
    }}
  >
    {banners.map((_,index)=>(

<div

key={index}

onClick={()=>setCurrentBanner(index)}

style={{

width:9,

height:9,

cursor:"pointer",

borderRadius:"50%",

transition:".3s",

background:

currentBanner===index

?"var(--primary)"

:"rgba(255,255,255,.35)"

}}

/>

))}
      
  </div>
</div>

    <div style={header} className="qr-header">
  <div style={headerRow}>

    <div style={{display:"flex",alignItems:"center",gap:12}}>

      {restaurant?.logo && (
        <img
          src={restaurant.logo}
          alt={restaurant.name}
          style={logo}
        />
      )}

      <div>
        <h1 style={restaurantTitle}>
          {restaurant?.name}
        </h1>

        <p style={tableInfo}>
          {type === "table"
            ? `🍽️ Table ${selected?.table_number || "..."}`
            : `🛏️ Room ${selected?.room_number || "..."}`}
        </p>
       <div
  style={heroBadge}
>

⭐ Fresh Food

</div>

<div
  style={restaurantMeta}
>

🕒 {restaurant?.opening_time || "Open Now"}

•

🍽 {restaurant?.cuisine || "Multi Cuisine"}

</div>
      </div>

    </div>

    <div className="qr-header-actions" style={{display:"flex",alignItems:"center",gap:8}}>
      {feedbackEnabled && (
        <button
          type="button"
          className="qr-header-action"
          onClick={() => document.getElementById("qr-rating")?.scrollIntoView({behavior:"smooth",block:"center"})}
          style={headerActionButton}
          aria-label="Rate this restaurant"
        >
          <span style={{fontSize:17}}>⭐</span>
          <span>Rate Us</span>
        </button>
      )}

      <button
        type="button"
        className="qr-header-action"
        onClick={() => setShowCart(true)}
        style={headerActionButton}
        aria-label={`Open cart, ${cart.reduce((t,i)=>t+i.qty,0)} items`}
      >
        <span style={{fontSize:17}}>🛒</span>
        <span>Cart</span>
        {cart.length > 0 && (
          <span style={cartCountPill}>{cart.reduce((t,i)=>t+i.qty,0)}</span>
        )}
      </button>
    </div>

  </div>
</div>
<div
  style={{
    padding:"18px 16px"
  }}
>

  <div style={searchBox} className="qr-search-box">

  <div
  style={{
    fontSize:20
  }}
>

🔍

</div>

<input
    value={search}
    onChange={(e)=>setSearch(e.target.value)}
    placeholder="🔍 Search food..."
    style={searchInput}
  />
  </div>

</div>
<div style={categoryBar} className="qr-category-bar">

  {categories.map(cat => (

    <button
      type="button"
      key={cat}
      onClick={() => setSelectedCategory(cat)}
     style={{
    ...categoryBtn,

    background:
      selectedCategory === cat
        ? "var(--surface)"
        : "rgba(255,255,255,0.08)",

    border:
      selectedCategory === cat
        ? "1px solid rgba(var(--primary-rgb),.35)"
        : "1px solid transparent",

    color:"var(--text)",

    boxShadow:
      selectedCategory === cat
        ? "0 8px 20px rgba(var(--primary-rgb),.15)"
        : "none"
  }}
    >
      {cat}
    </button>

  ))}

</div>

      <div style={grid} className="qr-menu-grid">
  {filteredMenu.map(item => {

    const cartItems = cart.filter(i => i.id === item.id)
    const cartItem = cartItems[0]
    const cartItemQty = cartItems.reduce((sum, i) => sum + Number(i.qty || 0), 0)

    const itemAvailable = item?.available !== false

    return (

      <div
        key={item.id}
        style={{...card,opacity:itemAvailable?1:.58}}
  onClick={() => itemAvailable && openFood(item)}
  onMouseEnter={(e)=>{

e.currentTarget.style.transform="translateY(-8px)"

const image=e.currentTarget.querySelector("img")

if(image){

image.style.transform="scale(1.08)"

}

}}
 onMouseLeave={(e)=>{

e.currentTarget.style.transform="translateY(0)"

const image=e.currentTarget.querySelector("img")

if(image){

image.style.transform="scale(1)"

}

}}
>
  <img
  src={item.image || "/food-placeholder.jpg"}
  alt={item.name}
  loading="lazy"
  decoding="async"
  style={{
    ...img,
    transition: ".45s"
  }}
/>

  <div style={{padding:"14px 14px 15px",display:"flex",flexDirection:"column",gap:10,flex:1}}>

    <h3 style={{
      margin:0,
      marginBottom:10,
      fontSize:16,
      lineHeight:1.35,
      minHeight:43,
      display:"-webkit-box",
      WebkitLineClamp:2,
      WebkitBoxOrient:"vertical",
      overflow:"hidden"
    }}>
      {item.name}
    </h3>

    <div style={{
      display:"flex",
      justifyContent:"space-between",
      alignItems:"center"
    }}>

      <span style={{
        color:"var(--primary)",
        fontWeight:"bold",
        fontSize:18
      }}>
        ₹{item.price}
      </span>

      {cartItem ? (

<div
  style={{
    display:"flex",
    alignItems:"center",
    gap:6
  }}
>

  <button
    type="button"
    style={qtyBtn}
    onClick={(e)=>{
      e.stopPropagation()
      updateQty(cartItem?.cartKey,-1)
    }}
  >
    −
  </button>

  <span>{cartItemQty}</span>

  <button
    type="button"
    style={qtyBtn}
    onClick={(e)=>{
      e.stopPropagation()
      updateQty(cartItem?.cartKey,1)
    }}
  >
    +
  </button>

</div>

) : (

<button
  type="button"
  disabled={!itemAvailable}
  onClick={(e)=>{

e.stopPropagation()

openFood(item)

}}
  style={{
    background:
"linear-gradient(135deg,var(--surface),var(--surface-2))",
border:
"1px solid rgba(var(--primary-rgb),.35)",
    color:"var(--text)",
    padding:"8px 14px",
    borderRadius:10,
    fontWeight:"bold",
    cursor:"pointer",

    boxShadow:
"0 10px 25px rgba(0,0,0,.35)"
  }}
>
  Add
</button>
)}

    </div>

  </div>

</div>

    )

  })}
      </div>
      {filteredMenu.length === 0 && (
        <div style={{maxWidth:1280,margin:"8px auto 0",padding:"28px 18px",textAlign:"center",color:"var(--muted)"}}>
          <div style={{fontSize:44,marginBottom:8}}>🍽️</div>
          <b style={{color:"var(--text)",fontSize:17}}>No dishes found</b>
          <div style={{marginTop:6,fontSize:13}}>Try another category or search term.</div>
        </div>
      )}
      {cart.length === 0 && (

<div
  style={{
    textAlign:"center",
    padding:"40px 20px",
    color:"var(--muted)"
  }}
>
  <div style={{fontSize:50}}>
    🛒
  </div>

  No Items Added Yet

  <div
    style={{
      marginTop:10,
      fontSize:13
    }}
  >
    Browse our premium menu and start your order.
  </div>
</div>

)}

      
      {(trackedOrderId || trackedOrder) && trackedOrder && !["paid","settled"].includes(String(trackedOrder?.payment_status||"").toLowerCase()) && !["cancelled","canceled","void","voided","refunded"].includes(String(trackedOrder?.status||"").toLowerCase()) && (
        <section style={qrTrackerCard}>
          <div style={ratingEyebrow}>LIVE ORDER</div>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <div><h2 style={{margin:0,fontSize:22}}>Order #{String(trackedOrder?.order_number ?? trackedOrderId).padStart(4,"0")}</h2><p style={{margin:"5px 0 0",color:"var(--muted)"}}>Your order status updates automatically — no need to scan the QR again.</p></div>
            <span style={qrStatusPill}>{String(trackedOrder?.payment_status||"unpaid").toUpperCase()}</span>
          </div>
          <div style={qrTimeline}>
            {["preparing","ready"].map(step=>{
              const raw=String(trackedOrder?.status||"pending").toLowerCase();
              const aliases={pending:"preparing",new:"preparing",received:"preparing",confirmed:"preparing",accepted:"preparing",in_progress:"preparing",processing:"preparing",preparing:"preparing",done:"ready",completed:"ready",served:"ready",ready:"ready"};
              const current=aliases[raw] || "preparing";
              const active=current===step || orderHistory.some(h => (aliases[String(h.status||"").toLowerCase()] || "")===step);
              return <div key={step} style={qrTimelineStep}><span style={{...qrTimelineDot,opacity:active?1:.35}}>{active?"✓":"○"}</span><span>{step === "preparing" ? "Preparing" : "Ready"}</span></div>
            })}
          </div>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${advancedQrEnabled?4:2},minmax(0,1fr))`,gap:8,marginTop:14}}>
            {advancedQrEnabled && <button type="button" style={qrActionButton} onClick={()=>requestService("waiter")} disabled={!!serviceBusy}>🔔 {serviceBusy==="waiter"?"Calling…":"Call Waiter"}</button>}
            {advancedQrEnabled && <button type="button" style={qrActionButton} onClick={()=>requestService("bill")} disabled={!!serviceBusy}>🧾 {serviceBusy==="bill"?"Requesting…":"Request Bill"}</button>}
            <button type="button" style={qrActionButton} onClick={()=>document.querySelector(".qr-menu-grid")?.scrollIntoView({behavior:"smooth",block:"start"})}>➕ Add More</button>
            <button type="button" style={qrPayButton} onClick={()=>{ const token=encodeURIComponent(qrSessionToken||""); window.location.href=`/${slug}/pay/${type}/${id}?order_id=${encodeURIComponent(trackedOrderId)}#token=${token}` }}>💳 Pay Bill</button>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
            <button type="button" style={qrActionButton} onClick={copyTrackingLink}>🔗 {trackingCopied?"Tracking Link Copied":"Copy Tracking Link"}</button>
            <button type="button" style={qrActionButton} onClick={shareTrackingLink}>📤 Share Tracking</button>
          </div>
          {serviceMessage&&<div style={qrNotice}>{serviceMessage}</div>}
          {statusMessage&&<div style={qrNotice}>{statusMessage}</div>}
        </section>
      )}
      {trackedOrder && ["paid","settled"].includes(String(trackedOrder.payment_status||"").toLowerCase()) && (
        <section style={{...qrTrackerCard,borderColor:"rgba(var(--primary-rgb),.35)"}}>
          <div style={ratingEyebrow}>ORDER COMPLETE</div>
          <h2 style={{margin:"0 0 6px",fontSize:22}}>Order #{String(trackedOrder.order_number ?? trackedOrderId).padStart(4,"0")} · Paid</h2>
          <p style={{margin:0,color:"var(--muted)"}}>Payment received and bill finalized. This order is closed; the QR menu is ready for a new order.</p>
          {trackedOrder.invoice_no && <div style={{marginTop:10,fontWeight:800}}>Invoice: {trackedOrder.invoice_no}</div>}
          <button type="button" style={{...qrActionButton,marginTop:12}} onClick={()=>{setTrackedOrder(null);setTrackedOrderId("");setPaymentRequest(null);try{window.localStorage.removeItem(`anaira:qr-last-order:${slug}:${type}:${id}`)}catch{};window.history.replaceState(window.history.state,"",window.location.pathname)}}>Start New Order</button>
        </section>
      )}

      {showPayment && trackedOrderId && (
        <div style={overlay} onClick={()=>setShowPayment(false)}><div style={{...modal,maxWidth:520}} onClick={e=>e.stopPropagation()}>
          <h2 style={{marginTop:0}}>Pay Bill</h2>
          <div style={{fontSize:30,fontWeight:900,margin:"10px 0 18px"}}>₹{Number(paymentRequest?.amount ?? trackedOrder?.total_amount ?? 0).toFixed(2)}</div>
          <div style={{display:"grid",gap:10}}>
            {paymentConfig.auto_enabled && <button type="button" style={qrPayButton} disabled={paymentBusy} onClick={()=>startPayment("auto")}>⚡ Pay Online Automatically</button>}
            {paymentConfig.manual_enabled && <button type="button" style={qrActionButton} disabled={paymentBusy} onClick={()=>startPayment("manual_qr")}>📲 Pay with Restaurant QR</button>}
            {!paymentConfig.auto_enabled && !paymentConfig.manual_enabled && <div style={qrNotice}>Online payment is not configured for this restaurant. You can request the bill and pay directly at the counter.</div>}
          </div>
          {paymentRequest?.method==="manual_qr" && paymentRequest.status!=="paid" && (
            <div style={{marginTop:18,padding:16,borderRadius:16,border:"1px solid var(--border)",background:"var(--surface-2)"}}>
              <div style={{textAlign:"center",fontWeight:800,marginBottom:10}}>{paymentRequest.merchant_name||paymentConfig.merchant_name||"Restaurant"}</div>
              {paymentRequest.qr_image_url||paymentConfig.manual_qr_image_url ? <img src={paymentRequest.qr_image_url||paymentConfig.manual_qr_image_url} alt="Restaurant payment QR" style={{display:"block",width:220,height:220,objectFit:"contain",margin:"0 auto",background:"white",padding:10,borderRadius:12}}/> : paymentRequest.upi_uri ? <div style={{width:220,height:220,margin:"0 auto",background:"white",padding:10,borderRadius:12}}><QRCode value={paymentRequest.upi_uri} size={200}/></div> : null}
              {paymentRequest.upi_uri && <button type="button" style={{...qrActionButton,marginTop:10,width:"100%"}} onClick={()=>window.location.href=paymentRequest.upi_uri}>Open UPI App</button>}
              <input value={paymentReference} onChange={e=>setPaymentReference(e.target.value.slice(0,120))} placeholder="UTR / transaction reference (optional)" style={{width:"100%",boxSizing:"border-box",marginTop:10,padding:11,borderRadius:10,border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text)"}}/>
              <button type="button" style={{...qrPayButton,width:"100%",marginTop:10,position:"sticky",bottom:0,zIndex:4}} disabled={paymentBusy||paymentRequest.status==="customer_claimed"} onClick={claimManualPayment}>{paymentRequest.status==="customer_claimed"?"✓ Payment Sent for Verification":paymentBusy?"Sending…":"✓ I Have Paid"}</button>
              <small style={{display:"block",marginTop:8,color:"var(--muted)",lineHeight:1.5}}>This works with any restaurant QR image (PhonePe, Google Pay, Paytm, BharatPe, bank UPI, etc.). After paying, tap “I Have Paid”; the restaurant/waiter gets an alert and can manually verify and settle the bill.</small>
            </div>
          )}
          {paymentRequest?.status==="paid" && <div style={qrSuccess}>✓ Payment received</div>}
          {paymentRequest?.status!=="paid" && paymentConfig.auto_enabled && <small style={{display:"block",marginTop:12,color:"var(--muted)"}}>Automatic payment uses the enabled payment-gateway plugin and is confirmed by the provider webhook. Manual QR payments are never auto-marked paid just because the customer tapped “I Have Paid”.</small>}
          <button type="button" style={{...secondary,width:"100%",marginTop:14}} onClick={()=>setShowPayment(false)}>Close</button>
        </div></div>
      )}

      {feedbackEnabled && <section id="qr-rating" style={ratingCard}>
        <div style={ratingEyebrow}>YOUR EXPERIENCE MATTERS</div>
        <div style={ratingTop}>
          <div>
            <h2 style={{margin:0,fontSize:24,lineHeight:1.15}}>Rate your experience</h2>
            <p style={{margin:"7px 0 0",color:"var(--muted)",fontSize:14,lineHeight:1.5}}>Tell us how the food and service were.</p>
          </div>
          {ratingSummary.count > 0 && (
            <div style={ratingSummaryBox}>
              <strong>⭐ {Number(ratingSummary.average||0).toFixed(1)}</strong>
              <span>{ratingSummary.count} {ratingSummary.count===1?"review":"reviews"}</span>
            </div>
          )}
        </div>

        {!ratingSent ? <div style={{marginTop:20}}>
          <div style={ratingStarsWrap} onMouseLeave={() => setRatingHover(0)}>
            <div style={ratingStars}>
              {[1,2,3,4,5].map(star => (
                <button
                  key={star}
                  type="button"
                  aria-label={`Rate ${star} out of 5`}
                  onMouseEnter={() => setRatingHover(star)}
                  onFocus={() => setRatingHover(star)}
                  onClick={() => setRating(star)}
                  style={{
                    ...ratingStarButton,
                    color:star <= (ratingHover||rating) ? "var(--warning)" : "rgba(255,255,255,.22)",
                    transform:star <= (ratingHover||rating) ? "scale(1.08)" : "scale(1)"
                  }}
                >★</button>
              ))}
            </div>
            <span style={ratingSelected}>{rating ? `${rating}/5 selected` : "Tap a star"}</span>
          </div>

          <textarea
            value={ratingFeedback}
            onChange={e=>setRatingFeedback(e.target.value)}
            placeholder="Optional feedback — what did you love or what can we improve?"
            maxLength={1000}
            rows={4}
            style={ratingTextarea}
          />
          {ratingError && <div style={ratingErrorBox}>{ratingError}</div>}
          <button type="button" onClick={submitRating} disabled={ratingSending} style={{...ratingButton,opacity:ratingSending?.65:1}}>
            {ratingSending ? "Saving…" : "Submit Rating ⭐"}
          </button>
        </div> : (
          <div style={ratingThanks}>
            <div style={{fontSize:42}}>🙏</div>
            <b>Thank you for your rating!</b>
            <span>Your feedback helps us serve you better.</span>
          </div>
        )}
      </section>}

      {cart.length > 0 && (

  <div
    style={floatingCart}
    onClick={() => setShowCart(true)}
  >

    <div>
      <div style={{fontWeight:"bold"}}>
        🛒 {cart.reduce((t,i)=>t+i.qty,0)} Items
      </div>

      <div style={{
        fontSize:12,
        color:"var(--muted)"
      }}>
        Tap to view cart
      </div>
    </div>

    <div
      style={{
        fontWeight:"bold",
        fontSize:18
      }}
    >
      ₹{grandTotal.toFixed(2)}
    </div>

  </div>

)}
      {showCart && (
  <div
    style={drawerOverlay}
    onClick={() => setShowCart(false)}
  >

    <div
      style={drawer}
      onClick={(e) => e.stopPropagation()}
    >

      <div style={drawerHeader}>

<div>

<h2 style={{margin:0}}>

Checkout

</h2>

<div style={drawerSub}>

Premium Dining Experience

</div>

</div>

<div style={checkoutBadge}>

{cart.reduce((t,i)=>t+i.qty,0)}

Items

</div>

</div>

      {cart.map(item => (
        <div

key={item.cartKey || item.id}

style={premiumCartItem}

>
        <div style={{marginTop:8}}>

  <div
    style={{
      display:"flex",
      gap:6,
      flexWrap:"wrap",
      marginBottom:8
    }}
  >

    {[
      "Less Spicy",
      "Extra Spicy",
      "No Onion",
      "No Garlic",
      "Extra Butter"
    ].map(req => (

      <button
        key={req}
        style={quickBtn}
        onClick={()=>{
          setCart(prev =>
            prev.map(i =>
              i.cartKey === item.cartKey
                ? {
                    ...i,
                    cooking_request:req
                  }
                : i
            )
          )
        }}
      >
        {req}
      </button>

    ))}

  </div>
  <div
style={{
marginBottom:8,
fontWeight:600
}}
>

Cooking Instructions

</div>

  <textarea
    value={item.cooking_request || ""}
    placeholder="Cooking request (optional)"
    onChange={(e)=>{

      setCart(prev =>
        prev.map(i =>
          i.cartKey === item.cartKey
            ? {
                ...i,
                cooking_request:e.target.value
              }
            : i
        )
      )

    }}
    style={{
      width:"100%",
      padding:10,
      borderRadius:10,
      border:"1px solid rgba(255,255,255,.1)",
      background:"var(--surface-2)",
      color:"var(--text)",
      resize:"none"
    }}
  />

</div>

          <div
style={{
display:"flex",
gap:12,
alignItems:"center"
}}
>

<img

src={item.image}

style={cartFoodImage}

/>

<div>

<div
style={{
fontWeight:700
}}
>

{item.name}{item.variant_name ? ` — ${item.variant_name}` : ""}

</div>

<div
style={{
fontSize:13,
color:"var(--muted)"
}}
>
₹{getComboUnitPrice(item, item.combo_selection || []).toFixed(2)}
</div>

</div>

</div>

          <div
  style={{
    display:"flex",
    alignItems:"center",
    gap:6
  }}
>

  <button
    type="button"
    className="qr-delete-btn"
    style={deleteBtn}
    onClick={() => removeItem(item.cartKey)}
  >
    🗑️
  </button>

  <button
    style={qtyBtn}
    onClick={() => updateQty(item.cartKey,-1)}
  >
    −
  </button>

  <span>{item.qty}</span>

  <button
    style={qtyBtn}
    onClick={() => updateQty(item.cartKey,1)}
  >
    +
  </button>


          </div>

        </div>
      ))}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <input
            value={customerName}
            onChange={e=>setCustomerName(e.target.value.slice(0,80))}
            placeholder="Your name (optional)"
            style={{width:"100%",boxSizing:"border-box",padding:"12px 13px",borderRadius:12,border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text)"}}
          />
          <input
            value={customerPhone}
            onChange={e=>setCustomerPhone(e.target.value.replace(/[^0-9+ ]/g,"").slice(0,18))}
            placeholder="WhatsApp number (optional)"
            inputMode="tel"
            style={{width:"100%",boxSizing:"border-box",padding:"12px 13px",borderRadius:12,border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text)"}}
          />
        </div>
        <div style={{fontSize:11,color:"var(--muted)",marginBottom:10}}>
          Name and WhatsApp number are optional. Enter WhatsApp only if you want order confirmation. To send the order from your own WhatsApp to the restaurant, WhatsApp requires your confirmation/tap.
        </div>
<textarea
  value={orderNote}
  onChange={(e)=>setOrderNote(e.target.value)}
  
  placeholder="Special instruction for entire order..."
  style={{
    width:"100%",
    marginTop:15,
    padding:12,
    borderRadius:12,
    border:"1px solid rgba(255,255,255,.1)",
    background:"var(--surface-2)",
    color:"var(--text)",
    resize:"none"
  }}
/>
<div style={billBox}>

<div style={billRow}>

<span>

Subtotal

</span>

<b>

₹{subtotal}

</b>

</div>

<div style={billRow}>

<span>

GST

</span>

<b>
₹{qrGst.toFixed(2)}
</b>

</div>

{activeOffer && discountAmount > 0 && (
  <div style={{...billRow, color:"var(--success)"}}>
    <span>🎁 {activeOffer.title || "Offer"} Applied</span>
    <b>
      {activeOffer.discount_type === "flat"
        ? `₹${activeOffer.discount} OFF`
        : `${activeOffer.discount}% OFF`}
    </b>
  </div>
)}

<div style={billRow}>

<span>

Offer Discount

</span>

<b style={{color:"var(--success)"}}>

-₹{discountAmount.toFixed(2)}

</b>

</div>

<div style={billRow}>

<span>

Delivery

</span>

<b>

Free

</b>

</div>

<hr
style={{
margin:"14px 0"
}}
/>

<div style={billRow}>

<b>Total</b>

<b>

₹{grandTotal.toFixed(2)}

</b>

</div>

</div>
<div style={estimateBox}>

⏱ Estimated Preparation

<b>

20 Minutes

</b>

</div>

      <div style={total}>
  ₹{grandTotal.toFixed(2)}
</div>

      <button
        style={btn}
        onClick={placeOrder}
      >
        ✨ Confirm Order
      </button>

      <button
        style={{
          ...btn,
          marginTop:10,
          background:"var(--muted)"
        }}
        onClick={() => setShowCart(false)}
      >
        Close
      </button>

    </div>

  </div>
)}
{showFoodModal && selectedFood && (

<div
  style={foodOverlay}
  onClick={() => setShowFoodModal(false)}
>

  <div
    style={foodModal}
    className="qr-food-modal"
    onClick={(e)=>e.stopPropagation()}
  >
    <div
  style={modalClose}
  onClick={()=>{
    setShowFoodModal(false)
    setSelectedFood(null)
    setModalQty(1)
    setModalRequest("")
    setComboSelection([])
  }}
>
  ✕
</div>

    <img
      src={selectedFood.image}
      alt={selectedFood.name}
      style={foodHero}
    />

    <div style={{padding:20}}>

      <h2
        style={{
          margin:0,
          fontSize:28
        }}
      >
        {selectedFood.name}
      </h2>

      <p
        style={foodDescription}
      >
        {selectedFood.description || "No description available."}
      </p>

      <div style={foodMeta}>

        ⭐ {Number(ratingSummary.average||0) > 0 ? Number(ratingSummary.average).toFixed(1) : "New"}
        <span>•</span>
        {selectedFood?.preparation_time_minutes ? `${selectedFood.preparation_time_minutes} mins` : "Freshly Prepared"}
        <span>•</span>
        {selectedFood?.popular ? "Popular" : "Chef Special"}

      </div>

      <div style={modalPrice}>
        ₹{selectedFood?.item_type !== "combo" && Array.isArray(selectedFood?.variants) && selectedFood.variants.length
          ? (selectedFood.variants || []).reduce((sum,v)=>sum + (Number(selectedFood.price||0)+Number(v.price_delta||0))*Number(variantQuantities[v.id]||0),0).toFixed(2)
          : getUnitPrice(selectedFood, comboSelection, variantSelection).toFixed(2)}
      </div>

      {selectedFood.item_type !== "combo" && Array.isArray(selectedFood.variants) && selectedFood.variants.length > 0 && (
        <div style={comboModalBox}>
          <div style={{display:"flex",justifyContent:"space-between",gap:10}}><b>📏 Choose variant quantities</b><small>Each variant has its own quantity</small></div>
          <div style={{display:"grid",gap:8,marginTop:10}}>
            {selectedFood.variants.map(v => { const q=Number(variantQuantities[v.id]||0); return <div key={v.id} style={{...comboChoice,...(q>0?comboChoiceActive:{})}}>
              <span><b>{v.name}</b><small style={{display:"block",opacity:.72}}>₹{(Number(selectedFood.price||0)+Number(v.price_delta||0)).toFixed(2)} each</small></span>
              <span style={{display:"flex",alignItems:"center",gap:8}}><button type="button" className="qr-qty-btn" style={qtyBtn} onClick={()=>setVariantQuantities(p=>({...p,[v.id]:Math.max(0,q-1)}))}>−</button><b style={{minWidth:24,textAlign:"center"}}>{q}</b><button type="button" className="qr-qty-btn" style={qtyBtn} onClick={()=>setVariantQuantities(p=>({...p,[v.id]:q+1}))}>+</button></span>
            </div> })}
          </div>
        </div>
      )}

      {selectedFood.item_type === "combo" && (selectedFood.combo_config?.mode === "fixed" ? (
        <div style={comboModalBox}>
          <b>🍱 Included in this combo</b>
          <div style={{display:"grid",gap:7,marginTop:10}}>
            {(selectedFood.combo_config?.items || []).map(row => {
              const component = menu.find(m => m.id === row.item_id)
              const variant=(component?.variants||[]).find(v=>String(v.id)===String(row.variant_id)); return <div key={`${row.item_id}:${row.variant_id||"base"}`} style={comboLine}>✓ {row.quantity || 1} × {component?.name || "Item"}{variant ? ` — ${variant.name}` : ""}</div>
            })}
          </div>
        </div>
      ) : (
        <div style={comboModalBox}>
          <div style={{display:"flex",justifyContent:"space-between",gap:10}}><b>🍱 {selectedFood.combo_config?.groups?.[0]?.name || "Choose your option"}</b><small>{selectedFood.combo_config?.groups?.[0]?.min || 1}-{selectedFood.combo_config?.groups?.[0]?.max || 1}</small></div>
          <div style={{display:"grid",gap:8,marginTop:10}}>
            {(selectedFood.combo_config?.groups?.[0]?.options || []).map(option => {
                            const component = menu.find(m => m.id === option.item_id)
              const chosenRow = comboSelection.find(x => String(typeof x === "string" ? x : x?.item_id) === String(option.item_id))
              const chosen = !!chosenRow
              const variants = (component?.variants || []).filter(v => v.active !== false)
              const chosenVariantId = typeof chosenRow === "string" ? "" : chosenRow?.variant_id || ""
              return <div key={option.item_id} style={{...comboChoice, ...(chosen ? comboChoiceActive : {})}}>
                <button type="button" style={{border:0,background:"transparent",color:"inherit",padding:0,display:"flex",justifyContent:"space-between",width:"100%",cursor:"pointer",textAlign:"left"}} onClick={() => { const max=Number(selectedFood.combo_config?.groups?.[0]?.max || 1); setComboSelection(prev => { const exists=prev.some(x=>String(typeof x === "string" ? x : x?.item_id)===String(option.item_id)); return exists ? prev.filter(x=>String(typeof x === "string" ? x : x?.item_id)!==String(option.item_id)) : (prev.length>=max ? prev : [...prev,{item_id:option.item_id,variant_id:null}]) }) }}><span>{chosen ? "✓" : "○"} {component?.name || "Item"}</span><span>{Number(option.price_delta || 0) > 0 ? `+₹${Number(option.price_delta).toFixed(2)}` : Number(option.price_delta || 0) < 0 ? `−₹${Math.abs(Number(option.price_delta)).toFixed(2)}` : "Included"}</span></button>
                {chosen && variants.length > 0 && <select value={chosenVariantId} onChange={e => setComboSelection(prev => prev.map(x => String(typeof x === "string" ? x : x?.item_id)===String(option.item_id) ? {item_id:option.item_id,variant_id:e.target.value||null} : x))} style={{marginTop:7,width:"100%",padding:8,borderRadius:8,border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text)"}}><option value="">Base item</option>{variants.map(v=><option key={v.id} value={v.id}>{v.name} · +₹{Number(v.price_delta||0).toFixed(2)}</option>)}</select>}
              </div>
            })}
          </div>
        </div>
      ))}

      {!(selectedFood?.item_type !== "combo" && Array.isArray(selectedFood?.variants) && selectedFood.variants.length > 0) && (
        <div style={modalQtyBox}>
          <button type="button" className="qr-qty-btn qr-modal-qty-btn" style={qtyBtn} onClick={()=>{if(modalQty>1)setModalQty(modalQty-1)}}>−</button>
          <div style={{fontSize:20,fontWeight:700,minWidth:40,textAlign:"center"}}>{modalQty}</div>
          <button type="button" className="qr-qty-btn qr-modal-qty-btn" style={qtyBtn} onClick={()=>setModalQty(modalQty+1)}>+</button>
        </div>
      )}

      <h3
  style={{
    marginTop:30,
    marginBottom:12,
    fontSize:20
  }}
>
  📝 Cooking Instructions
</h3>

<p
  style={{
    color:"var(--muted)",
    fontSize:14,
    marginBottom:12,
    lineHeight:1.6
  }}
>
  Add any special instructions for the chef (optional).
</p>

<textarea
  value={modalRequest}
  onChange={(e)=>setModalRequest(e.target.value)}
  placeholder="Example: No onion, less spicy, extra crispy, cut into 4 pieces, serve hot..."
  style={modalTextarea}
/>

      <div className="qr-food-modal-actions"><button
  style={modalButton}
  onClick={()=>{

    const cfg = selectedFood?.combo_config || {}
    const group = cfg?.groups?.[0] || null
    if (selectedFood?.item_type === "combo" && group) {
      const min = Number(group.min || 0)
      const max = Number(group.max || min)
      if (comboSelection.length < min || comboSelection.length > max) {
        alert(`Please select ${min === max ? min : `${min}-${max}`} option(s).`)
        return
      }
    }
    const comboSelectionRows = comboSelection.map(row => typeof row === "string" ? ({ item_id: row }) : ({ item_id: row.item_id, variant_id: row.variant_id || null }))
    const hasVariants = selectedFood?.item_type !== "combo" && Array.isArray(selectedFood?.variants) && selectedFood.variants.length
    if (hasVariants) {
      const chosenVariants = (selectedFood.variants || []).map(v => ({ v, qty: Number(variantQuantities[v.id] || 0) })).filter(x => x.qty > 0)
      if (!chosenVariants.length) { alert("Please select at least one variant quantity."); return }
      chosenVariants.forEach(({v,qty}) => {
        addToCart({
          ...selectedFood,
          qty: qty,
          price: Number(selectedFood.price || 0) + Number(v.price_delta || 0),
          comboBasePrice: Number(selectedFood.price || 0),
          cooking_request:modalRequest,
          combo_selection:[],
          variant_id: v.id,
          variant_name: v.name,
          cartKey: `${selectedFood.id}:variant:${v.id}`
        })
      })
    } else {
      const configuredPrice = getUnitPrice(selectedFood, comboSelectionRows, null)
      addToCart({
        ...selectedFood,
        qty:modalQty,
        price: configuredPrice,
        comboBasePrice: Number(selectedFood.price || 0),
        cooking_request:modalRequest,
        combo_selection:comboSelectionRows,
        variant_id: null,
        variant_name: null,
        cartKey: `${selectedFood.id}:base`
      })
    }
    setShowFoodModal(false)
    setModalQty(1)
    setModalRequest("")
    setComboSelection([])
    setVariantSelection(null)
    setVariantQuantities({})
    setSelectedFood(null)

  }}
>

  Add To Cart • ₹{(selectedFood?.item_type !== "combo" && Array.isArray(selectedFood?.variants) && selectedFood.variants.length
    ? (selectedFood.variants || []).reduce((sum,v)=>sum + (Number(selectedFood.price||0)+Number(v.price_delta||0))*Number(variantQuantities[v.id]||0),0)
    : getUnitPrice(selectedFood, comboSelection, variantSelection) * modalQty).toFixed(2)}

</button></div>

    </div>

  </div>

</div>

)}

      <div className="qr-branding-footer">
        <img src="/anaira-branding.png" alt="Anaira Graphics" />
        <span>Powered by Anaira Graphics</span>
      </div>

<style jsx global>{`
.qr-page .qr-food-modal{max-height:calc(100dvh - 24px);overflow:auto;display:flex;flex-direction:column}
.qr-page .qr-food-modal-actions{position:sticky;bottom:0;background:linear-gradient(to top,var(--surface) 78%,transparent);padding:14px 0 2px;margin-top:12px;z-index:8}.qr-page .qr-food-modal-actions button{width:100%;min-height:52px}.qr-page .qr-food-modal{max-height:calc(100dvh - 20px);overflow-y:auto;-webkit-overflow-scrolling:touch}
.qr-page .qr-food-modal-actions button{width:100%;min-height:50px}
.qr-page .qr-payment-page-link{min-height:46px}
.qr-page{overflow-x:hidden}.qr-page button{touch-action:manipulation}.qr-menu-grid{align-items:stretch}.qr-page .qr-menu-grid{grid-template-columns:repeat(5,minmax(0,1fr))!important}.qr-page .qr-menu-grid>div{min-width:0!important}.qr-page .qr-menu-grid img{width:100%!important;height:120px!important;min-height:120px!important;object-fit:cover!important}.qr-page .qr-menu-grid>div>div{padding:10px!important;gap:6px!important}.qr-page .qr-menu-grid h3{font-size:13px!important;line-height:1.2!important;min-height:31px!important;height:31px!important;margin:0 0 3px!important}.qr-page .qr-menu-grid span[style*="font-size:18px"]{font-size:15px!important}@media(max-width:900px){.qr-page .qr-menu-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px!important;padding:10px 8px!important}.qr-page .qr-menu-grid img{height:105px!important;min-height:105px!important}.qr-page .qr-menu-grid>div>div{padding:8px!important}.qr-page .qr-menu-grid h3{font-size:11px!important;line-height:1.15!important;min-height:26px!important;height:26px!important}.qr-page .qr-menu-grid span[style*="font-size:18px"]{font-size:13px!important}.qr-page .qr-menu-grid>div>div button:not(.qr-qty-btn){padding:6px 8px!important;font-size:10px!important;min-height:30px!important}}@media(max-width:760px){.qrTimeline{grid-template-columns:repeat(2,1fr)!important}.qrTrackerCard{width:calc(100% - 20px)!important}.qr-page .qr-header-actions{flex-wrap:wrap}}@media(max-width:520px){.qr-page .qr-header{padding:12px!important}.qr-page .qr-hero{height:230px!important}.qr-page .qr-action-row{grid-template-columns:1fr!important}}


@keyframes bannerFade{

from{

opacity:.3;

transform:scale(1.04);

}

to{

opacity:1;

transform:scale(1);

}

}

@keyframes marquee{

0%{

transform:translateX(0);

}

100%{

transform:translateX(-50%);

}

}


.qr-menu-grid{
  grid-template-columns:repeat(5,minmax(0,1fr));
}

@media (min-width:901px){
  .qr-menu-grid{
    max-width:1280px;
    margin-left:auto;
    margin-right:auto;
    gap:16px;
  }
}

@media (min-width:601px) and (max-width:900px){
  .qr-menu-grid{
    grid-template-columns:repeat(4,minmax(0,1fr));
    gap:14px;
    padding:16px 12px;
  }
  .qr-menu-grid > div{
    min-width:0 !important;
    border-radius:16px !important;
  }
  .qr-menu-grid img{
    height:145px !important;
    min-height:145px !important;
    object-fit:cover !important;
  }
  .qr-menu-grid > div > div{
    padding:11px 10px 12px !important;
    gap:7px !important;
  }
  .qr-menu-grid h3{
    font-size:13px !important;
    line-height:1.25 !important;
    min-height:33px !important;
    height:33px !important;
    margin-bottom:4px !important;
  }
  .qr-menu-grid span[style*="font-size:18px"]{
    font-size:15px !important;
  }
  .qr-menu-grid > div > div button:not(.qr-qty-btn){
    padding:7px 11px !important;
    font-size:11px !important;
    border-radius:9px !important;
    min-height:34px !important;
  }
}

@media (min-width:381px) and (max-width:600px){
  .qr-menu-grid{
    grid-template-columns:repeat(3,minmax(0,1fr));
    gap:11px;
    padding:12px 9px;
  }
  .qr-menu-grid > div{
    min-width:0 !important;
    width:100%;
    border-radius:13px !important;
    box-shadow:0 7px 18px rgba(0,0,0,.24) !important;
  }
  .qr-menu-grid img{
    width:100% !important;
    height:118px !important;
    min-height:118px !important;
    object-fit:cover !important;
  }
  .qr-menu-grid > div > div{
    padding:8px 7px 9px !important;
    gap:6px !important;
  }
  .qr-menu-grid h3{
    font-size:11px !important;
    line-height:1.2 !important;
    min-height:27px !important;
    height:27px !important;
    margin:0 0 3px !important;
  }
  .qr-menu-grid span[style*="font-size:18px"]{
    font-size:13px !important;
    line-height:1.1 !important;
  }
  .qr-menu-grid > div > div button:not(.qr-qty-btn){
    padding:6px 8px !important;
    font-size:10px !important;
    line-height:1.1 !important;
    border-radius:8px !important;
    min-height:30px !important;
  }
}

@media (max-width:380px){
  .qr-menu-grid{
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:10px;
    padding:10px 8px;
  }
  .qr-menu-grid > div{
    min-width:0 !important;
    width:100%;
    border-radius:13px !important;
    box-shadow:0 6px 16px rgba(0,0,0,.23) !important;
  }
  .qr-menu-grid img{
    width:100% !important;
    height:125px !important;
    min-height:125px !important;
    object-fit:cover !important;
  }
  .qr-menu-grid > div > div{
    padding:8px 7px 9px !important;
    gap:6px !important;
  }
  .qr-menu-grid h3{
    font-size:11px !important;
    line-height:1.2 !important;
    min-height:27px !important;
    height:27px !important;
    margin:0 0 3px !important;
  }
  .qr-menu-grid span[style*="font-size:18px"]{
    font-size:13px !important;
    line-height:1.1 !important;
  }
  .qr-menu-grid > div > div button:not(.qr-qty-btn){
    padding:6px 9px !important;
    font-size:10px !important;
    line-height:1.1 !important;
    border-radius:8px !important;
    min-height:32px !important;
  }
  .qr-header{
    padding:12px !important;
  }
}

.qr-page .qr-menu-grid{grid-template-columns:repeat(5,minmax(0,1fr))!important}.qr-page .qr-menu-grid img{height:120px!important;min-height:120px!important}@media(max-width:900px){.qr-page .qr-menu-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}.qr-page .qr-menu-grid img{height:105px!important;min-height:105px!important}}@media(max-width:420px){
  .qr-page .qr-menu-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;padding:10px 8px!important}
  .qr-page .qr-menu-grid img{height:118px!important;min-height:118px!important}
  .qr-page .qr-menu-grid>div>div{padding:8px 7px!important}
  .qr-page .qr-menu-grid h3{font-size:11px!important;min-height:27px!important;height:27px!important}
  .qr-page .qr-menu-grid>div>div button:not(.qr-qty-btn){padding:6px 8px!important;font-size:10px!important;min-height:30px!important}
}
@media(min-width:421px) and (max-width:520px){
  .qr-page .qr-menu-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:9px!important;padding:9px 7px!important}
  .qr-page .qr-menu-grid img{height:100px!important;min-height:100px!important}
  .qr-page .qr-menu-grid>div>div{padding:7px 6px!important}
  .qr-page .qr-menu-grid h3{font-size:10px!important;min-height:25px!important;height:25px!important}
  .qr-page .qr-menu-grid>div>div button:not(.qr-qty-btn){padding:5px 6px!important;font-size:9px!important;min-height:29px!important}
}
@media(max-width:767px){
  .qr-page input,.qr-page select,.qr-page textarea{font-size:16px!important}
  .qr-page button,.qr-page a{touch-action:manipulation}
  .qr-page .qr-floating-cart{bottom:calc(14px + env(safe-area-inset-bottom))!important}
}

/* Round, touch-friendly quantity controls. */
.qr-qty-btn{
  width:42px !important;
  height:42px !important;
  min-width:42px !important;
  min-height:42px !important;
  padding:0 !important;
  border-radius:50% !important;
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  flex:0 0 42px !important;
  font-size:21px !important;
  line-height:1 !important;
  font-weight:800 !important;
  box-sizing:border-box !important;
  touch-action:manipulation;
  -webkit-tap-highlight-color:transparent;
}

.qr-qty-btn:active,
.qr-delete-btn:active{
  transform:scale(.93);
}

.qr-delete-btn{
  width:42px !important;
  height:42px !important;
  min-width:42px !important;
  min-height:42px !important;
  padding:0 !important;
  border-radius:50% !important;
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  flex:0 0 42px !important;
  box-sizing:border-box !important;
  line-height:1 !important;
  touch-action:manipulation;
  -webkit-tap-highlight-color:transparent;
}

.qr-modal-qty-btn{
  width:50px !important;
  height:50px !important;
  min-width:50px !important;
  min-height:50px !important;
  flex-basis:50px !important;
  font-size:25px !important;
}

@media (max-width:600px){
  .qr-qty-btn{
    width:40px !important;
    height:40px !important;
    min-width:40px !important;
    min-height:40px !important;
    flex-basis:40px !important;
    font-size:20px !important;
  }
  .qr-modal-qty-btn{
    width:48px !important;
    height:48px !important;
    min-width:48px !important;
    min-height:48px !important;
    flex-basis:48px !important;
    font-size:24px !important;
  }
}

@media (max-width:380px){
  .qr-qty-btn{
    width:38px !important;
    height:38px !important;
    min-width:38px !important;
    min-height:38px !important;
    flex-basis:38px !important;
    font-size:19px !important;
  }
  .qr-modal-qty-btn{
    width:46px !important;
    height:46px !important;
    min-width:46px !important;
    min-height:46px !important;
    flex-basis:46px !important;
    font-size:23px !important;
  }
}

.qr-category-bar{
  overflow-x:auto;
  scrollbar-width:none;
  -webkit-overflow-scrolling:touch;
}
.qr-category-bar::-webkit-scrollbar{display:none;}
.qr-search-box{max-width:1280px;margin:0 auto;}
.qr-header-action:active{transform:scale(.97);}

@media (max-width:600px){
  .qr-header-actions{gap:6px !important;}
  .qr-header-action{
    padding:0 9px !important;
    min-height:40px !important;
    border-radius:12px !important;
    font-size:12px !important;
  }
}

/* Food-detail modal stays usable on phone, tablet and desktop. */
@media (min-width:601px){
  .qr-page [style*="maxWidth:500"]{
    border-radius:24px !important;
    margin:0 16px 16px !important;
  }
}

@media (max-width:600px){
  .qr-page [style*="maxWidth:500"]{
    max-width:560px !important;
    width:100% !important;
  }
}
        /* Anaira QR premium compact system: dense 3-column menu, glass surfaces, clear hierarchy. */
        .qr-page{
          background:
            radial-gradient(circle at 8% 0%,rgba(var(--primary-rgb),.10),transparent 28%),
            radial-gradient(circle at 92% 8%,rgba(var(--accent-rgb),.08),transparent 26%),
            var(--background)!important;
        }
        .qr-page .qr-hero{
          height:300px!important;
          border-bottom-left-radius:28px;
          border-bottom-right-radius:28px;
          box-shadow:0 20px 55px rgba(0,0,0,.30);
        }
        .qr-page .qr-hero:after{
          content:"";position:absolute;inset:0;pointer-events:none;
          background:linear-gradient(180deg,rgba(0,0,0,.05) 25%,rgba(0,0,0,.18) 52%,rgba(0,0,0,.78) 100%);
        }
        .qr-page .qr-header{
          margin:-1px auto 0!important;
          padding:14px 18px!important;
          background:rgba(var(--surface-rgb),.78)!important;
          border-bottom:1px solid rgba(var(--primary-rgb),.14)!important;
          box-shadow:0 10px 35px rgba(0,0,0,.16)!important;
        }
        .qr-page .qr-header>div{max-width:1280px;margin:0 auto;}
        .qr-page .qr-header img{
          width:56px!important;height:56px!important;border-width:2px!important;
          box-shadow:0 8px 24px rgba(var(--primary-rgb),.24)!important;
        }
        .qr-page .qr-header h1{font-size:20px!important;letter-spacing:-.25px;}
        .qr-page .qr-header-action{
          border-color:rgba(var(--primary-rgb),.18)!important;
          background:rgba(var(--surface-2-rgb),.72)!important;
          box-shadow:0 8px 22px rgba(0,0,0,.14)!important;
          backdrop-filter:blur(14px);
        }
        .qr-page .qr-search-box{
          height:54px!important;border-radius:16px!important;
          border-color:rgba(var(--primary-rgb),.16)!important;
          background:rgba(var(--surface-rgb),.74)!important;
          box-shadow:0 12px 30px rgba(0,0,0,.14)!important;
        }
        .qr-page .qr-category-bar{
          max-width:1280px;margin:0 auto;
          border:1px solid rgba(var(--primary-rgb),.10);
          border-radius:16px;
          background:rgba(var(--surface-rgb),.68)!important;
          backdrop-filter:blur(18px);
          box-shadow:0 10px 25px rgba(0,0,0,.10);
          top:84px!important;
        }
        .qr-page .qr-category-bar button{
          min-height:38px;border-radius:11px!important;font-size:11px!important;
          padding:8px 13px!important;font-weight:800!important;
        }
        .qr-page .qr-menu-grid{
          grid-template-columns:repeat(3,minmax(0,1fr))!important;
          gap:14px!important;padding:18px 16px 120px!important;
          max-width:1280px!important;
        }
        .qr-page .qr-menu-grid>div{
          border-radius:18px!important;
          border-color:rgba(var(--primary-rgb),.12)!important;
          background:linear-gradient(180deg,rgba(var(--surface-rgb),.92),rgba(var(--surface-2-rgb),.78))!important;
          box-shadow:0 12px 30px rgba(0,0,0,.16)!important;
          backdrop-filter:blur(12px);
          overflow:hidden;
        }
        .qr-page .qr-menu-grid>div:hover{
          border-color:rgba(var(--primary-rgb),.32)!important;
          box-shadow:0 18px 38px rgba(0,0,0,.22)!important;
        }
        .qr-page .qr-menu-grid img{
          height:145px!important;min-height:145px!important;
          object-fit:cover!important;display:block;
        }
        .qr-page .qr-menu-grid>div>div{
          padding:10px!important;gap:7px!important;
        }
        .qr-page .qr-menu-grid h3{
          font-size:12px!important;line-height:1.22!important;
          min-height:30px!important;height:30px!important;
          letter-spacing:-.1px;
        }
        .qr-page .qr-menu-grid span[style*="font-size:18px"]{
          font-size:14px!important;font-weight:900!important;
        }
        .qr-page .qr-menu-grid>div>div button:not(.qr-qty-btn){
          min-height:34px!important;padding:7px 10px!important;
          border-radius:10px!important;font-size:10px!important;font-weight:900!important;
          box-shadow:none!important;
        }
        .qr-page .qr-menu-grid .qr-qty-btn{
          width:34px!important;height:34px!important;min-width:34px!important;min-height:34px!important;
          flex-basis:34px!important;font-size:17px!important;
        }
        .qr-page .qrTrackerCard{
          margin-top:18px!important;border-radius:20px!important;
          background:linear-gradient(145deg,rgba(var(--surface-rgb),.94),rgba(var(--surface-2-rgb),.84))!important;
          border-color:rgba(var(--primary-rgb),.16)!important;
          box-shadow:0 18px 45px rgba(0,0,0,.18)!important;
        }
        .qr-page .qr-header-actions{gap:7px!important;}
        @media(max-width:700px){
          .qr-page .qr-hero{height:250px!important;border-radius:0 0 22px 22px;}
          .qr-page .qr-header{padding:11px 10px!important;}
          .qr-page .qr-header h1{font-size:16px!important;}
          .qr-page .qr-header img{width:48px!important;height:48px!important;}
          .qr-page .qr-header-action{min-height:38px!important;padding:0 9px!important;font-size:10px!important;}
          .qr-page .qr-search-box{height:50px!important;}
          .qr-page .qr-category-bar{margin:0 8px!important;top:74px!important;padding:7px!important;gap:6px!important;}
          .qr-page .qr-menu-grid{gap:9px!important;padding:12px 8px 118px!important;}
          .qr-page .qr-menu-grid img{height:96px!important;min-height:96px!important;}
          .qr-page .qr-menu-grid>div>div{padding:7px!important;gap:5px!important;}
          .qr-page .qr-menu-grid h3{font-size:10px!important;min-height:24px!important;height:24px!important;}
          .qr-page .qr-menu-grid span[style*="font-size:18px"]{font-size:12px!important;}
          .qr-page .qr-menu-grid>div>div button:not(.qr-qty-btn){min-height:30px!important;padding:5px 6px!important;font-size:9px!important;border-radius:8px!important;}
          .qr-page .qr-menu-grid .qr-qty-btn{width:30px!important;height:30px!important;min-width:30px!important;min-height:30px!important;flex-basis:30px!important;font-size:16px!important;}
        }
        @media(max-width:380px){
          .qr-page .qr-menu-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important;padding-left:6px!important;padding-right:6px!important;}
          .qr-page .qr-menu-grid img{height:82px!important;min-height:82px!important;}
          .qr-page .qr-menu-grid h3{font-size:9px!important;min-height:22px!important;height:22px!important;}
          .qr-page .qr-menu-grid>div>div{padding:6px 5px!important;}
          .qr-page .qr-menu-grid>div>div button:not(.qr-qty-btn){font-size:8px!important;padding:4px!important;min-height:28px!important;}
        }
        }`}</style>

</div>
)
}

/* STYLES */

const qrTrackerCard={margin:"22px auto 0",width:"min(760px,calc(100% - 32px))",boxSizing:"border-box",padding:"20px",borderRadius:20,background:"var(--surface)",border:"1px solid rgba(var(--primary-rgb),.25)",boxShadow:"0 14px 36px rgba(0,0,0,.18)"}
const qrTimeline={display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginTop:18}
const qrTimelineStep={display:"flex",flexDirection:"column",alignItems:"center",gap:6,fontSize:11,fontWeight:800,color:"var(--muted)",textAlign:"center"}
const qrTimelineDot={width:26,height:26,borderRadius:"50%",display:"grid",placeItems:"center",background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--primary)",fontWeight:900}
const qrStatusPill={padding:"6px 9px",borderRadius:999,background:"rgba(var(--primary-rgb),.12)",color:"var(--primary)",fontSize:10,fontWeight:900,letterSpacing:1}
const qrActionButton={border:"1px solid var(--border)",borderRadius:12,padding:"12px 10px",background:"var(--surface-2)",color:"var(--text)",fontWeight:900,cursor:"pointer"}
const qrPayButton={border:0,borderRadius:12,padding:"12px 10px",background:"var(--primary)",color:"#111",fontWeight:900,cursor:"pointer"}
const qrNotice={marginTop:10,padding:10,borderRadius:10,background:"rgba(var(--primary-rgb),.08)",border:"1px solid rgba(var(--primary-rgb),.18)",fontSize:12,color:"var(--text)"}
const qrSuccess={marginTop:16,padding:14,borderRadius:12,textAlign:"center",background:"rgba(34,197,94,.12)",color:"var(--success)",fontWeight:900}
const ratingCard={margin:"28px auto 120px",width:"min(760px,calc(100% - 32px))",boxSizing:"border-box",padding:"24px",borderRadius:24,background:"linear-gradient(135deg,rgba(var(--surface-2-rgb),.97),rgba(var(--surface-rgb),.92))",border:"1px solid rgba(var(--primary-rgb),.22)",boxShadow:"0 18px 50px rgba(0,0,0,.28)",backdropFilter:"blur(18px)"}
const ratingTop={display:"flex",alignItems:"center",justifyContent:"space-between",gap:18}
const ratingEyebrow={fontSize:11,fontWeight:900,letterSpacing:1.4,color:"var(--primary)",marginBottom:6}
const ratingSummaryBox={minWidth:86,padding:"10px 12px",borderRadius:15,textAlign:"center",background:"rgba(var(--primary-rgb),.08)",border:"1px solid rgba(var(--primary-rgb),.18)",display:"flex",flexDirection:"column",gap:2}
const ratingSummaryBoxStrong={fontWeight:900}
const ratingStarsWrap={display:"flex",alignItems:"center",justifyContent:"center",gap:14,flexWrap:"wrap",padding:"12px 0 8px"}
const ratingStars={display:"flex",alignItems:"center",justifyContent:"center",gap:3}
const ratingStarButton={border:0,background:"transparent",cursor:"pointer",fontSize:42,lineHeight:1,padding:"2px 4px",transition:"transform .15s ease,color .15s ease",touchAction:"manipulation"}
const ratingSelected={color:"var(--muted)",fontSize:13,fontWeight:700}
const ratingTextarea={width:"100%",boxSizing:"border-box",resize:"vertical",minHeight:96,borderRadius:14,border:"1px solid rgba(var(--primary-rgb),.18)",background:"rgba(0,0,0,.22)",color:"var(--text)",padding:"13px 14px",outline:"none",fontFamily:"inherit",marginTop:12}
const ratingButton={marginTop:12,width:"100%",padding:"13px 16px",border:0,borderRadius:14,background:"linear-gradient(135deg,var(--primary),var(--primary-dark,var(--primary)))",color:"#111",fontWeight:900,cursor:"pointer"}
const ratingErrorBox={marginTop:10,padding:"10px 12px",borderRadius:12,background:"rgba(127,29,29,.35)",border:"1px solid rgba(248,113,113,.25)",color:"var(--danger)",fontSize:13}
const ratingThanks={display:"flex",flexDirection:"column",alignItems:"center",gap:7,padding:"26px 18px",textAlign:"center",color:"var(--text)"}

const layout={

background:

"radial-gradient(circle at top,#172554,var(--background),#000)",

color:"var(--text)",

minHeight:"100vh",

paddingBottom:"100px",

position:"relative",

overflowX:"hidden",

animation:"fade .4s"

}
const blob1={

position:"fixed",

top:-150,

left:-150,

width:350,

height:350,

borderRadius:"50%",

background:"rgba(var(--primary-rgb),.08)",

filter:"blur(120px)",

pointerEvents:"none"

}

const blob2={

position:"fixed",

right:-150,

bottom:-150,

width:350,

height:350,

borderRadius:"50%",

background:"rgba(var(--info-rgb),.08)",

filter:"blur(120px)",

pointerEvents:"none"

}

const header={

position:"sticky",

top:0,

zIndex:100,

padding:18,

background:"rgba(var(--surface-2-rgb),.55)",

backdropFilter:"blur(30px)",

borderBottom:

"1px solid rgba(255,255,255,.06)",

boxShadow:

"0 15px 35px rgba(0,0,0,.25)"

}
const grid = {
  display:"grid",
  gap:14,
  padding:"18px 16px",
  width:"100%",
  maxWidth:1280,
  margin:"0 auto",
  boxSizing:"border-box"
}

const card={
  transform:"translateY(0)",
  background:"linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.035))",
  borderRadius:22,
  overflow:"hidden",
  border:"1px solid rgba(var(--primary-rgb),.16)",
  backdropFilter:"blur(18px)",
  cursor:"pointer",
  boxShadow:"0 18px 42px rgba(0,0,0,.34)",
  transition:"transform .25s ease, box-shadow .25s ease, border-color .25s ease",
  position:"relative",
  display:"flex",
  flexDirection:"column",
  minWidth:0
}
const img = {
  width:"100%",
  height:190,
  objectFit:"cover",
  display:"block",
  transition:"transform .45s ease",
  background:"rgba(255,255,255,.04)"
}


const cartItem = {
  display:"flex",
  justifyContent:"space-between",
  alignItems:"center",
  marginBottom:8,
  fontSize:13
}

const total = {
  fontWeight:"700",
  fontSize:18,
  color:"var(--primary)",
  marginTop:15,
  textAlign:"right"
}
const btn={

  width:"100%",

  marginTop:16,

  padding:"16px",

  borderRadius:16,

  background:
    "linear-gradient(135deg,var(--surface),var(--surface-2))",

  border:
    "1px solid rgba(var(--primary-rgb),.35)",

  color:"var(--text)",

  fontWeight:"bold",

  fontSize:16,

  cursor:"pointer",

  boxShadow:
    "0 10px 25px rgba(0,0,0,.35)"

}
const headerRow = {
  display:"flex",
  justifyContent:"space-between",
  alignItems:"center"
}

const logo={

width:60,

height:60,

borderRadius:"50%",

objectFit:"cover",

border:"3px solid var(--primary)",

boxShadow:

"0 0 30px rgba(var(--primary-rgb),.35)"

}

const restaurantTitle = {
  margin:0,
  fontSize:22,
  fontWeight:700
}

const tableInfo = {
  marginTop:4,
  color:"var(--muted)",
  fontSize:14
}

const headerActionButton = {
  minHeight:42,
  padding:"0 13px",
  borderRadius:14,
  border:"1px solid rgba(var(--primary-rgb),.28)",
  background:"linear-gradient(135deg,rgba(var(--surface-rgb),.96),rgba(var(--surface-2-rgb),.92))",
  color:"var(--text)",
  display:"inline-flex",
  alignItems:"center",
  justifyContent:"center",
  gap:7,
  fontWeight:800,
  fontSize:13,
  cursor:"pointer",
  boxShadow:"0 8px 22px rgba(0,0,0,.22)",
  whiteSpace:"nowrap",
  transition:"transform .18s ease, border-color .18s ease"
}
const cartCountPill = {
  minWidth:21,
  height:21,
  padding:"0 6px",
  borderRadius:999,
  display:"inline-flex",
  alignItems:"center",
  justifyContent:"center",
  background:"var(--primary)",
  color:"#111",
  fontSize:11,
  fontWeight:900
}
const cartBadge = {
  background:"var(--surface)",
  border:"1px solid rgba(var(--primary-rgb),.35)",
  width:42,
  height:42,
  borderRadius:"50%",
  display:"flex",
  alignItems:"center",
  justifyContent:"center",
  fontWeight:"bold"
}
const qtyBtn = {
  width:42,
  height:42,
  minWidth:42,
  minHeight:42,
  padding:0,
  fontSize:21,
  lineHeight:1,
  border:"1px solid rgba(var(--primary-rgb),.38)",
  borderRadius:"50%",
  background:
"linear-gradient(135deg,var(--surface),var(--surface-2))",
  color:"var(--text)",
  fontWeight:800,
  cursor:"pointer",
  display:"inline-flex",
  alignItems:"center",
  justifyContent:"center",
  flexShrink:0,
  boxSizing:"border-box",
  touchAction:"manipulation"

}
const quickBtn = {
  padding:"5px 10px",
  borderRadius:20,
  border:"1px solid rgba(var(--primary-rgb),.3)",
  background:"var(--surface)",
  color:"var(--text)",
  fontSize:12,
  cursor:"pointer"
}
const deleteBtn = {
  width:42,
  height:42,
  minWidth:42,
  minHeight:42,
  padding:0,
  margin:0,
  border:"1px solid rgba(255,255,255,.12)",
  borderRadius:"50%",
  background:"var(--danger)",
  color:"var(--text)",
  cursor:"pointer",
  fontSize:18,
  lineHeight:1,
  fontWeight:700,
  display:"inline-flex",
  alignItems:"center",
  justifyContent:"center",
  flex:"0 0 42px",
  flexShrink:0,
  boxSizing:"border-box",
  touchAction:"manipulation",
  WebkitTapHighlightColor:"transparent"
}
const categoryBar = {
  display:"flex",
  gap:10,
  overflowX:"auto",
  padding:"12px 18px",
  position:"sticky",
top:"84px",
zIndex:95,
background:"var(--surface-2)"
  
}

const categoryBtn = {
  border:"none",
  color:"var(--text)",
  padding:"10px 18px",
  borderRadius:30,
  whiteSpace:"nowrap",
  cursor:"pointer",
  fontWeight:"600",
  transition:"0.3s ease"
}

const heroBadge = {
  display:"inline-block",
  marginTop:6,
  padding:"4px 10px",
  borderRadius:20,
  fontSize:12,
  background:"rgba(var(--primary-rgb),.12)",
border:"1px solid rgba(var(--primary-rgb),.25)",
color:"var(--primary)"
}
const viewMoreBtn = {
  width:"100%",
  marginTop:10,
  padding:12,
  border:"none",
  borderRadius:12,
  background:"rgba(255,255,255,0.08)",
  color:"var(--text)",
  cursor:"pointer"
}

const drawerOverlay = {
  position:"fixed",
  inset:0,
  background:"rgba(0,0,0,0.6)",
  zIndex:999
}

const drawer = {

  position:"absolute",

  left:0,

  right:0,

  bottom:0,

  background:"var(--surface-2)",

  borderTop:"1px solid rgba(var(--primary-rgb),.25)",

  borderTopLeftRadius:30,

  borderTopRightRadius:30,

  padding:24,

  maxHeight:"88vh",

  overflowY:"auto",

  boxShadow:"0 -20px 60px rgba(0,0,0,.55)"

}
const searchInput={

flex:1,

height:"100%",

border:"none",

outline:"none",

background:"transparent",

color:"var(--text)",

fontSize:15
}
const floatingCart = {
  position:"fixed",
  left:14,
  right:14,
  bottom:14,

  display:"flex",
  justifyContent:"space-between",
  alignItems:"center",

  padding:"14px 18px",

  borderRadius:18,

  background:
  "linear-gradient(135deg,var(--surface),var(--surface-2))",
  border:
"1px solid rgba(var(--primary-rgb),.35)",

  boxShadow:
    "0 20px 40px rgba(0,0,0,.4)",

  zIndex:999,

  cursor:"pointer"
}
const heroInfo={

display:"flex",

gap:12,

alignItems:"center",

padding:"12px 18px",

borderRadius:30,

background:"rgba(var(--surface-2-rgb),.55)",

backdropFilter:"blur(18px)",

fontWeight:700,

fontSize:14

}
const restaurantMeta={

marginTop:8,

fontSize:12,

color:"var(--muted)"

}
const searchBox={

display:"flex",

alignItems:"center",

gap:12,

padding:"0 16px",

height:60,

borderRadius:18,

background:"rgba(255,255,255,.06)",

border:

"1px solid rgba(255,255,255,.06)",

backdropFilter:"blur(20px)",

boxShadow:

"0 15px 40px rgba(0,0,0,.25)"

}
const drawerHeader={

display:"flex",

justifyContent:"space-between",

alignItems:"center",

marginBottom:24

}

const drawerSub={

fontSize:13,

marginTop:5,

color:"var(--muted)"

}

const checkoutBadge={

padding:"10px 16px",

borderRadius:25,

background:"var(--primary)",

color:"#111",

fontWeight:700

}
const premiumCartItem={

background:"rgba(255,255,255,.05)",

border:"1px solid rgba(255,255,255,.06)",

borderRadius:18,

padding:16,

marginBottom:18

}
const cartFoodImage={

width:60,

height:60,

borderRadius:14,

objectFit:"cover"

}
const billBox={

marginTop:25,

padding:20,

borderRadius:18,

background:"rgba(255,255,255,.05)",

border:"1px solid rgba(255,255,255,.06)"

}

const billRow={

display:"flex",

justifyContent:"space-between",

marginBottom:12

}
const estimateBox={

marginTop:18,

padding:18,

borderRadius:16,

background:"rgba(var(--primary-rgb),.08)",

border:"1px solid rgba(var(--primary-rgb),.25)",

display:"flex",

justifyContent:"space-between"

}
const foodOverlay={

position:"fixed",

inset:0,

background:"rgba(0,0,0,.75)",

display:"flex",

alignItems:"flex-end",

justifyContent:"center",

zIndex:9999

}

const foodModal={

position:"relative",

width:"100%",

maxWidth:500,

background:"var(--surface-2)",

borderTopLeftRadius:30,

borderTopRightRadius:30,

overflow:"hidden",

maxHeight:"92vh",

overflowY:"auto",

boxShadow:"0 -20px 60px rgba(0,0,0,.5)"

}
const modalClose={

position:"absolute",

top:15,

right:15,

width:42,

height:42,

borderRadius:"50%",

background:"rgba(0,0,0,.65)",

display:"flex",

alignItems:"center",

justifyContent:"center",

fontSize:24,

fontWeight:"bold",

cursor:"pointer",

color:"var(--text)",

zIndex:999
}
const foodHero={

width:"100%",

height:280,

objectFit:"cover"

}

const foodDescription={

marginTop:12,

color:"var(--muted)",

lineHeight:1.6

}

const foodMeta={

display:"flex",

alignItems:"center",

gap:10,

marginTop:12,

fontSize:14,

color:"var(--primary)",

fontWeight:600

}

const modalPrice={

marginTop:18,

fontSize:30,

fontWeight:800,

color:"var(--primary)"

}

const modalQtyBox={

marginTop:24,

display:"flex",

justifyContent:"center",

alignItems:"center",

gap:20

}

const addonWrap={

display:"flex",

flexWrap:"wrap",

gap:10,

marginTop:14

}

const addonBtn={

padding:"10px 16px",

borderRadius:25,

background:"var(--surface-2)",

border:"1px solid rgba(255,255,255,.08)",

color:"var(--text)",

cursor:"pointer",

fontSize:13

}

const modalTextarea={

width:"100%",

marginTop:12,

padding:14,

borderRadius:14,

background:"var(--surface-2)",

border:"1px solid rgba(255,255,255,.08)",

color:"var(--text)",

resize:"vertical",

minHeight:140,

outline:"none"

}

const modalButton={
  

  width:"100%",

  marginTop:28,

  padding:"16px",

  borderRadius:16,

  background:
    "linear-gradient(135deg,var(--surface),var(--surface-2))",

  border:
    "1px solid rgba(var(--primary-rgb),.35)",

  color:"var(--text)",

  fontWeight:"bold",

  fontSize:16,

  cursor:"pointer",

  boxShadow:
    "0 10px 25px rgba(0,0,0,.35)"

}

const offerTicker={

position:"absolute",

left:0,

right:0,

bottom:70,

overflow:"hidden",

background:"linear-gradient(90deg,rgba(var(--surface-2-rgb),.92),rgba(var(--surface-2-rgb),.82),rgba(var(--surface-2-rgb),.92))",

backdropFilter:"blur(25px)",

padding:"12px 0",

borderTop:"1px solid rgba(var(--primary-rgb),.22)",

borderBottom:"1px solid rgba(var(--primary-rgb),.22)",

boxShadow:"0 8px 25px rgba(0,0,0,.35)",

zIndex:5

}

const offerTrack={

display:"inline-flex",

alignItems:"center",

whiteSpace:"nowrap",

width:"max-content",

animation:"marquee 20s linear infinite"

}
const leftArrow={

position:"absolute",

left:18,

top:"50%",

transform:"translateY(-50%)",

width:46,

height:46,

borderRadius:"50%",

border:"1px solid rgba(255,255,255,.15)",

background:"rgba(var(--surface-2-rgb),.65)",

backdropFilter:"blur(15px)",

color:"var(--text)",

fontSize:28,

transition:".3s",

boxShadow:"0 10px 35px rgba(0,0,0,.45)",

cursor:"pointer",

zIndex:20

}

const rightArrow={

position:"absolute",

right:18,

top:"50%",

transform:"translateY(-50%)",

width:46,

height:46,

borderRadius:"50%",

border:"1px solid rgba(255,255,255,.15)",

background:"rgba(0,0,0,.45)",

backdropFilter:"blur(15px)",

color:"var(--text)",

fontSize:28,

transition:".3s",

boxShadow:"0 10px 35px rgba(0,0,0,.45)",

cursor:"pointer",

zIndex:20

}
const offerItem={

display:"flex",

alignItems:"center",

gap:10,

marginRight:60,

padding:"8px 18px",

borderRadius:30,

background:"rgba(var(--primary-rgb),.08)",

border:"1px solid rgba(var(--primary-rgb),.18)",

color:"var(--surface-2)",

fontWeight:700,

fontSize:15,

whiteSpace:"nowrap",

backdropFilter:"blur(15px)"

}

