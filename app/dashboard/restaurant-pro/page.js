"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

const tabs = [
  ["overview","🏠","Overview"],
  ["gst","🧾","GST & Billing"],
  ["suppliers","🚚","Suppliers"],
  ["purchases","📦","Purchases"],
  ["recipes","🍳","Recipes"],
  ["delivery","🛵","Delivery"],
  ["staff","👥","Staff Shifts"],
  ["loyalty","⭐","Loyalty"],
  ["cash","💵","Cash Session"],
]

export default function RestaurantProPage(){
  const searchParams = useSearchParams()
  const [restaurantId,setRestaurantId]=useState("")
  const [restaurant,setRestaurant]=useState(null)
  const [tab,setTab]=useState(searchParams.get("tab") || "overview")
  const [loading,setLoading]=useState(true)
  const [pluginEnabled,setPluginEnabled]=useState(false)
  const [saving,setSaving]=useState(false)
  const [suppliers,setSuppliers]=useState([])
  const [purchases,setPurchases]=useState([])
  const [deliveries,setDeliveries]=useState([])
  const [shifts,setShifts]=useState([])
  const [cash,setCash]=useState(null)
  const [msg,setMsg]=useState("")

  const [supplier,setSupplier]=useState({name:"",phone:"",email:"",address:"",gst_number:"",payment_terms:""})
  const [delivery,setDelivery]=useState({customer_name:"",phone:"",address:"",zone:"",delivery_charge:"",rider_name:"",rider_phone:""})
  const [shift,setShift]=useState({staff_name:"",shift_date:new Date().toISOString().slice(0,10),start_time:"",end_time:"",status:"scheduled",notes:""})
  const [purchase,setPurchase]=useState({supplier_id:"",invoice_number:"",subtotal:"",tax:"",paid:"",notes:"",purchase_date:new Date().toISOString().slice(0,10)})

  useEffect(() => {
    const requested = searchParams.get("tab") || "overview"
    const allowed = ["overview","gst","suppliers","purchases","recipes","delivery","staff","loyalty","cash"]
    setTab(allowed.includes(requested) ? requested : "overview")
  }, [searchParams])

  useEffect(()=>{load()},[])
  async function load(){
    setLoading(true)
    const {data:{user}}=await supabase.auth.getUser()
    if(!user){setLoading(false);return}
    const {data:p}=await supabase.from("profiles").select("restaurant_id").eq("id",user.id).single()
    const rid=p?.restaurant_id
    if(!rid){setLoading(false);return}
    setRestaurantId(rid)
    const { data: pluginRow } = await supabase.from("restaurant_plugins").select("enabled").eq("restaurant_id", rid).eq("plugin_code", "restaurant-pro").maybeSingle()
    const enabled = pluginRow?.enabled === true
    setPluginEnabled(enabled)
    if (!enabled) {
      setLoading(false)
      return
    }
    const [r,s,pu,d,sh,c]=await Promise.all([
      supabase.from("restaurants").select("*").eq("id",rid).single(),
      supabase.from("restaurant_suppliers").select("*").eq("restaurant_id",rid).order("created_at",{ascending:false}),
      supabase.from("restaurant_purchases").select("*,restaurant_suppliers(name)").eq("restaurant_id",rid).order("created_at",{ascending:false}),
      supabase.from("restaurant_deliveries").select("*").eq("restaurant_id",rid).order("created_at",{ascending:false}),
      supabase.from("restaurant_staff_shifts").select("*").eq("restaurant_id",rid).order("shift_date",{ascending:false}),
      supabase.from("restaurant_cash_sessions").select("*").eq("restaurant_id",rid).eq("status","open").maybeSingle()
    ])
    setRestaurant(r.data); setSuppliers(s.data||[]); setPurchases(pu.data||[]); setDeliveries(d.data||[]); setShifts(sh.data||[]); setCash(c.data||null)
    setLoading(false)
  }

  async function saveRestaurant(patch){
    setSaving(true); setMsg("")
    const {error}=await supabase.from("restaurants").update(patch).eq("id",restaurantId)
    setSaving(false); setMsg(error?`❌ ${error.message}`:"✅ Saved")
    if(!error) await load()
  }

  async function addSupplier(e){
    e.preventDefault(); if(!supplier.name.trim())return
    setSaving(true)
    const {error}=await supabase.from("restaurant_suppliers").insert({...supplier,restaurant_id:restaurantId})
    setSaving(false)
    if(error)setMsg(`❌ ${error.message}`); else {setSupplier({name:"",phone:"",email:"",address:"",gst_number:"",payment_terms:""});setMsg("✅ Supplier added");load()}
  }

  async function addPurchase(e){
    e.preventDefault()
    const subtotal=Number(purchase.subtotal||0), tax=Number(purchase.tax||0)
    const payload={...purchase,restaurant_id:restaurantId,subtotal,tax,total:subtotal+tax,paid:Number(purchase.paid||0)}
    delete payload.supplier_id; payload.supplier_id=purchase.supplier_id||null
    const {error}=await supabase.from("restaurant_purchases").insert(payload)
    if(error)setMsg(`❌ ${error.message}`); else {setPurchase({supplier_id:"",invoice_number:"",subtotal:"",tax:"",paid:"",notes:"",purchase_date:new Date().toISOString().slice(0,10)});setMsg("✅ Purchase saved");load()}
  }

  async function addDelivery(e){
    e.preventDefault()
    const {error}=await supabase.from("restaurant_deliveries").insert({
      ...delivery,restaurant_id:restaurantId,delivery_charge:Number(delivery.delivery_charge||0)
    })
    if(error)setMsg(`❌ ${error.message}`); else {setDelivery({customer_name:"",phone:"",address:"",zone:"",delivery_charge:"",rider_name:"",rider_phone:""});setMsg("✅ Delivery added");load()}
  }

  async function addShift(e){
    e.preventDefault()
    const {error}=await supabase.from("restaurant_staff_shifts").insert({...shift,restaurant_id:restaurantId})
    if(error)setMsg(`❌ ${error.message}`); else {setMsg("✅ Shift added");load()}
  }

  async function openCash(){
    const opening=prompt("Opening cash (₹)","0")
    if(opening===null)return
    const {error}=await supabase.from("restaurant_cash_sessions").insert({restaurant_id:restaurantId,opening_cash:Number(opening||0),status:"open"})
    setMsg(error?`❌ ${error.message}`:"✅ Cash session opened");load()
  }

  async function closeCash(){
    if(!cash)return
    const actual=prompt("Actual cash at closing (₹)",String(cash.expected_cash||0))
    if(actual===null)return
    const a=Number(actual||0), expected=Number(cash.expected_cash||cash.opening_cash||0)
    const {error}=await supabase.from("restaurant_cash_sessions").update({actual_cash:a,difference:a-expected,closed_at:new Date().toISOString(),status:"closed"}).eq("id",cash.id)
    setMsg(error?`❌ ${error.message}`:"✅ Cash session closed");load()
  }

  const stats=useMemo(()=>({
    suppliers:suppliers.filter(x=>x.active!==false).length,
    purchases:purchases.reduce((n,x)=>n+Number(x.total||0),0),
    delivery:deliveries.filter(x=>!["delivered","cancelled"].includes(x.status)).length,
    shifts:shifts.filter(x=>x.shift_date===new Date().toISOString().slice(0,10)).length
  }),[suppliers,purchases,deliveries,shifts])

  if(loading)return <main className="restaurant-pro-wrap" style={wrap}><div style={loadingBox}>Loading Restaurant Pro…</div></main>
  if(!pluginEnabled) return <main style={{minHeight:"100vh",padding:"40px",display:"grid",placeItems:"center",background:"var(--background)",color:"var(--text)"}}>
    <div style={{maxWidth:620,padding:32,borderRadius:24,background:"var(--surface)",border:"1px solid var(--border)",textAlign:"center"}}>
      <div style={{fontSize:48}}>🔒</div>
      <div style={{fontSize:11,fontWeight:900,letterSpacing:1.5,color:"var(--primary)"}}>SUPER ADMIN CONTROL</div>
      <h1 style={{margin:"8px 0"}}>Restaurant Pro</h1>
      <p style={{color:"var(--muted)",lineHeight:1.6}}>Advanced restaurant operations are controlled by Super Admin.</p>
      <p style={{fontSize:12,color:"var(--muted)"}}>This feature is currently locked. Ask Super Admin to activate the plugin for this restaurant.</p>
      <a href="/dashboard" style={{display:"inline-block",marginTop:10,padding:"11px 16px",borderRadius:12,background:"var(--primary)",color:"#fff",textDecoration:"none",fontWeight:800}}>← Back to Dashboard</a>
    </div>
  </main>


  return <main className="restaurant-pro-page" style={wrap}>
    <style jsx global>{`
      .restaurant-pro-page, .restaurant-pro-page * { box-sizing: border-box; }
      .restaurant-pro-page { width: 100%; min-width: 0; overflow-x: hidden; }
      .restaurant-pro-page h1, .restaurant-pro-page h2, .restaurant-pro-page h3,
      .restaurant-pro-page p, .restaurant-pro-page span, .restaurant-pro-page b,
      .restaurant-pro-page small, .restaurant-pro-page label, .restaurant-pro-page button,
      .restaurant-pro-page a { overflow-wrap: anywhere; word-break: break-word; }
      .restaurant-pro-tabs { scrollbar-width: thin; }
      .restaurant-pro-tabs::-webkit-scrollbar { height: 5px; }
      .restaurant-pro-tabs::-webkit-scrollbar-thumb { background: rgba(var(--primary-rgb),.25); border-radius: 99px; }
      .restaurant-pro-card { min-width: 0; overflow: hidden; }
      .restaurant-pro-stat { min-width: 0; overflow: hidden; }
      .restaurant-pro-form-grid { min-width: 0; }
      .restaurant-pro-input { min-width: 0 !important; max-width: 100% !important; }
      @media (max-width: 1100px) {
        .restaurant-pro-hero { grid-template-columns: 1fr !important; }
        .restaurant-pro-hero-actions { justify-content: flex-start !important; }
        .restaurant-pro-grid2 { grid-template-columns: 1fr !important; }
        .restaurant-pro-stat-grid { grid-template-columns: repeat(2,minmax(0,1fr)) !important; }
        .restaurant-pro-page { padding: 20px !important; }
      }
      @media (max-width: 700px) {
        .restaurant-pro-page { padding: 12px !important; }
        .restaurant-pro-hero { padding: 18px !important; border-radius: 20px !important; gap: 14px !important; }
        .restaurant-pro-title { font-size: 25px !important; line-height: 1.12 !important; }
        .restaurant-pro-subtitle { font-size: 13px !important; }
        .restaurant-pro-hero-actions { display: grid !important; grid-template-columns: 1fr 1fr !important; width: 100% !important; }
        .restaurant-pro-hero-action { width: 100% !important; text-align: center !important; }
        .restaurant-pro-stat-grid { grid-template-columns: 1fr 1fr !important; gap: 9px !important; }
        .restaurant-pro-stat { padding: 14px !important; border-radius: 15px !important; }
        .restaurant-pro-stat strong { font-size: 20px !important; }
        .restaurant-pro-tabs { margin-bottom: 14px !important; padding: 5px !important; gap: 6px !important; }
        .restaurant-pro-tab { padding: 9px 11px !important; font-size: 12px !important; }
        .restaurant-pro-card { padding: 16px !important; border-radius: 18px !important; }
        .restaurant-pro-form-grid { grid-template-columns: 1fr !important; }
        .restaurant-pro-grid2 { gap: 12px !important; }
      }
      @media (max-width: 430px) {
        .restaurant-pro-stat-grid { grid-template-columns: 1fr !important; }
        .restaurant-pro-hero-actions { grid-template-columns: 1fr !important; }
      }
    `}</style>
    <header className="restaurant-pro-hero" style={hero}>
      <div>
        <div style={eyebrow}>RESTAURANT PRO SUITE</div>
        <h1 className="restaurant-pro-title" style={title}>{restaurant?.name||"Restaurant Operations"}</h1>
        <p className="restaurant-pro-subtitle" style={sub}>POS, billing, inventory, purchasing, delivery, loyalty and staff operations in one place.</p>
      </div>
      <div className="restaurant-pro-hero-actions" style={heroActions}>
        <a className="restaurant-pro-hero-action" href="/order" style={action}>🧾 POS</a>
        <a className="restaurant-pro-hero-action" href="/kitchen" style={action}>🍳 Kitchen</a>
        <a className="restaurant-pro-hero-action" href="/dashboard/inventory" style={action}>📦 Inventory</a>
      </div>
    </header>

    {msg && <div style={toast}>{msg}</div>}

    <nav className="restaurant-pro-tabs" style={tabsWrap}>
      {tabs.map(([id,icon,label])=><button className="restaurant-pro-tab" key={id} onClick={()=>setTab(id)} style={{...tabBtn,...(tab===id?tabActive:{})}}>{icon} {label}</button>)}
    </nav>

    {tab==="overview" && <section>
      <div className="restaurant-pro-stats restaurant-pro-stat-grid" style={statGrid}>
        <Stat label="Active Suppliers" value={stats.suppliers} icon="🚚"/>
        <Stat label="Purchase Value" value={`₹${stats.purchases.toLocaleString("en-IN")}`} icon="📦"/>
        <Stat label="Open Deliveries" value={stats.delivery} icon="🛵"/>
        <Stat label="Today's Shifts" value={stats.shifts} icon="👥"/>
      </div>
      <div className="restaurant-pro-grid2" style={grid2}>
        <Panel title="Restaurant backbone">
          <div style={checklist}>
            {[
              ["🧾","POS & Billing","/order"],
              ["🍳","Kitchen Display","/kitchen"],
              ["🪑","Tables","/dashboard/tables"],
              ["📱","QR Ordering","/dashboard/qr"],
              ["🎁","Offers & Combos","/dashboard/offers"],
              ["👥","Customers","/dashboard/customers"],
              ["📊","Reports","/dashboard/reports"],
              ["🔔","Notifications","/dashboard/notifications"],
            ].map(([i,l,h])=><a key={l} href={h} style={quick}>{i}<span>{l}</span><b>→</b></a>)}
          </div>
        </Panel>
        <Panel title="GST is optional">
          <p style={muted}>Keep GST disabled if you do not need GST billing. When enabled, the restaurant can store its GSTIN and default tax percentage.</p>
          <label style={switchRow}><input type="checkbox" checked={!!restaurant?.gst_enabled} onChange={e=>saveRestaurant({gst_enabled:e.target.checked})}/><span>Enable GST</span></label>
          <label style={fieldLabel}>Default tax %<input className="restaurant-pro-input" style={input} type="number" min="0" value={restaurant?.default_tax_percent??0} onChange={e=>setRestaurant({...restaurant,default_tax_percent:e.target.value})} onBlur={e=>saveRestaurant({default_tax_percent:Number(e.target.value||0)})}/></label>
        </Panel>
      </div>
    </section>}

    {tab==="gst" && <Panel title="GST & billing configuration">
      <div className="restaurant-pro-form-grid" style={formGrid}>
        <label style={fieldLabel}>GST enabled<select className="restaurant-pro-input" style={input} value={restaurant?.gst_enabled?"yes":"no"} onChange={e=>saveRestaurant({gst_enabled:e.target.value==="yes"})}><option value="no">No — GST disabled</option><option value="yes">Yes — GST enabled</option></select></label>
        <label style={fieldLabel}>GSTIN<input className="restaurant-pro-input" style={input} value={restaurant?.gst_number||""} onChange={e=>setRestaurant({...restaurant,gst_number:e.target.value})} onBlur={e=>saveRestaurant({gst_number:e.target.value})}/></label>
        <label style={fieldLabel}>Default tax %<input className="restaurant-pro-input" style={input} type="number" value={restaurant?.default_tax_percent??0} onChange={e=>setRestaurant({...restaurant,default_tax_percent:e.target.value})} onBlur={e=>saveRestaurant({default_tax_percent:Number(e.target.value||0)})}/></label>
        <label style={fieldLabel}>Service charge %<input className="restaurant-pro-input" style={input} type="number" min="0" value={restaurant?.service_charge_percent??0} onChange={e=>setRestaurant({...restaurant,service_charge_percent:e.target.value})} onBlur={e=>saveRestaurant({service_charge_percent:Number(e.target.value||0)})}/></label>
      </div>
      <div style={note}>GST is explicitly optional. Existing restaurants remain GST-off by default.</div>
    </Panel>}

    {tab==="suppliers" && <div className="restaurant-pro-grid2" style={grid2}>
      <Panel title="Add supplier"><form onSubmit={addSupplier} style={form}>
        {["name","phone","email","address","gst_number","payment_terms"].map(k=><input key={k} className="restaurant-pro-input" style={input} placeholder={k.replace("_"," ").toUpperCase()} value={supplier[k]} onChange={e=>setSupplier({...supplier,[k]:e.target.value})} required={k==="name"}/>)}
        <button style={primary} disabled={saving}>{saving?"Saving…":"Add Supplier"}</button>
      </form></Panel>
      <Panel title="Suppliers"><List items={suppliers.map(x=>({title:x.name,meta:[x.phone,x.email].filter(Boolean).join(" · ")||"No contact"}))}/></Panel>
    </div>}

    {tab==="purchases" && <div className="restaurant-pro-grid2" style={grid2}>
      <Panel title="Record purchase"><form onSubmit={addPurchase} style={form}>
        <select className="restaurant-pro-input" style={input} value={purchase.supplier_id} onChange={e=>setPurchase({...purchase,supplier_id:e.target.value})}><option value="">Supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <input className="restaurant-pro-input" style={input} placeholder="Invoice number" value={purchase.invoice_number} onChange={e=>setPurchase({...purchase,invoice_number:e.target.value})}/>
        <div className="restaurant-pro-form-grid" style={formGrid}><input className="restaurant-pro-input" style={input} type="number" placeholder="Subtotal" value={purchase.subtotal} onChange={e=>setPurchase({...purchase,subtotal:e.target.value})}/><input className="restaurant-pro-input" style={input} type="number" placeholder="Tax" value={purchase.tax} onChange={e=>setPurchase({...purchase,tax:e.target.value})}/></div>
        <input className="restaurant-pro-input" style={input} type="number" placeholder="Paid" value={purchase.paid} onChange={e=>setPurchase({...purchase,paid:e.target.value})}/>
        <textarea className="restaurant-pro-input" style={input} placeholder="Notes" value={purchase.notes} onChange={e=>setPurchase({...purchase,notes:e.target.value})}/>
        <button style={primary}>Save Purchase</button>
      </form></Panel>
      <Panel title="Purchase history"><List items={purchases.map(x=>({title:x.invoice_number||"Purchase",meta:`₹${Number(x.total||0).toLocaleString("en-IN")} · ${x.restaurant_suppliers?.name||"No supplier"} · ${x.status}`}))}/></Panel>
    </div>}

    {tab==="recipes" && <Panel title="Recipe-based inventory">
      <p style={muted}>Recipes are stored against menu items and inventory ingredients. Use the existing Inventory → item ingredients workflow for current recipes; this suite provides the durable recipe/purchase schema for automatic stock deduction and costing.</p>
      <a href="/dashboard/inventory" style={primaryLink}>Open Inventory & Ingredients →</a>
    </Panel>}

    {tab==="delivery" && <div className="restaurant-pro-grid2" style={grid2}>
      <Panel title="Add delivery"><form onSubmit={addDelivery} style={form}>
        {["customer_name","phone","address","zone","delivery_charge","rider_name","rider_phone"].map(k=><input key={k} className="restaurant-pro-input" style={input} type={k==="delivery_charge"?"number":"text"} placeholder={k.replace("_"," ").toUpperCase()} value={delivery[k]} onChange={e=>setDelivery({...delivery,[k]:e.target.value})} required={["customer_name","phone","address"].includes(k)}/>)}
        <button style={primary}>Create Delivery</button>
      </form></Panel>
      <Panel title="Delivery queue"><List items={deliveries.map(x=>({title:`${x.customer_name||"Customer"} · ${x.status}`,meta:`${x.phone||""} · ${x.zone||""} · ₹${Number(x.delivery_charge||0)}`}))}/></Panel>
    </div>}

    {tab==="staff" && <div className="restaurant-pro-grid2" style={grid2}>
      <Panel title="Schedule shift"><form onSubmit={addShift} style={form}>
        <input className="restaurant-pro-input" style={input} placeholder="Staff name" value={shift.staff_name} onChange={e=>setShift({...shift,staff_name:e.target.value})} required/>
        <input className="restaurant-pro-input" style={input} type="date" value={shift.shift_date} onChange={e=>setShift({...shift,shift_date:e.target.value})}/>
        <div className="restaurant-pro-form-grid" style={formGrid}><input className="restaurant-pro-input" style={input} type="datetime-local" value={shift.start_time} onChange={e=>setShift({...shift,start_time:e.target.value})}/><input className="restaurant-pro-input" style={input} type="datetime-local" value={shift.end_time} onChange={e=>setShift({...shift,end_time:e.target.value})}/></div>
        <select className="restaurant-pro-input" style={input} value={shift.status} onChange={e=>setShift({...shift,status:e.target.value})}><option>scheduled</option><option>present</option><option>completed</option><option>absent</option></select>
        <button style={primary}>Add Shift</button>
      </form></Panel>
      <Panel title="Shift board"><List items={shifts.map(x=>({title:`${x.staff_name||"Staff"} · ${x.status}`,meta:`${x.shift_date} · ${x.start_time?new Date(x.start_time).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}):"—"}`}))}/></Panel>
    </div>}

    {tab==="loyalty" && <Panel title="Loyalty & rewards">
      <p style={muted}>Your existing Loyalty & Rewards module remains the primary customer-facing loyalty screen. This suite adds durable loyalty account/transaction storage for future points automation.</p>
      <a href="/dashboard/business?tab=loyalty" style={primaryLink}>Open Loyalty & Rewards →</a>
    </Panel>}

    {tab==="cash" && <Panel title="Cash session">
      {!cash ? <div><p style={muted}>No cash session is open.</p><button style={primary} onClick={openCash}>Open Cash Session</button></div>
      : <div style={cashBox}><div><b>Open since</b><span>{new Date(cash.opened_at).toLocaleString("en-IN")}</span></div><div><b>Opening cash</b><span>₹{Number(cash.opening_cash||0).toLocaleString("en-IN")}</span></div><button style={danger} onClick={closeCash}>Close & Reconcile</button></div>}
    </Panel>}
  </main>
}

