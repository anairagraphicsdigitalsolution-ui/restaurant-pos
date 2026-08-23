"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { CSSProperties } from "react"

type MenuItem = {
  id: string
  name: string
  price: number
  category: string
  image?: string
}

export default function AdminPage(){

  const [restaurantId,setRestaurantId] = useState<string | null>(null)

  const [itemName,setItemName] = useState("")
  const [price,setPrice] = useState("")
  const [category,setCategory] = useState("")
  const [newCategory,setNewCategory] = useState("")
  const [categoryMode,setCategoryMode] = useState<"select" | "new">("select")
  const [description,setDescription] = useState("")
  const [editingId,setEditingId] = useState<string | null>(null)

const [openingTime,setOpeningTime]=useState("")

const [cuisine,setCuisine]=useState("")

const [restaurantDescription,setRestaurantDescription]=useState("")

  const [tableInput,setTableInput] = useState("")
  const [roomInput,setRoomInput] = useState("")

  const [logo,setLogo] = useState<string | null>(null)
  const [logoFile,setLogoFile] = useState<File | null>(null)

  const [itemImageFile,setItemImageFile] = useState<File | null>(null)

  const [menu,setMenu] = useState<MenuItem[]>([])
  const [openCategory,setOpenCategory] =
useState<string | null>(null)
  const [bannerFiles,setBannerFiles] =
         useState<File[]>([])

   const [bannerPreview,setBannerPreview] =
   useState<string[]>([])
   const [banners, setBanners] = useState<any[]>([])

  useEffect(()=>{ init() },[])

  async function init(){

    const { data: userData } = await supabase.auth.getUser()

    if(!userData?.user){
      alert("Login required")
      return
    }

    // Resolve the restaurant from the authenticated profile first.
    // Legacy accounts may have restaurants.owner_id unset, while
    // profiles.restaurant_id is the authoritative tenant link.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("restaurant_id, role")
      .eq("id", userData.user.id)
      .maybeSingle()

    if (profileError) {
      console.error("Unable to load profile:", profileError)
    }

    const metadataRestaurantId =
      userData.user.user_metadata?.restaurant_id ||
      userData.user.app_metadata?.restaurant_id ||
      null

    const resolvedRestaurantId =
      profile?.restaurant_id || metadataRestaurantId || null

    let rest = null

    if (resolvedRestaurantId) {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", resolvedRestaurantId)
        .maybeSingle()

      if (error) {
        console.error("Unable to load restaurant:", error)
      }
      rest = data || null
    }

    // Final legacy fallback: owner_id.
    if (!rest) {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("owner_id", userData.user.id)
        .limit(1)

      if (error) {
        console.error("Owner restaurant lookup failed:", error)
      }
      rest = data?.[0] || null
    }

    if(!rest){
      alert("Restaurant not linked")
      return
    }

    setRestaurantId(rest.id)
    setOpeningTime(rest.opening_time || "")

setCuisine(rest.cuisine || "")

setRestaurantDescription(rest.description || "")
    loadData(rest.id)
    
  }

  async function loadData(id: string){

  const { data } = await supabase
    .from("menu_items")
    .select("*")
    .eq("restaurant_id", id)

  setMenu(data || [])

  const { data: bannerData } = await supabase
    .from("restaurant_banners")
    .select("*")
    .eq("restaurant_id", id)
     setBanners(bannerData || [])
}

  async function addItem(){

    if(!itemName || !price || !effectiveCategory || !restaurantId){
      alert("Fill all fields")
      return
    }

    let imageUrl: string | null = null

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

    if(editingId){

await supabase

.from("menu_items")

.update({

name:itemName,

price:Number(price),

category: effectiveCategory,

description,

image:imageUrl || undefined

})

.eq("id",editingId)

}else{

await supabase.from("menu_items").insert([{

name:itemName,

price:Number(price),

category: effectiveCategory,

description,

image:imageUrl,

restaurant_id:restaurantId

}])

}

    setItemName("")
    setPrice("")
    setCategory("")
    setNewCategory("")
    setCategoryMode("select")
    setDescription("")
    setEditingId(null)
    setItemImageFile(null)

    loadData(restaurantId)
  }
  async function editItem(item: MenuItem){

setEditingId(item.id)

setItemName(item.name)

setPrice(String(item.price))

setCategory(item.category)

setDescription((item as any).description || "")
}

  async function deleteItem(id: string){

    if(!restaurantId) return

    await supabase.from("order_items").delete().eq("menu_item_id", id)

    await supabase
      .from("menu_items")
      .delete()
      .eq("id", id)

    loadData(restaurantId)
  }

  async function addTable(){
    if(!tableInput || !restaurantId) return
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if(!token) throw new Error("Session expired. Please login again.")
      const response = await fetch("/api/dashboard-add-table", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ table_number: Number(tableInput) })
      })
      const result = await response.json()
      if(!response.ok || !result?.success) throw new Error(result?.error || "Unable to add table")
      setTableInput("")
      loadData(restaurantId)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to add table"
      alert(message)
    }
  }

  async function addRoom(){
    if(!roomInput || !restaurantId) return
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if(!token) throw new Error("Session expired. Please login again.")
      const response = await fetch("/api/dashboard-add-room", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ room_number: Number(roomInput) })
      })
      const result = await response.json()
      if(!response.ok || !result?.success) throw new Error(result?.error || "Unable to add room")
      setRoomInput("")
      loadData(restaurantId)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to add room"
      alert(message)
    }
  }

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>){
    const file = e.target.files?.[0]
    if(file){
      setLogoFile(file)
      setLogo(URL.createObjectURL(file))
    }
  }
  function handleBanners(
  e: React.ChangeEvent<HTMLInputElement>
){

  const files =
    Array.from(e.target.files || [])

  setBannerFiles(files)

  setBannerPreview(
    files.map(file =>
      URL.createObjectURL(file)
    )
  )
}

  function handleItemImage(e: React.ChangeEvent<HTMLInputElement>){
    const file = e.target.files?.[0]
    if(file){
      setItemImageFile(file)
    }
  }
