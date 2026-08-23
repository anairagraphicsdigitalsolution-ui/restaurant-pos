"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import SalesChart from "@/components/SalesChart"
import ItemChart from "@/components/ItemChart"
import jsPDF from "jspdf"
import html2canvas from "html2canvas"

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

  const [showAllOrders, setShowAllOrders] = useState(false)
  const [billingRefresh, setBillingRefresh] = useState(0)

  const [editMode, setEditMode] = useState(false)

  const [reportDate, setReportDate] = useState("")
  const [reportEndDate, setReportEndDate] = useState("")

  const [reportTotals, setReportTotals] = useState({})
  const [itemChartData, setItemChartData] = useState([])
  const [itemSalesRows, setItemSalesRows] = useState([])

  const [invoiceNo, setInvoiceNo] = useState("")
  const [offerDiscount, setOfferDiscount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [paidAmount, setPaidAmount] = useState("")
  const [finalizing, setFinalizing] = useState(false)
  const [finalizedBill, setFinalizedBill] = useState(null)
  const invoiceRef = useRef(null)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      setBillView(isDedicatedBillPage || params.get("view") === "bill")
    }
    init()
  }, [billingRefresh, isDedicatedBillPage, pathname])

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
      return
    }

    const orderRows = data || []
    setOrders(orderRows)

    const orderIds = orderRows.map(o => o.id)

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

  async function loadBill(orderId) {

    const selected =
      orders.find(o => o.id === orderId)

    setCurrentOrder(selected)
    setSelectedOrder(orderId)
    if (typeof window !== "undefined") {
      window.localStorage.setItem("anaira_pos_selected_order", orderId)
    }
    setFinalizedBill(null)
    setEditMode(false)

    if (!selected) {
      setItems([])
      setAvailableOffers([])
      setSelectedOffer(null)
      return
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
          .select("id,name,price")
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

    const today = new Date()

    const eligibleOffers =
      (offers || []).filter(offer => {
        const active = offer.active !== false
        const fromOk = !offer.valid_from || new Date(offer.valid_from) <= today
        const tillOk = !offer.valid_till || new Date(`${offer.valid_till}T23:59:59`) >= today
        const minOrder = Number(offer.min_order || 0)
        return active && fromOk && tillOk && orderSubtotal >= minOrder
      })

    const rankedOffers = eligibleOffers
      .map(offer => {
        const targetType = String(offer.target_type || "all")
        let eligibleSubtotal = orderSubtotal

        if (targetType === "products") {
          const ids = new Set((offer.offer_products || []).map(x => x.menu_item_id))
          eligibleSubtotal = items.reduce((sum, item) => ids.has(item.menu_items?.id || item.item_id) ? sum + Number(item.line_total || 0) : sum, 0)
        } else if (targetType === "category") {
          eligibleSubtotal = items.reduce((sum, item) => item.menu_items?.category === offer.target_category ? sum + Number(item.line_total || 0) : sum, 0)
        }

        const value = Math.max(0, Number(offer.discount || 0))
        const type = String(offer.discount_type || "percent").toLowerCase()
        let discount = type === "flat"
          ? Math.min(eligibleSubtotal, value)
          : Math.min(eligibleSubtotal, eligibleSubtotal * Math.min(value, 100) / 100)

        if (offer.max_discount != null) discount = Math.min(discount, Math.max(0, Number(offer.max_discount)))

        return { ...offer, calculated_discount: Number(discount.toFixed(2)) }
      })
        .filter(
          offer =>
            offer.calculated_discount >
            0
        )
        .sort(
          (a, b) =>
            b.calculated_discount -
            a.calculated_discount
        )

    const storedOffer =
      selected?.offer_id
        ? (offers || []).find(
            offer =>
              offer.id ===
              selected.offer_id
          )
        : null

    const bestOffer =
      storedOffer ||
      rankedOffers[0] ||
      null

    setAvailableOffers(rankedOffers)
    setSelectedOffer(bestOffer)

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

    setPaidAmount(
      selected?.payment_status ===
        "paid"
        ? String(
            selected.paid_amount ||
            selected.total_amount ||
            ""
          )
        : ""
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
  const useServerDiscount =
    serverDiscount > 0 &&
    (!selectedOfferId || selectedOfferId === serverOfferId)

  const previewDiscount =
    useServerDiscount
      ? serverDiscount
      : Number(
          selectedOffer?.calculated_discount ||
          0
        )

  const discountAmount =
    previewDiscount

  const taxableAmount =
    Math.max(
      0,
      subtotal -
        discountAmount
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
    Total

    If server has a real total, use it.
    Otherwise calculate from resolved
    menu prices.
  */

  const storedOrderTotal =
    Number(
      currentOrder?.total_amount ||
      0
    )

  const useStoredOrderTotal =
    storedOrderTotal > 0 &&
    !editMode &&
    (!selectedOfferId || selectedOfferId === serverOfferId)

  const total =
    useStoredOrderTotal
      ? storedOrderTotal
      : Number(
          (
            taxableAmount +
            gst
          ).toFixed(2)
        )

  async function finalizeBill() {

    if (
      !selectedOrder ||
      !currentOrder
    ) {
      return
    }

    setFinalizing(true)

    try {

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

              payment_method:
                paymentMethod,

              paid_amount:
                Number(
                  paidAmount || 0
                ),

              offer_id:
                selectedOffer?.id ||
                null

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

      alert(
        `Invoice ${result.bill.invoice_no} generated successfully.`
      )

      setCurrentOrder(
        prev => ({
          ...prev,
          ...result.bill
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

      if (
        currentOrder?.restaurant_id
      ) {

        await fetchOrders(
          currentOrder.restaurant_id
        )
      }

    } catch (error) {

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

    return new Date(
      date
    ).toLocaleString(
      "en-IN"
    )
  }

  const today = (() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  })()

  /*
    Reports: blank dates mean ALL orders.
    One date means that day. Two dates mean an inclusive range.
  */

  const filteredOrders = orders.filter(o => {
    const orderDate = String(o.created_at || "").slice(0, 10)
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

  const paidOrderCount = filteredOrders.filter(
    o => String(o.payment_status || "").toLowerCase() === "paid"
  ).length

  const pendingAmount = filteredOrders.reduce((sum, o) => {
    const orderTotal = Number(reportTotals[o.id] || 0)
    const paid = Number(o.paid_amount || 0)
    return sum + Math.max(0, orderTotal - paid)
  }, 0)

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
      const canvas = await html2canvas(element, {
        scale: Math.min(2, window.devicePixelRatio || 1.5),
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: element.scrollWidth,
      })

      const printDimensions = {
        "A4": [210, 297],
        "A5": [148, 210],
        "THERMAL_80": [80, 200],
        "THERMAL_58": [58, 200],
        "CUSTOM": [
          Math.max(40, Number(customPrintWidth) || 210),
          Math.max(60, Number(customPrintHeight) || 297),
        ],
      }

      const [pageWidth, pageHeight] =
        printDimensions[printSize] || printDimensions.A4

      const pdf = new jsPDF({
        orientation: pageWidth > pageHeight ? "landscape" : "portrait",
        unit: "mm",
        format: [pageWidth, pageHeight],
      })

      const margin = printSize === "THERMAL_58" || printSize === "THERMAL_80" ? 3 : 8
      const usableWidth = pageWidth - margin * 2
      const imageHeight = (canvas.height * usableWidth) / canvas.width
      const imageData = canvas.toDataURL("image/jpeg", 0.95)

      let remaining = imageHeight
      let offset = 0

      pdf.addImage(
        imageData,
        "JPEG",
        margin,
        margin,
        usableWidth,
        imageHeight,
        undefined,
        "FAST"
      )

      remaining -= pageHeight - margin * 2

      while (remaining > 0) {
        offset += pageHeight - margin * 2
        pdf.addPage()
        pdf.addImage(
          imageData,
          "JPEG",
          margin,
          margin - offset,
          usableWidth,
          imageHeight,
          undefined,
          "FAST"
        )
        remaining -= pageHeight - margin * 2
      }

      const invoiceNumber =
        currentOrder?.invoice_no ||
        finalizedBill?.invoice_no ||
        selectedOrder?.slice(0, 8) ||
        "invoice"

      pdf.save(`invoice-${invoiceNumber}.pdf`)
    } catch (error) {
      console.error("PDF GENERATION ERROR:", error)
      alert("Unable to generate invoice PDF on this device.")
    }
  }

  function printContent(id, selectedPrintSize = printSize) {

    const element =
      document.getElementById(id)

    if (!element) return

    const clone = element.cloneNode(true)

    clone
      .querySelectorAll("[data-html2canvas-ignore]")
      .forEach(node => node.remove())

    const content = clone.innerHTML

    const win =
      window.open(
        "",
        "_blank"
      )

    if (!win) {
      alert(
        "Please allow popups to print."
      )
      return
    }

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

    win.document.write(
      `<html>
        <head>
          <title>Invoice</title>
          <style>
            @page {
              size: ${printWidth} ${printHeight};
              margin: 0;
            }

            * { box-sizing: border-box; }

            html, body {
              margin: 0;
              padding: 0;
              width: ${printWidth};
              background: #fff;
            }

            body {
              font-family: Arial, sans-serif;
              padding: ${printPadding};
              color: #111;
            }

            table {
              width: 100%;
              border-collapse: collapse;
            }

            th, td {
              padding: ${selectedPrintSize.startsWith("THERMAL") ? "5px 3px" : "10px 6px"};
              border-bottom: 1px solid #ddd;
              text-align: left;
            }

            h1, h2, h3, h4, p {
              max-width: 100%;
              overflow-wrap: anywhere;
            }

            .billing-invoice-card {
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 !important;
              box-shadow: none !important;
              border: 0 !important;
            }

            @media print {
              body { width: ${printWidth}; }
            }
          


.billing-page,
.billing-page * {
  box-sizing: border-box;
}

.billing-page {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
}

.billing-page h1,
.billing-page h2,
.billing-page h3,
.billing-page h4,
.billing-page p,
.billing-page span,
.billing-page strong,
.billing-page small,
.billing-page label,
.billing-page button,
.billing-page a {
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.billing-page .billing-topbar,
.billing-page .billing-summary-wrap,
.billing-page .billing-chart-grid,
.billing-page .billing-main-grid,
.billing-page .billing-left-panel,
.billing-page .billing-chart-card,
.billing-page .billing-card,
.billing-page .billing-invoice-card {
  min-width: 0;
  max-width: 100%;
}

.billing-page .billing-chart-card canvas,
.billing-page .billing-chart-card svg {
  max-width: 100% !important;
}

.billing-page input,
.billing-page select,
.billing-page textarea {
  min-width: 0;
  max-width: 100%;
}

@media(max-width:1200px){
  .billing-summary-wrap{grid-template-columns:repeat(3,minmax(0,1fr))!important}
  .billing-main-grid{grid-template-columns:minmax(280px,360px) minmax(0,1fr)!important}
  .billing-chart-grid{grid-template-columns:1fr!important}
  .billing-chart-card{min-width:0!important;overflow:hidden!important}
}
@media(max-width:900px){
  .billing-main-grid{grid-template-columns:1fr!important}
  .billing-left-panel{position:static!important}
  .billing-summary-wrap{grid-template-columns:repeat(2,minmax(0,1fr))!important}
}
@media(max-width:700px){
  .billing-page{padding:14px!important}
  .billing-topbar{padding:14px!important;margin-bottom:16px!important;display:grid!important;grid-template-columns:1fr!important}
  .billing-title{font-size:30px!important;margin-bottom:18px!important;overflow-wrap:anywhere!important}
  .billing-card{padding:16px!important;border-radius:18px!important;min-width:0!important;overflow:hidden!important}
  .billing-bill-card{padding:18px!important;border-radius:18px!important}
  .billing-summary-wrap{grid-template-columns:1fr!important;gap:12px!important}
  .billing-summary-card{width:100%!important;min-width:0!important;padding:18px!important}
  .billing-summary-card h2{font-size:24px!important;line-height:1.15!important;margin:8px 0!important;overflow-wrap:anywhere!important;word-break:break-word!important}
  .billing-summary-card p,.billing-summary-card small{overflow-wrap:anywhere!important;word-break:break-word!important}
  .billing-input{min-width:0!important;width:100%!important}
  .billing-action{min-height:46px!important;width:100%!important}
  .billing-invoice-table{font-size:11px!important;min-width:560px!important}
  .billing-chart-card{padding:16px!important;min-width:0!important}
  .billing-chart-card > *{min-width:0!important;max-width:100%!important}
}

@media(max-width:700px){
  .billing-bill-jump{
    width:100%!important;
    min-width:0!important;
    margin:0!important;
  }
  .billing-bill-section{
    width:100%!important;
    max-width:100%!important;
    scroll-margin-top:12px!important;
  }
  .billing-invoice-card{
    width:100%!important;
    max-width:100%!important;
    overflow:hidden!important;
  }
  .billing-invoice-table{
    width:100%!important;
    min-width:0!important;
    table-layout:fixed!important;
    font-size:11px!important;
  }
  .billing-invoice-table th,
  .billing-invoice-table td{
    padding:7px 5px!important;
    font-size:11px!important;
  }
  .billing-invoice-table th:nth-child(1),
  .billing-invoice-table td:nth-child(1){width:44%!important}
  .billing-invoice-table th:nth-child(2),
  .billing-invoice-table td:nth-child(2){width:14%!important}
  .billing-invoice-table th:nth-child(3),
  .billing-invoice-table td:nth-child(3){width:19%!important}
  .billing-invoice-table th:nth-child(4),
  .billing-invoice-table td:nth-child(4){width:23%!important}
  .billing-invoice-toolbar{
    flex-direction:column!important;
    align-items:stretch!important;
    gap:10px!important;
  }
  .billing-edit-btn{
    width:100%!important;
    min-height:44px!important;
  }
}

</style>
        </head>
        <body>
          ${content}
        </body>
      </html>`
    )

    win.document.close()

    win.focus()

    win.print()
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

        .billing-print-settings {
          display: grid;
          grid-template-columns: minmax(180px, 1fr) minmax(140px, .7fr) minmax(140px, .7fr);
          gap: 10px;
          align-items: end;
          padding: 14px;
          margin: 14px 0 18px;
          border: 1px solid rgba(0,0,0,.08);
          border-radius: 14px;
          background: #f8fafc;
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
            } else {
              router.push("/billing/bill")
            }
          }}
          className="billing-action billing-bill-jump"
          style={{ ...btnGreen, marginTop: 0, width: "auto", minWidth: 150 }}
        >
          {isBillScreen ? "← Billing" : "🧾 Open Bill"}
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
          <small style={{ color:"var(--success)" }}>Collected</small>
        </div>

        <div className="billing-summary-card" style={summaryCard}>
          <p style={{ color:"var(--muted)" }}>Pending Balance</p>
          <h2>₹{pendingAmount.toFixed(0)}</h2>
          <small style={{ color:"var(--warning)" }}>Outstanding</small>
        </div>

      </div>

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

      <div className="billing-main-grid" style={mainGrid}>

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
                    style={{ ...input, color:"#111827", background:"#fff", border:"1px solid #d1d5db" }}
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
                        style={{ ...input, color:"#111827", background:"#fff", border:"1px solid #d1d5db" }}
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
                        style={{ ...input, color:"#111827", background:"#fff", border:"1px solid #d1d5db" }}
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
                                <div style={{fontSize:11,color:"#64748b",marginTop:3}}>
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

              {/* TOTALS */}

              <div style={totalBox}>

                <p>
                  Subtotal:
                  {" "}
                  ₹
                  {subtotal.toFixed(2)}
                </p>

                <p>
                  Offer Discount:
                  {" "}
                  -₹
                  {discountAmount.toFixed(2)}
                </p>

                {restaurant?.gst_enabled && (

                  <p>
                    GST:
                    {" "}
                    ₹
                    {gst.toFixed(2)}
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
                  background:"#f8fafc",
                  color:"var(--surface)",
                  display:"grid",
                  gap:12
                }}
              >

                <strong>Payment</strong>

                <label className="billing-field-label">Offer / Discount</label>
                <select
                  value={selectedOffer?.id || ""}
                  onChange={e => {
                    const next = availableOffers.find(o => o.id === e.target.value) || null
                    setSelectedOffer(next)
                  }}
                  style={{ ...input, color:"#111827", background:"#fff", border:"1px solid #d1d5db" }}
                >
                  <option value="">No offer</option>
                  {availableOffers.map(offer => (
                    <option key={offer.id} value={offer.id}>
                      {offer.name || "Offer"} — save ₹{Number(offer.calculated_discount || 0).toFixed(2)}
                    </option>
                  ))}
                </select>

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
                    color:"#111827",
                    background:"#ffffff",
                    border:"1px solid #d1d5db"
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
                  value={paidAmount}
                  onChange={e =>
                    setPaidAmount(
                      e.target.value
                    )
                  }
                  placeholder={
                    `Paid amount (₹${total.toFixed(2)})`
                  }
                  style={{
                    ...input,
                    color:"#111827",
                    background:"#ffffff",
                    border:"1px solid #d1d5db"
                  }}
                />

                <button
                  onClick={
                    finalizeBill
                  }
                  disabled={
                    finalizing ||
                    currentOrder
                      ?.payment_status ===
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

                    : currentOrder
                        ?.payment_status ===
                        "paid"

                      ? "Paid"

                      : "Finalize & Generate Invoice"}

                </button>

              </div>

              <div className="billing-invoice-actions" data-html2canvas-ignore="true">
                <button
                  onClick={generateInvoicePdf}
                  className="billing-action" style={btnGreen}
                  type="button"
                  disabled={!finalizedBill && currentOrder?.payment_status !== "paid"}
                >
                  📄 Download Invoice PDF
                </button>

                <button
                  onClick={() => printContent("bill-print", printSize)}
                  className="billing-action" style={btnGreen}
                  type="button"
                  disabled={!finalizedBill && currentOrder?.payment_status !== "paid"}
                >
                  🖨 Print Invoice
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

              <div>
                GST:
                {" "}
                <strong>
                  {
                    restaurant?.gst_enabled
                      ? "Enabled"
                      : "Disabled"
                  }
                </strong>
              </div>

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
            style={{
              ...card,
              maxHeight:"850px",
              overflowY:"auto"
            }}
          >

            <h3
              style={{
                color:"var(--primary)",
                marginBottom:15
              }}
            >
              📊 Revenue Report
            </h3>

            <div
              style={{
                maxHeight:"230px",
                overflowY:"auto",
                marginTop:15,
                borderRadius:18,
                border:
                  "1px solid rgba(var(--primary-rgb),.12)",
                background:
                  "rgba(255,255,255,.02)"
              }}
            >

              <table className="billing-invoice-table" style={table}>

                <thead>

                  <tr>

                    <th style={th}>
                      Order
                    </th>

                    <th style={th}>
                      Date
                    </th>

                    <th style={th}>
                      Amount
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {filteredOrders.map(o => (

                    <tr key={o.id}>

                      <td style={td}>
                        #{o.id.slice(0,5)}
                      </td>

                      <td style={td}>
                        {formatDate(
                          o.created_at
                        )}
                      </td>

                      <td style={td}>
                        ₹
                        {Number(
                          reportTotals[o.id] ||
                          0
                        ).toFixed(2)}
                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

            <div
              style={{
                marginTop:25,
                padding:24,
                borderRadius:24,

                background:
                  "linear-gradient(135deg,rgba(var(--primary-rgb),.08),rgba(var(--warning-rgb),.05))",

                border:
                  "1px solid rgba(var(--primary-rgb),.35)",

                backdropFilter:
                  "blur(20px)",

                boxShadow:
                  "0 15px 35px rgba(var(--primary-rgb),.12)"
              }}
            >

              <h2
                style={{
                  color:"var(--primary)",
                  margin:0
                }}
              >
                ₹
                {reportTotal.toFixed(2)}
              </h2>

              <p
                style={{
                  marginTop:8,
                  color:"var(--muted)"
                }}
              >
                Total Revenue
              </p>

            </div>

            <button
              onClick={() =>
                printContent(
                  "report-print"
                )
              }
              className="billing-action" style={luxuryBtn}
            >
              🖨 Print Report
            </button>

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
  color:"#fff"
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
  background:"#ffffff",
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
  color:"#fff",
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

  color:"#fff",
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
  color:"#cbd5e1",
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