function Stat({label,value,icon}){return <div className="restaurant-pro-stat" style={stat}><span style={{fontSize:26}}>{icon}</span><small>{label}</small><strong>{value}</strong></div>}
function Panel({title,children}){return <section className="restaurant-pro-card" style={panel}><h2 style={panelTitle}>{title}</h2>{children}</section>}
function List({items}){return <div style={list}>{items.length?items.map((x,i)=><div key={i} style={listRow}><div style={listRowText}><b>{x.title}</b><span style={{color:"var(--muted)",fontSize:12}}>{x.meta}</span></div><span>›</span></div>):<div style={empty}>No records yet.</div>}</div>}

const wrap={minHeight:"100vh",padding:"28px",boxSizing:"border-box",background:"var(--background)",color:"var(--text)"}
const hero={display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",justifyContent:"space-between",alignItems:"center",gap:22,maxWidth:1280,margin:"0 auto 18px",padding:"26px",borderRadius:24,background:"var(--surface)",border:"1px solid var(--border)",boxShadow:"0 18px 50px rgba(0,0,0,.14)"}
const eyebrow={fontSize:11,fontWeight:900,letterSpacing:1.5,color:"var(--primary)"}
const title={margin:"6px 0",fontSize:32,fontWeight:900,letterSpacing:"-.02em"}
const sub={margin:0,color:"var(--muted)",maxWidth:720,lineHeight:1.6}
const heroActions={display:"flex",justifyContent:"flex-end",gap:8,flexWrap:"wrap"}
const action={textDecoration:"none",padding:"10px 13px",borderRadius:12,border:"1px solid var(--border)",color:"var(--text)",background:"var(--surface-2)",fontWeight:800,fontSize:13}
const tabsWrap={maxWidth:1280,margin:"0 auto 18px",display:"flex",gap:7,overflowX:"auto",padding:"6px",borderRadius:17,border:"1px solid var(--border)",background:"var(--surface)",boxShadow:"0 10px 30px rgba(0,0,0,.08)"}
const tabBtn={border:"1px solid transparent",background:"transparent",color:"var(--muted)",padding:"10px 13px",borderRadius:12,whiteSpace:"nowrap",cursor:"pointer",fontWeight:800,transition:"all .18s ease"}
const tabActive={background:"rgba(var(--primary-rgb),.12)",border:"1px solid rgba(var(--primary-rgb),.28)",color:"var(--primary)"}
const panel={maxWidth:1280,margin:"0 auto 18px",padding:"22px",borderRadius:22,background:"var(--surface)",border:"1px solid var(--border)",boxShadow:"0 12px 35px rgba(0,0,0,.08)"}
const panelTitle={margin:"0 0 16px",fontSize:18}
const statGrid={maxWidth:1280,margin:"0 auto 18px",display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12,minWidth:0}
const stat={padding:"18px",borderRadius:18,background:"var(--surface)",border:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:5,boxShadow:"0 10px 28px rgba(0,0,0,.07)"}
const grid2={maxWidth:1280,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:18}
const form={display:"grid",gap:10}
const formGrid={display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}
const input={width:"100%",boxSizing:"border-box",padding:"12px 13px",borderRadius:12,border:"1px solid var(--border)",background:"var(--surface-2)",color:"var(--text)",outline:"none"}
const fieldLabel={display:"grid",gap:6,fontSize:12,color:"var(--muted)"}
const primary={border:0,borderRadius:12,padding:"12px 15px",background:"linear-gradient(135deg,var(--primary),var(--primary-dark,var(--primary)))",color:"#111",fontWeight:900,cursor:"pointer"}
const primaryLink={display:"inline-block",padding:"11px 14px",borderRadius:12,background:"rgba(var(--primary-rgb),.1)",border:"1px solid rgba(var(--primary-rgb),.22)",color:"var(--primary)",textDecoration:"none",fontWeight:900}
const danger={border:0,borderRadius:12,padding:"11px 14px",background:"rgba(220,38,38,.18)",border:"1px solid rgba(248,113,113,.3)",color:"#fecaca",fontWeight:900,cursor:"pointer"}
const quick={display:"grid",gridTemplateColumns:"30px 1fr 20px",gap:10,alignItems:"center",padding:"12px",borderRadius:12,textDecoration:"none",color:"#fff",background:"rgba(255,255,255,.035)",border:"1px solid rgba(255,255,255,.05)"}
const checklist={display:"grid",gap:8}
const muted={color:"var(--muted)",lineHeight:1.6}
const note={marginTop:16,padding:"12px 14px",borderRadius:12,background:"rgba(var(--primary-rgb),.06)",color:"var(--muted)",fontSize:13}
const switchRow={display:"flex",gap:10,alignItems:"center",marginTop:16,fontWeight:800}
const list={display:"grid",gap:8}
const listRow={display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",padding:"12px",borderRadius:12,background:"rgba(255,255,255,.035)"}
const listRowText={display:"grid",gap:3}
const empty={padding:"25px",textAlign:"center",color:"var(--muted)"}
const cashBox={display:"grid",gap:12}
const toast={maxWidth:1280,margin:"0 auto 14px",padding:"11px 14px",borderRadius:12,background:"rgba(var(--primary-rgb),.1)",border:"1px solid rgba(var(--primary-rgb),.2)",color:"#fff"}
const loadingBox={maxWidth:500,margin:"15vh auto",padding:30,textAlign:"center",borderRadius:20,background:"rgba(255,255,255,.04)"}
