"use client"

import { useState } from "react"

export default function AIImagePage() {

  const [prompt, setPrompt] = useState("")
  const [image, setImage] = useState("")
  const [loading, setLoading] = useState(false)
  const [style, setStyle] = useState("realistic")

  const [history, setHistory] = useState([])
  const [copyMsg, setCopyMsg] = useState("")
  const [error, setError] = useState("")

  const [size, setSize] = useState("1024x1024")
  const [quality, setQuality] = useState("standard")
  const [previewOpen, setPreviewOpen] = useState(false)

  async function generateImage() {
    if (!prompt) return alert("Enter prompt")

    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: `${prompt} in ${style} style`,
          size,
          quality
        })
      })

      // ✅ SAFE RESPONSE
      const text = await res.text()

      let data
      try {
        data = JSON.parse(text)
      } catch {
        setError("Server JSON Error ❌")
        setLoading(false)
        return
      }

      // ✅ ERROR HANDLE
      if (!res.ok) {
        setError(data.error || "API Error ❌")
        setLoading(false)
        return
      }

      if (!data.image) {
        setError("Image not generated ❌")
        setLoading(false)
        return
      }

      setImage(data.image)

      // ✅ HISTORY LIMIT
      setHistory(prev => [
        { prompt, image: data.image },
        ...prev.slice(0, 9)
      ])

    } catch (err) {
      console.error(err)
      setError("Network Error ❌")
    }

    setLoading(false)
  }

  function downloadImage() {
    const link = document.createElement("a")
    link.href = image
    link.download = "ai-image.png"
    link.click()
  }

  function copyPrompt() {
    navigator.clipboard.writeText(prompt)
    setCopyMsg("Copied!")
    setTimeout(()=>setCopyMsg(""),1500)
  }

  return (
    <div style={container}>

      <h1 style={title}>🎨 AI Image Studio PRO</h1>

      {/* INPUT */}
      <div style={card}>

        <input
          placeholder="Describe your image..."
          value={prompt}
          onChange={(e)=>setPrompt(e.target.value)}
          style={input}
        />

        <select value={style} onChange={(e)=>setStyle(e.target.value)} style={input}>
          <option value="realistic">Realistic</option>
          <option value="cartoon">Cartoon</option>
          <option value="3d">3D Render</option>
          <option value="logo">Logo</option>
          <option value="poster">Poster</option>
          <option value="anime">Anime</option>
        </select>

        <select value={size} onChange={(e)=>setSize(e.target.value)} style={input}>
          <option value="512x512">512px</option>
          <option value="1024x1024">1024px</option>
          <option value="1792x1024">HD Wide</option>
        </select>

        <select value={quality} onChange={(e)=>setQuality(e.target.value)} style={input}>
          <option value="standard">Standard</option>
          <option value="hd">HD</option>
        </select>

        <div style={btnWrap}>
          <button onClick={generateImage} style={btnPrimary}>
            {loading ? "Generating..." : "Generate"}
          </button>

          <button onClick={copyPrompt} style={btnGray}>
            {copyMsg || "Copy Prompt"}
          </button>
        </div>

        {error && <p style={{color:"red"}}>{error}</p>}
      </div>

      {/* RESULT */}
      {image && (
        <div style={resultBox}>

          <img
            src={image}
            style={img}
            onClick={()=>setPreviewOpen(true)}
          />

          <div style={btnWrap}>
            <button onClick={downloadImage} style={btnGreen}>
              Download
            </button>

            <button onClick={()=>setImage("")} style={btnGray}>
              Clear
            </button>
          </div>

        </div>
      )}

      {/* MODAL */}
      {previewOpen && (
        <div style={modal} onClick={()=>setPreviewOpen(false)}>
          <img src={image} style={modalImg}/>
        </div>
      )}

      {/* HISTORY */}
      {history.length > 0 && (
        <div style={historyBox}>

          <h3>🕘 History</h3>

          <div style={historyGrid}>
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

/* UI same as yours */

/* UI */

const container = { padding:20, background:"#020617", minHeight:"100vh", color:"#fff" }
const title = { fontSize:30, marginBottom:20 }

const card = {
  padding:20,
  borderRadius:16,
  background:"rgba(255,255,255,0.05)",
  display:"flex",
  flexDirection:"column",
  gap:10
}

const input = {
  padding:12,
  borderRadius:10,
  border:"1px solid rgba(255,255,255,0.2)",
  background:"transparent",
  color:"#fff"
}

const btnWrap = { display:"flex", gap:10 }

const btnPrimary = { padding:10, background:"#6366f1", border:"none", borderRadius:10, color:"#fff" }
const btnGreen = { padding:10, background:"#22c55e", border:"none", borderRadius:10, color:"#fff" }
const btnGray = { padding:10, background:"#334155", border:"none", borderRadius:10, color:"#fff" }

const resultBox = { marginTop:20 }
const img = { width:"100%", borderRadius:12 }

const modal = {
  position:"fixed",
  top:0,
  left:0,
  width:"100%",
  height:"100%",
  background:"rgba(0,0,0,0.8)",
  display:"flex",
  justifyContent:"center",
  alignItems:"center"
}

const modalImg = { maxWidth:"90%" }

const historyBox = { marginTop:20 }
const historyGrid = { display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }
const historyCard = { background:"#111", padding:10 }
const historyImg = { width:"100%" }

const btnMini = { padding:5, background:"#3b82f6", border:"none", color:"#fff" }