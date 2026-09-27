"use client"

import { useEffect, useState } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { useAuth } from "@/components/AuthProvider"
import type { CSSProperties } from "react"

type MenuItem = {
  id: string
  name: string
  price: number
  category: string
  image?: string
}

export default function AdminPage(){

  const { user: authUser, restaurantId: authRestaurantId, loading: authLoading } = useAuth()
  const [restaurantId,setRestaurantId] = useState<string | null>(null)

  const [itemName,setItemName] = useState("")
  const [price,setPrice] = useState("")
  const [category,setCategory] = useState("")
  const [newCategory,setNewCategory] = useState("")
  const [categoryMode,setCategoryMode] = useState<"select" | "new">("select")
  const [description,setDescription] = useState("")
  const [editingId,setEditingId] = useState<string | null>(null)
  const [itemVariants,setItemVariants] = useState<Array<{id?:string,name:string,price_delta:string,active?:boolean}>>([])

const [openingTime,setOpeningTime]=useState("")

const [cuisine,setCuisine]=useState("")

const [restaurantDescription,setRestaurantDescription]=useState("")

  const [tableInput,setTableInput] = useState("")
  const [roomInput,setRoomInput] = useState("")
  const [floors,setFloors] = useState<Array<{id:string,name:string,display_order:number,active:boolean}>>([])
  const [tables,setTables] = useState<any[]>([])
  const [rooms,setRooms] = useState<any[]>([])
  const [adminSection,setAdminSection] = useState<"overview" | "spaces" | "menu" | "branding">("overview")
  const [spaceSearch,setSpaceSearch] = useState("")
  const [expandedFloor,setExpandedFloor] = useState<string | null>(null)
  const [floorInput,setFloorInput] = useState("")
  const [selectedFloor,setSelectedFloor] = useState("")
  const [floorLoading,setFloorLoading] = useState(false)

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

  useEffect(()=>{
    if (authLoading) return
    init()
  },[authLoading, authUser?.id, authRestaurantId])

  async function init(){

    // AuthProvider owns the single browser auth bootstrap. Do not call
    // auth.getUser() again here: concurrent getUser() calls can contend for
    // Supabase's persisted-session navigator lock and cause:
    // "Lock ... was released because another request stole it".
    const user = authUser

    if(!user){
      alert("Login required")
      return
    }

    // Resolve the restaurant from the authenticated profile first.
    // Legacy accounts may have restaurants.owner_id unset, while
    // profiles.restaurant_id is the authoritative tenant link.
    const { data: profile, error: profileError } = await supabaseCloud
      .from("profiles")
      .select("restaurant_id, role")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      console.error("Unable to load profile:", profileError)
    }

    const metadataRestaurantId =
      user.user_metadata?.restaurant_id ||
      user.app_metadata?.restaurant_id ||
      null

    const resolvedRestaurantId =
      profile?.restaurant_id || metadataRestaurantId || null

    let rest = null

    if (resolvedRestaurantId) {
      const { data, error } = await supabaseCloud
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
      const { data, error } = await supabaseCloud
        .from("restaurants")
        .select("*")
        .eq("owner_id", user.id)
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
    const [{data: menuData},{data: bannerData},{data: restData},{data: floorData},{data: tableData},{data: roomData}] = await Promise.all([
      supabaseCloud.from("menu_items").select("*").eq("restaurant_id", id),
      supabaseCloud.from("restaurant_banners").select("*").eq("restaurant_id", id),
      supabaseCloud.from("restaurants").select("*").eq("id", id).maybeSingle(),
      supabaseCloud.from("floors").select("id,name,display_order,active").eq("restaurant_id", id).order("display_order").order("name"),
      supabaseCloud.from("tables").select("id,table_number,floor,restaurant_id").eq("restaurant_id", id).order("table_number"),
      supabaseCloud.from("rooms").select("id,room_number,floor,restaurant_id").eq("restaurant_id", id).order("room_number"),
    ])
    if (restData) {
      setOpeningTime(restData.opening_time || "")
      setCuisine(restData.cuisine || "")
      setRestaurantDescription(restData.description || "")
      setLogo(restData.logo || null)
    }
    setMenu(menuData || [])
    setBanners(bannerData || [])
    setFloors(floorData || [])
    setTables(tableData || [])
    setRooms(roomData || [])
  }

  async function saveItemVariants(itemId: string){
    const cleaned = itemVariants.map(v=>({id:v.id,name:String(v.name||"").trim(),price_delta:Number(v.price_delta||0),active:v.active!==false})).filter(v=>v.name)
    const { data: existing } = await supabaseCloud.from("menu_variants").select("id").eq("menu_item_id",itemId).eq("restaurant_id",restaurantId)
    const keepIds = cleaned.filter(v=>v.id).map(v=>v.id)
    const removeIds = (existing||[]).map(v=>v.id).filter(id=>!keepIds.includes(id))
    if(removeIds.length){ const {error}=await supabaseCloud.from("menu_variants").delete().in("id",removeIds); if(error) throw error }
    const inserts = cleaned.filter(v=>!v.id).map(v=>({restaurant_id:restaurantId,menu_item_id:itemId,name:v.name,price_delta:v.price_delta,active:v.active}))
    if(inserts.length){ const {error}=await supabaseCloud.from("menu_variants").insert(inserts); if(error) throw error }
    for(const v of cleaned.filter(v=>v.id)){
      const {error}=await supabaseCloud.from("menu_variants").update({name:v.name,price_delta:v.price_delta,active:v.active}).eq("id",v.id).eq("menu_item_id",itemId).eq("restaurant_id",restaurantId)
      if(error) throw error
    }
  }

  async function addItem(){
    if(!itemName || !price || !effectiveCategory || !restaurantId){ alert("Fill all fields"); return }
    let imageUrl: string | null = null
    if(itemImageFile){
      const ext=itemImageFile.name.split(".").pop(); const fileName=`item-${Date.now()}.${ext}`
      const {error}=await supabaseCloud.storage.from("menu-images").upload(fileName,itemImageFile)
      if(error){alert("Image Upload Error: "+error.message);return}
      const {data}=supabaseCloud.storage.from("menu-images").getPublicUrl(fileName); imageUrl=data.publicUrl
    }
    let itemId=editingId
    if(editingId){
      const {error}=await supabaseCloud.from("menu_items").update({name:itemName,price:Number(price),category:effectiveCategory,description,image:imageUrl || undefined}).eq("id",editingId).eq("restaurant_id",restaurantId)
      if(error){alert(error.message);return}
    }else{
      const {data,error}=await supabaseCloud.from("menu_items").insert([{name:itemName,price:Number(price),category:effectiveCategory,description,image:imageUrl,restaurant_id:restaurantId}]).select("id").single()
      if(error){alert(error.message);return}; itemId=data.id
    }
    try{ if(itemId) await saveItemVariants(itemId) }catch(error){ alert(error instanceof Error ? error.message : "Unable to save variants"); return }
    setItemName("");setPrice("");setCategory("");setNewCategory("");setCategoryMode("select");setDescription("");setEditingId(null);setItemImageFile(null);setItemVariants([])
    loadData(restaurantId)
  }
  async function editItem(item: MenuItem){

setEditingId(item.id)

setItemName(item.name)

setPrice(String(item.price))

setCategory(item.category)

setDescription((item as any).description || "")
    const { data: variantData } = await supabaseCloud.from("menu_variants").select("id,name,price_delta,active").eq("menu_item_id",item.id).eq("restaurant_id",restaurantId).order("created_at")
    setItemVariants((variantData || []).map(v=>({id:v.id,name:v.name,price_delta:String(v.price_delta ?? 0),active:v.active!==false})))
}

  async function deleteItem(id: string){

    if(!restaurantId) return

    try {
      const { error: orderError } = await supabaseCloud.from("order_items").delete().eq("menu_item_id", id)
    if(orderError){ alert(orderError.message); return }
    const { error } = await supabaseCloud.from("menu_items").delete().eq("id", id).eq("restaurant_id", restaurantId)
    if(error){ alert(error.message); return }
    loadData(restaurantId)
    } catch(error){
      alert(error instanceof Error ? error.message : "Unable to delete menu item")
    }
  }

  async function floorRequest(method: "POST" | "PATCH" | "DELETE", body: any){
    if(!restaurantId) return
    const { data: sessionData } = await supabaseCloud.auth.getSession()
    const token = sessionData?.session?.access_token
    if(!token) throw new Error("Session expired. Please login again.")
    const response = await fetch("/api/dashboard-floors", {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
    const result = await response.json()
    if(!response.ok || !result?.success) throw new Error(result?.error || "Floor operation failed")
    return result
  }

  async function addFloor(){
    const name = floorInput.trim()
    if(!name || !restaurantId) return
    setFloorLoading(true)
    try{
      await floorRequest("POST", { name })
      setFloorInput("")
      await loadData(restaurantId)
    }catch(error){
      alert(error instanceof Error ? error.message : "Unable to add floor")
    }finally{ setFloorLoading(false) }
  }

  async function renameFloor(floor: {id:string,name:string}){
    const name = window.prompt("Floor name", floor.name)?.trim()
    if(!name || name === floor.name) return
    setFloorLoading(true)
    if(!restaurantId){ alert("Restaurant ID is missing"); return }
    try{ await floorRequest("PATCH", { id: floor.id, name }); await loadData(restaurantId) }
    catch(error){ alert(error instanceof Error ? error.message : "Unable to rename floor") }
    finally{ setFloorLoading(false) }
  }

  async function deleteFloor(floor: {id:string,name:string}){
    if(!window.confirm(`Delete "${floor.name}"? Tables assigned to this floor must be moved/deleted first.`)) return
    setFloorLoading(true)
    if(!restaurantId){ alert("Restaurant ID is missing"); return }
    try{ await floorRequest("DELETE", { id: floor.id }); await loadData(restaurantId) }
    catch(error){ alert(error instanceof Error ? error.message : "Unable to delete floor") }
    finally{ setFloorLoading(false) }
  }

  async function addTable(){
    if(!tableInput || !restaurantId) return
    try {
      const { data: sessionData } = await supabaseCloud.auth.getSession()
      const token = sessionData?.session?.access_token
      if(!token) throw new Error("Session expired. Please login again.")
      const response = await fetch("/api/dashboard-add-table", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ table_number: Number(tableInput), floor: selectedFloor })
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
      const { data: sessionData } = await supabaseCloud.auth.getSession()
      const token = sessionData?.session?.access_token
      if(!token) throw new Error("Session expired. Please login again.")
      const response = await fetch("/api/dashboard-add-room", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ room_number: Number(roomInput), floor: selectedFloor })
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

try {
  const { error } = await supabaseCloud.from("restaurants").update({opening_time:openingTime,cuisine,description:restaurantDescription}).eq("id",restaurantId)
  if(error){ alert(error.message); return }
  alert("Restaurant Updated ✅")
} catch(error){
  alert(error instanceof Error ? error.message : "Unable to update restaurant")
}

}

  async function uploadLogo(){

    if(!logoFile || !restaurantId){
      alert("Missing data")
      return
    }

    const ext = logoFile.name.split(".").pop()
    const fileName = `logo-${restaurantId}-${Date.now()}.${ext}`

    const { error: uploadError } = await supabaseCloud.storage
      .from("logos")
      .upload(fileName, logoFile, { upsert: true })

    if(uploadError){
      alert(uploadError.message)
      return
    }

    const { data } = supabaseCloud.storage
      .from("logos")
      .getPublicUrl(fileName)

    const publicUrl = data.publicUrl

    const { error: logoError } = await supabaseCloud.from("restaurants").update({ logo: publicUrl }).eq("id", restaurantId)
    if(logoError){ alert(logoError.message); return }

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

  for(const [index, file] of bannerFiles.entries()){

    const ext =
      file.name.split(".").pop()

    const fileName =
      `banner-${Date.now()}-${Math.random()}.${ext}`

    const { error } =
      await supabaseCloud.storage
      .from("restaurant-covers")
      .upload(fileName,file)

    if(error){
      alert(error.message)
      return
    }

    const { data } =
      supabaseCloud.storage
      .from("restaurant-covers")
      .getPublicUrl(fileName)

    try {
      const { error: insertError } = await supabaseCloud
        .from("restaurant_banners")
        .insert({
          restaurant_id: restaurantId,
          image_url: data.publicUrl,
          sort_order: banners.length + index + 1
        })

      if(insertError){
        alert(insertError.message)
        return
      }
    } catch(error){
      alert(error instanceof Error ? error.message : "Unable to save banner")
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

  const filteredFloors = floors.filter(f => !spaceSearch.trim() || String(f.name).toLowerCase().includes(spaceSearch.trim().toLowerCase()))
  const totalCapacity = tables.reduce((sum, t) => sum + 4, 0) + rooms.reduce((sum, r) => sum + 4, 0)
  const activeFloors = floors.filter(f => f.active !== false)

  return (
    <main className="admin-page admin-pro-page">
      <div className="admin-pro-shell">
        <header className="admin-pro-hero">
          <div className="admin-pro-breadcrumb">ADMIN <span>›</span> RESTAURANT MANAGEMENT</div>
          <div className="admin-pro-hero-row">
            <div>
              <div className="admin-pro-kicker">RESTAURANT ADMIN</div>
              <h1>Restaurant Control Center</h1>
              <p>Manage your restaurant operations, dining spaces, menu, branding and guest-facing content from one place.</p>
            </div>
            <div className="admin-pro-hero-badge">✦ ANAIRA POS<br/><small>Restaurant Admin</small></div>
          </div>
        </header>

        <nav className="admin-pro-tabs" aria-label="Admin sections">
          {[
            ["overview","Overview","⌂"],
            ["spaces","Floor, Room & Table","▦"],
            ["menu","Menu Management","☷"],
            ["branding","Restaurant & Branding","✦"],
          ].map(([key,label,icon]) => (
            <button key={key} className={adminSection === key ? "active" : ""} onClick={() => setAdminSection(key as any)}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </nav>

        {adminSection === "overview" && (
          <section>
            <div className="admin-stat-grid">
              <div className="admin-stat-card"><span className="admin-stat-icon">🍽</span><div><b>{menu.length}</b><small>Menu Items</small></div></div>
              <div className="admin-stat-card"><span className="admin-stat-icon">▦</span><div><b>{activeFloors.length}</b><small>Active Floors</small></div></div>
              <div className="admin-stat-card"><span className="admin-stat-icon">🪑</span><div><b>{tables.length}</b><small>Tables</small></div></div>
              <div className="admin-stat-card"><span className="admin-stat-icon">🚪</span><div><b>{rooms.length}</b><small>Rooms</small></div></div>
              <div className="admin-stat-card"><span className="admin-stat-icon">👥</span><div><b>{totalCapacity}</b><small>Estimated Capacity</small></div></div>
            </div>
            <div className="admin-quick-grid">
              <button onClick={() => setAdminSection("spaces")} className="admin-quick-card"><strong>▦ Floor, Room & Table</strong><span>Create floors, assign rooms and organize tables.</span><em>OPEN →</em></button>
              <button onClick={() => setAdminSection("menu")} className="admin-quick-card"><strong>☷ Menu Management</strong><span>Add items, categories, variants, prices and images.</span><em>OPEN →</em></button>
              <button onClick={() => setAdminSection("branding")} className="admin-quick-card"><strong>✦ Restaurant Branding</strong><span>Update restaurant details, logo and banners.</span><em>OPEN →</em></button>
            </div>
          </section>
        )}

        {adminSection === "spaces" && (
          <section>
            <div className="admin-section-head">
              <div><div className="admin-pro-kicker">RESTAURANT LAYOUT</div><h2>Floor, Room & Table Management</h2><p>Every floor belongs to this restaurant. Rooms and tables can be organized under the same floor and will appear in the POS.</p></div>
              <button className="admin-primary" onClick={() => document.getElementById("floor-name-input")?.focus()}>＋ Add Floor</button>
            </div>

            <div className="admin-space-summary">
              <div><b>{floors.length}</b><span>Floors</span></div><div><b>{rooms.length}</b><span>Rooms</span></div><div><b>{tables.length}</b><span>Tables</span></div><div><b>{totalCapacity}</b><span>Capacity</span></div>
              <input value={spaceSearch} onChange={e => setSpaceSearch(e.target.value)} placeholder="Search floors…" />
            </div>

            <div className="admin-space-create-grid">
              <div className="admin-create-card accent-gold"><div className="admin-card-icon">▦</div><div><h3>Create Floor</h3><p>Add a dining floor such as Ground Floor, First Floor or Terrace.</p></div><input id="floor-name-input" value={floorInput} onChange={e => setFloorInput(e.target.value)} placeholder="e.g. Ground Floor" /><button className="admin-primary" onClick={addFloor} disabled={floorLoading}>{floorLoading ? "Saving…" : "Add Floor"}</button></div>
              <div className="admin-create-card accent-blue"><div className="admin-card-icon">🪑</div><div><h3>Create Table</h3><p>Assign every table to a floor so the POS floor map stays organized.</p></div><div className="admin-inline-fields"><input value={tableInput} onChange={e => setTableInput(e.target.value)} placeholder="Table No" /><select value={selectedFloor} onChange={e => setSelectedFloor(e.target.value)}><option value="">Select floor</option>{floors.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}</select></div><button className="admin-outline" onClick={addTable}>＋ Add Table</button></div>
              <div className="admin-create-card accent-purple"><div className="admin-card-icon">🚪</div><div><h3>Create Room</h3><p>Rooms also use the same floor structure for a clean POS layout.</p></div><div className="admin-inline-fields"><input value={roomInput} onChange={e => setRoomInput(e.target.value)} placeholder="Room No" /><select value={selectedFloor} onChange={e => setSelectedFloor(e.target.value)}><option value="">Select floor</option>{floors.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}</select></div><button className="admin-outline" onClick={addRoom}>＋ Add Room</button></div>
            </div>

            <div className="admin-floor-list">
              {filteredFloors.map((floor, index) => {
                const floorTables = tables.filter(t => String(t.floor || "") === String(floor.name))
                const floorRooms = rooms.filter(r => String(r.floor || "") === String(floor.name))
                const expanded = expandedFloor === floor.id
                return <article className={`admin-floor-card ${expanded ? "expanded" : ""}`} key={floor.id}>
                  <div className="admin-floor-header" onClick={() => setExpandedFloor(expanded ? null : floor.id)}>
                    <div className="admin-floor-mark">▦</div><div className="admin-floor-title"><h3>{floor.name}</h3><span>Floor {index + 1} · {floor.active === false ? "Inactive" : "Active"}</span></div>
                    <div className="admin-floor-metrics"><span>🪑 <b>{floorTables.length}</b> Tables</span><span>🚪 <b>{floorRooms.length}</b> Rooms</span></div>
                    <div className="admin-floor-actions"><button onClick={e => { e.stopPropagation(); renameFloor(floor) }}>Edit</button><button className="danger" onClick={e => { e.stopPropagation(); deleteFloor(floor) }}>Delete</button><span className="admin-chevron">{expanded ? "⌃" : "⌄"}</span></div>
                  </div>
                  {expanded && <div className="admin-floor-body">
                    <div className="admin-subsection"><div className="admin-subhead"><h4>Tables <span>{floorTables.length}</span></h4><button onClick={() => { setSelectedFloor(floor.name); setTableInput(""); document.getElementById("table-create")?.scrollIntoView({behavior:"smooth"}) }}>＋ Add Table</button></div><div className="admin-chip-grid">{floorTables.map(t => <div className="admin-space-chip" key={t.id}><b>Table {t.table_number}</b><span>4 Seats</span></div>)}{!floorTables.length && <div className="admin-empty-chip">No tables on this floor yet.</div>}</div></div>
                    <div className="admin-subsection"><div className="admin-subhead"><h4>Rooms <span>{floorRooms.length}</span></h4><button onClick={() => { setSelectedFloor(floor.name); setRoomInput(""); document.getElementById("room-create")?.scrollIntoView({behavior:"smooth"}) }}>＋ Add Room</button></div><div className="admin-chip-grid">{floorRooms.map(r => <div className="admin-space-chip room" key={r.id}><b>Room {r.room_number}</b><span>On {floor.name}</span></div>)}{!floorRooms.length && <div className="admin-empty-chip">No rooms on this floor yet.</div>}</div></div>
                  </div>}
                </article>
              })}
              {!filteredFloors.length && <div className="admin-empty-state"><div>▦</div><h3>No floors configured</h3><p>Create your first floor above. Once added, assign tables and rooms to it.</p></div>}
            </div>
          </section>
        )}

        {adminSection === "menu" && (
          <section>
            <div className="admin-section-head"><div><div className="admin-pro-kicker">MENU MANAGEMENT</div><h2>Menu, Categories & Variants</h2><p>Your existing menu tools are preserved here with a cleaner workspace.</p></div></div>
            <div className="admin-menu-layout">
              <Card title={editingId ? "Edit Item" : "Add Item"} glow="var(--success)">
                <Input value={itemName} set={setItemName} placeholder="Item Name"/><Input value={price} set={setPrice} placeholder="Price"/>
                <div className="admin-field"><label>Food Category</label><select value={selectedCategoryValue} onChange={e=>handleCategoryChange(e.target.value)}><option value="">Select category</option>{foodCategories.map(cat=><option key={cat} value={cat}>{cat}</option>)}<option value="__new__">＋ Create new category</option></select>{categoryMode === "new" && <input value={newCategory} onChange={e=>setNewCategory(e.target.value)} placeholder="Enter new food category"/>}</div>
                <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Food Description" className="admin-textarea"/>
                <div className="admin-variant-box"><div><b>Variants</b><button type="button" onClick={()=>setItemVariants(v=>[...v,{name:"",price_delta:"0",active:true}])}>＋ Add Variant</button></div>{itemVariants.map((v,index)=><div className="admin-variant-row" key={v.id||index}><input value={v.name} onChange={e=>setItemVariants(prev=>prev.map((x,i)=>i===index?{...x,name:e.target.value}:x))} placeholder="Variant name"/><input type="number" step="0.01" value={v.price_delta} onChange={e=>setItemVariants(prev=>prev.map((x,i)=>i===index?{...x,price_delta:e.target.value}:x))} placeholder="+ / −"/><button type="button" onClick={()=>setItemVariants(prev=>prev.filter((_,i)=>i!==index))}>✕</button></div>)}</div>
                <input type="file" onChange={handleItemImage} style={fileInput}/><Button onClick={addItem}>{editingId ? "Update Item" : "Add Item"}</Button>
              </Card>
              <div className="admin-menu-list"><div className="admin-menu-list-head"><h3>Menu Items <span>{menu.length}</span></h3></div>{Object.entries(groupedMenu).map(([cat,items])=><div className="admin-menu-category" key={cat}><button className="admin-category-head" onClick={()=>setOpenCategory(openCategory===cat?null:cat)}><span>🍽 {cat}</span><b>{items.length} {openCategory===cat?"−":"+"}</b></button>{openCategory===cat && items.map(i=><div className="admin-menu-item" key={i.id}>{i.image ? <img src={i.image} alt=""/> : <div className="admin-menu-placeholder">🍽</div>}<div><strong>{i.name}</strong><span>₹{i.price}</span><small>{(i as any).description || "No description"}</small></div><div><button onClick={()=>editItem(i)}>Edit</button><button className="danger" onClick={()=>deleteItem(i.id)}>Delete</button></div></div>)}</div>)}</div>
            </div>
          </section>
        )}

        {adminSection === "branding" && (
          <section>
            <div className="admin-section-head"><div><div className="admin-pro-kicker">RESTAURANT PROFILE</div><h2>Restaurant Details & Branding</h2><p>Update the information customers see across your restaurant experience.</p></div></div>
            <div className="admin-brand-grid">
              <Card title="Restaurant Details" glow="#06b6d4"><Input value={openingTime} set={setOpeningTime} placeholder="Opening Time"/><Input value={cuisine} set={setCuisine} placeholder="Cuisine"/><textarea value={restaurantDescription} onChange={e=>setRestaurantDescription(e.target.value)} placeholder="Restaurant Description" className="admin-textarea"/><Button onClick={saveRestaurantInfo}>Save Details</Button></Card>
              <Card title="Restaurant Logo" glow="var(--danger)"><input type="file" onChange={handleLogo} style={fileInput}/>{logo && <img src={logo} style={logoStyle}/>}<button onClick={uploadLogo} style={uploadBtn}>Upload Logo</button></Card>
              <Card title="Restaurant Banners" glow="var(--primary)"><input type="file" multiple onChange={handleBanners} style={fileInput}/><div className="admin-banner-grid">{bannerPreview.map(img=><img key={img} src={img} alt=""/>)}{banners.map(b=><img key={b.id || b.image_url} src={b.image_url} alt=""/>)}</div><button onClick={uploadBanners} style={uploadBtn}>Upload Banners</button></Card>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

/* 🎨 UI SAME */

const layout = {
  padding:30,
  background:
    "linear-gradient(135deg,var(--background),var(--surface-2),var(--background))",
  minHeight:"100vh",
  color:"var(--text)"
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

color:"var(--text)",

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
  color:"var(--text)",
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
      color:"var(--text)",
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
