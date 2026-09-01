"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabaseCloud } from "@/lib/supabaseCloud"

export default function WebsiteOrdering(){
 const router=useRouter()
  const [restaurant,setRestaurant]=useState(null)
  const [enabled,setEnabled]=useState(false)
  const [domain,setDomain]=useState("")
  const [msg,setMsg]=useState("")
  const [cfg,setCfg]=useState({})

  useEffect(()=>{load()},[])
  async function load(){
    const {data:{user}}=await supabaseCloud.auth.getUser();if(!user)return
    const {data:p}=await supabaseCloud.from("profiles").select("restaurant_id,role").eq("id",user.id).maybeSingle()
    if(!p?.restaurant_id)return
  if(p.role!=="super_admin"){router.replace("/dashboard/restaurant-pro");return}
    const [{data:r},{data:rows},{data:settings}]=await Promise.all([
      supabaseCloud.from("restaurants").select("id,name,slug").eq("id",p.restaurant_id).maybeSingle(),
      supabaseCloud.from("restaurant_plugins").select("plugin_code,enabled").eq("restaurant_id",p.restaurant_id),
      supabaseCloud.from("plugin_settings").select("config").eq("restaurant_id",p.restaurant_id).eq("plugin_code","website-ordering").maybeSingle()
    ])
    setRestaurant(r);setEnabled((rows||[]).some(x=>["website-ordering","online-ordering"].includes(x.plugin_code)&&x.enabled))
    setCfg(settings?.config||{})
    setDomain(settings?.config?.domain||"")
  }
  async function save(){
    const next={...cfg,domain}
    setCfg(next)
    const {error}=await supabaseCloud.from("plugin_settings").upsert({restaurant_id:restaurant.id,plugin_code:"website-ordering",config:next},{onConflict:"restaurant_id,plugin_code"})
    setMsg(error?`❌ ${error.message}`:"✅ Website ordering settings saved")
  }
  const publicUrl=restaurant?.slug?`${window.location.origin}/${restaurant.slug}/order`:null
  return <main style={shell}><div style={wrap}><section style={card}><div style={eyebrow}>RESTAURANT PRO · WEBSITE</div><h1>Website Ordering</h1><p style={muted}>Orders created from the public website are inserted into the same orders table and follow the same kitchen notification pipeline as QR orders.</p>{enabled?<><label style={label}>Restaurant Website Domain<input style={input} value={domain} onChange={e=>setDomain(e.target.value)} placeholder="https://www.example.com"/></label><button style={button} onClick={save}>Save Website</button><div style={rules}><b>Active rules</b><span>{cfg.order_mode||"both"} · minimum ₹{Number(cfg.minimum_order||0).toFixed(2)} · kitchen {cfg.auto_send_kitchen===false?"OFF":"ON"}</span></div>{msg&&<p>{msg}</p>}<div style={urlBox}>Public ordering URL: <b>{publicUrl||"Restaurant slug required"}</b></div></>:<p style={muted}>Super Admin must activate Website Ordering.</p>}</section></div></main>
}
const shell={minHeight:"100vh",padding:28,background:"var(--background)",color:"var(--text)"}
const wrap={maxWidth:850,margin:"0 auto"}
const card={padding:28,borderRadius:22,background:"var(--surface)",border:"1px solid var(--border)"}
const eyebrow={fontSize:10,fontWeight:900,letterSpacing:1.5,color:"var(--primary)"}
const muted={color:"var(--muted)",lineHeight:1.6}
const label={display:"grid",gap:6,fontSize:11,fontWeight:900,color:"var(--muted)",marginTop:18}
const input={padding:12,borderRadius:11,border:"1px solid var(--border)",background:"var(--surface-2)",color:"var(--text)"}
const button={marginTop:12,border:0,borderRadius:11,padding:"11px 15px",background:"var(--primary)",color:"#111",fontWeight:900}
const urlBox={marginTop:18,padding:13,borderRadius:12,background:"rgba(var(--primary-rgb),.06)"}
const rules={display:"grid",gap:4,marginTop:12,padding:12,borderRadius:12,background:"var(--surface-2)",fontSize:11,color:"var(--muted)"}
