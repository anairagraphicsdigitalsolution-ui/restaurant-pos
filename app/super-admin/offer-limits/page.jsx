"use client"

import { useEffect,useState } from "react"
import { supabase } from "@/lib/supabase"

export default function OfferLimitsPage(){
  const [plans,setPlans]=useState([]),[limits,setLimits]=useState({}),[msg,setMsg]=useState("")
  useEffect(()=>{load()},[])
  async function load(){
    const {data:ps}=await supabase.from("plans").select("id,name").order("name")
    const {data:ls}=await supabase.from("plan_feature_limits").select("plan_id,monthly_limit").eq("plugin_code","offers")
    setPlans(ps||[])
    const m={};for(const x of ls||[])m[x.plan_id]=x.monthly_limit
    setLimits(m)
  }
  async function save(planId){
    const raw=limits[planId]
    const monthly_limit=raw===""||raw==null?null:Math.max(0,Number(raw))
    const {error}=await supabase.from("plan_feature_limits").upsert({plan_id:planId,plugin_code:"offers",monthly_limit},{onConflict:"plan_id,plugin_code"})
    setMsg(error?`❌ ${error.message}`:`✅ ${plans.find(p=>p.id===planId)?.name||"Plan"} offer limit saved`)
  }
  return <main style={shell}><div style={wrap}><header style={header}><div><div style={eyebrow}>SUPER ADMIN · PLAN CONTROL</div><h1>Offers & Combo Limits</h1><p style={muted}>Set how many offers a restaurant can create in the current month. Blank = unlimited, 0 = disabled.</p></div></header>{msg&&<div style={msgBox}>{msg}</div>}{plans.map(p=><section key={p.id} style={card}><div><b>{p.name}</b><p style={muted}>Monthly offer creation limit</p></div><input style={input} type="number" min="0" value={limits[p.id]??""} placeholder="Unlimited" onChange={e=>setLimits(x=>({...x,[p.id]:e.target.value}))}/><button style={button} onClick={()=>save(p.id)}>Save Limit</button></section>)}</div></main>
}
const shell={minHeight:"100vh",padding:28,background:"var(--background)",color:"var(--text)"}
const wrap={maxWidth:850,margin:"0 auto"}
const header={padding:25,borderRadius:22,background:"var(--surface)",border:"1px solid var(--border)",marginBottom:15}
const eyebrow={fontSize:10,fontWeight:900,letterSpacing:1.5,color:"var(--primary)"}
const muted={color:"var(--muted)",lineHeight:1.5}
const card={display:"grid",gridTemplateColumns:"1fr 180px auto",gap:12,alignItems:"center",padding:17,borderRadius:16,background:"var(--surface)",border:"1px solid var(--border)",marginBottom:10}
const input={padding:10,borderRadius:10,border:"1px solid var(--border)",background:"var(--surface-2)",color:"var(--text)"}
const button={border:0,borderRadius:10,padding:"10px 13px",background:"var(--primary)",color:"#111",fontWeight:900}
const msgBox={padding:12,borderRadius:10,background:"rgba(var(--primary-rgb),.1)",marginBottom:12}
