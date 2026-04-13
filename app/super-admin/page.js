"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import * as XLSX from "xlsx"

export default function SuperAdmin() {

  const [restaurants, setRestaurants] = useState([])
  const [summary, setSummary] = useState({ total:0, active:0, inactive:0 })

 const [form, setForm] = useState({
  name:"", owner_name:"", phone:"", address:"", gst:"", logo:"",
  whatsapp:""
})

  const [editingId, setEditingId] = useState(null)

  const [selected,setSelected] = useState(null)
  const [menu,setMenu] = useState([])

  const [item,setItem] = useState({
    name:"",
    price:"",
    category:"",
    image:""
  })

  const [menuOpen,setMenuOpen] = useState(true)

  const [imageFile,setImageFile] = useState(null)
  const [excelFile,setExcelFile] = useState(null)


  // 🔥 BULK DELETE STATE
  const [selectedItems,setSelectedItems] = useState([])
  const [whatsappNumbers, setWhatsappNumbers] = useState({})

  useEffect(()=>{ loadRestaurants() },[])

  async function loadRestaurants(){
    const { data } = await supabase.from("restaurants").select("*")

    const fixed = (data||[]).map(r=>({
      ...r,
      status:r.status || "active"
    }))

    setRestaurants(fixed)
    const { data: wp } = await supabase
  .from("plugin_settings")
  .select("*")
  .eq("plugin_slug","whatsapp")

const map = {}
;(wp || []).forEach(i=>{
  map[i.restaurant_id] = i.config?.number || ""
})

setWhatsappNumbers(map)

    setSummary({
      total: fixed.length,
      active: fixed.filter(r=>r.status==="active").length,
      inactive: fixed.filter(r=>r.status!=="active").length
    })
  }

  function handleChange(e){
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  function handleItemChange(e){
    setItem({ ...item, [e.target.name]: e.target.value })
  }

  function handleFile(e){
    const file = e.target.files[0]
    if(file) setImageFile(file)
  }

  function handleExcel(e){
    const file = e.target.files[0]
    if(file) setExcelFile(file)
  }
  function handleWhatsappChange(id,value){
  setWhatsappNumbers(prev => ({
    ...prev,
    [id]: value
  }))
}

  // 🔥 BULK SELECT
  function toggleSelect(id){
    if(selectedItems.includes(id)){
      setSelectedItems(selectedItems.filter(i=>i!==id))
    }else{
      setSelectedItems([...selectedItems,id])
    }
  }

  async function bulkDelete(){
    if(!selectedItems.length) return alert("Select items first")

    if(!confirm("Delete selected items?")) return

    await supabase
      .from("menu_items")
      .delete()
      .in("id", selectedItems)

    setSelectedItems([])
    await handleEdit(selected)
  }

  async function uploadImage(file){
    const ext = file.name.split(".").pop()
    const fileName = `menu-${Date.now()}.${ext}`

    const { error } = await supabase.storage
      .from("menu-images")
      .upload(fileName,file)

    if(error){
      alert("Image upload failed")
      return null
    }

    const { data } = supabase.storage
      .from("menu-images")
      .getPublicUrl(fileName)

    return data.publicUrl
  }


 async function handleEdit(r){

  setSelected(r)
  setEditingId(r.id)
  setSelectedItems([]) // 🔥 reset selection

  // ✅ ADD THIS
  const { data: menuData } = await supabase
    .from("menu_items")
    .select("*")
    .eq("restaurant_id", r.id)

  setMenu(menuData || [])

  const { data: wp } = await supabase
    .from("plugin_settings")
    .select("*")
    .eq("restaurant_id", r.id)
    .eq("plugin_slug","whatsapp")
    .single()

  setForm({
  name: r.name || "",
  owner_name: r.owner_name || "",
  phone: r.phone || "",
  address: r.address || "",
  gst: r.gst || "",
  logo: r.logo || "",
  whatsapp: wp?.config?.number || ""
})
 }

   async function addMenuItem(){
    if(!item.name || !item.price) return alert("Fill item")

    let imageUrl = item.image

    if(imageFile){
      const uploaded = await uploadImage(imageFile)
      if(uploaded) imageUrl = uploaded
    }

    await supabase.from("menu_items").insert([{
      ...item,
      image:imageUrl,
      price:Number(item.price),
      restaurant_id:selected.id
    }])

    setItem({name:"",price:"",category:"",image:""})
    setImageFile(null)

    await handleEdit(selected)
  }

  async function uploadExcel(){

    if(!excelFile) return alert("Upload file first")
    if(!selected) return alert("Select restaurant first")

    const data = await excelFile.arrayBuffer()
    const workbook = XLSX.read(data)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]

    const json = XLSX.utils.sheet_to_json(sheet)

    const formatted = json.map(i => ({
      name: i.name,
      price: Number(i.price),
      category: i.category || "Other",
      image: i.image || "",
      restaurant_id: selected.id
    }))

    await supabase.from("menu_items").insert(formatted)

    alert("Bulk upload success ✅")
    await handleEdit(selected)
  }

  async function replaceImage(id,file){
    const url = await uploadImage(file)
    if(!url) return

    await supabase.from("menu_items").update({image:url}).eq("id",id)
    await handleEdit(selected)
  }

  async function deleteItem(id){
    await supabase.from("menu_items").delete().eq("id", id)
   await handleEdit(selected)
  }

  async function deleteRestaurant(id){
    await supabase.from("restaurants").delete().eq("id", id)
    loadRestaurants()
  }

  async function toggleStatus(r){
    await supabase.from("restaurants")
      .update({status: r.status==="active"?"inactive":"active"})
      .eq("id", r.id)

    loadRestaurants()
  }
 
async function saveRestaurant(){

  if(!form.name) return alert("Enter name")

  let restaurantId = editingId

  if(editingId){
    await supabase
      .from("restaurants")
      .update({
        name: form.name,
        owner_name: form.owner_name,
        phone: form.phone,
        address: form.address,
        gst: form.gst,
        logo: form.logo
      })
      .eq("id", editingId)

  } else {

    const { data } = await supabase
      .from("restaurants")
      .insert([{
        name: form.name,
        owner_name: form.owner_name,
        phone: form.phone,
        address: form.address,
        gst: form.gst,
        logo: form.logo,
        status:"active"
      }])
      .select()
      .single()

    restaurantId = data.id
  }

  // ✅ WHATSAPP SAVE (AUTO)
  if(form.whatsapp){
    await supabase
  .from("plugin_settings")
  .upsert({
    restaurant_id: restaurantId,
    plugin_slug: "whatsapp",
    config: { number: form.whatsapp }
  }, {
    onConflict: "restaurant_id,plugin_slug"
  })
}

  // RESET
  setEditingId(null)
  setForm({
    name:"",
    owner_name:"",
    phone:"",
    address:"",
    gst:"",
    logo:"",
    whatsapp:""
  })

  loadRestaurants()
}

  return (
    <div style={layout}>

      <h1 style={title}>🚀 Super Admin Dashboard</h1>

     <div style={statsGrid}>
  <StatCard title="Total" value={summary.total}/>
  <StatCard title="Active" value={summary.active}/>
  <StatCard title="Inactive" value={summary.inactive}/>

  {/* 🔥 PLUGIN BUTTON */}
  <button
    onClick={() => window.location.href="/super-admin/plugins"}
    style={{
      padding:"14px",
      borderRadius:14,
      background:"linear-gradient(135deg,#6366f1,#4f46e5)",
      border:"none",
      color:"#fff",
      cursor:"pointer",
      fontWeight:"700",
      boxShadow:"0 0 15px #0004f9aa"
    }}
  >
    🔌 Plugins Manager
  </button>

</div>

      <div style={formBox}>
        <input name="name" value={form.name} onChange={handleChange} placeholder="Name" style={input}/>
        <input name="owner_name" value={form.owner_name} onChange={handleChange} placeholder="Owner" style={input}/>
        <input name="phone" value={form.phone} onChange={handleChange} placeholder="Phone" style={input}/>
        <input name="address" value={form.address} onChange={handleChange} placeholder="Address" style={input}/>
        <input name="gst" value={form.gst} onChange={handleChange} placeholder="GST" style={input}/>
        <input name="logo" value={form.logo} onChange={handleChange} placeholder="Logo URL" style={input}/>
        <input name="whatsapp" value={form.whatsapp} onChange={handleChange} placeholder="WhatsApp Number" style={input}
/>
        <button onClick={saveRestaurant} style={btn}>
          {editingId ? "Update" : "Add"}
        </button>
      </div>

      <div style={grid}>
        {restaurants.map(r=>(
          <div key={r.id} style={card}>
            {r.logo && <img src={r.logo} style={logo}/>}
            <h3>{r.name}</h3>
            <p>{r.owner_name}</p>
            <p>{r.phone}</p>
            

            <div style={actions}>
              <button onClick={()=>handleEdit(r)} style={btnSmall}>Edit</button>
              <button onClick={()=>toggleStatus(r)} style={btnSmall}>Toggle</button>
              <button onClick={()=>deleteRestaurant(r.id)} style={dangerBtn}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div style={panel}>

          <h2>{selected.name} - Menu Control</h2>

          <div style={formBox}>
            <input name="name" value={item.name} onChange={handleItemChange} placeholder="Item Name" style={input}/>
            <input name="price" value={item.price} onChange={handleItemChange} placeholder="Price" style={input}/>
            <input name="category" value={item.category} onChange={handleItemChange} placeholder="Category" style={input}/>
            <input name="image" value={item.image} onChange={handleItemChange} placeholder="Image URL" style={input}/>
            <input type="file" onChange={handleFile} style={input}/>
            <button onClick={addMenuItem} style={btn}>Add Item</button>
          </div>

          <div style={{marginTop:20}}>
            <input type="file" accept=".xlsx,.csv" onChange={handleExcel} style={input}/>
            <button onClick={uploadExcel} style={btn}>Upload Excel</button>
          </div>

          {/* 🔥 BULK DELETE BUTTON */}
          <div style={{marginTop:15}}>
            <button onClick={bulkDelete} style={dangerBtn}>
              🗑 Delete Selected
            </button>
          </div>

          <div style={dropdown} onClick={()=>setMenuOpen(!menuOpen)}>
            🍽️ Menu {menuOpen ? "▲" : "▼"}
          </div>

          {menuOpen && menu.map(i=>(
            <div key={i.id} style={row}>

              <input
                type="checkbox"
                checked={selectedItems.includes(i.id)}
                onChange={()=>toggleSelect(i.id)}
              />

              <div style={{display:"flex",gap:10}}>
                {i.image && <img src={i.image} style={{width:40,height:40}}/>}
                {i.name} ₹{i.price}
              </div>

              <div style={{display:"flex",gap:10}}>
                <input type="file" onChange={(e)=>replaceImage(i.id,e.target.files[0])}/>
                <button onClick={()=>deleteItem(i.id)} style={dangerBtn}>Delete</button>
              </div>
            </div>
          ))}

        </div>
      )}

    </div>
  )

  function StatCard({title,value}){
    return <div style={statCard}><p>{title}</p><h2>{value}</h2></div>
  }
}

/* 🔥 EXTRA STYLE */

const dropdown={
  marginTop:20,
  padding:12,
  background:"#1e293b",
  borderRadius:10,
  cursor:"pointer",
  fontWeight:"bold"
}

/* 🎨 ULTRA PREMIUM CLEAN NEON UI */

const layout = {
  padding:"32px",
  background:"radial-gradient(circle at top,#020617,#000)",
  color:"#fff",
  minHeight:"100vh"
}

const title = {
  fontSize:30,
  marginBottom:30,
  letterSpacing:1,
  background:"linear-gradient(90deg,#22c55e,#3b82f6)",
  WebkitBackgroundClip:"text",
  color:"transparent"
}

/* STATS */

const statsGrid = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",
  gap:20,
  marginBottom:30
}

