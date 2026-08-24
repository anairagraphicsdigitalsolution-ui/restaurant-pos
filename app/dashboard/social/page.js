"use client"

import {useEffect,useState} from "react"
import {supabase} from "@/lib/supabase"

export default function SocialPage(){
 const [rid,setRid]=useState(""),[active,setActive]=useState({}),[cfg,setCfg]=useState({}),[platform,setPlatform]=useState("facebook"),[message,setMessage]=useState(""),[image,setImage]=useState(""),[msg,setMsg]=useState("")
 useEffect(()=>{load()},[])
 async function load(){
  const {data:{user}}=await supabase.auth.getUser();if(!user)return
  const {data:p}=await supabase.from("profiles").select("restaurant_id").eq("id",user.id).maybeSingle();if(!p?.restaurant_id)return
  setRid(p.restaurant_id)
  const {data:r}=await supabase.from("restaurant_plugins").select("plugin_code,enabled").eq("restaurant_id",p.restaurant_id).in("plugin_code",["facebook-integration","instagram-integration"])
  const a={};for(const x of r||[])a[x.plugin_code]=x.enabled===true;setActive(a)
  const {data:s}=await supabase.from("plugin_settings").select("plugin_code,config").eq("restaurant_id",p.restaurant_id).in("plugin_code",["facebook-integration","instagram-integration"])
  const c={};for(const x of s||[])c[x.plugin_code]=x.config||{};setCfg(c)
 }
 async function save(code){
  const {error}=await supabase.from("plugin_settings").upsert({restaurant_id:rid,plugin_code:code,config:cfg[code]||{}},{onConflict:"restaurant_id,plugin_code"})
  setMsg(error?`❌ ${error.message}`:"✅ Connection saved")
 }
 async function publish(){
  const code=`${platform}-integration`
  if(!active[code])return setMsg(`❌ ${platform} plugin is not active`)
  const r=await fetch("/api/social/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({platform,message,image_url:image})})
  const d=await r.json();setMsg(r.ok&&d.success?"✅ Published successfully":`❌ ${d.error||"Publish failed"}`)
 }
 return <main style={shell}><div style={wrap}><section style={card}><div style={eyebrow}>RESTAURANT PRO · MARKETING</div><h1>Facebook & Instagram</h1><p style={muted}>Connect approved Meta accounts and publish restaurant offers/campaign messages from this panel.</p>{["facebook","instagram"].map(x=><div key={x} style={sub}><h3>{x==="facebook"?"📘 Facebook Page":"📸 Instagram Professional Account"}</h3><label style={label}>Account ID<input style={input} value={cfg[`${x}-integration`]?.account_id||""} onChange={e=>setCfg(c=>({...c,[`${x}-integration`]:{...(c[`${x}-integration`]||{}),account_id:e.target.value}}))}/></label><label style={label}>Access Token<input type="password" style={input} value={cfg[`${x}-integration`]?.access_token||""} onChange={e=>setCfg(c=>({...c,[`${x}-integration`]:{...(c[`${x}-integration`]||{}),access_token:e.target.value}}))}/></label><button style={button} onClick={()=>save(`${x}-integration`)}>Save {x}</button></div>)}<hr/><select style={input} value={platform} onChange={e=>setPlatform(e.target.value)}><option value="facebook">Facebook</option><option value="instagram">Instagram</option></select><textarea style={input} rows={5} placeholder="Offer / campaign message…" value={message} onChange={e=>setMessage(e.target.value)}/><input style={input} placeholder="Public image URL (required for Instagram)" value={image} onChange={e=>setImage(e.target.value)}/><button style={button} onClick={publish}>📣 Publish Offer</button>{msg&&<p>{msg}</p>}</section></div></main>
}
const shell={minHeight:"100vh",padding:28,background:"var(--background)",color:"var(--text)"}
const wrap={maxWidth:900,margin:"0 auto"}
const card={padding:25,borderRadius:22,background:"var(--surface)",border:"1px solid var(--border)"}
const sub={padding:"14px 0",borderBottom:"1px solid var(--border)"}
const eyebrow={fontSize:10,fontWeight:900,letterSpacing:1.5,color:"var(--primary)"}
const muted={color:"var(--muted)",lineHeight:1.6}
const label={display:"grid",gap:5,fontSize:10,fontWeight:900,color:"var(--muted)",marginTop:8}
const input={width:"100%",boxSizing:"border-box",padding:11,borderRadius:10,border:"1px solid var(--border)",background:"var(--surface-2)",color:"var(--text)",marginTop:8}
const button={marginTop:10,border:0,borderRadius:10,padding:"10px 14px",background:"var(--primary)",color:"#111",fontWeight:900}
