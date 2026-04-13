"use client"

import { useSearchParams } from "next/navigation"
import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

export default function WhatsAppConfig(){

  const params = useSearchParams()
  const rid = params.get("rid")

  const [number,setNumber] = useState("")
  const [enabled,setEnabled] = useState(true)

  useEffect(()=>{ load() },[])

  async function load(){
    const { data } = await supabase
      .from("plugin_settings")
      .select("*")
      .eq("restaurant_id", rid)
      .eq("plugin_slug","whatsapp")
      .single()

    if(data){
      setNumber(data.config?.number || "")
      setEnabled(data.config?.enabled ?? true)
    }
  }

  async function save(){
    await supabase.from("plugin_settings").upsert({
      restaurant_id: rid,
      plugin_slug: "whatsapp",
      config: {
        number,
        enabled
      }
    }, {
      onConflict:"restaurant_id,plugin_slug"
    })

    alert("Saved ✅")
  }

  return (
    <div style={{padding:30,color:"#fff"}}>

      <h1>📲 WhatsApp Settings</h1>

      <input
        value={number}
        onChange={(e)=>setNumber(e.target.value)}
        placeholder="91XXXXXXXXXX"
      />

      <br/><br/>

      <button onClick={()=>setEnabled(!enabled)}>
        {enabled ? "Enabled" : "Disabled"}
      </button>

      <br/><br/>

      <button onClick={save}>Save</button>

    </div>
  )
}