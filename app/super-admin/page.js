"use client"

import { useEffect, useState } from "react"
import { supabaseCloud as supabase } from "@/lib/supabase"
import * as XLSX from "xlsx"

export default function SuperAdmin() {

  const [restaurants, setRestaurants] = useState([])
  const [summary, setSummary] = useState({ total:0, active:0, inactive:0, owners:0 })

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
  const [savingRestaurant,setSavingRestaurant] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [loadingRestaurants, setLoadingRestaurants] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [subscriptionPlans, setSubscriptionPlans] = useState([])
  const [initialPlanId, setInitialPlanId] = useState("")
  const [initialBillingCycle, setInitialBillingCycle] = useState("monthly")
  const [subscriptionBusy, setSubscriptionBusy] = useState("")

  // 🔥 BULK DELETE STATE
  const [selectedItems,setSelectedItems] = useState([])
  const [whatsappNumbers, setWhatsappNumbers] = useState({})

  useEffect(()=>{ loadRestaurants() },[])

  async function loadRestaurants(){
    setLoadingRestaurants(true)
    setLoadError("")
    const { data, error } = await supabase.from("restaurants").select("*")

    if (error) {
      console.error("SUPER ADMIN RESTAURANTS:", error)
      setRestaurants([])
      setLoadError(error.message || "Restaurants could not be loaded.")
      setSummary({ total:0, active:0, inactive:0, owners:0 })
      setLoadingRestaurants(false)
      return
    }

    let subscriptionRows = []
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (token) {
        const response = await fetch("/api/super-admin/subscriptions", { headers:{ Authorization:`Bearer ${token}` }, cache:"no-store" })
        const payload = await response.json()
        if (response.ok && payload?.success) {
          subscriptionRows = payload.subscriptions || []
          setSubscriptionPlans(payload.plans || [])
        }
      }
    } catch (e) {
      console.warn("SUBSCRIPTION SUMMARY LOAD:", e)
    }
    const latest = new Map()
    subscriptionRows.forEach(row => { if (!latest.has(row.restaurant_id)) latest.set(row.restaurant_id, row) })
    const fixed = (data||[]).map(r=>({
      ...r,
      status:r.status || "active",
      subscription: latest.get(r.id) || null
    }))

    setRestaurants(fixed)
    const { data: wp } = await supabase
  .from("plugin_settings")
  .select("*")
  .eq("plugin_code","whatsapp")

const map = {}
;(wp || []).forEach(i=>{
  map[i.restaurant_id] = i.config?.number || ""
})

setWhatsappNumbers(map)

    setSummary({
      total: fixed.length,
      active: fixed.filter(r=>r.status==="active").length,
      inactive: fixed.filter(r=>r.status!=="active").length,
      owners: new Set(fixed.map(r => String(r.owner_name || "").trim()).filter(Boolean)).size
    })
    setLoadingRestaurants(false)
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
  .eq("plugin_code", "whatsapp")
  .maybeSingle()

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

  async function deleteRestaurant(restaurant){
    if (!restaurant?.id) return

    const firstConfirm = window.confirm(
      `⚠️ DELETE RESTAURANT?\\n\\n` +
      `Restaurant: ${restaurant.name || "Unknown"}\\n\\n` +
      `This will permanently delete the restaurant and its related data ` +
      `(menu, orders, order items, tables, rooms, offers, ` +
      `reservations, plugins, settings, profiles and QR-related data).\\n\\n` +
      `This action cannot be undone.\\n\\n` +
      `Press OK to continue.`
    )

    if (!firstConfirm) return

    const typedName = window.prompt(
      `Final confirmation\\n\\n` +
      `Type the restaurant name exactly to delete it:\\n\\n${restaurant.name}`
    )

    if (typedName === null) return

    if (typedName.trim() !== String(restaurant.name || "").trim()) {
      window.alert("Restaurant name does not match. Delete cancelled.")
      return
    }

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession()

      if (sessionError || !sessionData?.session?.access_token) {
        throw new Error("Login session expired. Please login again.")
      }

      const response = await fetch("/api/super-admin/restaurants/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session.access_token}`
        },
        body: JSON.stringify({
          restaurant_id: restaurant.id
        })
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Restaurant deletion failed")
      }

      window.alert(
        `Restaurant "${restaurant.name}" deleted successfully.`
      )

      await loadRestaurants()
    } catch (error) {
      console.error("DELETE RESTAURANT ERROR:", error)
      window.alert(error?.message || "Restaurant deletion failed")
    }
  }

  async function toggleStatus(r){
    if (r.status === "active") {
      if (!confirm(`Deactivate ${r.name}? Its users will lose access until you activate it again.`)) return
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      const response = await fetch("/api/super-admin/subscriptions", { method:"POST", headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"}, body:JSON.stringify({restaurant_id:r.id,action:"deactivate"}) })
      const payload = await response.json()
      if (!response.ok || !payload.success) return alert(payload.error || "Unable to deactivate restaurant")
      return loadRestaurants()
    }
    alert("This restaurant is inactive because its subscription is not approved. Open Super Admin → Subscriptions, select a plan and activate it there.")
  }
 
async function updateRestaurantSubscription(restaurant, action) {
    if (!restaurant?.id) return

    const planId = restaurant.subscription?.saas_plan_id || ""
    if ((action === "approve" || action === "activate") && !planId) {
      alert("Select a subscription plan before activating this restaurant.")
      return
    }

    try {
      setSubscriptionBusy(`${restaurant.id}:${action}`)
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error("Authentication required. Please login again.")

      const response = await fetch("/api/super-admin/subscriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          saas_plan_id: planId || null,
          billing_cycle: restaurant.subscription?.billing_cycle || "monthly",
          action
        })
      })

      const payload = await response.json()
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Subscription update failed")
      }

      await loadRestaurants()
    } catch (error) {
      console.error("INLINE SUBSCRIPTION ERROR:", error)
      alert(error?.message || "Subscription update failed")
    } finally {
      setSubscriptionBusy("")
    }
  }

  async function assignRestaurantPlan(restaurant, planId, billingCycle = "monthly") {
    if (!restaurant?.id || !planId) return
    try {
      setSubscriptionBusy(`${restaurant.id}:assign`)
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error("Authentication required. Please login again.")

      const response = await fetch("/api/super-admin/subscriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          saas_plan_id: planId,
          billing_cycle: billingCycle,
          action: restaurant.status === "active" ? "approve" : "pending"
        })
      })

      const payload = await response.json()
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to assign subscription")
      }

      await loadRestaurants()
    } catch (error) {
      console.error("ASSIGN SUBSCRIPTION ERROR:", error)
      alert(error?.message || "Unable to assign subscription")
    } finally {
      setSubscriptionBusy("")
    }
  }

  async function saveRestaurant(){

  if(!form.name.trim()) return alert("Enter restaurant name")

  try {
    setSavingRestaurant(true)

    if(editingId){
      const { error } = await supabase
        .from("restaurants")
        .update({
          name: form.name.trim(),
          owner_name: form.owner_name?.trim() || null,
          phone: form.phone?.trim() || null,
          address: form.address?.trim() || null,
          gst: form.gst?.trim() || null,
          logo: form.logo?.trim() || null
        })
        .eq("id", editingId)

      if(error) throw new Error(error.message)

      if(form.whatsapp.trim()){
        const { error: wpError } = await supabase
          .from("plugin_settings")
          .upsert({
            restaurant_id: editingId,
            plugin_code: "whatsapp",
            config: { number: form.whatsapp.trim() }
          }, {
            onConflict: "restaurant_id,plugin_code"
          })

        if(wpError) throw new Error(wpError.message)
      }

      alert("Restaurant updated successfully ✅")
    } else {
      // Get the current Supabase login session and send the access token
      // to the secure Super Admin API.
      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession()

      if (sessionError) {
        throw new Error(sessionError.message)
      }

      if (!session?.access_token) {
        throw new Error("Authentication required. Please login again.")
      }

      const response = await fetch("/api/super-admin/restaurants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          name: form.name.trim(),
          owner_name: form.owner_name?.trim() || "",
          phone: form.phone?.trim() || "",
          address: form.address?.trim() || "",
          gst: form.gst?.trim() || "",
          logo: form.logo?.trim() || "",
          whatsapp: form.whatsapp?.trim() || "",
          saas_plan_id: initialPlanId || "",
          billing_cycle: initialBillingCycle
        })
      })

      const result = await response.json().catch(() => ({}))

      if(!response.ok || !result.success){
        throw new Error(result.error || "Restaurant creation failed")
      }

      alert("Restaurant created as INACTIVE. Assign and approve a subscription from Super Admin → Subscriptions to activate it.")
    }

    setEditingId(null)
    setSelected(null)
    setForm({
      name:"",
      owner_name:"",
      phone:"",
      address:"",
      gst:"",
      logo:"",
      whatsapp:""
    })

    await loadRestaurants()
  } catch(error) {
    console.error("SAVE RESTAURANT ERROR:", error)
    alert(error?.message || "Restaurant save failed")
  } finally {
    setSavingRestaurant(false)
  }
}

  const filteredRestaurants = restaurants.filter((r) => {
    const q = search.trim().toLowerCase()
    const matchesSearch = !q || `${r.name || ""} ${r.owner_name || ""} ${r.phone || ""} ${r.address || ""}`.toLowerCase().includes(q)
    const matchesStatus = statusFilter === "all" || (r.status || "active") === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div style={layout} className="super-admin-page">

      <header style={premiumHero}>
        <div style={{flex:1,minWidth:280}}>
          <div style={eyebrow}>ANAIRA POS • SUPER ADMIN</div>
          <h1 style={premiumTitle}>SaaS Command Center</h1>
          <p style={premiumSubtitle}>Monitor restaurants, platform health, menu operations and access from one premium control center.</p>
          <div style={heroActions}>
            <button
              style={heroButton}
              onClick={() => { setEditingId(null); setSelected(null); setInitialPlanId(""); setInitialBillingCycle("monthly"); window.scrollTo({top: document.body.scrollHeight, behavior:"smooth"}) }}
              onMouseEnter={e=>{e.currentTarget.style.background="var(--warning)";e.currentTarget.style.color="#111";e.currentTarget.style.transform="translateY(-2px)"}}
              onMouseLeave={e=>{e.currentTarget.style.background="var(--primary)";e.currentTarget.style.color="#111";e.currentTarget.style.transform="translateY(0)"}}
            >＋ Add Restaurant</button>
            <button
              style={heroGhost}
              onClick={() => window.location.href="/super-admin/plugins"}
              onMouseEnter={e=>{e.currentTarget.style.background="var(--primary)";e.currentTarget.style.color="#111";e.currentTarget.style.transform="translateY(-2px)"}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.03)";e.currentTarget.style.color="var(--text)";e.currentTarget.style.transform="translateY(0)"}}
            >🔌 Plugins</button>
            <button
              style={heroGhost}
              onClick={() => window.location.href="/super-admin/qr"}
              onMouseEnter={e=>{e.currentTarget.style.background="var(--primary)";e.currentTarget.style.color="#111";e.currentTarget.style.transform="translateY(-2px)"}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.03)";e.currentTarget.style.color="var(--text)";e.currentTarget.style.transform="translateY(0)"}}
            >▣ QR Center</button>
            <button
              style={heroGhost}
              onClick={() => window.location.href="/super-admin/theme"}
              onMouseEnter={e=>{e.currentTarget.style.background="var(--primary)";e.currentTarget.style.color="#111";e.currentTarget.style.transform="translateY(-2px)"}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.03)";e.currentTarget.style.color="var(--text)";e.currentTarget.style.transform="translateY(0)"}}
            >🎨 Platform Theme</button>
          </div>
        </div>
        <div style={heroLogoWrap}>
          <img src="/Logo.png" alt="Anaira Graphics" style={heroLogo}/>
          <span>Platform Owner</span>
        </div>
      </header>

      <div style={statsGrid}>
        <StatCard title="Total Restaurants" value={summary.total} icon="🏢" hint="All onboarded" />
        <StatCard title="Active" value={summary.active} icon="🟢" hint="Currently live" />
        <StatCard title="Inactive" value={summary.inactive} icon="⏸️" hint="Paused access" />
        <StatCard title="Platform Health" value={summary.total ? "Ready" : "—"} icon="⚡" hint="Core services" />
        <StatCard title="Named Owners" value={summary.owners} icon="👤" hint="Restaurant owners" />
      </div>

      <section style={commandBar}>
        <div>
          <div style={eyebrow}>RESTAURANT PORTFOLIO</div>
          <h2 style={{margin:"5px 0 0",fontSize:22}}>Manage your restaurants</h2>
        </div>
        <div style={filters}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search restaurant, owner, phone…" style={searchInput}/>
          {["all","active","inactive"].map(f=><button key={f} onClick={()=>setStatusFilter(f)} style={filterChip(statusFilter===f)}>{f}</button>)}
        </div>
      </section>

      <div id="restaurant-setup" style={formSection}><div style={formSectionHead}><div><div style={eyebrow}>RESTAURANT SETUP</div><h3 style={{margin:"5px 0 0"}}>{editingId ? "Edit restaurant" : "Add a restaurant"}</h3></div>{editingId && <button style={btnSmall} onClick={()=>{setEditingId(null);setSelected(null);setForm({name:"",owner_name:"",phone:"",address:"",gst:"",logo:"",whatsapp:""})}}>Cancel</button>}</div><div style={formBox}>
        <input name="name" value={form.name} onChange={handleChange} placeholder="Name" style={input}/>
        <input name="owner_name" value={form.owner_name} onChange={handleChange} placeholder="Owner" style={input}/>
        <input name="phone" value={form.phone} onChange={handleChange} placeholder="Phone" style={input}/>
        <input name="address" value={form.address} onChange={handleChange} placeholder="Address" style={input}/>
        <input name="gst" value={form.gst} onChange={handleChange} placeholder="GST" style={input}/>
        <input name="logo" value={form.logo} onChange={handleChange} placeholder="Logo URL" style={input}/>
        <input name="whatsapp" value={form.whatsapp} onChange={handleChange} placeholder="WhatsApp Number" style={input}
/>
        {!editingId && (
          <>
            <select
              value={initialPlanId}
              onChange={e=>setInitialPlanId(e.target.value)}
              style={input}
              aria-label="Initial subscription plan"
            >
              <option value="">Subscription Plan — assign later</option>
              {subscriptionPlans.map(plan=>(
                <option key={plan.id} value={plan.id}>
                  {plan.name} · ₹{Number(plan.monthly_price || 0).toLocaleString("en-IN")}/month
                </option>
              ))}
            </select>
            <select
              value={initialBillingCycle}
              onChange={e=>setInitialBillingCycle(e.target.value)}
              style={input}
              aria-label="Billing cycle"
            >
              <option value="monthly">Monthly billing</option>
              <option value="yearly">Yearly billing</option>
            </select>
          </>
        )}

        <button
  onClick={saveRestaurant}
  style={btn}
  onMouseEnter={(e)=>{
    e.currentTarget.style.transform="translateY(-4px)"
    e.currentTarget.style.background="var(--primary)"
    e.currentTarget.style.color="#111"
    e.currentTarget.style.boxShadow=
      "0 20px 40px rgba(117, 84, 0, 0.18)"
  }}
  onMouseLeave={(e)=>{
    e.currentTarget.style.transform="translateY(0)"
    e.currentTarget.style.background="transparent"
    e.currentTarget.style.color="var(--primary)"
    e.currentTarget.style.boxShadow=
      "0 10px 25px rgba(0, 0, 0, 0.12)"
  }}
>
          {savingRestaurant ? "Saving..." : (editingId ? "Update" : "Add Restaurant")}
        </button>
      </div></div>

      {loadError && (
        <div style={errorBanner}>
          <b>Restaurant data could not be loaded</b>
          <span>{loadError}</span>
          <button type="button" style={btnSmall} onClick={loadRestaurants}>Retry</button>
        </div>
      )}

      {loadingRestaurants ? (
        <div style={emptyState}>Loading restaurant portfolio…</div>
      ) : !filteredRestaurants.length ? (
        <div style={emptyState}>
          <strong>{search || statusFilter !== "all" ? "No restaurants match these filters." : "No restaurants yet."}</strong>
          <span>{search || statusFilter !== "all" ? "Clear the search/filter to see the full portfolio." : "Use Add Restaurant above to onboard the first restaurant."}</span>
        </div>
      ) : (
      <div style={grid}>
        {filteredRestaurants.map(r=>(
          <div
  key={r.id}
  style={card}
  onMouseEnter={(e)=>{
    e.currentTarget.style.transform="translateY(-6px)"
    e.currentTarget.style.boxShadow=
      "0 30px 60px rgba(var(--primary-rgb),.15)"
  }}
  onMouseLeave={(e)=>{
    e.currentTarget.style.transform="translateY(0)"
    e.currentTarget.style.boxShadow=
      "0 20px 40px rgba(0,0,0,.35)"
  }}
>
            {r.logo && <img src={r.logo} style={logo}/>}
            <div style={restaurantTop}><div><h3 style={{margin:"0 0 6px"}}>{r.name}</h3><p style={{margin:0,color:"var(--muted)"}}>{r.owner_name || "Owner not set"}</p></div><span style={statusPill(r.status || "active")}>{r.status || "active"}</span></div>
            <div style={restaurantMeta}>
              <span>📞 {r.phone || "No phone"}</span>
              <span>📍 {r.address || "Address not set"}</span>
              <span>💳 Plan: {r.subscription?.plan?.name || "Pending approval"}</span>
              <span>🔐 Subscription: {r.subscription?.status ? String(r.subscription.status).toUpperCase() : "PENDING"}</span>
            </div>

            <div style={subscriptionCard}>
              <div style={subscriptionCardTop}>
                <div>
                  <div style={subscriptionEyebrow}>SUBSCRIPTION</div>
                  <strong>{r.subscription?.plan?.name || "No plan assigned"}</strong>
                  <span style={{display:"block",color:"var(--muted)",fontSize:11,marginTop:3}}>
                    {r.subscription?.status === "active" ? "Live access enabled" : "Select a plan to activate"}
                  </span>
                </div>
                <span style={subscriptionStatusPill(r.subscription?.status, r.status)}>
                  {r.status === "active" && r.subscription?.status === "active" ? "ACTIVE" : "PENDING"}
                </span>
              </div>
              <div style={subscriptionControls}>
                <select
                  value={r.subscription?.saas_plan_id || ""}
                  onChange={e=>assignRestaurantPlan(r, e.target.value, r.subscription?.billing_cycle || "monthly")}
                  disabled={subscriptionBusy===`${r.id}:assign`}
                  style={subscriptionSelect}
                >
                  <option value="">Select plan</option>
                  {subscriptionPlans.map(plan=>(
                    <option key={plan.id} value={plan.id}>{plan.name}</option>
                  ))}
                </select>
                <select
                  value={r.subscription?.billing_cycle || "monthly"}
                  onChange={e=>{
                    const planId = r.subscription?.saas_plan_id
                    if (planId) assignRestaurantPlan(r, planId, e.target.value)
                  }}
                  disabled={!r.subscription?.saas_plan_id || subscriptionBusy===`${r.id}:assign`}
                  style={subscriptionSelect}
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div style={subscriptionActions}>
                <button
                  type="button"
                  onClick={()=>updateRestaurantSubscription(r, "approve")}
                  disabled={r.status === "active" && r.subscription?.status === "active" || !r.subscription?.saas_plan_id || !!subscriptionBusy}
                  style={{...subscriptionApprove, opacity: (r.status === "active" && r.subscription?.status === "active") || !r.subscription?.saas_plan_id || subscriptionBusy ? .55 : 1}}
                >
                  {subscriptionBusy===`${r.id}:approve` ? "Activating…" : (r.status === "active" && r.subscription?.status === "active" ? "✓ Active" : "✓ Activate")}
                </button>
                <button
                  type="button"
                  onClick={()=>updateRestaurantSubscription(r, "pending")}
                  disabled={r.status !== "active" && r.subscription?.status === "pending" || !!subscriptionBusy}
                  style={{...subscriptionPending, opacity: (r.status !== "active" && r.subscription?.status === "pending") || subscriptionBusy ? .55 : 1}}
                >
                  {r.status !== "active" && r.subscription?.status === "pending" ? "Pending" : "Set Pending"}
                </button>
              </div>
            </div>

            <div style={actions}>
              <button
  onClick={()=>handleEdit(r)}
  style={btnSmall}
  onMouseEnter={(e)=>{
    e.currentTarget.style.transform="translateY(-4px)"
    e.currentTarget.style.boxShadow="0 20px 40px rgba(var(--primary-rgb),.14)"
    e.currentTarget.style.background="rgba(var(--primary-rgb),.08)"
  }}
  onMouseLeave={(e)=>{
    e.currentTarget.style.transform="translateY(0)"
    e.currentTarget.style.boxShadow="0 10px 20px rgba(0,0,0,.18)"
    e.currentTarget.style.background="transparent"
  }}
>
  Edit</button>
              <button
  onClick={()=>toggleStatus(r)}
  style={btnSmall}
  onMouseEnter={(e)=>{
    e.currentTarget.style.transform="translateY(-4px)"
    e.currentTarget.style.background="rgba(var(--primary-rgb),.08)"
    e.currentTarget.style.boxShadow="0 20px 40px rgba(var(--primary-rgb),.14)"
  }}
  onMouseLeave={(e)=>{
    e.currentTarget.style.transform="translateY(0)"
    e.currentTarget.style.background="transparent"
    e.currentTarget.style.boxShadow="0 10px 20px rgba(0,0,0,.18)"
  }}
>{r.status === "active" ? "Deactivate" : "Activate"}</button>
              <button
  onClick={()=>deleteRestaurant(r)}
  style={dangerBtn}
  onMouseEnter={(e)=>{
    e.currentTarget.style.transform="translateY(-4px)"
    e.currentTarget.style.background="rgba(239,68,68,.14)"
    e.currentTarget.style.boxShadow="0 20px 40px rgba(239,68,68,.18)"
  }}
  onMouseLeave={(e)=>{
    e.currentTarget.style.transform="translateY(0)"
    e.currentTarget.style.background="transparent"
    e.currentTarget.style.boxShadow=
      "0 10px 20px rgba(var(--danger-rgb),.08)"
  }}
>Delete</button>
            </div>
          </div>
        ))}
      </div>
      )}

      {selected && (
        <div style={panel}>

          <h2>{selected.name} - Menu Control</h2>

          <div style={formBox}>
            <input name="name" value={item.name} onChange={handleItemChange} placeholder="Item Name" style={input}/>
            <input name="price" value={item.price} onChange={handleItemChange} placeholder="Price" style={input}/>
            <input name="category" value={item.category} onChange={handleItemChange} placeholder="Category" style={input}/>
            <input name="image" value={item.image} onChange={handleItemChange} placeholder="Image URL" style={input}/>
            <input type="file" onChange={handleFile} style={input}/>
            <button
  onClick={addMenuItem}
  style={btn}
  onMouseEnter={(e)=>{
    e.currentTarget.style.transform="translateY(-4px)"
    e.currentTarget.style.background="rgba(var(--primary-rgb),.08)"
    e.currentTarget.style.boxShadow=
      "0 20px 40px rgb(0, 0, 0)"
  }}
  onMouseLeave={(e)=>{
    e.currentTarget.style.transform="translateY(0)"
    e.currentTarget.style.background="transparent"
    e.currentTarget.style.color="var(--primary)"
    e.currentTarget.style.boxShadow=
      "0 10px 25px rgba(var(--primary-rgb),.12)"
  }}
>
  Add Item</button>
          </div>

          <div style={{marginTop:20}}>
            <input type="file" accept=".xlsx,.csv" onChange={handleExcel} style={input}/>
            <button
  onClick={uploadExcel}
  style={btn}
  onMouseEnter={(e)=>{
    e.currentTarget.style.transform="translateY(-4px)"
    e.currentTarget.style.background="rgba(var(--primary-rgb),.08)"
    e.currentTarget.style.boxShadow=
      "0 20px 40px rgb(0, 0, 0)"
  }}
  onMouseLeave={(e)=>{
    e.currentTarget.style.transform="translateY(0)"
    e.currentTarget.style.background="transparent"
    e.currentTarget.style.boxShadow=
      "0 10px 25px rgb(0, 0, 0)"
  }}
>
  Upload Excel</button>
          </div>

          {/* 🔥 BULK DELETE BUTTON */}
          <div style={{marginTop:15}}>
            <button onClick={bulkDelete} style={dangerBtn}
            onMouseEnter={(e)=>{
    e.currentTarget.style.transform="translateY(-4px)"
    e.currentTarget.style.background="var(--primary)"
    e.currentTarget.style.color="#111"
    e.currentTarget.style.boxShadow=
      "0 20px 40px rgb(0, 0, 0)"
  }}
  onMouseLeave={(e)=>{
    e.currentTarget.style.transform="translateY(0)"
    e.currentTarget.style.background="transparent"
    e.currentTarget.style.boxShadow=
      "0 10px 20px rgba(var(--danger-rgb),.08)"
  }}
  >
              🗑 Delete Selected
            </button>
          </div>

          <div style={dropdown} onClick={()=>setMenuOpen(!menuOpen)}>
            🍽️ Menu {menuOpen ? "▲" : "▼"}
          </div>

          {menuOpen && menu.map(i=>(
            <div
  key={i.id}
  style={row}
  onMouseEnter={(e)=>{
    e.currentTarget.style.transform="translateY(-4px)"
    e.currentTarget.style.border=
      "1px solid rgba(var(--primary-rgb),.25)"
    e.currentTarget.style.boxShadow=
      "0 25px 45px rgba(var(--primary-rgb),.12)"
  }}
  onMouseLeave={(e)=>{
    e.currentTarget.style.transform="translateY(0)"
    e.currentTarget.style.border=
      "1px solid rgba(var(--primary-rgb),.12)"
    e.currentTarget.style.boxShadow=
      "0 15px 35px rgba(0,0,0,.25)"
  }}
>

              <input
  type="checkbox"
  style={{
    width:20,
    height:20,
    accentColor:"var(--primary)",
    cursor:"pointer"
  }}
                checked={selectedItems.includes(i.id)}
                onChange={()=>toggleSelect(i.id)}
              />

              <div
  style={{
    display:"flex",
    alignItems:"center",
    gap:18,
    fontWeight:"700"
  }}
>
                {i.image && (
  <img
    src={i.image}
    style={{
      width:70,
      height:70,
      objectFit:"cover",

      borderRadius:18,

      border:
        "1px solid rgba(var(--primary-rgb),.2)",

      boxShadow:
        "0 10px 25px rgba(var(--primary-rgb),.12)"
    }}
  />
)}
                {i.name} ₹{i.price}
              </div>

              <div
  style={{
    display:"flex",
    alignItems:"center",
    gap:18,
    fontWeight:"700"
  }}
>
                <input type="file" onChange={(e)=>replaceImage(i.id,e.target.files[0])}/>
                <button onClick={()=>deleteItem(i.id)} style={dangerBtn}>Delete</button>
              </div>
            </div>
          ))}

        </div>
      )}

    </div>
  )

  function StatCard({title,value,icon,hint}){
  return (
    <div style={statCard}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={statIcon}>{icon}</span>
        <span style={statHint}>{hint}</span>
      </div>
      <div style={{marginTop:14,color:"var(--muted)",fontSize:12}}>{title}</div>
      <h2 style={{margin:"5px 0 0",fontSize:34,color:"var(--primary)"}}>{value}</h2>
    </div>
  )
}
}

