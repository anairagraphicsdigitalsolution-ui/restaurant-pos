"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function PrintingPage(){
  const [rid,setRid]=useState("")
  const [configs,setConfigs]=useState({})
  const [msg,setMsg]=useState("")
  useEffect(()=>{load()},[])
  async function load(){
    const {data:{user}}=await supabase.auth.getUser();if(!user)return
    const {data:p}=await supabase.from("profiles").select("restaurant_id").eq("id",user.id).maybeSingle()
    if(!p?.restaurant_id)return
    setRid(p.restaurant_id)
    const {data}=await supabase.from("plugin_settings").select("plugin_code,config").eq("restaurant_id",p.restaurant_id)
    const c={};for(const x of data||[])c[x.plugin_code]=x.config||{}
    setConfigs(c)
  }
  function update(code,key,value){setConfigs(x=>({...x,[code]:{...(x[code]||{}),[key]:value}}))}
  async function save(code){
    const {error}=await supabase.from("plugin_settings").upsert({restaurant_id:rid,plugin_code:code,config:configs[code]||{}},{onConflict:"restaurant_id,plugin_code"})
    setMsg(error?`❌ ${error.message}`:`✅ ${code} saved`)
  }
  return <main style={shell}><div style={wrap}><header style={header}><div><div style={eyebrow}>RESTAURANT PRO · HARDWARE</div><h1 style={title}>Printing Center</h1><p style={muted}>Configure receipt, KOT and A4 printer profiles. Browser printing is immediate; hardware/ESC-POS requires the printer bridge or local agent supplied for the device.</p></div></header>{msg&&<div style={msgBox}>{msg}</div>}
    {[
      ["thermal-printing","🖨️ Thermal / KOT Printer","Printer name / local agent URL","thermal"],
      ["a4-invoice","📄 A4 Invoice Printer","Printer name / local agent URL","a4"],
      ["hardware-print-queue","📋 Hardware Print Queue","Print service / agent URL","queue"]
    ].map(([code,name,label,key])=><section key={code} style={card}><h2>{name}</h2><label style={labelStyle}>{label}<input style={input} value={configs[code]?.[key]||""} onChange={e=>update(code,key,e.target.value)}/></label><label style={labelStyle}>Printer IP / Bridge URL<input style={input} value={configs[code]?.bridge_url||""} onChange={e=>update(code,"bridge_url",e.target.value)} placeholder="http://127.0.0.1:9100"/></label><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
<button style={button} onClick={()=>save(code)}>Save Printer Configuration</button>
<button style={secondary} onClick={async()=>{
 const r=await fetch("/api/printing/print",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({printer_code:code,type:key==="thermal"?"test-kot":"test",content:"ANAIRA TEST PRINT"})})
 const d=await r.json();setMsg(d.success?"✅ Test print sent to printer bridge":`❌ ${d.error||"Test print failed"}`)
}}>🖨 Test Print</button></div></section>)}</div></main>
}
const shell={minHeight:"100vh",padding:28,background:"var(--background)",color:"var(--text)"}
const wrap={maxWidth:900,margin:"0 auto",display:"grid",gap:15}
const header={padding:24,borderRadius:22,background:"var(--surface)",border:"1px solid var(--border)"}
const card={padding:20,borderRadius:18,background:"var(--surface)",border:"1px solid var(--border)"}
const title={fontSize:30,margin:"4px 0"}
const eyebrow={fontSize:10,fontWeight:900,letterSpacing:1.5,color:"var(--primary)"}
const muted={color:"var(--muted)",lineHeight:1.6}
const labelStyle={display:"grid",gap:6,fontSize:11,fontWeight:900,color:"var(--muted)",marginTop:10}
const input={padding:"11px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--surface-2)",color:"var(--text)"}
const secondary={border:"1px solid var(--border)",borderRadius:11,padding:"10px 14px",background:"var(--surface)",color:"var(--text)",fontWeight:900,cursor:"pointer"}
const button={border:0,borderRadius:11,padding:"10px 14px",background:"var(--primary)",color:"#111",fontWeight:900,cursor:"pointer",marginTop:12}
const msgBox={padding:12,borderRadius:12,background:"rgba(var(--primary-rgb),.1)"}