const statCard = {
  padding:"22px",
  borderRadius:18,
  background:"rgba(255,255,255,0.03)",
  border:"1px solid rgba(255,255,255,0.08)",
  boxShadow:"0 0 18px rgba(34,197,94,0.35)", // 🔥 ONLY OUTER GLOW
  textAlign:"center"
}

/* FORM */

const formBox = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",
  gap:14,
  marginBottom:30
}

const input = {
  padding:"14px",
  borderRadius:14,
  background:"rgba(255,255,255,0.04)",
  border:"1px solid rgba(255,255,255,0.1)",
  color:"#fff",
  outline:"none",
  fontSize:14
}

/* BUTTON MAIN */

const btn = {
  padding:"14px",
  borderRadius:14,
  background:"transparent",
  border:"1px solid #22c55e",
  color:"#22c55e",
  cursor:"pointer",
  fontWeight:"600",
  letterSpacing:0.5,
  boxShadow:"0 0 18px #22c55e66" // 🔥 OUTER ONLY
}

/* GRID */

const grid = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",
  gap:22,
  marginTop:10
}

/* CARD */

const card = {
  padding:"20px",
  borderRadius:18,
  background:"rgba(255,255,255,0.035)",
  border:"1px solid rgba(255,255,255,0.08)",
  backdropFilter:"blur(12px)",
  boxShadow:"0 0 18px rgba(59,130,246,0.25)",
  transition:"0.3s"
}