/* 🔥 EXTRA STYLE */

const dropdown={

  marginTop:25,

  padding:"22px",

  borderRadius:22,

  cursor:"pointer",

  fontWeight:"800",

  fontSize:"16px",

  color:"var(--primary)",

  background:
    "linear-gradient(145deg,var(--surface),var(--surface-2))",

  border:
    "1px solid rgba(var(--primary-rgb),.18)",

  boxShadow:
    "0 15px 35px rgba(0,0,0,.35)",

  backdropFilter:"blur(20px)",

  transition:"all .35s ease"
}

const premiumHero = { display:"flex", justifyContent:"space-between", gap:28, alignItems:"center", flexWrap:"wrap", padding:"34px clamp(22px,4vw,44px)", borderRadius:32, marginBottom:18, background:"radial-gradient(circle at 80% 20%,rgba(233,167,45,.15),transparent 30%),linear-gradient(135deg,#0b2118,#102b20 60%,#071b12)", border:"1px solid rgba(var(--primary-rgb),.2)", boxShadow:"0 30px 90px rgba(0,0,0,.35)", overflow:"hidden" }
const eyebrow = { color:"var(--primary)", letterSpacing:2.4, fontSize:11, fontWeight:900 }
const premiumTitle = { margin:"8px 0 10px", fontSize:"clamp(30px,4vw,52px)", lineHeight:1.02, letterSpacing:"-.04em", color:"var(--text)af0" }
const premiumSubtitle = { margin:0, maxWidth:720, color:"var(--muted)", lineHeight:1.7 }
const heroActions = { display:"flex", gap:9, flexWrap:"wrap", marginTop:20 }
const heroButton = { border:0, borderRadius:13, padding:"12px 16px", background:"var(--primary)", color:"#111", fontWeight:900, cursor:"pointer" }
const heroGhost = { border:"1px solid rgba(var(--primary-rgb),.28)", borderRadius:13, padding:"12px 16px", background:"rgba(255,255,255,.03)", color:"var(--text)", fontWeight:800, cursor:"pointer" }
const heroLogoWrap = { display:"grid", placeItems:"center", gap:8, padding:16, minWidth:150, borderRadius:22, background:"rgba(255,255,255,.045)", border:"1px solid rgba(255,255,255,.08)" }
const heroLogo = { width:92, height:92, objectFit:"contain", borderRadius:18, background:"var(--text)", padding:7 }
const commandBar = {
  display:"flex",
  justifyContent:"space-between",
  gap:16,
  alignItems:"center",
  flexWrap:"wrap",
  padding:"18px 20px",
  marginBottom:18,
  borderRadius:22,
  background:"rgba(15,23,42,.62)",
  border:"1px solid rgba(var(--primary-rgb),.12)"
}

