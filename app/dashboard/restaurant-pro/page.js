"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { FEATURE_CATALOG, CORE_FEATURE_CODES, OPERATIONS_FEATURE_CODES, INVENTORY_FEATURE_CODES } from "@/lib/featureCatalog"

const FEATURE_PATHS = {
  "qr-ordering-pro": ["/dashboard/qr", "Open QR Ordering"],
  "qr-print-center": ["/dashboard/qr", "Open QR Print Center"],
  "website-ordering": ["/dashboard/website-ordering", "Website Ordering"],
  "online-ordering": ["/dashboard/website-ordering", "Online Ordering"],
  "captain-app": ["/staff", "Open Captain / Waiter"],
  "captain-runtime": ["/staff", "Open Captain Runtime"],
  "smart-notifications": ["/dashboard/notifications", "Open Notifications"],
  "calling-device": ["/dashboard/calling", "Open Calling Device"],
  "calling-runtime": ["/dashboard/calling", "Open Calling Runtime"],
  "offers": ["/dashboard/offers", "Open Offers"],
  "thermal-printing": ["/dashboard/printing", "Printing Center"],
  "a4-invoice": ["/dashboard/printing", "A4 Invoice"],
  "hardware-print-queue": ["/dashboard/printing", "Hardware Print Queue"],
  "pos-terminals": ["/dashboard/printing", "Printer / Terminal Setup"],
  "facebook-integration": ["/dashboard/social", "Facebook Integration"],
  "instagram-integration": ["/dashboard/social", "Instagram Integration"],
  "whatsapp-invoice": ["/dashboard/restaurant-pro?integration=whatsapp-invoice", "WhatsApp Settings"],
  "swiggy-integration": ["/dashboard/restaurant-pro?integration=swiggy-integration", "Swiggy Settings"],
  "zomato-integration": ["/dashboard/restaurant-pro?integration=zomato-integration", "Zomato Settings"],
}

const SPECIAL = new Set([
  "whatsapp-invoice","swiggy-integration","zomato-integration",
  "facebook-integration","instagram-integration",
])

