"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import html2canvas from "html2canvas"

/**
 * Business Card Studio — Canva-style editor
 * Drop-in replacement for the uploaded business-card page.
 *
 * Keeps the existing client-side export approach, but adds:
 * - professional editor shell
 * - front/back card
 * - templates
 * - element toolbar
 * - drag / resize / rotate
 * - typography / color / opacity / radius
 * - layers
 * - duplicate / delete / lock
 * - undo / redo
 * - grid toggle
 * - card zoom
 * - business information panel
 * - logo/image upload
 * - high-resolution PNG export
 *
 * No backend/DB changes are required by this page.
 */

const CARD = { width: 1050, height: 600, printWidthIn: 3.5, printHeightIn: 2, dpi: 300 }

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

const createElement = (type, extra = {}) => ({
  id: uid(),
  type,
  x: 100,
  y: 80,
  w: type === "text" ? 320 : 180,
  h: type === "text" ? 54 : 120,
  rotate: 0,
  opacity: 1,
  z: Date.now(),
  locked: false,
  layerName: type === "text" ? "Text" : type === "image" ? "Image" : "Shape",
  text: type === "text" ? "Edit text" : "",
  fontSize: 34,
  fontFamily: "Poppins",
  fontWeight: 600,
  textAlign: "left",
  color: "#ffffff",
  fill: "#c68a35",
  stroke: "#ffffff",
  strokeWidth: 2,
  radius: 12,
  shadow: false,
  shapeType: "rect",
  src: "",
  dynamicKey: "",
  frameShape: "rect",
  objectFit: type === "frame" ? "cover" : "contain",
  objectPosition: "50% 50%",
  groupId: "",
  ...extra,
})

const templates = [
  { name: "Luxury Gold", bg: "linear-gradient(135deg,#151515,#000)", accent: "#c68a35" },
  { name: "Royal Black", bg: "linear-gradient(135deg,#000,#171717)", accent: "#d4af37" },
  { name: "Corporate Blue", bg: "linear-gradient(135deg,#0f172a,#1e3a8a)", accent: "#60a5fa" },
  { name: "Clean White", bg: "linear-gradient(135deg,#ffffff,#eef2f7)", accent: "#111827" },
  { name: "Dark Glass", bg: "linear-gradient(135deg,#111827,#030712)", accent: "#a78bfa" },
  { name: "Restaurant Gold", bg: "linear-gradient(135deg,#33200a,#050505)", accent: "#c68a35" },
  { name: "Doctor", bg: "linear-gradient(135deg,#ffffff,#e8f1f5)", accent: "#0f766e" },
  { name: "Lawyer", bg: "linear-gradient(135deg,#111827,#374151)", accent: "#d1d5db" },
  { name: "Salon", bg: "linear-gradient(135deg,#3b0764,#701a75)", accent: "#f0abfc" },
  { name: "Gym", bg: "linear-gradient(135deg,#111,#262626)", accent: "#facc15" },
]

const fonts = ["Poppins", "Montserrat", "Inter", "Roboto", "Georgia", "Arial"]

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}


