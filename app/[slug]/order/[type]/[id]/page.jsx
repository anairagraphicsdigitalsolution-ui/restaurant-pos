"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { applyTheme, DEFAULT_THEME, BRAND_THEMES, useTheme } from "@/components/ThemeProvider"

export default function OrderPage() {

  const params = useParams()
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

function getComboUnitPrice(item, selection = []) {
  const base = Number(item?.comboBasePrice ?? item?.price ?? 0)
  if (item?.item_type !== "combo") return base
  const options = item?.combo_config?.groups?.[0]?.options || []
  const selectedIds = new Set((selection || []).map(row => typeof row === "string" ? row : row?.item_id).filter(Boolean))
  return base + options.reduce((sum, option) => selectedIds.has(option.item_id) ? sum + Number(option.price_delta || 0) : sum, 0)
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

useEffect(() => {
  if (slug && type && id) init()
}, [slug, type, id])

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

  // 🚀 PLACE ORDER
  async function placeOrder() {

    if (!selected) return alert("Select table/room")
    if (!restaurant) return alert("Restaurant missing")
    if (!cart.length) return alert("Cart empty")

    try {
      const response = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          source_type: type,
          source_id: selected.id,
          overall_note: orderNote,
          customer_name: customerName.trim() || null,
          customer_phone: customerPhone.replace(/\D/g, "").slice(0, 15) || null,
          offer_id: activeOffer?.id || null,
          items: cart.map(i => ({
            item_id: i.id,
            quantity: i.qty,
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
    let eligibleSubtotal = subtotal

    if (targetType === "products") {
      const ids = new Set((o.offer_products || []).map(x => x.menu_item_id))
      eligibleSubtotal = cart.reduce((sum, item) => ids.has(item.id) ? sum + getComboUnitPrice(item, item.combo_selection || []) * Number(item.qty || 0) : sum, 0)
    } else if (targetType === "category") {
      eligibleSubtotal = cart.reduce((sum, item) => item.category === o.target_category ? sum + getComboUnitPrice(item, item.combo_selection || []) * Number(item.qty || 0) : sum, 0)
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

    ⭐ 5.0

    <span>•</span>

    Premium Dining

    <span>•</span>

    20 Min

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

    const cartItem =
      cart.find(i => i.id === item.id)

    return (

      <div
        key={item.id}
        style={card}
  onClick={() => openFood(item)}
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
      updateQty(item.id,-1)
    }}
  >
    −
  </button>

  <span>{cartItem.qty}</span>

  <button
    type="button"
    style={qtyBtn}
    onClick={(e)=>{
      e.stopPropagation()
      updateQty(item.id,1)
    }}
  >
    +
  </button>

</div>

) : (

<button
  type="button"
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

key={item.id}

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
              i.id === item.id
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
          i.id === item.id
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

{item.name}

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
            placeholder="Your name"
            style={{width:"100%",boxSizing:"border-box",padding:"12px 13px",borderRadius:12,border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text)"}}
          />
          <input
            value={customerPhone}
            onChange={e=>setCustomerPhone(e.target.value.replace(/[^0-9+ ]/g,"").slice(0,18))}
            placeholder="WhatsApp number"
            inputMode="tel"
            style={{width:"100%",boxSizing:"border-box",padding:"12px 13px",borderRadius:12,border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text)"}}
          />
        </div>
        <div style={{fontSize:11,color:"var(--muted)",marginBottom:10}}>
          Enter your WhatsApp number to receive order confirmation. To send the order from your own WhatsApp to the restaurant, WhatsApp requires your confirmation/tap.
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

        ⭐ 4.9

        <span>•</span>

        20 mins

        <span>•</span>

        Chef Special

      </div>

      <div style={modalPrice}>
        ₹{getComboUnitPrice(selectedFood, comboSelection).toFixed(2)}
      </div>

      {selectedFood.item_type === "combo" && (selectedFood.combo_config?.mode === "fixed" ? (
        <div style={comboModalBox}>
          <b>🍱 Included in this combo</b>
          <div style={{display:"grid",gap:7,marginTop:10}}>
            {(selectedFood.combo_config?.items || []).map(row => {
              const component = menu.find(m => m.id === row.item_id)
              return <div key={row.item_id} style={comboLine}>✓ {row.quantity || 1} × {component?.name || "Item"}</div>
            })}
          </div>
        </div>
      ) : (
        <div style={comboModalBox}>
          <div style={{display:"flex",justifyContent:"space-between",gap:10}}><b>🍱 {selectedFood.combo_config?.groups?.[0]?.name || "Choose your option"}</b><small>{selectedFood.combo_config?.groups?.[0]?.min || 1}-{selectedFood.combo_config?.groups?.[0]?.max || 1}</small></div>
          <div style={{display:"grid",gap:8,marginTop:10}}>
            {(selectedFood.combo_config?.groups?.[0]?.options || []).map(option => {
              const component = menu.find(m => m.id === option.item_id)
              const chosen = comboSelection.includes(option.item_id)
              return <button type="button" key={option.item_id} onClick={() => { const max=Number(selectedFood.combo_config?.groups?.[0]?.max || 1); setComboSelection(prev => prev.includes(option.item_id) ? prev.filter(id=>id!==option.item_id) : (prev.length>=max ? prev : [...prev,option.item_id])) }} style={{...comboChoice, ...(chosen ? comboChoiceActive : {})}}><span>{chosen ? "✓" : "○"} {component?.name || "Item"}</span><span>{Number(option.price_delta || 0) > 0 ? `+₹${Number(option.price_delta).toFixed(2)}` : Number(option.price_delta || 0) < 0 ? `−₹${Math.abs(Number(option.price_delta)).toFixed(2)}` : "Included"}</span></button>
            })}
          </div>
        </div>
      ))}

      <div style={modalQtyBox}>

  <button
    type="button"
    className="qr-qty-btn qr-modal-qty-btn"
    style={qtyBtn}
    onClick={()=>{
      if(modalQty>1){
        setModalQty(modalQty-1)
      }
    }}
  >
    −
  </button>

  <div
    style={{
      fontSize:20,
      fontWeight:700,
      minWidth:40,
      textAlign:"center"
    }}
  >
    {modalQty}
  </div>

  <button
    type="button"
    className="qr-qty-btn qr-modal-qty-btn"
    style={qtyBtn}
    onClick={()=>setModalQty(modalQty+1)}
  >
    +
  </button>

</div>

      


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

      <button
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
    const comboSelectionRows = comboSelection.map(id => ({ item_id: id }))
    const configuredPrice = getComboUnitPrice(selectedFood, comboSelectionRows)
    addToCart({
      ...selectedFood,
      qty:modalQty,
      price: configuredPrice,
      comboBasePrice: Number(selectedFood.price || 0),
      cooking_request:modalRequest,
      combo_selection:comboSelectionRows,
      cartKey: `${selectedFood.id}:combo:${comboSelection.slice().sort().join(",") || "base"}`
    })
    setShowFoodModal(false)
    setModalQty(1)
    setModalRequest("")
    setComboSelection([])
    setSelectedFood(null)

  }}
>

  Add To Cart • ₹{(getComboUnitPrice(selectedFood, comboSelection) * modalQty).toFixed(2)}

</button>

    </div>

  </div>

</div>

)}

      <div className="qr-branding-footer">
        <img src="/anaira-branding.png" alt="Anaira Graphics" />
        <span>Powered by Anaira Graphics</span>
      </div>

<style jsx global>{`

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
`}</style>

</div>
)
}

/* STYLES */

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

