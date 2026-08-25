"use client"
import { formatIndiaTime } from "@/lib/indiaTime"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import OrderPage from "../order/page"

export default function StaffPage() {
  const [restaurantId, setRestaurantId] = useState(null)
  const [orders, setOrders] = useState([])
  const [activeTab, setActiveTab] = useState("orders")
  const [posEnabled, setPosEnabled] = useState(false)
  const [captainEnabled, setCaptainEnabled] = useState(false)
  const [showAllOrders, setShowAllOrders] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let channel = null
    let refreshTimer = null

    async function start() {
      channel = await init()
    }

    void start()

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [])

  async function init() {
    try {
      setLoading(true)

      const { data: userData, error: userError } =
        await supabase.auth.getUser()

      if (userError || !userData?.user) {
        alert("Login required")
        return
      }

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("restaurant_id, role")
          .eq("id", userData.user.id)
          .single()

      if (profileError || !profile?.restaurant_id) {
        alert("Restaurant profile not found")
        return
      }

      const rid = profile.restaurant_id

      setRestaurantId(rid)

      await loadOrders(rid)
      await checkPOS(rid)
      await checkCaptain(rid)

      /*
       * Realtime order updates
       */
      return supabase
        .channel(`staff-orders-${rid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
            filter: `restaurant_id=eq.${rid}`
          },
          () => {
            loadOrders(rid)
          }
        )
        .subscribe()
    } catch (error) {
      console.error("STAFF INIT ERROR:", error)
    } finally {
      setLoading(false)
    }
  }

  async function checkPOS(rid) {
    try {
      const { data: plugin, error } =
        await supabase
          .from("restaurant_plugins")
          .select("enabled")
          .eq("restaurant_id", rid)
          .in("plugin_code", ["pos", "pos-core"])
          .eq("enabled", true)
          .limit(1)

      if (error) {
        console.error("POS PLUGIN ERROR:", error)
        setPosEnabled(false)
        return
      }

      setPosEnabled(Array.isArray(plugin) && plugin.length > 0)
    } catch (error) {
      console.error("POS CHECK ERROR:", error)
      setPosEnabled(false)
    }
  }


  async function checkCaptain(rid) {
    const { data, error } = await supabase
      .from("restaurant_plugins")
      .select("enabled")
      .eq("restaurant_id", rid)
      .eq("plugin_code", "captain-app")
      .eq("enabled", true)
      .maybeSingle()

    if (error) {
      console.error("CAPTAIN PLUGIN ERROR:", error)
      setCaptainEnabled(false)
      return
    }

    setCaptainEnabled(Boolean(data?.enabled))
  }

  async function loadOrders(id) {
    if (!id) return

    try {
      const { data: ordersData, error: ordersError } =
        await supabase
          .from("orders")
          .select("*")
          .eq("restaurant_id", id)
          .order("created_at", {
            ascending: false
          })

      if (ordersError) {
        console.error("ORDERS ERROR:", ordersError)
        return
      }

      const [
        { data: tables, error: tablesError },
        { data: rooms, error: roomsError }
      ] = await Promise.all([
        supabase
          .from("tables")
          .select("id, table_number")
          .eq("restaurant_id", id),

        supabase
          .from("rooms")
          .select("id, room_number")
          .eq("restaurant_id", id)
      ])

      if (tablesError) {
        console.error("TABLES ERROR:", tablesError)
      }

      if (roomsError) {
        console.error("ROOMS ERROR:", roomsError)
      }

      const tableMap = {}

      ;(tables || []).forEach((table) => {
        tableMap[table.id] = table.table_number
      })

      const roomMap = {}

      ;(rooms || []).forEach((room) => {
        roomMap[room.id] = room.room_number
      })

      const finalOrders = (ordersData || []).map((order) => ({
        ...order,

        display:
          order.source_type === "table"
            ? `🍽️ Table ${
                tableMap[order.source_id] || "-"
              }`
            : order.source_type === "room"
              ? `🛏️ Room ${
                  roomMap[order.source_id] || "-"
                }`
              : order.source_label || "Order"
      }))

      setOrders(finalOrders)
    } catch (error) {
      console.error("LOAD ORDERS ERROR:", error)
    }
  }

  async function updateStatus(order, newStatus) {
    if (!order?.id) return

    const { error } = await supabase
      .from("orders")
      .update({
        status: newStatus
      })
      .eq("id", order.id)
      .eq("restaurant_id", restaurantId)

    if (error) {
      console.error("STATUS UPDATE ERROR:", error)
      alert("❌ Unable to update order")
      return
    }

    /*
     * Immediate local update
     */
    setOrders((previous) =>
      previous.map((item) =>
        item.id === order.id
          ? {
              ...item,
              status: newStatus
            }
          : item
      )
    )
  }

  function handleTabChange(tab) {
    setActiveTab(tab)

    if (tab !== "orders") {
      setShowAllOrders(false)
    }
  }

  if (loading) {
    return (
      <div style={loadingPage}>
        <div style={loadingCard}>
          <div style={loadingIcon}>👨‍🍳</div>

          <h2 style={{ margin: "10px 0" }}>
            Loading Staff Panel...
          </h2>

          <p style={{ color: "var(--muted)", margin: 0 }}>
            Please wait
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={layout} className="staff-page">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <div style={header}>
        <div>
          <h1 style={title}>
            👨‍🍳 Staff Panel
          </h1>

          <p style={subtitle}>
            Manage orders and restaurant operations
          </p>
        </div>

        <div style={badge}>
          {orders.length} Orders
        </div>
      </div>

      {/* ======================================================
          TABS
      ====================================================== */}

      <div style={tabs}>

        <button
          onClick={() => handleTabChange("orders")}
          style={tabBtn(
            activeTab === "orders",
            "var(--info)"
          )}
        >
          📋 Orders
        </button>

        <button
          onClick={() => handleTabChange("take")}
          style={tabBtn(
            activeTab === "take",
            "var(--success)"
          )}
        >
          🛎️ Take Order
        </button>

        {posEnabled && (
          <button
            onClick={() => handleTabChange("pos")}
            style={tabBtn(
              activeTab === "pos",
              "var(--warning)"
            )}
          >
            💳 POS
          </button>
        )}

      </div>

      {/* ======================================================
          TAKE ORDER
      ====================================================== */}

      {activeTab === "take" && (
        <div style={sectionBox}>
          <OrderPage />
        </div>
      )}

      {/* ======================================================
          POS
      ====================================================== */}

      {activeTab === "pos" && posEnabled && (
        <POS
          restaurantId={restaurantId}
          onOrderCreated={() =>
            loadOrders(restaurantId)
          }
        />
      )}

      {/* ======================================================
          ORDERS
      ====================================================== */}

      {activeTab === "orders" && (
        <section>

          <div style={ordersHeader}>
            <div>
              <h2 style={sectionTitle}>
                📋 Recent Orders
              </h2>

              <p style={sectionSubtitle}>
                Showing latest orders first
              </p>
            </div>

            <div style={orderCounter}>
              {orders.length} Total
            </div>
          </div>

          {!orders.length ? (
            <div style={emptyBox}>
              <div style={emptyIcon}>
                🧾
              </div>

              <h3>No orders yet</h3>

              <p>
                New restaurant orders will appear here.
              </p>
            </div>
          ) : (
            <>
              <div style={grid}>

                {(showAllOrders
                  ? orders
                  : orders.slice(0, 5)
                ).map((order) => (
                  <div
                    key={order.id}
                    style={card}
                  >

                    <div style={topRow}>

                      <span style={orderId}>
                        #{String(order.id).slice(0, 6)}
                      </span>

                      <span style={time}>
                        {formatTime(order.created_at)}
                      </span>

                    </div>

                    <div style={tableBox}>
                      {order.display}
                    </div>

                    <div style={status(order.status)}>
                      {String(
                        order.status || "pending"
                      ).toUpperCase()}
                    </div>

                    <div style={actions}>

                      <button
                        onClick={() =>
                          updateStatus(
                            order,
                            "preparing"
                          )
                        }
                        style={btn("var(--info)")}
                      >
                        Preparing
                      </button>

                      <button
                        onClick={() =>
                          updateStatus(
                            order,
                            "ready"
                          )
                        }
                        style={btn("var(--success)")}
                      >
                        Ready
                      </button>

                      <button
                        onClick={() =>
                          updateStatus(
                            order,
                            "done"
                          )
                        }
                        style={btn("var(--muted)")}
                      >
                        Done
                      </button>

                    </div>

                  </div>
                ))}

              </div>

              {/* ==================================================
                  SHOW MORE / SHOW LESS
              ================================================== */}

              {orders.length > 5 && (
                <div style={showMoreWrap}>

                  <button
                    onClick={() =>
                      setShowAllOrders(
                        (previous) => !previous
                      )
                    }
                    style={showMoreBtn}
                  >
                    {showAllOrders
                      ? "▲ Show Less"
                      : `▼ Show More (${orders.length - 5})`}
                  </button>

                </div>
              )}

            </>
          )}

        </section>
      )}

    </div>
  )
}


/* ============================================================
   POS COMPONENT
============================================================ */

function POS({
  restaurantId,
  onOrderCreated
}) {

  const [menu, setMenu] = useState([])
  const [tables, setTables] = useState([])
  const [rooms, setRooms] = useState([])

  const [cart, setCart] = useState([])

  const [type, setType] = useState("table")
  const [selected, setSelected] = useState(null)

  const [loading, setLoading] = useState(true)
  const [placing, setPlacing] = useState(false)

  useEffect(() => {
    if (restaurantId) {
      load()
    }
  }, [restaurantId])

  async function load() {
    try {
      setLoading(true)

      const [
        { data: menuData, error: menuError },
        { data: tableData, error: tableError },
        { data: roomData, error: roomError }
      ] = await Promise.all([
        supabase
          .from("menu_items")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .order("name"),

        supabase
          .from("tables")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .order("table_number"),

        supabase
          .from("rooms")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .order("room_number")
      ])

      if (menuError) {
        console.error("MENU ERROR:", menuError)
      }

      if (tableError) {
        console.error("TABLE ERROR:", tableError)
      }

      if (roomError) {
        console.error("ROOM ERROR:", roomError)
      }

      setMenu(menuData || [])
      setTables(tableData || [])
      setRooms(roomData || [])

    } catch (error) {
      console.error("POS LOAD ERROR:", error)
    } finally {
      setLoading(false)
    }
  }

  function add(item) {
    setCart((previous) => {

      const existing = previous.find(
        (cartItem) =>
          cartItem.id === item.id
      )

      if (existing) {
        return previous.map((cartItem) =>
          cartItem.id === item.id
            ? {
                ...cartItem,
                qty: cartItem.qty + 1
              }
            : cartItem
        )
      }

      return [
        ...previous,
        {
          ...item,
          qty: 1
        }
      ]
    })
  }

  function qty(id, value) {
    setCart((previous) =>
      previous
        .map((item) =>
          item.id === id
            ? {
                ...item,
                qty: item.qty + value
              }
            : item
        )
        .filter((item) => item.qty > 0)
    )
  }

  function removeItem(id) {
    setCart((previous) =>
      previous.filter(
        (item) => item.id !== id
      )
    )
  }

  function changeType(nextType) {
    setType(nextType)
    setSelected(null)
  }

  async function place() {

    if (placing) return

    if (!selected) {
      alert("Select table/room")
      return
    }

    if (!cart.length) {
      alert("Cart is empty")
      return
    }

    try {
      setPlacing(true)

      const {
        data: sessionData,
        error: sessionError
      } = await supabase.auth.getSession()

      if (
        sessionError ||
        !sessionData?.session?.access_token
      ) {
        alert("Login required")
        return
      }

      const response = await fetch(
        "/api/pos/create",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            Authorization:
              `Bearer ${sessionData.session.access_token}`
          },

          body: JSON.stringify({
            restaurant_id: restaurantId,

            source_type: type,

            source_id: selected.id,

            items: cart.map((item) => ({
              item_id: item.id,
              quantity: item.qty
            }))
          })
        }
      )

      const result =
        await response.json()

      if (
        !response.ok ||
        !result.success
      ) {
        alert(
          `❌ ${
            result.error ||
            "Unable to generate bill"
          }`
        )

        return
      }

      alert("✅ Bill Generated")

      setCart([])
      setSelected(null)

      if (onOrderCreated) {
        await onOrderCreated()
      }

    } catch (error) {

      console.error(
        "POS BILL ERROR:",
        error
      )

      alert(
        `❌ ${
          error?.message ||
          "POS order failed"
        }`
      )

    } finally {
      setPlacing(false)
    }
  }

  const cartTotal = cart.reduce(
    (total, item) =>
      total +
      Number(item.price || 0) *
        Number(item.qty || 0),
    0
  )

  const availableSources =
    type === "table"
      ? tables
      : rooms

  if (loading) {
    return (
      <div style={posBox}>
        <div style={posLoading}>
          <div style={{ fontSize: 28 }}>
            💳
          </div>

          <h3>
            Loading POS...
          </h3>

          <p>
            Loading menu, tables and rooms
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={posBox}>

      {/* ======================================================
          POS HEADER
      ====================================================== */}

      <div style={posHeader}>

        <div>
          <h2 style={posTitle}>
            💳 Point of Sale
          </h2>

          <p style={posSubtitle}>
            Create a restaurant order
          </p>
        </div>

        <div style={cartBadge}>
          {cart.length} Items
        </div>

      </div>

      {/* ======================================================
          SOURCE TYPE
      ====================================================== */}

      <div style={tabs}>

        <button
          style={sourceBtn(
            type === "table",
            "var(--info)"
          )}
          onClick={() =>
            changeType("table")
          }
        >
          🍽️ Table
        </button>

        <button
          style={sourceBtn(
            type === "room",
            "#a855f7"
          )}
          onClick={() =>
            changeType("room")
          }
        >
          🛏️ Room
        </button>

      </div>

      {/* ======================================================
          SELECT TABLE / ROOM
      ====================================================== */}

      <div style={subSection}>

        <div style={subSectionHeader}>
          <div>
            <h3 style={subTitle}>
              {type === "table"
                ? "🍽️ Select Table"
                : "🛏️ Select Room"}
            </h3>

            <p style={subText}>
              Choose where this order belongs
            </p>
          </div>

          {selected && (
            <div style={selectedBadge}>
              Selected:{" "}
              {type === "table"
                ? `Table ${selected.table_number}`
                : `Room ${selected.room_number}`}
            </div>
          )}
        </div>

        {!availableSources.length ? (
          <div style={smallEmpty}>
            No{" "}
            {type === "table"
              ? "tables"
              : "rooms"}{" "}
            found.
          </div>
        ) : (
          <div style={selectWrap}>

            {availableSources.map(
              (item) => {

                const isSelected =
                  selected?.id === item.id

                return (
                  <button
                    key={item.id}
                    onClick={() =>
                      setSelected(item)
                    }
                    style={{
                      ...sourceSelectBtn,
                      background:
                        isSelected
                          ? "var(--success)"
                          : "rgba(255,255,255,.04)",

                      borderColor:
                        isSelected
                          ? "var(--success)"
                          : "rgba(255,255,255,.12)",

                      boxShadow:
                        isSelected
                          ? "0 8px 20px rgba(var(--success-rgb),.25)"
                          : "none"
                    }}
                  >
                    {type === "table"
                      ? `T${item.table_number}`
                      : `R${item.room_number}`}
                  </button>
                )
              }
            )}

          </div>
        )}

      </div>

      {/* ======================================================
          MENU
      ====================================================== */}

      <div style={subSection}>

        <div style={subSectionHeader}>
          <div>
            <h3 style={subTitle}>
              🍔 Menu
            </h3>

            <p style={subText}>
              Click an item to add it to the cart
            </p>
          </div>

          <div style={smallBadge}>
            {menu.length} Items
          </div>
        </div>

        {!menu.length ? (
          <div style={smallEmpty}>
            No menu items found.
          </div>
        ) : (
          <div style={menuGrid}>

            {menu.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => add(item)}
                style={menuCard}
              >

                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name || "Menu item"}
                    style={menuImage}
                  />
                ) : (
                  <div style={menuImagePlaceholder}>
                    🍽️
                  </div>
                )}

                <div style={menuCardContent}>

                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 15
                    }}
                  >
                    {item.name}
                  </div>

                  <div style={menuPrice}>
                    ₹{Number(item.price || 0)}
                  </div>

                </div>

                <div style={addLabel}>
                  + Add
                </div>

              </button>
            ))}

          </div>
        )}

      </div>

      {/* ======================================================
          CART
      ====================================================== */}

      <div style={cartBox}>

        <div style={cartHeader}>

          <div>
            <h3 style={subTitle}>
              🛒 Current Order
            </h3>

            <p style={subText}>
              {cart.length
                ? `${cart.length} menu items`
                : "No items added"}
            </p>
          </div>

          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => setCart([])}
              style={clearBtn}
            >
              Clear
            </button>
          )}

        </div>

        {!cart.length ? (
          <div style={cartEmpty}>
            <div style={{ fontSize: 34 }}>
              🛒
            </div>

            <p>
              Add items from the menu
            </p>
          </div>
        ) : (
          <div>

            {cart.map((item) => (
              <div
                key={item.id}
                style={cartItem}
              >

                <div style={cartItemInfo}>

                  <div
                    style={{
                      fontWeight: 700
                    }}
                  >
                    {item.name}
                  </div>

                  <div style={cartItemPrice}>
                    ₹
                    {Number(item.price || 0)}
                    {" × "}
                    {item.qty}
                  </div>

                </div>

                <div style={quantityControls}>

                  <button
                    type="button"
                    onClick={() =>
                      qty(item.id, -1)
                    }
                    style={qtyBtn}
                  >
                    −
                  </button>

                  <span style={qtyValue}>
                    {item.qty}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      qty(item.id, 1)
                    }
                    style={qtyBtn}
                  >
                    +
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      removeItem(item.id)
                    }
                    style={removeBtn}
                  >
                    ×
                  </button>

                </div>

              </div>
            ))}

            <div style={totalRow}>

              <span>
                Total
              </span>

              <strong>
                ₹{cartTotal.toFixed(0)}
              </strong>

            </div>

            <button
              type="button"
              style={{
                ...payBtn,

                opacity:
                  placing ? 0.6 : 1,

                cursor:
                  placing
                    ? "not-allowed"
                    : "pointer"
              }}
              onClick={place}
              disabled={placing}
            >
              {placing
                ? "Processing..."
                : "Generate Bill"}
            </button>

          </div>
        )}

      </div>

    </div>
  )
}


/* ============================================================
   HELPERS
============================================================ */

function formatTime(value) {
  if (!value) return "-"

  try {
    return formatIndiaTime(value)
  } catch {
    return "-"
  }
}


/* ============================================================
   PAGE STYLES
============================================================ */

const loadingPage = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background:
    "linear-gradient(135deg,var(--background),var(--surface-2),var(--background))",
  color: "var(--text)",
  padding: 20
}

const loadingCard = {
  width: "100%",
  maxWidth: 420,
  textAlign: "center",
  padding: 40,
  borderRadius: 24,
  background: "rgba(var(--surface-2-rgb),.8)",
  border:
    "1px solid rgba(var(--primary-rgb),.18)",
  boxShadow:
    "0 25px 60px rgba(0,0,0,.4)"
}

const loadingIcon = {
  fontSize: 42
}

const layout = {
  padding: 20,
  background:
    "linear-gradient(135deg,var(--background),var(--surface-2),var(--background))",
  color: "var(--text)",
  minHeight: "100vh"
}

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 15,
  marginBottom: 20,
  flexWrap: "wrap"
}

const title = {
  fontSize: 28,
  margin: 0
}

const subtitle = {
  margin: "6px 0 0",
  color: "var(--muted)",
  fontSize: 14
}

const badge = {
  background:
    "rgba(var(--success-rgb),.15)",
  color: "var(--success)",
  border:
    "1px solid rgba(var(--success-rgb),.35)",
  padding: "8px 14px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 700
}

const tabs = {
  display: "flex",
  gap: 10,
  marginBottom: 20,
  flexWrap: "wrap"
}

const tabBtn = (active, color) => ({
  padding: "11px 17px",
  borderRadius: 12,
  border:
    `1px solid ${
      active
        ? color
        : "rgba(255,255,255,.12)"
    }`,
  color:
    active
      ? color
      : "var(--muted)",
  background:
    active
      ? `${color}18`
      : "rgba(255,255,255,.03)",
  cursor: "pointer",
  fontWeight: 700
})

const sectionBox = {
  width: "100%"
}

const ordersHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 15,
  marginBottom: 15,
  flexWrap: "wrap"
}

const sectionTitle = {
  margin: 0,
  fontSize: 21
}

const sectionSubtitle = {
  margin: "5px 0 0",
  color: "var(--muted)",
  fontSize: 13
}

const orderCounter = {
  padding: "7px 12px",
  borderRadius: 999,
  background:
    "rgba(var(--info-rgb),.12)",
  border:
    "1px solid rgba(var(--info-rgb),.25)",
  color: "var(--info)",
  fontSize: 12,
  fontWeight: 700
}

const grid = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fill,minmax(240px,1fr))",
  gap: 15
}

const card = {
  background:
    "rgba(var(--surface-2-rgb),.72)",
  padding: 16,
  borderRadius: 16,
  border:
    "1px solid rgba(255,255,255,.10)",
  display: "flex",
  flexDirection: "column",
  gap: 11,
  boxShadow:
    "0 12px 30px rgba(0,0,0,.22)"
}

const topRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10
}

const orderId = {
  fontWeight: 800,
  fontSize: 14
}

const time = {
  fontSize: 11,
  color: "var(--muted)"
}

const tableBox = {
  fontSize: 15,
  fontWeight: 700,
  padding: "8px 10px",
  borderRadius: 10,
  background:
    "rgba(255,255,255,.04)"
}

const status = (s) => ({
  padding: "7px",
  borderRadius: 9,
  textAlign: "center",
  fontWeight: 800,
  fontSize: 12,
  background:
    s === "pending"
      ? "var(--warning)"
      : s === "preparing"
        ? "var(--info)"
        : s === "ready"
          ? "var(--success)"
          : "var(--muted)",
  color: "#000"
})

const actions = {
  display: "grid",
  gridTemplateColumns:
    "1fr 1fr 1fr",
  gap: 6
}

const btn = (color) => ({
  padding: 8,
  border:
    `1px solid ${color}`,
  color,
  borderRadius: 8,
  background: "transparent",
  fontSize: 11,
  cursor: "pointer",
  fontWeight: 700
})

const showMoreWrap = {
  display: "flex",
  justifyContent: "center",
  marginTop: 22
}

const showMoreBtn = {
  padding: "11px 22px",
  borderRadius: 12,
  border:
    "1px solid rgba(var(--info-rgb),.4)",
  background:
    "rgba(var(--info-rgb),.12)",
  color: "var(--info)",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 14
}

const emptyBox = {
  padding: 45,
  textAlign: "center",
  borderRadius: 20,
  background:
    "rgba(var(--surface-2-rgb),.65)",
  border:
    "1px solid rgba(255,255,255,.08)"
}

const emptyIcon = {
  fontSize: 40
}


/* ============================================================
   POS STYLES
============================================================ */

const posBox = {
  background:
    "rgba(var(--surface-2-rgb),.78)",
  padding: 20,
  borderRadius: 20,
  border:
    "1px solid rgba(var(--primary-rgb),.16)",
  boxShadow:
    "0 20px 45px rgba(0,0,0,.28)"
}

const posHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 15,
  marginBottom: 20,
  flexWrap: "wrap"
}

const posTitle = {
  margin: 0,
  fontSize: 23
}

const posSubtitle = {
  margin: "5px 0 0",
  color: "var(--muted)",
  fontSize: 13
}

const cartBadge = {
  padding: "7px 12px",
  borderRadius: 999,
  background:
    "rgba(var(--warning-rgb),.12)",
  border:
    "1px solid rgba(var(--warning-rgb),.3)",
  color: "var(--primary)",
  fontSize: 12,
  fontWeight: 700
}

const sourceBtn = (active, color) => ({
  padding: "10px 16px",
  borderRadius: 11,
  border:
    `1px solid ${
      active
        ? color
        : "rgba(255,255,255,.12)"
    }`,
  background:
    active
      ? `${color}18`
      : "rgba(255,255,255,.03)",
  color:
    active
      ? color
      : "var(--muted)",
  cursor: "pointer",
  fontWeight: 700
})

const subSection = {
  marginTop: 18,
  padding: 18,
  borderRadius: 18,
  background:
    "rgba(255,255,255,.025)",
  border:
    "1px solid rgba(255,255,255,.07)"
}

const subSectionHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap"
}

const subTitle = {
  margin: 0,
  fontSize: 17
}

const subText = {
  margin: "4px 0 0",
  color: "var(--muted)",
  fontSize: 12
}

const selectedBadge = {
  padding: "7px 11px",
  borderRadius: 999,
  background:
    "rgba(var(--success-rgb),.12)",
  border:
    "1px solid rgba(var(--success-rgb),.25)",
  color: "var(--success)",
  fontSize: 12,
  fontWeight: 700
}

const selectWrap = {
  display: "flex",
  gap: 9,
  flexWrap: "wrap"
}

const sourceSelectBtn = {
  minWidth: 55,
  padding: "9px 13px",
  borderRadius: 10,
  border:
    "1px solid rgba(255,255,255,.12)",
  color: "var(--text)",
  cursor: "pointer",
  fontWeight: 700
}

const smallBadge = {
  padding: "6px 10px",
  borderRadius: 999,
  background:
    "rgba(255,255,255,.05)",
  color: "var(--muted)",
  fontSize: 11
}

const smallEmpty = {
  padding: 20,
  textAlign: "center",
  borderRadius: 12,
  background:
    "rgba(255,255,255,.03)",
  color: "var(--muted)"
}

const menuGrid = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fill,minmax(190px,1fr))",
  gap: 13
}

const menuCard = {
  position: "relative",
  textAlign: "left",
  padding: 0,
  overflow: "hidden",
  borderRadius: 14,
  border:
    "1px solid rgba(255,255,255,.09)",
  background:
    "rgba(255,255,255,.04)",
  color: "var(--text)",
  cursor: "pointer"
}

const menuImage = {
  width: "100%",
  height: 130,
  objectFit: "cover",
  display: "block"
}

const menuImagePlaceholder = {
  width: "100%",
  height: 130,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background:
    "rgba(255,255,255,.04)",
  fontSize: 35
}

const menuCardContent = {
  padding: "11px 12px 4px"
}

const menuPrice = {
  marginTop: 5,
  color: "var(--success)",
  fontWeight: 800
}

const addLabel = {
  padding: "7px 12px 11px",
  color: "var(--muted)",
  fontSize: 11,
  fontWeight: 700
}

const cartBox = {
  marginTop: 18,
  padding: 18,
  borderRadius: 18,
  background:
    "rgba(var(--background-rgb),.55)",
  border:
    "1px solid rgba(var(--primary-rgb),.14)"
}

const cartHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 14
}

const clearBtn = {
  padding: "7px 11px",
  borderRadius: 9,
  border:
    "1px solid rgba(var(--danger-rgb),.3)",
  background:
    "rgba(var(--danger-rgb),.08)",
  color: "var(--danger)",
  cursor: "pointer",
  fontWeight: 700
}

const cartEmpty = {
  padding: 30,
  textAlign: "center",
  color: "var(--muted)",
  borderRadius: 13,
  background:
    "rgba(255,255,255,.025)"
}

const cartItem = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "12px 0",
  borderBottom:
    "1px solid rgba(255,255,255,.07)"
}

const cartItemInfo = {
  minWidth: 0
}

const cartItemPrice = {
  marginTop: 4,
  fontSize: 12,
  color: "var(--muted)"
}

const quantityControls = {
  display: "flex",
  alignItems: "center",
  gap: 6
}

const qtyBtn = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border:
    "1px solid rgba(255,255,255,.12)",
  background:
    "rgba(255,255,255,.05)",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 17
}

const qtyValue = {
  minWidth: 25,
  textAlign: "center",
  fontWeight: 700
}

const removeBtn = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border:
    "1px solid rgba(var(--danger-rgb),.3)",
  background:
    "rgba(var(--danger-rgb),.08)",
  color: "var(--danger)",
  cursor: "pointer",
  fontSize: 18
}

const totalRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 18,
  paddingTop: 15,
  borderTop:
    "1px solid rgba(255,255,255,.08)",
  fontSize: 18
}

const payBtn = {
  marginTop: 14,
  padding: 13,
  background:
    "linear-gradient(135deg,var(--success),var(--success))",
  border: "none",
  borderRadius: 11,
  color: "var(--text)",
  width: "100%",
  fontWeight: 800,
  fontSize: 15
}

const posLoading = {
  padding: 50,
  textAlign: "center",
  color: "var(--muted)"
}