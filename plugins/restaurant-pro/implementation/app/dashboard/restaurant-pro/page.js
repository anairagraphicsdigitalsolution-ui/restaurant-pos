"use client"

import { useEffect, useState } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"

export default function RestaurantProPage(){
  const [restaurant,setRestaurant]=useState(null)
  const [enabled,setEnabled]=useState(false)
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState("")

  useEffect(()=>{(async()=>{
    try{
      const {data:{user}}=await supabaseCloud.auth.getUser()
      if(!user){setLoading(false);return}
      const {data:profile,error:pe}=await supabaseCloud.from("profiles").select("restaurant_id,role").eq("id",user.id).maybeSingle()
      if(pe) throw pe
      if(!profile?.restaurant_id){setLoading(false);return}
      const [{data:r,error:re},{data:p,error:pluginError}]=await Promise.all([
        supabaseCloud.from("restaurants").select("id,name").eq("id",profile.restaurant_id).maybeSingle(),
        supabaseCloud.from("restaurant_plugins").select("enabled").eq("restaurant_id",profile.restaurant_id).eq("plugin_code","restaurant-pro").maybeSingle()
      ])
      if(re) throw re
      if(pluginError) throw pluginError
      setRestaurant(r||null)
      setEnabled(p?.enabled===true)
    }catch(e){setMessage(e?.message||"Unable to load Restaurant Pro workspace")}finally{setLoading(false)}
  })()},[])

  if(loading) return <main style={shell}><section style={card}>Loading Restaurant Pro…</section></main>

  return <main style={shell}>
    <div style={wrap}>
      <header style={hero}>
        <div>
          <div style={eyebrow}>ANAIRA • RESTAURANT PRO</div>
          <h1 style={title}>{restaurant?.name||"Restaurant"}</h1>
          <p style={muted}>Premium restaurant workspace. Restaurant Pro has its own boundary and does not own, activate, hide, or execute another plugin's business functions.</p>
        </div>
        <span style={badge}>{enabled?"● PRO ACTIVE":"○ PRO INACTIVE"}</span>
      </header>
      {message&&<div style={toast}>{message}</div>}
      <section style={grid}>
        <article style={card}><div style={icon}>⚡</div><h2 style={h2}>Pro Workspace</h2><p style={muted}>Premium workspace shell and restaurant-level Pro status. Individual plugins keep their own activation, UI, permissions, APIs and data boundaries.</p><div style={status}>{enabled?"Active for this restaurant":"Not activated by Super Admin"}</div></article>
        <article style={card}><div style={icon}>🧩</div><h2 style={h2}>Independent Plugin Architecture</h2><p style={muted}>Operations Hub, Restaurant Suite, Restaurant Core and all dedicated plugins remain independently controlled. Turning Pro on or off does not become a master switch for them.</p></article>
        <article style={card}><div style={icon}>🛡️</div><h2 style={h2}>Protected Core</h2><p style={muted}>Core POS and Restaurant Core remain untouched. POS ordering, KOT, kitchen, billing, payment and offline runtime continue under their existing ownership.</p></article>
      </section>
    </div>
  </main>
}

const shell={minHeight:"100vh",padding:"28px",background:"var(--background)",color:"var(--text)"}
const wrap={maxWidth:1250,margin:"0 auto"}
const hero={padding:28,borderRadius:24,background:"var(--surface)",border:"1px solid var(--border)",display:"flex",justifyContent:"space-between",gap:20,alignItems:"center",flexWrap:"wrap",marginBottom:18}
const eyebrow={fontSize:10,fontWeight:900,letterSpacing:1.7,color:"var(--primary)"}
const title={fontSize:"clamp(30px,4vw,46px)",margin:"7px 0",fontWeight:900}
const muted={color:"var(--muted)",lineHeight:1.65,margin:0,fontSize:13}
const badge={padding:"9px 13px",borderRadius:999,background:"rgba(var(--primary-rgb),.1)",fontSize:11,fontWeight:900}
const grid={display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:16}
const card={padding:22,borderRadius:20,background:"var(--surface)",border:"1px solid var(--border)",minHeight:190}
const icon={width:48,height:48,borderRadius:14,display:"grid",placeItems:"center",fontSize:23,background:"rgba(var(--primary-rgb),.09)",marginBottom:14}
const h2={fontSize:18,margin:"0 0 8px"}
const status={marginTop:18,padding:"10px 12px",borderRadius:11,background:"var(--surface-2)",border:"1px solid var(--border)",fontWeight:800,fontSize:12}
const toast={padding:"12px 14px",borderRadius:12,background:"rgba(var(--primary-rgb),.1)",marginBottom:14}
