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
  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState("All")
  const [restaurantId, setRestaurantId] = useState(null)
  const [restaurantName, setRestaurantName] = useState("")
  
  const [openSelect, setOpenSelect] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => { init() }, [])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  useEffect(() => {
    if (tables.length || rooms.length) autoQR()
  }, [tables, rooms])

  // 🔥 INIT
  async function init() {

    if (slug) {
      const { data: rest } = await supabase
        .from("restaurants")
        .select("*")
        .eq("slug", slug)
        .maybeSingle()

      if (!rest) return alert("Restaurant not found")

      setRestaurantId(rest.id)
      setRestaurantName(rest.name)
      fetchAll(rest.id)
      return
    }

    const rid = params.get("rid")

    if (rid) {
      setRestaurantId(rid)
      fetchAll(rid)
      return
    }

    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) return

    const { data: profile } = await supabase
      .from("profiles")
      .select("restaurant_id")
      .eq("id", userData.user.id)
      .single()

    setRestaurantId(profile.restaurant_id)
    fetchAll(profile.restaurant_id)
  }

  async function fetchAll(rid) {
    const [
      { data: m },
      { data: t },
      { data: r },
      { data: g },
      { data: mods },
      { data: links }
    ] = await Promise.all([
      supabase.from("menu_items").select("*").eq("restaurant_id", rid),
      supabase.from("tables").select("*").eq("restaurant_id", rid),
      supabase.from("rooms").select("*").eq("restaurant_id", rid),
      supabase.from("modifier_groups").select("*").eq("restaurant_id", rid).eq("active", true).order("created_at"),
      supabase.from("modifiers").select("*").eq("restaurant_id", rid).eq("active", true).order("created_at"),
      supabase.from("menu_item_modifier_groups").select("menu_item_id,modifier_group_id").eq("restaurant_id", rid)
    ])

    setMenu(m || [])
    setTables(t || [])
    setRooms(r || [])
    setModifierGroups(g || [])
    setModifiers(mods || [])
    setModifierLinks(links || [])
  }

  function autoQR() {

    if (typeParam && idParam) {

      setType(typeParam)

      const list = typeParam === "table" ? tables : rooms

      const found = list.find(i =>
        typeParam === "table"
          ? String(i.table_number) === String(idParam) || String(i.id) === String(idParam)
          : String(i.room_number) === String(idParam) || String(i.id) === String(idParam)
      )

      if (found) setSelected(found)
      return
    }

    const qrType = params.get("type")
    const qrId = params.get("id")

    if (!qrType || !qrId) return

    setType(qrType)

    const list = qrType === "table" ? tables : rooms

    const found = list.find(i =>
      qrType === "table"
        ? String(i.table_number) === qrId || String(i.id) === qrId
        : String(i.room_number) === qrId || String(i.id) === qrId
    )

    if (found) setSelected(found)
  }

  function itemGroups(item) {
    const ids = modifierLinks.filter(l => l.menu_item_id === item.id).map(l => l.modifier_group_id)
    return modifierGroups.filter(g => ids.includes(g.id))
  }

  function addToCart(item) {
    const groups = itemGroups(item)
    if (groups.length) {
      setModifierItem(item)
      const initial = {}
      groups.forEach(g => { initial[g.id] = [] })
      setModifierSelection(initial)
      return
    }
    addConfiguredItem(item, [])
  }

  function addConfiguredItem(item, selectedModifiers) {
    const modifierTotal = selectedModifiers.reduce((sum, m) => sum + Number(m.price || 0) * Number(m.quantity || 1), 0)
    const key = `${item.id}:${selectedModifiers.map(m => m.id).sort().join(",") || "base"}`
    setCart(prev => {
      const exist = prev.find(i => i.cartKey === key)
      if (exist) return prev.map(i => i.cartKey === key ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { ...item, qty: 1, cartKey: key, selectedModifiers, modifierTotal }]
    })
  }

  function confirmModifiers() {
    if (!modifierItem) return
    const groups = itemGroups(modifierItem)
    for (const g of groups) {
      const chosen = modifierSelection[g.id] || []
      if (g.required && !chosen.length) {
        alert(`Please choose an option from ${g.name}`)
        return
      }
    }
    const chosen = Object.values(modifierSelection).flat()
    addConfiguredItem(modifierItem, chosen)
    setModifierItem(null)
    setModifierSelection({})
  }

  function toggleModifier(group, modifier) {
    setModifierSelection(prev => {
      const current = prev[group.id] || []
      if (group.selection_type === "single") {
        return { ...prev, [group.id]: [modifier] }
      }
      const exists = current.some(m => m.id === modifier.id)
      return { ...prev, [group.id]: exists ? current.filter(m => m.id !== modifier.id) : [...current, modifier] }
    })
  }

  function updateQty(cartKey, change) {
    setCart(prev => prev.flatMap(item => {
      if (item.cartKey !== cartKey) return item
      const qty = item.qty + change
      return qty <= 0 ? [] : { ...item, qty }
    }))
  }

  function removeItem(cartKey) {
    setCart(prev => prev.filter(item => item.cartKey !== cartKey))
  }
  

  function comboDisplayName(item) {
    if (item?.item_type !== "combo") return item?.name || "Item"
    const cfg = item?.combo_config || {}
    const ids = cfg.mode === "fixed" ? (cfg.items || []).map(x => x.item_id) : []
    const names = ids.map(id => menu.find(m => m.id === id)?.name).filter(Boolean)
    return names.length ? `${item.name} [${names.join(", ")}]` : item.name
  }

  // 🚀 FIXED PLACE ORDER
  async function placeOrder() {

    if (!selected) return alert("Select table/room")
    if (!restaurantId) return alert("Restaurant missing")
    if (cart.length === 0) return alert("Cart empty")

    console.log("DEBUG:", { selected, restaurantId, cart })

    const { data: order, error } = await supabase
      .from("orders")
      .insert([{
        source_type: type,
        source_id: selected.id,
        source_label:
          type === "table"
            ? `Table ${selected.table_number}`
            : `Room ${selected.room_number}`,
        restaurant_id: restaurantId,
        status: "pending"
      }])
      .select()
      .single()

    // 🔥 MAIN FIX
    if (error || !order) {
      console.log("ORDER ERROR:", error)
      alert("❌ Order failed (RLS issue)")
      return
    }

    for (const cartItem of cart) {
      const { data: orderItem, error: itemError } = await supabase
        .from("order_items")
        .insert([{
          order_id: order.id,
          item_id: cartItem.id,
          quantity: cartItem.qty,
          item_name: comboDisplayName(cartItem),
          unit_price: Number(cartItem.price || 0),
          line_total: Number(cartItem.price || 0) * Number(cartItem.qty || 0)
        }])
        .select("id")
        .single()

      if (itemError || !orderItem) {
        console.log("ITEM ERROR:", itemError)
        alert("❌ Items failed")
        return
      }

      if (cartItem.selectedModifiers?.length) {
        const modifierRows = cartItem.selectedModifiers.map(m => ({
          order_item_id: orderItem.id,
          modifier_id: m.id,
          modifier_name: m.name,
          price: Number(m.price || 0),
          quantity: Number(m.quantity || 1)
        }))
        const { error: modError } = await supabase.from("order_item_modifiers").insert(modifierRows)
        if (modError) {
          console.log("MODIFIER ERROR:", modError)
          alert("❌ Modifier save failed")
          return
        }
      }
    }

    alert("✅ Order placed")
    setCart([])
  }

  const groupedMenu = menu.reduce((acc, item) => {
    const cat = String(item.category || "Other").trim() || "Other"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  const categories = Object.keys(groupedMenu)

  useEffect(() => {
    if (categories.length && activeCategory !== "All" && !categories.includes(activeCategory)) {
      setActiveCategory(categories[0])
    }
  }, [menu.length, activeCategory])

  const visibleItems = activeCategory === "All"
    ? menu
    : (groupedMenu[activeCategory] || [])

  return (
  <div style={getLayout(isMobile)} className="order-page">

    <div
      style={{
        gridColumn:"1 / -1",
        marginBottom:10
      }}
    >
      <h1
  style={{
    margin:0,
    fontSize:34,
    fontWeight:"800",
    color:"var(--primary)"
  }}
>
  {restaurantName}
</h1>

      <div
        style={{
          color:"var(--muted)",
          marginTop:4
        }}
      >
        Premium Dining Experience
      </div>
    </div>

    <div style={{...glass, ...panel}}>
      <h3>🔘 Select</h3>
        <div style={{display:"flex", gap:10}}>
          <button style={tabBtn(type==="table","var(--info)")} onClick={()=>setType("table")}>Table</button>
          <button style={tabBtn(type==="room","#a855f7")} onClick={()=>setType("room")}>Room</button>
        </div>

        <button style={selectBtn} onClick={()=>setOpenSelect(!openSelect)}>
          {selected
            ? (type==="table"
                ? `🍽️ Table ${selected.table_number}`
                : `🛏️ Room ${selected.room_number}`)
            : "Select Table / Room"}
        </button>

        {openSelect && (
          <div style={dropdown}>
            {(type==="table"?tables:rooms).map(item=>(
              <div key={item.id}
                onClick={()=>{setSelected(item); setOpenSelect(false)}}
                style={dropdownItem}>
                {type==="table"
                  ? `🍽️ Table ${item.table_number}`
                  : `🛏️ Room ${item.room_number}`}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{...glass, ...menuBox}}>
        <div style={categoryHeader}>
          <div>
            <div style={categoryEyebrow}>MENU</div>
            <h2 style={{margin:"3px 0 0",fontSize:isMobile ? 20 : 24}}>
              Choose your food
            </h2>
          </div>
          <span style={categoryCount}>{visibleItems.length} items</span>
        </div>

        <div className="order-category-tabs" style={categoryTabs}>
          {categories.map(cat => (
            <button
              type="button"
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                ...categoryTab,
                ...(activeCategory === cat ? categoryTabActive : {})
              }}
            >
              {cat}
              <span style={{
                ...categoryTabCount,
                ...(activeCategory === cat ? categoryTabCountActive : {})
              }}>
                {groupedMenu[cat].length}
              </span>
            </button>
          ))}
        </div>

        <div style={categoryTitle}>
          <span>{activeCategory === "All" ? "All Items" : activeCategory}</span>
          <small>Tap to add</small>
        </div>

        <div style={getGrid(isMobile)}>
          {visibleItems.map(item => (
            <button
              type="button"
              className="order-menu-card"
              key={item.id}
              style={menuCard}
              onClick={() => addToCart(item)}
            >
              <img src={item.image} alt={item.name} style={imageStyle}/>
              <span className="order-item-name" style={itemName}>{item.name}</span>
              <span className="order-item-price" style={itemPrice}>
                ₹{Number(item.price || 0).toLocaleString("en-IN")}
              </span>
            </button>
          ))}
        </div>

        {!visibleItems.length && <div style={emptyMenu}>No items in this category.</div>}
      </div>

      <div style={{...glass, ...panel}}>
        <div
  style={{
    marginBottom:16,
    padding:14,
    borderRadius:14,
    background:"rgba(255,255,255,.04)",
    border:"1px solid rgba(var(--primary-rgb),.15)"
  }}
>
  <div style={{color:"var(--muted)"}}>
    Total
  </div>

  <div
    style={{
      color:"var(--primary)",
      fontSize:28,
      fontWeight:"bold"
    }}
  >
    ₹{cart.reduce((t,i)=>t+(Number(i.price||0)+Number(i.modifierTotal||0))*i.qty,0)}
  </div>
</div>
        <button style={placeBtn} onClick={placeOrder}>
          🚀 Place Order
        </button>

        {cart.map(item=>(
          <div key={item.cartKey} style={cartItem}>
            <div>
              <b>{item.name}</b>
              {item.selectedModifiers?.length > 0 && (
                <div style={{fontSize:11,color:"var(--muted)",marginTop:3}}>
                  + {item.selectedModifiers.map(m=>m.name).join(", ")}
                </div>
              )}
            </div>
            <div
  style={{
    display:"flex",
    alignItems:"center",
    gap:6
  }}
>
  <button
    onClick={() => removeItem(item.cartKey)}
    style={{
      background:"var(--danger)",
      color:"#fff",
      border:"none",
      borderRadius:6,
      padding:"4px 8px",
      cursor:"pointer"
    }}
  >
    🗑️
  </button>

  <button onClick={()=>updateQty(item.cartKey,-1)}>
    -
  </button>

  {item.qty}

  <button onClick={()=>updateQty(item.cartKey,1)}>
    +
  </button>
</div>
          </div>
        ))}
      </div>

      {modifierItem && (
        <div style={modalBackdrop} onClick={() => setModifierItem(null)}>
          <div style={modifierModal} onClick={e => e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",gap:15,alignItems:"center"}}>
              <div>
                <div style={{color:"var(--primary)",fontSize:11,fontWeight:900,letterSpacing:1.5}}>CUSTOMIZE ITEM</div>
                <h2 style={{margin:"5px 0"}}>{modifierItem.name}</h2>
                <p style={{margin:0,color:"var(--muted)",fontSize:13}}>Choose your options before adding to the order.</p>
              </div>
              <button style={closeBtn} onClick={() => setModifierItem(null)}>✕</button>
            </div>
            <div style={{display:"grid",gap:14,marginTop:18}}>
              {itemGroups(modifierItem).map(group => (
                <div key={group.id} style={modifierGroupBox}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:10}}>
                    <b>{group.name}</b><small>{group.required ? "Required" : "Optional"}</small>
                  </div>
                  <div style={{display:"grid",gap:7,marginTop:9}}>
                    {modifiers.filter(m => m.group_id === group.id).map(m => {
                      const chosen = (modifierSelection[group.id] || []).some(x => x.id === m.id)
                      return (
                        <button type="button" key={m.id} onClick={() => toggleModifier(group,m)} style={{...modifierChoice, ...(chosen ? modifierChoiceActive : {})}}>
                          <span>{chosen ? "✓" : "○"} {m.name}</span><strong>+₹{Number(m.price||0).toLocaleString("en-IN")}</strong>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <button style={{...placeBtn,width:"100%",marginTop:18}} onClick={confirmModifiers}>Add to Order</button>
          </div>
        </div>
      )}

    </div>
  )
}

/* styles same */
/* STYLES */

const modalBackdrop = { position:"fixed", inset:0, zIndex:9999, display:"grid", placeItems:"center", padding:18, background:"rgba(0,0,0,.68)", backdropFilter:"blur(8px)" }
const modifierModal = { width:"min(100%,560px)", maxHeight:"90vh", overflowY:"auto", padding:22, borderRadius:26, background:"linear-gradient(145deg,#0b2118,#102b20)", border:"1px solid rgba(var(--primary-rgb),.24)", boxShadow:"0 35px 100px rgba(0,0,0,.55)", color:"#fff" }
const closeBtn = { width:38,height:38,borderRadius:12,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.04)",color:"#fff",cursor:"pointer" }
const modifierGroupBox = { padding:14,borderRadius:18,background:"rgba(255,255,255,.035)",border:"1px solid rgba(255,255,255,.07)" }
const modifierChoice = { display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,width:"100%",padding:"11px 12px",borderRadius:12,border:"1px solid rgba(255,255,255,.08)",background:"rgba(255,255,255,.025)",color:"#fff",cursor:"pointer",textAlign:"left" }
const modifierChoiceActive = { background:"rgba(var(--primary-rgb),.12)",borderColor:"rgba(var(--primary-rgb),.35)",color:"var(--primary)" }

const glass = {
  background:"rgba(var(--surface-2-rgb),.85)",
  border:"1px solid rgba(var(--primary-rgb),.15)",
  backdropFilter:"blur(20px)",
  borderRadius:24,
  boxShadow:"0 25px 60px rgba(0,0,0,.45)"
}

const getLayout = (isMobile) => ({
  display:"grid",
  gridTemplateColumns: isMobile ? "1fr" : "260px 1fr 300px",

  minHeight:"100vh",
  alignItems:"start",

  gap:12,
  padding:12,

  background:"linear-gradient(135deg,var(--background),var(--surface-2),var(--background))",
  color:"#fff"
})

const panel = {
  padding:16,
  position:"sticky",
  top:12,
  height:"fit-content"
}
const menuBox = { padding:16 }

const getGrid = (isMobile) => ({
  display:"grid",
  gridTemplateColumns: isMobile ? "repeat(3,minmax(0,1fr))" : "repeat(auto-fill,minmax(150px,1fr))",
  gap:8
})

const categoryHeader = {
  display:"flex",
  alignItems:"center",
  justifyContent:"space-between",
  gap:12,
  marginBottom:10
}

const categoryEyebrow = {
  color:"var(--primary)",
  fontSize:10,
  fontWeight:900,
  letterSpacing:1.5
}

const categoryCount = {
  color:"var(--muted)",
  fontSize:12,
  fontWeight:700
}

const categoryTabs = {
  display:"flex",
  gap:8,
  overflowX:"auto",
  padding:"3px 2px 10px",
  marginBottom:4,
  scrollbarWidth:"thin",
  WebkitOverflowScrolling:"touch"
}

const categoryTab = {
  flex:"0 0 auto",
  display:"inline-flex",
  alignItems:"center",
  gap:7,
  border:"1px solid rgba(var(--primary-rgb),.18)",
  background:"rgba(255,255,255,.04)",
  color:"#fff",
  borderRadius:999,
  padding:"8px 11px",
  fontSize:12,
  fontWeight:800,
  cursor:"pointer",
  whiteSpace:"nowrap"
}

const categoryTabActive = {
  background:"rgba(var(--primary-rgb),.14)",
  borderColor:"var(--primary)",
  color:"var(--primary)"
}

const categoryTabCount = {
  minWidth:18,
  height:18,
  display:"inline-grid",
  placeItems:"center",
  borderRadius:999,
  background:"rgba(255,255,255,.08)",
  color:"var(--muted)",
  fontSize:10
}

const categoryTabCountActive = {
  background:"var(--primary)",
  color:"#111"
}

const categoryTitle = {
  display:"flex",
  alignItems:"baseline",
  justifyContent:"space-between",
  gap:8,
  margin:"4px 0 10px",
  color:"#fff",
  fontWeight:900
}

const itemName = {
  display:"block",
  marginTop:7,
  fontSize:13,
  fontWeight:800,
  lineHeight:1.2,
  overflow:"hidden",
  textOverflow:"ellipsis",
  whiteSpace:"nowrap"
}

const itemPrice = {
  display:"block",
  marginTop:4,
  color:"var(--primary)",
  fontSize:13,
  fontWeight:900
}

const emptyMenu = {
  padding:"35px 12px",
  textAlign:"center",
  color:"var(--muted)"
}

const menuCard = {
  appearance:"none",
  width:"100%",
  minWidth:0,
  padding:7,
  borderRadius:16,
  background:"rgba(255,255,255,.05)",
  border:"1px solid rgba(var(--primary-rgb),.15)",
  backdropFilter:"blur(16px)",
  boxShadow:"0 15px 35px rgba(0,0,0,.35)",
  color:"#fff",
  textAlign:"left",
  cursor:"pointer",
  transition:"transform .18s ease, border-color .18s ease, background .18s ease"
}


const imageStyle = {
  display:"block",
  width:"100%",
  aspectRatio:"1 / 1",
  height:"auto",
  objectFit:"cover",
  borderRadius:12
}

const searchBox = {
  padding:10,
  borderRadius:10,
  background:"rgba(255,255,255,0.05)",
  border:"1px solid rgba(255,255,255,0.2)",
  color:"#fff"
}

const selectBtn = {
  marginTop:15,
  padding:"12px",
  width:"100%",
  borderRadius:12,
  background:"rgba(255,255,255,0.05)",
  border:"1px solid rgba(255,255,255,0.2)",
  color:"#fff"
}

const dropdown = {
  marginTop:10,
  maxHeight:200,
  overflowY:"auto",
  borderRadius:12,
  background:"rgba(0,0,0,0.4)"
}

const dropdownItem = {
  padding:"10px",
  cursor:"pointer"
}

const cartItem = {
  display:"flex",
  justifyContent:"space-between",
  marginTop:10
}

const tabBtn = (active,color)=>({
  flex:1,
  padding:"10px",
  borderRadius:12,
  background:"rgba(255,255,255,0.03)",
  border:`1px solid ${active?color:"rgba(255,255,255,0.2)"}`,
  color: active ? color : "#fff",
  boxShadow: active ? `0 0 8px ${color}` : "none"
})

const placeBtn = {
  width:"100%",
  padding:"16px",
  borderRadius:16,

  background:
    "linear-gradient(135deg,var(--surface),var(--surface-2))",

  border:
    "1px solid rgba(var(--primary-rgb),.35)",

  color:"#fff",

  fontWeight:"700",
  fontSize:16,

  boxShadow:
    "0 20px 40px rgba(0,0,0,.4)"
}