async function saveRestaurantInfo(){

if(!restaurantId)return

await supabase

.from("restaurants")

.update({

opening_time:openingTime,

cuisine,

description:restaurantDescription

})

.eq("id",restaurantId)

alert("Restaurant Updated ✅")

}

  async function uploadLogo(){

    if(!logoFile || !restaurantId){
      alert("Missing data")
      return
    }

    const ext = logoFile.name.split(".").pop()
    const fileName = `logo-${restaurantId}-${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(fileName, logoFile, { upsert: true })

    if(uploadError){
      alert(uploadError.message)
      return
    }

    const { data } = supabase.storage
      .from("logos")
      .getPublicUrl(fileName)

    const publicUrl = data.publicUrl

    await supabase
      .from("restaurants")
      .update({ logo: publicUrl })
      .eq("id", restaurantId)

    setLogo(publicUrl)

    alert("Logo uploaded ✅")
  }
  async function uploadBanners(){

  if(
    !bannerFiles.length ||
    !restaurantId
  ){
    alert("Missing data")
    return
  }

  for(const file of bannerFiles){

    const ext =
      file.name.split(".").pop()

    const fileName =
      `banner-${Date.now()}-${Math.random()}.${ext}`

    const { error } =
      await supabase.storage
      .from("restaurant-covers")
      .upload(fileName,file)

    if(error){
      alert(error.message)
      return
    }

    const { data } =
      supabase.storage
      .from("restaurant-covers")
      .getPublicUrl(fileName)

    const { data: insertedData, error: insertError } =
  await supabase
    .from("restaurant_banners")
    .insert({
      restaurant_id: restaurantId,
      image_url: data.publicUrl
    })
    .select()

console.log("INSERTED:", insertedData)
console.log("INSERT ERROR:", insertError)

if (insertError) {
  alert(insertError.message)
  return
}
  }
  loadData(restaurantId)
  alert("Banners Uploaded ✅")
}


  const foodCategories = Array.from(new Set([
    ...menu.map((item) => (item.category || "").trim()).filter(Boolean),
    ...(category.trim() ? [category.trim()] : []),
  ])).sort((a, b) => a.localeCompare(b))

  const selectedCategoryValue = categoryMode === "new" ? "__new__" : category

  function handleCategoryChange(value: string) {
    if (value === "__new__") {
      setCategoryMode("new")
      setCategory("")
      return
    }
    setCategoryMode("select")
    setCategory(value)
    setNewCategory("")
  }

  const effectiveCategory = categoryMode === "new" ? newCategory.trim() : category.trim()

  const groupedMenu = menu.reduce<Record<string, MenuItem[]>>((acc,item)=>{
    const cat=item.category||"Other"
    if(!acc[cat]) acc[cat]=[]
    acc[cat].push(item)
    return acc
  },{})

  return (
    <div style={layout} className="admin-page">

      <div
  style={{
    marginBottom:30,
    padding:30,
    borderRadius:28,
    background:
      "linear-gradient(135deg,var(--surface),var(--surface-2))",
    border:
      "1px solid rgba(var(--primary-rgb),.2)",
    boxShadow:
      "0 25px 60px rgba(0,0,0,.4)"
  }}
>
  <div
    style={{
      color:"var(--primary)",
      fontSize:13,
      letterSpacing:2,
      textTransform:"uppercase"
    }}
  >
    Restaurant Management
  </div>

  <h1
    style={{
      margin:"10px 0",
      fontSize:42,
      color:"#fff"
    }}
  >
    Admin Control Center
  </h1>

  <p
    style={{
      color:"var(--muted)",
      margin:0
    }}
  >
    Manage menu, tables, rooms, branding and banners.
  </p>
</div>
<div
  style={{
    display:"grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(220px,1fr))",
    gap:20,
    marginBottom:25
  }}
>
  <div style={statCard}>
    <h2>{menu.length}</h2>
    <p>Menu Items</p>
  </div>

  <div style={statCard}>
    <h2>{Object.keys(groupedMenu).length}</h2>
    <p>Categories</p>
  </div>

  <div style={statCard}>
    <h2>{banners.length}</h2>
    <p>Banners</p>
  </div>
</div>

      <div style={topGrid}>

        <Card title="Add Item" glow="var(--success)">
          
          <Input value={itemName} set={setItemName} placeholder="Item Name"/>
          <Input value={price} set={setPrice} placeholder="Price"/>
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:12,fontWeight:800,color:"var(--muted)",marginBottom:7}}>Food Category</label>
            <select
              value={selectedCategoryValue}
              onChange={(e)=>handleCategoryChange(e.target.value)}
              style={{width:"100%",padding:12,borderRadius:12,background:"var(--surface-2)",color:"#fff",border:"1px solid rgba(var(--primary-rgb),.2)",outline:"none"}}
            >
              <option value="">Select category</option>
              {foodCategories.map((cat)=><option key={cat} value={cat}>{cat}</option>)}
              <option value="__new__">＋ Create new category</option>
            </select>
            {categoryMode === "new" && (
              <input
                value={newCategory}
                onChange={(e)=>setNewCategory(e.target.value)}
                placeholder="Enter new food category"
                autoFocus
                style={{width:"100%",padding:12,borderRadius:12,marginTop:8,background:"var(--surface-2)",color:"#fff",border:"1px solid rgba(var(--primary-rgb),.2)",outline:"none"}}
              />
            )}
            {!!foodCategories.length && categoryMode !== "new" && (
              <small style={{display:"block",marginTop:6,color:"var(--muted)"}}>Existing categories are saved from your menu and can be selected again.</small>
            )}
          </div>
          <textarea

value={description}

onChange={(e)=>setDescription(e.target.value)}

placeholder="Food Description"

style={{
width:"100%",
padding:12,
borderRadius:12,
marginBottom:12
}}
/>

          <input type="file" onChange={handleItemImage} style={fileInput}/>

          <Button onClick={addItem}>
{editingId ? "Update Item" : "Add Item"}
</Button>
        </Card>

        <Card title="Add Table" glow="var(--info)">
          <Input value={tableInput} set={setTableInput} placeholder="Table No"/>
          <Button onClick={addTable}>Add Table</Button>
        </Card>

        <Card title="Add Room" glow="var(--accent)">
          <Input value={roomInput} set={setRoomInput} placeholder="Room No"/>
          <Button onClick={addRoom}>Add Room</Button>
        </Card>

        <Card title="Upload Logo" glow="var(--danger)">
          <Card title="Restaurant Details" glow="#06b6d4">

<Input

value={openingTime}

set={setOpeningTime}

placeholder="Opening Time"
/>

<Input

value={cuisine}

set={setCuisine}

placeholder="Cuisine"
/>

<textarea

value={restaurantDescription}

onChange={(e)=>
setRestaurantDescription(e.target.value)
}

placeholder="Restaurant Description"

style={{
width:"100%",
padding:12,
borderRadius:12,
marginBottom:12
}}
/>

<Button
onClick={saveRestaurantInfo}
>
Save Details
</Button>

</Card>
          <input type="file" onChange={handleLogo} style={fileInput}/>
          {logo && <img src={logo} style={logoStyle}/>}

          <button
  onClick={uploadLogo}
  style={uploadBtn}
  onMouseEnter={(e)=>{
    e.currentTarget.style.background="var(--primary)"
    e.currentTarget.style.color="var(--surface)"
  }}
  onMouseLeave={(e)=>{
    e.currentTarget.style.background="transparent"
    e.currentTarget.style.color="var(--primary)"
  }}
>
  Upload Logo
</button>
        </Card>
        <Card
  title="Upload Banners"
  glow="var(--primary)"
>
  <input
    type="file"
    multiple
    onChange={handleBanners}
    style={fileInput}
  />

  <div
    style={{
      display:"grid",
      gridTemplateColumns:
      "repeat(auto-fill,minmax(120px,1fr))",
      gap:10,
      marginTop:10
    }}
  >

    {bannerPreview.map(img => (

      <img
        key={img}
        src={img}
        style={{
          width:"100%",
          height:90,
          objectFit:"cover",
          borderRadius:10
        }}
      />

    ))}

  </div>

  <button
  onClick={uploadBanners}
  style={uploadBtn}
  onMouseEnter={(e)=>{
    e.currentTarget.style.background="var(--primary)"
    e.currentTarget.style.color="var(--surface)"
  }}
  onMouseLeave={(e)=>{
    e.currentTarget.style.background="transparent"
    e.currentTarget.style.color="var(--primary)"
  }}
>
  Upload Banners
</button>

</Card>


      </div>

      <div style={glassBox}>
        <h2 style={{marginBottom:10}}>📋 Menu</h2>

        {Object.entries(groupedMenu).map(([cat,items])=>(
          <div key={cat} style={{marginBottom:20}}>

            <h3
  onClick={()=>
    setOpenCategory(
      openCategory===cat
      ? null
      : cat
    )
  }
  style={{
    color:"var(--primary)",
    fontSize:20,
    marginBottom:14,
    borderBottom:
      "1px solid rgba(var(--primary-rgb),.15)",
    paddingBottom:10,

    cursor:"pointer",

    display:"flex",
    justifyContent:"space-between",
    alignItems:"center"
  }}
>
  <span>🍽 {cat}</span>

  <span>
    {openCategory===cat ? "−" : "+"}
  </span>
</h3>

            {openCategory===cat && items.map((i)=>(
              <div key={i.id} style={menuCard}>
                <div
  style={{
    display:"flex",
    alignItems:"center",
    gap:12
  }}
>
  {i.image && (
    <img
      src={i.image}
      alt=""
      style={{
        width:80,
height:80,
borderRadius:18,
objectFit:"cover",

border:
  "2px solid rgba(var(--primary-rgb),.35)",

boxShadow:
  "0 12px 30px rgba(0,0,0,.4)"
      }}
    />
  )}

  <div>
    <strong>{i.name}</strong>

    <div
style={{
opacity:.7,
marginTop:4
}}
>

₹{i.price}

</div>

<div
style={{
fontSize:13,
opacity:.7,
marginTop:6
}}
>

{(i as any).description}

</div>
  </div>
                </div>

                <div
style={{
display:"flex",
gap:10
}}
>

<button

onClick={()=>editItem(i)}

style={{
background:"linear-gradient(135deg,var(--surface),var(--surface-2))",
border:"1px solid rgba(var(--primary-rgb),.35)",
color:"#fff",
padding:"10px 18px",
borderRadius:12,
cursor:"pointer",
fontWeight:"bold",
boxShadow:"0 10px 25px rgba(0,0,0,.35)",
transition:"all .3s"
}}

>

Edit

</button>

<button

onClick={()=>deleteItem(i.id)}

style={deleteBtn}

>

Delete

</button>

</div>
              </div>
            ))}

          </div>
        ))}
      </div>

    </div>
  )
}

/* 🎨 UI SAME */

const layout = {
  padding:30,
  background:
    "linear-gradient(135deg,var(--background),var(--surface-2),var(--background))",
  minHeight:"100vh",
  color:"#fff"
}

const topGrid: CSSProperties = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",
  gap:20,
  marginBottom:25
}


const glassBox = {
  padding:25,
  borderRadius:24,

  background:
    "rgba(var(--surface-2-rgb),.85)",

  border:
    "1px solid rgba(var(--primary-rgb),.15)",

  backdropFilter:"blur(20px)",

  boxShadow:
    "0 20px 40px rgba(0,0,0,.35)"
}

const menuCard: CSSProperties = {
  display:"flex",
  justifyContent:"space-between",
  alignItems:"center",

  padding:18,

  borderRadius:18,

  marginBottom:14,

  background:
    "linear-gradient(135deg,var(--surface),var(--surface-2))",

  border:
    "1px solid rgba(var(--primary-rgb),.12)",

  boxShadow:
    "0 12px 25px rgba(0,0,0,.25)"
}

const deleteBtn={

background:"linear-gradient(135deg,color-mix(in srgb, var(--danger) 55%, var(--surface)),var(--danger))",

border:"1px solid rgba(248,113,113,.35)",

color:"#fff",

padding:"10px 18px",

borderRadius:12,

cursor:"pointer",

fontWeight:"bold",

boxShadow:"0 10px 25px rgba(0,0,0,.35)",

transition:"all .3s"

}

const logoStyle: CSSProperties = {
  width:"100%",
  marginTop:10,
  borderRadius:10
}

const fileInput: CSSProperties = {
  width:"100%",
  padding:10,
  borderRadius:10,
  background:"var(--background)",
  color:"#fff",
  border:"1px solid var(--surface-2)",
  boxSizing:"border-box"
}

const uploadBtn: CSSProperties = {
  marginTop:12,
  padding:12,
  width:"100%",
  borderRadius:12,

  background:"transparent",

  color:"var(--primary)",

  border:"1px solid rgba(var(--primary-rgb),.45)",

  cursor:"pointer",

  fontWeight:600,

  transition:"all .25s ease",

  boxSizing:"border-box"
}

const Card = ({title,children,glow}:{ 
  title:string, 
  children: React.ReactNode, 
  glow:string 
}) => (
 <div
  style={{
    padding:24,
    borderRadius:24,

    background:
      "rgba(var(--surface-2-rgb),.85)",

    border: `1px solid color-mix(in srgb, ${glow} 40%, transparent)`,

    backdropFilter:"blur(20px)",

    boxShadow:
      "0 20px 40px rgba(0,0,0,.35),"
  }}
>
    <h3
  style={{
    color:"var(--primary)",
    marginBottom:16,
    fontSize:18
  }}
>
  {title}
</h3>
    {children}
  </div>
)

const Input=({value,set,placeholder}:{ 
  value:string, 
  set:(v:string)=>void, 
  placeholder:string 
})=>(
  <input
    value={value}
    onChange={e=>set(e.target.value)}
    placeholder={placeholder}
    style={{
      width:"100%",
      padding:"12px 14px",
      marginTop:8,
      borderRadius:12,
      background:"var(--background)",
      border:"1px solid var(--surface-2)",
      color:"#fff",
      fontSize:14,
      outline:"none",
      boxSizing:"border-box"
    }}
  />
)

const Button = ({children,onClick}:{
  children: React.ReactNode,
  onClick: ()=>void
})=>(
  <button
    onClick={onClick}
    style={{
      marginTop:12,
      padding:12,
      borderRadius:12,
      border:"1px solid rgba(233, 191, 5, 0.77)",
      background:
      "transparent",
      color:"var(--primary)",
      width:"100%",
      cursor:"pointer",
      fontWeight:"600",
      boxSizing:"border-box"
      
      
    }}
    onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>)=>{
  const target = e.currentTarget
  target.style.background = "var(--primary)"
  target.style.color = "#000"
}}
    onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>)=>{
  const target = e.currentTarget
  target.style.background = "transparent"
  target.style.color = "var(--primary)"
}}
  >
    {children}
  </button>
)
const statCard: CSSProperties = {
  padding:20,
  borderRadius:20,
  background:
    "linear-gradient(135deg,var(--surface),var(--surface-2))",
  border:
    "1px solid rgba(var(--primary-rgb),.2)",
  textAlign:"center"
}
