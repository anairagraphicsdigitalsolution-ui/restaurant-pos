"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function AdminPage(){

  const [restaurantId,setRestaurantId] = useState(null)

  const [itemName,setItemName] = useState("")
  const [price,setPrice] = useState("")
  const [category,setCategory] = useState("")

  const [tableInput,setTableInput] = useState("")
  const [roomInput,setRoomInput] = useState("")

  const [logo,setLogo] = useState(null)
  const [logoFile,setLogoFile] = useState(null)

  // ✅ NEW (ONLY ADDITION)
  const [itemImageFile,setItemImageFile] = useState(null)

  const [menu,setMenu] = useState([])

  useEffect(()=>{ init() },[])

  async function init(){

    const { data: userData } = await supabase.auth.getUser()

    if(!userData?.user){
      alert("Login required")
      return
    }

    const { data } = await supabase
      .from("restaurants")
      .select("id")
      .eq("owner_id", userData.user.id)
      .limit(1)

    const rest = data?.[0]

    if(!rest){
      alert("Restaurant not linked")
      return
    }

    setRestaurantId(rest.id)
    loadData(rest.id)
  }

  async function loadData(id){
    const { data } = await supabase
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", id)

    setMenu(data || [])
  }

  // ✅ UPDATED (ONLY CHANGE)
  async function addItem(){

    if(!itemName || !price){
      alert("Fill all fields")
      return
    }

    let imageUrl = null

    if(itemImageFile){
      const ext = itemImageFile.name.split(".").pop()
      const fileName = `item-${Date.now()}.${ext}`

      const { error } = await supabase.storage
        .from("menu-images")
        .upload(fileName, itemImageFile)

      if(error){
        alert("Image Upload Error: " + error.message)
        return
      }

      const { data } = supabase.storage
        .from("menu-images")
        .getPublicUrl(fileName)

      imageUrl = data.publicUrl
    }

    await supabase.from("menu_items").insert([{
      name:itemName,
      price:Number(price),
      category,
      image:imageUrl, // ✅ NEW FIELD
      restaurant_id:restaurantId
    }])

    setItemName("")
    setPrice("")
    setCategory("")
    setItemImageFile(null)

    loadData(restaurantId)
  }

  async function deleteItem(id){
    await supabase.from("order_items").delete().eq("menu_item_id", id)

    await supabase
      .from("menu_items")
      .delete()
      .eq("id", id)

    loadData(restaurantId)
  }

  async function addTable(){
    if(!tableInput) return

    await supabase.from("tables").insert([{
      table_number: tableInput,
      restaurant_id: restaurantId
    }])

    setTableInput("")
  }

  async function addRoom(){
    if(!roomInput) return

    await supabase.from("rooms").insert([{
      room_number: roomInput,
      restaurant_id: restaurantId
    }])

    setRoomInput("")
  }

  function handleLogo(e){
    const file = e.target.files[0]
    if(file){
      setLogoFile(file)
      setLogo(URL.createObjectURL(file))
    }
  }

  // ✅ NEW FUNCTION
  function handleItemImage(e){
    const file = e.target.files[0]
    if(file){
      setItemImageFile(file)
    }
  }

  async function uploadLogo(){

    if(!logoFile){
      alert("Select logo first")
      return
    }

    if(!restaurantId){
      alert("Restaurant not found")
      return
    }

    const ext = logoFile.name.split(".").pop()
    const fileName = `logo-${restaurantId}-${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(fileName, logoFile, { upsert: true })

    if(uploadError){
      alert("Upload Error: " + uploadError.message)
      return
    }

    const { data } = supabase.storage
      .from("logos")
      .getPublicUrl(fileName)

    const publicUrl = data.publicUrl

    const { error: dbError } = await supabase
      .from("restaurants")
      .update({ logo: publicUrl })
      .eq("id", restaurantId)

    if(dbError){
      alert("DB Error: " + dbError.message)
      return
    }

    setLogo(publicUrl)

    alert("Logo uploaded successfully ✅")
  }

  const groupedMenu = menu.reduce((acc,item)=>{
    const cat=item.category||"Other"
    if(!acc[cat]) acc[cat]=[]
    acc[cat].push(item)
    return acc
  },{})

  return (
    <div style={layout}>

      <h1 style={title}>⚡ Restaurant Admin Panel</h1>

      <div style={topGrid}>

        <Card title="Add Item" glow="#22c55e">
          <Input value={itemName} set={setItemName} placeholder="Item Name"/>
          <Input value={price} set={setPrice} placeholder="Price"/>
          <Input value={category} set={setCategory} placeholder="Category"/>

          {/* ✅ ONLY NEW LINE */}
          <input type="file" onChange={handleItemImage} style={fileInput}/>

          <Button onClick={addItem}>Add Item</Button>
        </Card>

        <Card title="Add Table" glow="#3b82f6">
          <Input value={tableInput} set={setTableInput} placeholder="Table No"/>
          <Button onClick={addTable}>Add Table</Button>
        </Card>

        <Card title="Add Room" glow="#9333ea">
          <Input value={roomInput} set={setRoomInput} placeholder="Room No"/>
          <Button onClick={addRoom}>Add Room</Button>
        </Card>

        <Card title="Upload Logo" glow="#ef4444">
          <input type="file" onChange={handleLogo} style={fileInput}/>
          {logo && <img src={logo} style={logoStyle}/>}

          <button onClick={uploadLogo} style={uploadBtn}>
            Upload Logo
          </button>
        </Card>

      </div>

      <div style={glassBox}>
        <h2 style={{marginBottom:10}}>📋 Menu</h2>

        {Object.entries(groupedMenu).map(([cat,items])=>(
          <div key={cat} style={{marginBottom:20}}>

            <h3 style={{color:"#22c55e",marginBottom:10}}>{cat}</h3>

            {items.map((i)=>(
              <div key={i.id} style={menuCard}>
                <div>
                  <strong>{i.name}</strong>
                  <div style={{opacity:.6}}>₹{i.price}</div>
                </div>

                <button onClick={()=>deleteItem(i.id)} style={deleteBtn}>
                  Delete
                </button>
              </div>
            ))}

          </div>
        ))}
      </div>

    </div>
  )
}

/* 🎨 UI SAME */

const layout={
  padding:30,
  background:"linear-gradient(180deg,#020617,#000)",
  color:"#fff",
  minHeight:"100vh"
}

const title={
  textAlign:"center",
  fontSize:28,
  marginBottom:25,
  color:"#22c55e"
}

const topGrid={
  display:"grid",
  gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",
  gap:20,
  marginBottom:25
}

const glassBox={
  padding:20,
  borderRadius:16,
  background:"rgba(255,255,255,0.04)",
  backdropFilter:"blur(10px)",
  border:"1px solid rgba(255,255,255,0.08)"
}

const menuCard={
  display:"flex",
  justifyContent:"space-between",
  alignItems:"center",
  padding:14,
  borderRadius:10,
  marginBottom:10,
  background:"rgba(255,255,255,0.04)",
  border:"1px solid rgba(255,255,255,0.06)"
}

const deleteBtn={
  background:"rgba(239,68,68,0.1)",
  border:"1px solid #ef4444",
  padding:"6px 12px",
  borderRadius:8,
  color:"#ef4444",
  cursor:"pointer"
}

const logoStyle={
  width:"100%",
  marginTop:10,
  borderRadius:10
}

const fileInput={
  width:"100%",
  padding:10,
  borderRadius:10,
  background:"#020617",
  color:"#fff",
  border:"1px solid #1e293b",
  boxSizing:"border-box"
}

const uploadBtn={
  marginTop:10,
  padding:10,
  width:"100%",
  borderRadius:10,
  background:"#ef4444",
  color:"#fff",
  border:"none",
  cursor:"pointer"
}

const Card=({title,children,glow})=>(
  <div style={{
    padding:20,
    borderRadius:16,
    background:"rgba(255,255,255,0.04)",
    backdropFilter:"blur(12px)",
    border:"1px solid rgba(255,255,255,0.08)",
    boxShadow:`0 0 10px ${glow}20`
  }}>
    <h3 style={{color:glow,marginBottom:12}}>
      {title}
    </h3>
    {children}
  </div>
)

const Input=({value,set,placeholder})=>(
  <input
    value={value}
    onChange={e=>set(e.target.value)}
    placeholder={placeholder}
    style={{
      width:"100%",
      padding:"12px 14px",
      marginTop:8,
      borderRadius:12,
      background:"#020617",
      border:"1px solid #1e293b",
      color:"#fff",
      fontSize:14,
      outline:"none",
      boxSizing:"border-box"
    }}
  />
)

const Button=({children,onClick})=>(
  <button
    onClick={onClick}
    style={{
      marginTop:12,
      padding:12,
      borderRadius:12,
      border:"1px solid rgba(34,197,94,0.4)",
      background:"rgba(34,197,94,0.08)",
      color:"#22c55e",
      width:"100%",
      cursor:"pointer",
      fontWeight:"600",
      boxSizing:"border-box"
    }}
    onMouseEnter={(e)=>{
      e.target.style.background="#22c55e"
      e.target.style.color="#000"
    }}
    onMouseLeave={(e)=>{
      e.target.style.background="rgba(34,197,94,0.08)"
      e.target.style.color="#22c55e"
    }}
  >
    {children}
  </button>
)