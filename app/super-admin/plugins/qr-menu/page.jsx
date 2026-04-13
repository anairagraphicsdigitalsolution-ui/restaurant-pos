"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function QRPage(){

  const params = useSearchParams()
  const rid = params.get("rid")

  const [tables,setTables] = useState([])
  const [rooms,setRooms] = useState([])

  useEffect(()=>{
    load()
  },[])

  async function load(){
    const { data: t } = await supabase
      .from("tables")
      .select("*")
      .eq("restaurant_id", rid)

    const { data: r } = await supabase
      .from("rooms")
      .select("*")
      .eq("restaurant_id", rid)

    setTables(t || [])
    setRooms(r || [])
  }

  function getQR(type,id){
    return `${window.location.origin}/order?type=${type}&id=${id}`
  }

  return (
    <div style={{padding:30,color:"#fff"}}>

      <h1>📱 QR Generator</h1>

      {/* TABLES */}
      <h2>🍽️ Tables</h2>

      {tables.map(t=>(
        <div key={t.id} style={{marginBottom:20}}>
          Table {t.table_number}

          <br/>

          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${getQR("table",t.id)}`}
          />

        </div>
      ))}

      {/* ROOMS */}
      <h2>🏨 Rooms</h2>

      {rooms.map(r=>(
        <div key={r.id} style={{marginBottom:20}}>
          Room {r.room_number}

          <br/>

          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${getQR("room",r.id)}`}
          />

        </div>
      ))}

    </div>
  )
}