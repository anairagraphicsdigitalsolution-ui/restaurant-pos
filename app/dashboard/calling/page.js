"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { speakCallingAnnouncement, unlockCallingAudio } from "@/lib/callingVoice"

function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value))) }

export default function CallingDevicePage(){
  const [restaurantId,setRestaurantId]=useState("")
  const [enabled,setEnabled]=useState(false)
  const [notices,setNotices]=useState([])
  const [voice,setVoice]=useState(true)
  const [repeat,setRepeat]=useState(3)
  const [volume,setVolume]=useState(1)
  const [rate,setRate]=useState(.9)
  const [language,setLanguage]=useState("hi-IN")
  const [phrase,setPhrase]=useState("New order received. Order {order_number} has arrived.")
  const [events,setEvents]=useState({new_order:true,order_ready:false,waiter_call:true})
  const [voiceStatus,setVoiceStatus]=useState("Ready")
  const seen=useRef(new Set())
  const configRef=useRef({enabled:true,repeat:3,volume:1,rate:.9,language:"hi-IN",phrase:"New order received. Order {order_number} has arrived.",events:{new_order:true,order_ready:false,waiter_call:true}})

  useEffect(()=>{init()},[])

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices()
        .filter(v => String(v.lang || "").toLowerCase().startsWith("hi"))
        .sort((a,b) => String(a.name).localeCompare(String(b.name)))
      setAvailableVoices(voices)
    }
    loadVoices()
    window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices)
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", loadVoices)
  }, [])

  async function init(){
    const {data:{user}}=await supabaseCloud.auth.getUser()
    if(!user)return
    const {data:profile}=await supabaseCloud.from("profiles").select("restaurant_id").eq("id",user.id).maybeSingle()
    const rid=profile?.restaurant_id
    if(!rid)return
    setRestaurantId(rid)
    const {data:row}=await supabaseCloud.from("restaurant_plugins").select("enabled").eq("restaurant_id",rid).eq("plugin_code","calling-device").maybeSingle()
    setEnabled(row?.enabled===true)
    const {data:settings}=await supabaseCloud.from("plugin_settings").select("config").eq("restaurant_id",rid).eq("plugin_code","calling-device").maybeSingle()
    const cfg=settings?.config||{}
    const storedVoiceName = (() => {
      try { return window.localStorage.getItem("anaira.calling.voiceName") || "" } catch { return "" }
    })()
    const next={enabled:cfg.enabled !== false,repeat:clamp(cfg.repeat||3,1,5),volume:clamp(cfg.volume ?? 1,0,1),rate:clamp(cfg.rate||.9,.5,2),language:cfg.language||"hi-IN",voiceName:cfg.voiceName||storedVoiceName||"",phrase:cfg.phrase||"New order received. Order {order_number} has arrived.",events:{new_order:cfg.new_order!==false,order_ready:cfg.order_ready===true,waiter_call:cfg.waiter_call!==false}}
    configRef.current=next
    setVoice(next.enabled);setRepeat(next.repeat);setVolume(next.volume);setRate(next.rate);setLanguage(next.language);setVoiceName(next.voiceName);setPhrase(next.phrase);setEvents(next.events)
  }

  const speak = useCallback((row)=>{
    const cfg=configRef.current
    if(!cfg.enabled)return false
    const type=String(row.type||"order")
    if(type==="order" && !cfg.events.new_order)return false
    if((type==="success" || type==="order_ready") && !cfg.events.order_ready)return false
    if((type==="waiter_call" || type==="waiter") && !cfg.events.waiter_call)return false
    const raw=String(row.message||"A new order has arrived in the kitchen.")
    const orderMatch=raw.match(/Order\s+#?([a-z0-9-]{3,})/i)
    const orderNumber=orderMatch?.[1]||""
    const text=type==="order" ? cfg.phrase.replaceAll("{order_number}",orderNumber) : `${row.title||"Restaurant alert"}. ${raw}`
    setVoiceStatus("Speaking…")
    return speakCallingAnnouncement(text,cfg,{onDone:()=>setVoiceStatus("Ready"),onError:e=>{setVoiceStatus(String(e));console.error(e)}})
  },[])

  useEffect(()=>{
    configRef.current={...configRef.current,enabled:voice,repeat,volume,rate,language,voiceName,phrase,events}
    try { window.localStorage.setItem("anaira.calling.voiceName", voiceName || "") } catch {}
  },[voice,repeat,volume,rate,language,voiceName,phrase,events])

  useEffect(()=>{
    if(!restaurantId||!enabled)return
    const consume=(row)=>{
      if(!row?.id||seen.current.has(row.id))return
      seen.current.add(row.id)
      setNotices(n=>[row,...n].slice(0,30))
    }
    const handler=(event)=>consume(event?.detail)
    const callingHandler=(event)=>consume(event?.detail)
    window.addEventListener("anaira:notification",handler)
    window.addEventListener("anaira:calling",callingHandler)
    return()=>{
      window.removeEventListener("anaira:notification",handler)
      window.removeEventListener("anaira:calling",callingHandler)
    }
  },[restaurantId,enabled])

  function test(){
    unlockCallingAudio()
    const ok=speak({type:"order",title:"New order received",message:"A new order has arrived in the kitchen."})
    if(!ok)setVoiceStatus("Voice is disabled or unavailable")
  }

  if(!enabled)return <main style={shell}><div style={card}><h2>Calling Device is not active</h2><p>Super Admin must activate Calling Device in Plugins.</p></div></main>

  return <main style={shell} onPointerDown={unlockCallingAudio}><div style={wrap}>
    <header style={header}><div><div style={eyebrow}>RESTAURANT PRO · CALLING</div><h1 style={title}>Calling Device</h1><p style={muted}>Works in browser and Capacitor Android. Android uses the native TTS bridge when installed, with browser speech as fallback.</p></div><span style={live}>● LIVE</span></header>
    <section style={card}>
      <h2>Voice Settings</h2>
      <label style={row}><span>Voice announcements</span><input type="checkbox" checked={voice} onChange={e=>setVoice(e.target.checked)}/></label>
      <label style={row}><span>Language</span><select value={language} onChange={e=>setLanguage(e.target.value)}><option value="hi-IN">Hindi (India)</option><option value="en-IN">English (India)</option><option value="en-US">English (US)</option></select></label>
       {language === "hi-IN" && <label style={row}><span>Hindi voice</span><select value={voiceName} onChange={e=>setVoiceName(e.target.value)}><option value="">Auto — best available Hindi voice</option>{availableVoices.map(v=><option key={`${v.name}-${v.lang}`} value={v.name}>{v.name} ({v.lang})</option>)}</select></label>}
      <label style={row}><span>Repeat announcement</span><select value={repeat} onChange={e=>setRepeat(Number(e.target.value))}>{[1,2,3,4,5].map(x=><option key={x} value={x}>{x} times</option>)}</select></label>
      <label style={row}><span>Volume</span><input type="range" min="0.2" max="1" step=".1" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label>
      <label style={row}><span>Speech rate</span><input type="range" min=".5" max="1.5" step=".1" value={rate} onChange={e=>setRate(Number(e.target.value))}/></label>
      <button style={button} onClick={test}>🔊 Test Voice</button>
      <div style={status}>Voice status: <b>{voiceStatus}</b></div>
      <p style={muted}>Tap Test Voice once after opening the page to unlock audio. On Android, the native bridge provides reliable device TTS when the APK contains it.</p>
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
const live={color:"var(--success)",fontWeight:900}
const row={display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 0",borderBottom:"1px solid var(--border)"}
const button={border:0,borderRadius:11,padding:"11px 15px",background:"var(--primary)",color:"#111",fontWeight:900,cursor:"pointer",marginTop:15}
const status={marginTop:12,padding:10,borderRadius:10,background:"var(--surface-2)",fontSize:12}
const notice={display:"grid",gap:3,padding:12,borderBottom:"1px solid var(--border)"}
