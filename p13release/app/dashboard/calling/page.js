"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { playCallingAudio, speakCallingAnnouncement, unlockCallingAudio } from "@/lib/callingVoice"

const EVENT_DEFS = [
  { key:"new_order", label:"New Order", icon:"🛎️", sample:"New order received. Order {order_number} has arrived." },
  { key:"order_ready", label:"Order Ready", icon:"🍽️", sample:"Order {order_number} is ready for pickup." },
  { key:"waiter_call", label:"Waiter / Service Call", icon:"🔔", sample:"Customer has requested service." },
  { key:"payment_received", label:"Payment Received", icon:"💳", sample:"Payment received. Please verify the payment." },
  { key:"token_ready", label:"Token Ready", icon:"🎟️", sample:"Token {order_number} is ready." },
  { key:"table_service", label:"Table Service", icon:"🪑", sample:"Table service has been requested." },
  { key:"delivery_ready", label:"Delivery Ready", icon:"🛵", sample:"Delivery order {order_number} is ready." },
]
const DEFAULT_ASSETS = Object.fromEntries(EVENT_DEFS.map(x=>[x.key,{url:"",path:"",name:""}]))

function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)))}
function normaliseAssets(input){return {...DEFAULT_ASSETS,...(input&&typeof input==="object"?input:{})}}
function eventKeyFor(row){
  const t=String(row?.type||"").toLowerCase()
  if(t==="order") return "new_order"
  if(t==="success"||t==="order_ready"||t==="ready") return "order_ready"
  if(t==="waiter_call"||t==="waiter"||t==="service_request") return "waiter_call"
  if(t==="payment"||t==="payment_received") return "payment_received"
  if(t.includes("token")) return "token_ready"
  if(t.includes("table")) return "table_service"
  if(t.includes("delivery")) return "delivery_ready"
  return null
}