const filters = {
  display:"flex",
  gap:7,
  alignItems:"center",
  flexWrap:"wrap",
  minWidth:280
}

/* INPUT STYLE MUST COME BEFORE searchInput */
const input = {
  padding:"14px 18px",
  borderRadius:16,
  border:"1px solid rgba(var(--primary-rgb),.25)",
  background:"var(--surface-2)",
  color:"var(--text)",
  outline:"none",
  fontSize:14,
  width:"100%",
  boxSizing:"border-box"
}

const searchInput = {
  ...input,
  minWidth:250,
  flex:1
}

const filterChip = (active) => ({
  border:`1px solid ${
    active
      ? "rgba(var(--primary-rgb),.35)"
      : "rgba(255,255,255,.08)"
  }`,
  background:active
    ? "rgba(var(--primary-rgb),.12)"
    : "transparent",
  color:active
    ? "var(--primary)"
    : "var(--muted)",
  borderRadius:999,
  padding:"9px 12px",
  textTransform:"capitalize",
  cursor:"pointer",
  fontWeight:800,
  transition:"all .2s ease"
})
const statIcon = { width:38,height:38,borderRadius:12,display:"grid",placeItems:"center",background:"rgba(var(--primary-rgb),.08)",fontSize:19 }
const statHint = { color:"var(--muted)",fontSize:11 }
const restaurantTop = { display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start" }
const restaurantMeta = { display:"grid",gap:5,margin:"14px 0",color:"var(--muted)",fontSize:12 }
const statusPill = (status) => ({ display:"inline-flex",padding:"6px 9px",borderRadius:999,textTransform:"capitalize",fontSize:11,fontWeight:900,background:status==="active"?"rgba(74,222,128,.10)":"rgba(245,158,11,.10)",color:status==="active"?"var(--success)":"var(--warning)",border:`1px solid ${status==="active"?"rgba(74,222,128,.22)":"rgba(245,158,11,.22)"}` })
const errorBanner = { display:"grid", gap:7, marginBottom:16, padding:"14px 16px", borderRadius:16, background:"rgba(239,68,68,.07)", border:"1px solid rgba(239,68,68,.2)", color:"var(--danger)", lineHeight:1.5 }
const emptyState = { display:"grid", gap:7, placeItems:"center", minHeight:180, padding:28, marginBottom:20, borderRadius:22, background:"rgba(255,255,255,.025)", border:"1px dashed rgba(255,255,255,.12)", color:"var(--muted)", textAlign:"center" }
const layout = {
  padding:"clamp(16px,3vw,32px)",
  background:"radial-gradient(circle at top,var(--background),#000)",
  color:"var(--text)",
  minHeight:"100vh"
}

const title = {
  fontSize:42,
  fontWeight:800,
  marginBottom:35,
  color:"var(--primary)",
  letterSpacing:1,
  textShadow:"0 0 25px rgba(var(--primary-rgb),.35)"
}
/* STATS */

const statsGrid = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",
  gap:20,
  marginBottom:30
}

