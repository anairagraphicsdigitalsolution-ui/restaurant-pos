"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function QRPage(){
  const params=useSearchParams()
  const rid=params.get("rid")
  const [tables,setTables]=useState([])
  const [rooms,setRooms]=useState([])
  const [qrEnabled,setQrEnabled]=useState(null)
  const [search,setSearch]=useState("")
  const [type,setType]=useState("all")
  const [copied,setCopied]=useState("")

  useEffect(()=>{ if(rid) load() },[rid])

  async function load(){
    const {data:plugins,error}=await supabase.from("restaurant_plugins")
      .select("enabled").eq("restaurant_id",rid)
      .in("plugin_code",["qr-menu","qr-ordering-pro"])
      .eq("enabled",true).limit(1)
    if(error||!plugins?.length){ setQrEnabled(false); return }
    setQrEnabled(true)
    const [{data:t},{data:r}]=await Promise.all([
      supabase.from("tables").select("*").eq("restaurant_id",rid).order("table_number"),
      supabase.from("rooms").select("*").eq("restaurant_id",rid).order("room_number")
    ])
    setTables(t||[]);setRooms(r||[])
  }

  const items=useMemo(()=>[
    ...tables.map(x=>({...x,_type:"table",label:`Table ${x.table_number}`,id:x.id})),
    ...rooms.map(x=>({...x,_type:"room",label:`Room ${x.room_number}`,id:x.id}))
  ].filter(x=>{
    const q=search.trim().toLowerCase()
    return (type==="all"||x._type===type)&&(!q||x.label.toLowerCase().includes(q))
  }),[tables,rooms,search,type])

  const getURL=(x)=>`${window.location.origin}/order?type=${x._type}&id=${x.id}`
  async function copy(x){
    await navigator.clipboard?.writeText(getURL(x))
    setCopied(x.id);setTimeout(()=>setCopied(""),1200)
  }

  if(qrEnabled===null)return <main style={shell}><div style={stateCard}>Loading QR Print Center…</div></main>
  if(!qrEnabled)return <main style={shell}><div style={stateCard}><div style={bigIcon}>🔒</div><h2>QR Menu is locked</h2><p>Super Admin must activate the QR Menu plugin for this restaurant.</p></div></main>

  return <main style={shell}>
    <div style={wrap}>
      <header style={hero}>
        <div style={eyebrow}>SUPER ADMIN · QR PLUGIN</div>
        <h1 style={title}>QR Print Center</h1>
        <p style={muted}>Generate, copy and print table or room ordering links from one clean workspace.</p>
        <div style={badges}>
          <span style={badge}>📱 {tables.length} Tables</span>
          <span style={badge}>🏨 {rooms.length} Rooms</span>
          <span style={badge}>🔐 Plugin Active</span>
        </div>
      </header>

      <section style={toolbar}>
        <div style={tabs}>
          {[["all","All"],["table","Tables"],["room","Rooms"]].map(([v,l])=><button key={v} onClick={()=>setType(v)} style={{...tab,...(type===v?tabActive:{})}}>{l}</button>)}
        </div>
        <div style={searchBox}>⌕<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search table or room…" style={input}/></div>
      </section>

      <section style={grid}>
        {items.map(x=><article key={`${x._type}-${x.id}`} style={card}>
          <div style={cardTop}><div style={icon}>{x._type==="table"?"🍽️":"🏨"}</div><span style={pill}>{x._type==="table"?"TABLE":"ROOM"}</span></div>
          <h3 style={{margin:"4px 0"}}>{x.label}</h3>
          <div style={qrBox}><img alt={x.label} src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(getURL(x))}`}/></div>
          <div style={urlText}>{getURL(x)}</div>
          <div style={actions}>
            <button onClick={()=>copy(x)} style={primaryBtn}>{copied===x.id?"✓ Copied":"Copy Link"}</button>
            <button onClick={()=>window.open(getURL(x),"_blank","noopener,noreferrer")} style={secondaryBtn}>Open</button>
            <button onClick={()=>window.print()} style={secondaryBtn}>Print</button>
          </div>
        </article>)}
      </section>

      {!items.length&&<div style={stateCard}>No QR targets match your search.</div>}
    </div>
  </main>
}

const shell={minHeight:"100vh",padding:24,background:"var(--background)",color:"var(--text)"}
const wrap={maxWidth:1450,margin:"0 auto"}
const hero={padding:28,borderRadius:24,background:"linear-gradient(135deg,var(--surface),rgba(var(--primary-rgb),.06))",border:"1px solid var(--border)",marginBottom:14}
const eyebrow={fontSize:10,fontWeight:900,letterSpacing:1.5,color:"var(--primary)"}
const title={fontSize:34,margin:"6px 0 8px"}
const muted={margin:0,color:"var(--muted)",lineHeight:1.6}
const badges={display:"flex",gap:8,flexWrap:"wrap",marginTop:16}
const badge={padding:"7px 10px",borderRadius:999,background:"rgba(var(--primary-rgb),.08)",border:"1px solid rgba(var(--primary-rgb),.15)",fontSize:10,fontWeight:800}
const toolbar={display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",alignItems:"center",padding:12,borderRadius:17,background:"var(--surface)",border:"1px solid var(--border)",marginBottom:14}
const tabs={display:"flex",gap:5}
const tab={padding:"9px 12px",border:0,borderRadius:10,background:"transparent",color:"var(--muted)",fontWeight:800,cursor:"pointer"}
const tabActive={background:"rgba(var(--primary-rgb),.1)",color:"var(--primary)"}
const searchBox={display:"flex",alignItems:"center",gap:8,padding:"0 11px",border:"1px solid var(--border)",borderRadius:11,background:"var(--background)"}
const input={width:220,padding:"10px 0",border:0,outline:"none",background:"transparent",color:"var(--text)"}
const grid={display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:13}
const card={padding:15,borderRadius:18,background:"var(--surface)",border:"1px solid var(--border)",minWidth:0}
const cardTop={display:"flex",justifyContent:"space-between",alignItems:"center"}
const icon={width:42,height:42,borderRadius:13,display:"grid",placeItems:"center",background:"rgba(var(--primary-rgb),.09)",fontSize:21}
const pill={fontSize:9,fontWeight:900,letterSpacing:1,color:"var(--muted)"}
const qrBox={margin:"12px auto",width:190,height:190,display:"grid",placeItems:"center",background:"var(--text)",borderRadius:15}
const urlText={fontSize:9,color:"var(--muted)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}
const actions={display:"flex",gap:6,marginTop:12}
const primaryBtn={flex:1,padding:"9px 8px",borderRadius:10,border:0,background:"var(--primary)",color:"var(--text)",fontWeight:900,cursor:"pointer"}
const secondaryBtn={padding:"9px 8px",borderRadius:10,border:"1px solid var(--border)",background:"var(--background)",color:"var(--text)",fontWeight:800,cursor:"pointer"}
const stateCard={maxWidth:600,margin:"15vh auto",padding:35,textAlign:"center",borderRadius:22,background:"var(--surface)",border:"1px solid var(--border)",color:"var(--text)"}
const bigIcon={fontSize:48}
