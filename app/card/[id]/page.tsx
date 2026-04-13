"use client"

import { useParams } from "next/navigation"
import { useEffect, useState } from "react"

export default function CardPage(){

  const params = useParams()
  const id = params?.id as string

  const [card,setCard] = useState<any>(null)

  useEffect(()=>{
    try{
      const decoded = JSON.parse(atob(id))
      setCard(decoded)
    }catch(e){
      console.log("Invalid Card")
    }
  },[id])

  if(!card){
    return (
      <div style={container}>
        <h2>Loading Card...</h2>
      </div>
    )
  }

  const { data, logo } = card

  return (
    <div style={container}>

      <div style={cardUI}>

        {/* LOGO */}
        {logo && <img src={logo} style={logoStyle}/>}

        {/* NAME */}
        <h1 style={name}>{data.name}</h1>
        <h3 style={business}>{data.business}</h3>

        {data.tagline && (
          <p style={tagline}>{data.tagline}</p>
        )}

        {/* ACTION BUTTONS */}
        <div style={actions}>
          <a href={`tel:${data.phone}`} style={btn}>📞 Call</a>
          <a href={`mailto:${data.email}`} style={btn}>📧 Email</a>
          {data.website && (
            <a href={data.website} target="_blank" style={btn}>🌐 Website</a>
          )}
        </div>

        {/* INFO */}
        <div style={info}>
          <p>📞 {data.phone}</p>
          <p>📧 {data.email}</p>
          {data.website && <p>🌐 {data.website}</p>}
          <p>📍 {data.address}</p>
        </div>

        {/* SHARE BUTTON */}
        <button onClick={()=>navigator.share?.({
          title:data.name,
          text:`${data.name} | ${data.business}`,
          url:window.location.href
        })} style={shareBtn}>
          🔗 Share Card
        </button>

      </div>

    </div>
  )
}

/* 🔥 STYLES */

const container = {
  minHeight:"100vh",
  display:"flex",
  justifyContent:"center",
  alignItems:"center",
  background:"linear-gradient(135deg,#020617,#0f172a)",
  color:"#fff",
  padding:20
}

const cardUI = {
  width:"100%",
  maxWidth:400,
  padding:30,
  borderRadius:20,
  background:"rgba(255,255,255,0.08)",
  backdropFilter:"blur(15px)",
  textAlign:"center",
  boxShadow:"0 20px 50px rgba(0,0,0,0.5)"
}

const logoStyle = {
  width:70,
  borderRadius:12,
  marginBottom:10
}

const name = {
  margin:0,
  fontSize:26
}

const business = {
  margin:0,
  opacity:0.7
}

const tagline = {
  fontSize:13,
  opacity:0.6,
  marginBottom:10
}

const actions = {
  display:"flex",
  gap:10,
  justifyContent:"center",
  marginTop:15,
  flexWrap:"wrap"
}

const btn = {
  padding:"10px 14px",
  background:"#3b82f6",
  borderRadius:10,
  color:"#fff",
  textDecoration:"none"
}

const info = {
  marginTop:15,
  fontSize:14,
  opacity:0.9
}

const shareBtn = {
  marginTop:15,
  padding:12,
  width:"100%",
  background:"#22c55e",
  border:"none",
  borderRadius:12,
  color:"#fff"
}