"use client"

import { supabase } from "@/lib/supabase"
import { useEffect, useMemo, useState } from "react"

const PLUGIN_CODE = "ai-logo-studio"
const PLUGIN_NAME = "AI Logo Studio"

export default function LogoPage(){
  const [prompt,setPrompt]=useState("")
  const [logo,setLogo]=useState("")
  const [loading,setLoading]=useState(false)
  const [pluginActive,setPluginActive]=useState(null)
  const [pluginMessage,setPluginMessage]=useState("")
  const [style,setStyle]=useState("modern")
  const [color,setColor]=useState("blue")
  const [size,setSize]=useState("1024")
  const [bg,setBg]=useState("white")
  const [history,setHistory]=useState([])
  const [copied,setCopied]=useState("")
  const [error,setError]=useState("")
  const [preview,setPreview]=useState(false)
  const [tab,setTab]=useState("create")

  useEffect(()=>{
    let alive=true
    ;(async()=>{
      try{
        const {data:{session}}=await supabase.auth.getSession()
        if(!session?.access_token){if(alive){setPluginActive(false);setPluginMessage("Login required")}return}
        const {data:profile,error:profileError}=await supabase.from("profiles").select("role,restaurant_id").eq("id",session.user.id).maybeSingle()
        if(!profileError&&profile?.role==="super_admin"){if(alive){setPluginActive(true);setPluginMessage("")}return}
        const res=await fetch("/api/plugins/list",{headers:{Authorization:`Bearer ${session.access_token}`},cache:"no-store"})
        const data=await res.json();const row=(data.data||[]).find(x=>x.code===PLUGIN_CODE)
        if(alive){setPluginActive(row?.active===true);setPluginMessage(row?.active===true?"":`${PLUGIN_NAME} is not active for this restaurant.`)}
      }catch{if(alive){setPluginActive(false);setPluginMessage("Unable to verify plugin access")}}
    })()
    return()=>{alive=false}
  },[])

  const suggestions=useMemo(()=>[
    "Luxury mountain resort brand with an elegant premium identity",
    "Modern restaurant brand with a memorable minimal icon",
    "Professional technology company, clean geometric identity",
    "Premium salon brand, elegant feminine luxury identity"
  ],[])

  async function generate(){
    const clean=prompt.trim()
    if(!clean){setError("Describe the brand or logo idea.");return}
    setLoading(true);setError("")
    try{
      const res=await fetch("/api/generate-image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        prompt:`${clean}, ${style} logo, ${color} color, ${bg} background, minimal, clean branding`,
        plugin_code:PLUGIN_CODE,size
      })})
      const raw=await res.text();let data
      try{data=JSON.parse(raw)}catch{throw new Error("Server returned an invalid response.")}
      if(!res.ok)throw new Error(data.error||"Logo generation failed.")
      if(!data.image)throw new Error("No logo image was returned.")
      setLogo(data.image);setHistory(prev=>[{prompt:clean,image:data.image,style,color,bg,size},...prev].slice(0,12));setTab("create")
    }catch(e){setError(e.message||"Network error.")}finally{setLoading(false)}
  }
  async function copyPrompt(){try{await navigator.clipboard.writeText(prompt);setCopied("Copied")}catch{setCopied("Copy failed")}setTimeout(()=>setCopied(""),1400)}
  function download(){if(!logo)return;const a=document.createElement("a");a.href=logo;a.download="ai-logo-hd.png";a.click()}
  function useHistory(h){setPrompt(h.prompt);setLogo(h.image);setStyle(h.style||"modern");setColor(h.color||"blue");setBg(h.bg||"white");setSize(h.size||"1024");setTab("create")}

  if(pluginActive!==true)return <div style={S.shell}><div style={S.lock}><div style={S.lockIcon}>◇</div><h2>{pluginMessage||"Checking access…"}</h2><p>AI Logo Studio is available when the plugin is active for this account.</p></div></div>

  return <><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style><div style={S.shell}>
    <header style={S.header}><div style={S.brand}><div style={S.brandIcon}>L</div><div><b>AI Logo Studio</b><span>Brand identity generation workspace</span></div></div><div style={S.headRight}><span style={S.status}>● Studio ready</span><span style={S.pro}>PRO</span></div></header>
    <div style={S.body}>
      <aside style={S.side}>
        <div style={S.sideTitle}>WORKSPACE</div>
        <button style={tabStyle(tab==="create")} onClick={()=>setTab("create")}>✦ <span>Logo generator</span></button>
        <button style={tabStyle(tab==="history")} onClick={()=>setTab("history")}>◷ <span>Brand history</span><em>{history.length}</em></button>
        <div style={S.divider}/><div style={S.sideTitle}>BRAND IDEAS</div>
        {suggestions.map((x,i)=><button key={i} style={S.chip} onClick={()=>setPrompt(x)}>{x}</button>)}
      </aside>
      <main style={S.main}>
        <div style={S.hero}><span>BRAND IDENTITY ENGINE</span><h1>Create a logo with <strong>character.</strong></h1><p>Explore distinctive visual directions and generate polished brand concepts in seconds.</p></div>
        {tab==="create"?<div style={S.grid}>
          <section style={S.panel}>
            <div style={S.head}><div><h3>Brand brief</h3><small>Describe the business, symbol, audience and personality.</small></div><b style={S.count}>{prompt.length}/700</b></div>
            <textarea value={prompt} maxLength={700} onChange={e=>setPrompt(e.target.value)} placeholder="Example: Premium Himalayan adventure brand using a mountain + compass symbol, clean and timeless…" style={S.textarea}/>
            <div style={S.controls}>
              <Field label="Logo style"><select value={style} onChange={e=>setStyle(e.target.value)} style={S.input}><option value="modern">Modern</option><option value="minimal">Minimal</option><option value="3d">3D</option><option value="luxury">Luxury</option><option value="tech">Tech</option><option value="gaming">Gaming</option></select></Field>
              <Field label="Primary color"><select value={color} onChange={e=>setColor(e.target.value)} style={S.input}><option value="blue">Blue</option><option value="black">Black</option><option value="gold">Gold</option><option value="gradient">Gradient</option><option value="neon">Neon</option></select></Field>
              <Field label="Resolution"><select value={size} onChange={e=>setSize(e.target.value)} style={S.input}><option value="512">512px</option><option value="1024">1024px</option><option value="2048">2048px</option></select></Field>
              <Field label="Background"><select value={bg} onChange={e=>setBg(e.target.value)} style={S.input}><option value="white">White</option><option value="black">Black</option><option value="transparent">Transparent</option></select></Field>
            </div>
            {error&&<div style={S.error}>⚠ {error}</div>}
            <div style={S.actions}><button onClick={copyPrompt} style={S.secondary}>{copied||"Copy prompt"}</button><button onClick={()=>setPrompt("")} style={S.secondary}>Clear</button><button onClick={generate} disabled={loading} style={S.primary}>{loading?"Creating…":"✦ Generate logo"}</button></div>
            <div style={S.tip}>Tip: Mention the business type, symbol, mood and color preference for stronger concepts.</div>
          </section>
          <section style={S.panel}>
            <div style={S.head}><div><h3>Logo board</h3><small>{logo?"Click the artwork for a larger presentation preview.":"Your generated identity concept appears here."}</small></div>{logo&&<span style={S.ready}>READY</span>}</div>
            <div style={S.canvas}>
              {loading?<div style={S.loader}><div style={S.spinner}/><b>Creating brand concept</b><small>Generating your logo direction…</small></div>:
              logo?<button style={S.imageBtn} onClick={()=>setPreview(true)}><img src={logo} alt="Generated logo" style={S.image}/><span style={S.zoom}>⌕ Presentation preview</span></button>:
              <div style={S.empty}><div>◇</div><b>Brand board ready</b><small>Start with a clear brand idea.</small></div>}
            </div>
            {logo&&<div style={S.actions}><button onClick={download} style={S.download}>↓ Download HD</button><button onClick={generate} disabled={loading} style={S.secondary}>↻ Regenerate</button><button onClick={()=>setLogo("")} style={S.secondary}>Clear</button></div>}
          </section>
        </div>:
        <section style={S.panel}><div style={S.head}><div><h3>Logo history</h3><small>Your latest 12 concepts from this session.</small></div></div>{history.length?<div style={S.history}>{history.map((h,i)=><div key={i} style={S.card}><button onClick={()=>useHistory(h)} style={S.hbtn}><img src={h.image} alt="" style={S.himg}/></button><b>{h.prompt}</b><small>{h.style} · {h.color} · {h.size}px</small><button onClick={()=>useHistory(h)} style={S.use}>Use this concept</button></div>)}</div>:<div style={S.emptyWide}>No logo concepts generated yet.</div>}</section>}
      </main>
    </div>
    {preview&&<div style={S.modal} onClick={()=>setPreview(false)}><div style={S.modalBox} onClick={e=>e.stopPropagation()}><div style={S.modalTop}><div><b>Logo presentation</b><span>{style} · {color} · {size}px</span></div><button onClick={()=>setPreview(false)} style={S.close}>✕</button></div><div style={S.modalStage}><div style={{...S.logoPresentation,background:bg==="black"?"#050505":"#fff"}}><img src={logo} alt="Logo preview" style={S.modalImg}/></div></div><div style={S.modalActions}><button onClick={download} style={S.download}>↓ Download HD PNG</button><button onClick={()=>setPreview(false)} style={S.secondary}>Close</button></div></div></div>}
  </div></>
}
function Field({label,children}){return <label style={S.field}><span>{label}</span>{children}</label>}
const tabStyle=a=>({...S.sideBtn,...(a?S.active:{})})
const S={
shell:{minHeight:"100vh",background:"var(--background)",color:"var(--text)",fontFamily:"Inter,system-ui,sans-serif"},header:{height:72,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 26px",background:"rgba(15,18,27,.94)",borderBottom:"1px solid rgba(255,255,255,.08)",position:"sticky",top:0,zIndex:10,backdropFilter:"blur(16px)"},brand:{display:"flex",alignItems:"center",gap:12},brandIcon:{width:40,height:40,borderRadius:12,display:"grid",placeItems:"center",fontWeight:900,color:"#fff",background:"linear-gradient(135deg,#c68a35,#8b5e18)"},headRight:{display:"flex",gap:12,alignItems:"center"},status:{fontSize:10,color:"#8d95a6"},pro:{fontSize:9,fontWeight:900,color:"#e6b96b",padding:"6px 8px",background:"rgba(198,138,53,.12)",borderRadius:7},body:{display:"grid",gridTemplateColumns:"230px minmax(0,1fr)",minHeight:"calc(100vh - 72px)"},side:{padding:18,borderRight:"1px solid rgba(255,255,255,.07)",background:"rgba(17,20,27,.75)"},sideTitle:{fontSize:9,fontWeight:900,letterSpacing:".14em",color:"#737c8e",margin:"12px 0 9px"},sideBtn:{width:"100%",padding:"10px 11px",display:"flex",gap:10,alignItems:"center",border:"1px solid transparent",borderRadius:9,background:"transparent",color:"var(--text)",cursor:"pointer",textAlign:"left",fontSize:11},active:{background:"rgba(198,138,53,.12)",borderColor:"rgba(198,138,53,.3)",color:"#e6b96b"},chip:{width:"100%",padding:"9px 10px",marginBottom:6,borderRadius:9,border:"1px solid rgba(255,255,255,.07)",background:"rgba(255,255,255,.025)",color:"#9ca5b5",fontSize:9,textAlign:"left",lineHeight:1.35,cursor:"pointer"},divider:{height:1,background:"rgba(255,255,255,.07)",margin:"18px 0"},main:{minWidth:0,padding:"28px 30px 50px"},hero:{padding:"6px 0 25px"},grid:{display:"grid",gridTemplateColumns:"minmax(330px,.9fr) minmax(400px,1.1fr)",gap:18},panel:{background:"rgba(17,20,27,.88)",border:"1px solid rgba(255,255,255,.08)",borderRadius:16,padding:20,boxShadow:"0 18px 50px rgba(0,0,0,.16)"},head:{display:"flex",justifyContent:"space-between",gap:10,marginBottom:14},count:{fontSize:9,color:"#737c8e"},ready:{fontSize:8,color:"#63d391",padding:"5px 7px",borderRadius:6,background:"rgba(99,211,145,.1)"},textarea:{width:"100%",minHeight:155,resize:"vertical",padding:14,borderRadius:12,border:"1px solid rgba(255,255,255,.1)",background:"#0b0d12",color:"var(--text)",fontSize:12,lineHeight:1.5,outline:"none"},controls:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},field:{display:"flex",flexDirection:"column",gap:6,fontSize:9,color:"#8f97a8",marginTop:12},input:{width:"100%",padding:"10px 11px",borderRadius:9,border:"1px solid rgba(255,255,255,.1)",background:"#0b0d12",color:"var(--text)",fontSize:11,outline:"none"},actions:{display:"flex",justifyContent:"flex-end",gap:8,flexWrap:"wrap",marginTop:15},primary:{padding:"11px 16px",border:0,borderRadius:9,background:"linear-gradient(135deg,#c68a35,#a56f22)",color:"#fff",fontWeight:800,cursor:"pointer"},secondary:{padding:"10px 13px",borderRadius:9,border:"1px solid rgba(255,255,255,.09)",background:"#181c25",color:"#d9dee8",cursor:"pointer",fontSize:10},download:{padding:"10px 14px",borderRadius:9,border:"1px solid rgba(99,211,145,.25)",background:"rgba(99,211,145,.1)",color:"#76d99b",fontWeight:800,cursor:"pointer",fontSize:10},error:{marginTop:12,padding:10,borderRadius:9,background:"rgba(239,68,68,.1)",color:"#fca5a5",fontSize:10},tip:{marginTop:13,padding:10,borderRadius:9,background:"rgba(198,138,53,.07)",border:"1px solid rgba(198,138,53,.12)",color:"#9ca5b5",fontSize:9,lineHeight:1.4},canvas:{minHeight:400,borderRadius:13,border:"1px dashed rgba(255,255,255,.1)",background:"repeating-conic-gradient(rgba(255,255,255,.025) 0% 25%,transparent 0% 50%) 50%/22px 22px,#080a0f",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"},imageBtn:{position:"relative",width:"100%",minHeight:400,border:0,padding:0,background:"transparent",cursor:"zoom-in",overflow:"hidden"},image:{width:"100%",height:"100%",minHeight:400,objectFit:"contain",display:"block"},zoom:{position:"absolute",right:12,bottom:12,padding:"7px 9px",borderRadius:7,background:"rgba(0,0,0,.65)",color:"#fff",fontSize:9},loader:{display:"flex",flexDirection:"column",alignItems:"center",gap:7,color:"#b9c0cc"},spinner:{width:34,height:34,borderRadius:"50%",border:"3px solid rgba(255,255,255,.08)",borderTopColor:"#c68a35",animation:"spin 1s linear infinite"},empty:{textAlign:"center",color:"#737c8e",padding:30},history:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12},card:{padding:10,borderRadius:12,background:"#0b0d12",border:"1px solid rgba(255,255,255,.07)"},hbtn:{width:"100%",padding:0,border:0,background:"transparent",cursor:"pointer"},himg:{width:"100%",aspectRatio:"1",objectFit:"contain",borderRadius:8,display:"block",background:"#fff"},use:{width:"100%",marginTop:8,padding:8,borderRadius:7,border:"1px solid rgba(255,255,255,.08)",background:"#181c25",color:"#d9dee8",cursor:"pointer",fontSize:9},emptyWide:{padding:60,textAlign:"center",color:"#737c8e"},modal:{position:"fixed",inset:0,zIndex:100,background:"rgba(0,0,0,.82)",backdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"center",padding:25},modalBox:{width:"min(950px,95vw)",maxHeight:"94vh",background:"#11141b",border:"1px solid rgba(255,255,255,.1)",borderRadius:16,overflow:"hidden"},modalTop:{display:"flex",justifyContent:"space-between",padding:"14px 18px",borderBottom:"1px solid rgba(255,255,255,.07)"},close:{border:0,background:"transparent",color:"#fff",cursor:"pointer"},modalStage:{minHeight:500,maxHeight:"75vh",display:"flex",alignItems:"center",justifyContent:"center",padding:35,background:"#07090d",overflow:"auto"},logoPresentation:{width:"min(620px,80vw)",aspectRatio:"1",display:"grid",placeItems:"center",borderRadius:16,boxShadow:"0 25px 70px rgba(0,0,0,.4)",overflow:"hidden"},modalImg:{maxWidth:"85%",maxHeight:"85%",objectFit:"contain"},modalActions:{display:"flex",justifyContent:"flex-end",gap:8,padding:14,borderTop:"1px solid rgba(255,255,255,.07)"},lock:{minHeight:"100vh",display:"grid",placeItems:"center",alignContent:"center",padding:30,textAlign:"center"},lockIcon:{fontSize:42,color:"#c68a35"}
}
