"use client"

import { useState } from "react"

export default function LogoPage(){

  const [prompt,setPrompt]=useState("")
  const [logo,setLogo]=useState("")
  const [loading,setLoading]=useState(false)

  const [style,setStyle]=useState("modern")
  const [color,setColor]=useState("blue")
  const [history,setHistory]=useState([])
  const [copied,setCopied]=useState("")

  // 🔥 NEW ADVANCED STATES
  const [size,setSize]=useState("1024")
  const [bg,setBg]=useState("white")
  const [zoom,setZoom]=useState(false)

  async function generate(){
    if(!prompt) return alert("Enter logo idea")

    setLoading(true)

    const res = await fetch("/api/generate-image",{
      method:"POST",
      body:JSON.stringify({
        prompt: `${prompt}, ${style} logo, ${color} color, ${bg} background, minimal, clean branding`,
        size
      })
    })

    const data = await res.json()

    setLogo(data.image)

    setHistory(prev => [
      { prompt, image:data.image },
      ...prev
    ])

    setLoading(false)
  }

  function downloadLogo(){
    const link = document.createElement("a")
    link.href = logo
    link.download = "logo.png"
    link.click()
  }

  function copyPrompt(){
    navigator.clipboard.writeText(prompt)
    setCopied("Copied!")
    setTimeout(()=>setCopied(""),1500)
  }

  return (
    <div style={container}>

      <h1 style={title}>🔥 AI Logo Studio PRO</h1>

      {/* INPUT */}
      <div style={card}>

        <input
          placeholder="Describe your logo..."
          value={prompt}
          onChange={(e)=>setPrompt(e.target.value)}
          style={input}
        />

        {/* STYLE */}
        <select value={style} onChange={(e)=>setStyle(e.target.value)} style={input}>
          <option value="modern">Modern</option>
          <option value="minimal">Minimal</option>
          <option value="3d">3D</option>
          <option value="luxury">Luxury</option>
          <option value="tech">Tech</option>
          <option value="gaming">Gaming</option>
        </select>

        {/* COLOR */}
        <select value={color} onChange={(e)=>setColor(e.target.value)} style={input}>
          <option value="blue">Blue</option>
          <option value="black">Black</option>
          <option value="gold">Gold</option>
          <option value="gradient">Gradient</option>
          <option value="neon">Neon</option>
        </select>

        {/* 🔥 SIZE */}
        <select value={size} onChange={(e)=>setSize(e.target.value)} style={input}>
          <option value="512">512px</option>
          <option value="1024">1024px</option>
          <option value="2048">HD 2048px</option>
        </select>

        {/* 🔥 BACKGROUND */}
        <select value={bg} onChange={(e)=>setBg(e.target.value)} style={input}>
          <option value="white">White</option>
          <option value="black">Black</option>
          <option value="transparent">Transparent</option>
        </select>

        <div style={btnWrap}>

          <button onClick={generate} style={btnPrimary}>
            {loading ? "Generating..." : "Generate Logo"}
          </button>

          <button onClick={copyPrompt} style={btnGray}>
            {copied || "Copy Prompt"}
          </button>

        </div>

      </div>

      {/* RESULT */}
      {logo && (
        <div style={resultBox}>

          <img
            src={logo}
            style={{
              ...img,
              transform: zoom ? "scale(1.6)" : "scale(1)",
              cursor:"zoom-in"
            }}
            onClick={()=>setZoom(!zoom)}
          />

          <div style={btnWrap}>

            <button onClick={downloadLogo} style={btnGreen}>
              Download
            </button>

            <button onClick={()=>setLogo("")} style={btnGray}>
              Clear
            </button>

          </div>

        </div>
      )}

      {/* HISTORY */}
      {history.length > 0 && (
        <div style={historyBox}>

          <h3>🕘 Recent Logos</h3>

          <div style={grid}>
            {history.map((h,i)=>(
              <div key={i} style={historyCard}>
                <img src={h.image} style={historyImg}/>
                <p style={{fontSize:11}}>{h.prompt}</p>

                <button onClick={()=>setLogo(h.image)} style={btnMini}>
                  Use
                </button>
              </div>
            ))}
          </div>

        </div>
      )}

    </div>
  )
}

/* 🎨 UI */

const container = {
  padding:20,
  background:"linear-gradient(135deg,#020617,#0f172a)",
  minHeight:"100vh",
  color:"#fff"
}

const title = {
  fontSize:32,
  fontWeight:"700",
  marginBottom:20
}

const card = {
  padding:20,
  borderRadius:16,
  background:"rgba(255,255,255,0.05)",
  backdropFilter:"blur(12px)",
  display:"flex",
  flexDirection:"column",
  gap:12,
  marginBottom:20
}

const input = {
  padding:14,
  borderRadius:12,
  border:"1px solid rgba(255,255,255,0.2)",
  background:"rgba(255,255,255,0.05)",
  color:"#fff"
}

const btnWrap = {
  display:"flex",
  gap:10,
  flexWrap:"wrap"
}

const btnPrimary = {
  padding:12,
  background:"linear-gradient(135deg,#6366f1,#4f46e5)",
  border:"none",
  borderRadius:10,
  color:"#fff"
}

const btnGreen = {
  padding:10,
  background:"#22c55e",
  border:"none",
  borderRadius:10,
  color:"#fff"
}

const btnGray = {
  padding:10,
  background:"#334155",
  border:"none",
  borderRadius:10,
  color:"#fff"
}

const resultBox = {
  marginTop:20,
  padding:20,
  borderRadius:16,
  background:"rgba(255,255,255,0.05)"
}

const img = {
  width:260,
  borderRadius:16,
  transition:"0.3s"
}

const historyBox = {
  marginTop:30,
  padding:20,
  borderRadius:16,
  background:"rgba(255,255,255,0.05)"
}

const grid = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",
  gap:15
}

const historyCard = {
  background:"rgba(255,255,255,0.05)",
  padding:10,
  borderRadius:12,
  textAlign:"center"
}

const historyImg = {
  width:"100%",
  borderRadius:10
}

const btnMini = {
  padding:6,
  fontSize:12,
  borderRadius:6,
  background:"#3b82f6",
  border:"none",
  color:"#fff"
}