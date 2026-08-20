"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

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
  const [modifierLinks, setModifierLinks] = useState([])
  const [modifierItem, setModifierItem] = useState(null)
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
        const { data: rest, error } = await supabase
          .from("restaurants")
          .select("*")
          .eq("slug", slug)
          .maybeSingle()

        if (error) {
          console.error("RESTAURANT ERROR:", error)
          alert("Restaurant could not be loaded.")
          return
        }

        if (!rest) {
          alert("Restaurant not found")
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

      const { data: userData, error: userError } =
        await supabase.auth.getUser()

      if (userError || !userData?.user) {
        alert("Please sign in first.")
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("restaurant_id")
        .eq("id", userData.user.id)
        .single()

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

    const [
      menuResult,
      tablesResult,
      roomsResult,
      groupsResult,
      modifiersResult,
      linksResult,
      zonesResult,
    ] = await Promise.all([
      supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", rid),

      supabase
        .from("tables")
        .select("*")
        .eq("restaurant_id", rid),

      supabase
        .from("rooms")
        .select("*")
        .eq("restaurant_id", rid),

      supabase
        .from("modifier_groups")
        .select("*")
        .eq("restaurant_id", rid)
        .eq("active", true)
        .order("created_at"),

      supabase
        .from("modifiers")
        .select("*")
        .eq("restaurant_id", rid)
        .eq("active", true)
        .order("created_at"),

      supabase
        .from("menu_item_modifier_groups")
        .select("menu_item_id,modifier_group_id")
        .eq("restaurant_id", rid),

      supabase
        .from("delivery_zones")
        .select("*")
        .eq("restaurant_id", rid)
        .eq("active", true)
        .order("name"),
    ])

    if (menuResult.error) {
      console.error("MENU ERROR:", menuResult.error)
    }

    if (tablesResult.error) {
      console.error("TABLE ERROR:", tablesResult.error)
    }

    if (roomsResult.error) {
      console.error("ROOM ERROR:", roomsResult.error)
    }

    if (groupsResult.error) {
      console.error("MODIFIER GROUP ERROR:", groupsResult.error)
    }

    if (modifiersResult.error) {
      console.error("MODIFIER ERROR:", modifiersResult.error)
    }

    if (linksResult.error) {
      console.error("MODIFIER LINK ERROR:", linksResult.error)
    }

    if (zonesResult.error) {
      console.error("DELIVERY ZONE ERROR:", zonesResult.error)
    }

    setMenu(menuResult.data || [])
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

      const list = typeParam === "table" ? tables : rooms

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

    if (qrType !== "table" && qrType !== "room") return

    setType(qrType)

    const list = qrType === "table" ? tables : rooms

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
    const ids = modifierLinks
      .filter((link) => link.menu_item_id === item.id)
      .map((link) => link.modifier_group_id)

    return modifierGroups.filter((group) => ids.includes(group.id))
  }

  function addToCart(item) {
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

  function addConfiguredItem(item, selectedModifiers) {
    const modifierTotal = selectedModifiers.reduce(
      (sum, modifier) =>
        sum +
        Number(modifier.price || 0) *
          Number(modifier.quantity || 1),
      0
    )

    const key = `${item.id}:${
      selectedModifiers.map((modifier) => modifier.id).sort().join(",") ||
      "base"
    }`

    setCart((previous) => {
      const existing = previous.find(
        (item) => item.cartKey === key
      )

      if (existing) {
        return previous.map((item) =>
          item.cartKey === key
            ? {
                ...item,
                qty: Number(item.qty || 0) + 1,
              }
            : item
        )
      }

      return [
        ...previous,
        {
          ...item,
          qty: 1,
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

      if (group.required && !chosen.length) {
        alert(`Please choose an option from ${group.name}`)
        return
      }
    }

    const chosen = Object.values(modifierSelection).flat()

    addConfiguredItem(modifierItem, chosen)

    setModifierItem(null)
    setModifierSelection({})
  }

  function toggleModifier(group, modifier) {
    setModifierSelection((previous) => {
      const current = previous[group.id] || []

      if (group.selection_type === "single") {
        return {
          ...previous,
          [group.id]: [modifier],
        }
      }

      const exists = current.some(
        (item) => item.id === modifier.id
      )

      return {
        ...previous,
        [group.id]: exists
          ? current.filter((item) => item.id !== modifier.id)
          : [...current, modifier],
      }
    })
  }

  /* =========================================================
     CART
     ========================================================= */

  function updateQty(cartKey, change) {
    setCart((previous) =>
      previous.flatMap((item) => {
        if (item.cartKey !== cartKey) {
          return [item]
        }

        const qty = Number(item.qty || 0) + change

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
      previous.filter((item) => item.cartKey !== cartKey)
    )
  }

  /* =========================================================
     COMBO
     ========================================================= */

  function comboDisplayName(item) {
    if (item?.item_type !== "combo") {
      return item?.name || "Item"
    }

    const config = item?.combo_config || {}

    const ids =
      config.mode === "fixed"
        ? (config.items || []).map((item) => item.item_id)
        : []

    const names = ids
      .map((id) => menu.find((menuItem) => menuItem.id === id)?.name)
      .filter(Boolean)

    return names.length
      ? `${item.name} [${names.join(", ")}]`
      : item.name
  }

  /* =========================================================
     ORDER TYPE
     ========================================================= */

  function changeOrderType(nextType) {
    setType(nextType)
    setSelected(null)
    setOpenSelect(false)

    if (nextType !== "delivery") {
      setDeliveryCharge(0)
      setDeliveryZone("")
    }

    if (nextType === "takeaway") {
      setCustomerNotes("")
    }
  }

  function applyZone(zone) {
    setDeliveryZone(zone?.name || "")
    setDeliveryCharge(Number(zone?.charge || 0))
  }

  /* =========================================================
     PLACE ORDER
     ========================================================= */

  async function placeOrder() {
    if (!restaurantId) {
      alert("Restaurant missing")
      return
    }

    if (cart.length === 0) {
      alert("Cart empty")
      return
    }

    if (
      (type === "table" || type === "room") &&
      !selected
    ) {
      alert("Select table/room")
      return
    }

    if (type === "delivery") {
      if (!customerName.trim()) {
        alert("Customer name is required")
        return
      }

      if (!customerPhone.trim()) {
        alert("Customer phone is required")
        return
      }

      if (!deliveryAddress.trim()) {
        alert("Delivery address is required")
        return
      }
    }

    const foodTotal = cart.reduce(
      (sum, item) =>
        sum +
        (Number(item.price || 0) +
          Number(item.modifierTotal || 0)) *
          Number(item.qty || 0),
      0
    )

    const orderTotal =
      foodTotal +
      (type === "delivery"
        ? Number(deliveryCharge || 0)
        : 0)

    const sourceLabel =
      type === "table"
        ? `Table ${selected.table_number}`
        : type === "room"
        ? `Room ${selected.room_number}`
        : type === "takeaway"
        ? "Takeaway"
        : `Delivery - ${customerName.trim()}`

    const { data: order, error } = await supabase
      .from("orders")
      .insert([
        {
          source_type: type,
          source_id: selected?.id || null,
          source_label: sourceLabel,
          order_mode:
            type === "table" || type === "room"
              ? "dine_in"
              : type,
          restaurant_id: restaurantId,
          status: "pending",
          subtotal: foodTotal,
          total_amount: orderTotal,
          payment_status: "unpaid",
          payment_method:
            type === "delivery"
              ? paymentMethod
              : null,
          paid_amount: 0,
        },
      ])
      .select()
      .single()

    if (error || !order) {
      console.error("ORDER ERROR:", error)

      alert(
        error?.message ||
          "Order could not be created."
      )

      return
    }

    /* =======================================================
       ORDER ITEMS
       ======================================================= */

    for (const cartItem of cart) {
      const { data: orderItem, error: itemError } =
        await supabase
          .from("order_items")
          .insert([
            {
              order_id: order.id,
              item_id: cartItem.id,
              quantity: cartItem.qty,
              item_name: comboDisplayName(cartItem),
              unit_price: Number(cartItem.price || 0),
              line_total:
                (Number(cartItem.price || 0) +
                  Number(cartItem.modifierTotal || 0)) *
                Number(cartItem.qty || 0),
            },
          ])
          .select("id")
          .single()

      if (itemError || !orderItem) {
        console.error("ITEM ERROR:", itemError)

        alert(
          itemError?.message ||
            "Order item could not be saved."
        )

        return
      }

      /* =====================================================
         ORDER MODIFIERS
         ===================================================== */

      if (cartItem.selectedModifiers?.length) {
        const modifierRows =
          cartItem.selectedModifiers.map((modifier) => ({
            order_item_id: orderItem.id,
            modifier_id: modifier.id,
            modifier_name: modifier.name,
            price: Number(modifier.price || 0),
            quantity: Number(
              modifier.quantity || 1
            ),
          }))

        const { error: modifierError } =
          await supabase
            .from("order_item_modifiers")
            .insert(modifierRows)

        if (modifierError) {
          console.error(
            "MODIFIER ERROR:",
            modifierError
          )

          alert(
            modifierError.message ||
              "Modifier save failed."
          )

          return
        }
      }
    }

    /* =======================================================
       DELIVERY SLIP
       ======================================================= */

    if (type === "delivery") {
      const {
        data: slipNo,
        error: slipError,
      } = await supabase.rpc(
        "next_delivery_slip_no",
        {
          p_restaurant_id: restaurantId,
        }
      )

      if (slipError) {
        console.error(
          "DELIVERY SLIP ERROR:",
          slipError
        )

        alert(
          "Order created, but delivery slip could not be generated. Open Delivery Management and create the slip there."
        )
      } else {
        const {
          data: delivery,
          error: deliveryError,
        } = await supabase
          .from("restaurant_deliveries")
          .insert([
            {
              restaurant_id: restaurantId,
              order_id: order.id,
              slip_no: slipNo,
              order_mode: "delivery",
              customer_name:
                customerName.trim(),
              phone: customerPhone.trim(),
              address:
                deliveryAddress.trim(),
              zone:
                deliveryZone || null,
              delivery_charge:
                Number(deliveryCharge || 0),
              payment_method:
                paymentMethod,
              expected_amount: orderTotal,

              /*
               * COD / delivery money stays pending
               * until rider/owner returns and settlement
               * is confirmed.
               */
              payment_status: "pending",
              settlement_status: "pending",

              status: "pending",

              customer_notes:
                customerNotes.trim() || null,
            },
          ])
          .select("*")
          .single()

        if (deliveryError) {
          console.error(
            "DELIVERY CREATE ERROR:",
            deliveryError
          )

          alert(
            "Order created, but delivery slip could not be saved: " +
              deliveryError.message
          )
        } else {
          await supabase
            .from("delivery_events")
            .insert([
              {
                restaurant_id: restaurantId,
                delivery_id: delivery.id,
                status: "pending",
                note:
                  "Delivery slip created from POS",
              },
            ])

          alert(
            `Delivery order created. Slip ${delivery.slip_no}`
          )

          window.location.href =
            `/dashboard/delivery?slip=${encodeURIComponent(
              delivery.slip_no
            )}`

          return
        }
      }
    } else {
      alert(
        type === "takeaway"
          ? "Takeaway order placed"
          : "Dine-in order placed"
      )
    }

    /* =======================================================
       RESET
       ======================================================= */

    setCart([])
    setSelected(null)

    setCustomerName("")
    setCustomerPhone("")
    setDeliveryAddress("")
    setDeliveryZone("")
    setDeliveryCharge(0)
    setCustomerNotes("")
  }

  /* =========================================================
     MENU GROUPING
     ========================================================= */

  const groupedMenu = menu.reduce(
    (accumulator, item) => {
      const category =
        String(item.category || "Other").trim() ||
        "Other"

      if (!accumulator[category]) {
        accumulator[category] = []
      }

      accumulator[category].push(item)

      return accumulator
    },
    {}
  )

  const categories = Object.keys(groupedMenu)

  useEffect(() => {
    if (
      categories.length &&
      activeCategory !== "All" &&
      !categories.includes(activeCategory)
    ) {
      setActiveCategory(categories[0])
    }
  }, [menu.length, activeCategory])

  const visibleItems =
    activeCategory === "All"
      ? menu
      : groupedMenu[activeCategory] || []

  const cartCount = cart.reduce(
    (total, item) =>
      total + Number(item.qty || 0),
    0
  )

  const cartTotal = cart.reduce(
    (total, item) =>
      total +
      (Number(item.price || 0) +
        Number(item.modifierTotal || 0)) *
        Number(item.qty || 0),
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
          <h1>{restaurantName}</h1>

          <div className="order-page-subtitle">
            Premium Dining Experience
          </div>
        </div>
      </div>

      {/* =====================================================
          LEFT - ORDER TYPE
          ===================================================== */}

      <div className="order-type-panel">
        <h3>🔘 Select</h3>

        <div className="order-type-grid">
          <button
            type="button"
            className={
              type === "table"
                ? "order-type-btn active-info"
                : "order-type-btn"
            }
            onClick={() =>
              changeOrderType("table")
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
              changeOrderType("takeaway")
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
              changeOrderType("delivery")
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
              changeOrderType("room")
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
                setOpenSelect(!openSelect)
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
                ).map((item) => (
                  <button
                    type="button"
                    className="selection-dropdown-item"
                    key={item.id}
                    onClick={() => {
                      setSelected(item)
                      setOpenSelect(false)
                    }}
                  >
                    {type === "table"
                      ? `🍽️ Table ${item.table_number}`
                      : `🛏️ Room ${item.room_number}`}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ===================================================
            TAKEAWAY
            =================================================== */}

        {type === "takeaway" && (
          <div className="mode-info-box">
            🥡 Quick takeaway — no table
            required. Print the bill/KOT after
            placing the order.
          </div>
        )}

        {/* ===================================================
            DELIVERY
            =================================================== */}

        {type === "delivery" && (
          <div className="delivery-fields">
            <input
              value={customerName}
              onChange={(event) =>
                setCustomerName(
                  event.target.value
                )
              }
              placeholder="Customer name *"
              className="field-input"
            />

            <input
              value={customerPhone}
              onChange={(event) =>
                setCustomerPhone(
                  event.target.value
                )
              }
              placeholder="Phone number *"
              inputMode="tel"
              className="field-input"
            />

            <textarea
              value={deliveryAddress}
              onChange={(event) =>
                setDeliveryAddress(
                  event.target.value
                )
              }
              placeholder="Delivery address *"
              rows={3}
              className="field-input textarea-input"
            />

            <select
              value={deliveryZone}
              onChange={(event) =>
                applyZone(
                  deliveryZones.find(
                    (zone) =>
                      zone.name ===
                      event.target.value
                  )
                )
              }
              className="field-input"
            >
              <option value="">
                Select delivery zone
              </option>

              {deliveryZones.map((zone) => (
                <option
                  key={zone.id}
                  value={zone.name}
                >
                  {zone.name} — ₹
                  {Number(
                    zone.charge || 0
                  ).toLocaleString("en-IN")}
                </option>
              ))}
            </select>

            <select
              value={paymentMethod}
              onChange={(event) =>
                setPaymentMethod(
                  event.target.value
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
              value={customerNotes}
              onChange={(event) =>
                setCustomerNotes(
                  event.target.value
                )
              }
              placeholder="Delivery note (optional)"
              rows={2}
              className="field-input textarea-input"
            />

            <div className="delivery-charge-box">
              <span>Delivery charge</span>

              <strong>
                ₹
                {Number(
                  deliveryCharge || 0
                ).toLocaleString("en-IN")}
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

            <h2>Choose your food</h2>
          </div>

          <span className="category-count">
            {visibleItems.length} items
          </span>
        </div>

        {/* ===================================================
            CATEGORIES
            =================================================== */}

        <div className="category-tabs">
          <button
            type="button"
            className={
              activeCategory === "All"
                ? "category-tab active"
                : "category-tab"
            }
            onClick={() =>
              setActiveCategory("All")
            }
          >
            All
            <span className="category-tab-count">
              {menu.length}
            </span>
          </button>

          {categories.map((category) => (
            <button
              type="button"
              key={category}
              className={
                activeCategory === category
                  ? "category-tab active"
                  : "category-tab"
              }
              onClick={() =>
                setActiveCategory(category)
              }
            >
              {category}

              <span className="category-tab-count">
                {groupedMenu[category].length}
              </span>
            </button>
          ))}
        </div>

        <div className="category-title">
          <span>
            {activeCategory === "All"
              ? "All Items"
              : activeCategory}
          </span>

          <small>
            Tap to add
          </small>
        </div>

        {/* ===================================================
            COMPACT 8-COLUMN MENU
            =================================================== */}

        <div className="order-food-grid">
          {visibleItems.map((item) => (
            <button
              type="button"
              className="order-menu-card"
              key={item.id}
              onClick={() =>
                addToCart(item)
              }
            >
              <div className="order-menu-image-wrap">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
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
                    item.price || 0
                  ).toLocaleString("en-IN")}
                </span>
              </div>
            </button>
          ))}
        </div>

        {!visibleItems.length && (
          <div className="empty-menu">
            No items in this category.
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

            <h2>Cart</h2>
          </div>

          <span className="cart-badge">
            {cartCount} items
          </span>
        </div>

        {cart.length === 0 ? (
          <div className="empty-cart">
            <div className="empty-cart-icon">
              🛒
            </div>

            <strong>
              Your cart is empty
            </strong>

            <span>
              Add food items from the menu.
            </span>
          </div>
        ) : (
          <>
            <div className="cart-list">
              {cart.map((item) => {
                const unitTotal =
                  Number(item.price || 0) +
                  Number(
                    item.modifierTotal || 0
                  )

                return (
                  <div
                    className="cart-item"
                    key={item.cartKey}
                  >
                    <div className="cart-item-main">
                      <div className="cart-item-name">
                        {item.name}
                      </div>

                      {item.selectedModifiers
                        ?.length > 0 && (
                        <div className="cart-modifiers">
                          +{" "}
                          {item.selectedModifiers
                            .map(
                              (modifier) =>
                                modifier.name
                            )
                            .join(", ")}
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
                        {item.qty}
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
              })}
            </div>

            <div className="cart-summary">
              <div className="summary-row">
                <span>Items</span>
                <strong>
                  {cartCount}
                </strong>
              </div>

              <div className="summary-total">
                <span>Total</span>

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
              onClick={placeOrder}
            >
              🚀 Place Order
            </button>
          </>
        )}
      </div>

      {/* =====================================================
          MODIFIER MODAL
          ===================================================== */}

      {modifierItem && (
        <div
          className="modal-backdrop"
          onClick={() =>
            setModifierItem(null)
          }
        >
          <div
            className="modifier-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modifier-modal-header">
              <div>
                <div className="modal-eyebrow">
                  CUSTOMIZE ITEM
                </div>

                <h2>
                  {modifierItem.name}
                </h2>

                <p>
                  Choose your options before
                  adding to the order.
                </p>
              </div>

              <button
                type="button"
                className="close-btn"
                onClick={() =>
                  setModifierItem(null)
                }
              >
                ✕
              </button>
            </div>

            <div className="modifier-groups">
              {itemGroups(
                modifierItem
              ).map((group) => (
                <div
                  key={group.id}
                  className="modifier-group-box"
                >
                  <div className="modifier-group-title">
                    <b>
                      {group.name}
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
                        (modifier) =>
                          modifier.group_id ===
                          group.id
                      )
                      .map((modifier) => {
                        const chosen = (
                          modifierSelection[
                            group.id
                          ] || []
                        ).some(
                          (selectedModifier) =>
                            selectedModifier.id ===
                            modifier.id
                        )

                        return (
                          <button
                            type="button"
                            key={modifier.id}
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
                              {modifier.name}
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
                      })}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="place-order-btn modal-add-btn"
              onClick={confirmModifiers}
            >
              Add to Order
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
          PAGE CSS
          ===================================================== */}

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        .order-page {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 260px minmax(0, 1fr) 300px;
          grid-template-rows: auto 1fr;
          align-items: start;
          gap: 12px;
          padding: 12px;

          background:
            linear-gradient(
              135deg,
              var(--background),
              var(--surface-2),
              var(--background)
            );

          color: #fff;
        }

        .order-page-header {
          grid-column: 1 / -1;
          margin-bottom: 2px;
          padding: 2px 2px 0;
        }

        .order-page-header h1 {
          margin: 0;
          font-size: 30px;
          line-height: 1.1;
          font-weight: 800;
          color: var(--primary);
        }

        .order-page-subtitle {
          margin-top: 5px;
          color: var(--muted);
          font-size: 13px;
        }

        .order-type-panel,
        .menu-panel,
        .cart-panel {
          background:
            rgba(
              var(--surface-2-rgb),
              .86
            );

          border:
            1px solid
            rgba(
              var(--primary-rgb),
              .15
            );

          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);

          border-radius: 20px;

          box-shadow:
            0 22px 55px
            rgba(0, 0, 0, .38);
        }

        .order-type-panel,
        .cart-panel {
          position: sticky;
          top: 12px;
          height: fit-content;
          padding: 14px;
        }

        .menu-panel {
          min-width: 0;
          padding: 14px;
        }

        .order-type-panel h3 {
          margin: 0 0 10px;
          font-size: 15px;
        }

        .order-type-grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 7px;
        }

        .order-type-btn {
          min-width: 0;
          padding: 9px 6px;
          border-radius: 11px;
          border:
            1px solid
            rgba(255, 255, 255, .12);

          background:
            rgba(255, 255, 255, .035);

          color: #fff;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;

          transition:
            .16s ease;
        }

        .order-type-btn:hover {
          background:
            rgba(255, 255, 255, .075);
        }

        .order-type-btn.active-info {
          border-color: #38bdf8;
          color: #38bdf8;
          box-shadow:
            0 0 12px
            rgba(56, 189, 248, .18);
        }

        .order-type-btn.active-warning {
          border-color: #f59e0b;
          color: #f59e0b;
          box-shadow:
            0 0 12px
            rgba(245, 158, 11, .18);
        }

        .order-type-btn.active-success {
          border-color: #22c55e;
          color: #22c55e;
          box-shadow:
            0 0 12px
            rgba(34, 197, 94, .18);
        }

        .order-type-btn.active-purple {
          border-color: #a855f7;
          color: #a855f7;
          box-shadow:
            0 0 12px
            rgba(168, 85, 247, .18);
        }

        .select-table-btn {
          width: 100%;
          margin-top: 12px;
          padding: 10px;
          border-radius: 11px;

          border:
            1px solid
            rgba(255, 255, 255, .13);

          background:
            rgba(255, 255, 255, .045);

          color: #fff;
          font-size: 11px;
          cursor: pointer;
        }

        .selection-dropdown {
          max-height: 210px;
          overflow-y: auto;
          margin-top: 8px;

          border:
            1px solid
            rgba(255, 255, 255, .10);

          border-radius: 11px;
          overflow-x: hidden;

          background:
            rgba(5, 15, 12, .96);
        }

        .selection-dropdown-item {
          display: block;
          width: 100%;
          padding: 10px;
          border: 0;
          border-bottom:
            1px solid
            rgba(255, 255, 255, .06);

          background: transparent;
          color: #fff;
          text-align: left;
          cursor: pointer;
          font-size: 11px;
        }

        .selection-dropdown-item:hover {
          background:
            rgba(
              var(--primary-rgb),
              .08
            );
        }

        .mode-info-box {
          margin-top: 10px;
          padding: 10px;

          border-radius: 11px;

          background:
            rgba(245, 158, 11, .07);

          border:
            1px solid
            rgba(245, 158, 11, .20);

          color: #f7c66a;
          font-size: 10px;
          line-height: 1.45;
        }

        .delivery-fields {
          display: grid;
          gap: 7px;
          margin-top: 10px;
        }

        .field-input {
          width: 100%;
          min-width: 0;
          padding: 9px 10px;

          border:
            1px solid
            rgba(255, 255, 255, .12);

          border-radius: 10px;

          background:
            rgba(255, 255, 255, .04);

          color: #fff;
          outline: none;
          font-size: 11px;
        }

        .field-input::placeholder {
          color: rgba(255, 255, 255, .46);
        }

        .field-input:focus {
          border-color:
            rgba(
              var(--primary-rgb),
              .50
            );

          box-shadow:
            0 0 0 2px
            rgba(
              var(--primary-rgb),
              .07
            );
        }

        .textarea-input {
          resize: vertical;
        }

        .delivery-charge-box {
          display: flex;
          justify-content: space-between;
          align-items: center;

          padding: 9px 10px;

          border-radius: 10px;

          background:
            rgba(34, 197, 94, .07);

          border:
            1px solid
            rgba(34, 197, 94, .18);

          color: #86efac;
          font-size: 11px;
        }

        .category-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 8px;
        }

        .category-eyebrow,
        .cart-eyebrow,
        .modal-eyebrow {
          color: var(--primary);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 1.4px;
        }

        .category-header h2 {
          margin: 3px 0 0;
          font-size: 20px;
          line-height: 1.1;
        }

        .category-count {
          color: var(--muted);
          font-size: 10px;
          font-weight: 800;
          white-space: nowrap;
        }

        .category-tabs {
          display: flex;
          align-items: center;
          gap: 6px;

          width: 100%;
          overflow-x: auto;

          padding: 2px 1px 8px;
          margin-bottom: 2px;

          scrollbar-width: thin;
        }

        .category-tab {
          flex: 0 0 auto;

          display: inline-flex;
          align-items: center;
          gap: 5px;

          padding: 6px 9px;

          border:
            1px solid
            rgba(
              var(--primary-rgb),
              .15
            );

          border-radius: 999px;

          background:
            rgba(255, 255, 255, .035);

          color: #fff;
          font-size: 10px;
          font-weight: 800;

          cursor: pointer;
          white-space: nowrap;
        }

        .category-tab.active {
          background:
            rgba(
              var(--primary-rgb),
              .12
            );

          border-color:
            rgba(
              var(--primary-rgb),
              .55
            );

          color: var(--primary);
        }

        .category-tab-count {
          min-width: 16px;
          height: 16px;

          display: inline-grid;
          place-items: center;

          border-radius: 999px;

          background:
            rgba(255, 255, 255, .07);

          color: var(--muted);
          font-size: 8px;
        }

        .category-tab.active
        .category-tab-count {
          background: var(--primary);
          color: #111;
        }

        .category-title {
          display: flex;
          align-items: baseline;
          justify-content: space-between;

          margin: 3px 0 8px;

          color: #fff;
          font-size: 12px;
          font-weight: 900;
        }

        .category-title small {
          color: var(--muted);
          font-size: 9px;
          font-weight: 600;
        }

        /* ==================================================
           PRODUCT GRID
           8 desktop
           7 medium desktop
           6 smaller laptop
           4 tablet
           3 mobile
           2 very small
           ================================================== */

        .order-food-grid {
          display: grid;

          grid-template-columns:
            repeat(8, minmax(0, 1fr));

          gap: 9px;
          align-items: stretch;
        }

        .order-menu-card {
          appearance: none;
          -webkit-appearance: none;

          display: block;

          width: 100%;
          min-width: 0;
          margin: 0;
          padding: 5px;

          border:
            1px solid
            rgba(
              var(--primary-rgb),
              .14
            );

          border-radius: 13px;

          background:
            linear-gradient(
              145deg,
              rgba(255, 255, 255, .055),
              rgba(255, 255, 255, .022)
            );

          color: #fff;
          text-align: left;

          cursor: pointer;
          overflow: hidden;

          box-shadow:
            0 8px 20px
            rgba(0, 0, 0, .20);

          transition:
            transform .16s ease,
            border-color .16s ease,
            background .16s ease,
            box-shadow .16s ease;
        }

        .order-menu-card:hover {
          transform: translateY(-2px);

          border-color:
            rgba(
              var(--primary-rgb),
              .48
            );

          background:
            linear-gradient(
              145deg,
              rgba(
                var(--primary-rgb),
                .09
              ),
              rgba(255, 255, 255, .035)
            );

          box-shadow:
            0 13px 28px
            rgba(0, 0, 0, .28);
        }

        .order-menu-card:active {
          transform: scale(.985);
        }

        .order-menu-image-wrap {
          width: 100%;

          aspect-ratio: 1 / .76;

          overflow: hidden;

          border-radius: 9px;

          background:
            rgba(255, 255, 255, .04);
        }

        .order-menu-image {
          display: block;

          width: 100%;
          height: 100%;

          object-fit: cover;
        }

        .order-menu-image-fallback {
          width: 100%;
          height: 100%;

          display: grid;
          place-items: center;

          background:
            linear-gradient(
              145deg,
              #183127,
              #10231c
            );

          font-size: 24px;
        }

        .order-menu-card-content {
          min-width: 0;
          padding: 6px 2px 2px;
        }

        .order-item-name {
          display: -webkit-box;

          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;

          overflow: hidden;

          min-height: 27px;

          color: #f7f2e8;

          font-size: 10.5px;
          line-height: 1.22;
          font-weight: 800;

          white-space: normal;
        }

        .order-item-price {
          display: block;

          margin-top: 4px;

          color: var(--primary);

          font-size: 10.5px;
          line-height: 1;
          font-weight: 900;

          white-space: nowrap;
        }

        .empty-menu {
          padding: 35px 10px;

          color: var(--muted);
          text-align: center;
          font-size: 12px;
        }

        /* ==================================================
           CART
           ================================================== */

        .cart-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;

          margin-bottom: 10px;
        }

        .cart-header h2 {
          margin: 3px 0 0;
          font-size: 20px;
        }

        .cart-badge {
          padding: 5px 8px;

          border:
            1px solid
            rgba(
              var(--primary-rgb),
              .18
            );

          border-radius: 999px;

          background:
            rgba(
              var(--primary-rgb),
              .08
            );

          color: var(--primary);

          font-size: 9px;
          font-weight: 800;

          white-space: nowrap;
        }

        .empty-cart {
          min-height: 180px;

          display: grid;
          place-items: center;
          align-content: center;

          gap: 5px;

          color: var(--muted);
          text-align: center;
          font-size: 11px;
        }

        .empty-cart-icon {
          width: 48px;
          height: 48px;

          display: grid;
          place-items: center;

          margin-bottom: 4px;

          border-radius: 16px;

          background:
            rgba(255, 255, 255, .04);

          font-size: 22px;
        }

        .cart-list {
          display: grid;
          gap: 7px;

          max-height: 350px;
          overflow-y: auto;

          padding-right: 2px;
        }

        .cart-item {
          display: flex;
          align-items: center;
          justify-content: space-between;

          gap: 7px;

          padding: 8px;

          border:
            1px solid
            rgba(255, 255, 255, .065);

          border-radius: 12px;

          background:
            rgba(255, 255, 255, .03);
        }

        .cart-item-main {
          min-width: 0;
          flex: 1;
        }

        .cart-item-name {
          overflow: hidden;

          text-overflow: ellipsis;
          white-space: nowrap;

          font-size: 11px;
          font-weight: 850;
        }

        .cart-modifiers {
          margin-top: 3px;

          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;

          color: var(--muted);

          font-size: 9px;
        }

        .cart-item-price {
          margin-top: 3px;

          color: var(--primary);

          font-size: 9px;
          font-weight: 800;
        }

        .cart-item-actions {
          flex: 0 0 auto;

          display: flex;
          align-items: center;
          gap: 4px;
        }

        .qty-btn {
          width: 25px;
          height: 25px;

          display: grid;
          place-items: center;

          padding: 0;

          border:
            1px solid
            rgba(
              var(--primary-rgb),
              .22
            );

          border-radius: 8px;

          background:
            rgba(
              var(--primary-rgb),
              .07
            );

          color: #fff;

          font-size: 15px;
          font-weight: 800;

          cursor: pointer;
        }

        .qty-value {
          min-width: 16px;

          color: #fff;

          text-align: center;

          font-size: 10px;
          font-weight: 900;
        }

        .remove-btn {
          width: 24px;
          height: 24px;

          display: grid;
          place-items: center;

          margin-left: 1px;
          padding: 0;

          border:
            1px solid
            rgba(255, 80, 80, .20);

          border-radius: 7px;

          background:
            rgba(255, 80, 80, .07);

          color: #ff8c8c;

          font-size: 16px;
          line-height: 1;

          cursor: pointer;
        }

        .cart-summary {
          margin-top: 9px;
          padding: 9px 10px;

          border:
            1px solid
            rgba(
              var(--primary-rgb),
              .13
            );

          border-radius: 12px;

          background:
            rgba(
              var(--primary-rgb),
              .055
            );
        }

        .summary-row {
          display: flex;
          justify-content: space-between;

          margin-bottom: 6px;

          color: var(--muted);

          font-size: 10px;
        }

        .summary-total {
          display: flex;
          justify-content: space-between;
          align-items: center;

          color: #fff;

          font-size: 13px;
          font-weight: 900;
        }

        .place-order-btn {
          width: 100%;

          margin-top: 9px;
          padding: 12px;

          border:
            1px solid
            rgba(
              var(--primary-rgb),
              .32
            );

          border-radius: 13px;

          background:
            linear-gradient(
              135deg,
              var(--surface),
              var(--surface-2)
            );

          color: #fff;

          font-size: 13px;
          font-weight: 800;

          cursor: pointer;

          box-shadow:
            0 15px 30px
            rgba(0, 0, 0, .28);
        }

        .place-order-btn:hover {
          border-color:
            rgba(
              var(--primary-rgb),
              .58
            );
        }

        /* ==================================================
           MODIFIER MODAL
           ================================================== */

        .modal-backdrop {
          position: fixed;
          inset: 0;

          z-index: 9999;

          display: grid;
          place-items: center;

          padding: 16px;

          background:
            rgba(0, 0, 0, .68);

          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .modifier-modal {
          width: min(100%, 560px);

          max-height: 90vh;

          overflow-y: auto;

          padding: 20px;

          border:
            1px solid
            rgba(
              var(--primary-rgb),
              .22
            );

          border-radius: 22px;

          background:
            linear-gradient(
              145deg,
              #0b2118,
              #102b20
            );

          color: #fff;

          box-shadow:
            0 35px 100px
            rgba(0, 0, 0, .55);
        }

        .modifier-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;

          gap: 12px;
        }

        .modifier-modal-header h2 {
          margin: 4px 0;

          font-size: 20px;
        }

        .modifier-modal-header p {
          margin: 0;

          color: var(--muted);

          font-size: 11px;
        }

        .close-btn {
          width: 34px;
          height: 34px;

          flex: 0 0 auto;

          border:
            1px solid
            rgba(255, 255, 255, .10);

          border-radius: 10px;

          background:
            rgba(255, 255, 255, .04);

          color: #fff;

          cursor: pointer;
        }

        .modifier-groups {
          display: grid;
          gap: 12px;
          margin-top: 16px;
        }

        .modifier-group-box {
          padding: 12px;

          border:
            1px solid
            rgba(255, 255, 255, .07);

          border-radius: 15px;

          background:
            rgba(255, 255, 255, .03);
        }

        .modifier-group-title {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }

        .modifier-group-title small {
          color: var(--muted);
          font-size: 9px;
        }

        .modifier-options {
          display: grid;
          gap: 6px;
          margin-top: 8px;
        }

        .modifier-choice {
          display: flex;
          justify-content: space-between;
          align-items: center;

          width: 100%;

          padding: 9px 10px;

          border:
            1px solid
            rgba(255, 255, 255, .08);

          border-radius: 10px;

          background:
            rgba(255, 255, 255, .025);

          color: #fff;

          font-size: 11px;

          cursor: pointer;
          text-align: left;
        }

        .modifier-choice.active {
          background:
            rgba(
              var(--primary-rgb),
              .11
            );

          border-color:
            rgba(
              var(--primary-rgb),
              .38
            );

          color: var(--primary);
        }

        .modifier-choice strong {
          white-space: nowrap;
        }

        .modal-add-btn {
          margin-top: 15px;
        }

        /* ==================================================
           RESPONSIVE
           ================================================== */

        @media (max-width: 1499px) {
          .order-food-grid {
            grid-template-columns:
              repeat(7, minmax(0, 1fr));
          }
        }

        @media (max-width: 1249px) {
          .order-page {
            grid-template-columns:
              220px minmax(0, 1fr) 270px;
          }

          .order-food-grid {
            grid-template-columns:
              repeat(6, minmax(0, 1fr));
          }
        }

        @media (max-width: 999px) {
          .order-page {
            grid-template-columns:
              190px minmax(0, 1fr);

            grid-template-rows:
              auto auto auto;

            padding: 9px;
          }

          .order-page-header {
            grid-column: 1 / -1;
          }

          .order-type-panel {
            position: static;
            grid-column: 1;
          }

          .menu-panel {
            grid-column: 2;
            grid-row: 2 / span 2;
          }

          .cart-panel {
            position: static;
            grid-column: 1;
          }

          .order-food-grid {
            grid-template-columns:
              repeat(4, minmax(0, 1fr));
          }
        }

        @media (max-width: 767px) {
          .order-page {
            display: block;
            padding: 8px;
          }

          .order-page-header {
            margin-bottom: 8px;
          }

          .order-page-header h1 {
            font-size: 23px;
          }

          .order-type-panel,
          .menu-panel,
          .cart-panel {
            position: static;
            margin-bottom: 8px;
            border-radius: 17px;
          }

          .order-type-grid {
            grid-template-columns:
              repeat(4, minmax(0, 1fr));
          }

          .order-type-btn {
            padding: 8px 4px;
            font-size: 9px;
          }

          .delivery-fields {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
          }

          .delivery-fields
          .field-input:first-child,
          .delivery-fields
          textarea,
          .delivery-charge-box {
            grid-column: 1 / -1;
          }

          .order-food-grid {
            grid-template-columns:
              repeat(3, minmax(0, 1fr));

            gap: 7px;
          }

          .order-menu-card {
            padding: 5px;
            border-radius: 11px;
          }

          .order-menu-image-wrap {
            border-radius: 8px;
          }

          .order-item-name {
            font-size: 10px;
            min-height: 25px;
          }

          .order-item-price {
            font-size: 10px;
          }

          .cart-list {
            max-height: 300px;
          }
        }

        @media (max-width: 480px) {
          .order-type-grid {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
          }

          .delivery-fields {
            grid-template-columns: 1fr;
          }

          .delivery-fields
          .field-input:first-child,
          .delivery-fields
          textarea,
          .delivery-charge-box {
            grid-column: auto;
          }

          .order-food-grid {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));

            gap: 8px;
          }

          .order-menu-image-wrap {
            aspect-ratio: 1 / .78;
          }

          .order-item-name {
            font-size: 11px;
            min-height: 27px;
          }

          .order-item-price {
            font-size: 11px;
          }
        }

        @media (max-width: 360px) {
          .order-food-grid {
            gap: 6px;
          }

          .order-menu-card {
            padding: 4px;
          }

          .order-item-name {
            font-size: 10px;
          }

          .order-item-price {
            font-size: 10px;
          }
        }
      `}</style>
    </div>
  )
}