const statCard = {
  padding:"28px",
  borderRadius:24,

  background:
    "linear-gradient(145deg,var(--surface),var(--surface-2))",

  border:
    "1px solid rgba(var(--primary-rgb),.18)",

  textAlign:"center",

  boxShadow:
    "0 20px 40px rgba(0,0,0,.35)"
}

/* FORM */

const formBox = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",
  gap:16,

  padding:25,

  borderRadius:24,

  background:
    "linear-gradient(145deg,var(--surface),var(--surface-2))",

  border:
    "1px solid rgba(var(--primary-rgb),.15)",

  boxShadow:
    "0 20px 40px rgba(0,0,0,.35)",

  marginBottom:30
}

/* BUTTON MAIN */

const btn = {
  padding:"14px",

  borderRadius:16,

  border:
    "1px solid rgba(var(--primary-rgb),.35)",

  background:"transparent",

  color:"var(--primary)",

  fontWeight:800,

  cursor:"pointer",

  transition:"all .35s ease",

  boxShadow:
    "0 10px 25px rgba(var(--primary-rgb),.12)"
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
  padding:"24px",

  borderRadius:24,

  background:
    "linear-gradient(145deg,var(--surface),var(--surface-2))",

  border:
    "1px solid rgba(var(--primary-rgb),.15)",

  backdropFilter:"blur(20px)",

  boxShadow:
    "0 20px 40px rgba(0,0,0,.35)",

  transition:"all .35s ease"
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


const subscriptionCard = {
  marginTop: 14,
  padding: 14,
  borderRadius: 18,
  background: "rgba(var(--primary-rgb),.055)",
  border: "1px solid rgba(var(--primary-rgb),.14)"
}
const subscriptionCardTop = { display:"flex", justifyContent:"space-between", gap:12, alignItems:"flex-start" }
const subscriptionEyebrow = { color:"var(--primary)", fontSize:9, fontWeight:900, letterSpacing:1.4, marginBottom:4 }
const subscriptionStatusPill = (status, restaurantStatus) => ({
  padding:"5px 8px",
  borderRadius:999,
  fontSize:9,
  fontWeight:900,
  letterSpacing:1,
  background: restaurantStatus === "active" && status === "active" ? "rgba(34,197,94,.10)" : "rgba(245,158,11,.10)",
  color: restaurantStatus === "active" && status === "active" ? "var(--success)" : "var(--warning)",
  border: `1px solid ${restaurantStatus === "active" && status === "active" ? "rgba(34,197,94,.22)" : "rgba(245,158,11,.22)"}`
})
const subscriptionControls = { display:"grid", gridTemplateColumns:"1fr 110px", gap:8, marginTop:10 }
const subscriptionSelect = { width:"100%", boxSizing:"border-box", padding:"9px 10px", borderRadius:10, border:"1px solid rgba(var(--primary-rgb),.16)", background:"var(--surface-2)", color:"var(--text)", outline:"none", fontSize:12 }
const subscriptionActions = { display:"flex", gap:8, marginTop:10 }
const subscriptionApprove = { flex:1, border:"1px solid rgba(34,197,94,.25)", borderRadius:10, padding:"9px 10px", background:"rgba(34,197,94,.08)", color:"var(--success)", cursor:"pointer", fontWeight:900 }
const subscriptionPending = { flex:1, border:"1px solid rgba(245,158,11,.22)", borderRadius:10, padding:"9px 10px", background:"rgba(245,158,11,.06)", color:"var(--warning)", cursor:"pointer", fontWeight:800 }

const actions = {
  display:"flex",
  gap:10,
  marginTop:12
}

/* SMALL BUTTON */

const btnSmall = {

  padding:"10px 16px",

  borderRadius:14,

  background:"transparent",

  border:
    "1px solid rgba(var(--primary-rgb),.25)",

  color:"var(--primary)",

  cursor:"pointer",

  fontSize:13,

  fontWeight:700,

  transition:"all .35s ease",

  boxShadow:
    "0 10px 20px rgba(var(--primary-rgb),.08)"
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

  padding:"28px",

  borderRadius:28,

  background:
    "linear-gradient(145deg,var(--surface),var(--surface-2))",

  border:
    "1px solid rgba(var(--primary-rgb),.15)",

  backdropFilter:"blur(20px)",

  boxShadow:
    "0 25px 50px rgba(0,0,0,.35)"
}

/* ROW */

const row = {

  display:"flex",

  justifyContent:"space-between",

  alignItems:"center",

  padding:"18px",

  marginBottom:15,

  borderRadius:22,

  background:
    "linear-gradient(145deg,var(--surface-2),var(--surface-2))",

  border:
    "1px solid rgba(var(--primary-rgb),.12)",

  boxShadow:
    "0 15px 35px rgba(0,0,0,.25)",

  transition:"all .35s ease"
}
const formSection = { marginBottom: 22, padding: 20, borderRadius: 24, background: "linear-gradient(145deg,rgba(15,23,42,.92),rgba(15,23,42,.68))", border: "1px solid rgba(255,255,255,.08)", boxShadow: "0 18px 55px rgba(0,0,0,.16)" }
const formSectionHead = { display:"flex", justifyContent:"space-between", alignItems:"center", gap:14, marginBottom:14 }