/* 🔥 LOGO FIX (FULL SHOW) */

const logo = {
  width:"100%",
  height:"140px",
  objectFit:"contain", // ✅ FULL IMAGE SHOW
  background:"#000",
  borderRadius:12,
  marginBottom:12,
  padding:"6px"
}

/* TEXT */

const actions = {
  display:"flex",
  gap:10,
  marginTop:12
}

/* SMALL BUTTON */

const btnSmall = {
  padding:"6px 12px",
  borderRadius:10,
  background:"transparent",
  border:"1px solid #0ba23d",
  color:"#21930c",
  cursor:"pointer",
  fontSize:13,
  boxShadow:"0 0 6px #3b82f633" // 🔥 VERY SUBTLE
}

/* DANGER */

const dangerBtn = {
  padding:"6px 12px",
  borderRadius:10,
  background:"transparent",
  border:"1px solid #c25608",
  color:"#f9dcd1",
  cursor:"pointer",
  fontSize:13,
  boxShadow:"0 0 14px #eed1d155"
}

/* PANEL */

const panel = {
  marginTop:40,
  padding:"22px",
  borderRadius:18,
  background:"rgba(255,255,255,0.035)",
  border:"1px solid rgba(255,255,255,0.08)",
  backdropFilter:"blur(14px)",
  boxShadow:"0 0 20px rgba(147,51,234,0.25)"
}

/* ROW */

const row = {
  display:"flex",
  justifyContent:"space-between",
  alignItems:"center",
  padding:"12px 14px",
  marginBottom:10,
  borderRadius:12,
  background:"rgba(255,255,255,0.025)",
  border:"1px solid rgba(255,255,255,0.06)"
}