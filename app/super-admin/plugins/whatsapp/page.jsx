"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function WhatsAppConfig(){
  const params=useSearchParams()
  const rid=params.get("rid")
  const [number,setNumber]=useState("")
  const [enabled,setEnabled]=useState(null)
  const [saving,setSaving]=useState(false)
  const [saved,setSaved]=useState(false)

  useEffect(()=>{if(rid)load()},[rid])

  async function load(){
    const {data:plugin}=await supabase.from("restaurant_plugins")
      .select("enabled").eq("restaurant_id",rid).in("plugin_code",["whatsapp","whatsapp-invoice"]).eq("enabled",true).limit(1)
    if(!plugin?.enabled){setEnabled(false);return}
    setEnabled(true)
    const {data}=await supabase.from("plugin_settings").select("*")
      .eq("restaurant_id",rid).in("plugin_code",["whatsapp","whatsapp-invoice"]).eq("enabled",true).limit(1)
    setNumber(data?.config?.number||"")
  }

  async function save(){
    if(!number.trim()) return
    setSaving(true);setSaved(false)
    const {error}=await supabase.from("plugin_settings").upsert({
      restaurant_id:rid,plugin_code:"whatsapp",config:{number:number.trim()}
    },{onConflict:"restaurant_id,plugin_code"})
    setSaving(false)
    if(error){alert(error.message);return}
    setSaved(true);setTimeout(()=>setSaved(false),1800)
  }

  if(enabled===null)return <main style={shell}><div style={stateCard}>Loading WhatsApp plugin…</div></main>
  if(!enabled)return <main style={shell}><div style={stateCard}><div style={bigIcon}>🔒</div><h2>WhatsApp is locked</h2><p>Super Admin must activate the WhatsApp plugin for this restaurant.</p></div></main>

  return <main style={shell}>
    <div style={wrap}>
      <header style={hero}>
        <div style={eyebrow}>SUPER ADMIN · INTEGRATION PLUGIN</div>
        <h1 style={title}>WhatsApp Settings</h1>
        <p style={muted}>Configure the restaurant WhatsApp destination used by invoices, notifications and customer communication.</p>
        <div style={badges}><span style={badge}>📲 Plugin Active</span><span style={badge}>🔐 Super Admin</span></div>
      </header>

      <div style={layout}>
        <section style={panel}>
          <div style={sectionIcon}>📲</div>
          <div style={eyebrow}>DESTINATION</div>
          <h2 style={sectionTitle}>Business WhatsApp Number</h2>
          <p style={muted}>Use international format without spaces. Example: 919876543210</p>
          <label style={label}>WhatsApp number</label>
          <input value={number} onChange={e=>setNumber(e.target.value.replace(/\s/g,""))} placeholder="919876543210" style={textInput}/>
          <button onClick={save} disabled={saving} style={saveBtn}>{saving?"Saving…":saved?"✓ Saved":"Save Settings"}</button>
        </section>

        <aside style={panel}>
          <div style={eyebrow}>PLUGIN STATUS</div>
          <div style={statusLine}><span>Plugin</span><b style={{color:"var(--success)"}}>● Active</b></div>
          <div style={statusLine}><span>Restaurant</span><b>{rid||"—"}</b></div>
          <div style={statusLine}><span>Configured</span><b>{number?"Yes":"Not yet"}</b></div>
          <div style={tip}>💡 Keep the number in country-code format so links and automated messages resolve correctly.</div>
        </aside>
      </div>
    </div>
  </main>
}

const shell={minHeight:"100vh",padding:24,background:"var(--background)",color:"var(--text)"}
const wrap={maxWidth:1100,margin:"0 auto"}
const hero={padding:28,borderRadius:24,background:"linear-gradient(135deg,var(--surface),rgba(var(--primary-rgb),.06))",border:"1px solid var(--border)",marginBottom:14}
const eyebrow={fontSize:10,fontWeight:900,letterSpacing:1.5,color:"var(--primary)"}
const title={fontSize:34,margin:"6px 0 8px"}
const muted={margin:0,color:"var(--muted)",lineHeight:1.6}
const badges={display:"flex",gap:8,marginTop:16,flexWrap:"wrap"}
const badge={padding:"7px 10px",borderRadius:999,background:"rgba(var(--primary-rgb),.08)",border:"1px solid rgba(var(--primary-rgb),.15)",fontSize:10,fontWeight:800}
const layout={display:"grid",gridTemplateColumns:"1.5fr 1fr",gap:14}
const panel={padding:22,borderRadius:20,background:"var(--surface)",border:"1px solid var(--border)"}
const sectionIcon={width:50,height:50,borderRadius:15,display:"grid",placeItems:"center",fontSize:24,background:"rgba(var(--primary-rgb),.09)",marginBottom:15}
const sectionTitle={margin:"5px 0 5px",fontSize:22}
const label={display:"block",fontSize:11,fontWeight:900,marginTop:20,marginBottom:7,color:"var(--muted)"}
const textInput={width:"100%",boxSizing:"border-box",padding:"13px 14px",borderRadius:12,border:"1px solid var(--border)",background:"var(--background)",color:"var(--text)",outline:"none"}
const saveBtn={marginTop:12,padding:"11px 15px",border:0,borderRadius:11,background:"var(--primary)",color:"#fff",fontWeight:900,cursor:"pointer"}
const statusLine={display:"flex",justifyContent:"space-between",gap:10,padding:"12px 0",borderBottom:"1px solid var(--border)",fontSize:12}
const tip={marginTop:15,padding:12,borderRadius:12,background:"rgba(var(--primary-rgb),.06)",color:"var(--muted)",fontSize:11,lineHeight:1.5}
const stateCard={maxWidth:600,margin:"15vh auto",padding:35,textAlign:"center",borderRadius:22,background:"var(--surface)",border:"1px solid var(--border)"}
const bigIcon={fontSize:48}
