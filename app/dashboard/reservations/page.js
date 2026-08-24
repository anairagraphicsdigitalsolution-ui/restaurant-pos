"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function ReservationPage() {

  const [reservations, setReservations] = useState([])
  const [tables, setTables] = useState([])
  const [availableTables, setAvailableTables] = useState([])

 const [form, setForm] = useState({
  name: "",
  phone: "",
  guests: 1,
  table_id: "",
  date: "",
  time: "",
  duration: 60,
  notes: ""
})
  const [editId, setEditId] = useState(null)
  const [search, setSearch] = useState("")
const [filter, setFilter] = useState("all")
const [restaurantId, setRestaurantId] = useState(null)


  useEffect(() => {
  getRestaurant()
}, [])
async function getRestaurant() {

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) return

  const { data, error } = await supabase
    .from("profiles")
    .select("restaurant_id, role")
    .eq("id", user.id)
    .maybeSingle()

  if (error || !data?.restaurant_id) {
    console.log(error || "Restaurant mapping not found")
    return
  }

  setRestaurantId(data.restaurant_id)
  const { data: plugin } = await supabase
    .from("restaurant_plugins")
    .select("enabled")
    .eq("restaurant_id", data.restaurant_id)
    .in("plugin_code", ["reservations-pro", "reservations"])
    .eq("enabled", true)
    .limit(1)
    .maybeSingle()
  setPluginActive(plugin?.enabled === true)
  const { data: settings } = await supabase
    .from("plugin_settings")
    .select("config")
    .eq("restaurant_id", data.restaurant_id)
    .eq("plugin_code", "reservations-pro")
    .maybeSingle()
  setPluginConfig(settings?.config || {})
}
useEffect(() => {

  if (!restaurantId || !pluginActive) return

  fetchTables()
  fetchReservations()

}, [restaurantId, pluginActive])

  // 🔥 FETCH TABLES
  async function fetchTables() {
    const { data, error } = await supabase
  .from("tables")
  .select("*")
  .eq("restaurant_id", restaurantId)
    if (error) {
  console.log("FETCH ERROR:", error)
  alert(error.message)
  return
}

    setTables(data || [])
    setAvailableTables(data || [])
  }

  // 🔥 FETCH RESERVATIONS (FIXED RELATION)
  async function fetchReservations() {
    const { data, error } = await supabase
  .from("reservations")
  .select("*")
  .eq("restaurant_id", restaurantId)
  .order("created_at", { ascending: false })

    if (error) {
      console.log(error)
      return
    }

    console.log("Reservations:", data)
setReservations(data || [])
  }
  async function checkAvailableTables(date,time){

if(!date || !time){

setAvailableTables(tables)

return

}

const {data}=await supabase

.from("reservations")

.select("table_id")

.eq("date",date)

.eq("time",time)

.in("status",["pending","confirmed"])

const booked=(data||[]).map(r=>r.table_id)

setAvailableTables(

tables.filter(t=>!booked.includes(t.id))

)

}

  function handleChange(e){

const updated={

...form,

[e.target.name]:e.target.value

}

setForm(updated)

if(

updated.date &&

updated.time

){

checkAvailableTables(

updated.date,

updated.time

)

}

}

  // 🔥 SAVE
  async function saveReservation() {
    if (!form.name || !form.phone || !form.table_id || !form.date || !form.time) {
      alert("Fill all required fields")
      return
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error("Login session expired")

      const response = await fetch("/api/reservations/manage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: editId ? "update" : "create",
          reservation_id: editId || undefined,
          ...form,
          guests: Number(form.guests || 1),
          duration: Number(form.duration || 60)
        })
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Reservation failed")
      }

      setEditId(null)
      setForm({
        name:"",
        phone:"",
        guests:1,
        table_id:"",
        date:"",
        time:"",
        duration:Number(pluginConfig.default_duration_minutes || 90),
        notes:""
      })
      await fetchReservations()
      alert(editId ? "Reservation updated" : "Reservation created")
    } catch (error) {
      console.error(error)
      alert(error.message || "Reservation failed")
    }
  }

  function editReservation(r){

setForm({

name:r.name,

phone:r.phone,

table_id:r.table_id,

date:r.date,

time:r.time,

guests:r.guests || 1,

duration:r.duration || 60,

notes:r.notes || ""

})

setEditId(r.id)

}

  async function deleteReservation(id) {
    if (!window.confirm("Delete this reservation?")) return

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error("Login session expired")

      const response = await fetch("/api/reservations/manage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: "delete",
          reservation_id: id
        })
      })

      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || "Delete failed")
      await fetchReservations()
    } catch (error) {
      console.error(error)
      alert(error.message || "Delete failed")
    }
  }

  async function updateStatus(id, status) {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error("Login session expired")

      const response = await fetch("/api/reservations/manage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: "status",
          reservation_id: id,
          status
        })
      })

      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || "Status update failed")
      await fetchReservations()
    } catch (error) {
      console.error(error)
      alert(error.message || "Status update failed")
    }
  }


  if (!pluginActive) {
    return (
      <main style={{minHeight:"100vh",padding:30,background:"var(--background)",color:"var(--text)"}}>
        <div style={{maxWidth:700,margin:"12vh auto",padding:30,borderRadius:22,background:"var(--surface)",border:"1px solid var(--border)",textAlign:"center"}}>
          <div style={{fontSize:48}}>📅</div>
          <h1>Advanced Reservations</h1>
          <p style={{color:"var(--muted)"}}>This plugin is currently OFF. Super Admin can activate Advanced Reservations for this restaurant from Plugin Manager.</p>
        </div>
      </main>
    )
  }

  return (
    <>
    <style jsx global>{`
@media(max-width:900px){.reservations-form{grid-template-columns:1fr 1fr!important}.reservations-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media(max-width:600px){.reservations-page{padding:14px!important}.reservations-title{font-size:30px!important;margin-bottom:20px!important}.reservations-form{grid-template-columns:1fr!important;padding:18px!important;gap:14px!important}.reservations-grid{grid-template-columns:1fr!important;gap:14px!important}.reservation-card{padding:18px!important}.reservation-actions{display:grid!important;grid-template-columns:1fr 1fr!important}.reservation-actions button{min-height:44px!important}}
`}</style>

      <div className="reservations-page" style={layout}>

      <h1 className="reservations-title" style={title}>
📅 Reservations
</h1>
      <div style={statsGrid}>

  <div style={statCard}>
    <h2
style={{
fontSize:42,
fontWeight:900,
marginBottom:8,
color:"#fff"
}}
>
{reservations.length}
</h2>
    <p>Total</p>
  </div>

  <div style={statCard}>
    <h2>
      {reservations.filter(r=>r.status==="pending").length}
    </h2>
    <p>Pending</p>
  </div>

  <div style={statCard}>
    <h2>
      {reservations.filter(r=>r.status==="confirmed").length}
    </h2>
    <p>Confirmed</p>
  </div>

  <div style={statCard}>
    <h2>
      {reservations.filter(r=>r.status==="cancelled").length}
    </h2>
    <p>Cancelled</p>
  </div>

</div>
<div
style={{
display:"flex",
gap:15,
marginBottom:30,
padding:22,
borderRadius:22,
background:"rgba(255,255,255,.05)",
border:"1px solid rgba(255,255,255,.08)",
backdropFilter:"blur(25px)",
flexWrap:"wrap"
}}

>

<input

placeholder="Search Customer"

value={search}

onChange={(e)=>setSearch(e.target.value)}

style={input}

/>

<select

value={filter}

onChange={(e)=>setFilter(e.target.value)}

style={select}

>

<option value="all" style={optionStyle}>All</option>
<option value="pending" style={optionStyle}>Pending</option>
<option value="confirmed">Confirmed</option>
<option value="cancelled" style={optionStyle}>Cancelled</option>

</select>

</div>

      {/* 🔥 FORM */}
      <div className="reservations-form" style={formBox}>

<h2
style={{
gridColumn:"1/-1",
fontSize:28,
fontWeight:800,
marginBottom:5
}}
>
🍽️ Create Reservation
</h2>

        <input name="name" placeholder="Customer Name" value={form.name} onChange={handleChange} style={input}/>
        <input

type="number"

name="guests"

placeholder="Guests"

value={form.guests}

onChange={handleChange}

style={input}

/>
        <input name="phone" placeholder="Phone" value={form.phone} onChange={handleChange} style={input}/>

        {/* 🔥 FIXED DROPDOWN */}
        <select name="table_id" value={form.table_id} onChange={handleChange} style={select}>
          <option value="" style={optionStyle}>
Select Table
</option>
          {availableTables.map(t => (
            <option
key={t.id}
value={t.id}
style={optionStyle}
>
              Table {t.table_number}
            </option>
          ))}
        </select>

        <input type="date" name="date" value={form.date} onChange={handleChange} style={input}/>
        <input type="time" name="time" value={form.time} onChange={handleChange} style={input}/>
        <select

name="duration"

value={form.duration}

onChange={handleChange}

style={select}

>

<option value={60} style={optionStyle}>
1 Hour
</option>

<option value={90} style={optionStyle}>
1.5 Hours
</option>

<option value={120} style={optionStyle}>
2 Hours
</option>

</select>
<textarea

name="notes"

placeholder="Special Request"

value={form.notes}

onChange={handleChange}

style={{

...input,

width:"100%",

minHeight:80

}}

/>

        <button onClick={saveReservation} style={saveBtn}>
          {editId ? "Update" : "Add"}
        </button>

      </div>

      {/* 🔥 CARDS */}
      <div className="reservations-grid" style={grid}>
        {reservations

.filter(r=>{

const matchesSearch=

r.name

.toLowerCase()

.includes(

search.toLowerCase()

)

const matchesFilter=

filter==="all"

||

r.status===filter

return matchesSearch && matchesFilter

})

.map(r=>(
          <div key={r.id} className="reservation-card" style={card}>

            <div style={statusChip(r.status)}>
              {r.status}
            </div>

            <h3
style={{
fontSize:22,
fontWeight:700,
marginBottom:12,
color:"#fff"
}}
>
👤 {r.name}
</h3>
            <p style={muted}>📞 {r.phone}</p>
            <p style={muted}>
🍽️ Table : {(tables.find(t=>t.id===r.table_id)?.table_number) || r.table_id || "-"}
</p>

<hr
style={{
border:"none",
borderTop:"1px solid rgba(255,255,255,.08)",
margin:"15px 0"
}}
/>
            <p style={muted}>
              📅 {r.date || "-"} | ⏰ {r.time || "-"}
            </p>
            

<p style={muted}>

👥 Guests : {r.guests ?? "-"}

</p>

<p style={muted}>

⌛ {r.duration ?? "-"}

</p>

<p style={muted}>

📝 {r.notes || "No Notes"}

</p>
<p

style={{

fontWeight:"bold",

marginTop:8,

color:

r.status==="confirmed"

? "var(--success)"

: r.status==="cancelled"

? "var(--danger)"

: "var(--primary)"

}}

>

Status :

{r.status.toUpperCase()}

</p>

            <div className="reservation-actions" style={actions}>
              <button onClick={() => editReservation(r)} style={editBtn}>Edit</button>
              <button onClick={() => deleteReservation(r.id)} style={deleteBtn}>Delete</button>
            </div>

            <div className="reservation-actions" style={actions}>

{r.status!=="confirmed" && (

<button

onClick={()=>updateStatus(r.id,"confirmed")}

style={confirmBtn}

>

✅ Confirm

</button>

)}

{r.status!=="cancelled" && (

<button

onClick={()=>updateStatus(r.id,"cancelled")}

style={cancelBtn}

>

❌ Cancel

</button>

)}

</div>

          </div>
        ))}
      </div>

    </div>
    </>
  )
}