function DesignStudioHome({ onOpenBusinessCard, onOpenAI }) {
  const formats = [
    { key:"business", icon:"▣", title:"Business Card", sub:"Professional visiting cards", size:"3.5 × 2 inch", cls:"gold", action:onOpenBusinessCard, cta:"Open Studio" },
    { key:"poster", icon:"▤", title:"Poster Design", sub:"Events, Promotion & More", size:"Custom Size", cls:"purple", action:()=>onOpenAI("/ai/poster"), cta:"Open Poster" },
    { key:"social", icon:"▣", title:"Social Media Post", sub:"Instagram, Facebook & More", size:"1080 × 1080 px", cls:"pink", action:()=>onOpenAI("/ai/image"), cta:"Create Post" },
    { key:"facebook", icon:"f", title:"Facebook Post", sub:"Posts, Covers & Ads", size:"1200 × 630 px", cls:"blue", action:()=>onOpenAI("/ai/poster"), cta:"Create Design" },
    { key:"instagram", icon:"◎", title:"Instagram Post", sub:"Posts, Stories, Reels & Ads", size:"1080 × 1350 px", cls:"orange", action:()=>onOpenAI("/ai/image"), cta:"Create Design" },
    { key:"custom", icon:"＋", title:"Custom Size", sub:"Create custom dimensions", size:"Any Size", cls:"green", action:onOpenBusinessCard, cta:"Custom Studio" },
  ]

  const templates = [
    ["Business Card","▣","3.5 × 2 in","gold"],
    ["Restaurant Poster","▤","1080 × 1350","purple"],
    ["Social Media","◎","1080 × 1080","pink"],
    ["Facebook Post","f","1200 × 630","blue"],
    ["Instagram Post","◎","1080 × 1350","orange"],
  ]

  const presets = [
    ["Instagram Post","1080 × 1350 px","◎"],
    ["Instagram Story","1080 × 1920 px","▯"],
    ["Facebook Post","1200 × 630 px","f"],
    ["Facebook Cover","820 × 312 px","▰"],
    ["LinkedIn Post","1200 × 1200 px","in"],
    ["YouTube Thumbnail","1280 × 720 px","▶"],
    ["Twitter Post","1200 × 675 px","♥"],
    ["Pinterest Pin","1000 × 1500 px","P"],
  ]

  return (
    <div className="ds-shell">
      <header className="ds-top">
        <div className="ds-logo">
          <div className="ds-logo-mark">A</div>
          <div><strong>ANAIRA</strong><span>GRAPHICS</span></div>
        </div>
        <div className="ds-search">⌕ <span>Search templates, projects...</span><kbd>Ctrl K</kbd></div>
        <div className="ds-top-right">
          <button className="ds-upgrade">♛ Upgrade Plan</button>
          <button className="ds-icon">♧</button>
          <div className="ds-user"><div className="ds-avatar">A</div><div><b>Anaira Graphics</b><span>Super Admin</span></div><span>⌄</span></div>
        </div>
      </header>

      <div className="ds-layout">
        <aside className="ds-sidebar">
          <button className="ds-nav active">▦ <span>Dashboard</span></button>
          <div className="ds-line"/>
          <div className="ds-nav-title">AI CREATIVE STUDIOS</div>
          <button className="ds-nav" onClick={()=>onOpenAI("/ai/image")}>✦ <span><b>AI Image Studio</b><small>Generate with AI</small></span><i>›</i></button>
          <button className="ds-nav" onClick={()=>onOpenAI("/ai/poster")}>▤ <span><b>AI Poster Studio</b><small>Create Posters</small></span><i>›</i></button>
          <button className="ds-nav" onClick={()=>onOpenAI("/ai/logo")}>◇ <span><b>AI Logo Studio</b><small>Create Logos</small></span><i>›</i></button>
          <button className="ds-nav selected">▣ <span><b>Business Card Studio</b><small>Design Business Cards</small></span></button>
          <div className="ds-line"/>
          <div className="ds-nav-title">DESIGN SUITE</div>
          {[
            ["▤","Poster Design","Social Media & Print"],
            ["▣","Social Media Post","Instagram, Facebook & More"],
            ["f","Facebook Post","Covers, Posts & Ads"],
            ["◎","Instagram Post","Posts, Stories, Reels & Ads"],
            ["▶","YouTube Thumbnail","Thumbnails & Banners"],
            ["▧","Flyer Design","Event, Promotion & More"],
            ["▤","Banner Design","Web, Print & Outdoor"],
            ["▥","Brochure Design","Tri-fold, Bi-fold & More"],
            ["✣","Invitation Design","Wedding, Party & More"],
          ].map(([ic,title,sub])=>(
            <button key={title} className="ds-nav ds-nav-compact" onClick={onOpenBusinessCard}><span className="ds-nav-icon">{ic}</span><span><b>{title}</b><small>{sub}</small></span></button>
          ))}
          <div className="ds-enterprise"><b>♛ Upgrade to Enterprise</b><span>Unlock all premium features</span><button>Upgrade Now</button></div>
          <div className="ds-copy">© 2026 Anaira Graphics</div>
        </aside>

        <main className="ds-main">
          <div className="ds-heading">
            <div><h1>What do you want to design today?</h1><p>Choose a design type or create custom size</p></div>
            <button className="ds-custom">⌗ Custom Dimension</button>
          </div>

          <div className="ds-format-grid">
            {formats.map(f=>(
              <button key={f.key} className={`ds-format ${f.cls}`} onClick={f.action}>
                <div className="ds-format-icon">{f.icon}</div><b>{f.title}</b><span>{f.sub}</span><small>{f.size}</small>
              </button>
            ))}
          </div>

          <section className="ds-section">
            <div className="ds-section-head"><div><h2>Popular Templates</h2></div><button>View All</button></div>
            <div className="ds-filter">
              {["All","Business Card","Poster","Social Media","Facebook","Instagram","Banner","Flyer"].map((x,i)=><button className={i===0?"on":""} key={x}>{x}</button>)}
            </div>
            <div className="ds-template-row">
              {templates.map(([name,ic,size,cls])=>(
                <button className="ds-template-card" key={name} onClick={name==="Business Card"?onOpenBusinessCard:onOpenBusinessCard}>
                  <div className={`ds-template-preview ${cls}`}><span>{ic}</span><strong>{name}</strong><em>{name==="Business Card"?"JOHN DOE":name==="Restaurant Poster"?"GRAND OPENING":name==="Social Media"?"SPECIAL OFFER":name==="Facebook Post"?"Digital Marketing":"NEW COLLECTION"}</em></div>
                  <b>{name}</b><small>{size}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="ds-section">
            <div className="ds-section-head"><div><h2>Custom Size Presets</h2><p>Start with the right dimensions</p></div></div>
            <div className="ds-preset-tabs">{["Social Media","Print","Web","Mobile","Marketing"].map((x,i)=><button className={i===0?"on":""} key={x}>{x}</button>)}</div>
            <div className="ds-preset-grid">
              {presets.map(([name,size,ic])=><button className="ds-preset" key={name} onClick={onOpenBusinessCard}><div className="ds-preset-icon">{ic}</div><b>{name}</b><small>{size}</small></button>)}
              <button className="ds-preset custom" onClick={onOpenBusinessCard}><div className="ds-preset-icon">＋</div><b>Custom Size</b><small>Any dimensions</small></button>
            </div>
          </section>
        </main>

        <aside className="ds-right">
          <section className="ds-right-card">
            <div className="ds-right-head"><h3>Recent Designs</h3><button>View All</button></div>
            {[
              ["Business Card Design","2 minutes ago","Business Card","gold"],
              ["Restaurant Poster","1 hour ago","Poster","purple"],
              ["Food Social Post","3 hours ago","Social Media","pink"],
              ["Fashion Sale Post","5 hours ago","Instagram Post","orange"],
              ["Company FB Cover","1 day ago","Facebook Post","blue"],
            ].map(([name,time,tag,cls])=>(
              <button className="ds-recent" key={name} onClick={onOpenBusinessCard}>
                <div className={`ds-recent-thumb ${cls}`}></div><div><b>{name}</b><small>{time}</small><em className={cls}>{tag}</em></div>
              </button>
            ))}
          </section>
          <section className="ds-right-card">
            <div className="ds-right-head"><h3>Quick Actions</h3></div>
            {[
              ["♙","Upload Image","Upload your images"],
              ["▣","My Projects","View all your projects"],
              ["♢","Brand Kit","Your brand assets"],
              ["▤","Templates","Browse all templates"],
            ].map(([ic,title,sub])=><button className="ds-quick" key={title} onClick={onOpenBusinessCard}><span>{ic}</span><div><b>{title}</b><small>{sub}</small></div><i>›</i></button>)}
          </section>
        </aside>
      </div>

      <footer className="ds-footer">
        <div><span>✦</span><b>AI Powered</b><small>Smart design assistance</small></div>
        <div><span>♧</span><b>Professional Templates</b><small>1000+ premium templates</small></div>
        <div><span>♧</span><b>Easy to Use</b><small>Drag & drop interface</small></div>
        <div><span>⌗</span><b>High Quality Export</b><small>HD PNG, JPG, PDF</small></div>
        <div><span>♧</span><b>Cloud Storage</b><small>Access anywhere</small></div>
      </footer>
      <style jsx>{`
        .ds-shell{min-height:100vh;background:#0a0e16;color:#f3f5f8;font-family:Inter,system-ui,sans-serif}
        .ds-top{height:72px;display:grid;grid-template-columns:230px minmax(320px,1fr) auto;align-items:center;gap:28px;padding:0 18px;border-bottom:1px solid rgba(255,255,255,.07);background:#0e131d}
        .ds-logo{display:flex;align-items:center;gap:10px}.ds-logo-mark{width:40px;height:40px;border-radius:11px;border:1px solid rgba(198,138,53,.35);display:grid;place-items:center;color:#e6b96b;font-weight:900}.ds-logo strong{display:block;letter-spacing:.18em;font-size:14px;color:#e6b96b}.ds-logo span{font-size:8px;letter-spacing:.35em;color:#b8bec9}
        .ds-search{height:40px;max-width:600px;justify-self:center;width:100%;display:flex;align-items:center;gap:10px;padding:0 13px;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:#121824;color:#8d96a6;font-size:12px}.ds-search kbd{margin-left:auto;padding:4px 7px;border:1px solid rgba(255,255,255,.1);border-radius:5px;font-size:9px;background:#171d28}
        .ds-top-right{display:flex;align-items:center;gap:10px}.ds-upgrade{height:38px;padding:0 15px;border:1px solid rgba(120,91,255,.55);border-radius:8px;background:linear-gradient(135deg,#25154d,#182a5a);color:#fff;font-weight:800;font-size:10px;cursor:pointer}.ds-icon{width:38px;height:38px;border:1px solid rgba(255,255,255,.08);background:#121824;color:#d9dee8;border-radius:8px}.ds-user{display:flex;align-items:center;gap:8px;padding-left:10px;border-left:1px solid rgba(255,255,255,.08)}.ds-avatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(198,138,53,.4);color:#e6b96b;font-weight:800}.ds-user b{display:block;font-size:10px}.ds-user span{display:block;font-size:8px;color:#858e9f}.ds-user>span{color:#8c95a5;font-size:14px}
        .ds-layout{display:grid;grid-template-columns:230px minmax(0,1fr) 285px;min-height:calc(100vh - 122px)}
        .ds-sidebar{padding:12px 10px;border-right:1px solid rgba(255,255,255,.07);background:#0d121b;overflow:auto}.ds-nav{width:100%;display:flex;align-items:center;gap:11px;padding:9px 10px;margin:2px 0;border:1px solid transparent;border-radius:8px;background:transparent;color:#dce1e8;text-align:left;cursor:pointer;font-size:11px}.ds-nav:hover{background:rgba(255,255,255,.04)}.ds-nav.active{background:#151c28}.ds-nav.selected{background:linear-gradient(90deg,rgba(198,138,53,.14),rgba(198,138,53,.03));border-color:rgba(198,138,53,.18);box-shadow:inset -2px 0 #c68a35}.ds-nav span{min-width:0;flex:1}.ds-nav b{display:block;font-size:10px}.ds-nav small{display:block;margin-top:3px;color:#717b8c;font-size:8px}.ds-nav i{font-style:normal;color:#737c8e}.ds-nav-compact{padding:7px 10px}.ds-nav-icon{width:21px;flex:none;font-size:16px;text-align:center}.ds-nav-title{padding:12px 9px 6px;color:#697486;font-size:8px;font-weight:900;letter-spacing:.14em}.ds-line{height:1px;background:rgba(255,255,255,.06);margin:9px 4px}.ds-enterprise{margin:14px 4px;padding:13px;border:1px solid rgba(112,75,255,.35);border-radius:10px;background:linear-gradient(135deg,rgba(73,32,130,.3),rgba(31,48,91,.18));}.ds-enterprise b{display:block;font-size:9px}.ds-enterprise span{display:block;color:#8e96a7;font-size:8px;margin:5px 0 9px}.ds-enterprise button{width:100%;padding:8px;border:0;border-radius:7px;background:#e8ad42;color:#15110a;font-size:9px;font-weight:900}.ds-copy{padding:15px 7px;color:#596273;font-size:8px}
        .ds-main{padding:25px 24px 40px;min-width:0}.ds-heading{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:17px}.ds-heading h1{margin:0;font-size:21px;letter-spacing:-.02em}.ds-heading p{margin:6px 0 0;color:#8d96a6;font-size:10px}.ds-custom{padding:9px 12px;border:1px solid rgba(255,255,255,.1);background:#121824;color:#dce1e8;border-radius:8px;font-size:9px;cursor:pointer}
        .ds-format-grid{display:grid;grid-template-columns:repeat(6,minmax(110px,1fr));gap:12px}.ds-format{min-height:148px;padding:14px 10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;border:1px solid rgba(255,255,255,.08);border-radius:11px;color:#fff;cursor:pointer;box-shadow:0 10px 28px rgba(0,0,0,.16);transition:transform .15s,border-color .15s}.ds-format:hover{transform:translateY(-3px);border-color:rgba(255,255,255,.22)}.ds-format.gold{background:linear-gradient(145deg,#d49a2f,#a86d19)}.ds-format.purple{background:linear-gradient(145deg,#7040e7,#4830a7)}.ds-format.pink{background:linear-gradient(145deg,#c92e67,#873e9f)}.ds-format.blue{background:linear-gradient(145deg,#3973e8,#2d54b2)}.ds-format.orange{background:linear-gradient(145deg,#e35a49,#9a3c83)}.ds-format.green{background:linear-gradient(145deg,#2fa98b,#27805f)}.ds-format-icon{width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,.9);color:#313746;display:grid;place-items:center;font-size:22px;font-weight:900}.ds-format b{font-size:11px}.ds-format span{font-size:8px;opacity:.86}.ds-format small{font-size:8px;opacity:.9}
        .ds-section{margin-top:25px;padding-top:17px;border-top:1px solid rgba(255,255,255,.07)}.ds-section-head{display:flex;align-items:center;justify-content:space-between}.ds-section-head h2{margin:0;font-size:14px}.ds-section-head p{margin:4px 0 0;color:#7f8898;font-size:9px}.ds-section-head button{border:0;background:transparent;color:#9ea7b7;font-size:9px;cursor:pointer}.ds-filter,.ds-preset-tabs{display:flex;gap:6px;margin:12px 0}.ds-filter button,.ds-preset-tabs button{padding:7px 11px;border:1px solid rgba(255,255,255,.08);border-radius:7px;background:#111722;color:#aab2c0;font-size:8px;cursor:pointer}.ds-filter button.on,.ds-preset-tabs button.on{border-color:#c68a35;color:#e6b96b;background:rgba(198,138,53,.09)}
        .ds-template-row{display:grid;grid-template-columns:repeat(5,minmax(110px,1fr));gap:12px}.ds-template-card{border:0;background:transparent;color:#e9edf3;text-align:left;cursor:pointer}.ds-template-preview{height:145px;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:13px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,.18)}.ds-template-preview.gold{background:linear-gradient(135deg,#101010 0 60%,#e0b050 61%)}.ds-template-preview.purple{background:linear-gradient(145deg,#3c165f,#171225)}.ds-template-preview.pink{background:linear-gradient(145deg,#5e193e,#17111d)}.ds-template-preview.blue{background:linear-gradient(145deg,#172a55,#0d1422)}.ds-template-preview.orange{background:linear-gradient(145deg,#201b14,#050505)}.ds-template-preview span{font-size:20px;color:#f1bd55}.ds-template-preview strong{font-size:14px;letter-spacing:.08em;color:#e9bb59}.ds-template-preview em{font-style:normal;font-size:20px;font-weight:900;max-width:90px}.ds-template-card>b{display:block;margin-top:7px;font-size:9px}.ds-template-card>small{display:block;margin-top:3px;color:#697386;font-size:8px}
        .ds-preset-grid{display:grid;grid-template-columns:repeat(8,minmax(82px,1fr));gap:8px}.ds-preset{padding:11px 6px;min-height:92px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:#111722;color:#e4e8ef;cursor:pointer;text-align:center}.ds-preset:hover{border-color:rgba(198,138,53,.35)}.ds-preset-icon{height:35px;display:grid;place-items:center;font-size:22px;color:#b7c0cf}.ds-preset b{display:block;font-size:8px}.ds-preset small{display:block;margin-top:4px;color:#687286;font-size:7px}.ds-preset.custom{border-style:dashed}.ds-preset.custom .ds-preset-icon{color:#c68a35}
        .ds-right{padding:10px 10px 20px 0;background:#0d121b}.ds-right-card{padding:14px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:#111722;margin-bottom:12px}.ds-right-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px}.ds-right-head h3{margin:0;font-size:11px}.ds-right-head button{border:0;background:transparent;color:#7e8797;font-size:8px}.ds-recent{width:100%;display:grid;grid-template-columns:48px 1fr;gap:9px;padding:8px 0;border:0;border-bottom:1px solid rgba(255,255,255,.05);background:transparent;color:#dfe4eb;text-align:left;cursor:pointer}.ds-recent:last-child{border-bottom:0}.ds-recent-thumb{width:48px;height:38px;border-radius:5px}.ds-recent-thumb.gold{background:linear-gradient(135deg,#171717,#c68a35)}.ds-recent-thumb.purple{background:linear-gradient(135deg,#471e7a,#a451d2)}.ds-recent-thumb.pink{background:linear-gradient(135deg,#71183f,#d93c7a)}.ds-recent-thumb.orange{background:linear-gradient(135deg,#54251b,#d86e37)}.ds-recent-thumb.blue{background:linear-gradient(135deg,#1e3f86,#4d8af2)}.ds-recent b{display:block;font-size:8px}.ds-recent small{display:block;margin-top:3px;color:#687285;font-size:7px}.ds-recent em{display:inline-block;margin-top:4px;padding:3px 5px;border-radius:4px;font-style:normal;font-size:6px;background:#1b2230;color:#aab3c1}.ds-recent em.gold{color:#e6b96b}.ds-recent em.purple{color:#c9a7ff}.ds-recent em.pink{color:#ff91bc}.ds-recent em.orange{color:#ffb394}.ds-recent em.blue{color:#9fc0ff}
        .ds-quick{width:100%;display:grid;grid-template-columns:30px 1fr 10px;align-items:center;gap:8px;padding:9px 0;border:0;background:transparent;color:#dce1e8;text-align:left;cursor:pointer}.ds-quick>span{width:30px;height:30px;display:grid;place-items:center;border-radius:7px;background:#182033;color:#d9a84e}.ds-quick b{display:block;font-size:8px}.ds-quick small{display:block;margin-top:3px;color:#687285;font-size:7px}.ds-quick i{font-style:normal;color:#6e7788}
        .ds-footer{height:50px;display:grid;grid-template-columns:repeat(5,1fr);align-items:center;padding:0 22px;border-top:1px solid rgba(255,255,255,.07);background:#0e131d}.ds-footer>div{display:grid;grid-template-columns:28px 1fr;column-gap:7px;align-items:center}.ds-footer span{grid-row:1/3;width:28px;height:28px;border-radius:7px;display:grid;place-items:center;background:rgba(198,138,53,.12);color:#d9a84e}.ds-footer b{font-size:8px}.ds-footer small{font-size:7px;color:#6e7788}
        @media(max-width:1150px){.ds-layout{grid-template-columns:210px minmax(0,1fr)}.ds-right{display:none}.ds-format-grid{grid-template-columns:repeat(3,1fr)}.ds-template-row{grid-template-columns:repeat(3,1fr)}.ds-preset-grid{grid-template-columns:repeat(4,1fr)}}
        @media(max-width:760px){.ds-top{grid-template-columns:1fr;height:auto;padding:12px}.ds-search{display:none}.ds-top-right{justify-content:flex-end}.ds-layout{grid-template-columns:1fr}.ds-sidebar{display:none}.ds-main{padding:18px 12px}.ds-format-grid{grid-template-columns:repeat(2,1fr)}.ds-template-row{grid-template-columns:repeat(2,1fr)}.ds-preset-grid{grid-template-columns:repeat(2,1fr)}.ds-footer{display:none}}
      `}</style>
    </div>
  )
}

export default function BusinessCardStudio() {
  const canvasRef = useRef(null)
  const workspaceRef = useRef(null)

  const [side, setSide] = useState("front")
  const [frontElements, setFrontElements] = useState([])
  const [backElements, setBackElements] = useState([])
  const [selected, setSelected] = useState([])
  const [bg, setBg] = useState(templates[0].bg)
  const [accent, setAccent] = useState(templates[0].accent)
  const [zoom, setZoom] = useState(0.72)
  const [showGrid, setShowGrid] = useState(true)
  const [showGuides, setShowGuides] = useState(true)
  const [history, setHistory] = useState([])
  const [future, setFuture] = useState([])
  const [drag, setDrag] = useState(null)
  const [resize, setResize] = useState(null)
  const [rotate, setRotate] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [studioHome, setStudioHome] = useState(false)

  const [business, setBusiness] = useState({
    company: "",
    name: "",
    designation: "",
    phone: "",
    email: "",
    website: "",
    address: "",
    logo: "",
  })

  const elements = side === "front" ? frontElements : backElements
  const setElements = side === "front" ? setFrontElements : setBackElements

  const active = useMemo(
    () => elements.find((el) => selected.includes(el.id)) || null,
    [elements, selected]
  )

  const updateBusiness = (key, value) =>
    setBusiness((prev) => ({ ...prev, [key]: value }))

  const saveDesign = useCallback(() => {
    try {
      setSaving(true)
      localStorage.setItem("anaira-business-card-design", JSON.stringify({
        frontElements, backElements, bg, accent, business
      }))
      setSavedAt(new Date())
    } finally {
      setTimeout(() => setSaving(false), 400)
    }
  }, [frontElements, backElements, bg, accent, business])

  useEffect(() => {
    try {
      const raw = localStorage.getItem("anaira-business-card-design")
      if (!raw) return
      const d = JSON.parse(raw)
      if (Array.isArray(d.frontElements)) setFrontElements(d.frontElements)
      if (Array.isArray(d.backElements)) setBackElements(d.backElements)
      if (d.bg) setBg(d.bg)
      if (d.accent) setAccent(d.accent)
      if (d.business) setBusiness((prev) => ({ ...prev, ...d.business }))
      setSavedAt(new Date())
    } catch {}
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("anaira-business-card-design", JSON.stringify({
          frontElements, backElements, bg, accent, business
        }))
        setSavedAt(new Date())
      } catch {}
    }, 1000)
    return () => clearTimeout(timer)
  }, [frontElements, backElements, bg, accent, business])

  const pushHistory = useCallback(() => {
    setHistory((prev) => [
      ...prev.slice(-49),
      {
        side,
        front: clone(frontElements),
        back: clone(backElements),
        bg,
        accent,
      },
    ])
    setFuture([])
  }, [side, frontElements, backElements, bg, accent])

  const restoreSnapshot = (snapshot) => {
    setFrontElements(clone(snapshot.front))
    setBackElements(clone(snapshot.back))
    setBg(snapshot.bg)
    setAccent(snapshot.accent)
  }

  const undo = () => {
    if (!history.length) return
    const current = {
      side,
      front: clone(frontElements),
      back: clone(backElements),
      bg,
      accent,
    }
    const previous = history[history.length - 1]
    setFuture((prev) => [current, ...prev])
    restoreSnapshot(previous)
    setHistory((prev) => prev.slice(0, -1))
    setSelected([])
  }

  const redo = () => {
    if (!future.length) return
    const current = {
      side,
      front: clone(frontElements),
      back: clone(backElements),
      bg,
      accent,
    }
    const next = future[0]
    setHistory((prev) => [...prev, current])
    restoreSnapshot(next)
    setFuture((prev) => prev.slice(1))
    setSelected([])
  }

  const select = (event, id) => {
    event.stopPropagation()
    if (event.shiftKey) {
      setSelected((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      )
    } else {
      setSelected([id])
    }
  }

  const startDrag = (event, id) => {
    event.preventDefault?.()
    event.stopPropagation()
    event.currentTarget?.setPointerCapture?.(event.pointerId)
    const rect = canvasRef.current?.getBoundingClientRect()
    const el = elements.find((x) => x.id === id)
    if (!rect || !el || el.locked) return

    select(event, id)
    const groupId = el.groupId
    const ids = groupId ? elements.filter(x => x.groupId === groupId).map(x => x.id) : [id]
    setDrag({
      id,
      ids,
      offsetX: (event.clientX - rect.left) / zoom - el.x,
      offsetY: (event.clientY - rect.top) / zoom - el.y,
      startX: el.x,
      startY: el.y,
    })
  }

  const startResize = (event, id) => {
    event.preventDefault?.()
    event.stopPropagation()
    event.currentTarget?.setPointerCapture?.(event.pointerId)
    const el = elements.find((x) => x.id === id)
    if (!el || el.locked) return
    setResize({
      id,
      startX: event.clientX,
      startY: event.clientY,
      w: el.w,
      h: el.h,
    })
  }

  const startRotate = (event, id) => {
    event.preventDefault?.()
    event.stopPropagation()
    event.currentTarget?.setPointerCapture?.(event.pointerId)
    const rect = canvasRef.current?.getBoundingClientRect()
    const el = elements.find((x) => x.id === id)
    if (!rect || !el || el.locked) return

    setRotate({
      id,
      cx: rect.left + (el.x + el.w / 2) * zoom,
      cy: rect.top + (el.y + el.h / 2) * zoom,
    })
  }

  const onMove = (event) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    if (drag) {
      const rawX = Math.max(0, Math.min(CARD.width - 20, (event.clientX - rect.left) / zoom - drag.offsetX))
      const rawY = Math.max(0, Math.min(CARD.height - 20, (event.clientY - rect.top) / zoom - drag.offsetY))
      const x = snapToGrid ? Math.round(rawX / 5) * 5 : Math.round(rawX)
      const y = snapToGrid ? Math.round(rawY / 5) * 5 : Math.round(rawY)

      setElements((prev) =>
        prev.map((el) =>
          selected.includes(el.id) && !el.locked ? { ...el, x, y } : el
        )
      )
    }

    if (resize) {
      const dx = (event.clientX - resize.startX) / zoom
      const dy = (event.clientY - resize.startY) / zoom
      setElements((prev) =>
        prev.map((el) =>
          el.id === resize.id
            ? {
                ...el,
                w: Math.max(30, resize.w + dx),
                h: Math.max(25, resize.h + dy),
              }
            : el
        )
      )
    }

    if (rotate) {
      const angle =
        (Math.atan2(
          event.clientY - rotate.cy,
          event.clientX - rotate.cx
        ) *
          180) /
        Math.PI

      setElements((prev) =>
        prev.map((el) =>
          el.id === rotate.id ? { ...el, rotate: Math.round(angle) } : el
        )
      )
    }
  }

  const stopPointer = () => {
    if (drag || resize || rotate) pushHistory()
    setDrag(null)
    setResize(null)
    setRotate(null)
  }

  const addText = (preset = {}) => {
    pushHistory()
    const el = createElement("text", {
      text: preset.text || "Your Text",
      x: 120,
      y: 100,
      fontSize: preset.fontSize || 34,
      color: preset.color || "#ffffff",
      fontWeight: preset.fontWeight || 600,
      w: preset.w || 420,
      h: preset.h || 58,
      layerName: preset.layerName || "Text",
    })
    setElements((prev) => [...prev, el])
    setSelected([el.id])
  }

  const addShape = (shapeType) => {
    pushHistory()
    const el = createElement("shape", {
      shapeType,
      x: 140,
      y: 180,
      w: shapeType === "line" ? 360 : 160,
      h: shapeType === "line" ? 6 : 160,
      fill: accent,
      layerName: shapeType[0].toUpperCase() + shapeType.slice(1),
    })
    setElements((prev) => [...prev, el])
    setSelected([el.id])
  }

  const addFrame = (frameShape = "rect") => {
    pushHistory()
    const el = createElement("frame", {
      x: 120, y: 100, w: frameShape === "circle" ? 190 : 260, h: frameShape === "circle" ? 190 : 180,
      layerName: `${frameShape[0].toUpperCase()}${frameShape.slice(1)} Photo Frame`,
      frameShape,
      stroke: "#ffffff",
      strokeWidth: 2,
      fill: "#202735",
      radius: frameShape === "rounded" ? 22 : 0,
      objectFit: "cover",
    })
    setElements(prev => [...prev, el])
    setSelected([el.id])
  }

  const addIcon = (glyph, name) => {
    addText({
      text: glyph,
      layerName: name,
      fontSize: 34,
      fontFamily: "Arial",
      fontWeight: 700,
      textAlign: "center",
      w: 70,
      h: 70,
      color: accent,
    })
  }

  const addBusinessField = (key, label, preset = {}) => {
    const value = business[key] || label
    pushHistory()
    const el = createElement("text", {
      text: value,
      dynamicKey: key,
      x: preset.x ?? 120,
      y: preset.y ?? 100,
      fontSize: preset.fontSize ?? 24,
      fontWeight: preset.fontWeight ?? 600,
      color: preset.color ?? "#ffffff",
      w: preset.w ?? 360,
      h: preset.h ?? 48,
      layerName: label,
    })
    setElements((prev) => [...prev, el])
    setSelected([el.id])
  }

  const addLogoElement = () => {
    if (!business.logo) {
      alert("Upload a logo first from Business details.")
      return
    }
    pushHistory()
    const el = createElement("image", {
      src: business.logo,
      x: 90,
      y: 70,
      w: 150,
      h: 120,
      layerName: "Brand Logo",
    })
    setElements((prev) => [...prev, el])
    setSelected([el.id])
  }

  const distributeSelected = (axis) => {
    const picked = elements.filter((el) => selected.includes(el.id) && !el.locked)
    if (picked.length < 3) return
    pushHistory()
    const sorted = [...picked].sort((a,b) => axis === "x" ? a.x-b.x : a.y-b.y)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    if (axis === "x") {
      const start = first.x
      const end = last.x
      const step = (end - start) / (sorted.length - 1)
      setElements(prev => prev.map(el => {
        const i = sorted.findIndex(x => x.id === el.id)
        return i >= 0 ? {...el, x: Math.round(start + step * i)} : el
      }))
    } else {
      const start = first.y
      const end = last.y
      const step = (end - start) / (sorted.length - 1)
      setElements(prev => prev.map(el => {
        const i = sorted.findIndex(x => x.id === el.id)
        return i >= 0 ? {...el, y: Math.round(start + step * i)} : el
      }))
    }
  }

  const alignSelected = (mode) => {
    if (!selected.length) return
    pushHistory()
    setElements((prev) =>
      prev.map((el) => {
        if (!selected.includes(el.id) || el.locked) return el
        if (mode === "left") return { ...el, x: 30 }
        if (mode === "center") return { ...el, x: (CARD.width - el.w) / 2 }
        if (mode === "right") return { ...el, x: CARD.width - el.w - 30 }
        if (mode === "top") return { ...el, y: 30 }
        if (mode === "middle") return { ...el, y: (CARD.height - el.h) / 2 }
        if (mode === "bottom") return { ...el, y: CARD.height - el.h - 30 }
        return el
      })
    )
  }

  const addImage = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const selectedFrame = elements.find(el => selected.includes(el.id) && el.type === "frame")
      if (selectedFrame) {
        pushHistory()
        setElements(prev => prev.map(el => el.id === selectedFrame.id
          ? { ...el, src: reader.result, layerName: el.layerName || "Photo Frame" }
          : el))
        return
      }
      pushHistory()
      const el = createElement("image", {
        src: reader.result,
        x: 120, y: 120, w: 220, h: 160,
        layerName: "Uploaded Image",
        objectFit: "contain",
      })
      setElements(prev => [...prev, el])
      setSelected([el.id])
    }
    reader.readAsDataURL(file)
  }

  const uploadLogo = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () =>
      setBusiness((prev) => ({ ...prev, logo: reader.result }))
    reader.readAsDataURL(file)
  }

  const update = (patch) => {
    setElements((prev) =>
      prev.map((el) =>
        selected.includes(el.id) ? { ...el, ...patch } : el
      )
    )
  }

  const updateText = (event, id) => {
    const text = event.currentTarget.innerText
    setElements((prev) =>
      prev.map((el) => (el.id === id ? { ...el, text } : el))
    )
  }

  const deleteSelected = () => {
    if (!selected.length) return
    pushHistory()
    setElements((prev) => prev.filter((el) => !selected.includes(el.id)))
    setSelected([])
  }

  const duplicateSelected = () => {
    if (!active) return
    pushHistory()
    const copy = {
      ...active,
      id: uid(),
      x: active.x + 24,
      y: active.y + 24,
      layerName: `${active.layerName} Copy`,
    }
    setElements((prev) => [...prev, copy])
    setSelected([copy.id])
  }

  const bringFront = () => {
    if (!selected.length) return
    pushHistory()
    setElements((prev) =>
      prev.map((el) =>
        selected.includes(el.id) ? { ...el, z: Date.now() } : el
      )
    )
  }

  const sendBack = () => {
    if (!selected.length) return
    pushHistory()
    setElements((prev) =>
      prev.map((el) =>
        selected.includes(el.id) ? { ...el, z: 0 } : el
      )
    )
  }

  const groupSelected = () => {
    if (selected.length < 2) return
    pushHistory()
    const groupId = uid()
    setElements(prev => prev.map(el => selected.includes(el.id) ? { ...el, groupId } : el))
  }

  const ungroupSelected = () => {
    const groups = new Set(elements.filter(el => selected.includes(el.id) && el.groupId).map(el => el.groupId))
    if (!groups.size) return
    pushHistory()
    setElements(prev => prev.map(el => groups.has(el.groupId) ? { ...el, groupId: "" } : el))
  }

  const applyTemplate = (template) => {
    pushHistory()
    setBg(template.bg)
    setAccent(template.accent)
  }

  const exportPNG = async () => {
    if (!canvasRef.current) return
    setExporting(true)
    try {
      const canvas = await html2canvas(canvasRef.current, {
        scale: 5,
        useCORS: true,
        backgroundColor: null,
      })
      const link = document.createElement("a")
      link.download = `business-card-${side}-hd.png`
      link.href = canvas.toDataURL("image/png", 1)
      link.click()
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName?.toLowerCase()
      const editing = tag === "input" || tag === "textarea" || tag === "select" || event.target?.isContentEditable

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }

      if (!editing && (event.key === "Delete" || event.key === "Backspace")) {
        deleteSelected()
      }

      if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault()
        duplicateSelected()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  const cardScaleStyle = {
    width: CARD.width,
    height: CARD.height,
    transform: `scale(${zoom})`,
    transformOrigin: "center center",
    touchAction: "none",
  }

  if (studioHome) {
    return (
      <DesignStudioHome
        onOpenBusinessCard={() => setStudioHome(false)}
        onOpenAI={(path) => { window.location.href = path }}
      />
    )
  }

  return (
    <div className="bc-app">
      <header className="bc-topbar">
        <div className="bc-brand">
          <button className="bc-back-studio" onClick={() => setStudioHome(true)} title="Back to Design Studio">‹</button>
          <div className="bc-brand-mark">A</div>
          <div>
            <strong>Business Card Studio</strong>
            <span>Professional Design Editor</span>
          </div>
        </div>

        <div className="bc-top-status"><span className="bc-live-dot" />{saving ? "Saving…" : savedAt ? "Saved locally" : "Ready"}</div>
        <div className="bc-top-actions">
          <button onClick={undo} disabled={!history.length} title="Undo">↶</button>
          <button onClick={redo} disabled={!future.length} title="Redo">↷</button>
          <div className="bc-divider" />
          <button onClick={() => setSnapToGrid((v) => !v)} className={snapToGrid ? "bc-toggle-on" : ""}>{snapToGrid ? "✦ Snap" : "Snap"}</button>
          <button onClick={() => setShowGrid((v) => !v)}>{showGrid ? "⌗ Grid" : "□ Grid"}</button>
          <button onClick={saveDesign}>💾 Save</button>
          <button className="bc-primary" onClick={exportPNG}>{exporting ? "Exporting…" : "Export HD PNG"}</button>
        </div>
      </header>

      <div className="bc-body">
        <aside className="bc-left">
          <section className="bc-section">
            <div className="bc-section-title">Design</div>
            <div className="bc-tabs">
              <button className={side === "front" ? "active" : ""} onClick={() => { setSide("front"); setSelected([]) }}>
                Front
              </button>
              <button className={side === "back" ? "active" : ""} onClick={() => { setSide("back"); setSelected([]) }}>
                Back
              </button>
            </div>
          </section>

          <section className="bc-section">
            <div className="bc-section-title">Templates</div>
            <div className="bc-template-grid">
              {templates.map((template) => (
                <button
                  key={template.name}
                  className="bc-template"
                  onClick={() => applyTemplate(template)}
                  title={template.name}
                >
                  <span style={{ background: template.bg }} />
                  <small>{template.name}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="bc-section">
            <div className="bc-section-title">Add elements</div>
            <div className="bc-element-group">
              <div className="bc-element-label">TEXT</div>
              <div className="bc-tool-grid">
                <button onClick={() => addText({ fontSize: 34, layerName: "Heading" })}><b>T</b><span>Heading</span></button>
                <button onClick={() => addText({ fontSize: 22, fontWeight: 500, layerName: "Body Text" })}><b>T</b><span>Body text</span></button>
                <button onClick={() => addText({ fontSize: 16, fontWeight: 500, layerName: "Small Text" })}><b>T</b><span>Small text</span></button>
                <button onClick={() => addText({ fontSize: 48, fontWeight: 800, layerName: "Display" })}><b>T</b><span>Display</span></button>
              </div>
            </div>
            <div className="bc-element-group">
              <div className="bc-element-label">SHAPES</div>
              <div className="bc-tool-grid">
                <button onClick={() => addShape("rect")}><b>▭</b><span>Rectangle</span></button>
                <button onClick={() => addShape("circle")}><b>●</b><span>Circle</span></button>
                <button onClick={() => addShape("line")}><b>―</b><span>Line</span></button>
                <button onClick={() => addShape("triangle")}><b>△</b><span>Triangle</span></button>
              </div>
            </div>
            <div className="bc-element-group">
              <div className="bc-element-label">BRAND FIELDS</div>
              <div className="bc-tool-grid">
                <button onClick={() => addBusinessField("company","Company",{fontSize:26,fontWeight:800})}><b>◉</b><span>Company</span></button>
                <button onClick={() => addBusinessField("name","Name",{fontSize:24,fontWeight:800})}><b>◎</b><span>Name</span></button>
                <button onClick={() => addBusinessField("designation","Designation",{fontSize:16,fontWeight:500})}><b>↳</b><span>Designation</span></button>
                <button onClick={() => addBusinessField("phone","Phone",{fontSize:15,fontWeight:500})}><b>☎</b><span>Phone</span></button>
                <button onClick={() => addBusinessField("email","Email",{fontSize:15,fontWeight:500})}><b>@</b><span>Email</span></button>
                <button onClick={() => addBusinessField("website","Website",{fontSize:15,fontWeight:500})}><b>⌁</b><span>Website</span></button>
                <button onClick={() => addBusinessField("address","Address",{fontSize:14,fontWeight:500,w:500,h:58})}><b>⌖</b><span>Address</span></button>
                <button onClick={addLogoElement}><b>◇</b><span>Brand logo</span></button>
              </div>
            </div>
            <div className="bc-element-group">
              <div className="bc-element-label">PHOTO FRAMES</div>
              <div className="bc-frame-grid">
                <button onClick={() => addFrame("rect")}><span className="frame-demo rect" />Rectangle</button>
                <button onClick={() => addFrame("rounded")}><span className="frame-demo rounded" />Rounded</button>
                <button onClick={() => addFrame("circle")}><span className="frame-demo circle" />Circle</button>
                <button onClick={() => addFrame("polaroid")}><span className="frame-demo polaroid" />Polaroid</button>
                <button onClick={() => addFrame("hex")}><span className="frame-demo hex" />Hexagon</button>
                <button onClick={() => addFrame("arch")}><span className="frame-demo arch" />Arch</button>
              </div>
              <div className="bc-frame-note">Select a frame, then upload a photo. The photo is automatically cropped to the frame.</div>
            </div>

            <div className="bc-element-group">
              <div className="bc-element-label">ICONS & CONTACT</div>
              <div className="bc-tool-grid">
                <button onClick={() => addIcon("☎","Phone Icon")}><b>☎</b><span>Phone</span></button>
                <button onClick={() => addIcon("@","Email Icon")}><b>@</b><span>Email</span></button>
                <button onClick={() => addIcon("⌖","Location Icon")}><b>⌖</b><span>Location</span></button>
                <button onClick={() => addIcon("⌁","Web Icon")}><b>⌁</b><span>Website</span></button>
                <button onClick={() => addIcon("in","LinkedIn Icon")}><b>in</b><span>LinkedIn</span></button>
                <button onClick={() => addIcon("f","Facebook Icon")}><b>f</b><span>Facebook</span></button>
              </div>
            </div>

            <div className="bc-element-group">
              <div className="bc-element-label">MEDIA</div>
              <label className="bc-upload">
                <span>＋ Upload image</span>
                <input type="file" accept="image/*" onChange={(e) => addImage(e.target.files?.[0])} />
              </label>
            </div>
            <div className="bc-element-tip">
              <strong>How to add an element</strong>
              <span>Choose an item above → it appears on the card → drag it, resize it, rotate it, then edit its properties on the right.</span>
            </div>
          </section>

          <section className="bc-section">
            <div className="bc-section-title">Business details</div>
            <div className="bc-fields">
              {[
                ["company", "Company / Brand"],
                ["name", "Name"],
                ["designation", "Designation"],
                ["phone", "Phone"],
                ["email", "Email"],
                ["website", "Website"],
                ["address", "Address"],
              ].map(([key, label]) => (
                <input
                  key={key}
                  placeholder={label}
                  value={business[key]}
                  onChange={(e) => updateBusiness(key, e.target.value)}
                />
              ))}
              <label className="bc-upload compact">
                <span>Upload Logo</span>
                <input type="file" accept="image/*" onChange={(e) => uploadLogo(e.target.files?.[0])} />
              </label>
            </div>
          </section>
        </aside>

        <main className="bc-workspace" ref={workspaceRef}>
          <div className="bc-workspace-head">
            <div>
              <span className="bc-pill">{side.toUpperCase()}</span>
              <span className="bc-muted">Business Card · 1050 × 600</span>
            </div>
            <div className="bc-zoom">
              <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}>−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(1.2, +(z + 0.1).toFixed(2)))}>+</button>
            </div>
          </div>

          {showGuides && <div className="bc-ruler-top" aria-hidden="true">{[0,1,2,3,4,5,6,7,8,9,10].map(n => <span key={n}>{n*10}%</span>)}</div>}
          {showGuides && <div className="bc-ruler-left" aria-hidden="true">{[0,1,2,3,4,5,6,7,8,9,10].map(n => <span key={n}>{n*10}%</span>)}</div>}
          <div
            className="bc-stage"
            onPointerMove={onMove}
            onPointerUp={stopPointer}
            onPointerCancel={stopPointer}
            onPointerDown={(e) => { if (e.target === e.currentTarget) setSelected([]) }}
          >
            <div className="bc-card-wrap" style={{ width: CARD.width * zoom, height: CARD.height * zoom }}>
              <div
                ref={canvasRef}
                className="bc-card"
                style={{
                  ...cardScaleStyle,
                  background: bg,
                  backgroundImage: showGrid
                    ? `${bg}, linear-gradient(rgba(255,255,255,.055) 1px,transparent 1px), linear-gradient(90deg,rgba(255,255,255,.055) 1px,transparent 1px)`
                    : bg,
                  backgroundSize: showGrid ? "auto, 25px 25px, 25px 25px" : "auto",
                }}
              >
                {business.logo && elements.length === 0 && (
                  <img
                    src={business.logo}
                    alt="Logo"
                    className="bc-logo"
                    style={{ borderColor: accent }}
                  />
                )}

                {elements.length === 0 && <div className="bc-business-copy">
                  {business.company && <div className="bc-company" style={{ color: accent }}>{business.company}</div>}
                  {business.name && <div className="bc-name">{business.name}</div>}
                  {business.designation && <div className="bc-designation">{business.designation}</div>}
                  {business.phone && <div className="bc-contact">{business.phone}</div>}
                  {business.email && <div className="bc-contact">{business.email}</div>}
                  {business.website && <div className="bc-contact">{business.website}</div>}
                  {business.address && <div className="bc-address">{business.address}</div>}
                </div>}

                {[...elements].sort((a, b) => a.z - b.z).map((el) => {
                  const isSelected = selected.includes(el.id)

                  return (
                    <div
                      key={el.id}
                      className={`bc-element ${isSelected ? "selected" : ""}`}
                      onPointerDown={(e) => startDrag(e, el.id)}
                      style={{
                        left: el.x,
                        top: el.y,
                        width: el.w,
                        height: el.h,
                        opacity: el.opacity,
                        transform: `rotate(${el.rotate}deg)`,
                        zIndex: el.z,
                      }}
                    >
                      {el.type === "text" && (
                        <div
                          contentEditable={!el.locked}
                          suppressContentEditableWarning
                          onBlur={(e) => updateText(e, el.id)}
                          className="bc-edit-text"
                          style={{
                            color: el.color,
                            fontSize: el.fontSize,
                            fontFamily: el.fontFamily,
                            fontWeight: el.fontWeight,
                            textAlign: el.textAlign,
                            textShadow: el.shadow ? "0 5px 18px rgba(0,0,0,.45)" : "none",
                          }}
                        >
                          {el.dynamicKey ? (business[el.dynamicKey] || el.text) : el.text}
                        </div>
                      )}

                      {el.type === "shape" && el.shapeType === "rect" && (
                        <div
                          className="bc-shape"
                          style={{
                            width: "100%",
                            height: "100%",
                            background: el.fill,
                            border: `${el.strokeWidth}px solid ${el.stroke}`,
                            borderRadius: el.radius,
                            boxShadow: el.shadow ? "0 15px 35px rgba(0,0,0,.35)" : "none",
                          }}
                        />
                      )}

                      {el.type === "shape" && el.shapeType === "circle" && (
                        <div
                          className="bc-shape"
                          style={{
                            width: "100%",
                            height: "100%",
                            background: el.fill,
                            border: `${el.strokeWidth}px solid ${el.stroke}`,
                            borderRadius: "50%",
                            boxShadow: el.shadow ? "0 15px 35px rgba(0,0,0,.35)" : "none",
                          }}
                        />
                      )}

                      {el.type === "shape" && el.shapeType === "line" && (
                        <div
                          className="bc-shape"
                          style={{
                            width: "100%",
                            height: el.strokeWidth,
                            background: el.fill,
                            marginTop: Math.max(0, el.h / 2),
                          }}
                        />
                      )}

                      {el.type === "shape" && el.shapeType === "triangle" && (
                        <div
                          style={{
                            width: 0,
                            height: 0,
                            borderLeft: `${el.w / 2}px solid transparent`,
                            borderRight: `${el.w / 2}px solid transparent`,
                            borderBottom: `${el.h}px solid ${el.fill}`,
                          }}
                        />
                      )}

                      {el.type === "frame" && (
                        <div
                          className={`bc-photo-frame frame-${el.frameShape}`}
                          onDoubleClick={() => update({ objectFit: el.objectFit === "cover" ? "contain" : "cover" })}
                          style={{
                            width:"100%", height:"100%",
                            background: el.src ? "transparent" : "#202735",
                            border: `${el.strokeWidth || 2}px solid ${el.stroke || "#ffffff"}`,
                            borderRadius: el.frameShape === "circle" ? "50%" : (el.radius || 0),
                            boxShadow: el.shadow ? "0 15px 35px rgba(0,0,0,.35)" : "none",
                          }}
                        >
                          {el.src ? <img src={el.src} alt="" draggable={false}
                            style={{width:"100%",height:"100%",objectFit:el.objectFit || "cover",objectPosition:el.objectPosition || "50% 50%",borderRadius:el.frameShape==="circle"?"50%":(el.radius||0)}} />
                            : <span className="bc-frame-placeholder">DROP<br/>PHOTO</span>}
                        </div>
                      )}

                      {el.type === "image" && (
                        <img
                          src={el.src}
                          alt=""
                          draggable={false}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: el.objectFit || "contain",
                            objectPosition: el.objectPosition || "50% 50%",
                            borderRadius: el.radius,
                          }}
                        />
                      )}

                      {isSelected && !el.locked && (
                        <>
                          <div className="bc-selection-box" />
                          <div
                            className="bc-resize-handle"
                            onPointerDown={(e) => startResize(e, el.id)}
                          />
                          <div
                            className="bc-rotate-handle"
                            onPointerDown={(e) => startRotate(e, el.id)}
                          />
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </main>

        <aside className="bc-right">
          <section className="bc-section">
            <div className="bc-section-title">Quick actions</div>
            <div className="bc-action-grid">
              <button onClick={duplicateSelected}>Duplicate</button>
              <button onClick={deleteSelected}>Delete</button>
              <button onClick={bringFront}>Bring front</button>
              <button onClick={sendBack}>Send back</button>
              <button onClick={() => alignSelected("left")}>Align left</button>
              <button onClick={() => alignSelected("center")}>Center</button>
              <button onClick={() => alignSelected("right")}>Align right</button>
              <button onClick={groupSelected} disabled={selected.length < 2}>Group</button>
              <button onClick={ungroupSelected}>Ungroup</button>
              <button onClick={() => distributeSelected("x")} disabled={selected.length < 3}>Distribute X</button>
              <button onClick={() => distributeSelected("y")} disabled={selected.length < 3}>Distribute Y</button>
            </div>
          </section>

          {active ? (
            <section className="bc-section">
              <div className="bc-section-title">Properties</div>

              {active.type === "text" && (
                <>
                  <label>Text {active.dynamicKey && <span className="bc-live-field">LIVE FIELD</span>}</label>
                  <textarea
                    value={active.text || ""}
                    onChange={(e) => update({ text: e.target.value })}
                    rows={3}
                  />
                  {active.dynamicKey && (
                    <div className="bc-live-note">
                      This element is linked to <strong>{active.dynamicKey}</strong>. Changing Business details updates it automatically.
                    </div>
                  )}

                  <div className="bc-two">
                    <div>
                      <label>Font</label>
                      <select value={active.fontFamily} onChange={(e) => update({ fontFamily: e.target.value })}>
                        {fonts.map((font) => <option key={font}>{font}</option>)}
                      </select>
                    </div>
                    <div>
                      <label>Weight</label>
                      <select value={active.fontWeight} onChange={(e) => update({ fontWeight: Number(e.target.value) })}>
                        <option value="400">Regular</option>
                        <option value="500">Medium</option>
                        <option value="600">SemiBold</option>
                        <option value="700">Bold</option>
                        <option value="800">Extra Bold</option>
                      </select>
                    </div>
                  </div>

                  <label>Font size · {active.fontSize}px</label>
                  <input type="range" min="10" max="120" value={active.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} />

                  <label>Alignment</label>
                  <div className="bc-align">
                    {["left", "center", "right"].map((value) => (
                      <button key={value} className={active.textAlign === value ? "active" : ""} onClick={() => update({ textAlign: value })}>
                        {value[0].toUpperCase()}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="bc-two">
                <div>
                  <label>Color</label>
                  <input type="color" value={active.color || "#ffffff"} onChange={(e) => update({ color: e.target.value })} />
                </div>
                <div>
                  <label>Fill</label>
                  <input type="color" value={active.fill || "#c68a35"} onChange={(e) => update({ fill: e.target.value })} />
                </div>
              </div>

              {(active.type === "image" || active.type === "frame") && (
                <>
                  <label>Image fit</label>
                  <div className="bc-align">
                    <button className={active.objectFit === "contain" ? "active" : ""} onClick={() => update({ objectFit: "contain" })}>Fit</button>
                    <button className={active.objectFit === "cover" ? "active" : ""} onClick={() => update({ objectFit: "cover" })}>Fill</button>
                  </div>
                  <label>Crop / Position X · {active.objectPosition || "50% 50%"}</label>
                  <input type="range" min="0" max="100" value={Number((active.objectPosition || "50% 50%").split(" ")[0].replace("%","")) || 50}
                    onChange={(e) => update({ objectPosition: `${e.target.value}% ${(active.objectPosition || "50% 50%").split(" ")[1] || "50%"}` })} />
                  <label>Crop / Position Y</label>
                  <input type="range" min="0" max="100" value={Number((active.objectPosition || "50% 50%").split(" ")[1].replace("%","")) || 50}
                    onChange={(e) => update({ objectPosition: `${(active.objectPosition || "50% 50%").split(" ")[0] || "50%"} ${e.target.value}%` })} />
                </>
              )}

              <label>Opacity · {Math.round((active.opacity || 1) * 100)}%</label>
              <input type="range" min="0" max="1" step="0.05" value={active.opacity || 1} onChange={(e) => update({ opacity: Number(e.target.value) })} />

              <label>Rotation · {Math.round(active.rotate || 0)}°</label>
              <input type="range" min="0" max="360" value={((active.rotate || 0) + 360) % 360} onChange={(e) => update({ rotate: Number(e.target.value) })} />

              <div className="bc-two">
                <div>
                  <label>Width</label>
                  <input type="number" value={Math.round(active.w)} onChange={(e) => update({ w: Math.max(20, Number(e.target.value) || 20) })} />
                </div>
                <div>
                  <label>Height</label>
                  <input type="number" value={Math.round(active.h)} onChange={(e) => update({ h: Math.max(20, Number(e.target.value) || 20) })} />
                </div>
              </div>

              <div className="bc-two">
                <div><label>X</label><input type="number" value={Math.round(active.x)} onChange={(e) => update({ x: Math.max(0, Number(e.target.value) || 0) })} /></div>
                <div><label>Y</label><input type="number" value={Math.round(active.y)} onChange={(e) => update({ y: Math.max(0, Number(e.target.value) || 0) })} /></div>
              </div>
              <div className="bc-two">
                <div><label>Radius</label><input type="number" value={Math.round(active.radius || 0)} onChange={(e) => update({ radius: Math.max(0, Number(e.target.value) || 0) })} /></div>
                <div><label>Stroke</label><input type="number" value={Math.round(active.strokeWidth || 0)} onChange={(e) => update({ strokeWidth: Math.max(0, Number(e.target.value) || 0) })} /></div>
              </div>
              <label className="bc-check"><input type="checkbox" checked={!!active.shadow} onChange={(e) => update({ shadow: e.target.checked })} /> Shadow</label>
              <label className="bc-check"><input type="checkbox" checked={!!active.locked} onChange={(e) => update({ locked: e.target.checked })} /> Lock element</label>

              <input
                value={active.layerName || ""}
                onChange={(e) => update({ layerName: e.target.value })}
                placeholder="Layer name"
              />
            </section>
          ) : (
            <section className="bc-empty">
              <div className="bc-empty-icon">✦</div>
              <strong>Select an element</strong>
              <span>Click an element on the card to edit its properties.</span>
            </section>
          )}

          <section className="bc-section">
            <div className="bc-section-title">Layers</div>
            <div className="bc-layers">
              {[...elements].sort((a, b) => b.z - a.z).map((el) => (
                <button
                  key={el.id}
                  className={selected.includes(el.id) ? "active" : ""}
                  onClick={() => setSelected([el.id])}
                >
                  <span>{el.type === "text" ? "T" : el.type === "image" ? "▧" : "◆"}</span>
                  <em>{el.layerName || el.type}</em>
                  {el.locked && <small>🔒</small>}
                </button>
              ))}
              {!elements.length && <span className="bc-muted">No custom layers yet.</span>}
            </div>
          </section>
        </aside>
      </div>

      <style jsx>{`

        *{box-sizing:border-box}
        .bc-app{height:100vh;min-height:620px;background:#0a0d12;color:#f5f7fa;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
        .bc-topbar{height:64px;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:0 16px;background:#10141c;border-bottom:1px solid rgba(255,255,255,.075);position:relative;z-index:20}
        .bc-brand{display:flex;align-items:center;gap:10px;min-width:245px}.bc-brand-mark{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(145deg,#d6a24d,#8c5a1c);color:#120d06;font-weight:950;box-shadow:0 6px 18px rgba(0,0,0,.25)}.bc-brand strong{display:block;font-size:12px;letter-spacing:.02em}.bc-brand span{display:block;color:#778194;font-size:8px;margin-top:3px}
        .bc-back-studio{width:30px;height:30px;border:1px solid rgba(255,255,255,.09);border-radius:8px;background:#151a23;color:#d8dde6;font-size:20px;cursor:pointer}.bc-back-studio:hover{background:#1b222e}
        .bc-top-status{font-size:9px;color:#7f8999;display:flex;align-items:center;gap:7px;white-space:nowrap}.bc-live-dot{width:6px;height:6px;border-radius:50%;background:#4bd18a;box-shadow:0 0 0 4px rgba(75,209,138,.08)}
        .bc-top-actions{display:flex;align-items:center;gap:6px}.bc-top-actions button{height:32px;padding:0 10px;border:1px solid rgba(255,255,255,.08);border-radius:7px;background:#151a23;color:#cbd2dd;font-size:9px;font-weight:700;cursor:pointer}.bc-top-actions button:hover:not(:disabled){background:#1c2330;border-color:rgba(255,255,255,.14)}.bc-top-actions button:disabled{opacity:.35;cursor:not-allowed}.bc-top-actions .bc-primary{background:#c68a35;color:#171008;border-color:#c68a35;font-weight:900}.bc-divider{width:1px;height:22px;background:rgba(255,255,255,.08);margin:0 3px}
        .bc-body{height:calc(100vh - 64px);display:grid;grid-template-columns:272px minmax(0,1fr) 292px;min-width:0}
        .bc-left,.bc-right{background:#10141c;overflow:auto;scrollbar-width:thin;scrollbar-color:#29313e transparent}.bc-left{border-right:1px solid rgba(255,255,255,.07)}.bc-right{border-left:1px solid rgba(255,255,255,.07);padding:14px}
        .bc-left::-webkit-scrollbar,.bc-right::-webkit-scrollbar{width:6px}.bc-left::-webkit-scrollbar-thumb,.bc-right::-webkit-scrollbar-thumb{background:#29313e;border-radius:10px}
        .bc-section{padding:14px 14px 15px;border-bottom:1px solid rgba(255,255,255,.055)}.bc-section-title{font-size:9px;text-transform:uppercase;letter-spacing:.13em;color:#9ba4b2;font-weight:900;margin-bottom:10px}.bc-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px}.bc-tabs button{height:32px;border:1px solid rgba(255,255,255,.07);background:#151a23;color:#8e98a8;border-radius:7px;font-size:9px;font-weight:800;cursor:pointer}.bc-tabs button.active{background:rgba(198,138,53,.13);border-color:rgba(198,138,53,.45);color:#e7bd77}
        .bc-template-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.bc-template{border:1px solid rgba(255,255,255,.07);background:#141922;border-radius:8px;padding:5px;cursor:pointer;color:#929cad}.bc-template:hover{border-color:rgba(198,138,53,.45);transform:translateY(-1px)}.bc-template span{display:block;height:34px;border-radius:5px;margin-bottom:5px}.bc-template small{font-size:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
        .bc-element-group+.bc-element-group{margin-top:13px}.bc-element-label{font-size:7px;color:#687384;font-weight:900;letter-spacing:.14em;margin-bottom:7px}.bc-tool-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.bc-tool-grid button{min-height:38px;display:flex;align-items:center;gap:8px;padding:6px 8px;background:#141922;border:1px solid rgba(255,255,255,.06);border-radius:7px;color:#aeb6c3;cursor:pointer;text-align:left}.bc-tool-grid button:hover{border-color:rgba(198,138,53,.38);background:#181e28;color:#f0f3f7}.bc-tool-grid b{width:19px;height:19px;display:grid;place-items:center;border-radius:5px;background:#1c2330;color:#d5a85c;font-size:9px}.bc-tool-grid span{font-size:8px;font-weight:750}
        .bc-upload{display:flex;align-items:center;justify-content:center;min-height:36px;border:1px dashed rgba(255,255,255,.14);border-radius:7px;color:#aeb6c3;font-size:8px;cursor:pointer;background:#141922}.bc-upload:hover{border-color:rgba(198,138,53,.45);color:#e5b86a}.bc-upload input{display:none}.bc-element-tip{margin-top:12px;padding:9px;border-radius:8px;background:#0d1118;border:1px solid rgba(255,255,255,.055)}.bc-element-tip strong{display:block;color:#d4d9e1;font-size:8px;margin-bottom:4px}.bc-element-tip span{display:block;color:#707b8c;font-size:7px;line-height:1.45}
        .bc-fields{display:grid;gap:7px}.bc-fields input,.bc-fields textarea,.bc-fields select,.bc-right input,.bc-right textarea,.bc-right select{width:100%;background:#0d1118;color:#dbe0e7;border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:8px 9px;outline:none;font-size:9px}.bc-fields input:focus,.bc-right input:focus,.bc-right textarea:focus,.bc-right select:focus{border-color:rgba(198,138,53,.55);box-shadow:0 0 0 3px rgba(198,138,53,.07)}
        .bc-workspace{min-width:0;min-height:0;background:#090c11;display:flex;flex-direction:column}.bc-workspace-head{height:50px;flex:none;padding:0 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.055);background:#0d1118}.bc-workspace-head>div:first-child{display:flex;align-items:center;gap:8px}.bc-pill{padding:4px 7px;border-radius:5px;background:rgba(198,138,53,.12);border:1px solid rgba(198,138,53,.25);color:#e4b66a;font-size:7px;font-weight:900;letter-spacing:.1em}.bc-muted{color:#707b8d;font-size:8px}.bc-zoom{display:flex;align-items:center;gap:5px}.bc-zoom button{width:27px;height:27px;border:1px solid rgba(255,255,255,.08);border-radius:6px;background:#141922;color:#b8c0cd;cursor:pointer}.bc-zoom span{min-width:42px;text-align:center;color:#8d97a7;font-size:8px}
        .bc-stage{flex:1;min-height:0;position:relative;display:flex;align-items:center;justify-content:center;overflow:auto;padding:42px;background-color:#080b10;background-image:radial-gradient(circle,rgba(255,255,255,.055) 1px,transparent 1px);background-size:18px 18px;touch-action:none}
        .bc-card-wrap{position:relative;flex:none;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 28px 42px rgba(0,0,0,.42))}
        .bc-card{position:relative;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 12px 30px rgba(0,0,0,.3);transform-origin:center center}
        .bc-element{position:absolute;user-select:none;touch-action:none;cursor:move}.bc-element.selected{outline:1px solid rgba(224,175,89,.85);outline-offset:2px}.bc-selection-box{position:absolute;inset:-3px;border:1px solid rgba(224,175,89,.8);pointer-events:none}.bc-resize-handle{position:absolute;right:-7px;bottom:-7px;width:13px;height:13px;border-radius:4px;background:#e1ae5d;border:2px solid #11161f;cursor:nwse-resize;touch-action:none}.bc-rotate-handle{position:absolute;left:50%;top:-23px;transform:translateX(-50%);width:13px;height:13px;border-radius:50%;background:#e1ae5d;border:2px solid #11161f;cursor:grab;touch-action:none}.bc-edit-text{width:100%;height:100%;outline:none;overflow:hidden;white-space:pre-wrap;word-break:break-word;cursor:text}
        .bc-logo{position:absolute;left:55px;top:45px;width:130px;height:100px;object-fit:contain;border:1px solid transparent;border-radius:9px}.bc-business-copy{position:absolute;right:55px;top:72px;width:510px}.bc-company{font-size:29px;font-weight:900;letter-spacing:.02em}.bc-name{font-size:25px;font-weight:800;margin-top:7px}.bc-designation{font-size:15px;color:#aeb7c5;margin-top:4px}.bc-contact{font-size:14px;color:#d7dce4;margin-top:7px}.bc-address{font-size:12px;color:#8f99aa;margin-top:8px;line-height:1.35}
        .bc-action-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.bc-action-grid button{min-height:31px;padding:7px;border:1px solid rgba(255,255,255,.07);border-radius:6px;background:#151a23;color:#9da7b6;font-size:8px;font-weight:750;cursor:pointer}.bc-action-grid button:hover{border-color:rgba(198,138,53,.4);color:#e2b66d}.bc-right .bc-section{padding:0 0 14px;margin-bottom:14px}.bc-right label{display:block;color:#7f8999;font-size:8px;font-weight:800;margin:10px 0 5px}.bc-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.bc-live-field{margin-left:5px;color:#5fce91;font-size:6px}.bc-live-note{margin-top:7px;padding:8px;border-radius:7px;background:rgba(75,209,138,.06);border:1px solid rgba(75,209,138,.12);color:#748193;font-size:7px;line-height:1.4}.bc-live-note strong{color:#9bdab7}.bc-right button{cursor:pointer}
        .bc-empty{padding:18px 8px;text-align:center;color:#626d7e;font-size:8px;border:1px dashed rgba(255,255,255,.08);border-radius:8px}.bc-format-select{width:100%;padding:9px 10px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:#10151f;color:#dce1e8;outline:0;font-size:9px}.bc-format-note{margin-top:6px;color:#687384;font-size:7px;line-height:1.35}
        @media (max-width:1100px){.bc-body{grid-template-columns:235px minmax(0,1fr) 255px}.bc-top-status{display:none}.bc-brand{min-width:220px}.bc-stage{padding:30px}.bc-right{padding:11px}}
        @media (max-width:820px){.bc-app{height:100dvh;min-height:0}.bc-topbar{height:56px;padding:0 9px}.bc-brand{min-width:0}.bc-brand>div:last-child{display:none}.bc-brand-mark{width:31px;height:31px}.bc-back-studio{width:29px;height:29px}.bc-top-actions{gap:4px}.bc-top-actions button{height:29px;padding:0 7px;font-size:8px}.bc-top-actions button:nth-of-type(3),.bc-top-actions button:nth-of-type(4),.bc-divider{display:none}.bc-body{height:calc(100dvh - 56px);grid-template-columns:1fr;position:relative}.bc-left,.bc-right{display:none}.bc-workspace-head{height:46px;padding:0 10px}.bc-stage{padding:24px 12px;align-items:center;justify-content:center}.bc-card-wrap{margin:auto}.bc-workspace{width:100%}
          .bc-top-actions .bc-primary{padding:0 9px}.bc-zoom button{width:25px;height:25px}
        }
        @media (max-width:520px){.bc-top-actions button{font-size:0;width:31px;padding:0}.bc-top-actions button::first-letter{font-size:14px}.bc-top-actions .bc-primary{font-size:8px;width:auto}.bc-workspace-head .bc-muted{display:none}.bc-stage{padding:20px 8px}.bc-zoom span{min-width:36px}.bc-card{box-shadow:0 0 0 1px rgba(255,255,255,.12),0 15px 30px rgba(0,0,0,.4)}}

        .bc-frame-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.bc-frame-grid button{min-height:58px;border:1px solid rgba(255,255,255,.07);background:#141922;border-radius:8px;color:#9da7b6;font-size:7px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px}.bc-frame-grid button:hover{border-color:rgba(198,138,53,.45);color:#e4b66d}.frame-demo{width:30px;height:24px;border:2px solid #a97931;background:#222b3a;display:block}.frame-demo.rounded{border-radius:7px}.frame-demo.circle{border-radius:50%}.frame-demo.polaroid{border-width:2px 2px 7px}.frame-demo.hex{clip-path:polygon(25% 3%,75% 3%,100% 50%,75% 97%,25% 97%,0 50%)}.frame-demo.arch{border-radius:18px 18px 0 0}.bc-frame-note{margin-top:7px;color:#687384;font-size:7px;line-height:1.4}.bc-photo-frame{position:relative;width:100%;height:100%;overflow:hidden;display:flex;align-items:center;justify-content:center}.frame-polaroid{border-radius:2px!important;padding-bottom:12px!important;background:#f5f5f2!important;border-color:#e9e9e5!important}.frame-hex{clip-path:polygon(25% 3%,75% 3%,100% 50%,75% 97%,25% 97%,0 50%)}.frame-arch{border-radius:28px 28px 0 0!important}.bc-frame-placeholder{color:#687384;font-size:9px;font-weight:900;text-align:center;letter-spacing:.12em}.bc-ruler-top{position:absolute;top:7px;left:50%;width:min(80%,1050px);transform:translateX(-50%);display:flex;justify-content:space-between;color:#566173;font-size:6px;pointer-events:none;z-index:4}.bc-ruler-left{position:absolute;left:8px;top:50%;height:min(80%,600px);transform:translateY(-50%);display:flex;flex-direction:column;justify-content:space-between;color:#566173;font-size:6px;pointer-events:none;z-index:4}.bc-guide-btn{height:26px;padding:0 8px;border:1px solid rgba(255,255,255,.08);border-radius:6px;background:#141922;color:#7f8998;font-size:7px;cursor:pointer}.bc-guide-btn.active{color:#e4b66d;border-color:rgba(198,138,53,.35);background:rgba(198,138,53,.08)}.bc-toggle-on{color:#e4b66d!important;border-color:rgba(198,138,53,.35)!important}
      `}</style>
    </div>
  )
}
