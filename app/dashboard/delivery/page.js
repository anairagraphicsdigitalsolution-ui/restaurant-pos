"use client"
import { formatIndiaDate, formatIndiaDateTime } from "@/lib/indiaTime"

import { useEffect, useMemo, useState } from "react"
import { sendThermalPrint } from "@/lib/thermalPrintClient"
import { printHtmlInFrame } from "@/lib/printUtils"
import { useRouter, useSearchParams } from "next/navigation"
import { supabaseCloud } from "@/lib/supabaseCloud"

const money = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`

const statusLabel = (s) =>
  ({
    pending: "Pending",
    assigned: "Assigned",
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
    ready_for_pickup: "Ready for pickup",
    picked_up: "Picked up",
    cancelled: "Cancelled",
  }[s] || s || "Pending")

const collectionLabel = (s) =>
  ({
    pending_collection: "COD — collect on delivery",
    pending_settlement: "Payment with rider / owner",
    settled: "Settled",
    not_required: "Prepaid / no collection",
  }[s] || "Collection pending")

export default function DeliveryManagement() {
  const router = useRouter()
  const search = useSearchParams()

  const [deliveries, setDeliveries] = useState([])
  const [riders, setRiders] = useState([])
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [personType, setPersonType] = useState("rider")
  const [riderId, setRiderId] = useState("")
  const [ownerName, setOwnerName] = useState("Restaurant Owner")
  const [ownerPhone, setOwnerPhone] = useState("")
  const [cash, setCash] = useState("")
  const [upi, setUpi] = useState("")
  const [card, setCard] = useState("")
  const [collectionNote, setCollectionNote] = useState("")
  const [filter, setFilter] = useState("active")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [restaurant, setRestaurant] = useState(null)

  const [zoneForm, setZoneForm] = useState({
    id: "",
    name: "",
    charge: "",
    min_order: "",
    active: true,
  })
  const [zoneEditorOpen, setZoneEditorOpen] = useState(false)
  const [riderEditorOpen, setRiderEditorOpen] = useState(false)
  const [riderForm, setRiderForm] = useState({ id: "", name: "", phone: "", vehicle: "", active: true })

  async function getAuthHeaders() {
    const { data, error } = await supabaseCloud.auth.getSession()

    if (error || !data?.session?.access_token) {
      throw new Error("Authentication required. Please login again.")
    }

    return {
      Authorization: `Bearer ${data.session.access_token}`,
    }
  }

  async function load() {
    setLoading(true)
    setError("")

    try {
      const headers = await getAuthHeaders()
      const res = await fetch("/api/delivery", {
        cache: "no-store",
        headers,
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Delivery data unavailable")
      }

      const rows = data.deliveries || []
      setDeliveries(rows)
      setRiders(data.riders || [])
      if (data.restaurant) setRestaurant(data.restaurant)
      setZones(data.zones || [])

      const slip = search.get("slip")
      const orderId = search.get("order_id")
      if (orderId) {
        const match = rows.find((x) => x.order_id === orderId)
        if (match) selectDelivery(match)
      } else if (slip) {
        const match = rows.find((x) => x.slip_no === slip)
        if (match) selectDelivery(match)
      } else if (selected) {
        const refreshed = rows.find((x) => x.id === selected.id)
        if (refreshed) selectDelivery(refreshed, false)
      }
    } catch (e) {
      setError(e?.message || "Delivery data unavailable")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function selectDelivery(delivery, resetCollection = true) {
    setSelected(delivery)
    setPersonType(delivery.delivery_person_type || (delivery.rider_id ? "rider" : "owner"))
    setRiderId(delivery.rider_id || "")
    setOwnerName(delivery.delivery_person_name || "Restaurant Owner")
    setOwnerPhone(delivery.delivery_person_phone || "")
    if (resetCollection) {
      setCash("")
      setUpi("")
      setCard("")
      setCollectionNote("")

      // Once a COD delivery is marked delivered/picked up, pre-fill the
      // expected collection amount into the payment method that was selected
      // for the order. All three fields remain editable so the restaurant can
      // correct the amount or split the collection across cash, UPI and card.
      const expected = Number(delivery.expected_amount || 0)
      const method = String(delivery.payment_method || "cash").toLowerCase()
      const needsSettlement =
        ["delivered", "picked_up"].includes(String(delivery.status || "").toLowerCase()) &&
        delivery.settlement_status !== "settled" &&
        ["cash", "cod", "upi", "card"].includes(method)

      if (needsSettlement && expected > 0) {
        if (["cash", "cod"].includes(method)) setCash(String(expected))
        else if (method === "upi") setUpi(String(expected))
        else if (method === "card") setCard(String(expected))
      }
    }
  }

  async function action(body) {
    setBusy(true)
    setError("")
    setNotice("")

    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch("/api/delivery", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Operation failed")
      }

      // IMPORTANT: never replace the enriched Cloud delivery in UI with the
      // raw POST response. load() re-fetches and enriches the selected delivery
      // from restaurant_deliveries + orders + order_items + offers, so item
      // details and billing fields cannot disappear after an action.
      await load()

      if (data.settlement_result) {
        setNotice(
          data.settlement_result === "settled"
            ? "Payment settled successfully."
            : `Payment settled with ${data.settlement_result} difference.`
        )
      } else {
        setNotice("Updated successfully.")
      }

      return data.delivery
    } catch (e) {
      setError(e?.message || "Operation failed")
      return null
    } finally {
      setBusy(false)
    }
  }

  const filtered = useMemo(
    () =>
      deliveries.filter((d) => {
        if (filter === "active") {
          return (
            d.status !== "cancelled" &&
            d.settlement_status !== "settled"
          )
        }

        if (filter === "out") {
          return d.status === "out_for_delivery"
        }

        if (filter === "delivered") {
          return (
            d.status === "delivered" &&
            d.settlement_status !== "settled"
          )
        }

        if (filter === "settlement") {
          return (
            ["delivered", "picked_up"].includes(d.status) &&
            d.settlement_status !== "settled"
          )
        }

        if (filter === "settled") {
          return d.settlement_status === "settled"
        }

        return true
      }),
    [deliveries, filter]
  )

  const stats = useMemo(
    () => ({
      active: deliveries.filter(
        (d) =>
          d.status !== "cancelled" &&
          d.settlement_status !== "settled"
      ).length,
      out: deliveries.filter((d) => d.status === "out_for_delivery").length,
      delivered: deliveries.filter(
        (d) =>
          ["delivered", "picked_up"].includes(d.status) &&
          d.settlement_status !== "settled"
      ).length,
      settlement: deliveries.filter(
        (d) =>
          ["delivered", "picked_up"].includes(d.status) &&
          d.settlement_status !== "settled"
      ).length,
      settled: deliveries.filter(
        (d) => d.settlement_status === "settled"
      ).length,
    }),
    [deliveries]
  )

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")

  function slipFinancials(delivery) {
    const order = delivery?.slip_order || {}
    const items = Array.isArray(delivery?.slip_items) ? delivery.slip_items : []
    const itemSubtotal = items.reduce(
      (sum, item) =>
        sum +
        (Number.isFinite(Number(item?.line_total))
          ? Number(item.line_total)
          : Number(item?.quantity || 0) * Number(item?.unit_price || 0)),
      0
    )
    const subtotal = Number.isFinite(Number(delivery?.slip_subtotal))
      ? Number(delivery.slip_subtotal)
      : Number(order.subtotal || itemSubtotal || 0)
    const discount = Number(delivery?.slip_discount ?? order.discount_amount ?? 0) || 0
    const tax = Number(delivery?.slip_tax ?? order.tax_amount ?? 0) || 0
    const deliveryCharge =
      Number(delivery?.slip_delivery_charge ?? delivery?.delivery_charge ?? order.delivery_charge ?? 0) || 0
    const storedTotal = Number(delivery?.slip_total ?? order.total_amount ?? delivery.expected_amount ?? 0) || 0
    const calculatedTotal = subtotal || items.length
      ? Math.max(0, subtotal - discount + tax + deliveryCharge)
      : storedTotal
    const total = Number.isFinite(calculatedTotal) ? calculatedTotal : storedTotal
    const offer = delivery?.slip_offer || null
    return { items, subtotal, discount, tax, deliveryCharge, total, offer }
  }

  async function printSlipThermal(delivery) {
    if (!delivery) return
    const title = delivery.order_mode === "takeaway" ? "TAKEAWAY SLIP" : "DELIVERY SLIP"
    const collection = delivery.settlement_status === "settled" ? "SETTLED" : ["cash", "cod"].includes(String(delivery.payment_method || "cash").toLowerCase()) ? "PAYMENT TO BE COLLECTED" : "PREPAID"
    const { items, subtotal, discount, tax, deliveryCharge, total, offer } = slipFinancials(delivery)
    const itemLines = items.length
      ? items.flatMap(item => [
          `${item.item_name || "Item"} x${item.quantity || 0}  ${money(item.line_total ?? Number(item.quantity || 0) * Number(item.unit_price || 0))}`,
          ...(item.cooking_request ? [`  Note: ${item.cooking_request}`] : []),
        ])
      : ["No item details available"]
    const financialLines = [
      `Subtotal: ${money(subtotal)}`,
      ...(offer ? [`OFFER: ${offer.title || "Offer Applied"}`] : []),
      ...(discount > 0 ? [`Offer Discount: -${money(discount)}`] : []),
      ...(tax > 0 ? [`Tax / GST: ${money(tax)}`] : []),
      ...(deliveryCharge > 0 ? [`Delivery Charge: ${money(deliveryCharge)}`] : []),
      `TOTAL AFTER OFFER: ${money(total)}`,
      ...(discount > 0 ? [`YOU SAVE: ${money(discount)}`] : []),
    ]
    const content = [
      "ANAIRA", title, delivery.slip_no || "", "------------------------------",
      delivery.customer_name || "Customer", delivery.phone || "", delivery.address || "Counter pickup", delivery.zone || "",
      "------------------------------", `Order: #${String(delivery.order_id || "").slice(0,8)}`,
      "ITEMS", ...itemLines,
      "------------------------------", ...financialLines,
      `Payment: ${String(delivery.payment_method || "cash").toUpperCase()}`, `Delivered by: ${delivery.delivery_person_name || delivery.rider_name || "Not assigned"}`,
      collection, delivery.customer_notes ? `Note: ${delivery.customer_notes}` : "", "------------------------------", formatIndiaDateTime(new Date())
    ].filter(Boolean).join("\n")
    try { await sendThermalPrint({ type: "delivery-slip", content, data: { order_id: delivery.order_id, size: "80mm" } }) }
    catch (e) { setError(e.message || "Thermal delivery print failed") }
  }

  async function printSlip(delivery) {
    if (!delivery) return

    // Always print from the latest enriched Cloud delivery object. This prevents
    // an old/raw selected row from producing an incomplete customer bill.
    let printable = delivery
    try {
      const headers = await getAuthHeaders()
      const res = await fetch("/api/delivery", { cache: "no-store", headers })
      const data = await res.json()
      if (res.ok && data?.success) {
        const fresh = (data.deliveries || []).find((row) => row.id === delivery.id)
        if (fresh) printable = fresh
      }
    } catch (e) {
      console.warn("Delivery slip refresh failed; using selected Cloud row:", e)
    }

    const title = printable.order_mode === "takeaway" ? "TAKEAWAY DELIVERY SLIP" : "DELIVERY SLIP"
    const person = printable.delivery_person_name || printable.rider_name || "Not assigned"
    const collection = printable.settlement_status === "settled"
      ? "PAYMENT SETTLED"
      : ["cash", "cod"].includes(String(printable.payment_method || "cash").toLowerCase())
        ? "PAYMENT TO BE COLLECTED"
        : "PREPAID"

    const { items, subtotal, discount, tax, deliveryCharge, total, offer } = slipFinancials(printable)
    const safeRestaurant = escapeHtml(restaurant?.name || "Restaurant")
    const safeSlip = escapeHtml(printable.slip_no || "")
    const safeCustomer = escapeHtml(printable.customer_name || "Customer")
    const safePhone = escapeHtml(printable.phone || "")
    const safeAddress = escapeHtml(printable.address || "Counter pickup")
    const safeZone = escapeHtml(printable.zone || "")
    const safePerson = escapeHtml(person)
    const safePayment = escapeHtml(String(printable.payment_method || "cash").toUpperCase())
    const safeOrderId = escapeHtml(String(printable.order_id || "").slice(0, 8))
    const safeNotes = escapeHtml(printable.customer_notes || printable.slip_order?.overall_note || "")

    const itemRows = items.length
      ? items.map((item, index) => {
          const qty = Number(item.quantity || 0)
          const unitPrice = Number(item.unit_price || 0)
          const lineTotal = Number.isFinite(Number(item.line_total)) ? Number(item.line_total) : qty * unitPrice
          const modifiers = Array.isArray(item.modifiers) ? item.modifiers : []
          return `
            <div class="item">
              <div class="itemMain"><span>${index + 1}. ${escapeHtml(item.item_name || "Item")}</span><b>${money(lineTotal)}</b></div>
              <div class="itemMeta">${qty} × ${money(unitPrice)}</div>
              ${modifiers.map(mod => `<div class="modifier">+ ${escapeHtml(mod.modifier_name || "Add-on")} × ${Number(mod.quantity || 1)} · ${money(Number(mod.price || 0) * Number(mod.quantity || 1))}</div>`).join("")}
              ${item.cooking_request ? `<div class="itemMeta">Note: ${escapeHtml(item.cooking_request)}</div>` : ""}
            </div>`
        }).join("")
      : `<div class="muted">No item details available</div>`

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${safeSlip || "Delivery Slip"}</title>
          <style>
            *{box-sizing:border-box}
            html,body{margin:0;padding:0;background:#fff;color:#111}
            body{font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.35}
            .bill{width:100%;max-width:760px;margin:0 auto;padding:8mm}
            .header{text-align:center}
            h1{font-size:23px;margin:0 0 3px}
            h2{font-size:15px;margin:0 0 3px}
            .muted{color:#666;font-size:11px}
            .line{border-top:1px dashed #777;margin:12px 0}
            .row{display:flex;justify-content:space-between;gap:18px;margin:5px 0}
            .row span:first-child{color:#444}
            .item{padding:7px 0;border-bottom:1px solid #e5e5e5}
            .itemMain{display:flex;justify-content:space-between;gap:12px;font-weight:700;font-size:13px}
            .itemMeta,.modifier{color:#666;font-size:10px;margin-top:2px}
            .modifier{padding-left:12px}
            .discount{font-weight:700}.offerRow{font-weight:800}.saved{margin-top:8px;padding:7px;border:1px dashed #777;text-align:center;font-weight:800}
            .total{font-size:18px;font-weight:800;border-top:2px solid #111;padding-top:8px;margin-top:8px}
            .box{border:1px solid #bbb;padding:9px;margin-top:10px}
            .hold{border:2px solid #111;padding:8px;margin-top:12px;font-weight:800;text-align:center}
            .note{background:#f5f5f5;padding:8px;margin-top:10px;font-size:11px}
            @page{size:148mm 210mm;margin:0}
            @media print{.bill{max-width:none;padding:8mm}.item{break-inside:avoid}.box,.hold,.note{break-inside:avoid}}
          </style>
        </head>
        <body>
          <main class="bill">
            <div class="header">
              <h1>${safeRestaurant}</h1>
              <h2>${escapeHtml(title)}</h2>
              <div class="muted">Slip No: ${safeSlip}</div>
              <div class="muted">${escapeHtml(formatIndiaDateTime(printable.created_at || new Date()))}</div>
            </div>

            <div class="line"></div>
            <div class="row"><span>Customer</span><b>${safeCustomer}</b></div>
            <div class="row"><span>Phone</span><b>${safePhone || "—"}</b></div>
            <div class="row"><span>Address</span><b>${safeAddress}</b></div>
            ${safeZone ? `<div class="row"><span>Zone</span><b>${safeZone}</b></div>` : ""}
            <div class="row"><span>Order</span><b>#${safeOrderId}</b></div>

            <div class="line"></div>
            <div><b>ORDER ITEMS</b></div>
            ${itemRows}

            <div class="line"></div>
            <div class="row"><span>Subtotal</span><b>${money(subtotal)}</b></div>
            ${offer ? `<div class="row offerRow"><span>Offer</span><b>${escapeHtml(offer.title || "Offer Applied")}</b></div>` : ""}
            ${discount > 0 ? `<div class="row"><span>Offer Discount</span><b class="discount">-${money(discount)}</b></div>` : ""}
            ${tax > 0 ? `<div class="row"><span>Tax / GST</span><b>${money(tax)}</b></div>` : ""}
            ${deliveryCharge > 0 ? `<div class="row"><span>Delivery Charge</span><b>${money(deliveryCharge)}</b></div>` : ""}
            <div class="row total"><span>AMOUNT PAYABLE</span><b>${money(total)}</b></div>
            ${discount > 0 ? `<div class="saved">Offer applied — You save ${money(discount)}</div>` : ""}

            <div class="box">
              <div class="row"><span>Payment Method</span><b>${safePayment}</b></div>
              <div class="row"><span>Delivery Person</span><b>${safePerson}</b></div>
              <div class="row"><span>Status</span><b>${escapeHtml(collection)}</b></div>
            </div>

            ${safeNotes ? `<div class="note"><b>Customer Note:</b> ${safeNotes}</div>` : ""}
            <div class="line"></div>
            <div class="muted" style="text-align:center">Thank you for ordering from ${safeRestaurant}</div>
          </main>
        </body>
      </html>
    `
    printHtmlInFrame(html, { title: printable.slip_no || title, width: "148mm", height: "210mm" }).catch(e => setError(e.message || "Unable to print the slip"))
  }

  async function assignDeliveryPerson() {
    if (!selected) return

    if (personType === "rider" && !riderId) {
      setError("Select a rider.")
      return
    }

    await action({
      action: "assign",
      delivery_id: selected.id,
      delivery_person_type: personType,
      rider_id: personType === "rider" ? riderId : null,
      delivery_person_name:
        personType === "owner" ? ownerName : undefined,
      delivery_person_phone:
        personType === "owner" ? ownerPhone : undefined,
    })
  }

  async function markDelivered() {
    if (!selected) return

    if (
      selected.status !== "out_for_delivery" &&
      selected.status !== "assigned"
    ) {
      setError("Send the delivery out first.")
      return
    }

    await action({
      action: "status",
      delivery_id: selected.id,
      status: "delivered",
    })
  }

  async function settle() {
    if (!selected) return

    if (!["delivered", "picked_up"].includes(selected.status)) {
      setError("Mark the delivery as delivered before settling payment.")
      return
    }

    const total =
      Number(cash || 0) +
      Number(upi || 0) +
      Number(card || 0)

    if (total <= 0 && Number(selected.expected_amount || 0) > 0) {
      setError("Enter the amount actually received.")
      return
    }

    await action({
      action: "settle",
      delivery_id: selected.id,
      cash_collected: Number(cash || 0),
      upi_collected: Number(upi || 0),
      card_collected: Number(card || 0),
      collection_notes: collectionNote,
    })

    setCash("")
    setUpi("")
    setCard("")
    setCollectionNote("")
  }

  async function markDoneAndBill() {
    if (!selected?.order_id) {
      setError("Order is missing for this delivery.")
      return
    }

    if (selected.settlement_status !== "settled") {
      setError("Settle the delivery payment before marking the order done.")
      return
    }

    setBusy(true)
    setError("")
    setNotice("")

    try {
      const headers = await getAuthHeaders()
      const response = await fetch("/api/delivery", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "complete",
          delivery_id: selected.id,
        }),
        cache: "no-store",
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to mark order done")
      }

      // The POST response contains the raw restaurant_deliveries row. Do not
      // put that raw row into React state because it would discard the
      // enriched slip/order/item/discount/charge fields. Refresh through the
      // canonical Cloud GET instead, which rebuilds the enriched delivery.
      await load()

      // Billing screen restores the selected order from this key.
      window.localStorage.setItem(
        "anaira_pos_selected_order",
        selected.order_id
      )

      router.push("/billing/bill")
    } catch (e) {
      setError(e?.message || "Unable to complete delivery order")
    } finally {
      setBusy(false)
    }
  }

  function openRiderEditor(rider = null) {
    setRiderForm(rider
      ? { id: rider.id || "", name: rider.name || "", phone: rider.phone || "", vehicle: rider.vehicle || "", active: rider.active !== false }
      : { id: "", name: "", phone: "", vehicle: "", active: true }
    )
    setRiderEditorOpen(true)
    setError("")
  }

  async function saveRider(e) {
    e.preventDefault()
    const name = String(riderForm.name || "").trim()
    if (!name) { setError("Enter rider name."); return }
    setBusy(true); setError(""); setNotice("")
    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch("/api/delivery", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ action: riderForm.id ? "rider_update" : "rider_create", rider_id: riderForm.id || undefined, name, phone: riderForm.phone, vehicle: riderForm.vehicle, active: riderForm.active !== false })
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Could not save rider")
      setRiderEditorOpen(false)
      setNotice(riderForm.id ? "Rider updated." : "Rider added.")
      await load()
    } catch (e) { setError(e?.message || "Could not save rider") }
    finally { setBusy(false) }
  }

  async function deleteRider(rider) {
    if (!rider?.id || !window.confirm(`Delete rider "${rider.name}"? Existing delivery records will remain unchanged.`)) return
    setBusy(true); setError(""); setNotice("")
    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch("/api/delivery", { method:"POST", headers:{...authHeaders,"Content-Type":"application/json"}, body:JSON.stringify({action:"rider_delete", rider_id:rider.id}) })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Could not delete rider")
      setNotice("Rider deleted.")
      await load()
    } catch (e) { setError(e?.message || "Could not delete rider") }
    finally { setBusy(false) }
  }

  function openZoneEditor(zone = null) {
    if (zone) {
      setZoneForm({
        id: zone.id || "",
        name: zone.name || "",
        charge: zone.charge ?? "",
        min_order: zone.min_order ?? "",
        active: zone.active !== false,
      })
    } else {
      setZoneForm({
        id: "",
        name: "",
        charge: "",
        min_order: "",
        active: true,
      })
    }
    setZoneEditorOpen(true)
    setError("")
  }

  async function saveZone(e) {
    e.preventDefault()

    const name = String(zoneForm.name || "").trim()
    if (!name) {
      setError("Enter a delivery zone name.")
      return
    }

    setBusy(true)
    setError("")
    setNotice("")

    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch("/api/delivery", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: zoneForm.id ? "zone_update" : "zone_create",
          zone_id: zoneForm.id || undefined,
          name,
          charge: Number(zoneForm.charge || 0),
          min_order: Number(zoneForm.min_order || 0),
          active: zoneForm.active !== false,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Could not save delivery zone")
      }

      setZoneEditorOpen(false)
      setNotice(zoneForm.id ? "Delivery zone updated." : "Delivery zone added.")
      await load()
    } catch (e) {
      setError(e?.message || "Could not save delivery zone")
    } finally {
      setBusy(false)
    }
  }

  async function deleteZone(zone) {
    if (!zone?.id) return

    const ok = window.confirm(
      `Delete "${zone.name}"? Existing orders will not be changed.`
    )
    if (!ok) return

    setBusy(true)
    setError("")
    setNotice("")

    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch("/api/delivery", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "zone_delete",
          zone_id: zone.id,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Could not delete delivery zone")
      }

      if (zoneEditorOpen && zoneForm.id === zone.id) {
        setZoneEditorOpen(false)
      }

      setNotice("Delivery zone deleted.")
      await load()
    } catch (e) {
      setError(e?.message || "Could not delete delivery zone")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="deliveryPage">
      <section className="deliveryHero">
        <div>
          <div className="eyebrow">DELIVERY COLLECTION CONTROL</div>
          <h1>Delivery & Takeaway</h1>
          <p>
            Print a delivery slip, send it with a rider or restaurant owner,
            keep COD payment on hold, and settle it only when the money returns
            to the restaurant.
          </p>
        </div>

        <div className="heroActions">
          <button className="ghostBtn" onClick={load} disabled={busy}>
            ↻ Refresh
          </button>

          <a className="primaryBtn" href="/order">
            ＋ New Order
          </a>
        </div>
      </section>

      {error ? <div className="message error">{error}</div> : null}
      {notice ? <div className="message success">{notice}</div> : null}

      <section className="deliveryStats">
        <Stat label="Active" value={stats.active} />
        <Stat label="Out for delivery" value={stats.out} />
        <Stat label="Payment to settle" value={stats.settlement} />
        <Stat label="Settled" value={stats.settled} />
      </section>

      <section className="ridersPanel panel">
        <div className="zonesHeader">
          <div>
            <div className="eyebrow">DELIVERY TEAM</div>
            <h2>Riders</h2>
            <p>Save rider details once, then assign them instantly from any delivery slip.</p>
          </div>
          <button className="primaryBtn" type="button" onClick={() => openRiderEditor()} disabled={busy}>＋ Add Rider</button>
        </div>
        <div className="riderGrid">
          {riders.length ? riders.map((rider) => (
            <div className="riderCard" key={rider.id}>
              <div className="riderAvatar">🛵</div>
              <div className="riderInfo">
                <strong>{rider.name}</strong>
                <span>{rider.phone || "No phone"}{rider.vehicle ? ` · ${rider.vehicle}` : ""}</span>
                <small className={rider.active === false ? "riderOff" : "riderOn"}>{rider.active === false ? "Inactive" : "Available for assignment"}</small>
              </div>
              <div className="riderActions">
                <button type="button" className="zoneEditBtn" onClick={() => openRiderEditor(rider)} disabled={busy}>Edit</button>
                <button type="button" className="zoneDeleteBtn" onClick={() => deleteRider(rider)} disabled={busy}>Delete</button>
              </div>
            </div>
          )) : <div className="zonesEmpty"><div className="emptyIcon">🛵</div><strong>No riders saved</strong><span>Add rider details once and reuse them for every delivery.</span></div>}
        </div>
      </section>

      <section className="zonesPanel panel">
        <div className="zonesHeader">
          <div>
            <div className="eyebrow">DELIVERY SETTINGS</div>
            <h2>Delivery Zones</h2>
            <p>Set the delivery charge and minimum order for each area.</p>
          </div>

          <button
            className="primaryBtn"
            type="button"
            onClick={() => openZoneEditor()}
            disabled={busy}
          >
            ＋ Add Delivery Zone
          </button>
        </div>

        <div className="zonesTableWrap">
          {zones.length ? (
            <table className="zonesTable">
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Minimum order</th>
                  <th>Delivery charge</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.id}>
                    <td>
                      <strong>{zone.name}</strong>
                    </td>
                    <td>{money(zone.min_order)}</td>
                    <td>{money(zone.charge)}</td>
                    <td>
                      <span className={`zoneStatus ${zone.active ? "on" : "off"}`}>
                        {zone.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="zoneActions">
                        <button
                          type="button"
                          className="zoneEditBtn"
                          onClick={() => openZoneEditor(zone)}
                          disabled={busy}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="zoneDeleteBtn"
                          onClick={() => deleteZone(zone)}
                          disabled={busy}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="zonesEmpty">
              <div className="emptyIcon">📍</div>
              <strong>No delivery zones yet</strong>
              <span>Add your first zone to make it available in the Order page.</span>
            </div>
          )}
        </div>
      </section>

      {riderEditorOpen ? (
        <div className="zoneModalBackdrop" role="presentation">
          <form className="zoneModal" onSubmit={saveRider}>
            <div className="zoneModalHeader"><div><div className="eyebrow">DELIVERY TEAM</div><h2>{riderForm.id ? "Edit Rider" : "Add Rider"}</h2></div><button type="button" className="zoneCloseBtn" onClick={() => setRiderEditorOpen(false)}>×</button></div>
            <label className="zoneField"><span>Rider name *</span><input value={riderForm.name} onChange={e => setRiderForm(v => ({...v,name:e.target.value}))} placeholder="e.g. Rahul Kumar" autoFocus /></label>
            <div className="zoneFormGrid">
              <label className="zoneField"><span>Mobile</span><input value={riderForm.phone} onChange={e => setRiderForm(v => ({...v,phone:e.target.value}))} inputMode="tel" placeholder="98765 43210" /></label>
              <label className="zoneField"><span>Vehicle</span><input value={riderForm.vehicle} onChange={e => setRiderForm(v => ({...v,vehicle:e.target.value}))} placeholder="Bike · DL 01 AB 1234" /></label>
            </div>
            <label className="zoneToggle"><input type="checkbox" checked={riderForm.active} onChange={e => setRiderForm(v => ({...v,active:e.target.checked}))}/><span><strong>Active rider</strong><small>Only active riders appear in the assignment dropdown.</small></span></label>
            <div className="zoneModalFooter"><button type="button" className="ghostBtn" onClick={() => setRiderEditorOpen(false)} disabled={busy}>Cancel</button><button className="primaryBtn" type="submit" disabled={busy}>{busy ? "Saving…" : riderForm.id ? "Save Rider" : "Add Rider"}</button></div>
          </form>
        </div>
      ) : null}

      {zoneEditorOpen ? (
        <div className="zoneModalBackdrop" role="presentation">
          <form className="zoneModal" onSubmit={saveZone}>
            <div className="zoneModalHeader">
              <div>
                <div className="eyebrow">DELIVERY ZONE</div>
                <h2>{zoneForm.id ? "Edit Delivery Zone" : "Add Delivery Zone"}</h2>
              </div>

              <button
                type="button"
                className="zoneCloseBtn"
                onClick={() => setZoneEditorOpen(false)}
              >
                ×
              </button>
            </div>

            <label className="zoneField">
              <span>Zone name *</span>
              <input
                value={zoneForm.name}
                onChange={(e) =>
                  setZoneForm((v) => ({ ...v, name: e.target.value }))
                }
                placeholder="e.g. 0-3 KM"
                autoFocus
              />
            </label>

            <div className="zoneFormGrid">
              <label className="zoneField">
                <span>Delivery charge</span>
                <input
                  value={zoneForm.charge}
                  onChange={(e) =>
                    setZoneForm((v) => ({ ...v, charge: e.target.value }))
                  }
                  inputMode="decimal"
                  min="0"
                  type="number"
                  placeholder="30"
                />
              </label>

              <label className="zoneField">
                <span>Minimum order</span>
                <input
                  value={zoneForm.min_order}
                  onChange={(e) =>
                    setZoneForm((v) => ({ ...v, min_order: e.target.value }))
                  }
                  inputMode="decimal"
                  min="0"
                  type="number"
                  placeholder="0"
                />
              </label>
            </div>

            <label className="zoneToggle">
              <input
                type="checkbox"
                checked={zoneForm.active}
                onChange={(e) =>
                  setZoneForm((v) => ({ ...v, active: e.target.checked }))
                }
              />
              <span>
                <strong>Active</strong>
                <small>Show this zone in the customer/order delivery list.</small>
              </span>
            </label>

            <div className="zoneModalFooter">
              <button
                type="button"
                className="ghostBtn"
                onClick={() => setZoneEditorOpen(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button className="primaryBtn" type="submit" disabled={busy}>
                {busy ? "Saving..." : zoneForm.id ? "Save Changes" : "Save Zone"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <section className="deliveryLayout">
        <div className="panel deliveryListPanel">
          <div className="panelHeader">
            <div>
              <h2>Delivery Slips</h2>
              <span>{filtered.length} records</span>
            </div>

            <div className="filters">
              {[
                ["active", "Active"],
                ["out", "Out"],
                ["delivered", "Delivered"],
                ["settlement", "Settle"],
                ["settled", "Settled"],
                ["all", "All"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={
                    filter === value ? "filter active" : "filter"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="empty">Loading delivery queue…</div>
          ) : !filtered.length ? (
            <div className="empty">
              <div className="emptyIcon">🧾</div>
              <strong>No slips in this view</strong>
              <span>Delivery and takeaway orders will appear here.</span>
            </div>
          ) : (
            <div className="queue">
              {filtered.map((delivery) => (
                <button
                  key={delivery.id}
                  className={`deliveryRow ${
                    selected?.id === delivery.id ? "selected" : ""
                  }`}
                  onClick={() => selectDelivery(delivery)}
                >
                  <div className="slip">
                    <b>{delivery.slip_no || "DELIVERY"}</b>

                    <small>
                      {delivery.customer_name || "Customer"} •{" "}
                      {delivery.phone || "No phone"}
                    </small>

                    <small>
                      {delivery.delivery_person_name ||
                        delivery.rider_name ||
                        "No delivery person"}
                    </small>
                  </div>

                  <div className="rowRight">
                    <strong>{money(delivery.expected_amount)}</strong>

                    <span className={`status ${delivery.status}`}>
                      {statusLabel(delivery.status)}
                    </span>

                    <small
                      className={
                        delivery.settlement_status === "settled"
                          ? "settledText"
                          : "pendingText"
                      }
                    >
                      {delivery.settlement_status === "settled"
                        ? "✓ Payment settled"
                        : delivery.collection_status === "pending_settlement"
                          ? "💰 Money to settle"
                          : collectionLabel(
                              delivery.collection_status
                            )}
                    </small>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="panel detailPanel">
          {!selected ? (
            <div className="empty bigEmpty">
              <div className="emptyIcon">🛵</div>
              <h2>Select a delivery</h2>
              <p>
                The slip remains linked to the order until delivery payment
                is settled.
              </p>
            </div>
          ) : (
            <>
              <div className="detailHeader">
                <div>
                  <div className="eyebrow">
                    {selected.order_mode === "takeaway"
                      ? "TAKEAWAY"
                      : "DELIVERY"}
                  </div>

                  <h2>{selected.slip_no || "Delivery"}</h2>

                  <p>
                    {selected.customer_name} •{" "}
                    {selected.phone || "No phone"}
                  </p>
                </div>

                <button
                  className="printBtn"
                  onClick={() => printSlip(selected)}
                >
                  🖨 Print Slip
                </button>
                  <button className="printBtn" onClick={() => printSlipThermal(selected)}>🖨 Thermal 80mm</button>
              </div>

              <div className="collectionBanner">
                <div>
                  <strong>
                    {selected.settlement_status === "settled"
                      ? "✓ Payment settled"
                      : selected.collection_status === "pending_settlement"
                        ? "💰 Payment is with rider / owner"
                        : selected.collection_status === "pending_collection"
                          ? "💰 Collect payment from customer"
                          : "✓ No cash collection required"}
                  </strong>

                  <span>
                    Expected collection:{" "}
                    <b>{money(selected.expected_amount)}</b>
                  </span>
                </div>

                <div className="collectionAmount">
                  {money(
                    selected.collection_received ||
                      selected.cash_collected +
                        selected.upi_collected +
                        selected.card_collected
                  )}
                </div>
              </div>

              <div className="customerCard">
                <b>Customer / Delivery</b>
                <span>
                  {selected.address || "Counter pickup"}
                </span>

                {selected.zone ? (
                  <small>Zone: {selected.zone}</small>
                ) : null}

                {selected.customer_notes ? (
                  <small>
                    Note: {selected.customer_notes}
                  </small>
                ) : null}
              </div>

              <div className="detailGrid">
                <div>
                  <label>Delivery person</label>

                  {selected.order_mode === "takeaway" ? (
                    <>
                      <strong>Counter pickup</strong>
                      <small>No rider required.</small>
                    </>
                  ) : (
                    <>
                      <div className="personTabs">
                        <button
                          className={
                            personType === "rider"
                              ? "personTab active"
                              : "personTab"
                          }
                          onClick={() => setPersonType("rider")}
                        >
                          🛵 Rider
                        </button>

                        <button
                          className={
                            personType === "owner"
                              ? "personTab active"
                              : "personTab"
                          }
                          onClick={() => setPersonType("owner")}
                        >
                          👤 Owner
                        </button>
                      </div>

                      {personType === "rider" ? (
                        <select
                          value={riderId}
                          onChange={(e) => setRiderId(e.target.value)}
                        >
                          <option value="">Select rider</option>

                          {riders
                            .filter((r) => r.active !== false)
                            .map((rider) => (
                              <option
                                key={rider.id}
                                value={rider.id}
                              >
                                {rider.name}
                                {rider.phone
                                  ? ` • ${rider.phone}`
                                  : ""}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <>
                          <input
                            value={ownerName}
                            onChange={(e) =>
                              setOwnerName(e.target.value)
                            }
                            placeholder="Owner name"
                          />

                          <input
                            value={ownerPhone}
                            onChange={(e) =>
                              setOwnerPhone(e.target.value)
                            }
                            placeholder="Owner phone"
                          />
                        </>
                      )}

                      <button
                        disabled={busy}
                        onClick={assignDeliveryPerson}
                      >
                        {personType === "owner"
                          ? "Assign Owner"
                          : "Assign Rider"}
                      </button>
                    </>
                  )}
                </div>

                <div>
                  <label>Payment</label>

                  <strong className="amountBig">
                    {money(selected.expected_amount)}
                  </strong>

                  <small>
                    {String(
                      selected.payment_method || "cash"
                    ).toUpperCase()}
                    {" • "}
                    {selected.settlement_status === "settled"
                      ? "Settled"
                      : selected.collection_status ===
                          "pending_settlement"
                        ? "Settlement pending"
                        : "Collection pending"}
                  </small>
                </div>
              </div>

              <div className="statusActions">
                {selected.order_mode === "takeaway" ? (
                  <>
                    <button
                      disabled={busy}
                      onClick={() =>
                        action({
                          action: "status",
                          delivery_id: selected.id,
                          status: "ready_for_pickup",
                        })
                      }
                    >
                      📦 Ready for Pickup
                    </button>

                    <button
                      disabled={busy}
                      onClick={() =>
                        action({
                          action: "status",
                          delivery_id: selected.id,
                          status: "picked_up",
                        })
                      }
                    >
                      ✓ Picked Up
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      disabled={
                        busy ||
                        selected.status === "out_for_delivery"
                      }
                      onClick={() =>
                        action({
                          action: "status",
                          delivery_id: selected.id,
                          status: "out_for_delivery",
                        })
                      }
                    >
                      🛵 Out for Delivery
                    </button>

                    <button
                      disabled={
                        busy ||
                        !["assigned", "out_for_delivery"].includes(
                          selected.status
                        )
                      }
                      onClick={markDelivered}
                    >
                      ✓ Delivered
                    </button>
                  </>
                )}

                <button
                  disabled={
                    busy ||
                    selected.status === "cancelled" ||
                    selected.settlement_status === "settled"
                  }
                  onClick={() =>
                    action({
                      action: "status",
                      delivery_id: selected.id,
                      status: "cancelled",
                    })
                  }
                >
                  Cancel
                </button>
              </div>

              <div className="settlement">
                <div>
                  <div className="eyebrow">
                    DELIVERY PAYMENT SETTLEMENT
                  </div>

                  <h3>
                    {selected.settlement_status === "settled"
                      ? "Settlement complete"
                      : "Settle money returned to restaurant"}
                  </h3>

                  <p>
                    COD payment stays pending while the rider or owner is
                    outside. Enter the actual money received only after the
                    delivery has been completed.
                  </p>
                </div>

                <div className="settleGrid">
                  <MoneyInput
                    label="Cash (Edit amount)"
                    value={cash}
                    setValue={setCash}
                  />

                  <MoneyInput
                    label="UPI (Edit amount)"
                    value={upi}
                    setValue={setUpi}
                  />

                  <MoneyInput
                    label="Card (Edit amount)"
                    value={card}
                    setValue={setCard}
                  />
                </div>

                <small className="settlementHint">
                  Final bill amount (after offer discount + delivery charge) is auto-filled. Edit any amount or split the payment between Cash, UPI and Card.
                </small>

                <textarea
                  value={collectionNote}
                  onChange={(e) =>
                    setCollectionNote(e.target.value)
                  }
                  placeholder="Settlement note (optional)"
                  rows={2}
                />

                <div className="settleFooter">
                  <div>
                    <strong>
                      Received:{" "}
                      {money(
                        Number(cash || 0) +
                          Number(upi || 0) +
                          Number(card || 0)
                      )}
                    </strong>

                    <span>
                      Expected: {money(selected.expected_amount)}
                    </span>
                  </div>

                  <button
                    disabled={
                      busy ||
                      selected.settlement_status === "settled" ||
                      !["delivered", "picked_up"].includes(
                        selected.status
                      )
                    }
                    onClick={settle}
                  >
                    ✓ Settle Payment
                  </button>

                  <button
                    type="button"
                    disabled={
                      busy ||
                      selected.settlement_status !== "settled"
                    }
                    onClick={markDoneAndBill}
                  >
                    {busy ? "Saving…" : "✓ Mark Done & Open Billing"}
                  </button>
                </div>
              </div>

              <div className="timeline">
                <b>Delivery lifecycle</b>

                <div>
                  <span className="done">
                    1. Slip issued —{" "}
                    {selected.slip_no || "pending"}
                  </span>

                  <span
                    className={
                      ["assigned", "out_for_delivery", "delivered"].includes(
                        selected.status
                      )
                        ? "done"
                        : ""
                    }
                  >
                    2. Rider / owner assigned
                  </span>

                  <span
                    className={
                      ["out_for_delivery", "delivered"].includes(
                        selected.status
                      )
                        ? "done"
                        : ""
                    }
                  >
                    3. Out for delivery
                  </span>

                  <span
                    className={
                      ["delivered", "picked_up"].includes(
                        selected.status
                      )
                        ? "done"
                        : ""
                    }
                  >
                    4. Delivered / picked up
                  </span>

                  <span
                    className={
                      selected.settlement_status === "settled"
                        ? "done"
                        : ""
                    }
                  >
                    5. Money returned & settled → Mark Done & Billing
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <style jsx>{`
        .deliveryPage {
          min-height: 100vh;
          padding: 22px;
          background:
            radial-gradient(
              circle at top right,
              rgba(var(--primary-rgb), 0.09),
              transparent 34%
            ),
            linear-gradient(
              135deg,
              var(--background),
              var(--surface-2),
              var(--background)
            );
          color: var(--text);
        }

        .deliveryHero,
        .panel,
        .deliveryStats > div {
          background: rgba(var(--surface-2-rgb), 0.82);
          border: 1px solid rgba(var(--primary-rgb), 0.15);
          border-radius: 24px;
          box-shadow: 0 20px 55px rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(18px);
        }

        .deliveryHero {
          padding: 24px;
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: center;
        }

        .deliveryHero h1 {
          margin: 4px 0;
          font-size: 34px;
        }

        .deliveryHero p {
          margin: 0;
          color: var(--muted);
          max-width: 760px;
          line-height: 1.5;
        }

        .eyebrow {
          color: var(--primary);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 1.7px;
        }

        .heroActions,
        .statusActions {
          display: flex;
          gap: 9px;
        }

        .primaryBtn,
        .ghostBtn,
        .printBtn,
        .settleFooter button,
        .statusActions button,
        .detailGrid button {
          border-radius: 12px;
          padding: 11px 14px;
          border: 1px solid rgba(var(--primary-rgb), 0.22);
          background: rgba(var(--primary-rgb), 0.1);
          color: var(--text);
          font-weight: 800;
          cursor: pointer;
          text-decoration: none;
        }

        .primaryBtn {
          background: var(--primary);
          color: #111;
        }

        button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .message {
          margin: 12px 0;
          padding: 13px 15px;
          border-radius: 13px;
          font-weight: 700;
        }

        .message.error {
          border: 1px solid rgba(248, 113, 113, 0.35);
          background: rgba(248, 113, 113, 0.09);
          color: var(--danger);
        }

        .message.success {
          border: 1px solid rgba(74, 222, 128, 0.35);
          background: rgba(74, 222, 128, 0.09);
          color: #bbf7d0;
        }

        .deliveryStats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin: 14px 0;
        }

        .deliveryStats > div {
          padding: 16px;
        }

        .deliveryStats span {
          display: block;
          color: var(--muted);
          font-size: 12px;
        }

        .deliveryStats strong {
          display: block;
          font-size: 25px;
          margin-top: 4px;
        }

        .deliveryLayout {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(390px, 0.9fr);
          gap: 14px;
        }

        .panel {
          padding: 18px;
        }

        .panelHeader,
        .detailHeader,
        .settleFooter {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
        }

        .panelHeader h2,
        .detailHeader h2 {
          margin: 0;
        }

        .panelHeader span,
        .detailHeader p {
          color: var(--muted);
          font-size: 12px;
        }

        .filters {
          display: flex;
          gap: 5px;
          overflow: auto;
        }

        .filter {
          border: 0;
          background: rgba(255, 255, 255, 0.04);
          color: var(--muted);
          padding: 7px 9px;
          border-radius: 9px;
          white-space: nowrap;
          cursor: pointer;
        }

        .filter.active {
          background: rgba(var(--primary-rgb), 0.14);
          color: var(--primary);
        }

        .queue {
          display: grid;
          gap: 7px;
          margin-top: 14px;
          max-height: 720px;
          overflow: auto;
        }

        .deliveryRow {
          width: 100%;
          display: flex;
          justify-content: space-between;
          gap: 10px;
          text-align: left;
          padding: 13px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.025);
          color: var(--text);
          cursor: pointer;
        }

        .deliveryRow.selected {
          border-color: var(--primary);
          background: rgba(var(--primary-rgb), 0.08);
        }

        .slip {
          min-width: 0;
        }

        .slip b,
        .slip small,
        .rowRight small {
          display: block;
        }

        .slip small {
          color: var(--muted);
          margin-top: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 330px;
        }

        .rowRight {
          text-align: right;
          display: grid;
          justify-items: end;
          gap: 4px;
        }

        .status {
          font-size: 10px;
          padding: 5px 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.07);
        }

        .status.out_for_delivery {
          color: var(--warning);
        }

        .status.delivered {
          color: var(--success);
        }

        .status.cancelled {
          color: var(--danger);
        }

        .settledText {
          color: var(--success) !important;
        }

        .pendingText {
          color: var(--warning) !important;
        }

        .empty {
          text-align: center;
          padding: 50px 20px;
          color: var(--muted);
        }

        .empty strong {
          display: block;
          color: var(--text);
          margin-bottom: 5px;
        }

        .emptyIcon {
          font-size: 42px;
          margin-bottom: 8px;
        }

        .customerCard {
          margin-top: 15px;
          padding: 13px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.035);
          display: grid;
          gap: 5px;
        }

        .customerCard span {
          font-size: 13px;
          line-height: 1.45;
        }

        .customerCard small {
          color: var(--muted);
        }

        .collectionBanner {
          margin-top: 14px;
          padding: 14px;
          border: 1px solid rgba(var(--primary-rgb), 0.22);
          border-radius: 16px;
          background: rgba(var(--primary-rgb), 0.07);
          display: flex;
          justify-content: space-between;
          gap: 15px;
          align-items: center;
        }

        .collectionBanner strong,
        .collectionBanner span {
          display: block;
        }

        .collectionBanner span {
          margin-top: 4px;
          color: var(--muted);
          font-size: 12px;
        }

        .collectionAmount {
          font-size: 24px;
          font-weight: 900;
          color: var(--primary);
        }

        .detailGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 12px;
        }

        .detailGrid > div {
          padding: 12px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.03);
          display: grid;
          gap: 7px;
        }

        .detailGrid label {
          font-size: 10px;
          color: var(--muted);
          text-transform: uppercase;
        }

        .detailGrid select,
        .detailGrid input,
        .settleGrid input,
        .settlement textarea {
          width: 100%;
          box-sizing: border-box;
          padding: 10px;
          border-radius: 10px;
          background: #10241c;
          color: var(--text);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .personTabs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }

        .personTab {
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 9px;
          color: var(--muted);
          background: rgba(255, 255, 255, 0.03);
          cursor: pointer;
        }

        .personTab.active {
          border-color: var(--primary);
          color: var(--primary);
          background: rgba(var(--primary-rgb), 0.08);
        }

        .amountBig {
          font-size: 25px;
        }

        .statusActions {
          margin-top: 10px;
        }

        .statusActions button {
          flex: 1;
        }

        .settlement {
          margin-top: 14px;
          padding: 15px;
          border-radius: 17px;
          border: 1px solid rgba(var(--primary-rgb), 0.16);
          background: rgba(var(--primary-rgb), 0.05);
        }

        .settlement h3 {
          margin: 3px 0;
        }

        .settlement p {
          color: var(--muted);
          font-size: 12px;
          line-height: 1.5;
        }

        .settleGrid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 12px;
        }

        .settleGrid label {
          display: block;
          color: var(--muted);
          font-size: 10px;
          margin-bottom: 4px;
        }

        .settlement textarea {
          margin-top: 9px;
          resize: vertical;
        }

        .settleFooter {
          margin-top: 12px;
        }

        .settleFooter > div {
          display: grid;
          gap: 3px;
        }

        .settleFooter span {
          color: var(--muted);
          font-size: 12px;
        }

        .timeline {
          margin-top: 14px;
          padding: 13px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.025);
        }

        .timeline > div {
          display: grid;
          gap: 6px;
          margin-top: 8px;
        }

        .timeline span {
          font-size: 12px;
          color: var(--muted);
        }

        .timeline span.done {
          color: var(--success);
        }

        .timeline span.done:before {
          content: "✓ ";
          color: var(--success);
        }

        .zonesPanel {
          margin-bottom: 12px;
        }

        .zonesHeader {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
        }

        .zonesHeader h2 {
          margin: 3px 0 2px;
        }

        .zonesHeader p {
          margin: 0;
          color: var(--muted);
          font-size: 12px;
        }

        .zonesTableWrap {
          margin-top: 14px;
          overflow-x: auto;
        }

        .zonesTable {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0 6px;
          min-width: 650px;
        }

        .zonesTable th {
          padding: 4px 10px 7px;
          text-align: left;
          color: var(--muted);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .04em;
        }

        .zonesTable td {
          padding: 11px 10px;
          background: rgba(255,255,255,.03);
          border-top: 1px solid rgba(255,255,255,.05);
          border-bottom: 1px solid rgba(255,255,255,.05);
          font-size: 12px;
        }

        .zonesTable td:first-child {
          border-left: 1px solid rgba(255,255,255,.05);
          border-radius: 11px 0 0 11px;
        }

        .zonesTable td:last-child {
          border-right: 1px solid rgba(255,255,255,.05);
          border-radius: 0 11px 11px 0;
        }

        .zoneStatus {
          display: inline-flex;
          align-items: center;
          padding: 5px 9px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 800;
        }

        .zoneStatus.on {
          color: var(--success);
          background: rgba(74,222,128,.1);
        }

        .zoneStatus.off {
          color: var(--muted);
          background: rgba(255,255,255,.06);
        }

        .zoneActions {
          display: flex;
          justify-content: flex-end;
          gap: 6px;
        }

        .zoneEditBtn,
        .zoneDeleteBtn {
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px;
          padding: 6px 9px;
          background: rgba(255,255,255,.04);
          color: var(--text);
          cursor: pointer;
          font-size: 10px;
          font-weight: 800;
        }

        .zoneEditBtn:hover {
          border-color: var(--primary);
          color: var(--primary);
        }

        .zoneDeleteBtn {
          color: var(--danger);
        }

        .zoneDeleteBtn:hover {
          border-color: var(--danger);
          color: var(--danger);
        }

        .zonesEmpty {
          margin-top: 14px;
          padding: 28px 18px;
          text-align: center;
          border-radius: 14px;
          background: rgba(255,255,255,.025);
          color: var(--muted);
          display: grid;
          gap: 5px;
        }

        .zonesEmpty strong {
          color: var(--text);
        }

        .zonesEmpty .emptyIcon {
          font-size: 28px;
          margin: 0;
        }

        .zoneModalBackdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(0,0,0,.62);
          backdrop-filter: blur(8px);
        }

        .zoneModal {
          width: min(520px, 100%);
          padding: 20px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,.1);
          background:
            linear-gradient(180deg, rgba(20,42,60,.98), rgba(9,25,39,.98));
          box-shadow: 0 30px 90px rgba(0,0,0,.55);
        }

        .zoneModalHeader {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 16px;
        }

        .zoneModalHeader h2 {
          margin: 3px 0 0;
          font-size: 20px;
        }

        .zoneCloseBtn {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(255,255,255,.04);
          color: var(--text);
          font-size: 22px;
          cursor: pointer;
        }

        .zoneField {
          display: grid;
          gap: 6px;
          margin-top: 11px;
        }

        .zoneField span {
          color: var(--muted);
          font-size: 11px;
          font-weight: 700;
        }

        .zoneField input {
          width: 100%;
          box-sizing: border-box;
          padding: 11px 12px;
          border-radius: 11px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(255,255,255,.045);
          color: var(--text);
          outline: none;
          font-size: 13px;
        }

        .zoneField input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(var(--primary-rgb),.1);
        }

        .zoneFormGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .zoneToggle {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 15px;
          padding: 11px 12px;
          border-radius: 12px;
          background: rgba(255,255,255,.035);
        }

        .zoneToggle input {
          width: 18px;
          height: 18px;
          accent-color: var(--primary);
        }

        .zoneToggle span {
          display: grid;
          gap: 2px;
        }

        .zoneToggle small {
          color: var(--muted);
          font-size: 10px;
        }

        .zoneModalFooter {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 18px;
        }

        @media (max-width: 900px) {
          .deliveryPage {
            padding: 12px;
          }

          .deliveryHero {
            display: block;
          }

          .heroActions {
            margin-top: 12px;
          }

          .deliveryStats {
            grid-template-columns: repeat(2, 1fr);
          }

          .deliveryLayout {
            grid-template-columns: 1fr;
          }

          .detailPanel {
            order: -1;
          }

          .deliveryHero h1 {
            font-size: 27px;
          }
        }

        @media (max-width: 900px) {
          .zonesHeader {
            align-items: flex-start;
            flex-direction: column;
          }
        }

        @media (max-width: 560px) {
          .deliveryStats {
            gap: 7px;
          }

          .deliveryStats > div {
            padding: 12px;
          }

          .deliveryStats strong {
            font-size: 21px;
          }

          .deliveryHero {
            padding: 17px;
          }

          .panel {
            padding: 13px;
          }

          .detailGrid,
          .settleGrid {
            grid-template-columns: 1fr;
          }

          .statusActions {
            display: grid;
            grid-template-columns: 1fr;
          }

          .settleFooter {
            align-items: stretch;
            flex-direction: column;
          }

          .filters {
            max-width: 100%;
          }

          .collectionBanner {
            align-items: flex-start;
          }

          .zoneFormGrid {
            grid-template-columns: 1fr;
          }

          .zoneModal {
            padding: 15px;
          }

          .zoneModalFooter {
            flex-direction: column-reverse;
          }

          .zoneModalFooter button {
            width: 100%;
          }
        }
      `}</style>
    </main>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function MoneyInput({ label, value, setValue }) {
  return (
    <label>
      <span>{label}</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        placeholder="₹0"
      />
    </label>
  )
}
