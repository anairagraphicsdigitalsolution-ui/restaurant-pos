"use client"
import { useState } from "react"
import { useAuth } from "@/components/AuthProvider"

export default function AddRoom(){
 const { restaurantId, loading: authLoading } = useAuth()
 const [roomNumber,setRoomNumber]=useState("")
 const [loading,setLoading]=useState(false)
 const [message,setMessage]=useState("")
 async function addRoom(e){
   e.preventDefault()
   if(!roomNumber .trim() || !Number.isInteger(Number(roomNumber)) || Number(roomNumber) < 1){setMessage("Enter a valid room number.");return}
   if(!restaurantId){setMessage("Restaurant is not linked to this account.");return}
   setLoading(true);setMessage("")
   try {
     const { data: { session } } = await (await import("@/lib/supabaseCloud")).supabaseCloud.auth.getSession()
     const res = await fetch("/api/dashboard-add-room", {
       method:"POST",
       headers:{"Content-Type":"application/json", ...(session?.access_token ? {Authorization:`Bearer ${session.access_token}`} : {})},
       body:JSON.stringify({room_number: Number(roomNumber)})
     })
     const result = await res.json()
     if(!res.ok || !result.success) throw new Error(result.error || "Unable to add room")
     setMessage("Room added successfully.")
     setRoomNumber("")
   } catch(error) {
     console.error(error)
     setMessage(error?.message || "Unable to add room. Please try again.")
   } finally {
     setLoading(false)
   }
 }
 return <main className="utility-page"><div className="utility-shell"><div className="eyebrow">ROOM MANAGEMENT</div><h1>Add Room</h1><p className="lead">Create a room record for your restaurant or hotel-ready workspace.</p><form className="utility-card" onSubmit={addRoom}><div className="utility-icon">🏨</div><label>Room number<input value={roomNumber} onChange={e=>setRoomNumber(e.target.value)} type="number" min="1" step="1" placeholder="e.g. 101" autoFocus/></label>{message&&<div className="msg">{message}</div>}<button disabled={loading || authLoading || !restaurantId}>{loading?"Adding…":authLoading?"Loading restaurant…":"＋ Add Room"}</button></form></div><style jsx global>{utilityCss}</style></main>
}
const utilityCss=`.utility-page{min-height:100vh;background:var(--background);color:var(--text);padding:34px clamp(16px,4vw,50px);box-sizing:border-box}.utility-shell{max-width:760px;margin:0 auto}.eyebrow{color:var(--primary);font-size:10px;font-weight:950;letter-spacing:.16em}.utility-shell h1{font-size:40px;margin:7px 0 5px}.lead{color:var(--muted);font-size:13px;margin:0 0 22px}.utility-card{max-width:620px;padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:22px;box-shadow:0 18px 55px rgba(0,0,0,.15)}.utility-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:13px;background:rgba(var(--primary-rgb),.08);font-size:21px;margin-bottom:18px}.utility-card label{display:block;font-size:11px;font-weight:850}.utility-card input{display:block;width:100%;box-sizing:border-box;height:48px;margin-top:8px;padding:0 14px;border-radius:13px;border:1px solid rgba(var(--primary-rgb),.16);background:var(--surface-2);color:var(--text);outline:none}.utility-card input:focus{border-color:rgba(var(--primary-rgb),.45);box-shadow:0 0 0 3px rgba(var(--primary-rgb),.08)}.utility-card button{width:100%;height:48px;margin-top:16px;border:0;border-radius:13px;background:var(--primary);color:#07100b;font-weight:950}.msg{margin-top:13px;padding:10px 12px;border-radius:10px;background:rgba(var(--primary-rgb),.07);color:var(--primary);font-size:11px}@media(max-width:560px){.utility-page{padding:22px 14px}.utility-shell h1{font-size:31px}.utility-card{padding:18px;border-radius:18px}}`
