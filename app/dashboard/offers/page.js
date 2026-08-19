"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import CombosPage from "@/app/dashboard/combos/page"

const todayISO = () => new Date().toISOString().slice(0, 10)
const emptyForm = () => ({
  title:"", description:"", offer_type:"discount", discount_type:"percent", discount:"",
  min_order:0, max_discount:"", usage_limit:"", valid_from:todayISO(), valid_till:"",
  target_type:"all", target_category:"", product_ids:[], featured:false, active:true,
  coupon_code:"", start_time:"", end_time:"", days_of_week:[], priority:0, stacking:"best_only",
  customer_tier:"", new_customer_only:false, buy_quantity:1, get_quantity:1, get_product_id:""
})

const dayOptions = [[1,"Mon"],[2,"Tue"],[3,"Wed"],[4,"Thu"],[5,"Fri"],[6,"Sat"],[7,"Sun"]]

export default function OffersPage(){
  const [activeTab,setActiveTab]=useState("offers")
  const [offers,setOffers]=useState([]), [menuItems,setMenuItems]=useState([]), [restaurantId,setRestaurantId]=useState(null)
  const [loading,setLoading]=useState(true), [saving,setSaving]=useState(false), [search,setSearch]=useState(""), [filter,setFilter]=useState("all")
  const [productSearch,setProductSearch]=useState(""), [editId,setEditId]=useState(null), [usage,setUsage]=useState({})
  const [form,setForm]=useState(emptyForm())

  useEffect(()=>{getRestaurant()},[])
  useEffect(()=>{if(restaurantId){fetchOffers();fetchMenuItems();fetchUsage()}},[restaurantId])

  async function getRestaurant(){
    const {data:{user}}=await supabase.auth.getUser()
    if(!user){setLoading(false);return}

    // Use the authenticated profile's restaurant_id instead of owner_id.
    // Restaurant admins/staff can legitimately manage offers even when the
    // restaurant owner_id is not the same as the logged-in user's id.
    const {data:profile,error:profileError}=await supabase
      .from("profiles")
      .select("restaurant_id")
      .eq("id",user.id)
      .maybeSingle()

    if(profileError || !profile?.restaurant_id){
      console.error(profileError || new Error("Restaurant profile not found"))
      setLoading(false)
      return
    }

    setRestaurantId(profile.restaurant_id)
  }
  async function fetchOffers(){
    const {data,error}=await supabase.from("offers").select("*, offer_products(menu_item_id)").eq("restaurant_id",restaurantId).order("created_at",{ascending:false})
    if(error){console.error(error);setOffers([])} else setOffers(data||[])
    setLoading(false)
  }
  async function fetchMenuItems(){
    const {data,error}=await supabase.from("menu_items").select("id,name,price,category,image").eq("restaurant_id",restaurantId).order("category").order("name")
    if(error){console.error(error);setMenuItems([]);return} setMenuItems(data||[])
  }
  async function fetchUsage(){
    const {data,error}=await supabase.from("orders").select("offer_id,total_amount,discount_amount,status").eq("restaurant_id",restaurantId).not("offer_id","is",null)
    if(error){console.error("Offer usage",error);return}
    const map={}; (data||[]).forEach(o=>{if(String(o.status||"").toLowerCase()==="cancelled")return; const x=map[o.offer_id]||{uses:0,revenue:0,saved:0}; x.uses++; x.revenue+=Number(o.total_amount||0); x.saved+=Number(o.discount_amount||0); map[o.offer_id]=x})
    setUsage(map)
  }
  function handleChange(e){const {name,value,type,checked}=e.target;setForm(p=>({...p,[name]:type==="checkbox"?checked:value}))}
  function toggleDay(day){setForm(p=>({...p,days_of_week:p.days_of_week.includes(day)?p.days_of_week.filter(x=>x!==day):[...p.days_of_week,day].sort()}))}
  function toggleProduct(id){setForm(p=>({...p,product_ids:p.product_ids.includes(id)?p.product_ids.filter(x=>x!==id):[...p.product_ids,id]}))}
  function resetForm(){setForm(emptyForm());setEditId(null);setProductSearch("")}

  async function saveOffer(){
    if(!form.title.trim()||form.discount===""||!form.valid_till){alert("Title, discount and valid-till date are required");return}
    if(form.target_type==="products"&&!form.product_ids.length){alert("Select at least one product");return}
    if(form.target_type==="category"&&!form.target_category){alert("Select a category");return}
    if(["bogo","buy_get"].includes(form.offer_type)&&(!form.buy_quantity||!form.get_quantity)){alert("Buy and Get quantities are required");return}
    if(form.offer_type==="free_item"&&!form.get_product_id){alert("Select the free item");return}
    const discount=Math.max(0,Number(form.discount||0))
    if(form.discount_type==="percent"&&discount>100){alert("Percentage discount cannot exceed 100%");return}
    setSaving(true)
    try{
      const payload={
        title:form.title.trim(),description:form.description.trim()||null,offer_type:["discount","bogo","buy_get","free_item"].includes(form.offer_type)?form.offer_type:"discount",
        discount,discount_type:form.discount_type==="flat"?"flat":"percent",min_order:Math.max(0,Number(form.min_order||0)),
        max_discount:form.max_discount===""?null:Math.max(0,Number(form.max_discount)),usage_limit:form.usage_limit===""?null:Math.max(1,Number(form.usage_limit)),
        valid_from:form.valid_from||todayISO(),valid_till:form.valid_till,target_type:["all","products","category"].includes(form.target_type)?form.target_type:"all",
        target_category:form.target_type==="category"?form.target_category:null,featured:!!form.featured,active:form.active!==false,
        coupon_code:form.coupon_code.trim().toUpperCase()||null,start_time:form.start_time||null,end_time:form.end_time||null,
        days_of_week:form.days_of_week.length?form.days_of_week.join(","):null,priority:Number(form.priority||0),stacking:form.stacking,
        customer_tier:form.customer_tier.trim()||null,new_customer_only:!!form.new_customer_only,buy_quantity:Math.max(1,Number(form.buy_quantity||1)),
        get_quantity:Math.max(1,Number(form.get_quantity||1)),get_product_id:form.get_product_id||null
      }
      let offerId=editId,error
      if(editId){({error}=await supabase.from("offers").update(payload).eq("id",editId).eq("restaurant_id",restaurantId))}
      else {const r=await supabase.from("offers").insert([{...payload,restaurant_id:restaurantId}]).select("id").single();error=r.error;offerId=r.data?.id}
      if(error)throw error
      await supabase.from("offer_products").delete().eq("offer_id",offerId)
      if(payload.target_type==="products"&&form.product_ids.length){const {error:e}=await supabase.from("offer_products").insert(form.product_ids.map(menu_item_id=>({offer_id:offerId,menu_item_id})));if(e)throw e}
      resetForm();await fetchOffers();await fetchUsage()
    }catch(e){console.error(e);alert(e.message||"Unable to save offer")}finally{setSaving(false)}
  }
  function editOffer(o){
    setForm({
      ...emptyForm(),title:o.title||"",description:o.description||"",offer_type:o.offer_type||"discount",discount_type:o.discount_type||"percent",discount:o.discount??"",
      min_order:o.min_order??0,max_discount:o.max_discount??"",usage_limit:o.usage_limit??"",valid_from:o.valid_from||todayISO(),valid_till:o.valid_till||"",
      target_type:o.target_type||"all",target_category:o.target_category||"",product_ids:(o.offer_products||[]).map(x=>x.menu_item_id),featured:!!o.featured,active:o.active!==false,
      coupon_code:o.coupon_code||"",start_time:o.start_time||"",end_time:o.end_time||"",days_of_week:o.days_of_week?o.days_of_week.split(",").map(Number):[],priority:o.priority??0,stacking:o.stacking||"best_only",
      customer_tier:o.customer_tier||"",new_customer_only:!!o.new_customer_only,buy_quantity:o.buy_quantity||1,get_quantity:o.get_quantity||1,get_product_id:o.get_product_id||""
    });setEditId(o.id);window.scrollTo({top:0,behavior:"smooth"})
  }
  async function deleteOffer(id){if(!confirm("Delete this offer?"))return;const {error}=await supabase.from("offers").delete().eq("id",id).eq("restaurant_id",restaurantId);if(error)alert(error.message);await fetchOffers();await fetchUsage()}
  async function toggleActive(o){const {error}=await supabase.from("offers").update({active:!(o.active!==false)}).eq("id",o.id).eq("restaurant_id",restaurantId);if(error)alert(error.message);else fetchOffers()}

  const categories=useMemo(()=>[...new Set(menuItems.map(i=>i.category).filter(Boolean))].sort(),[menuItems])
  const filteredProducts=useMemo(()=>{const q=productSearch.toLowerCase().trim();return menuItems.filter(i=>!q||`${i.name} ${i.category||""}`.toLowerCase().includes(q))},[menuItems,productSearch])
  const filteredOffers=useMemo(()=>offers.filter(o=>{const q=search.toLowerCase().trim();if(q&&!`${o.title||""} ${o.description||""} ${o.coupon_code||""}`.toLowerCase().includes(q))return false;const now=new Date(),t=o.valid_till?new Date(`${o.valid_till}T23:59:59`):null,f=o.valid_from?new Date(`${o.valid_from}T00:00:00`):null,live=o.active!==false&&(!f||f<=now)&&(!t||t>=now),days=t?(t-now)/86400000:Infinity;if(filter==="active")return live;if(filter==="expired")return !!t&&t<now;if(filter==="soon")return live&&days<=7;if(filter==="product")return o.target_type==="products";if(filter==="coupon")return !!o.coupon_code;if(filter==="bogo")return ["bogo","buy_get","free_item"].includes(o.offer_type);return true}),[offers,search,filter])
  const stats={total:offers.length,active:offers.filter(o=>o.active!==false).length,product:offers.filter(o=>o.target_type==="products").length,coupon:offers.filter(o=>o.coupon_code).length,saved:Object.values(usage).reduce((a,x)=>a+x.saved,0)}

  return <div style={layout} className="offers-page">
    <div className="offersTabs">
      <button type="button" className={activeTab==="offers" ? "active" : ""} onClick={()=>setActiveTab("offers")}>🎁 Offers</button>
      <button type="button" className={activeTab==="combos" ? "active" : ""} onClick={()=>setActiveTab("combos")}>🍱 Combo Meals</button>
    </div>
    <style jsx global>{`.offersTabs{display:flex;gap:10px;margin:0 0 18px;padding:7px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);width:max-content}.offersTabs button{border:0;border-radius:12px;padding:11px 16px;background:transparent;color:var(--muted);font-weight:900;cursor:pointer}.offersTabs button.active{background:rgba(var(--primary-rgb),.14);color:var(--primary);box-shadow:0 8px 25px rgba(0,0,0,.18)}.offersTabs + .combo-page{margin:-18px -40px -50px;padding:0 40px 50px}@media(max-width:900px){.offersTabs{width:100%;box-sizing:border-box}.offersTabs button{flex:1}.offersTabs + .combo-page{margin:-18px -18px -35px;padding:0 18px 35px}.offers-page{padding:78px 18px 35px!important}.offers-page .hero,.offers-page .sectionHead,.offers-page .pickerTop{flex-direction:column!important;align-items:stretch!important}.offers-page .statsGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.offers-page .formGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.offers-page .toolbar{grid-template-columns:1fr!important}.offers-page .heroBadge{width:100%;box-sizing:border-box}.offers-page .grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}@media(max-width:600px){.offers-page .formGrid,.offers-page .grid{grid-template-columns:1fr!important}.offers-page .statsGrid{grid-template-columns:1fr 1fr!important}.offers-page .actions{grid-template-columns:1fr 1fr!important}.offers-page .actions button:last-child{grid-column:1/-1}.offers-page .saveBtn{width:100%!important;margin-left:0!important}}`}</style>
    {activeTab==="combos" ? <CombosPage /> : <>

    <section style={hero}><div><div style={eyebrow}>✦ ADVANCED PROMOTIONS ENGINE</div><h1 style={title}>Offers & Campaigns</h1><p style={subtitle}>Product targeting, coupons, BOGO, free items, scheduling, loyalty eligibility and offer analytics — all in one place.</p></div><div style={heroBadge}><span style={{fontSize:28}}>🎯</span><div><b>Smart Promotions</b><small>Auto-select the best eligible offer</small></div></div></section>
    <div style={statsGrid}><Stat icon="🎁" value={stats.total} label="Total Offers"/><Stat icon="🟢" value={stats.active} label="Active"/><Stat icon="🎯" value={stats.product} label="Product Targeted"/><Stat icon="🏷️" value={stats.coupon} label="Coupons"/><Stat icon="💸" value={`₹${stats.saved.toFixed(0)}`} label="Discount Given"/></div>
    <div style={toolbar}><input placeholder="Search title, coupon..." value={search} onChange={e=>setSearch(e.target.value)} style={input}/><select value={filter} onChange={e=>setFilter(e.target.value)} style={input}><option value="all">All Offers</option><option value="active">Active</option><option value="product">Individual Products</option><option value="coupon">Coupons</option><option value="bogo">BOGO / Free Item</option><option value="soon">Ending Soon</option><option value="expired">Expired</option></select></div>

    <section style={formBox}>
      <div style={sectionHead}><div><div style={eyebrow}>OFFER BUILDER</div><h2 style={sectionTitle}>{editId?"Edit Offer":"Create Advanced Offer"}</h2><p style={muted}>Build a promotion with precise eligibility and automatic application.</p></div>{editId&&<button type="button" onClick={resetForm} style={ghostBtn}>✕ Cancel</button>}</div>
      <div style={formGrid}>
        <Field label="Offer title"><input name="title" value={form.title} onChange={handleChange} placeholder="Weekend Special" style={input}/></Field>
        <Field label="Description"><input name="description" value={form.description} onChange={handleChange} placeholder="20% off selected dishes" style={input}/></Field>
        <Field label="Offer type"><select name="offer_type" value={form.offer_type} onChange={handleChange} style={input}><option value="discount">Discount</option><option value="bogo">Buy X Get Y</option><option value="free_item">Free Item</option></select></Field>
        <Field label={form.offer_type==="discount"?"Discount value":"Base discount value (optional)"}><input type="number" min="0" name="discount" value={form.discount} onChange={handleChange} placeholder="20" style={input}/></Field>
        <Field label="Discount type"><select name="discount_type" value={form.discount_type} onChange={handleChange} style={input}><option value="percent">Percentage %</option><option value="flat">Flat ₹</option></select></Field>
        <Field label="Minimum order ₹"><input type="number" min="0" name="min_order" value={form.min_order} onChange={handleChange} style={input}/></Field>
        <Field label="Maximum discount ₹"><input type="number" min="0" name="max_discount" value={form.max_discount} onChange={handleChange} placeholder="No cap" style={input}/></Field>
        <Field label="Usage limit"><input type="number" min="1" name="usage_limit" value={form.usage_limit} onChange={handleChange} placeholder="Unlimited" style={input}/></Field>
        <Field label="Priority"><input type="number" name="priority" value={form.priority} onChange={handleChange} style={input}/></Field>
        <Field label="Stacking"><select name="stacking" value={form.stacking} onChange={handleChange} style={input}><option value="best_only">Best offer only</option><option value="exclusive">Exclusive</option><option value="stackable">Stackable</option></select></Field>
        <Field label="Valid from"><input type="date" name="valid_from" value={form.valid_from} onChange={handleChange} style={input}/></Field>
        <Field label="Valid till"><input type="date" name="valid_till" value={form.valid_till} onChange={handleChange} style={input}/></Field>
        <Field label="Start time"><input type="time" name="start_time" value={form.start_time} onChange={handleChange} style={input}/></Field>
        <Field label="End time"><input type="time" name="end_time" value={form.end_time} onChange={handleChange} style={input}/></Field>
        <Field label="Offer applies to"><select name="target_type" value={form.target_type} onChange={handleChange} style={input}><option value="all">Entire Menu</option><option value="category">One Category</option><option value="products">Individual Products</option></select></Field>
        {form.target_type==="category"&&<Field label="Category"><select name="target_category" value={form.target_category} onChange={handleChange} style={input}><option value="">Select category</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></Field>}
        <Field label="Coupon code"><input name="coupon_code" value={form.coupon_code} onChange={handleChange} placeholder="WEEKEND20" style={input}/></Field>
        <Field label="Customer tier"><input name="customer_tier" value={form.customer_tier} onChange={handleChange} placeholder="Gold (optional)" style={input}/></Field>
      </div>

      {(form.offer_type==="bogo"||form.offer_type==="buy_get")&&<div style={specialBox}><b>🎁 Buy X Get Y</b><div style={miniGrid}><Field label="Buy quantity"><input type="number" min="1" name="buy_quantity" value={form.buy_quantity} onChange={handleChange} style={input}/></Field><Field label="Get quantity"><input type="number" min="1" name="get_quantity" value={form.get_quantity} onChange={handleChange} style={input}/></Field><Field label="Free/get product (optional)"><select name="get_product_id" value={form.get_product_id} onChange={handleChange} style={input}><option value="">Same eligible product</option>{menuItems.map(i=><option key={i.id} value={i.id}>{i.name} — ₹{i.price}</option>)}</select></Field></div></div>}
      {form.offer_type==="free_item"&&<div style={specialBox}><b>🎁 Free Item</b><Field label="Select free product"><select name="get_product_id" value={form.get_product_id} onChange={handleChange} style={input}><option value="">Select product</option>{menuItems.map(i=><option key={i.id} value={i.id}>{i.name} — ₹{i.price}</option>)}</select></Field></div>}

      <div style={specialBox}><b>📅 Active days</b><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>{dayOptions.map(([d,n])=><button type="button" key={d} onClick={()=>toggleDay(d)} style={{...dayBtn,...(form.days_of_week.includes(d)?dayBtnActive:{})}}>{n}</button>)}</div></div>

      {form.target_type==="products"&&<div style={productPicker}><div style={pickerTop}><div><b>🎯 Select individual products</b><small>{form.product_ids.length} selected</small></div><input value={productSearch} onChange={e=>setProductSearch(e.target.value)} placeholder="Search products..." style={{...input,maxWidth:280}}/></div><div style={productGrid}>{filteredProducts.map(item=>{const selected=form.product_ids.includes(item.id);return <button type="button" key={item.id} onClick={()=>toggleProduct(item.id)} style={{...productCard,...(selected?selectedProduct:{})}}><div style={productIcon}>{selected?"✓":"🍽️"}</div><div style={{textAlign:"left",minWidth:0}}><b>{item.name}</b><small>{item.category||"Other"} • ₹{Number(item.price||0).toFixed(0)}</small></div></button>})}{!filteredProducts.length&&<div style={emptyPicker}>No products found.</div>}</div></div>}

      <div style={formFooter}><label style={switchLabel}><input type="checkbox" name="active" checked={form.active!==false} onChange={handleChange}/> Active</label><label style={switchLabel}><input type="checkbox" name="featured" checked={!!form.featured} onChange={handleChange}/> ⭐ Featured</label><label style={switchLabel}><input type="checkbox" name="new_customer_only" checked={!!form.new_customer_only} onChange={handleChange}/> New customer only</label><button type="button" onClick={saveOffer} disabled={saving} style={saveBtn}>{saving?"Saving...":editId?"✓ Update Offer":"＋ Create Offer"}</button></div>
    </section>

    <div style={listHead}><div><div style={eyebrow}>PROMOTION LIBRARY</div><h2 style={sectionTitle}>Your Offers</h2></div><span style={countPill}>{filteredOffers.length} shown</span></div>
    <div style={grid}>{filteredOffers.map(o=><OfferCard key={o.id} offer={o} menuItems={menuItems} usage={usage[o.id]} onEdit={()=>editOffer(o)} onDelete={()=>deleteOffer(o.id)} onToggle={()=>toggleActive(o)}/>)}{!loading&&!filteredOffers.length&&<div style={empty}><div style={{fontSize:50}}>🎁</div><h2>No offers found</h2><p>Create an offer or change the filter.</p></div>}</div>
    </>}
  </div>
}

