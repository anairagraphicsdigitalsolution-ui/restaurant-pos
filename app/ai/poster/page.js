"use client"

import { useState } from "react"

export default function PosterPage(){

  const [prompt,setPrompt]=useState("")
  const [image,setImage]=useState("")
  const [loading,setLoading]=useState(false)

  // 🔥 NEW STATES
  const [style,setStyle]=useState("modern")
  const [size,setSize]=useState("1024")
  const [history,setHistory]=useState([])
  const [text,setText]=useState("")
  const [copied,setCopied]=useState("")
  const [zoom,setZoom]=useState(false)

  async function generate(){

    if(!prompt) return alert("Enter poster idea")

    setLoading(true)

    const res = await fetch("/api/generate-image",{
      method:"POST",
      body:JSON.stringify({
        prompt: `${prompt}, ${style} poster design, high quality, bold text space, cinematic lighting`,
        size
      })
    })

    const data = await res.json()
    setImage(data.image)

    // 🔥 SAVE HISTORY
    setHistory(prev => [
      { prompt, image:data.image },
      ...prev
    ])

    setLoading(false)
  }

  function download(){
    const link = document.createElement("a")
    link.href = image
    link.download = "poster.png"
    link.click()
  }

  function copyPrompt(){
    navigator.clipboard.writeText(prompt)
    setCopied("Copied!")
    setTimeout(()=>setCopied(""),1500)
  }

  return (
    <div style={container}>

      <h1 style={title}>🪧 AI Poster Studio PRO</h1>

      {/* 🔥 INPUT PANEL */}
      <div style={card}>

        <input
          placeholder="Describe your poster..."
          value={prompt}
          onChange={(e)=>setPrompt(e.target.value)}
          style={input}
        />

        {/* STYLE */}
        <select value={style} onChange={(e)=>setStyle(e.target.value)} style={input}>
          <option value="modern">Modern</option>
          <option value="cinematic">Cinematic</option>
          <option value="festival">Festival</option>
          <option value="political">Political</option>
          <option value="business">Business</option>
          <option value="sale">Sale / Offer</option>
        </select>

        {/* SIZE */}
        <select value={size} onChange={(e)=>setSize(e.target.value)} style={input}>
          <option value="512">Small</option>
          <option value="1024">HD</option>
          <option value="2048">Ultra HD</option>
        </select>

        {/* TEXT OVERLAY */}
        <input
          placeholder="Optional text (headline)"
          value={text}
          onChange={(e)=>setText(e.target.value)}
          style={input}
        />

        <div style={btnWrap}>

          <button onClick={generate} style={btnPrimary}>
            {loading ? "Generating..." : "Generate Poster"}
          </button>

          <button onClick={copyPrompt} style={btnGray}>
            {copied || "Copy Prompt"}
          </button>

        </div>

      </div>

      {/* 🔥 RESULT */}
      {image && (
        <div style={resultBox}>

          <div style={{position:"relative"}}>

            <img
              src={image}
              style={{
                ...img,
                transform: zoom ? "scale(1.4)" : "scale(1)",
                cursor:"zoom-in"
              }}
              onClick={()=>setZoom(!zoom)}
            />

            {/* 🔥 TEXT OVERLAY */}
            {text && (
              <h2 style={overlayText}>
                {text}
              </h2>
            )}

          </div>

          <div style={btnWrap}>

            <button onClick={download} style={btnGreen}>
              Download
            </button>

            <button onClick={()=>setImage("")} style={btnGray}>
              Clear
            </button>

          </div>

        </div>
      )}

      {/* 🔥 HISTORY */}
      {history.length > 0 && (
        <div style={historyBox}>

          <h3>🕘 Recent Posters</h3>

          <div style={grid}>
            {history.map((h,i)=>(
              <div key={i} style={historyCard}>
                <img src={h.image} style={historyImg}/>
                <p style={{fontSize:11}}>{h.prompt}</p>

                <button onClick={()=>setImage(h.image)} style={btnMini}>
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

/* 🎨 STYLES */

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
  width:"100%",
  borderRadius:16,
  transition:"0.3s"
}

/* 🔥 TEXT OVERLAY */
const overlayText = {
  position:"absolute",
  bottom:20,
  left:20,
  fontSize:28,
  fontWeight:"700",
  color:"#fff",
  textShadow:"0 5px 15px rgba(0,0,0,0.7)"
}

/* 🔥 HISTORY */
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