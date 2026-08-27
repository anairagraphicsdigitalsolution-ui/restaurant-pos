"use client"

import { supabase } from "@/lib/supabase"
import { useEffect, useMemo, useState } from "react"

const PLUGIN_CODE = "ai-image-studio"
const PLUGIN_NAME = "AI Image Studio"

export default function AIImagePage() {
  const [prompt, setPrompt] = useState("")
  const [image, setImage] = useState("")
  const [loading, setLoading] = useState(false)
  const [pluginActive, setPluginActive] = useState(null)
  const [pluginMessage, setPluginMessage] = useState("")
  const [style, setStyle] = useState("realistic")
  const [history, setHistory] = useState([])
  const [copyMsg, setCopyMsg] = useState("")
  const [error, setError] = useState("")
  const [size, setSize] = useState("1024x1024")
  const [quality, setQuality] = useState("standard")
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("create")
  const [seedHint, setSeedHint] = useState("")

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
          if (alive) { setPluginActive(false); setPluginMessage("Login required") }
          return
        }
        const { data: profile, error: profileError } = await supabase
          .from("profiles").select("role,restaurant_id").eq("id", session.user.id).maybeSingle()
        if (!profileError && profile?.role === "super_admin") {
          if (alive) { setPluginActive(true); setPluginMessage("") }
          return
        }
        const res = await fetch("/api/plugins/list", {
          headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store"
        })
        const data = await res.json()
        const row = (data.data || []).find(x => x.code === PLUGIN_CODE)
        if (alive) {
          setPluginActive(row?.active === true)
          setPluginMessage(row?.active === true ? "" : `${PLUGIN_NAME} is not active for this restaurant.`)
        }
      } catch {
        if (alive) { setPluginActive(false); setPluginMessage("Unable to verify plugin access") }
      }
    })()
    return () => { alive = false }
  }, [])

  const suggestions = useMemo(() => [
    "Luxury restaurant interior, warm evening lighting, premium editorial photography",
    "Professional product photo on a clean studio set, soft shadows, premium advertising look",
    "Mountain resort landscape at sunrise, cinematic atmosphere, high-end travel campaign",
    "Modern business team portrait, natural light, sophisticated corporate campaign"
  ], [])

  async function generateImage() {
    const clean = prompt.trim()
    if (!clean) { setError("Describe what you want to create."); return }
    setLoading(true); setError("")
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `${clean} in ${style} style${seedHint ? `, ${seedHint}` : ""}`,
          plugin_code: PLUGIN_CODE, size, quality
        })
      })
      const raw = await res.text()
      let data
      try { data = JSON.parse(raw) } catch { throw new Error("Server returned an invalid response.") }
      if (!res.ok) throw new Error(data.error || "Image generation failed.")
      if (!data.image) throw new Error("No image was returned.")
      setImage(data.image)
      setHistory(prev => [{ prompt: clean, image: data.image, style, size }, ...prev].slice(0, 12))
      setActiveTab("create")
    } catch (err) {
      setError(err.message || "Network error.")
    } finally { setLoading(false) }
  }

  function downloadImage() {
    if (!image) return
    const link = document.createElement("a"); link.href = image; link.download = "ai-image-hd.png"; link.click()
  }

  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt); setCopyMsg("Copied") }
    catch { setCopyMsg("Copy failed") }
    setTimeout(() => setCopyMsg(""), 1400)
  }

  function useHistory(item) {
    setPrompt(item.prompt); setImage(item.image); setStyle(item.style || "realistic")
    setSize(item.size || "1024x1024"); setActiveTab("create")
  }

  if (pluginActive !== true) {
    return <div style={S.shell}><div style={S.lock}><div style={S.lockIcon}>✦</div><h2>{pluginMessage || "Checking access…"}</h2><p>AI Image Studio is available when the plugin is active for this account.</p></div></div>
  }

  return (
    <><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style><div style={S.shell}>
      <header style={S.header}>
        <div style={S.brand}><div style={S.brandIcon}>AI</div><div><b>AI Image Studio</b><span>Professional image generation workspace</span></div></div>
        <div style={S.headerRight}><span style={S.status}><i /> Studio ready</span><span style={S.badge}>PRO</span></div>
      </header>

      <div style={S.body}>
        <aside style={S.sidebar}>
          <div style={S.sideTitle}>CREATE</div>
          <button style={tab(activeTab === "create")} onClick={() => setActiveTab("create")}>✦ <span>Generate</span></button>
          <button style={tab(activeTab === "history")} onClick={() => setActiveTab("history")}>◷ <span>History</span><em>{history.length}</em></button>

          <div style={S.divider}/>
          <div style={S.sideTitle}>QUICK PROMPTS</div>
          {suggestions.map((x,i) => <button key={i} style={S.promptChip} onClick={() => setPrompt(x)}>{x}</button>)}
        </aside>

        <main style={S.main}>
          <div style={S.hero}>
            <div><span style={S.eyebrow}>AI CREATIVE ENGINE</span><h1>Turn ideas into <strong>visuals.</strong></h1><p>Generate production-ready images with precise style, quality and canvas controls.</p></div>
          </div>

          {activeTab === "create" ? (
            <div style={S.grid}>
              <section style={S.panel}>
                <div style={S.panelHead}><div><h3>Describe your image</h3><span>Be specific about subject, mood, lighting and composition.</span></div><span style={S.counter}>{prompt.length}/800</span></div>
                <textarea value={prompt} maxLength={800} onChange={e => setPrompt(e.target.value)} placeholder="Example: A premium Himalayan resort overlooking snow-capped mountains, golden-hour light, editorial travel photography…" style={S.textarea}/>
                <div style={S.controls}>
                  <Field label="Visual style"><select value={style} onChange={e=>setStyle(e.target.value)} style={S.input}>
                    <option value="realistic">Realistic</option><option value="cartoon">Cartoon</option><option value="3d">3D Render</option><option value="logo">Logo</option><option value="poster">Poster</option><option value="anime">Anime</option>
                  </select></Field>
                  <Field label="Canvas size"><select value={size} onChange={e=>setSize(e.target.value)} style={S.input}>
                    <option value="512x512">512 × 512</option><option value="1024x1024">1024 × 1024</option><option value="1792x1024">HD Wide</option>
                  </select></Field>
                  <Field label="Quality"><select value={quality} onChange={e=>setQuality(e.target.value)} style={S.input}>
                    <option value="standard">Standard</option><option value="hd">HD</option>
                  </select></Field>
                </div>
                <Field label="Creative direction (optional)"><input value={seedHint} onChange={e=>setSeedHint(e.target.value)} placeholder="e.g. clean composition, premium branding, soft natural light" style={S.input}/></Field>
                {error && <div style={S.error}>⚠ {error}</div>}
                <div style={S.actions}><button onClick={copyPrompt} style={S.secondary}>{copyMsg || "Copy prompt"}</button><button onClick={()=>setPrompt("")} style={S.secondary}>Clear</button><button onClick={generateImage} disabled={loading} style={S.primary}>{loading ? "Creating…" : "✦ Generate image"}</button></div>
              </section>

              <section style={S.resultPanel}>
                <div style={S.panelHead}><div><h3>Canvas</h3><span>{image ? "Click the image to open full preview." : "Your generated artwork will appear here."}</span></div>{image && <span style={S.readyPill}>READY</span>}</div>
                <div style={S.canvas}>
                  {loading ? <div style={S.loader}><div style={S.spinner}/><b>Creating your image</b><span>Rendering the requested visual…</span></div> :
                   image ? <button style={S.imageButton} onClick={()=>setPreviewOpen(true)}><img src={image} alt="Generated artwork" style={S.resultImage}/><span style={S.zoomHint}>⌕ Open preview</span></button> :
                   <div style={S.empty}><div style={S.emptyIcon}>✦</div><b>Ready for your idea</b><span>Write a prompt and generate your first visual.</span></div>}
                </div>
                {image && <div style={S.actions}><button onClick={downloadImage} style={S.download}>↓ Download HD</button><button onClick={generateImage} disabled={loading} style={S.secondary}>↻ Regenerate</button><button onClick={()=>setImage("")} style={S.secondary}>Clear canvas</button></div>}
              </section>
            </div>
          ) : (
            <section style={S.panel}><div style={S.panelHead}><div><h3>Generation history</h3><span>Your latest 12 generated visuals are kept in this session.</span></div></div>
              {history.length ? <div style={S.historyGrid}>{history.map((h,i)=><div key={i} style={S.historyCard}><button onClick={()=>useHistory(h)} style={S.historyImageBtn}><img src={h.image} alt="" style={S.historyImage}/></button><b>{h.prompt}</b><small>{h.style} · {h.size}</small><button onClick={()=>useHistory(h)} style={S.useBtn}>Use this</button></div>)}</div> : <div style={S.emptyWide}>No generations yet.</div>}
            </section>
          )}
        </main>
      </div>

      {previewOpen && <div style={S.modal} onClick={()=>setPreviewOpen(false)}><div style={S.modalInner} onClick={e=>e.stopPropagation()}><div style={S.modalTop}><div><b>Image preview</b><span>{size} · {quality.toUpperCase()}</span></div><button onClick={()=>setPreviewOpen(false)} style={S.close}>✕</button></div><div style={S.modalStage}><img src={image} alt="Preview" style={S.modalImage}/></div><div style={S.modalActions}><button onClick={downloadImage} style={S.download}>↓ Download HD PNG</button><button onClick={()=>setPreviewOpen(false)} style={S.secondary}>Close</button></div></div></div>}
    </div></>
  )
}