function Stat({icon,value,label}){return <div style={statCard}><div style={statIcon}>{icon}</div><div><strong>{value}</strong><span>{label}</span></div></div>}
function Field({label,children}){return <label style={field}><span>{label}</span>{children}</label>}
function OfferCard({offer,menuItems,usage,onEdit,onDelete,onToggle}){
  const now=new Date(),t=offer.valid_till?new Date(`${offer.valid_till}T23:59:59`):null,expired=!!t&&t<now,days=t?Math.ceil((t-now)/86400000):null
  const targetProducts=(offer.offer_products||[]).map(x=>menuItems.find(m=>m.id===x.menu_item_id)?.name).filter(Boolean)
  const target=offer.target_type==="products"?`${targetProducts.length} product${targetProducts.length===1?"":"s"}`:offer.target_type==="category"?`Category: ${offer.target_category||"—"}`:"Entire Menu"
  const discount=offer.offer_type==="free_item"?"FREE":["bogo","buy_get"].includes(offer.offer_type)?`${offer.buy_quantity||1}+${offer.get_quantity||1}`:offer.discount_type==="flat"?`₹${offer.discount}`:`${offer.discount}%`
  return <article style={card}><div style={cardTop}><span style={{...statusPill,...(expired?expiredPill:{})}}>{expired?"● EXPIRED":offer.active===false?"● PAUSED":"● LIVE"}</span>{offer.featured&&<span style={featuredPill}>⭐ FEATURED</span>}</div><div style={discountCircle}><strong>{discount}</strong><small>{offer.offer_type==="discount"?"OFF":offer.offer_type==="free_item"?"ITEM":"DEAL"}</small></div><h3 style={cardTitle}>{offer.title}</h3><p style={desc}>{offer.description||"No description added."}</p><div style={targetBox}><span>🎯</span><div><small>APPLIES TO</small><b>{target}</b></div></div>{offer.coupon_code&&<div style={coupon}>🏷️ {offer.coupon_code}</div>}{targetProducts.length>0&&<div style={chips}>{targetProducts.slice(0,4).map(n=><span key={n} style={chip}>{n}</span>)}{targetProducts.length>4&&<span style={chip}>+{targetProducts.length-4}</span>}</div>}<div style={metaGrid}><div style={metaCell}><small>MIN BILL</small><b>₹{Number(offer.min_order||0)}</b></div><div style={metaCell}><small>VALID TILL</small><b>{offer.valid_till||"∞"}</b></div><div style={metaCell}><small>USED</small><b>{usage?.uses||0}{offer.usage_limit?` / ${offer.usage_limit}`:""}</b></div><div style={metaCell}><small>SAVED</small><b>₹{Number(usage?.saved||0).toFixed(0)}</b></div></div><div style={{...daysText,color:expired?"var(--danger)":"var(--success)"}}>{expired?`Expired ${Math.abs(days||0)} day(s) ago`:`${days??"∞"} day(s) remaining`}</div><div style={actions}><button type="button" onClick={onEdit} style={editBtn}>Edit</button><button type="button" onClick={onToggle} style={pauseBtn}>{offer.active===false?"Activate":"Pause"}</button><button type="button" onClick={onDelete} style={deleteBtn}>Delete</button></div></article>
}