/* 🎨 PREMIUM UI */

const layout = {
  minHeight: "100vh",
  padding: "40px",
  background: `
  radial-gradient(circle at top left,var(--surface-2) 0%,var(--surface-2) 30%,var(--background) 65%,#000 100%)
  `,
  color: "#fff"
}


const title = {
  fontSize: 40,
  fontWeight: 800,
  marginBottom: 35,
  background: "linear-gradient(135deg,var(--primary),color-mix(in srgb, var(--primary) 70%, white),var(--warning))",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  letterSpacing: 1
}

const formBox = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
  gap: 22,
  marginBottom: 35,
  padding: 32,
  borderRadius: 30,
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.08)",
  backdropFilter: "blur(28px)",
  WebkitBackdropFilter: "blur(28px)",
  boxShadow:
    "0 30px 80px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08)"
}

const input = {
  width: "100%",
  padding: "16px 18px",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(255,255,255,.04)",
  color: "#fff",
  fontSize: 15,
  outline: "none",
  backdropFilter: "blur(20px)",
  transform:"translateY(0)"
}
const select = {
  ...input,
  background: "var(--surface)",
  color: "#fff",
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none"
}
const optionStyle = {
  background: "var(--surface)",
  color: "#fff"
}
const saveBtn = {
  padding: "16px",
  borderRadius: 18,
  border: "2px solid rgb(223, 173, 10)",
  background: "rgba(255, 255, 255, 0)",
  backdropFilter: "blur(25px)",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  transition: ".35s"
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))",
  gap: 20
}

