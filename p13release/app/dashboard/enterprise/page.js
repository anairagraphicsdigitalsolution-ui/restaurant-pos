"use client"
import { useEffect, useState } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"

const card={background:"white",border:"1px solid #e5eaf0",borderRadius:16,padding:18,boxShadow:"0 8px 25px rgba(20,32,51,.05)"}
export default function EnterprisePage(){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("")
 useEffect(()=>{(async()=>{try{const {data:u}=await supabaseCloud.auth.getUser();if(!u?.user)throw Error("Please sign in again.");const {data:s}=await supabaseCloud.auth.getSession();const token=s?.session?.access_token;if(!token)throw Error("Session token unavailable.");
 const {data:members,error:me}=await supabaseCloud.from("enterprise_members").select("enterprise_id").eq("user_id",u.user.id).limit(1);if(me)throw me;if(!members?.[0]){setData({empty:true});return}
 const r=await fetch(`/api/enterprise/summary?enterprise_id=${encodeURIComponent(members[0].enterprise_id)}`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});const p=await r.json();if(!r.ok||!p.success)throw Error(p.error||"Unable to load enterprise");setData(p)
 }catch(e){setError(e.message||"Unable to load enterprise")}finally{setLoading(false)}})()},[])
 if(loading)return <main style={{padding:30}}>Loading Enterprise Control Center…</main>
 if(error)return <main style={{padding:30}}><div style={{...card,color:"#991b1b"}}>{error}</div></main>
 if(data?.empty)return <main style={{padding:30}}><div style={card}><h1>Enterprise Control Center</h1><p>Your account is not linked to an enterprise group yet.</p></div></main>
 const outlets=data.outlets||[],members=data.members||[],catalog=data.catalog||[],transfers=data.transfers||[],devices=data.devices||[]
 return <main style={{minHeight:"100vh",padding:"28px clamp(14px,3vw,40px) 50px",background:"var(--background,#f6f8fb)"}}>
  <div style={{marginBottom:24}}><div style={{fontSize:12,fontWeight:800,letterSpacing:1.5,opacity:.65}}>ANAIRA ENTERPRISE</div><h1 style={{margin:"6px 0"}}>{data.enterprise?.name||"Enterprise Control Center"}</h1><p style={{margin:0,opacity:.68}}>Multi-outlet control, central menu, inventory transfers, devices and governance.</p></div>
  <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14,marginBottom:16}}>{[["Outlets",outlets.length],["Members",members.length],["Central Menu",catalog.length],["Transfers",transfers.length],["Devices",devices.length]].map(([a,b])=><div style={card} key={a}><div style={{opacity:.65,fontSize:13}}>{a}</div><strong style={{fontSize:30}}>{b}</strong></div>)}</section>
  <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:16}}>
   <div style={card}><h2>Outlets</h2>{outlets.length?<ul>{outlets.map(o=><li key={o.id} style={{padding:"8px 0"}}>{o.outlet_name||o.restaurant_id} {o.outlet_code&&<small> · {o.outlet_code}</small>}</li>)}</ul>:<p>No outlets linked yet.</p>}</div>
   <div style={card}><h2>Enterprise Roles</h2>{members.length?<ul>{members.map(m=><li key={m.id} style={{padding:"8px 0"}}>{m.role} <small>· {m.user_id}</small></li>)}</ul>:<p>No members.</p>}</div>
   <div style={card}><h2>Central Menu</h2>{catalog.length?<ul>{catalog.slice(0,12).map(c=><li key={c.id} style={{padding:"8px 0"}}>{c.name} <small>· ₹{Number(c.base_price||0).toLocaleString("en-IN")}</small></li>)}</ul>:<p>No central menu items yet.</p>}</div>
   <div style={card}><h2>Inventory Transfers</h2>{transfers.length?<ul>{transfers.slice(0,12).map(t=><li key={t.id} style={{padding:"8px 0"}}>{t.item_name} × {t.quantity} <small>· {t.status}</small></li>)}</ul>:<p>No active transfers.</p>}</div>
   <div style={card}><h2>Device Management</h2>{devices.length?<ul>{devices.map(d=><li key={d.id} style={{padding:"8px 0"}}>{d.device_name||d.device_key} <small>· {d.device_type} · {d.status}</small></li>)}</ul>:<p>No devices registered.</p>}</div>
  </section>
 </main>
}