function Field({label,children}) { return <label style={S.field}><span>{label}</span>{children}</label> }
const tab = active => ({...S.sideBtn,...(active?S.sideActive:{})})
const S = {
 shell:{minHeight:"100vh",background:"var(--background)",color:"var(--text)",fontFamily:"Inter,system-ui,sans-serif"},
 header:{height:72,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 26px",borderBottom:"1px solid rgba(255,255,255,.08)",background:"rgba(15,18,27,.92)",backdropFilter:"blur(16px)",position:"sticky",top:0,zIndex:10},
 brand:{display:"flex",alignItems:"center",gap:12},brandIcon:{width:40,height:40,borderRadius:12,display:"grid",placeItems:"center",fontWeight:900,color:"#fff",background:"linear-gradient(135deg,#c68a35,#8b5e18)",boxShadow:"0 8px 25px rgba(198,138,53,.2)"},brand:{display:"flex",alignItems:"center",gap:12},
 headerRight:{display:"flex",alignItems:"center",gap:12},status:{fontSize:11,color:"#8e96a7",display:"flex",alignItems:"center",gap:6},statusDot:{},badge:{fontSize:9,fontWeight:900,padding:"6px 8px",borderRadius:7,background:"rgba(198,138,53,.14)",color:"#e6b96b",letterSpacing:".1em"},
 body:{display:"grid",gridTemplateColumns:"230px minmax(0,1fr)",minHeight:"calc(100vh - 72px)"},sidebar:{borderRight:"1px solid rgba(255,255,255,.07)",padding:18,background:"rgba(17,20,27,.75)"},sideTitle:{fontSize:9,color:"#737c8e",fontWeight:900,letterSpacing:".14em",margin:"12px 0 9px"},sideBtn:{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 11px",border:"1px solid transparent",borderRadius:9,background:"transparent",color:"var(--text)",textAlign:"left",cursor:"pointer",fontSize:11},sideActive:{background:"rgba(198,138,53,.12)",borderColor:"rgba(198,138,53,.28)",color:"#e6b96b"},sideBtnEm:{},promptChip:{width:"100%",padding:"9px 10px",marginBottom:6,borderRadius:9,border:"1px solid rgba(255,255,255,.07)",background:"rgba(255,255,255,.025)",color:"#9ca5b5",fontSize:9,lineHeight:1.35,textAlign:"left",cursor:"pointer"},divider:{height:1,background:"rgba(255,255,255,.07)",margin:"18px 0"},
 main:{minWidth:0,padding:"28px 30px 50px"},hero:{padding:"8px 0 26px"},eyebrow:{fontSize:9,fontWeight:900,letterSpacing:".16em",color:"#c68a35"},h1:{},grid:{display:"grid",gridTemplateColumns:"minmax(330px,.9fr) minmax(400px,1.1fr)",gap:18},panel:{background:"rgba(17,20,27,.88)",border:"1px solid rgba(255,255,255,.08)",borderRadius:16,padding:20,boxShadow:"0 18px 50px rgba(0,0,0,.16)"},resultPanel:{background:"rgba(17,20,27,.88)",border:"1px solid rgba(255,255,255,.08)",borderRadius:16,padding:20,boxShadow:"0 18px 50px rgba(0,0,0,.16)",minWidth:0},panelHead:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:14},counter:{fontSize:9,color:"#737c8e"},readyPill:{fontSize:8,fontWeight:900,color:"#63d391",padding:"5px 7px",borderRadius:6,background:"rgba(99,211,145,.1)"},textarea:{width:"100%",minHeight:170,resize:"vertical",padding:14,borderRadius:12,border:"1px solid rgba(255,255,255,.1)",background:"#0b0d12",color:"var(--text)",outline:"none",fontSize:12,lineHeight:1.55},controls:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:13},field:{display:"flex",flexDirection:"column",gap:6,fontSize:9,color:"#8f97a8",marginTop:12},input:{width:"100%",padding:"10px 11px",borderRadius:9,border:"1px solid rgba(255,255,255,.1)",background:"#0b0d12",color:"var(--text)",outline:"none",fontSize:11},actions:{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:8,flexWrap:"wrap",marginTop:15},primary:{padding:"11px 16px",border:0,borderRadius:9,background:"linear-gradient(135deg,#c68a35,#a56f22)",color:"#fff",fontWeight:800,cursor:"pointer",boxShadow:"0 8px 24px rgba(198,138,53,.2)"},secondary:{padding:"10px 13px",borderRadius:9,border:"1px solid rgba(255,255,255,.09)",background:"#181c25",color:"#d9dee8",cursor:"pointer",fontSize:10},download:{padding:"10px 14px",borderRadius:9,border:"1px solid rgba(99,211,145,.25)",background:"rgba(99,211,145,.1)",color:"#76d99b",fontWeight:800,cursor:"pointer",fontSize:10},error:{marginTop:12,padding:10,borderRadius:9,background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.18)",color:"#fca5a5",fontSize:10},canvas:{minHeight:390,borderRadius:13,border:"1px dashed rgba(255,255,255,.1)",background:"radial-gradient(circle at 50% 40%,rgba(198,138,53,.06),transparent 45%),#080a0f",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",position:"relative"},empty:{textAlign:"center",padding:30,color:"#737c8e"},emptyIcon:{fontSize:32,color:"#c68a35",marginBottom:10},emptyWide:{padding:50,textAlign:"center",color:"#737c8e"},loader:{display:"flex",flexDirection:"column",alignItems:"center",gap:7,color:"#b9c0cc",fontSize:11},spinner:{width:34,height:34,borderRadius:"50%",border:"3px solid rgba(255,255,255,.08)",borderTopColor:"#c68a35",animation:"spin 1s linear infinite"},imageButton:{position:"relative",width:"100%",height:"100%",minHeight:390,border:0,padding:0,background:"transparent",cursor:"zoom-in"},resultImage:{width:"100%",height:"100%",minHeight:390,objectFit:"contain",display:"block"},zoomHint:{position:"absolute",right:12,bottom:12,padding:"7px 9px",borderRadius:7,background:"rgba(0,0,0,.62)",color:"#fff",fontSize:9},historyGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12},historyCard:{padding:10,borderRadius:12,background:"#0b0d12",border:"1px solid rgba(255,255,255,.07)"},historyImageBtn:{width:"100%",padding:0,border:0,background:"transparent",cursor:"pointer"},historyImage:{width:"100%",aspectRatio:"1",objectFit:"cover",borderRadius:8,display:"block"},useBtn:{marginTop:8,width:"100%",padding:"8px",borderRadius:7,border:"1px solid rgba(255,255,255,.08)",background:"#181c25",color:"#d9dee8",cursor:"pointer",fontSize:9},modal:{position:"fixed",inset:0,zIndex:100,background:"rgba(0,0,0,.82)",backdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"center",padding:25},modalInner:{width:"min(1100px,95vw)",maxHeight:"94vh",background:"#11141b",border:"1px solid rgba(255,255,255,.1)",borderRadius:16,overflow:"hidden",boxShadow:"0 35px 100px rgba(0,0,0,.65)"},modalTop:{display:"flex",justifyContent:"space-between",padding:"14px 18px",borderBottom:"1px solid rgba(255,255,255,.07)"},close:{border:0,background:"transparent",color:"#fff",cursor:"pointer"},modalStage:{height:"min(72vh,720px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"#07090d"},modalImage:{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"},modalActions:{display:"flex",justifyContent:"flex-end",gap:8,padding:14,borderTop:"1px solid rgba(255,255,255,.07)"},lock:{minHeight:"100vh",display:"grid",placeItems:"center",alignContent:"center",padding:30,textAlign:"center"},lockIcon:{fontSize:40,color:"#c68a35"}
}