const layout={minHeight:"100vh",padding:"88px 40px 50px",background:"radial-gradient(circle at 10% 0%,var(--surface-2),var(--background) 48%,#050509 100%)",color:"#fff"}
const hero={display:"flex",justifyContent:"space-between",alignItems:"center",gap:25,padding:30,marginBottom:24,borderRadius:30,background:"linear-gradient(135deg,rgba(255,255,255,.08),rgba(255,255,255,.025))",border:"1px solid rgba(255,255,255,.10)",boxShadow:"0 25px 80px rgba(0,0,0,.35)",backdropFilter:"blur(25px)"}
const eyebrow={color:"var(--primary)",fontSize:11,fontWeight:900,letterSpacing:2.2,marginBottom:7},title={margin:0,fontSize:"clamp(34px,4vw,54px)",fontWeight:950,letterSpacing:-1.5,background:"linear-gradient(135deg,#fff,var(--primary),#fff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},subtitle={color:"var(--muted)",maxWidth:760,lineHeight:1.65,margin:"10px 0 0",fontSize:15},heroBadge={display:"flex",alignItems:"center",gap:12,padding:"16px 18px",borderRadius:20,background:"rgba(var(--primary-rgb),.10)",border:"1px solid rgba(var(--primary-rgb),.25)",minWidth:220},statsGrid={display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:16,marginBottom:24},statCard={display:"flex",alignItems:"center",gap:14,padding:20,borderRadius:22,background:"rgba(255,255,255,.045)",border:"1px solid rgba(255,255,255,.08)",boxShadow:"0 18px 50px rgba(0,0,0,.22)"},statIcon={width:44,height:44,display:"grid",placeItems:"center",borderRadius:14,background:"rgba(var(--primary-rgb),.12)",fontSize:20},toolbar={display:"grid",gridTemplateColumns:"1fr 240px",gap:12,padding:16,marginBottom:24,borderRadius:22,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)"},input={width:"100%",boxSizing:"border-box",padding:"14px 15px",borderRadius:15,background:"rgba(255,255,255,.055)",border:"1px solid rgba(255,255,255,.10)",color:"#fff",fontSize:14,outline:"none"},formBox={padding:28,marginBottom:34,borderRadius:28,background:"rgba(255,255,255,.055)",border:"1px solid rgba(255,255,255,.09)",backdropFilter:"blur(25px)",boxShadow:"0 25px 80px rgba(0,0,0,.35)"},sectionHead={display:"flex",justifyContent:"space-between",alignItems:"center",gap:15,marginBottom:22},sectionTitle={margin:0,fontSize:27,fontWeight:900},muted={color:"var(--muted)",margin:"6px 0 0",fontSize:13},formGrid={display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:15},field={display:"grid",gap:7,fontSize:11,fontWeight:800,color:"var(--muted)"},specialBox={marginTop:18,padding:16,borderRadius:20,background:"rgba(var(--primary-rgb),.06)",border:"1px solid rgba(var(--primary-rgb),.14)"},miniGrid={display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:12,marginTop:12},dayBtn={padding:"9px 12px",borderRadius:12,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.04)",color:"#fff",cursor:"pointer",fontWeight:800},dayBtnActive={background:"var(--primary)",color:"#111",borderColor:"var(--primary)"},productPicker={marginTop:22,padding:18,borderRadius:22,background:"rgba(0,0,0,.16)",border:"1px solid rgba(255,255,255,.08)"},pickerTop={display:"flex",justifyContent:"space-between",alignItems:"center",gap:15,marginBottom:15},productGrid={display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10,maxHeight:300,overflowY:"auto"},productCard={display:"flex",alignItems:"center",gap:10,padding:12,borderRadius:16,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",color:"#fff",cursor:"pointer"},selectedProduct={border:"1px solid var(--primary)",background:"rgba(var(--primary-rgb),.12)"},productIcon={width:36,height:36,flex:"0 0 36px",display:"grid",placeItems:"center",borderRadius:11,background:"rgba(255,255,255,.07)",fontWeight:900},formFooter={display:"flex",alignItems:"center",gap:15,marginTop:22,flexWrap:"wrap"},switchLabel={display:"flex",alignItems:"center",gap:7,color:"var(--muted)",fontSize:13},saveBtn={marginLeft:"auto",minWidth:190,padding:"14px 20px",borderRadius:16,border:"1px solid rgba(var(--primary-rgb),.35)",background:"linear-gradient(135deg,var(--primary),rgba(var(--primary-rgb),.65))",color:"#111",fontWeight:900,cursor:"pointer"},ghostBtn={padding:"11px 14px",borderRadius:13,border:"1px solid rgba(255,255,255,.10)",background:"rgba(255,255,255,.04)",color:"#fff",cursor:"pointer"},listHead={display:"flex",justifyContent:"space-between",alignItems:"end",marginBottom:16},countPill={padding:"7px 11px",borderRadius:999,background:"rgba(255,255,255,.06)",color:"var(--muted)",fontSize:12},grid={display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:18},card={position:"relative",padding:22,borderRadius:25,background:"linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.025))",border:"1px solid rgba(255,255,255,.09)",boxShadow:"0 20px 65px rgba(0,0,0,.28)",overflow:"hidden"},cardTop={display:"flex",justifyContent:"space-between",alignItems:"center",gap:8},statusPill={padding:"6px 9px",borderRadius:999,background:"rgba(34,197,94,.10)",color:"var(--success)",fontSize:9,fontWeight:900,letterSpacing:1},expiredPill={background:"rgba(248,113,113,.10)",color:"var(--danger)"},featuredPill={padding:"6px 9px",borderRadius:999,background:"rgba(var(--primary-rgb),.12)",color:"var(--primary)",fontSize:9,fontWeight:900},discountCircle={width:82,height:82,margin:"18px 0 14px",borderRadius:"50%",display:"grid",placeItems:"center",alignContent:"center",background:"radial-gradient(circle,rgba(var(--primary-rgb),.35),rgba(var(--primary-rgb),.07))",border:"1px solid rgba(var(--primary-rgb),.35)"},cardTitle={margin:0,fontSize:22,fontWeight:900},desc={color:"var(--muted)",minHeight:43,lineHeight:1.5,fontSize:13},targetBox={display:"flex",gap:10,alignItems:"center",padding:12,marginTop:15,borderRadius:16,background:"rgba(var(--primary-rgb),.07)",border:"1px solid rgba(var(--primary-rgb),.14)"},chips={display:"flex",gap:6,flexWrap:"wrap",marginTop:10},chip={padding:"5px 8px",borderRadius:999,background:"rgba(255,255,255,.06)",color:"var(--muted)",fontSize:10},metaGrid={display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginTop:15},metaCell={padding:10,borderRadius:13,background:"rgba(255,255,255,.035)",border:"1px solid rgba(255,255,255,.06)"},daysText={marginTop:13,fontSize:12,fontWeight:800},actions={display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:16},editBtn={padding:11,borderRadius:13,border:"1px solid rgba(96,165,250,.25)",background:"rgba(96,165,250,.08)",color:"#fff",cursor:"pointer",fontWeight:800},pauseBtn={padding:11,borderRadius:13,border:"1px solid rgba(255,255,255,.10)",background:"rgba(255,255,255,.05)",color:"#fff",cursor:"pointer",fontWeight:800},deleteBtn={padding:11,borderRadius:13,border:"1px solid rgba(248,113,113,.25)",background:"rgba(248,113,113,.07)",color:"#fff",cursor:"pointer",fontWeight:800},coupon={marginTop:10,padding:"9px 11px",borderRadius:12,background:"rgba(245,158,11,.08)",border:"1px dashed rgba(245,158,11,.3)",color:"#fbbf24",fontSize:12,fontWeight:900},empty={gridColumn:"1/-1",padding:60,textAlign:"center",borderRadius:25,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)"},emptyPicker={padding:30,textAlign:"center",color:"var(--muted)",gridColumn:"1/-1"}