export default function CallingDevicePage(){
  const [restaurantId,setRestaurantId]=useState("")
  const [enabled,setEnabled]=useState(false)
  const [notices,setNotices]=useState([])
  const [voice,setVoice]=useState(true)
  const [availableVoices,setAvailableVoices]=useState([])
  const [voiceName,setVoiceName]=useState("")
  const [repeat,setRepeat]=useState(3)
  const [volume,setVolume]=useState(1)
  const [rate,setRate]=useState(.9)
  const [language,setLanguage]=useState("hi-IN")
  const [phrase,setPhrase]=useState("New order received. Order {order_number} has arrived.")
  const [events,setEvents]=useState({new_order:true,order_ready:false,waiter_call:true,payment_received:true,token_ready:false,table_service:false,delivery_ready:false})
  const [audioAssets,setAudioAssets]=useState(DEFAULT_ASSETS)
  const [browserNotifications,setBrowserNotifications]=useState(true)
  const [uploading,setUploading]=useState("")
  const [saving,setSaving]=useState(false)
  const [message,setMessage]=useState("")
  const [voiceStatus,setVoiceStatus]=useState("Ready")
  const seen=useRef(new Set())
  const configRef=useRef({enabled:true,repeat:3,volume:1,rate:.9,language:"hi-IN",voiceName:"",phrase:"New order received. Order {order_number} has arrived.",events:{},audioAssets:DEFAULT_ASSETS,browserNotifications:true})

  useEffect(()=>{init()},[])
  useEffect(()=>{
    if(typeof window==="undefined"||!("speechSynthesis" in window))return
    const load=()=>setAvailableVoices(window.speechSynthesis.getVoices().sort((a,b)=>String(a.name).localeCompare(String(b.name))))
    load();window.speechSynthesis.addEventListener?.("voiceschanged",load)
    return()=>window.speechSynthesis.removeEventListener?.("voiceschanged",load)
  },[])

  async function init(){
    const {data:{user}}=await supabaseCloud.auth.getUser();if(!user)return
    const {data:profile}=await supabaseCloud.from("profiles").select("restaurant_id").eq("id",user.id).maybeSingle();const rid=profile?.restaurant_id;if(!rid)return
    setRestaurantId(rid)
    const [{data:row},{data:settings}]=await Promise.all([
      supabaseCloud.from("restaurant_plugins").select("enabled").eq("restaurant_id",rid).eq("plugin_code","calling-device").maybeSingle(),
      supabaseCloud.from("plugin_settings").select("config").eq("restaurant_id",rid).eq("plugin_code","calling-device").maybeSingle()
    ])
    setEnabled(row?.enabled===true)
    const cfg=settings?.config||{}
    const next={enabled:cfg.enabled!==false,repeat:clamp(cfg.repeat||3,1,5),volume:clamp(cfg.volume??1,0,1),rate:clamp(cfg.rate||.9,.5,2),language:cfg.language||"hi-IN",voiceName:cfg.voiceName||"",phrase:cfg.phrase||"New order received. Order {order_number} has arrived.",events:{...{new_order:true,order_ready:false,waiter_call:true,payment_received:true,token_ready:false,table_service:false,delivery_ready:false},...(cfg.events||{})},audioAssets:normaliseAssets(cfg.audioAssets)}
    configRef.current=next;setVoice(next.enabled);setRepeat(next.repeat);setVolume(next.volume);setRate(next.rate);setLanguage(next.language);setVoiceName(next.voiceName);setPhrase(next.phrase);setEvents(next.events);setAudioAssets(next.audioAssets);setBrowserNotifications(next.browserNotifications!==false)
  }

  useEffect(()=>{configRef.current={...configRef.current,enabled:voice,repeat,volume,rate,language,voiceName,phrase,events,audioAssets,browserNotifications}},[voice,repeat,volume,rate,language,voiceName,phrase,events,audioAssets,browserNotifications])

  const speak=useCallback((row)=>{
    const cfg=configRef.current;if(!cfg.enabled)return false
    const key=eventKeyFor(row)||"new_order"
    if(cfg.events[key]===false)return false
    const raw=String(row?.message||"A new restaurant alert has arrived.")
    const match=raw.match(/Order\s+#?([a-z0-9-]{3,})/i);const orderNumber=match?.[1]||""
    let text=String(row?.title||"Restaurant alert")+". "+raw
    if(key==="new_order")text=String(cfg.phrase||"").replaceAll("{order_number}",orderNumber)
    if(key==="order_ready"&&orderNumber)text=String(cfg.audioAssets[key]?.tts||"Order {order_number} is ready for pickup.").replaceAll("{order_number}",orderNumber)
    setVoiceStatus("Speaking…")
    return speakCallingAnnouncement(text,{...cfg,audioUrl:cfg.audioAssets[key]?.url||""},{onDone:()=>setVoiceStatus("Ready"),onError:e=>{setVoiceStatus(String(e));console.error(e)}})
  },[])

  useEffect(()=>{
    if(!restaurantId||!enabled)return
    const consume=row=>{if(!row?.id||seen.current.has(row.id))return;seen.current.add(row.id);setNotices(n=>[row,...n].slice(0,30));speak(row)}
    const handler=e=>consume(e?.detail)
    window.addEventListener("anaira:notification",handler)
    return()=>window.removeEventListener("anaira:notification",handler)
  },[restaurantId,enabled,speak])

  async function saveSettings(){
    setSaving(true);setMessage("")
    try{
      const config={enabled:voice,repeat,volume,rate,language,voiceName,phrase,events,audioAssets,browserNotifications}
      const res=await fetch("/api/calling/voice",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"saveConfig",restaurant_id:restaurantId,config})})
      const d=await res.json();if(!res.ok||!d.success)throw new Error(d.error||"Unable to save")
      configRef.current={...configRef.current,...config};setMessage("✅ Calling settings saved")
    }catch(e){setMessage("❌ "+e.message)}finally{setSaving(false)}
  }

  async function uploadAudio(eventKey,file){
    if(!file)return
    setUploading(eventKey);setMessage("")
    try{
      const fd=new FormData();fd.append("file",file);fd.append("restaurant_id",restaurantId);fd.append("event_key",eventKey)
      const res=await fetch("/api/calling/audio",{method:"POST",body:fd});const d=await res.json();if(!res.ok||!d.success)throw new Error(d.error||"Upload failed")
      setAudioAssets(prev=>({...prev,[eventKey]:{url:d.url,path:d.path,name:d.name,tts:prev[eventKey]?.tts||""}}));setMessage("✅ "+(d.name||"Voice")+" uploaded")
    }catch(e){setMessage("❌ "+e.message)}finally{setUploading("")}
  }

  async function removeAudio(eventKey){
    const asset=audioAssets[eventKey];if(!asset?.path)return
    try{await fetch("/api/calling/audio",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({restaurant_id:restaurantId,path:asset.path})})}catch{}
    setAudioAssets(prev=>({...prev,[eventKey]:{url:"",path:"",name:"",tts:prev[eventKey]?.tts||""}}));setMessage("Voice removed. TTS fallback is active.")
  }

  async function previewEvent(def){
    unlockCallingAudio();const asset=audioAssets[def.key]
    setVoiceStatus("Playing preview…")
    if(asset?.url){const ok=await playCallingAudio(asset.url,{volume});if(ok){setVoiceStatus("Ready");return}}
    const text=def.sample.replaceAll("{order_number}","A102")
    speakCallingAnnouncement(text,{...configRef.current,audioUrl:"",repeat:1},{onDone:()=>setVoiceStatus("Ready"),onError:e=>setVoiceStatus(String(e))})
  }

  function test(){previewEvent(EVENT_DEFS[0])}

  if(!enabled)return <main style={shell}><div style={card}><h2>Calling Device is not active</h2><p style={muted}>Super Admin must activate Calling Device in Plugins before this station can receive calls.</p></div></main>

  return <main style={shell} onPointerDown={unlockCallingAudio}><div style={wrap}>
    <header style={header}><div><div style={eyebrow}>RESTAURANT PRO · CALLING</div><h1 style={title}>Calling Device</h1><p style={muted}>Set a different recorded voice/audio for every event. If an event has no audio, Anaira automatically falls back to TTS.</p></div><span style={live}>● LIVE</span></header>
    {message&&<div style={messageBox}>{message}</div>}
    <section style={card}>
      <div style={sectionHead}><div><h2 style={h2}>1. Default Voice & TTS Fallback</h2><p style={muted}>This voice is used whenever a custom audio clip is not uploaded.</p></div><button style={button} onClick={test}>🔊 Test Voice</button></div>
      <label style={row}><span>Voice announcements</span><input type="checkbox" checked={voice} onChange={e=>setVoice(e.target.checked)}/></label>
      <label style={row}><span>Language</span><select style={select} value={language} onChange={e=>setLanguage(e.target.value)}><option value="hi-IN">Hindi (India)</option><option value="en-IN">English (India)</option><option value="en-US">English (US)</option></select></label>
      <label style={row}><span>Browser / Android TTS voice</span><select style={select} value={voiceName} onChange={e=>setVoiceName(e.target.value)}><option value="">Auto — best available voice</option>{availableVoices.map(v=><option key={`${v.name}-${v.lang}`} value={v.name}>{v.name} ({v.lang})</option>)}</select></label>
      <label style={row}><span>Browser notifications</span><input type="checkbox" checked={browserNotifications} onChange={e=>setBrowserNotifications(e.target.checked)}/></label>
      <label style={row}><span>Repeat announcement</span><select style={select} value={repeat} onChange={e=>setRepeat(Number(e.target.value))}>{[1,2,3,4,5].map(x=><option key={x} value={x}>{x} times</option>)}</select></label>
      <label style={row}><span>Volume</span><input type="range" min="0.2" max="1" step=".1" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label>
      <label style={row}><span>Speech rate</span><input type="range" min=".5" max="1.5" step=".1" value={rate} onChange={e=>setRate(Number(e.target.value))}/></label>
      <label style={stack}><span>Default new-order TTS phrase</span><textarea style={textarea} value={phrase} onChange={e=>setPhrase(e.target.value)} /></label>
      <div style={status}>Voice status: <b>{voiceStatus}</b></div>
    </section>

    <section style={card}>
      <div style={sectionHead}><div><h2 style={h2}>2. Custom Voice / Audio for Each Event</h2><p style={muted}>Upload one MP3/WAV/OGG/WEBM/AAC clip per event. The selected clip plays first; TTS is the automatic fallback.</p></div></div>
      <div style={grid}>
      {EVENT_DEFS.map(def=>{const a=audioAssets[def.key]||{};return <div key={def.key} style={eventCard}>
        <div style={eventTitle}><span style={{fontSize:24}}>{def.icon}</span><div><b>{def.label}</b><small>{def.key}</small></div></div>
        <label style={toggle}><input type="checkbox" checked={events[def.key]!==false} onChange={e=>setEvents(x=>({...x,[def.key]:e.target.checked}))}/><span>Enable announcement</span></label>
        {a.url?<div style={audioBox}><div style={fileName}>🎵 {a.name||"Custom voice"}</div><audio controls preload="metadata" src={a.url} style={{width:"100%"}}/><div style={actions}><button style={secondary} onClick={()=>previewEvent(def)}>▶ Preview</button><button style={danger} onClick={()=>removeAudio(def.key)}>Remove</button></div></div>:<div style={uploadBox}><div style={{fontSize:28}}>🎙️</div><b>Upload custom voice</b><small>Max 15 MB</small><label style={uploadButton}>{uploading===def.key?"Uploading…":"Choose Audio"}<input type="file" accept="audio/*,.mp3,.wav,.ogg,.webm,.aac" hidden disabled={!!uploading} onChange={e=>uploadAudio(def.key,e.target.files?.[0])}/></label><button style={linkButton} onClick={()=>previewEvent(def)}>Use TTS Preview</button></div>}
      </div>})}
      </div>
    </section>

    <section style={card}><div style={sectionHead}><div><h2 style={h2}>3. Save Calling Device</h2><p style={muted}>Settings and uploaded voice assignments are stored restaurant-wise in the Calling Device configuration.</p></div><button style={button} disabled={saving} onClick={saveSettings}>{saving?"Saving…":"💾 Save All Calling Settings"}</button></div></section>

    <section style={card}><h2 style={h2}>Recent Calls</h2>{!notices.length?<p style={muted}>Waiting for new order / notification events…</p>:notices.map(n=><div key={n.id} style={notice}><b>{n.title}</b><span>{n.message}</span></div>)}</section>
  </div></main>
}
const shell={minHeight:"100vh",padding:28,background:"var(--background)",color:"var(--text)"}
const wrap={maxWidth:1100,margin:"0 auto",display:"grid",gap:16}
const header={padding:24,borderRadius:22,background:"var(--surface)",border:"1px solid var(--border)",display:"flex",justifyContent:"space-between",gap:12}
const card={padding:22,borderRadius:20,background:"var(--surface)",border:"1px solid var(--border)"}
const title={fontSize:30,margin:"4px 0"};const h2={margin:"0 0 6px"};const eyebrow={fontSize:10,fontWeight:900,letterSpacing:1.5,color:"var(--primary)"};const muted={color:"var(--muted)",lineHeight:1.6};const live={color:"var(--success)",fontWeight:900}
const sectionHead={display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,marginBottom:10};const row={display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,padding:"13px 0",borderBottom:"1px solid var(--border)"};const stack={display:"grid",gap:8,paddingTop:14};const select={minWidth:250,maxWidth:"60%",padding:10,borderRadius:10,border:"1px solid var(--border)",background:"var(--surface-2)",color:"var(--text)"};const textarea={width:"100%",minHeight:80,padding:10,borderRadius:10,border:"1px solid var(--border)",background:"var(--surface-2)",color:"var(--text)"};const button={border:0,borderRadius:11,padding:"11px 15px",background:"var(--primary)",color:"#111",fontWeight:900,cursor:"pointer"};const secondary={border:"1px solid var(--border)",borderRadius:9,padding:"8px 10px",background:"var(--surface-2)",color:"var(--text)",fontWeight:800,cursor:"pointer"};const danger={border:0,borderRadius:9,padding:"8px 10px",background:"#6b2630",color:"white",fontWeight:800,cursor:"pointer"};const status={marginTop:12,padding:10,borderRadius:10,background:"var(--surface-2)",fontSize:12};const messageBox={padding:12,borderRadius:12,background:"var(--surface-2)",border:"1px solid var(--border)"};const grid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14,marginTop:14};const eventCard={padding:16,borderRadius:16,background:"var(--surface-2)",border:"1px solid var(--border)",display:"grid",gap:10};const eventTitle={display:"flex",alignItems:"center",gap:10};const uploadBox={minHeight:170,border:"1px dashed var(--border)",borderRadius:14,display:"grid",placeItems:"center",alignContent:"center",gap:6,textAlign:"center",padding:16};const uploadButton={display:"inline-block",padding:"9px 12px",borderRadius:9,background:"var(--primary)",color:"#111",fontWeight:900,cursor:"pointer"};const linkButton={border:0,background:"transparent",color:"var(--primary)",fontWeight:800,cursor:"pointer"};const audioBox={padding:10,borderRadius:12,background:"var(--surface)",display:"grid",gap:8};const fileName={fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"};const actions={display:"flex",gap:8};const toggle={display:"flex",gap:8,alignItems:"center",fontSize:12};const notice={display:"grid",gap:3,padding:12,borderBottom:"1px solid var(--border)"}
