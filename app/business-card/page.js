"use client"

import { useState } from "react"
import html2canvas from "html2canvas"
import jsPDF from "jspdf"

export default function BusinessCard() {

  const [data, setData] = useState({
    name:"",
    phone:"",
    email:"",
    business:"",
    address:"",
    website:"",
    tagline:""
  })

  const [logo,setLogo] = useState("")
  const [theme,setTheme] = useState("premium")
  const [qr,setQr] = useState("")
  const [history,setHistory] = useState([])
  const [cardLink,setCardLink] = useState("")

  function handleChange(e){
    setData({...data, [e.target.name]: e.target.value})
  }

  function handleLogo(e){
    const file = e.target.files[0]
    if(file){
      const reader = new FileReader()
      reader.onload = ()=> setLogo(reader.result)
      reader.readAsDataURL(file)
    }
  }

  function generateLink(){
    const encoded = btoa(JSON.stringify({data,logo}))
    const link = `${window.location.origin}/card/${encoded}`
    setCardLink(link)
    setQr(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${link}`)
  }

  async function downloadPDF(){
    const card = document.getElementById("card")

    const canvas = await html2canvas(card,{ scale:3, useCORS:true })
    const img = canvas.toDataURL("image/png")

    const pdf = new jsPDF({
      orientation:"landscape",
      unit:"mm",
      format:[85,55]
    })

    pdf.addImage(img,"PNG",0,0,85,55)
    pdf.save("business-card.pdf")

    setHistory(prev => [...prev,{...data,logo}])
  }

  function shareWhatsApp(){
    const text = `
${data.name}
${data.business}
📞 ${data.phone}
📧 ${data.email}
🌐 ${data.website}
📍 ${data.address}

${cardLink}
    `
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`)
  }

  function downloadVCard(){
    const vcard = `
BEGIN:VCARD
VERSION:3.0
FN:${data.name}
ORG:${data.business}
TEL:${data.phone}
EMAIL:${data.email}
URL:${data.website}
ADR:${data.address}
END:VCARD
    `
    const blob = new Blob([vcard], { type: "text/vcard" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${data.name}.vcf`
    a.click()
  }

  function copyLink(){
    navigator.clipboard.writeText(cardLink)
    alert("Link Copied")
  }

  const themes = {
    premium:"linear-gradient(135deg,#111,#1e293b)",
    luxury:"linear-gradient(135deg,#000,#bfa046)",
    neon:"linear-gradient(135deg,#0f172a,#22c55e)",
    glass:"rgba(255,255,255,0.08)"
  }

  return (
    <div style={container}>

      <h1 style={title}>💳 Digital Business Card PRO</h1>

      {/* MAIN GRID */}
      <div style={mainLayout}>

        {/* LEFT - FORM */}
        <div style={left}>
          <div style={form}>

            <input name="name" placeholder="Full Name" onChange={handleChange} style={input}/>
            <input name="business" placeholder="Business Name" onChange={handleChange} style={input}/>
            <input name="tagline" placeholder="Tagline" onChange={handleChange} style={input}/>
            <input name="phone" placeholder="Phone" onChange={handleChange} style={input}/>
            <input name="email" placeholder="Email" onChange={handleChange} style={input}/>
            <input name="website" placeholder="Website" onChange={handleChange} style={input}/>
            <input name="address" placeholder="Address" onChange={handleChange} style={input}/>

            <input type="file" onChange={handleLogo} style={input}/>

            <select value={theme} onChange={(e)=>setTheme(e.target.value)} style={input}>
              <option value="premium">Premium</option>
              <option value="luxury">Luxury</option>
              <option value="neon">Neon</option>
              <option value="glass">Glass</option>
            </select>

            <div style={btnWrap}>
              <button onClick={generateLink} style={btn}>Generate Link</button>
              <button onClick={downloadPDF} style={btn}>PDF</button>
              <button onClick={downloadVCard} style={btn}>Save Contact</button>
              <button onClick={shareWhatsApp} style={btnGreen}>WhatsApp</button>
            </div>

            {cardLink && (
              <div style={linkBox}>
                <p style={{fontSize:12}}>🔗 {cardLink}</p>
                <button onClick={copyLink} style={btnMini}>Copy</button>
              </div>
            )}

          </div>
        </div>

        {/* RIGHT - CARD */}
        <div style={right}>
          <div id="card" style={{...card, background:themes[theme]}}>

            <div style={header}>
              {logo && <img src={logo} style={logoStyle}/>}
              <div>
                <h2>{data.business || "Business Name"}</h2>
                <p style={tagline}>{data.tagline}</p>
              </div>
            </div>

            <h3>{data.name || "Your Name"}</h3>

            <div style={info}>
              <p>📞 {data.phone}</p>
              <p>📧 {data.email}</p>
              <p>🌐 {data.website}</p>
              <p>📍 {data.address}</p>
            </div>

            {qr && <img src={qr} style={qrStyle}/>}

          </div>
        </div>

      </div>

      {/* HISTORY */}
      {history.length > 0 && (
        <div style={historyBox}>
          <h3>Saved Cards</h3>
          <div style={grid}>
            {history.map((h,i)=>(
              <div key={i} style={historyCard}>
                <p>{h.name}</p>
                <button onClick={()=>setData(h)} style={btnMini}>Load</button>
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
  color:"#fff",
  minHeight:"100vh"
}

const title = { fontSize:30, marginBottom:20 }

const mainLayout = {
  display:"grid",
  gridTemplateColumns:"1fr 350px",
  gap:20,
  alignItems:"start"
}

const left = { width:"100%" }

const right = {
  position:"sticky",
  top:20,
  display:"flex",
  justifyContent:"center"
}

const form = {
  background:"rgba(255,255,255,0.05)",
  backdropFilter:"blur(12px)",
  padding:20,
  borderRadius:16,
  display:"flex",
  flexDirection:"column",
  gap:10,
  maxWidth:600
}

const input = {
  padding:12,
  borderRadius:10,
  border:"1px solid rgba(255,255,255,0.2)",
  background:"rgba(255,255,255,0.05)",
  color:"#fff"
}

const btnWrap = { display:"flex", gap:10, flexWrap:"wrap" }

const btn = {
  padding:10,
  background:"#6366f1",
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

const btnMini = {
  padding:6,
  fontSize:12,
  background:"#3b82f6",
  border:"none",
  borderRadius:6,
  color:"#fff"
}

const linkBox = {
  background:"rgba(255,255,255,0.05)",
  padding:10,
  borderRadius:10
}

const card = {
  width:320,
  height:200,
  padding:16,
  borderRadius:16,
  display:"flex",
  flexDirection:"column",
  justifyContent:"space-between",
  position:"relative",
  boxShadow:"0 20px 60px rgba(0,0,0,0.6)"
}

const header = { display:"flex", gap:10, alignItems:"center" }

const logoStyle = { width:50, borderRadius:8 }

const tagline = { fontSize:12, opacity:0.7 }

const info = { fontSize:12 }

const qrStyle = {
  position:"absolute",
  right:10,
  bottom:10,
  width:70
}

/* HISTORY */

const historyBox = {
  marginTop:30,
  padding:20,
  background:"rgba(255,255,255,0.05)",
  borderRadius:16
}

const grid = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",
  gap:10
}

const historyCard = {
  background:"rgba(255,255,255,0.05)",
  padding:10,
  borderRadius:10,
  textAlign:"center"
}