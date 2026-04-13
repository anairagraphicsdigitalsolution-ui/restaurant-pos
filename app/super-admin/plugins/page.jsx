"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function PluginsPage(){

  const [restaurants,setRestaurants] = useState([])
  const [selected,setSelected] = useState(null)
  const [installed,setInstalled] = useState([])

  useEffect(()=>{
    loadRestaurants()
  },[])

  async function loadRestaurants(){
    const { data } = await supabase.from("restaurants").select("*")
    setRestaurants(data || [])
  }

  async function selectRestaurant(r){
    setSelected(r)

    const { data } = await supabase
      .from("restaurant_plugins")
      .select("*")
      .eq("restaurant_id", r.id)

    setInstalled(data || [])
  }

  // 🔥 INSTALL
  async function installPlugin(code){
    if(!selected) return alert("Select restaurant")

    // duplicate check
    const exists = installed.find(p=>p.plugin_code===code)
    if(exists) return alert("Already installed")

    const { error } = await supabase.from("restaurant_plugins").insert([{
      restaurant_id: selected.id,
      plugin_code: code,   // ✅ FIXED
      enabled: true
    }])

    if(error){
      alert("Error installing plugin")
      console.log(error)
    }

    selectRestaurant(selected)
  }

  // 🔥 TOGGLE ON/OFF
  async function togglePlugin(p){
    await supabase
      .from("restaurant_plugins")
      .update({ enabled: !p.enabled })
      .eq("id", p.id)

    selectRestaurant(selected)
  }

  // 🔥 REMOVE
  async function removePlugin(id){
    await supabase.from("restaurant_plugins").delete().eq("id",id)
    selectRestaurant(selected)
  }

  return (
    <div style={container}>

      <h1 style={title}>⚡ Plugin Manager</h1>

      {/* RESTAURANTS */}
      <div style={grid}>
        {restaurants.map(r=>(
          <div key={r.id} style={card} onClick={()=>selectRestaurant(r)}>
            <h3>{r.name}</h3>
          </div>
        ))}
      </div>

      {/* PLUGINS */}
      {selected && (
        <div style={panel}>

          <h2>{selected.name}</h2>

          <h3>Install Plugins</h3>

          <div style={btnWrap}>
            <button onClick={()=>installPlugin("pos")} style={btn}>POS</button>
            <button onClick={()=>installPlugin("whatsapp")} style={btn}>WhatsApp</button>
            <button onClick={()=>installPlugin("billing")} style={btn}>Billing</button>
            <button onClick={()=>installPlugin("qr-menu")} style={btn}>QR Menu</button>
            <button onClick={()=>installPlugin("razorpay")} style={btn}>Razorpay</button>
          </div>

          <h3 style={{marginTop:20}}>Installed</h3>

          {installed.map(p=>(
            <div key={p.id} style={row}>

              <div>
                <b>{p.plugin_code}</b>
                <p style={{fontSize:12,opacity:0.6}}>
                  {p.enabled ? "Enabled" : "Disabled"}
                </p>
              </div>

              <div style={{display:"flex",gap:10}}>

                {/* 🔥 TOGGLE */}
                <button
                  onClick={()=>togglePlugin(p)}
                  style={toggleBtn}
                >
                  {p.enabled ? "ON" : "OFF"}
                </button>

                {/* REMOVE */}
                <button
                  onClick={()=>removePlugin(p.id)}
                  style={dangerBtn}
                >
                  ✖
                </button>

              </div>

            </div>
          ))}

        </div>
      )}

    </div>
  )
}

/* 🔥 ULTRA GLASS NEON UI */

const container = {
  padding:30,
  background:"radial-gradient(circle at top,#020617,#000)",
  color:"#fff",
  minHeight:"100vh"
}

const title = {
  fontSize:30,
  marginBottom:25,
  background:"linear-gradient(90deg,#22c55e,#3b82f6)",
  WebkitBackgroundClip:"text",
  color:"transparent"
}

const grid = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",
  gap:20
}

const card = {
  padding:18,
  borderRadius:16,
  background:"rgba(255,255,255,0.05)",
  border:"1px solid rgba(255,255,255,0.1)",
  cursor:"pointer",
  boxShadow:"0 0 15px rgba(59,130,246,0.3)"
}

const panel = {
  marginTop:30,
  padding:25,
  borderRadius:18,
  background:"rgba(255,255,255,0.05)",
  border:"1px solid rgba(255,255,255,0.1)",
  boxShadow:"0 0 20px rgba(34,197,94,0.3)"
}

const btnWrap = {
  display:"flex",
  gap:12,
  flexWrap:"wrap"
}

const btn = {
  padding:"10px 16px",
  borderRadius:12,
  background:"transparent",
  border:"1px solid #22c55e",
  color:"#22c55e",
  cursor:"pointer",
  boxShadow:"0 0 12px #22c55e66"
}

const row = {
  display:"flex",
  justifyContent:"space-between",
  alignItems:"center",
  marginTop:12,
  padding:12,
  borderRadius:12,
  background:"rgba(255,255,255,0.04)",
  border:"1px solid rgba(255,255,255,0.08)"
}

const toggleBtn = {
  padding:"6px 12px",
  borderRadius:10,
  border:"1px solid #3b82f6",
  background:"transparent",
  color:"#3b82f6",
  cursor:"pointer",
  boxShadow:"0 0 10px #3b82f666"
}

const dangerBtn = {
  padding:"6px 12px",
  borderRadius:10,
  border:"1px solid red",
  background:"transparent",
  color:"red",
  cursor:"pointer"
}