export default function RestaurantProPage(){
  const [restaurantId,setRestaurantId]=useState("")
  const [restaurant,setRestaurant]=useState(null)
  const [active,setActive]=useState({})
  const [configs,setConfigs]=useState({})
  const [open,setOpen]=useState("")
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState("")
  const [message,setMessage]=useState("")
  const [integrationState,setIntegrationState]=useState([])
  const [offerLimit,setOfferLimit]=useState(null)

  const visible=useMemo(()=>FEATURE_CATALOG.filter(f=>{
    if(CORE_FEATURE_CODES.has(f.code)||OPERATIONS_FEATURE_CODES.has(f.code)||INVENTORY_FEATURE_CODES.has(f.code)) return false
    return active[f.code]===true || (f.aliases||[]).some(a=>active[a]===true)
  }),[active])

  const grouped=useMemo(()=>{
    const m={}
    for(const f of visible)(m[f.category] ||= []).push(f)
    return m
  },[visible])

  useEffect(()=>{load()},[])

  async function load(){
    setLoading(true); setMessage("")
    try{
      const {data:{user}}=await supabase.auth.getUser()
      if(!user){setLoading(false);return}
      const {data:profile}=await supabase.from("profiles").select("restaurant_id").eq("id",user.id).maybeSingle()
      const rid=profile?.restaurant_id
      if(!rid){setLoading(false);return}
      setRestaurantId(rid)

      const [{data:r},{data:rows},{data:settings}]=await Promise.all([
        supabase.from("restaurants").select("*").eq("id",rid).maybeSingle(),
        supabase.from("restaurant_plugins").select("plugin_code,enabled").eq("restaurant_id",rid),
        supabase.from("plugin_settings").select("plugin_code,config").eq("restaurant_id",rid)
      ])

      setRestaurant(r||null)
      const state={}
      for(const row of rows||[]) state[row.plugin_code]=row.enabled===true
      setActive(state)

      const cfg={}
      for(const row of settings||[]){
        const code=row.plugin_code==="whatsapp"?"whatsapp-invoice":row.plugin_code
        cfg[code]=row.config||{}
      }

      // Aggregator credentials are stored server-side and only status is returned.
      try{
        const {data:session}=await supabase.auth.getSession()
        const rr=await fetch("/api/restaurant/integrations",{headers:{Authorization:`Bearer ${session?.session?.access_token||""}`},cache:"no-store"})
        const rd=await rr.json()
        setIntegrationState(rd.integrations||[])
      }catch{}

      // Social and printing settings are also stored in plugin_settings.
      setConfigs(cfg)
      const params=new URLSearchParams(window.location.search)
      setOpen(params.get("integration")||"")
    }catch(e){
      setMessage(`❌ ${e.message||"Unable to load Pro features"}`)
    }finally{setLoading(false)}
  }

  async function saveSettings(code){
    const config=configs[code]||{}
    setSaving(code);setMessage("")
    try{
      if(code==="whatsapp-invoice"){
        const number=String(config.number||"").replace(/\D/g,"")
        if(number.length<10) throw new Error("Enter WhatsApp number with country code.")
      }
      const {error}=await supabase.from("plugin_settings").upsert({
        restaurant_id:restaurantId,
        plugin_code:code,
        config
      },{onConflict:"restaurant_id,plugin_code"})
      if(error) throw error
      setMessage(`✅ ${code} settings saved`)
    }catch(e){setMessage(`❌ ${e.message}`)}
    finally{setSaving("")}
  }

  async function saveAggregator(code){
    const provider=code==="zomato-integration"?"zomato":"swiggy"
    setSaving(code);setMessage("")
    try{
      const {data:{session}}=await supabase.auth.getSession()
      const res=await fetch("/api/restaurant/integrations",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${session?.access_token||""}`},
        body:JSON.stringify({provider,config:configs[code]||{}})
      })
      const data=await res.json()
      if(!res.ok||!data.success) throw new Error(data.error||"Unable to save")
      setMessage(`✅ ${provider} connection saved`)
      await load()
    }catch(e){setMessage(`❌ ${e.message}`)}
    finally{setSaving("")}
  }

  function setConfig(code,key,value){
    setConfigs(prev=>({...prev,[code]:{...(prev[code]||{}),[key]:value}}))
  }

  function openWhatsApp(){
    const n=String(configs["whatsapp-invoice"]?.number||"").replace(/\D/g,"")
    if(n.length<10){setMessage("❌ Save a valid WhatsApp number first.");return}
    const msg=window.prompt("WhatsApp message","Hello, thank you for ordering with us.")
    if(msg===null)return
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`,"_blank")
  }

  if(loading)return <main style={shell}><div style={loadingCard}>Loading Restaurant Pro…</div></main>

  return <main style={shell}>
    <div style={wrap}>
      <header style={hero}>
        <div>
          <div style={eyebrow}>RESTAURANT PRO</div>
          <h1 style={title}>{restaurant?.name||"Restaurant"}</h1>
          <p style={muted}>Only features activated by Super Admin are shown here. Inventory and Core stay outside Pro.</p>
        </div>
        <span style={badge}>🔐 Super Admin controlled</span>
      </header>

      {message&&<div style={toast}>{message}</div>}

      {!visible.length ? <div style={empty}><b>No Restaurant Pro feature is active.</b><span>Activate a Pro plugin from Super Admin to make its feature appear here.</span></div> :
        Object.entries(grouped).map(([category,features])=>
          <section key={category} style={section}>
            <div style={sectionHead}><div><div style={eyebrow}>{category.toUpperCase()}</div><h2 style={sectionTitle}>{category}</h2></div><span style={count}>{features.length} active</span></div>
            <div style={grid}>
              {features.map(f=>{
                const [path,label]=FEATURE_PATHS[f.code]||["/dashboard/restaurant-pro", "Feature Settings"]
                const cfg=configs[f.code]||{}
                const isSpecial=SPECIAL.has(f.code)
                const isAgg=f.code==="swiggy-integration"||f.code==="zomato-integration"
                const aggProvider=f.code==="zomato-integration"?"zomato":"swiggy"
                const agg=integrationState.find(x=>x.provider===aggProvider)
                return <article key={f.code} style={card}>
                  <div style={cardTop}>
                    <div style={icon}>{f.icon||"🧩"}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <h3 style={cardTitle}>{f.name}</h3>
                      <p style={muted}>{f.description}</p>
                    </div>
                    <span style={activeBadge}>ACTIVE</span>
                  </div>

                  {isSpecial ? <button style={primary} onClick={()=>setOpen(open===f.code?"":f.code)}>
                    {open===f.code?"Hide Settings":label}
                  </button> :
                  <a href={path} style={primary}>{label}</a>}

                  {open===f.code&&f.code==="whatsapp-invoice"&&<div style={form}>
                    <label style={label}>WhatsApp Number
                      <input style={input} value={cfg.number||""} onChange={e=>setConfig(f.code,"number",e.target.value)} placeholder="919876543210"/>
                    </label>
                    <div style={actions}>
                      <button style={primary} disabled={saving===f.code} onClick={()=>saveSettings(f.code)}>{saving===f.code?"Saving…":"Save Number"}</button>
                      <button style={secondary} onClick={openWhatsApp}>💬 Send Message</button>
                    </div>
                    <small style={note}>Click-to-chat is real. Automated WhatsApp Business messaging requires approved Meta/provider credentials.</small>
                  </div>}

                  {open===f.code&&isAgg&&<div style={form}>
                    <label style={label}>Outlet / Store ID<input style={input} value={cfg.outlet_id||agg?.outlet_code||""} onChange={e=>setConfig(f.code,"outlet_id",e.target.value)}/></label>
                    <label style={label}>Partner API Base URL<input style={input} value={cfg.base_url||""} onChange={e=>setConfig(f.code,"base_url",e.target.value)}/></label>
                    <label style={label}>API Credential<input type="password" style={input} value={cfg.api_key||""} onChange={e=>setConfig(f.code,"api_key",e.target.value)}/></label>
                    <label style={label}>Webhook Secret<input type="password" style={input} value={cfg.webhook_secret||""} onChange={e=>setConfig(f.code,"webhook_secret",e.target.value)}/></label>
                    <button style={primary} disabled={saving===f.code} onClick={()=>saveAggregator(f.code)}>{saving===f.code?"Saving…":`Save ${aggProvider}`}</button>
                    <small style={note}>Connection is active only after official partner credentials/endpoints are supplied. No fake connected status is used.</small>
                  </div>}

                  {open===f.code&&(f.code==="facebook-integration"||f.code==="instagram-integration")&&<div style={form}>
                    <label style={label}>Page / Professional Account ID<input style={input} value={cfg.account_id||""} onChange={e=>setConfig(f.code,"account_id",e.target.value)}/></label>
                    <label style={label}>Access Token<input type="password" style={input} value={cfg.access_token||""} onChange={e=>setConfig(f.code,"access_token",e.target.value)}/></label>
                    <label style={label}>API / Graph Base URL<input style={input} value={cfg.base_url||"https://graph.facebook.com"} onChange={e=>setConfig(f.code,"base_url",e.target.value)}/></label>
                    <button style={primary} disabled={saving===f.code} onClick={()=>saveSettings(f.code)}>{saving===f.code?"Saving…":"Save Connection"}</button>
                    <small style={note}>Publishing is performed only with an approved Meta access token and the permissions granted to that account.</small>
                  </div>}
                </article>
              })}
            </div>
          </section>
        )
      }
    </div>
  </main>
}

const shell={minHeight:"100vh",padding:"28px",background:"var(--background)",color:"var(--text)"}
const wrap={maxWidth:1400,margin:"0 auto"}
const hero={padding:26,borderRadius:24,background:"var(--surface)",border:"1px solid var(--border)",display:"flex",justifyContent:"space-between",gap:18,alignItems:"center",flexWrap:"wrap",marginBottom:16}
const title={fontSize:32,margin:"5px 0 7px",fontWeight:900}
const eyebrow={fontSize:10,fontWeight:900,letterSpacing:1.5,color:"var(--primary)"}
const muted={color:"var(--muted)",lineHeight:1.55,margin:0,fontSize:12}
const badge={padding:"8px 12px",borderRadius:999,background:"rgba(var(--primary-rgb),.09)",fontSize:11,fontWeight:900}
const toast={padding:"11px 14px",borderRadius:12,background:"rgba(var(--primary-rgb),.1)",marginBottom:14}
const section={padding:20,borderRadius:22,background:"var(--surface)",border:"1px solid var(--border)",marginBottom:18}
const sectionHead={display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:14}
const sectionTitle={margin:"4px 0 0",fontSize:20}
const count={fontSize:10,fontWeight:900,padding:"6px 10px",borderRadius:999,background:"rgba(var(--primary-rgb),.08)"}
const grid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(310px,1fr))",gap:14}
const card={padding:17,borderRadius:18,border:"1px solid var(--border)",background:"var(--surface-2)"}
const cardTop={display:"flex",gap:11,alignItems:"flex-start",marginBottom:13}
const icon={width:44,height:44,borderRadius:13,display:"grid",placeItems:"center",fontSize:22,background:"rgba(var(--primary-rgb),.08)",flex:"0 0 auto"}
const cardTitle={fontSize:16,margin:"0 0 4px"}
const activeBadge={fontSize:9,fontWeight:900,color:"#22c55e",background:"rgba(34,197,94,.12)",padding:"5px 7px",borderRadius:999}
const primary={display:"inline-flex",alignItems:"center",justifyContent:"center",border:0,borderRadius:11,padding:"10px 13px",background:"var(--primary)",color:"#111",fontWeight:900,textDecoration:"none",cursor:"pointer"}
const secondary={border:"1px solid var(--border)",borderRadius:11,padding:"10px 13px",background:"var(--surface)",color:"var(--text)",fontWeight:900,cursor:"pointer"}
const form={display:"grid",gap:10,marginTop:12,paddingTop:12,borderTop:"1px solid var(--border)"}
const label={display:"grid",gap:5,fontSize:10,fontWeight:900,color:"var(--muted)"}
const input={padding:"10px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text)"}
const actions={display:"flex",gap:8,flexWrap:"wrap"}
const note={padding:10,borderRadius:10,background:"rgba(var(--primary-rgb),.05)",color:"var(--muted)",lineHeight:1.5}
const empty={maxWidth:650,margin:"15vh auto",padding:30,borderRadius:22,background:"var(--surface)",border:"1px solid var(--border)",display:"grid",gap:8,textAlign:"center"}
const loadingCard={maxWidth:500,margin:"15vh auto",padding:30,textAlign:"center",borderRadius:20,background:"var(--surface)",border:"1px solid var(--border)"}
