"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useParams } from "next/navigation"
import { supabaseCloud } from "@/lib/supabaseCloud"

export default function OrderPage() {
  const params = useSearchParams()
  const route = useParams()

  const slug = route?.slug
  const typeParam = route?.type
  const idParam = route?.id

  const [menu, setMenu] = useState([])
  const [tables, setTables] = useState([])
  const [rooms, setRooms] = useState([])
  const [cart, setCart] = useState([])

  const [modifierGroups, setModifierGroups] = useState([])
  const [modifiers, setModifiers] = useState([])
  const [operationsHubEnabled, setOperationsHubEnabled] = useState(true)
  const [modifierLinks, setModifierLinks] = useState([])
  const [modifierItem, setModifierItem] = useState(null)
  const [variantItem, setVariantItem] = useState(null)
  const [variantSelection, setVariantSelection] = useState(null)
  const [variantQuantities, setVariantQuantities] = useState({})
  const [variantBatch, setVariantBatch] = useState([])
  const [modifierItemQty, setModifierItemQty] = useState(1)
  const [modifierSelection, setModifierSelection] = useState({})

  const [type, setType] = useState("table")
  const [selected, setSelected] = useState(null)

  const [activeCategory, setActiveCategory] = useState("All")
  const [restaurantId, setRestaurantId] = useState(null)
  const [restaurantName, setRestaurantName] = useState("")

  const [deliveryZones, setDeliveryZones] = useState([])
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [deliveryZone, setDeliveryZone] = useState("")
  const [deliveryCharge, setDeliveryCharge] = useState(0)
  const [customerNotes, setCustomerNotes] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("cash")

  const [openSelect, setOpenSelect] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [placingOrder, setPlacingOrder] = useState(false)

  /* =========================================================
     RESPONSIVE
     ========================================================= */

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 768)
    }

    check()

    window.addEventListener("resize", check)

    return () => {
      window.removeEventListener("resize", check)
    }
  }, [])

  /* =========================================================
     INITIAL LOAD
     ========================================================= */

  useEffect(() => {
    init()
  }, [slug])

  useEffect(() => {
    if (tables.length || rooms.length) {
      autoQR()
    }
  }, [tables, rooms, typeParam, idParam])

  async function init() {
    try {
      if (slug) {
        const { data: rest, error } = await supabaseCloud
          .from("restaurants")
          .select("*")
          .eq("slug", slug)
          .maybeSingle()
        if (error || !rest) {
          console.error("RESTAURANT ERROR:", error)
          alert("Restaurant not found.")
          return
        }
        setRestaurantId(rest.id)
        setRestaurantName(rest.name || "")
        await fetchAll(rest.id)
        return
      }

      const rid = params.get("rid")
      if (rid) {
        setRestaurantId(rid)
        await fetchAll(rid)
        return
      }

      const { data: userData, error: userError } = await supabaseCloud.auth.getUser()
      if (userError || !userData?.user) {
        alert("Please sign in first.")
        return
      }
      const { data: profile, error: profileError } = await supabaseCloud
        .from("profiles").select("restaurant_id").eq("id", userData.user.id).single()
      if (profileError || !profile?.restaurant_id) {
        console.error("PROFILE ERROR:", profileError)
        alert("Restaurant profile not found.")
        return
      }
      setRestaurantId(profile.restaurant_id)
      await fetchAll(profile.restaurant_id)
    } catch (error) {
      console.error("INIT ERROR:", error)
      alert("Unable to load restaurant.")
    }
  }

  /* =========================================================
     LOAD ALL POS DATA
     ========================================================= */

  async function fetchAll(rid) {
    if (!rid) return

    const { data: hubRow } = await supabaseCloud
      .from("restaurant_plugins").select("enabled").eq("restaurant_id", rid)
      .eq("plugin_code", "operations-hub").maybeSingle()
    const hubOn = hubRow?.enabled === true
    setOperationsHubEnabled(hubOn)

    const emptyModifierResult = { data: [], error: null }
    const [menuResult,variantResult,tablesResult,roomsResult,groupsResult,modifiersResult,linksResult,zonesResult] = await Promise.all([
      supabaseCloud.from("menu_items").select("*").eq("restaurant_id", rid),
      supabaseCloud.from("menu_variants").select("id,menu_item_id,name,price_delta,active").eq("restaurant_id", rid).eq("active", true).order("created_at"),
      supabaseCloud.from("tables").select("*").eq("restaurant_id", rid),
      supabaseCloud.from("rooms").select("*").eq("restaurant_id", rid),
      hubOn ? supabaseCloud.from("modifier_groups").select("*").eq("restaurant_id", rid).eq("active", true).order("created_at") : Promise.resolve(emptyModifierResult),
      hubOn ? supabaseCloud.from("modifiers").select("*").eq("restaurant_id", rid).eq("active", true).order("created_at") : Promise.resolve(emptyModifierResult),
      hubOn ? supabaseCloud.from("menu_item_modifier_groups").select("menu_item_id,modifier_group_id").eq("restaurant_id", rid) : Promise.resolve(emptyModifierResult),
      supabaseCloud.from("delivery_zones").select("*").eq("restaurant_id", rid).eq("active", true).order("name"),
    ])
    if (menuResult.error) console.error("MENU ERROR:", menuResult.error)
    if (tablesResult.error) console.error("TABLE ERROR:", tablesResult.error)
    if (roomsResult.error) console.error("ROOM ERROR:", roomsResult.error)
    if (groupsResult.error) console.error("MODIFIER GROUP ERROR:", groupsResult.error)
    if (modifiersResult.error) console.error("MODIFIER ERROR:", modifiersResult.error)
    if (linksResult.error) console.error("MODIFIER LINK ERROR:", linksResult.error)
    if (zonesResult.error) console.error("DELIVERY ZONE ERROR:", zonesResult.error)
    const variantMap = {}
    ;(variantResult.data || []).forEach(v => { if (!variantMap[v.menu_item_id]) variantMap[v.menu_item_id] = []; variantMap[v.menu_item_id].push(v) })
    setMenu((menuResult.data || []).map(item => ({ ...item, variants: variantMap[item.id] || [] })))
    setTables(tablesResult.data || [])
    setRooms(roomsResult.data || [])
    setModifierGroups(groupsResult.data || [])
    setModifiers(modifiersResult.data || [])
    setModifierLinks(linksResult.data || [])
    setDeliveryZones(zonesResult.data || [])
  }

  /* =========================================================
     QR AUTO SELECT
     ========================================================= */

  function autoQR() {
    if (
      typeParam &&
      idParam &&
      (typeParam === "table" || typeParam === "room")
    ) {
      setType(typeParam)

      const list =
        typeParam === "table"
          ? tables
          : rooms

      const found = list.find((item) =>
        typeParam === "table"
          ? String(item.table_number) === String(idParam) ||
            String(item.id) === String(idParam)
          : String(item.room_number) === String(idParam) ||
            String(item.id) === String(idParam)
      )

      if (found) {
        setSelected(found)
      }

      return
    }

    const qrType = params.get("type")
    const qrId = params.get("id")

    if (!qrType || !qrId) return

    if (qrType !== "table" && qrType !== "room") {
      return
    }

    setType(qrType)

    const list =
      qrType === "table"
        ? tables
        : rooms

    const found = list.find((item) =>
      qrType === "table"
        ? String(item.table_number) === String(qrId) ||
          String(item.id) === String(qrId)
        : String(item.room_number) === String(qrId) ||
          String(item.id) === String(qrId)
    )

    if (found) {
      setSelected(found)
    }
  }

  /* =========================================================
     MODIFIERS
     ========================================================= */

  function itemGroups(item) {
    if (!operationsHubEnabled || !item) return []

    const ids = modifierLinks
      .filter(
        (link) =>
          String(link.menu_item_id) ===
          String(item.id)
      )
      .map(
        (link) => link.modifier_group_id
      )

    return modifierGroups.filter((group) =>
      ids.includes(group.id)
    )
  }

  function addToCart(item) {
    if (!item) return
    const variants = Array.isArray(item.variants) ? item.variants.filter(v => v.active !== false) : []
    if (item.item_type !== "combo" && variants.length) {
      const initial = {}
      variants.forEach(v => { initial[v.id] = 0 })
      setVariantItem(item)
      setVariantSelection(null)
      setVariantQuantities(initial)
      return
    }
    addToCartWithConfig(item)
  }

  function setVariantQty(variantId, change) {
    setVariantQuantities(previous => ({
      ...previous,
      [variantId]: Math.max(0, Number(previous[variantId] || 0) + change)
    }))
  }

  function closeVariantPicker() {
    setVariantItem(null)
    setVariantSelection(null)
    setVariantQuantities({})
    setVariantBatch([])
  }

  function continueVariant() {
    if (!variantItem) return
    const selected = (variantItem.variants || []).filter(v => v.active !== false).map(v => ({
      ...variantItem,
      price: Number(variantItem.price || 0) + Number(v.price_delta || 0),
      variant_id: v.id,
      variant_name: v.name,
      variantQty: Number(variantQuantities[v.id] || 0)
    })).filter(item => item.variantQty > 0)
    if (!selected.length) { alert("Please select at least one variant quantity"); return }
    setVariantItem(null)
    setVariantSelection(null)
    setVariantQuantities({})
    processVariantBatch(selected)
  }

  function processVariantBatch(queue) {
    const remaining = Array.isArray(queue) ? queue.slice() : []
    while (remaining.length) {
      const current = remaining.shift()
      const groups = itemGroups(current)
      if (groups.length) {
        setVariantBatch(remaining)
        setModifierItem(current)
        setModifierItemQty(current.variantQty || 1)
        const initial = {}
        groups.forEach(group => { initial[group.id] = [] })
        setModifierSelection(initial)
        return
      }
      addConfiguredItem(current, [], current.variantQty || 1)
    }
    setVariantBatch([])
  }

  function addToCartWithConfig(item) {
    const groups = itemGroups(item)

    if (groups.length) {
      setModifierItem(item)

      const initial = {}

      groups.forEach((group) => {
        initial[group.id] = []
      })

      setModifierSelection(initial)
      return
    }

    addConfiguredItem(item, [])
  }

  function addConfiguredItem(
    item,
    selectedModifiers,
    quantity = 1
  ) {
    const modifierTotal =
      selectedModifiers.reduce(
        (sum, modifier) =>
          sum +
          Number(modifier.price || 0) *
            Number(modifier.quantity || 1),
        0
      )

    const modifierKey =
      selectedModifiers
        .map((modifier) => modifier.id)
        .sort()
        .join(",")

    const key =
      `${item.id}:${item.variant_id || "base"}:${modifierKey || "base"}`

    setCart((previous) => {
      const existing = previous.find(
        (cartItem) =>
          cartItem.cartKey === key
      )

      if (existing) {
        return previous.map((cartItem) =>
          cartItem.cartKey === key
            ? {
                ...cartItem,
                qty:
                  Number(
                    cartItem.qty || 0
                  ) + Number(quantity || 1),
              }
            : cartItem
        )
      }

      return [
        ...previous,
        {
          ...item,
          qty: Number(quantity || 1),
          cartKey: key,
          selectedModifiers,
          modifierTotal,
        },
      ]
    })
  }

  function confirmModifiers() {
    if (!modifierItem) return
    const groups = itemGroups(modifierItem)
    for (const group of groups) {
      const chosen = modifierSelection[group.id] || []
      const minSelect = Math.max(Number(group.min_select || 0), group.required ? 1 : 0)
      const maxSelect = group.max_select == null ? null : Number(group.max_select)
      if (chosen.length < minSelect) { alert(`Please choose at least ${minSelect} option${minSelect === 1 ? "" : "s"} from ${group.name}`); return }
      if (maxSelect !== null && chosen.length > maxSelect) { alert(`Please choose no more than ${maxSelect} option${maxSelect === 1 ? "" : "s"} from ${group.name}`); return }
    }
    const chosen = Object.values(modifierSelection).flat()
    addConfiguredItem(modifierItem, chosen, modifierItemQty)
    const remaining = variantBatch.slice()
    setModifierItem(null)
    setModifierSelection({})
    setModifierItemQty(1)
    setVariantBatch([])
    if (remaining.length) processVariantBatch(remaining)
  }

  function toggleModifier(
    group,
    modifier
  ) {
    setModifierSelection(
      (previous) => {
        const current =
          previous[group.id] || []

        if (
          group.selection_type ===
          "single"
        ) {
          return {
            ...previous,
            [group.id]: [modifier],
          }
        }

        const exists =
          current.some(
            (item) =>
              item.id === modifier.id
          )

        const maxSelect = group.max_select == null
          ? null
          : Number(group.max_select)

        if (!exists && maxSelect !== null && current.length >= maxSelect) {
          alert(`Maximum ${maxSelect} option${maxSelect === 1 ? "" : "s"} allowed in ${group.name}`)
          return previous
        }

        return {
          ...previous,
          [group.id]: exists
            ? current.filter(
                (item) =>
                  item.id !==
                  modifier.id
              )
            : [
                ...current,
                modifier,
              ],
        }
      }
    )
  }

  /* =========================================================
     CART
     ========================================================= */

  function updateQty(
    cartKey,
    change
  ) {
    setCart((previous) =>
      previous.flatMap((item) => {
        if (
          item.cartKey !== cartKey
        ) {
          return [item]
        }

        const qty =
          Number(item.qty || 0) +
          change

        if (qty <= 0) {
          return []
        }

        return [
          {
            ...item,
            qty,
          },
        ]
      })
    )
  }

  function removeItem(cartKey) {
    setCart((previous) =>
      previous.filter(
        (item) =>
          item.cartKey !== cartKey
      )
    )
  }

  /* =========================================================
     COMBO
     ========================================================= */

  function comboDisplayName(item) {
    if (
      item?.item_type !== "combo"
    ) {
      return item?.name || "Item"
    }

    const config =
      item?.combo_config || {}

    const ids =
      config.mode === "fixed"
        ? (config.items || []).map(
            (comboItem) =>
              comboItem.item_id
          )
        : []

    const names = ids
      .map(
        (id) =>
          menu.find(
            (menuItem) =>
              menuItem.id === id
          )?.name
      )
      .filter(Boolean)

    return names.length
      ? `${item.name} [${names.join(
          ", "
        )}]`
      : item.name
  }

  /* =========================================================
     ORDER TYPE
     ========================================================= */

  function changeOrderType(
    nextType
  ) {
    setType(nextType)
    setSelected(null)
    setOpenSelect(false)

    if (
      nextType !== "delivery"
    ) {
      setDeliveryCharge(0)
      setDeliveryZone("")
    }

    if (
      nextType === "takeaway"
    ) {
      setCustomerNotes("")
    }
  }

  function applyZone(zone) {
    setDeliveryZone(
      zone?.name || ""
    )

    setDeliveryCharge(
      Number(zone?.charge || 0)
    )
  }

  /* =========================================================
     PLACE ORDER
     ========================================================= */

  async function placeOrder() {
    if (placingOrder) return

    if (!restaurantId) {
      alert("Restaurant missing")
      return
    }

    if (!cart.length) {
      alert("Cart empty")
      return
    }

    if (
      (type === "table" ||
        type === "room") &&
      !selected
    ) {
      alert("Select table/room")
      return
    }

    if (type === "delivery") {
      if (!customerName.trim()) {
        alert(
          "Customer name is required"
        )
        return
      }

      if (!customerPhone.trim()) {
        alert(
          "Customer phone is required"
        )
        return
      }

      if (!deliveryAddress.trim()) {
        alert(
          "Delivery address is required"
        )
        return
      }
    }

    try {
      setPlacingOrder(true)

      const foodTotal =
        cart.reduce(
          (sum, item) =>
            sum +
            (
              Number(
                item.price || 0
              ) +
              Number(
                item.modifierTotal ||
                  0
              )
            ) *
              Number(
                item.qty || 0
              ),
          0
        )

      const orderTotal =
        foodTotal +
        (type === "delivery"
          ? Number(
              deliveryCharge || 0
            )
          : 0)

      const sourceLabel =
        type === "table"
          ? `Table ${selected.table_number}`
          : type === "room"
          ? `Room ${selected.room_number}`
          : type === "takeaway"
          ? "Takeaway"
          : `Delivery - ${customerName.trim()}`

      const { data: authData, error: authError } = await supabaseCloud.auth.getSession()
      const token = authData?.session?.access_token
      if (authError || !token) {
        alert("Login session expired. Please login again.")
        return
      }

      const response = await fetch("/api/pos/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          source_type: type,
          source_id: selected?.id || null,
          subtotal: foodTotal,
          discount_amount: 0,
          tax_amount: 0,
          delivery_charge: type === "delivery" ? Number(deliveryCharge || 0) : 0,
          total_amount: orderTotal,
          payment_method: type === "delivery" ? paymentMethod : null,
          customer_name: type === "delivery" ? customerName.trim() : null,
          customer_phone: type === "delivery" ? customerPhone.trim() : null,
          delivery_address: type === "delivery" ? deliveryAddress.trim() : null,
          customer_notes: type === "delivery" ? customerNotes.trim() : null,
          marketing_campaign_id: params.get("utm_campaign") || params.get("campaign_id") || null,
          marketing_source: params.get("utm_source") || null,
          marketing_medium: params.get("utm_medium") || null,
          marketing_content: params.get("utm_content") || null,
          marketing_campaign: params.get("utm_campaign") || null,
          items: cart.map(cartItem => ({
            item_id: cartItem.id, quantity: Number(cartItem.qty || 0),
            item_name: comboDisplayName(cartItem), name: comboDisplayName(cartItem),
            variant_id: cartItem.variant_id || null,
            variant_name: cartItem.variant_name || null,
            unit_price: Number(cartItem.price || 0),
            line_total: (Number(cartItem.price || 0) + Number(cartItem.modifierTotal || 0)) * Number(cartItem.qty || 0),
            cooking_request: cartItem.cooking_request || null,
            selected_modifiers: Array.isArray(cartItem.selectedModifiers) ? cartItem.selectedModifiers : []
          }))
        })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success || !result.order) {
        console.error("ORDER ERROR:", result)
        alert(result.error || "Order could not be created.")
        return
      }
      const order = result.order


      // Every POS source (table, room, takeaway and delivery) gets the same
      // KOT/order-slip runtime. Delivery still continues into the Kitchen flow.
      try {
        await fetch("/api/printing/order-slip", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ order_id: order.id }),
        })
      } catch (printError) {
        console.warn("ORDER SLIP PRINT:", printError)
      }

      /* =====================================================
         DELIVERY SLIP
         ===================================================== */

      if (type === "delivery") {
        try {
          const deliveryResponse = await fetch("/api/delivery", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              action: "create", order_id: order.id, order_mode: "delivery",
              customer_name: customerName.trim(), phone: customerPhone.trim(),
              address: deliveryAddress.trim(), zone: deliveryZone || null,
              delivery_charge: Number(deliveryCharge || 0), payment_method: paymentMethod,
              customer_notes: customerNotes.trim()
            })
          })
          const deliveryResult = await deliveryResponse.json().catch(() => ({}))
          if (!deliveryResponse.ok || !deliveryResult.success) {
            console.error("DELIVERY CREATE ERROR:", deliveryResult)
            alert(`Order created, but delivery slip could not be saved: ${deliveryResult.error || "Unknown error"}`)
            return
          }
          alert(`Delivery order created. Slip ${deliveryResult.delivery?.slip_no || "generated"}`)
          window.location.href = `/kitchen?order_id=${encodeURIComponent(order.id)}&next=delivery`
          return
        } catch (deliveryError) {
          console.error("DELIVERY CREATE ERROR:", deliveryError)
          alert(`Order created, but delivery slip could not be saved: ${deliveryError.message || "Unknown error"}`)
          return
        }
      }

      // Takeaway/table/room must be prepared in Kitchen before Billing.
      // Delivery flow below is intentionally unchanged.
      window.location.href =
        `/kitchen?order_id=${encodeURIComponent(order.id)}&next=billing`
      return

      /* =====================================================
         RESET
         ===================================================== */

      setCart([])
      setSelected(null)

      setCustomerName("")
      setCustomerPhone("")
      setDeliveryAddress("")
      setDeliveryZone("")
      setDeliveryCharge(0)
      setCustomerNotes("")
    } catch (error) {
      console.error(
        "PLACE ORDER ERROR:",
        error
      )

      alert(
        error?.message ||
          "Something went wrong while placing the order."
      )
    } finally {
      setPlacingOrder(false)
    }
  }

  /* =========================================================
     MENU GROUPING
     ========================================================= */

  const groupedMenu =
    menu.reduce(
      (accumulator, item) => {
        const category =
          String(
            item.category ||
              "Other"
          ).trim() ||
          "Other"

        if (
          !accumulator[category]
        ) {
          accumulator[category] =
            []
        }

        accumulator[
          category
        ].push(item)

        return accumulator
      },
      {}
    )

  const categories =
    Object.keys(
      groupedMenu
    )

  useEffect(() => {
    if (
      categories.length &&
      activeCategory !==
        "All" &&
      !categories.includes(
        activeCategory
      )
    ) {
      setActiveCategory(
        categories[0]
      )
    }
  }, [
    menu.length,
    activeCategory,
    categories.length,
  ])

  const visibleItems =
    activeCategory === "All"
      ? menu
      : groupedMenu[
          activeCategory
        ] || []

  const cartCount =
    cart.reduce(
      (total, item) =>
        total +
        Number(
          item.qty || 0
        ),
      0
    )

  const cartTotal =
    cart.reduce(
      (total, item) =>
        total +
        (
          Number(
            item.price || 0
          ) +
          Number(
            item.modifierTotal ||
              0
          )
        ) *
          Number(
            item.qty || 0
          ),
      0
    )

  /* =========================================================
     UI
     ========================================================= */

  return (
    <div className="order-page">

      {/* =====================================================
          HEADER
          ===================================================== */}

      <div className="order-page-header">
        <div>
          <h1>
            {restaurantName}
          </h1>

          <div className="order-page-subtitle">
            Premium Dining Experience
          </div>
        </div>
      </div>

      {/* =====================================================
          LEFT - ORDER TYPE
          ===================================================== */}

      <div className="order-type-panel">
        <h3>
          🔘 Select
        </h3>

        <div className="order-type-grid">

          <button
            type="button"
            className={
              type === "table"
                ? "order-type-btn active-info"
                : "order-type-btn"
            }
            onClick={() =>
              changeOrderType(
                "table"
              )
            }
          >
            🍽️ Dine-in
          </button>

          <button
            type="button"
            className={
              type === "takeaway"
                ? "order-type-btn active-warning"
                : "order-type-btn"
            }
            onClick={() =>
              changeOrderType(
                "takeaway"
              )
            }
          >
            🥡 Takeaway
          </button>

          <button
            type="button"
            className={
              type === "delivery"
                ? "order-type-btn active-success"
                : "order-type-btn"
            }
            onClick={() =>
              changeOrderType(
                "delivery"
              )
            }
          >
            🛵 Delivery
          </button>

          <button
            type="button"
            className={
              type === "room"
                ? "order-type-btn active-purple"
                : "order-type-btn"
            }
            onClick={() =>
              changeOrderType(
                "room"
              )
            }
          >
            🛏️ Room
          </button>
        </div>

        {/* ===================================================
            TABLE / ROOM
            =================================================== */}

        {(type === "table" ||
          type === "room") && (
          <>
            <button
              type="button"
              className="select-table-btn"
              onClick={() =>
                setOpenSelect(
                  !openSelect
                )
              }
            >
              {selected
                ? type === "table"
                  ? `🍽️ Table ${selected.table_number}`
                  : `🛏️ Room ${selected.room_number}`
                : "Select Table / Room"}
            </button>

            {openSelect && (
              <div className="selection-dropdown">
                {(type === "table"
                  ? tables
                  : rooms
                ).map(
                  (item) => (
                    <button
                      type="button"
                      className="selection-dropdown-item"
                      key={
                        item.id
                      }
                      onClick={() => {
                        setSelected(
                          item
                        )
                        setOpenSelect(
                          false
                        )
                      }}
                    >
                      {type ===
                      "table"
                        ? `🍽️ Table ${item.table_number}`
                        : `🛏️ Room ${item.room_number}`}
                    </button>
                  )
                )}
              </div>
            )}
          </>
        )}

        {/* ===================================================
            TAKEAWAY
            =================================================== */}

        {type ===
          "takeaway" && (
          <div className="mode-info-box">
            🥡 Quick takeaway —
            no table required.
            Print the bill/KOT
            after placing the
            order.
          </div>
        )}

        {/* ===================================================
            DELIVERY
            =================================================== */}

        {type ===
          "delivery" && (
          <div className="delivery-fields">

            <input
              value={
                customerName
              }
              onChange={(
                event
              ) =>
                setCustomerName(
                  event.target
                    .value
                )
              }
              placeholder="Customer name *"
              className="field-input"
            />

            <input
              value={
                customerPhone
              }
              onChange={(
                event
              ) =>
                setCustomerPhone(
                  event.target
                    .value
                )
              }
              placeholder="Phone number *"
              inputMode="tel"
              className="field-input"
            />

            <textarea
              value={
                deliveryAddress
              }
              onChange={(
                event
              ) =>
                setDeliveryAddress(
                  event.target
                    .value
                )
              }
              placeholder="Delivery address *"
              rows={3}
              className="field-input textarea-input"
            />

            <select
              value={
                deliveryZone
              }
              onChange={(
                event
              ) =>
                applyZone(
                  deliveryZones.find(
                    (
                      zone
                    ) =>
                      zone.name ===
                      event.target
                        .value
                  )
                )
              }
              className="field-input"
            >
              <option value="">
                Select delivery
                zone
              </option>

              {deliveryZones.map(
                (zone) => (
                  <option
                    key={
                      zone.id
                    }
                    value={
                      zone.name
                    }
                  >
                    {zone.name} — ₹
                    {Number(
                      zone.charge ||
                        0
                    ).toLocaleString(
                      "en-IN"
                    )}
                  </option>
                )
              )}
            </select>

            <select
              value={
                paymentMethod
              }
              onChange={(
                event
              ) =>
                setPaymentMethod(
                  event.target
                    .value
                )
              }
              className="field-input"
            >
              <option value="cash">
                COD — Cash
              </option>

              <option value="upi">
                UPI
              </option>

              <option value="card">
                Card
              </option>

              <option value="online">
                Online
              </option>
            </select>

            <textarea
              value={
                customerNotes
              }
              onChange={(
                event
              ) =>
                setCustomerNotes(
                  event.target
                    .value
                )
              }
              placeholder="Delivery note (optional)"
              rows={2}
              className="field-input textarea-input"
            />

            <div className="delivery-charge-box">
              <span>
                Delivery charge
              </span>

              <strong>
                ₹
                {Number(
                  deliveryCharge ||
                    0
                ).toLocaleString(
                  "en-IN"
                )}
              </strong>
            </div>

          </div>
        )}
      </div>

      {/* =====================================================
          CENTER - MENU
          ===================================================== */}

      <div className="menu-panel">

        <div className="category-header">
          <div>
            <div className="category-eyebrow">
              MENU
            </div>

            <h2>
              Choose your food
            </h2>
          </div>

          <span className="category-count">
            {visibleItems.length}{" "}
            items
          </span>
        </div>

        {/* ===================================================
            CATEGORIES
            =================================================== */}

        <div className="category-tabs">

          <button
            type="button"
            className={
              activeCategory ===
              "All"
                ? "category-tab active"
                : "category-tab"
            }
            onClick={() =>
              setActiveCategory(
                "All"
              )
            }
          >
            All

            <span className="category-tab-count">
              {menu.length}
            </span>
          </button>

          {categories.map(
            (category) => (
              <button
                type="button"
                key={
                  category
                }
                className={
                  activeCategory ===
                  category
                    ? "category-tab active"
                    : "category-tab"
                }
                onClick={() =>
                  setActiveCategory(
                    category
                  )
                }
              >
                {category}

                <span className="category-tab-count">
                  {
                    groupedMenu[
                      category
                    ].length
                  }
                </span>
              </button>
            )
          )}

        </div>

        <div className="category-title">
          <span>
            {activeCategory ===
            "All"
              ? "All Items"
              : activeCategory}
          </span>

          <small>
            Tap to add
          </small>
        </div>

        {/* ===================================================
            COMPACT PREMIUM PRODUCT GRID
            =================================================== */}

        <div className="order-food-grid">

          {visibleItems.map(
            (item) => (
              <button
                type="button"
                className="order-menu-card"
                key={item.id}
                onClick={() =>
                  addToCart(
                    item
                  )
                }
              >

                <div className="order-menu-image-wrap">
                  {item.image ? (
                    <img
                      src={
                        item.image
                      }
                      alt={
                        item.name
                      }
                      className="order-menu-image"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="order-menu-image-fallback"
                      aria-hidden="true"
                    >
                      🍽️
                    </div>
                  )}
                </div>

                <div className="order-menu-card-content">

                  <span className="order-item-name">
                    {item.name}
                  </span>

                  <span className="order-item-price">
                    ₹
                    {Number(
                      item.price ||
                        0
                    ).toLocaleString(
                      "en-IN"
                    )}
                  </span>

                </div>
              </button>
            )
          )}

        </div>

        {!visibleItems.length && (
          <div className="empty-menu">
            No items in this
            category.
          </div>
        )}

      </div>

      {/* =====================================================
          RIGHT - CART
          ===================================================== */}

      <div className="cart-panel">

        <div className="cart-header">

          <div>
            <div className="cart-eyebrow">
              YOUR ORDER
            </div>

            <h2>
              Cart
            </h2>
          </div>

          <span className="cart-badge">
            {cartCount} items
          </span>

        </div>

        {cart.length ===
        0 ? (
          <div className="empty-cart">

            <div className="empty-cart-icon">
              🛒
            </div>

            <strong>
              Your cart is
              empty
            </strong>

            <span>
              Add food items
              from the menu.
            </span>

          </div>
        ) : (
          <>

            <div className="cart-list">

              {cart.map(
                (item) => {
                  const unitTotal =
                    Number(
                      item.price ||
                        0
                    ) +
                    Number(
                      item.modifierTotal ||
                        0
                    )

                  return (
                    <div
                      className="cart-item"
                      key={
                        item.cartKey
                      }
                    >

                      <div className="cart-item-main">

                        <div className="cart-item-name">
                          {
                            item.name
                          }
                        </div>

                        {item
                          .selectedModifiers
                          ?.length >
                          0 && (
                          <div className="cart-modifiers">
                            +{" "}
                            {item.selectedModifiers
                              .map(
                                (
                                  modifier
                                ) =>
                                  modifier.name
                              )
                              .join(
                                ", "
                              )}
                          </div>
                        )}

                        <div className="cart-item-price">
                          ₹
                          {unitTotal.toLocaleString(
                            "en-IN"
                          )}{" "}
                          each
                        </div>

                      </div>

                      <div className="cart-item-actions">

                        <button
                          type="button"
                          onClick={() =>
                            updateQty(
                              item.cartKey,
                              -1
                            )
                          }
                          className="qty-btn"
                          aria-label={`Decrease ${item.name}`}
                        >
                          −
                        </button>

                        <span className="qty-value">
                          {
                            item.qty
                          }
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            updateQty(
                              item.cartKey,
                              1
                            )
                          }
                          className="qty-btn"
                          aria-label={`Increase ${item.name}`}
                        >
                          +
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            removeItem(
                              item.cartKey
                            )
                          }
                          className="remove-btn"
                          aria-label={`Remove ${item.name}`}
                        >
                          ×
                        </button>

                      </div>

                    </div>
                  )
                }
              )}

            </div>

            <div className="cart-summary">

              <div className="summary-row">
                <span>
                  Items
                </span>

                <strong>
                  {cartCount}
                </strong>
              </div>

              <div className="summary-total">

                <span>
                  Total
                </span>

                <strong>
                  ₹
                  {cartTotal.toLocaleString(
                    "en-IN"
                  )}
                </strong>

              </div>

            </div>

            <button
              type="button"
              className="place-order-btn"
              onClick={
                placeOrder
              }
              disabled={
                placingOrder
              }
            >
              {placingOrder
                ? "⏳ Placing..."
                : "🚀 Place Order"}
            </button>

          </>
        )}

      </div>

      {variantItem && (
        <div className="modal-backdrop" onClick={closeVariantPicker}>
          <div className="modifier-modal" onClick={e => e.stopPropagation()}>
            <div className="modifier-modal-header">
              <div><div className="modal-eyebrow">SELECT VARIANT</div><h2>{variantItem.name}</h2><p>Choose the size or variant before adding this item.</p></div>
              <button type="button" className="close-btn" onClick={closeVariantPicker}>✕</button>
            </div>
            <div className="modifier-options">
              {(variantItem.variants || []).map(v => {
                const qty = Number(variantQuantities[v.id] || 0)
                const unitPrice = Number(variantItem.price || 0) + Number(v.price_delta || 0)
                return (
                  <div key={v.id} className={qty > 0 ? "modifier-choice active variant-qty-row" : "modifier-choice variant-qty-row"}>
                    <span><strong>{v.name}</strong><small style={{display:"block",opacity:.72}}>₹{unitPrice.toFixed(2)} each</small></span>
                    <span className="variant-qty-controls">
                      <button type="button" className="qty-btn" onClick={() => setVariantQty(v.id,-1)}>−</button>
                      <strong className="qty-value">{qty}</strong>
                      <button type="button" className="qty-btn" onClick={() => setVariantQty(v.id,1)}>+</button>
                    </span>
                  </div>
                )
              })}
            </div>
            <button type="button" className="place-order-btn modal-add-btn" onClick={continueVariant} disabled={!Object.values(variantQuantities).some(q => Number(q) > 0)}>Continue</button>
          </div>
        </div>
      )}

      {/* =====================================================
          MODIFIER MODAL
          ===================================================== */}

      {modifierItem && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setModifierItem(null)
            setModifierSelection({})
            setModifierItemQty(1)
            setVariantBatch([])
          }}
        >

          <div
            className="modifier-modal"
            onClick={(
              event
            ) =>
              event.stopPropagation()
            }
          >

            <div className="modifier-modal-header">

              <div>

                <div className="modal-eyebrow">
                  CUSTOMIZE ITEM
                </div>

                <h2>
                  {
                    modifierItem.name
                  }
                </h2>

                <p>
                  Choose your options
                  before adding to
                  the order.
                </p>

              </div>

              <button
                type="button"
                className="close-btn"
                onClick={() =>
                  setModifierItem(
                    null
                  )
                }
              >
                ✕
              </button>

            </div>

            <div className="modifier-groups">

              {itemGroups(
                modifierItem
              ).map(
                (group) => (
                  <div
                    key={
                      group.id
                    }
                    className="modifier-group-box"
                  >

                    <div className="modifier-group-title">

                      <b>
                        {
                          group.name
                        }
                      </b>

                      <small>
                        {group.required
                          ? "Required"
                          : "Optional"}
                      </small>

                    </div>

                    <div className="modifier-options">

                      {modifiers
                        .filter(
                          (
                            modifier
                          ) =>
                            modifier.group_id ===
                            group.id
                        )
                        .map(
                          (
                            modifier
                          ) => {

                            const chosen =
                              (
                                modifierSelection[
                                  group.id
                                ] || []
                              ).some(
                                (
                                  selectedModifier
                                ) =>
                                  selectedModifier.id ===
                                  modifier.id
                              )

                            return (
                              <button
                                type="button"
                                key={
                                  modifier.id
                                }
                                onClick={() =>
                                  toggleModifier(
                                    group,
                                    modifier
                                  )
                                }
                                className={
                                  chosen
                                    ? "modifier-choice active"
                                    : "modifier-choice"
                                }
                              >

                                <span>
                                  {chosen
                                    ? "✓"
                                    : "○"}{" "}
                                  {
                                    modifier.name
                                  }
                                </span>

                                <strong>
                                  +₹
                                  {Number(
                                    modifier.price ||
                                      0
                                  ).toLocaleString(
                                    "en-IN"
                                  )}
                                </strong>

                              </button>
                            )
                          }
                        )}

                    </div>
                  </div>
                )
              )}

            </div>

            <button
              type="button"
              className="place-order-btn modal-add-btn"
              onClick={
                confirmModifiers
              }
            >
              Add to Order
            </button>

          </div>
        </div>
      )}

      <style jsx global>{`
        .variant-qty-row { cursor: default; }
        .variant-qty-controls { display:flex; align-items:center; gap:10px; flex-shrink:0; }
        .variant-qty-controls .qty-btn { width:32px; height:32px; }
        .variant-qty-controls .qty-value { min-width:22px; text-align:center; }
      `}</style>

      {/* =====================================================
          PAGE CSS
          ===================================================== */}

      <style jsx global>{`

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
        }

        button,
        input,
        textarea,
        select {
          font-family: inherit;
        }

        /* ==================================================
           MAIN PAGE
           ================================================== */

        .order-page {
          min-height: 100vh;

          display: grid;

          grid-template-columns:
            285px
            minmax(0, 1fr)
            290px;

          grid-template-rows:
            auto
            1fr;

          align-items: start;

          gap: 10px;

          padding: 10px;

          background:
            linear-gradient(
              135deg,
              var(--background),
              var(--surface-2),
              var(--background)
            );

          color: var(--text);
        }

        /* ==================================================
           HEADER
           ================================================== */

        .order-page-header {
          grid-column: 1 / -1;

          margin-bottom: 1px;

          padding:
            2px
            2px
            0;
        }

        .order-page-header h1 {
          margin: 0;

          font-size: 28px;

          line-height: 1.1;

          font-weight: 800;

          color:
            var(--primary);
        }

        .order-page-subtitle {
          margin-top: 4px;

          color:
            var(--muted);

          font-size: 12px;
        }

        /* ==================================================
           PANELS
           ================================================== */

        .order-type-panel,
        .menu-panel,
        .cart-panel {
          background:
            rgba(
              var(--surface-2-rgb),
              .88
            );

          border:
            1px solid
            rgba(
              var(--primary-rgb),
              .14
            );

          backdrop-filter:
            blur(20px);

          -webkit-backdrop-filter:
            blur(20px);

          border-radius:
            18px;

          box-shadow:
            0 18px 48px
            rgba(0,0,0,.34);
        }

        .order-type-panel,
        .cart-panel {
          position: sticky;

          top: 10px;

          height: fit-content;

          padding: 18px;
        }

        .menu-panel {
          min-width: 0;

          padding: 13px;
        }

        /* ==================================================
           ORDER TYPES
           ================================================== */

        .order-type-panel h3 {
          margin:
            0
            0
            9px;

          font-size: 14px;
        }

        .order-type-grid {
          display: grid;

          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );

          gap: 6px;
        }

        .order-type-btn {
          min-width: 0;

          min-height:
            44px;

          padding:
            10px
            8px;

          border-radius:
            12px;

          border:
            1px solid
            rgba(
              255,
              255,
              255,
              .11
            );

          background:
            rgba(
              255,
              255,
              255,
              .035
            );

          color: var(--text);

          font-size: 10px;

          font-weight: 800;

          cursor: pointer;

          transition:
            .15s ease;
        }

        .order-type-btn:hover {
          background:
            rgba(
              255,
              255,
              255,
              .07
            );
        }

        .order-type-btn.active-info {
          border-color:
            #38bdf8;

          color:
            #38bdf8;

          box-shadow:
            0 0 11px
            rgba(
              56,
              189,
              248,
              .17
            );
        }

        .order-type-btn.active-warning {
          border-color:
            var(--warning);

          color:
            var(--warning);

          box-shadow:
            0 0 11px
            rgba(
              245,
              158,
              11,
              .17
            );
        }

        .order-type-btn.active-success {
          border-color:
            var(--success);

          color:
            var(--success);

          box-shadow:
            0 0 11px
            rgba(
              34,
              197,
              94,
              .17
            );
        }

        .order-type-btn.active-purple {
          border-color:
            #a855f7;

          color:
            #a855f7;

          box-shadow:
            0 0 11px
            rgba(
              168,
              85,
              247,
              .17
            );
        }

        /* ==================================================
           TABLE SELECT
           ================================================== */

        .select-table-btn {
          width: 100%;

          margin-top: 13px;

          min-height:
            44px;

          padding:
            11px
            10px;

          border-radius:
            12px;

          border:
            1px solid
            rgba(
              255,
              255,
              255,
              .12
            );

          background:
            rgba(
              255,
              255,
              255,
              .04
            );

          color: var(--text);

          font-size: 10px;

          cursor: pointer;
        }

        .selection-dropdown {
          max-height:
            200px;

          overflow-y:
            auto;

          overflow-x:
            hidden;

          margin-top:
            7px;

          border:
            1px solid
            rgba(
              255,
              255,
              255,
              .09
            );

          border-radius:
            10px;

          background:
            rgba(
              5,
              15,
              12,
              .97
            );
        }

        .selection-dropdown-item {
          display:
            block;

          width:
            100%;

          padding:
            9px;

          border:
            0;

          border-bottom:
            1px solid
            rgba(
              255,
              255,
              255,
              .055
            );

          background:
            transparent;

          color:
            var(--text);

          text-align:
            left;

          cursor:
            pointer;

          font-size:
            12px;

          font-weight:
            700;
        }

        .selection-dropdown-item:hover {
          background:
            rgba(
              var(--primary-rgb),
              .08
            );
        }

        /* ==================================================
           TAKEAWAY
           ================================================== */

        .mode-info-box {
          margin-top:
            9px;

          padding:
            9px;

          border-radius:
            10px;

          background:
            rgba(
              245,
              158,
              11,
              .07
            );

          border:
            1px solid
            rgba(
              245,
              158,
              11,
              .18
            );

          color:
            #f7c66a;

          font-size:
            11px;

          line-height:
            1.5;
        }

        /* ==================================================
           DELIVERY
           ================================================== */

        .delivery-fields {
          display:
            grid;

          gap:
            6px;

          margin-top:
            9px;
        }

        .field-input {
          width:
            100%;

          min-width:
            0;

          padding:
            8px
            9px;

          border:
            1px solid
            rgba(
              255,
              255,
              255,
              .11
            );

          border-radius:
            9px;

          background:
            rgba(
              255,
              255,
              255,
              .035
            );

          color:
            var(--text);

          outline:
            none;

          font-size:
            12px;
        }

        .field-input::placeholder {
          color:
            rgba(
              255,
              255,
              255,
              .45
            );
        }

        .field-input:focus {
          border-color:
            rgba(
              var(--primary-rgb),
              .48
            );

          box-shadow:
            0 0 0 2px
            rgba(
              var(--primary-rgb),
              .06
            );
        }

        .textarea-input {
          resize:
            vertical;
        }

        .delivery-charge-box {
          display:
            flex;

          justify-content:
            space-between;

          align-items:
            center;

          padding:
            8px
            9px;

          border-radius:
            9px;

          background:
            rgba(
              34,
              197,
              94,
              .06
            );

          border:
            1px solid
            rgba(
              34,
              197,
              94,
              .17
            );

          color:
            var(--success);

          font-size:
            11px;
        }

        /* ==================================================
           MENU HEADER
           ================================================== */

        .category-header {
          display:
            flex;

          align-items:
            center;

          justify-content:
            space-between;

          gap:
            8px;

          margin-bottom:
            7px;
        }

        .category-eyebrow,
        .cart-eyebrow,
        .modal-eyebrow {
          color:
            var(--primary);

          font-size:
            8px;

          font-weight:
            900;

          letter-spacing:
            1.3px;
        }

        .category-header h2 {
          margin:
            3px
            0
            0;

          font-size:
            19px;

          line-height:
            1.1;
        }

        .category-count {
          color:
            var(--muted);

          font-size:
            9px;

          font-weight:
            800;

          white-space:
            nowrap;
        }

        /* ==================================================
           CATEGORY TABS
           ================================================== */

        .category-tabs {
          display:
            flex;

          align-items:
            center;

          gap:
            5px;

          width:
            100%;

          overflow-x:
            auto;

          padding:
            2px
            1px
            7px;

          margin-bottom:
            1px;

          scrollbar-width:
            thin;
        }

        .category-tab {
          flex:
            0 0 auto;

          display:
            inline-flex;

          align-items:
            center;

          gap:
            4px;

          padding:
            5px
            8px;

          border:
            1px solid
            rgba(
              var(--primary-rgb),
              .14
            );

          border-radius:
            999px;

          background:
            rgba(
              255,
              255,
              255,
              .03
            );

          color:
            var(--text);

          font-size:
            9px;

          font-weight:
            800;

          cursor:
            pointer;

          white-space:
            nowrap;
        }

        .category-tab.active {
          background:
            rgba(
              var(--primary-rgb),
              .11
            );

          border-color:
            rgba(
              var(--primary-rgb),
              .52
            );

          color:
            var(--primary);
        }

        .category-tab-count {
          min-width:
            15px;

          height:
            15px;

          display:
            inline-grid;

          place-items:
            center;

          border-radius:
            999px;

          background:
            rgba(
              255,
              255,
              255,
              .07
            );

          color:
            var(--muted);

          font-size:
            7px;
        }

        .category-tab.active
        .category-tab-count {
          background:
            var(--primary);

          color:
            #111;
        }

        .category-title {
          display:
            flex;

          align-items:
            baseline;

          justify-content:
            space-between;

          margin:
            3px
            0
            7px;

          color:
            var(--text);

          font-size:
            11px;

          font-weight:
            900;
        }

        .category-title small {
          color:
            var(--muted);

          font-size:
            8px;

          font-weight:
            600;
        }

        /* ==================================================
           PRODUCT GRID
           DESKTOP = 6
           ================================================== */

        .order-food-grid {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  align-items: stretch;
}

        /* ==================================================
           PRODUCT CARD
           ================================================== */

        .order-menu-card {
          appearance:
            none;

          -webkit-appearance:
            none;

          display:
            flex;

          flex-direction:
            column;

          width:
            100%;

          min-width:
            0;

          height:
            100%;

          margin:
            0;

          padding:
            4px;

          border:
            1px solid
            rgba(
              var(--primary-rgb),
              .13
            );

          border-radius:
            11px;

          background:
            linear-gradient(
              145deg,
              rgba(
                255,
                255,
                255,
                .055
              ),
              rgba(
                255,
                255,
                255,
                .018
              )
            );

          color:
            var(--text);

          text-align:
            left;

          cursor:
            pointer;

          overflow:
            hidden;

          box-shadow:
            0 6px 15px
            rgba(
              0,
              0,
              0,
              .17
            );

          transition:
            transform .15s ease,
            border-color .15s ease,
            background .15s ease,
            box-shadow .15s ease;
        }

        .order-menu-card:hover {
          transform:
            translateY(-2px);

          border-color:
            rgba(
              var(--primary-rgb),
              .44
            );

          background:
            linear-gradient(
              145deg,
              rgba(
                var(--primary-rgb),
                .085
              ),
              rgba(
                255,
                255,
                255,
                .025
              )
            );

          box-shadow:
            0 10px 22px
            rgba(
              0,
              0,
              0,
              .24
            );
        }

        .order-menu-card:active {
          transform:
            scale(.985);
        }

        /* ==================================================
           PRODUCT IMAGE
           ================================================== */

        .order-menu-image-wrap {
          position:
            relative;

          width:
            100%;

          aspect-ratio:
            1 / .70;

          min-height:
            0;

          overflow:
            hidden;

          border-radius:
            7px;

          background:
            rgba(
              255,
              255,
              255,
              .035
            );
        }

        .order-menu-image {
          display:
            block;

          width:
            100%;

          height:
            100%;

          object-fit:
            cover;

          transition:
            transform .2s ease;
        }

        .order-menu-card:hover
        .order-menu-image {
          transform:
            scale(1.035);
        }

        .order-menu-image-fallback {
          width:
            100%;

          height:
            100%;

          display:
            grid;

          place-items:
            center;

          background:
            linear-gradient(
              145deg,
              #183127,
              #10231c
            );

          font-size:
            19px;
        }

        /* ==================================================
           PRODUCT CONTENT
           ================================================== */

        .order-menu-card-content {
          min-width:
            0;

          display:
            flex;

          flex-direction:
            column;

          padding:
            5px
            2px
            2px;
        }

        .order-item-name {
          display:
            -webkit-box;

          -webkit-box-orient:
            vertical;

          -webkit-line-clamp:
            2;

          overflow:
            hidden;

          min-height:
            24px;

          color:
            #f7f2e8;

          font-size:
            9.5px;

          line-height:
            1.18;

          font-weight:
            800;

          white-space:
            normal;
        }

        .order-item-price {
          display:
            block;

          margin-top:
            3px;

          color:
            var(--primary);

          font-size:
            9.5px;

          line-height:
            1;

          font-weight:
            900;

          white-space:
            nowrap;
        }

        .empty-menu {
          padding:
            35px
            10px;

          color:
            var(--muted);

          text-align:
            center;

          font-size:
            12px;
        }

        /* ==================================================
           CART
           ================================================== */

        .cart-header {
          display:
            flex;

          align-items:
            center;

          justify-content:
            space-between;

          gap:
            7px;

          margin-bottom:
            9px;
        }

        .cart-header h2 {
          margin:
            3px
            0
            0;

          font-size:
            19px;
        }

        .cart-badge {
          padding:
            4px
            7px;

          border:
            1px solid
            rgba(
              var(--primary-rgb),
              .17
            );

          border-radius:
            999px;

          background:
            rgba(
              var(--primary-rgb),
              .07
            );

          color:
            var(--primary);

          font-size:
            8px;

          font-weight:
            800;

          white-space:
            nowrap;
        }

        .empty-cart {
          min-height:
            170px;

          display:
            grid;

          place-items:
            center;

          align-content:
            center;

          gap:
            5px;

          color:
            var(--muted);

          text-align:
            center;

          font-size:
            10px;
        }

        .empty-cart-icon {
          width:
            45px;

          height:
            45px;

          display:
            grid;

          place-items:
            center;

          margin-bottom:
            4px;

          border-radius:
            15px;

          background:
            rgba(
              255,
              255,
              255,
              .04
            );

          font-size:
            21px;
        }

        .cart-list {
          display:
            grid;

          gap:
            6px;

          max-height:
            340px;

          overflow-y:
            auto;

          padding-right:
            2px;
        }

        .cart-item {
          display:
            flex;

          align-items:
            center;

          justify-content:
            space-between;

          gap:
            6px;

          padding:
            7px;

          border:
            1px solid
            rgba(
              255,
              255,
              255,
              .06
            );

          border-radius:
            11px;

          background:
            rgba(
              255,
              255,
              255,
              .028
            );
        }

        .cart-item-main {
          min-width:
            0;

          flex:
            1;
        }

        .cart-item-name {
          overflow:
            hidden;

          text-overflow:
            ellipsis;

          white-space:
            nowrap;

          font-size:
            10px;

          font-weight:
            850;
        }

        .cart-modifiers {
          margin-top:
            2px;

          overflow:
            hidden;

          text-overflow:
            ellipsis;

          white-space:
            nowrap;

          color:
            var(--muted);

          font-size:
            8px;
        }

        .cart-item-price {
          margin-top:
            2px;

          color:
            var(--primary);

          font-size:
            8px;

          font-weight:
            800;
        }

        .cart-item-actions {
          flex:
            0 0 auto;

          display:
            flex;

          align-items:
            center;

          gap:
            3px;
        }

        .qty-btn {
          width:
            24px;

          height:
            24px;

          display:
            grid;

          place-items:
            center;

          padding:
            0;

          border:
            1px solid
            rgba(
              var(--primary-rgb),
              .20
            );

          border-radius:
            7px;

          background:
            rgba(
              var(--primary-rgb),
              .065
            );

          color:
            var(--text);

          font-size:
            14px;

          font-weight:
            800;

          cursor:
            pointer;
        }

        .qty-value {
          min-width:
            15px;

          color:
            var(--text);

          text-align:
            center;

          font-size:
            9px;

          font-weight:
            900;
        }

        .remove-btn {
          width:
            23px;

          height:
            23px;

          display:
            grid;

          place-items:
            center;

          margin-left:
            1px;

          padding:
            0;

          border:
            1px solid
            rgba(
              255,
              80,
              80,
              .18
            );

          border-radius:
            7px;

          background:
            rgba(
              255,
              80,
              80,
              .065
            );

          color:
            #ff8c8c;

          font-size:
            15px;

          line-height:
            1;

          cursor:
            pointer;
        }

        .cart-summary {
          margin-top:
            8px;

          padding:
            8px
            9px;

          border:
            1px solid
            rgba(
              var(--primary-rgb),
              .12
            );

          border-radius:
            11px;

          background:
            rgba(
              var(--primary-rgb),
              .05
            );
        }

        .summary-row {
          display:
            flex;

          justify-content:
            space-between;

          margin-bottom:
            5px;

          color:
            var(--muted);

          font-size:
            9px;
        }

        .summary-total {
          display:
            flex;

          justify-content:
            space-between;

          align-items:
            center;

          color:
            var(--text);

          font-size:
            12px;

          font-weight:
            900;
        }

        .place-order-btn {
          width:
            100%;

          margin-top:
            8px;

          padding:
            11px;

          border:
            1px solid
            rgba(
              var(--primary-rgb),
              .30
            );

          border-radius:
            12px;

          background:
            linear-gradient(
              135deg,
              var(--surface),
              var(--surface-2)
            );

          color:
            var(--text);

          font-size:
            12px;

          font-weight:
            800;

          cursor:
            pointer;

          box-shadow:
            0 12px 26px
            rgba(
              0,
              0,
              0,
              .25
            );
        }

        .place-order-btn:hover {
          border-color:
            rgba(
              var(--primary-rgb),
              .56
            );
        }

        .place-order-btn:disabled {
          opacity:
            .6;

          cursor:
            not-allowed;
        }

        /* ==================================================
           MODIFIER MODAL
           ================================================== */

        .modal-backdrop {
          position:
            fixed;

          inset:
            0;

          z-index:
            9999;

          display:
            grid;

          place-items:
            center;

          padding:
            15px;

          background:
            rgba(
              0,
              0,
              0,
              .68
            );

          backdrop-filter:
            blur(8px);

          -webkit-backdrop-filter:
            blur(8px);
        }

        .modifier-modal {
          width:
            min(
              100%,
              550px
            );

          max-height:
            90vh;

          overflow-y:
            auto;

          padding:
            19px;

          border:
            1px solid
            rgba(
              var(--primary-rgb),
              .21
            );

          border-radius:
            21px;

          background:
            linear-gradient(
              145deg,
              #0b2118,
              #102b20
            );

          color:
            var(--text);

          box-shadow:
            0 35px 100px
            rgba(
              0,
              0,
              0,
              .55
            );
        }

        .modifier-modal-header {
          display:
            flex;

          justify-content:
            space-between;

          align-items:
            flex-start;

          gap:
            11px;
        }

        .modifier-modal-header h2 {
          margin:
            4px
            0;

          font-size:
            19px;
        }

        .modifier-modal-header p {
          margin:
            0;

          color:
            var(--muted);

          font-size:
            10px;
        }

        .close-btn {
          width:
            33px;

          height:
            33px;

          flex:
            0 0 auto;

          border:
            1px solid
            rgba(
              255,
              255,
              255,
              .09
            );

          border-radius:
            9px;

          background:
            rgba(
              255,
              255,
              255,
              .035
            );

          color:
            var(--text);

          cursor:
            pointer;
        }

        .modifier-groups {
          display:
            grid;

          gap:
            11px;

          margin-top:
            15px;
        }

        .modifier-group-box {
          padding:
            11px;

          border:
            1px solid
            rgba(
              255,
              255,
              255,
              .065
            );

          border-radius:
            14px;

          background:
            rgba(
              255,
              255,
              255,
              .028
            );
        }

        .modifier-group-title {
          display:
            flex;

          justify-content:
            space-between;

          gap:
            8px;
        }

        .modifier-group-title small {
          color:
            var(--muted);

          font-size:
            8px;
        }

        .modifier-options {
          display:
            grid;

          gap:
            5px;

          margin-top:
            7px;
        }

        .modifier-choice {
          display:
            flex;

          justify-content:
            space-between;

          align-items:
            center;

          width:
            100%;

          padding:
            8px
            9px;

          border:
            1px solid
            rgba(
              255,
              255,
              255,
              .07
            );

          border-radius:
            9px;

          background:
            rgba(
              255,
              255,
              255,
              .022
            );

          color:
            var(--text);

          font-size:
            10px;

          cursor:
            pointer;

          text-align:
            left;
        }

        .modifier-choice.active {
          background:
            rgba(
              var(--primary-rgb),
              .10
            );

          border-color:
            rgba(
              var(--primary-rgb),
              .36
            );

          color:
            var(--primary);
        }

        .modifier-choice strong {
          white-space:
            nowrap;
        }

        .modal-add-btn {
          margin-top:
            14px;
        }

        /* ==================================================
           RESPONSIVE
           ================================================== */

        /*
          1250px and above:
          8 products per row.
        */

        @media (min-width: 1250px) {
          .order-food-grid {
            grid-template-columns:
              repeat(
                6,
                minmax(
                  0,
                  1fr
                )
              );
          }
        }

        /*
          1000px - 1249px:
          7 products per row.
        */

        @media
          (min-width: 1000px)
          and (max-width: 1249px) {

          .order-page {
            grid-template-columns:
              250px
              minmax(0, 1fr)
              370px;
          }

          .order-food-grid {
            grid-template-columns:
              repeat(
                6,
                minmax(
                  0,
                  1fr
                )
              );
          }
        }

        /*
          Tablet.
        */

        @media
          (min-width: 768px)
          and (max-width: 999px) {

          .order-page {
            grid-template-columns:
              185px
              minmax(0, 1fr);

            grid-template-rows:
              auto
              auto
              auto;

            padding:
              8px;
          }

          .order-page-header {
            grid-column:
              1 / -1;
          }

          .order-type-panel {
            position:
              static;

            grid-column:
              1;
          }

          .menu-panel {
            grid-column:
              2;

            grid-row:
              2 / span 2;
          }

          .cart-panel {
            position:
              static;

            grid-column:
              1;
          }

          .order-food-grid {
            grid-template-columns:
              repeat(
                4,
                minmax(
                  0,
                  1fr
                )
              );
          }
        }

        /*
          Mobile.
        */

        @media (max-width: 767px) {

          .order-page {
            display:
              block;

            padding:
              7px;
          }

          .order-page-header {
            margin-bottom:
              7px;
          }

          .order-page-header h1 {
            font-size:
              22px;
          }

          .order-page-subtitle {
            font-size:
              10px;
          }

          .order-type-panel,
          .menu-panel,
          .cart-panel {
            position:
              static;

            margin-bottom:
              7px;

            border-radius:
              16px;
          }

          .order-type-panel,
          .cart-panel {
            padding:
              11px;
          }

          .menu-panel {
            padding:
              11px;
          }

          .order-type-grid {
            grid-template-columns:
              repeat(
                4,
                minmax(
                  0,
                  1fr
                )
              );
          }

          .order-type-btn {
            min-height:
              44px;

            padding:
              9px
              5px;

            font-size:
              11px;
          }

          .delivery-fields {
            grid-template-columns:
              repeat(
                2,
                minmax(
                  0,
                  1fr
                )
              );
          }

          .delivery-fields
          .field-input:first-child,

          .delivery-fields
          textarea,

          .delivery-charge-box {
            grid-column:
              1 / -1;
          }

          .order-food-grid {
            grid-template-columns:
              repeat(
                3,
                minmax(
                  0,
                  1fr
                )
              );

            gap:
              6px;
          }

          .order-menu-card {
            padding:
              4px;

            border-radius:
              10px;
          }

          .order-menu-image-wrap {
            aspect-ratio:
              1 / .73;

            border-radius:
              7px;
          }

          .order-item-name {
            font-size:
              9px;

            min-height:
              23px;
          }

          .order-item-price {
            font-size:
              9px;
          }

          .cart-list {
            max-height:
              290px;
          }
        }

        /*
          Small phones.
        */

        @media (max-width: 480px) {

          .order-type-grid {
            grid-template-columns:
              repeat(
                2,
                minmax(
                  0,
                  1fr
                )
              );
          }

          .delivery-fields {
            grid-template-columns:
              1fr;
          }

          .delivery-fields
          .field-input:first-child,

          .delivery-fields
          textarea,

          .delivery-charge-box {
            grid-column:
              auto;
          }

          .order-food-grid {
            grid-template-columns:
              repeat(
                2,
                minmax(
                  0,
                  1fr
                )
              );

            gap:
              7px;
          }

          .order-menu-image-wrap {
            aspect-ratio:
              1 / .76;
          }

          .order-item-name {
            font-size:
              10px;

            min-height:
              25px;
          }

          .order-item-price {
            font-size:
              10px;
          }
        }

        @media (max-width: 360px) {

          .order-food-grid {
            gap:
              5px;
          }

          .order-menu-card {
            padding:
              3px;
          }

          .order-menu-image-wrap {
            aspect-ratio:
              1 / .78;
          }

          .order-item-name {
            font-size:
              9px;

            min-height:
              22px;
          }

          .order-item-price {
            font-size:
              9px;
          }
        }


        /* =========================================================
           FINAL RESPONSIVE UI OVERRIDES
           UI ONLY — NO ORDER / CART / SUPABASE LOGIC CHANGED
           ========================================================= */

        /* ---------- BASE / DESKTOP ---------- */

        .order-page {
          gap: 14px;
          padding: 14px;
        }

        .order-type-panel,
        .cart-panel {
          padding: 20px;
        }

        .menu-panel {
          padding: 16px;
        }

        .order-type-grid {
          gap: 10px;
        }

        .order-type-btn {
          min-height: 56px;
          padding: 13px 10px;
          border-radius: 14px;
          font-size: 13px;
        }

        .select-table-btn {
          min-height: 52px;
          padding: 13px 12px;
          border-radius: 13px;
          font-size: 13px;
          font-weight: 800;
        }

        .selection-dropdown-item {
          min-height: 46px;
          padding: 11px 12px;
          font-size: 13px;
        }

        .delivery-fields {
          gap: 9px;
          margin-top: 12px;
        }

        .field-input {
          min-height: 48px;
          padding: 12px 13px;
          border-radius: 11px;
          font-size: 13px;
        }

        .textarea-input {
          min-height: 82px;
        }

        .delivery-charge-box {
          min-height: 48px;
          padding: 11px 13px;
          border-radius: 11px;
          font-size: 13px;
        }

        .category-header h2 {
          font-size: 22px;
        }

        .category-eyebrow,
        .cart-eyebrow,
        .modal-eyebrow {
          font-size: 9px;
        }

        .category-count {
          font-size: 11px;
        }

        .category-tabs {
          gap: 7px;
          padding: 3px 2px 9px;
        }

        .category-tab {
          padding: 7px 11px;
          gap: 5px;
          font-size: 11px;
        }

        .category-tab-count {
          min-width: 18px;
          height: 18px;
          font-size: 8px;
        }

        .category-title {
          margin: 6px 0 10px;
          font-size: 13px;
        }

        .category-title small {
          font-size: 10px;
        }

        /* PC: EXACTLY 5 FOOD ITEMS PER ROW */
        .order-food-grid {
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 14px;
        }

        .order-menu-card {
          padding: 7px;
          border-radius: 14px;
        }

        .order-menu-image-wrap {
          aspect-ratio: 1 / .72;
          border-radius: 10px;
        }

        .order-menu-card-content {
          padding: 8px 3px 3px;
        }

        .order-item-name {
          min-height: 34px;
          font-size: 13px;
          line-height: 1.25;
        }

        .order-item-price {
          margin-top: 6px;
          font-size: 14px;
          line-height: 1.1;
        }

        /* ---------- CART ---------- */

        .cart-header h2 {
          font-size: 22px;
        }

        .cart-badge {
          min-height: 28px;
          padding: 6px 10px;
          font-size: 11px;
        }

        .cart-list {
          gap: 9px;
        }

        .cart-item {
          gap: 9px;
          padding: 10px;
          border-radius: 12px;
        }

        .cart-item-name {
          font-size: 12px;
        }

        .cart-modifiers {
          margin-top: 4px;
          font-size: 10px;
        }

        .cart-item-price {
          margin-top: 4px;
          font-size: 10px;
        }

        .cart-item-actions {
          gap: 5px;
        }

        .qty-btn {
          width: 34px;
          height: 34px;
          border-radius: 9px;
          font-size: 18px;
        }

        .qty-value {
          min-width: 22px;
          font-size: 12px;
        }

        .remove-btn {
          width: 32px;
          height: 32px;
          border-radius: 9px;
          font-size: 19px;
        }

        .cart-summary {
          margin-top: 11px;
          padding: 11px 12px;
          border-radius: 12px;
        }

        .summary-row {
          margin-bottom: 7px;
          font-size: 11px;
        }

        .summary-total {
          font-size: 16px;
        }

        .place-order-btn {
          min-height: 56px;
          margin-top: 12px;
          padding: 13px 16px;
          border-radius: 14px;
          font-size: 15px;
        }

        /* ---------- MODIFIER MODAL ---------- */

        .modifier-choice {
          min-height: 46px;
          padding: 11px 12px;
          border-radius: 10px;
          font-size: 12px;
        }

        .close-btn {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          font-size: 16px;
        }

        /* =========================================================
           LARGE DESKTOP: 1250px+
           5 ITEMS / ROW
           ========================================================= */

        @media (min-width: 1250px) {
          .order-page {
            grid-template-columns: 300px minmax(0, 1fr) 330px;
          }

          .order-food-grid {
            grid-template-columns: repeat(5, minmax(0, 1fr));
          }
        }

        /* =========================================================
           DESKTOP / SMALL PC: 1000px–1249px
           5 ITEMS / ROW
           ========================================================= */

        @media (min-width: 1000px) and (max-width: 1249px) {
          .order-page {
            grid-template-columns: 260px minmax(0, 1fr) 320px;
            gap: 12px;
            padding: 12px;
          }

          .order-food-grid {
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 11px;
          }

          .order-menu-card {
            padding: 6px;
          }

          .order-item-name {
            font-size: 12px;
            min-height: 31px;
          }

          .order-item-price {
            font-size: 13px;
          }

          .order-type-btn {
            min-height: 54px;
            font-size: 12px;
          }
        }

        /* =========================================================
           TABLET: 768px–999px
           3 ITEMS / ROW
           ========================================================= */

        @media (min-width: 768px) and (max-width: 999px) {
          .order-page {
            grid-template-columns: 225px minmax(0, 1fr);
            gap: 10px;
            padding: 10px;
          }

          .order-type-panel,
          .cart-panel {
            padding: 15px;
          }

          .menu-panel {
            padding: 13px;
          }

          .order-type-btn {
            min-height: 52px;
            padding: 11px 7px;
            font-size: 12px;
          }

          .select-table-btn {
            min-height: 48px;
            font-size: 12px;
          }

          .delivery-fields {
            grid-template-columns: 1fr;
          }

          .order-food-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px;
          }

          .order-menu-card {
            padding: 6px;
            border-radius: 12px;
          }

          .order-menu-image-wrap {
            aspect-ratio: 1 / .74;
          }

          .order-menu-card-content {
            padding: 7px 2px 2px;
          }

          .order-item-name {
            min-height: 32px;
            font-size: 12px;
          }

          .order-item-price {
            font-size: 13px;
          }

          .cart-item {
            align-items: flex-start;
            flex-direction: column;
          }

          .cart-item-main {
            width: 100%;
          }

          .cart-item-actions {
            width: 100%;
            justify-content: flex-end;
          }
        }

        /* =========================================================
           MOBILE: 481px–767px
           2 ITEMS / ROW
           ========================================================= */

        @media (min-width: 481px) and (max-width: 767px) {
          .order-page {
            display: block;
            padding: 9px;
          }

          .order-page-header {
            margin-bottom: 9px;
          }

          .order-page-header h1 {
            font-size: 24px;
          }

          .order-page-subtitle {
            font-size: 11px;
          }

          .order-type-panel,
          .menu-panel,
          .cart-panel {
            position: static;
            margin-bottom: 9px;
            border-radius: 16px;
          }

          .order-type-panel,
          .cart-panel {
            padding: 13px;
          }

          .menu-panel {
            padding: 13px;
          }

          .order-type-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 9px;
          }

          .order-type-btn {
            min-height: 56px;
            padding: 12px 7px;
            font-size: 13px;
          }

          .delivery-fields {
            grid-template-columns: 1fr;
          }

          .delivery-fields .field-input:first-child,
          .delivery-fields textarea,
          .delivery-charge-box {
            grid-column: auto;
          }

          .order-food-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .order-menu-card {
            padding: 6px;
            border-radius: 12px;
          }

          .order-menu-image-wrap {
            aspect-ratio: 1 / .74;
            border-radius: 9px;
          }

          .order-menu-card-content {
            padding: 7px 3px 3px;
          }

          .order-item-name {
            min-height: 34px;
            font-size: 13px;
          }

          .order-item-price {
            font-size: 14px;
          }

          .cart-list {
            max-height: 360px;
          }

          .cart-item {
            align-items: flex-start;
          }
        }

        /* =========================================================
           SMALL MOBILE: 360px–480px
           2 ITEMS / ROW
           ========================================================= */

        @media (max-width: 480px) {
          .order-page {
            display: block;
            padding: 7px;
          }

          .order-page-header h1 {
            font-size: 22px;
          }

          .order-page-subtitle {
            font-size: 10px;
          }

          .order-type-panel,
          .menu-panel,
          .cart-panel {
            margin-bottom: 8px;
          }

          .order-type-panel,
          .cart-panel,
          .menu-panel {
            padding: 11px;
          }

          .order-type-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }

          .order-type-btn {
            min-height: 52px;
            padding: 10px 5px;
            font-size: 12px;
          }

          .select-table-btn {
            min-height: 48px;
            font-size: 12px;
          }

          .field-input {
            min-height: 46px;
            padding: 11px 12px;
            font-size: 13px;
          }

          .textarea-input {
            min-height: 78px;
          }

          .order-food-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }

          .order-menu-card {
            padding: 5px;
            border-radius: 11px;
          }

          .order-menu-image-wrap {
            aspect-ratio: 1 / .76;
            border-radius: 8px;
          }

          .order-item-name {
            min-height: 31px;
            font-size: 11px;
          }

          .order-item-price {
            font-size: 12px;
          }

          .qty-btn {
            width: 32px;
            height: 32px;
          }

          .remove-btn {
            width: 30px;
            height: 30px;
          }

          .place-order-btn {
            min-height: 54px;
            font-size: 14px;
          }
        }

        /* =========================================================
           VERY SMALL PHONES: <=360px
           KEEP 2 ITEMS / ROW, DO NOT SHRINK TOO FAR
           ========================================================= */

        @media (max-width: 360px) {
          .order-food-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 7px;
          }

          .order-menu-card {
            padding: 4px;
          }

          .order-menu-image-wrap {
            aspect-ratio: 1 / .78;
          }

          .order-item-name {
            min-height: 29px;
            font-size: 10px;
          }

          .order-item-price {
            font-size: 11px;
          }

          .order-type-btn {
            min-height: 50px;
            font-size: 11px;
          }

          .qty-btn {
            width: 30px;
            height: 30px;
          }

          .remove-btn {
            width: 29px;
            height: 29px;
          }
        }

      `}</style>
    </div>
  )
}