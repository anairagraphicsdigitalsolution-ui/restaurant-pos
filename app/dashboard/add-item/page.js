"use client"

import { useEffect, useState } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { useAuth } from "@/components/AuthProvider"

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  height: 48,
  padding: "0 14px",
  borderRadius: 13,
  border: "1px solid rgba(var(--primary-rgb),.16)",
  background: "var(--surface-2)",
  color: "var(--text)",
  outline: "none",
  fontSize: 13,
  fontWeight: 650,
}

export default function AddItem() {
  const { restaurantId, loading: authLoading } = useAuth()
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [category, setCategory] = useState("")
  const [categories, setCategories] = useState([])
  const [newCategory, setNewCategory] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [variants, setVariants] = useState([])

  useEffect(() => {
    if (!restaurantId) return
    let cancelled = false
    async function loadCategories() {
      const { data, error } = await supabaseCloud.from("menu_items").select("category").eq("restaurant_id", restaurantId).not("category", "is", null)
      if (!error && !cancelled) {
        const unique = [...new Set((data || []).map(row => String(row.category || "").trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b))
        setCategories(unique)
      }
    }
    loadCategories()
    return () => { cancelled = true }
  }, [restaurantId])

  function addNewCategory() {
    const value = newCategory.trim()
    if (!value) return
    setCategories(prev => prev.includes(value) ? prev : [...prev, value].sort((a,b) => a.localeCompare(b)))
    setCategory(value)
    setNewCategory("")
  }

  async function addItem(e) {
    e.preventDefault()
    if (!name.trim() || !price) {
      setMessage("Please enter an item name and price.")
      return
    }

    if (!restaurantId) {
      setMessage("Restaurant is not linked to this account.")
      return
    }

    setLoading(true)
    setMessage("")

    const { data: createdItem, error } = await supabaseCloud
      .from("menu_items")
      .insert([{ name: name.trim(), price: Number(price), category: category.trim() || "Other", restaurant_id: restaurantId }])
      .select("id")
      .single()

    if (error) {
      console.error(error)
      setMessage("Unable to add the menu item. Please try again.")
    } else {
      const validVariants = variants.map(v => ({...v,name:String(v.name||"").trim(),price_delta:Number(v.price_delta||0)})).filter(v=>v.name)
      if (validVariants.length) {
        const { error: variantError } = await supabaseCloud.from("menu_variants").insert(validVariants.map(v=>({restaurant_id:restaurantId,menu_item_id:createdItem.id,name:v.name,price_delta:v.price_delta,active:true})))
        if (variantError) { setMessage(`Item added, but variants failed: ${variantError.message}`); setLoading(false); return }
      }
      setMessage("Menu item added successfully.")
      setName("")
      setPrice("")
      setCategory("")
      setVariants([])
    }
    setLoading(false)
  }

  return (
    <main className="add-page">
      <div className="page-shell">
        <header className="page-head">
          <div>
            <span className="eyebrow">MENU MANAGEMENT</span>
            <h1>Add Menu Item</h1>
            <p>Create a food or beverage item for your restaurant menu.</p>
          </div>
          <div className="head-badge">MENU</div>
        </header>

        <section className="content-grid">
          <form className="form-card" onSubmit={addItem}>
            <div className="card-head">
              <div>
                <h2>Item details</h2>
                <p>Keep the name, price and category clear for your POS and QR menu.</p>
              </div>
              <div className="icon">＋</div>
            </div>

            <label className="field">
              <span>Item name <b>*</b></span>
              <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Paneer Tikka Pizza" autoFocus />
            </label>

            <label className="field">
              <span>Price <b>*</b></span>
              <div className="price-wrap"><span>₹</span><input style={{...inputStyle, paddingLeft: 38}} type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" /></div>
            </label>

            <label className="field">
              <span>Food category</span>
              <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value)} disabled={authLoading || !restaurantId}>
                <option value="">Select a category</option>
                {categories.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>

            <div style={{margin:"8px 0 18px",padding:14,border:"1px solid var(--border)",borderRadius:14,background:"var(--surface-2)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><b style={{fontSize:12}}>Variants (optional)</b><button type="button" className="secondary" style={{height:36}} onClick={()=>setVariants(v=>[...v,{name:"",price_delta:""}])}>＋ Add variant</button></div>
              {variants.map((v,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"1fr 140px auto",gap:8,marginBottom:8}}><input style={inputStyle} value={v.name} placeholder="e.g. Medium" onChange={e=>setVariants(prev=>prev.map((x,j)=>j===i?{...x,name:e.target.value}:x))}/><input style={inputStyle} type="number" step="0.01" value={v.price_delta} placeholder="Price + / −" onChange={e=>setVariants(prev=>prev.map((x,j)=>j===i?{...x,price_delta:e.target.value}:x))}/><button type="button" className="secondary" style={{height:48}} onClick={()=>setVariants(prev=>prev.filter((_,j)=>j!==i))}>✕</button></div>)}
              <small style={{color:"var(--muted)"}}>Variant price = base price + adjustment. Leave this empty for existing items without variants.</small>
            </div>

            <div className="new-category-row">
              <input style={inputStyle} value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="New category, e.g. Pizza" />
              <button type="button" className="secondary" onClick={addNewCategory}>＋ Add category</button>
            </div>

            {message && <div className={`message ${message.includes("successfully") ? "success" : "error"}`}>{message}</div>}

            <button className="primary" type="submit" disabled={loading || authLoading || !restaurantId}>
              {loading ? "Adding item…" : "＋ Add Menu Item"}
            </button>
          </form>

          <aside className="info-card">
            <div className="info-icon">🍽️</div>
            <span className="eyebrow">QUICK GUIDE</span>
            <h2>Build a clean menu</h2>
            <p>Use consistent item names and categories so customers can find products quickly across POS and QR ordering.</p>
            <div className="tips">
              <div><b>01</b><span>Use a customer-friendly item name.</span></div>
              <div><b>02</b><span>Enter the selling price before tax.</span></div>
              <div><b>03</b><span>Choose a simple category for easy browsing.</span></div>
            </div>
          </aside>
        </section>
      </div>
      <style jsx global>{`
        .add-page{min-height:100vh;background:var(--background);color:var(--text);padding:30px clamp(16px,3vw,42px) 60px;box-sizing:border-box}
        .page-shell{max-width:1180px;margin:0 auto}
        .page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:22px}
        .eyebrow{display:block;color:var(--primary);font-size:10px;font-weight:950;letter-spacing:.16em;margin-bottom:7px}
        .page-head h1{margin:0;font-size:clamp(28px,3.4vw,42px);letter-spacing:-.035em}
        .page-head p{margin:8px 0 0;color:var(--muted);font-size:13px;line-height:1.55}
        .head-badge{padding:8px 11px;border-radius:999px;border:1px solid rgba(var(--primary-rgb),.2);background:rgba(var(--primary-rgb),.07);color:var(--primary);font-size:10px;font-weight:900;letter-spacing:.08em}
        .content-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);gap:18px;align-items:start}
        .form-card,.info-card{background:linear-gradient(145deg,var(--surface),rgba(var(--primary-rgb),.025));border:1px solid var(--border);border-radius:22px;box-shadow:0 18px 55px rgba(0,0,0,.16)}
        .form-card{padding:24px}
        .info-card{padding:24px;position:sticky;top:18px}
        .card-head{display:flex;justify-content:space-between;gap:18px;padding-bottom:20px;margin-bottom:20px;border-bottom:1px solid rgba(var(--primary-rgb),.12)}
        .card-head h2,.info-card h2{margin:0;font-size:19px;letter-spacing:-.02em}
        .card-head p,.info-card p{margin:7px 0 0;color:var(--muted);font-size:12px;line-height:1.55}
        .icon,.info-icon{width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;border-radius:12px;background:rgba(var(--primary-rgb),.09);color:var(--primary);font-size:22px}
        .field{display:block;margin-bottom:16px}
        .field>span{display:block;margin-bottom:7px;font-size:11px;font-weight:850;color:var(--text)}
        .field b{color:var(--primary)}
        .price-wrap{position:relative}.price-wrap>span{position:absolute;left:14px;top:15px;z-index:1;color:var(--primary);font-weight:900}
        .field input:focus{border-color:rgba(var(--primary-rgb),.48)!important;box-shadow:0 0 0 3px rgba(var(--primary-rgb),.08)}
        .primary{width:100%;height:48px;border:1px solid rgba(var(--primary-rgb),.35);border-radius:13px;background:linear-gradient(135deg,var(--primary),rgba(var(--primary-rgb),.78));color:#07100b;font-size:12px;font-weight:950;cursor:pointer;box-shadow:0 10px 28px rgba(var(--primary-rgb),.12)}
        .primary:disabled{opacity:.6;cursor:wait}
        .new-category-row{display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:-6px;margin-bottom:4px}.secondary{height:48px;border:1px solid var(--border);border-radius:13px;background:var(--surface-2);color:var(--text);font-weight:850;padding:0 14px;white-space:nowrap}.message{margin:4px 0 14px;padding:11px 13px;border-radius:11px;font-size:11px;font-weight:750}.message.success{color:var(--success);background:rgba(var(--success-rgb),.08);border:1px solid rgba(var(--success-rgb),.16)}.message.error{color:var(--danger);background:rgba(var(--danger-rgb),.08);border:1px solid rgba(var(--danger-rgb),.16)}
        .info-icon{margin-bottom:18px}.info-card p{max-width:390px}.tips{display:grid;gap:8px;margin-top:20px}.tips div{display:flex;align-items:center;gap:10px;padding:11px;border-radius:12px;background:rgba(var(--primary-rgb),.045);border:1px solid rgba(var(--primary-rgb),.09)}.tips b{font-size:9px;color:var(--primary)}.tips span{font-size:10.5px;color:var(--muted);line-height:1.4}
        @media(max-width:850px){.content-grid{grid-template-columns:1fr}.info-card{position:static}.page-head{align-items:flex-start}}
        @media(max-width:560px){.new-category-row{grid-template-columns:1fr}.add-page{padding:20px 14px 40px}.form-card,.info-card{padding:18px;border-radius:18px}.page-head{margin-bottom:16px}.head-badge{display:none}}
      `}</style>
    </main>
  )
}
