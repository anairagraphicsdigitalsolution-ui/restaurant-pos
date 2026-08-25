"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const EMPTY={
  number:"", credential_owner:"restaurant", phone_number_id:"", access_token:"", webhook_verify_token:"", webhook_app_secret:"",
  order_notification_recipient:"", test_recipient:"", order_template_name:"order_confirmation", qr_order_template_name:"new_qr_order", invoice_template_name:"invoice_notification", invoice_template_language:"en_US",
  send_qr_order_notification:true, send_order_confirmation:true
}

export default function WhatsAppConfig(){
  const params=useSearchParams(); const rid=params.get("rid")
  const [config,setConfig]=useState(EMPTY); const [enabled,setEnabled]=useState(null); const [saving,setSaving]=useState(false); const [saved,setSaved]=useState(false)
  useEffect(()=>{if(rid)load()},[rid])
  async function load(){
    const {data:pluginRows,error:pluginError}=await supabase.from("restaurant_plugins").select("enabled").eq("restaurant_id",rid).in("plugin_code",["whatsapp-invoice","whatsapp"]).eq("enabled",true).limit(1)
    if(pluginError){console.error(pluginError);setEnabled(false);return}
    if(!pluginRows?.[0]?.enabled){setEnabled(false);return}
    setEnabled(true)
    const {data,error}=await supabase.from("plugin_settings").select("config").eq("restaurant_id",rid).in("plugin_code",["whatsapp-invoice","whatsapp"]).limit(1)
    if(error){console.error(error);return}
    setConfig({...EMPTY,...(data?.[0]?.config||{})})
  }
  function set(key,value){setConfig(c=>({...c,[key]:value}))}
  async function save(){
    if(!rid)return
    if(config.credential_owner==="restaurant" && (!config.phone_number_id.trim() || !config.access_token.trim())) return alert("For restaurant-owned Cloud API, Phone Number ID and Access Token are required.")
    if(!config.order_notification_recipient && config.send_qr_order_notification) return alert("Add the restaurant/staff WhatsApp recipient for new-order notifications.")
    setSaving(true);setSaved(false)
    const {error}=await supabase.from("plugin_settings").upsert({restaurant_id:rid,plugin_code:"whatsapp-invoice",config},{onConflict:"restaurant_id,plugin_code"})
    setSaving(false); if(error){alert(error.message);return} setSaved(true);setTimeout(()=>setSaved(false),1800)
  }
  if(enabled===null)return <main style={shell}><div style={stateCard}>Loading WhatsApp plugin…</div></main>
  if(!enabled)return <main style={shell}><div style={stateCard}><div style={bigIcon}>🔒</div><h2>WhatsApp is locked</h2><p>Super Admin must activate the WhatsApp plugin for this restaurant.</p></div></main>
  return <main style={shell}><div style={wrap}>
    <header style={hero}><div style={eyebrow}>SUPER ADMIN · WHATSAPP CLOUD API PRO</div><h1 style={title}>WhatsApp Settings</h1><p style={muted}>Multi-restaurant ready. Each restaurant can use its own Meta Cloud API credentials, or the platform can provide shared credentials later.</p><div style={badges}><span style={badge}>📲 Plugin Active</span><span style={badge}>🏢 Restaurant scoped</span><span style={badge}>🔐 Credential ready</span></div></header>
    <div style={grid}>
      <section style={panel}>
        <div style={eyebrow}>CREDENTIAL MODE</div><h2 style={sectionTitle}>Who owns the WhatsApp API?</h2>
        <select value={config.credential_owner} onChange={e=>set("credential_owner",e.target.value)} style={input}><option value="restaurant">Restaurant-owned Meta WABA</option><option value="platform">Platform-owned Meta WABA</option></select>
        <p style={hint}>{config.credential_owner==="platform"?"The platform environment variables are used. You can configure this restaurant now and attach platform credentials later.":"This restaurant will send from its own WhatsApp Business phone number."}</p>
        <Field label="WhatsApp Business Number"><input value={config.number} onChange={e=>set("number",e.target.value.replace(/\s/g,""))} placeholder="919876543210" style={input}/></Field>
        <Field label="Meta Phone Number ID"><input value={config.phone_number_id} onChange={e=>set("phone_number_id",e.target.value)} placeholder="123456789012345" style={input}/></Field>
        {config.credential_owner==="restaurant" && <Field label="Cloud API Access Token"><input type="password" value={config.access_token} onChange={e=>set("access_token",e.target.value)} placeholder="Paste Meta access token" style={input}/></Field>}
        <Field label="Webhook Verify Token"><input value={config.webhook_verify_token} onChange={e=>set("webhook_verify_token",e.target.value)} placeholder="Create your own verify token" style={input}/></Field>
        <Field label="Webhook App Secret"><input type="password" value={config.webhook_app_secret} onChange={e=>set("webhook_app_secret",e.target.value)} placeholder="Meta App Secret" style={input}/></Field>
      </section>
      <section style={panel}>
        <div style={eyebrow}>ORDER AUTOMATION</div><h2 style={sectionTitle}>Restaurant + Customer messages</h2>
        <Field label="Restaurant notification recipient"><input value={config.order_notification_recipient} onChange={e=>set("order_notification_recipient",e.target.value.replace(/\D/g,""))} placeholder="919876543210" style={input}/></Field>
        <Field label="New QR order template"><input value={config.qr_order_template_name} onChange={e=>set("qr_order_template_name",e.target.value)} style={input}/></Field>
        <Field label="Customer confirmation template"><input value={config.order_template_name} onChange={e=>set("order_template_name",e.target.value)} style={input}/></Field>
        <Field label="Invoice template"><input value={config.invoice_template_name} onChange={e=>set("invoice_template_name",e.target.value)} style={input}/></Field>
        <Field label="Template language"><input value={config.invoice_template_language} onChange={e=>set("invoice_template_language",e.target.value)} placeholder="en_US" style={input}/></Field>
        <label style={check}><input type="checkbox" checked={config.send_qr_order_notification!==false} onChange={e=>set("send_qr_order_notification",e.target.checked)}/> Send new QR order to restaurant</label>
        <label style={check}><input type="checkbox" checked={config.send_order_confirmation!==false} onChange={e=>set("send_order_confirmation",e.target.checked)}/> Send order confirmation to customer</label>
        <div style={tip}>WhatsApp messages are sent from the restaurant's registered Business number. A customer's personal WhatsApp cannot be silently used as the sender. If Cloud API credentials are missing, the order still succeeds and a user-confirmed <b>wa.me</b> fallback can be offered.</div>
      </section>
    </div>
    <section style={{...panel,marginTop:14}}><div style={statusLine}><span>Runtime</span><b style={{color:"var(--success)"}}>Plugin active · restaurant scoped</b></div><div style={statusLine}><span>Cloud API</span><b>{config.phone_number_id && (config.credential_owner==="platform" || config.access_token) ? "Configured" : "Ready for credentials"}</b></div><div style={statusLine}><span>Webhook</span><b>{config.webhook_verify_token ? "Verify token configured" : "Ready for Meta webhook"}</b></div><button onClick={save} disabled={saving} style={saveBtn}>{saving?"Saving…":saved?"✓ Saved":"Save WhatsApp Configuration"}</button></section>
  </div></main>
}
function Field({label,children}){return <label style={labelStyle}><span>{label}</span>{children}</label>}
const shell={minHeight:"100vh",padding:24,background:"var(--background)",color:"var(--text)"};const wrap={maxWidth:1120,margin:"0 auto"};const hero={padding:28,borderRadius:24,background:"linear-gradient(135deg,var(--surface),rgba(var(--primary-rgb),.06))",border:"1px solid var(--border)",marginBottom:14};const eyebrow={fontSize:10,fontWeight:900,letterSpacing:1.5,color:"var(--primary)"};const title={fontSize:36,margin:"6px 0 8px"};const muted={margin:0,color:"var(--muted)",lineHeight:1.6};const badges={display:"flex",gap:8,marginTop:16,flexWrap:"wrap"};const badge={padding:"7px 10px",borderRadius:999,background:"rgba(var(--primary-rgb),.08)",border:"1px solid rgba(var(--primary-rgb),.15)",fontSize:10,fontWeight:800};const grid={display:"grid",gridTemplateColumns:"1fr 1fr",gap:14};const panel={padding:22,borderRadius:20,background:"var(--surface)",border:"1px solid var(--border)"};const sectionTitle={margin:"5px 0 12px",fontSize:22};const labelStyle={display:"block",fontSize:11,fontWeight:900,marginTop:16,color:"var(--muted)"};const input={display:"block",width:"100%",boxSizing:"border-box",marginTop:7,padding:"13px 14px",borderRadius:12,border:"1px solid var(--border)",background:"var(--background)",color:"var(--text)",outline:"none"};const hint={fontSize:11,color:"var(--muted)",lineHeight:1.5};const check={display:"flex",gap:9,alignItems:"center",marginTop:15,fontSize:12};const tip={marginTop:18,padding:13,borderRadius:12,background:"rgba(var(--primary-rgb),.06)",color:"var(--muted)",fontSize:11,lineHeight:1.55};const statusLine={display:"flex",justifyContent:"space-between",gap:10,padding:"12px 0",borderBottom:"1px solid var(--border)",fontSize:12};const saveBtn={marginTop:16,padding:"12px 16px",border:0,borderRadius:12,background:"var(--primary)",color:"#fff",fontWeight:900,cursor:"pointer"};const stateCard={maxWidth:600,margin:"15vh auto",padding:35,textAlign:"center",borderRadius:22,background:"var(--surface)",border:"1px solid var(--border)"};const bigIcon={fontSize:48}
