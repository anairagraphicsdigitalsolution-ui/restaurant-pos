"use client"

import {useEffect,useState} from "react"
import {supabase} from "@/lib/supabase"
import {PLUGIN_CATALOG} from "@/lib/pluginCatalog"

export default function AdminPlugins(){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[msg,setMsg]=useState("")
 useEffect(()=>{load()},[])
 async function load(){
  const {data:{user}}=await supabase.auth.getUser();if(!user){setLoading(false);return}
  const {data:p}=await supabase.from("profiles").select("restaurant_id,role").eq("id",user.id).maybeSingle()
  if(p?.role!=="admin"){setMsg("Not authorized");setLoading(false);return}
  const {data:installed,error}=await supabase.from("restaurant_plugins").select("plugin_code,enabled").eq("restaurant_id",p.restaurant_id)
  if(error)setMsg(error.message)
  const state={};for(const x of installed||[])state[x.plugin_code]=x.enabled===true
  setRows(PLUGIN_CATALOG.map(x=>({...x,enabled:state[x.code]===true||((x.aliases||[]).some(a=>state[a]===true))})))
  setLoading(false)
 }
 if(loading)return <main style={shell}><div style={card}>Loading plugins…</div></main>
 return <main style={shell}><div style={wrap}><header style={header}><div><div style={eyebrow}>ADMIN · PLUGINS</div><h1>Available Plugins</h1><p style={muted}>This page only shows which plugins are available and active. Plugin integrations and settings are controlled by Super Admin.</p></div></header>{msg&&<div style={msgBox}>❌ {msg}</div>}<div style={grid}>{rows.map(x=><article key={x.code} style={item}><div style={icon}>{x.icon}</div><div style={{flex:1}}><div style={name}>{x.name}</div><p style={muted}>{x.description}</p></div><span style={x.enabled?on:off}>{x.enabled?"ACTIVE":"OFF"}</span></article>)}</div></div></main>
}
const shell={minHeight:"100vh",padding:25,background:"var(--background)",color:"var(--text)"}
const wrap={maxWidth:1100,margin:"0 auto"}
const header={padding:25,borderRadius:22,background:"var(--surface)",border:"1px solid var(--border)",marginBottom:15}
const eyebrow={fontSize:10,fontWeight:900,letterSpacing:1.5,color:"var(--primary)"}
const muted={color:"var(--muted)",lineHeight:1.5,fontSize:12}
const grid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:12}
const item={display:"flex",alignItems:"center",gap:13,padding:16,borderRadius:17,background:"var(--surface)",border:"1px solid var(--border)"}
const icon={width:45,height:45,borderRadius:13,display:"grid",placeItems:"center",fontSize:22,background:"rgba(var(--primary-rgb),.08)"}
const name={fontWeight:900,fontSize:16}
const on={padding:"5px 8px",borderRadius:999,fontSize:9,fontWeight:900,color:"#16a34a",background:"rgba(22,163,74,.12)"}
const off={padding:"5px 8px",borderRadius:999,fontSize:9,fontWeight:900,color:"var(--muted)",background:"rgba(127,127,127,.1)"}
const card={maxWidth:500,margin:"15vh auto",padding:30,borderRadius:20,background:"var(--surface)",border:"1px solid var(--border)"}
const msgBox={padding:12,borderRadius:10,background:"rgba(239,68,68,.08)",marginBottom:12}
