"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function CallingDevicePage(){
  const [restaurantId,setRestaurantId]=useState("")
  const [enabled,setEnabled]=useState(false)
  const [notices,setNotices]=useState([])
  const [voice,setVoice]=useState(true)
  const [repeat,setRepeat]=useState(3)
  const [volume,setVolume]=useState(1)
  const [rate,setRate]=useState(.9)
  const [language,setLanguage]=useState("en-IN")
  const [phrase,setPhrase]=useState("New order received. Order {order_number} has arrived.")
  const [events,setEvents]=useState({new_order:true,order_ready:false,waiter_call:true})
  const seen=useRef(new Set())

  useEffect(()=>{init()},[])

  async function init(){
    const {data:{user}}=await supabase.auth.getUser()
    if(!user)return
    const {data:profile}=await supabase.from("profiles").select("restaurant_id").eq("id",user.id).maybeSingle()
    const rid=profile?.restaurant_id
    if(!rid)return
    setRestaurantId(rid)

    const {data:row}=await supabase.from("restaurant_plugins").select("enabled")
      .eq("restaurant_id",rid).in("plugin_code",["calling-device","calling-runtime"]).eq("enabled",true).limit(1).maybeSingle()
    setEnabled(row?.enabled===true)
    const {data:settings}=await supabase.from("plugin_settings").select("config")
      .eq("restaurant_id",rid).eq("plugin_code","calling-device").maybeSingle()
    const cfg=settings?.config||{}
    setVoice(cfg.enabled !== false)
    setRepeat(Math.max(1,Number(cfg.repeat||3)))
    setVolume(Math.max(0,Math.min(1,Number(cfg.volume ?? 1))))
    setRate(Math.max(.5,Math.min(2,Number(cfg.rate||.9))))
    setLanguage(cfg.language||"en-IN")
    setPhrase(cfg.phrase||"New order received. Order {order_number} has arrived.")
    setEvents({new_order:cfg.new_order!==false,order_ready:cfg.order_ready===true,waiter_call:cfg.waiter_call!==false})
  }

  useEffect(()=>{
    if(!restaurantId||!enabled)return
    const channel=supabase.channel(`calling-${restaurantId}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:`restaurant_id=eq.${restaurantId}`},payload=>{
        const row=payload.new
        if(!row?.id||seen.current.has(row.id))return
        seen.current.add(row.id)
        setNotices(n=>[row,...n].slice(0,30))
        speak(row)
      }).subscribe()
    return()=>{void supabase.removeChannel(channel)}
  },[restaurantId,enabled,repeat,voice,volume])

  function speak(row){
    if(!voice||typeof window==="undefined"||!("speechSynthesis" in window))return
    const type=String(row.type||"order")
    if(type==="order" && !events.new_order) return
    if(type==="success" && !events.order_ready) return
    const raw=String(row.message||"A new order has arrived in the kitchen.")
    const orderMatch=raw.match(/Order\s+#?([a-f0-9]{4,})/i)
    const orderNumber=orderMatch?.[1]||""
    const prefix=phrase.replace("{order_number}",orderNumber)
    const text=prefix && type==="order" ? prefix : `${row.title||"New order received"}. ${raw}`
    window.speechSynthesis.cancel()
    let i=0
    const run=()=>{
      if(i>=repeat)return
      const u=new SpeechSynthesisUtterance(text)
      u.lang=language
      u.volume=volume
      u.rate=rate
      u.onend=()=>{i++;setTimeout(run,250)}
      window.speechSynthesis.speak(u)
    }
    run()
  }

  function test(){
    speak({title:"New order received",message:"A new order has arrived in the kitchen."})
  }

  if(!enabled)return <main style={shell}><div style={card}><h2>Calling Device is not active</h2><p>Super Admin must activate Calling Device in Plugins.</p></div></main>

  return <main style={shell}><div style={wrap}>
    <header style={header}><div><div style={eyebrow}>RESTAURANT PRO · CALLING</div><h1 style={title}>Calling Device</h1><p style={muted}>Use this browser/device as the restaurant voice calling station.</p></div><span style={live}>● LIVE</span></header>
    <section style={card}>
      <h2>Voice Settings</h2>
      <label style={row}><span>Voice announcements</span><input type="checkbox" checked={voice} onChange={e=>setVoice(e.target.checked)}/></label>
      <label style={row}><span>Repeat announcement</span><select value={repeat} onChange={e=>setRepeat(Number(e.target.value))}>{[1,2,3,4,5].map(x=><option key={x} value={x}>{x} times</option>)}</select></label>
      <label style={row}><span>Volume</span><input type="range" min="0.2" max="1" step=".1" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label>
      <button style={button} onClick={test}>🔊 Test Voice</button>
      <p style={muted}>Browser audio must be unlocked once by user interaction. For a dedicated hardware speaker, keep this page open on the device connected to that speaker.</p>
    </section>
    <section style={card}><h2>Recent Calls</h2>{!notices.length?<p style={muted}>Waiting for new order/notification events…</p>:notices.map(n=><div key={n.id} style={notice}><b>{n.title}</b><span>{n.message}</span></div>)}</section>
  </div></main>
}

const shell={minHeight:"100vh",padding:28,background:"var(--background)",color:"var(--text)"}
const wrap={maxWidth:900,margin:"0 auto",display:"grid",gap:16}
const header={padding:24,borderRadius:22,background:"var(--surface)",border:"1px solid var(--border)",display:"flex",justifyContent:"space-between",gap:12}
const card={padding:22,borderRadius:20,background:"var(--surface)",border:"1px solid var(--border)"}
const title={fontSize:30,margin:"4px 0"}
const eyebrow={fontSize:10,fontWeight:900,letterSpacing:1.5,color:"var(--primary)"}
const muted={color:"var(--muted)",lineHeight:1.6}
const live={color:"#22c55e",fontWeight:900}
const row={display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 0",borderBottom:"1px solid var(--border)"}
const button={border:0,borderRadius:11,padding:"11px 15px",background:"var(--primary)",color:"#111",fontWeight:900,cursor:"pointer",marginTop:15}
const notice={display:"grid",gap:3,padding:12,borderBottom:"1px solid var(--border)"}