const card = {
  position: "relative",
  overflow: "hidden",
  padding: 28,
  borderRadius: 28,
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.08)",
  backdropFilter: "blur(28px)",
  WebkitBackdropFilter: "blur(28px)",
  boxShadow:
    "0 25px 70px rgba(0,0,0,.45)"
}
const muted = {
  fontSize: 13,
  color: "var(--muted)"
}

const statusChip = (s)=>({

display:"inline-block",

padding:"8px 16px",

borderRadius:999,

fontWeight:700,

fontSize:12,

textTransform:"uppercase",

marginBottom:18,

background:

s==="confirmed"

? "linear-gradient(135deg,var(--success),var(--success))"

: s==="cancelled"

? "linear-gradient(135deg,var(--danger),var(--danger))"

: "linear-gradient(135deg,#92400e,var(--warning))",

boxShadow:"0 10px 25px rgba(0,0,0,.35)"

})

const actions = {
  display: "flex",
  gap: 10,
  marginTop: 10
}

const editBtn = {
  flex:1,
  padding:"14px",
  borderRadius:18,
  border:"1px solid rgba(96,165,250,.30)",
  background:"rgba(var(--info-rgb),.10)",
  backdropFilter:"blur(20px)",
  color:"#fff",
  fontWeight:700,
  cursor:"pointer"
}
const deleteBtn = {
  flex:1,
  padding:"14px",
  borderRadius:18,
  border:"1px solid rgba(248,113,113,.30)",
  background:"rgba(var(--danger-rgb),.08)",
  backdropFilter:"blur(20px)",
  color:"#fff",
  fontWeight:700,
  cursor:"pointer"
}
const confirmBtn = {
  flex:1,
  padding:"14px",
  borderRadius:18,
  border:"1px solid rgba(var(--success-rgb),.30)",
  background:"rgba(var(--success-rgb),.08)",
  backdropFilter:"blur(20px)",
  color:"#fff",
  fontWeight:700,
  cursor:"pointer"
}
const cancelBtn = {
  flex:1,
  padding:"14px",
  borderRadius:18,
  border:"1px solid rgba(var(--danger-rgb),.30)",
  background:"rgba(var(--danger-rgb),.08)",
  backdropFilter:"blur(20px)",
  color:"#fff",
  fontWeight:700,
  cursor:"pointer"
}
const statsGrid={

display:"grid",

gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",

gap:20,

marginBottom:30

}

const statCard = {
  padding: 28,
  borderRadius: 24,
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.08)",
  backdropFilter: "blur(24px)",
  textAlign: "center",
  boxShadow: "0 18px 45px rgba(0,0,0,.35)"
}