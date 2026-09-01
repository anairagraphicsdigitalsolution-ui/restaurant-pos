"use client"

import { supabaseCloud } from "@/lib/supabaseCloud"
import { useEffect, useMemo, useState } from "react"

const PLUGIN_CODE = "ai-poster-studio"
const PLUGIN_NAME = "AI Poster Studio"

export default function PosterPage() {
  const [prompt,setPrompt]=useState("")
  const [image,setImage]=useState("")
  const [loading,setLoading]=useState(false)
  const [pluginActive,setPluginActive]=useState(null)
  const [pluginMessage,setPluginMessage]=useState("")
  const [style,setStyle]=useState("modern")
  const [size,setSize]=useState("1024")
  const [text,setText]=useState("")
  const [history,setHistory]=useState([])
  const [copied,setCopied]=useState("")
  const [error,setError]=useState("")
  const [preview,setPreview]=useState(false)
  const [tab,setTab]=useState("create")

  useEffect(() => {
    let alive=true
    ;(async()=>{
      try{
        const {data:{session}}=await supabaseCloud.auth.getSession()
        if(!session?.access_token){if(alive){setPluginActive(false);setPluginMessage("Login required")}return}
        const {data:profile,error:profileError}=await supabaseCloud.from("profiles").select("role,restaurant_id").eq("id",session.user.id).maybeSingle()
        if(!profileError&&profile?.role==="super_admin"){if(alive){setPluginActive(true);setPluginMessage("")}return}
        const res=await fetch("/api/plugins/list",{headers:{Authorization:`Bearer ${session.access_token}`},cache:"no-store"})
        const data=await res.json()
        const row=(data.data||[]).find(x=>x.code===PLUGIN_CODE)
        if(alive){setPluginActive(row?.active===true);setPluginMessage(row?.active===true?"":`${PLUGIN_NAME} is not active for this restaurant.`)}
      }catch{if(alive){setPluginActive(false);setPluginMessage("Unable to verify plugin access")}}
    })()
    return()=>{alive=false}
  },[])

  const suggestions=useMemo(()=>[
    "Weekend food festival poster for a premium restaurant",
    "Luxury hotel summer offer with mountain destination",
    "New product launch campaign with bold premium composition",
    "Grand opening announcement with elegant modern branding"
  ],[])

  async function generate(){
    const clean=prompt.trim()
    if(!clean){setError("Describe the poster you want to create.");return}
    setLoading(true);setError("")
    try{
      const res=await fetch("/api/generate-image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        prompt:`${clean}, ${style} poster design, high quality, bold text space, cinematic lighting`,
        plugin_code:PLUGIN_CODE,size
      })})
      const raw=await res.text();let data
      try{data=JSON.parse(raw)}catch{throw new Error("Server returned an invalid response.")}
      if(!res.ok)throw new Error(data.error||"Poster generation failed.")
      if(!data.image)throw new Error("No poster image was returned.")
      setImage(data.image);setHistory(prev=>[{prompt:clean,image:data.image,style,size,text},...prev].slice(0,12));setTab("create")
    }catch(e){setError(e.message||"Network error.")}finally{setLoading(false)}
  }
  async function copyPrompt(){try{await navigator.clipboard.writeText(prompt);setCopied("Copied")}catch{setCopied("Copy failed")}setTimeout(()=>setCopied(""),1400)}
  function download(){if(!image)return;const a=document.createElement("a");a.href=image;a.download="ai-poster-hd.png";a.click()}
  function useHistory(h){setPrompt(h.prompt);setImage(h.image);setStyle(h.style||"modern");setSize(h.size||"1024");setText(h.text||"");setTab("create")}

  if(pluginActive!==true)return <div style={S.shell}><div style={S.lock}><div style={S.lockIcon}>▣</div><h2>{pluginMessage||"Checking access…"}</h2><p>AI Poster Studio is available when the plugin is active for this account.</p></div></div>

  return <><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style><div style={S.shell}>
    <header style={S.header}>
      <div style={S.brand}><div style={S.brandIcon}>P</div><div><b>AI Poster Studio</b><span>Campaign-ready poster creation</span></div></div>
      <div style={S.headRight}><span style={S.status}><i/> Studio ready</span><span style={S.pro}>PRO</span></div>
    </header>
    <div style={S.body}>
      <aside style={S.side}>
        <div style={S.sideTitle}>WORKSPACE</div>
        <button style={tabStyle(tab==="create")} onClick={()=>setTab("create")}>✦ <span>Create poster</span></button>
        <button style={tabStyle(tab==="history")} onClick={()=>setTab("history")}>◷ <span>History</span><em>{history.length}</em></button>
        <div style={S.divider}/>
        <div style={S.sideTitle}>IDEAS</div>
        {suggestions.map((x,i)=><button key={i} style={S.chip} onClick={()=>setPrompt(x)}>{x}</button>)}
      </aside>
      <main style={S.main}>
        <div style={S.hero}><span>CAMPAIGN DESIGN ENGINE</span><h1>Make posters that <strong>get noticed.</strong></h1><p>Build polished promotional artwork with controlled style, resolution and headline treatment.</p></div>
        {tab==="create"?<div style={S.grid}>
          <section style={S.panel}>
            <div style={S.head}><div><h3>Poster brief</h3><small>Describe the campaign, audience, mood and visual direction.</small></div><b style={S.count}>{prompt.length}/800</b></div>
            <textarea value={prompt} maxLength={800} onChange={e=>setPrompt(e.target.value)} placeholder="Example: Luxury weekend dining offer, elegant gold accents, dark premium restaurant atmosphere…" style={S.textarea}/>
            <div style={S.controls}>
              <Field label="Design style"><select value={style} onChange={e=>setStyle(e.target.value)} style={S.input}><option value="modern">Modern</option><option value="cinematic">Cinematic</option><option value="festival">Festival</option><option value="political">Political</option><option value="business">Business</option><option value="sale">Sale / Offer</option></select></Field>
              <Field label="Output"><select value={size} onChange={e=>setSize(e.target.value)} style={S.input}><option value="512">Small · 512px</option><option value="1024">HD · 1024px</option><option value="2048">Ultra HD · 2048px</option></select></Field>
            </div>
            <Field label="Headline overlay (optional)"><input value={text} onChange={e=>setText(e.target.value)} placeholder="e.g. 30% OFF THIS WEEKEND" style={S.input}/></Field>
            {error&&<div style={S.error}>⚠ {error}</div>}
            <div style={S.actions}><button onClick={copyPrompt} style={S.secondary}>{copied||"Copy prompt"}</button><button onClick={()=>{setPrompt("");setText("")}} style={S.secondary}>Clear</button><button onClick={generate} disabled={loading} style={S.primary}>{loading?"Creating…":"✦ Generate poster"}</button></div>
          </section>
          <section style={S.panel}>
            <div style={S.head}><div><h3>Poster canvas</h3><small>{image?"Click preview to inspect the final artwork.":"Your campaign artwork appears here."}</small></div>{image&&<span style={S.ready}>READY</span>}</div>
            <div style={S.canvas}>
              {loading?<div style={S.loader}><div style={S.spinner}/><b>Designing poster</b><small>Generating campaign artwork…</small></div>:
              image?<button style={S.imageBtn} onClick={()=>setPreview(true)}><img src={image} alt="Generated poster" style={S.image}/>{text&&<span style={S.overlay}>{text}</span>}<span style={S.zoom}>⌕ Preview</span></button>:
              <div style={S.empty}><div>▣</div><b>Poster canvas ready</b><small>Start with a campaign idea on the left.</small></div>}
            </div>
            {image&&<div style={S.actions}><button onClick={download} style={S.download}>↓ Download HD</button><button onClick={generate} disabled={loading} style={S.secondary}>↻ Regenerate</button><button onClick={()=>setImage("")} style={S.secondary}>Clear</button></div>}
          </section>
        </div>:
        <section style={S.panel}><div style={S.head}><div><h3>Poster history</h3><small>Your latest 12 generations from this session.</small></div></div>{history.length?<div style={S.history}>{history.map((h,i)=><div key={i} style={S.card}><button onClick={()=>useHistory(h)} style={S.hbtn}><img src={h.image} alt="" style={S.himg}/></button><b>{h.prompt}</b><small>{h.style} · {h.size}px</small><button onClick={()=>useHistory(h)} style={S.use}>Use this</button></div>)}</div>:<div style={S.emptyWide}>No posters generated yet.</div>}</section>}
      </main>
    </div>
    {preview&&<div style={S.modal} onClick={()=>setPreview(false)}><div style={S.modalBox} onClick={e=>e.stopPropagation()}><div style={S.modalTop}><div><b>Poster preview</b><span>{size}px · {style}</span></div><button onClick={()=>setPreview(false)} style={S.close}>✕</button></div><div style={S.modalStage}><div style={S.posterFrame}><img src={image} alt="Poster preview" style={S.modalImg}/>{text&&<div style={S.modalText}>{text}</div>}</div></div><div style={S.modalActions}><button onClick={download} style={S.download}>↓ Download HD PNG</button><button onClick={()=>setPreview(false)} style={S.secondary}>Close</button></div></div></div>}
  </div></>
}
function Field({label,children}){return <label style={S.field}><span>{label}</span>{children}</label>}
const tabStyle=a=>({...S.sideBtn,...(a?S.active:{})})
const S={
shell:{minHeight:"100vh",background:"var(--background)",color:"var(--text)",fontFamily:"Inter,system-ui,sans-serif"},header:{height:72,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 26px",background:"rgba(15,18,27,.94)",borderBottom:"1px solid rgba(255,255,255,.08)",position:"sticky",top:0,zIndex:10,backdropFilter:"blur(16px)"},brand:{display:"flex",alignItems:"center",gap:12},brandIcon:{width:40,height:40,borderRadius:12,display:"grid",placeItems:"center",fontWeight:900,color:"#fff",background:"linear-gradient(135deg,#c68a35,#8b5e18)"},headRight:{display:"flex",gap:12,alignItems:"center"},status:{fontSize:10,color:"#8d95a6"},pro:{fontSize:9,fontWeight:900,color:"#e6b96b",padding:"6px 8px",background:"rgba(198,138,53,.12)",borderRadius:7},body:{display:"grid",gridTemplateColumns:"230px minmax(0,1fr)",minHeight:"calc(100vh - 72px)"},side:{padding:18,borderRight:"1px solid rgba(255,255,255,.07)",background:"rgba(17,20,27,.75)"},sideTitle:{fontSize:9,fontWeight:900,letterSpacing:".14em",color:"#737c8e",margin:"12px 0 9px"},sideBtn:{width:"100%",padding:"10px 11px",display:"flex",gap:10,alignItems:"center",border:"1px solid transparent",borderRadius:9,background:"transparent",color:"var(--text)",cursor:"pointer",textAlign:"left",fontSize:11},active:{background:"rgba(198,138,53,.12)",borderColor:"rgba(198,138,53,.3)",color:"#e6b96b"},chip:{width:"100%",padding:"9px 10px",marginBottom:6,borderRadius:9,border:"1px solid rgba(255,255,255,.07)",background:"rgba(255,255,255,.025)",color:"#9ca5b5",fontSize:9,textAlign:"left",lineHeight:1.35,cursor:"pointer"},divider:{height:1,background:"rgba(255,255,255,.07)",margin:"18px 0"},main:{minWidth:0,padding:"28px 30px 50px"},hero:{padding:"6px 0 25px"},grid:{display:"grid",gridTemplateColumns:"minmax(330px,.9fr) minmax(400px,1.1fr)",gap:18},panel:{background:"rgba(17,20,27,.88)",border:"1px solid rgba(255,255,255,.08)",borderRadius:16,padding:20,boxShadow:"0 18px 50px rgba(0,0,0,.16)"},head:{display:"flex",justifyContent:"space-between",gap:10,marginBottom:14},count:{fontSize:9,color:"#737c8e"},ready:{fontSize:8,color:"#63d391",padding:"5px 7px",borderRadius:6,background:"rgba(99,211,145,.1)"},textarea:{width:"100%",minHeight:165,resize:"vertical",padding:14,borderRadius:12,border:"1px solid rgba(255,255,255,.1)",background:"#0b0d12",color:"var(--text)",fontSize:12,lineHeight:1.5,outline:"none"},controls:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},field:{display:"flex",flexDirection:"column",gap:6,fontSize:9,color:"#8f97a8",marginTop:12},input:{width:"100%",padding:"10px 11px",borderRadius:9,border:"1px solid rgba(255,255,255,.1)",background:"#0b0d12",color:"var(--text)",fontSize:11,outline:"none"},actions:{display:"flex",justifyContent:"flex-end",gap:8,flexWrap:"wrap",marginTop:15},primary:{padding:"11px 16px",border:0,borderRadius:9,background:"linear-gradient(135deg,#c68a35,#a56f22)",color:"#fff",fontWeight:800,cursor:"pointer"},secondary:{padding:"10px 13px",borderRadius:9,border:"1px solid rgba(255,255,255,.09)",background:"#181c25",color:"#d9dee8",cursor:"pointer",fontSize:10},download:{padding:"10px 14px",borderRadius:9,border:"1px solid rgba(99,211,145,.25)",background:"rgba(99,211,145,.1)",color:"#76d99b",fontWeight:800,cursor:"pointer",fontSize:10},error:{marginTop:12,padding:10,borderRadius:9,background:"rgba(239,68,68,.1)",color:"#fca5a5",fontSize:10},canvas:{minHeight:400,borderRadius:13,border:"1px dashed rgba(255,255,255,.1)",background:"#080a0f",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"},imageBtn:{position:"relative",width:"100%",minHeight:400,border:0,padding:0,background:"transparent",cursor:"zoom-in",overflow:"hidden"},image:{width:"100%",height:"100%",minHeight:400,objectFit:"contain",display:"block"},overlay:{position:"absolute",left:"50%",bottom:28,transform:"translateX(-50%)",fontSize:25,fontWeight:900,color:"#fff",textShadow:"0 5px 18px rgba(0,0,0,.8)",whiteSpace:"nowrap"},zoom:{position:"absolute",right:12,bottom:12,padding:"7px 9px",borderRadius:7,background:"rgba(0,0,0,.65)",color:"#fff",fontSize:9},loader:{display:"flex",flexDirection:"column",alignItems:"center",gap:7,color:"#b9c0cc"},spinner:{width:34,height:34,borderRadius:"50%",border:"3px solid rgba(255,255,255,.08)",borderTopColor:"#c68a35",animation:"spin 1s linear infinite"},empty:{textAlign:"center",color:"#737c8e",padding:30},history:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12},card:{padding:10,borderRadius:12,background:"#0b0d12",border:"1px solid rgba(255,255,255,.07)"},hbtn:{width:"100%",padding:0,border:0,background:"transparent",cursor:"pointer"},himg:{width:"100%",aspectRatio:"3/4",objectFit:"cover",borderRadius:8},use:{width:"100%",marginTop:8,padding:8,borderRadius:7,border:"1px solid rgba(255,255,255,.08)",background:"#181c25",color:"#d9dee8",cursor:"pointer",fontSize:9},emptyWide:{padding:60,textAlign:"center",color:"#737c8e"},modal:{position:"fixed",inset:0,zIndex:100,background:"rgba(0,0,0,.82)",backdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"center",padding:25},modalBox:{width:"min(1000px,95vw)",maxHeight:"94vh",background:"#11141b",border:"1px solid rgba(255,255,255,.1)",borderRadius:16,overflow:"hidden"},modalTop:{display:"flex",justifyContent:"space-between",padding:"14px 18px",borderBottom:"1px solid rgba(255,255,255,.07)"},close:{border:0,background:"transparent",color:"#fff",cursor:"pointer"},modalStage:{minHeight:500,maxHeight:"75vh",display:"flex",justifyContent:"center",alignItems:"center",padding:20,background:"#07090d",overflow:"auto"},posterFrame:{position:"relative",maxHeight:"70vh",maxWidth:"90%",display:"flex"},modalImg:{maxWidth:"100%",maxHeight:"70vh",objectFit:"contain"},modalText:{position:"absolute",left:"50%",bottom:30,transform:"translateX(-50%)",color:"#fff",fontSize:28,fontWeight:900,textShadow:"0 5px 18px rgba(0,0,0,.8)",whiteSpace:"nowrap"},modalActions:{display:"flex",justifyContent:"flex-end",gap:8,padding:14,borderTop:"1px solid rgba(255,255,255,.07)"},lock:{minHeight:"100vh",display:"grid",placeItems:"center",alignContent:"center",padding:30,textAlign:"center"},lockIcon:{fontSize:42,color:"#c68a35"}
}
