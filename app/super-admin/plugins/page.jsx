"use client"

import { speakCallingAnnouncement, unlockCallingAudio } from "@/lib/callingVoice"

import { useEffect, useMemo, useState } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { CORE_FEATURE_CODES, OPERATIONS_FEATURE_CODES, isRestaurantProFeature } from "@/lib/featureCatalog"
import { PLUGIN_CATALOG, PLUGIN_CODES } from "@/lib/pluginCatalog"
import { BRAND_THEMES, DEFAULT_THEME } from "@/components/ThemeProvider"

const categoryMeta = {
  "Core Hubs":["🧭","Core Hubs"],
  POS:["🧾","Point of Sale"],
  Billing:["💳","Billing & Payments"],
  Operations:["🪑","Restaurant Operations"],
  Kitchen:["👨‍🍳","Kitchen"],
  Inventory:["📦","Inventory & Purchase"],
  Delivery:["🛵","Delivery"],
  QR:["📱","QR Ordering"],
  CRM:["👥","CRM & Loyalty"],
  Reports:["📊","Reports & Profit"],
  Staff:["👨‍💼","Staff"],
  Security:["🔐","Security"],
  Integrations:["🔌","Integrations"],
  Enterprise:["🏢","Enterprise"]
}

const hubCodes = new Set(["operations-hub","restaurant-core","restaurant-pro"])
const MASTER_PLUGIN_CODES = new Set(["operations-hub","restaurant-core","restaurant-pro"])

export default function PluginsPage(){
  const [restaurants,setRestaurants]=useState([])
  const [catalog,setCatalog]=useState([])
  const [installed,setInstalled]=useState([])
  const [selected,setSelected]=useState(null)
  const [category,setCategory]=useState("All")
  const [statusFilter,setStatusFilter]=useState("all")
  const [search,setSearch]=useState("")
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState("")
  const [message,setMessage]=useState("")
  const [restaurantSearch,setRestaurantSearch]=useState("")

  useEffect(()=>{ load() },[])

  async function authHeaders(){
    const {data:{session}}=await supabaseCloud.auth.getSession()
    return {
      Authorization:`Bearer ${session?.access_token||""}`,
      "Content-Type":"application/json"
    }
  }

  async function load(){
    setLoading(true)
    try{
      const headers=await authHeaders()
      const res=await fetch("/api/super-admin/plugins",{headers,cache:"no-store"})
      const data=await res.json()
      if(!res.ok||!data.success) throw new Error(data.error||"Unable to load plugin center")
      setRestaurants(data.restaurants||[])
      setCatalog(PLUGIN_CATALOG)
    }catch(e){
      setMessage(`❌ ${e.message}`)
    }finally{
      setLoading(false)
    }
  }

  async function selectRestaurant(r){
    if(!r) return
    setSelected(r)
    setMessage("")
    try{
      const headers=await authHeaders()
      const res=await fetch(`/api/super-admin/plugins?restaurant_id=${encodeURIComponent(r.id)}`,{
        headers,cache:"no-store"
      })
      const data=await res.json()
      if(!res.ok||!data.success) throw new Error(data.error||"Unable to load restaurant plugins")
      setCatalog(PLUGIN_CATALOG)
      setInstalled(data.plugins||[])
    }catch(e){
      setMessage(`❌ ${e.message}`)
    }
  }

  const merged=useMemo(()=>PLUGIN_CATALOG.map(c=>({
    ...c,
    plugin:installed.find(p=>p.plugin_code===c.code)||null
  })),[catalog,installed])

  const categories=["All",...Array.from(new Set(PLUGIN_CATALOG.map(x=>x.category).filter(Boolean)))]
  const filteredRestaurants=restaurants.filter(r=>{
    const q=restaurantSearch.trim().toLowerCase()
    return !q || `${r.name} ${r.status}`.toLowerCase().includes(q)
  })

  const filtered=merged.filter(x=>{
    const q=search.trim().toLowerCase()
    const categoryOK=category==="All"||x.category===category
    const status=x.plugin?.enabled===true ? "active" : "locked"
    const statusOK=statusFilter==="all"||statusFilter===status
    const searchOK=!q||`${x.name} ${x.description} ${x.category} ${x.code}`.toLowerCase().includes(q)
    return categoryOK&&statusOK&&searchOK
  })

  const activeCount=installed.filter(x=>x.enabled).length
  const total=catalog.length
  const coverage=total?Math.round(activeCount/total*100):0
  const activeHubs=installed.filter(x=>hubCodes.has(x.plugin_code)&&x.enabled).length
  const activeRows=installed.filter(x=>x.enabled)

  const [configOpen,setConfigOpen]=useState("")
  const [config,setConfig]=useState({})
  const [themeOptions,setThemeOptions]=useState(BRAND_THEMES)
  async function loadConfig(plugin){
    if(!selected)return
    setConfigOpen(plugin.code)
    const headers=await authHeaders()
    const res=await fetch(`/api/super-admin/plugins?restaurant_id=${encodeURIComponent(selected.id)}&config_for=${encodeURIComponent(plugin.code)}`,{headers,cache:"no-store"})
    const data=await res.json()
    setConfig(data.config||{})
    if (plugin.code === "theme-branding") {
      const custom = Array.isArray(data.theme_catalog) ? data.theme_catalog : []
      const options = [
        ...BRAND_THEMES,
        ...custom.filter(item => !BRAND_THEMES.some(base => base.id === item?.id)),
      ]
      setThemeOptions(options)
    }
  }
  async function saveConfig(plugin){
    if(!selected)return
    const headers=await authHeaders()
    const configToSave = { ...config }
    if (plugin.code === "restaurant-settings") {
      if (configToSave.allow_admin_theme_changes === true &&
          !["restaurant","qr","both"].includes(String(configToSave.admin_theme_change_scope || "").toLowerCase())) {
        configToSave.admin_theme_change_scope = "both"
      }
      if (configToSave.allow_admin_theme_changes !== true) {
        configToSave.admin_theme_change_scope = "none"
      }
      setConfig(configToSave)
    }
    const res=await fetch("/api/super-admin/plugins",{
      method:"PATCH",
      headers,
      body:JSON.stringify({restaurant_id:selected.id,plugin_code:plugin.code,config:configToSave})
    })
    const data=await res.json()
    if(!res.ok||!data.success) throw new Error(data.error||"Configuration save failed")
    if (plugin.code === "theme-branding" && config.theme_id) {
      const theme = themeOptions.find(item => item.id === config.theme_id) || DEFAULT_THEME
      const themeRes = await fetch("/api/super-admin/plugins",{
        method:"PATCH",
        headers,
        body:JSON.stringify({
          restaurant_id:selected.id,
          plugin_code:"theme-branding",
          theme_selection:{
            selected:theme.id,
            theme
          }
        })
      })
      const themeData = await themeRes.json()
      if(!themeRes.ok||!themeData.success) throw new Error(themeData.error||"Restaurant theme assignment failed")
    }
    setMessage(`✅ ${plugin.name} settings saved for ${selected.name}`)
  }

  async function testPluginConnection(plugin){
    if(!selected) return
    try{
      await saveConfig(plugin)
      const headers=await authHeaders()
      const res=await fetch("/api/plugins/test",{method:"POST",headers,body:JSON.stringify({restaurant_id:selected.id,plugin_code:plugin.code})})
      const data=await res.json()
      if(!res.ok||!data.success) throw new Error(data.error||"Connection test failed")
      setMessage(`✅ ${plugin.name}: connection/runtime is ready`)
    }catch(e){
      setMessage(`❌ ${plugin.name}: ${e.message}`)
    }
  }

  async function testWhatsApp(plugin){
    if(plugin.code!=="whatsapp-invoice" || !selected) return
    try{
      await saveConfig(plugin)
      const headers=await authHeaders()
      const res=await fetch("/api/whatsapp/test",{
        method:"POST",
        headers,
        body:JSON.stringify({
          restaurant_id:selected.id,
          to:config.test_recipient,
          templateName:"hello_world",
          language:"en_US"
        })
      })
      const data=await res.json()
      if(!res.ok||!data.success) throw new Error(data.error||"WhatsApp test failed")
      setMessage(`✅ WhatsApp API accepted the test message${data.wamid?` · ${data.wamid}`:""}`)
    }catch(e){
      setMessage(`❌ WhatsApp test: ${e.message}`)
    }
  }

  async function toggle(plugin){
    if(!selected) return
    if (CORE_FEATURE_CODES.has(plugin.code) && !MASTER_PLUGIN_CODES.has(plugin.code)) {
      setMessage("Restaurant Core feature modules are controlled by the Restaurant Core master switch.")
      return
    }
    const row=plugin.plugin
    const isMaster = MASTER_PLUGIN_CODES.has(plugin.code) && plugin.code !== "restaurant-pro"
    const nextEnabled = row?.enabled !== true
    setSaving(plugin.code)
    setMessage("")
    try{
      const headers=await authHeaders()
      const res=await fetch("/api/super-admin/plugins",{
        method:isMaster?"PATCH":(row?"PATCH":"POST"),
        headers,
        body:JSON.stringify(isMaster
          ? {restaurant_id:selected.id,plugin_code:plugin.code,enabled:nextEnabled}
          : row
            ? {restaurant_id:selected.id,id:row.id,enabled:!row.enabled}
            : {restaurant_id:selected.id,plugin_code:plugin.code}
        )
      })
      const data=await res.json()
      if(!res.ok||!data.success) throw new Error(data.error||"Plugin update failed")
      await selectRestaurant(selected)
      if(typeof window!=="undefined") window.dispatchEvent(new CustomEvent("anaira:plugins-updated"))
      setMessage(`✅ ${plugin.name} ${isMaster ? (nextEnabled?"activated":"deactivated") : (row?.enabled?"deactivated":"activated")}`)
    }catch(e){
      setMessage(`❌ ${e.message}`)
    }finally{
      setSaving("")
    }
  }


  if(loading) return <main className="plugin-pro-shell"><div style={loadingCard}>Loading Plugin Control Center…</div></main>

  return (
    <main className="plugin-pro-shell">
      <style jsx global>{`
        .plugin-pro-shell{min-height:100vh;padding:28px clamp(14px,3vw,42px) 64px;background:var(--background);color:var(--text)}
        .plugin-wrap{max-width:1500px;margin:0 auto}
        .plugin-grid{display:grid;grid-template-columns:285px minmax(0,1fr);gap:22px;align-items:start}
        .plugin-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
        .hub-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
        .plugin-btn{transition:.18s ease}
        .plugin-btn:hover{transform:translateY(-1px)}
        .plugin-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
        .plugin-settings-panel{width:100%;box-sizing:border-box}
        .plugin-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        .plugin-setting-card{padding:14px;border-radius:14px;background:var(--surface-2);border:1px solid var(--border)}
        .plugin-setting-field{display:grid;gap:6px;margin-top:9px}
        .plugin-setting-field:first-child{margin-top:0}
        .plugin-setting-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;border-radius:11px;background:var(--surface);border:1px solid var(--border)}
        .plugin-setting-toggle input{width:18px;height:18px;accent-color:var(--primary)}
        .plugin-settings-save{position:sticky;bottom:12px;z-index:3;padding:10px;border-radius:12px;background:color-mix(in srgb,var(--surface) 92%,transparent);backdrop-filter:blur(14px);border:1px solid var(--border)}
        @media(max-width:1180px){.plugin-grid{grid-template-columns:1fr}.plugin-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.hub-cards{grid-template-columns:1fr}}
        @media(max-width:650px){.plugin-settings-grid{grid-template-columns:1fr}.plugin-actions{width:100%}.plugin-actions .plugin-btn{flex:1}.plugin-pro-shell{padding:12px 10px 35px}.plugin-cards{grid-template-columns:1fr}.stats-grid{grid-template-columns:1fr 1fr!important}}
      `}</style>

      <div className="plugin-wrap">
        <header style={hero}>
          <div style={heroGlow}/>
          <div style={{position:"relative",zIndex:1}}>
            <div style={eyebrow}>SUPER ADMIN · APP CONTROL</div>
            <div style={{display:"flex",justifyContent:"space-between",gap:18,alignItems:"flex-start",flexWrap:"wrap"}}>
              <div>
                <h1 style={title}>Plugin Manager</h1>
                <p style={subtitle}>Control every restaurant capability from one place. Activate only what each restaurant has purchased or is ready to use.</p>
              </div>
              <div style={heroBadge}><span>🧩</span><b>{total}</b><small>available plugins</small></div>
            </div>
            <div style={heroBadges}>
              <span style={badge}>🔐 Super Admin</span>
              <span style={badge}>🏪 {restaurants.length} Restaurants</span>
              <span style={badge}>⚡ {activeCount} Active</span>
              <span style={badge}>📈 {coverage}% Coverage</span>
              {selected&&<span style={badge}>🏪 {selected.name}</span>}
            </div>
          </div>
        </header>

        {message&&<div style={toast}>{message}</div>}

        <section style={topBar}>
          <div style={restaurantBox}>
            <div style={miniLabel}>RESTAURANT CONTROL</div>
            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              <div style={restaurantSearchWrap}>
                <span>⌕</span>
                <input value={restaurantSearch} onChange={e=>setRestaurantSearch(e.target.value)} placeholder="Find restaurant…" style={searchInput}/>
              </div>
              <select value={selected?.id||""} onChange={e=>selectRestaurant(restaurants.find(r=>r.id===e.target.value))} style={select}>
                <option value="">Select restaurant…</option>
                {filteredRestaurants.map(r=><option key={r.id} value={r.id}>{r.name} · {r.status||"active"}</option>)}
              </select>
            </div>
          </div>
          <div style={actionRow}>
            <button className="plugin-btn" style={ghost} onClick={load}>↻ Refresh</button>
            {selected&&<>

            </>}
          </div>
        </section>

        {!selected ? (
          <section style={welcome}>
            <div style={welcomeIcon}>🧩</div>
            <div>
              <div style={eyebrow}>PLUGIN LIBRARY READY</div>
              <h2 style={{margin:"5px 0 8px"}}>Choose a restaurant to manage features</h2>
              <p style={{margin:0,color:"var(--muted)",lineHeight:1.6}}>Each restaurant has its own plugin state. Turning a feature ON here makes that feature available to the restaurant.</p>
            </div>
          </section>
        ):(
          <>
            <section className="stats-grid" style={stats}>
              <Stat icon="⚡" label="Active Features" value={`${activeCount}/${total}`}/>
              <Stat icon="📈" label="Coverage" value={`${coverage}%`}/>
              <Stat icon="🧭" label="Master Hubs" value={`${activeHubs}/3`}/>
              <Stat icon="🏪" label="Restaurant" value={selected.name}/>
            </section>

            <section style={hubPanel}>
              <div style={sectionHead}>
                <div>
                  <div style={eyebrow}>MASTER CONTROLS</div>
                  <h2 style={sectionTitle}>Restaurant Control Hubs</h2>
                  <p style={sectionText}>These are the three top-level switches for the restaurant application.</p>
                </div>
                <span style={masterStatus}>{activeHubs}/3 ACTIVE</span>
              </div>

              <div className="hub-cards">
                {merged.filter(p=>hubCodes.has(p.code)).map(p=>{
                  const alwaysOn = false
                   const on = p.plugin?.enabled===true
                  return <article key={p.code} style={{...hubCard,...(on?hubCardOn:{})}}>
                    <div style={hubIcon}>{p.icon||"🧩"}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
                        <h3 style={{margin:0,fontSize:16}}>{p.name}</h3>
                        <span style={{...status,...(on?statusOn:statusOff)}}>{on?"ACTIVE":"LOCKED"}</span>
                      </div>
                      <p style={pluginDesc}>{p.description}</p>
                      <button className="plugin-btn" disabled={alwaysOn || saving===p.code} onClick={()=>toggle(p)} style={alwaysOn?ghost:(on?hubDeactivate:hubActivate)}>
                        {alwaysOn ? "Always On" : saving===p.code?"Saving…":on?"Deactivate":"Activate"}
                      </button>
                    </div>
                  </article>
                })}
              </div>
            </section>

            <section style={{...hubPanel,marginTop:0}}>
              <div style={sectionHead}>
                <div>
                  <div style={eyebrow}>INTEGRATION PLUGIN</div>
                  <h2 style={sectionTitle}>WhatsApp Integration</h2>
                  <p style={sectionText}>Enable or disable WhatsApp Invoice independently. It does not depend on Restaurant Pro or Core POS.</p>
                </div>
              </div>
              <div className="hub-cards">
                {merged.filter(p => p.code === "whatsapp-invoice").map(p => {
                  const on = p.plugin?.enabled === true
                  return <article key={p.code} style={{...hubCard,...(on?hubCardOn:{})}}>
                    <div style={hubIcon}>📲</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
                        <h3 style={{margin:0,fontSize:16}}>WhatsApp Invoice</h3>
                        <span style={{...status,...(on?statusOn:statusOff)}}>{on?"ACTIVE":"OFF"}</span>
                      </div>
                      <p style={pluginDesc}>Send invoice/customer messages through WhatsApp click-to-chat.</p>
                      <button className="plugin-btn" disabled={saving===p.code} onClick={()=>toggle(p)} style={on?hubDeactivate:hubActivate}>
                        {saving===p.code?"Saving…":on?"Deactivate":"Activate"}
                      </button>
                    </div>
                  </article>
                })}
              </div>
            </section>

            <div className="plugin-grid">
              <aside style={side}>
                <div style={sideTitle}>PLUGIN LIBRARY</div>
                <div style={sideSearch}><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search plugins…" style={searchInput}/></div>
                <button onClick={()=>setCategory("All")} style={{...sideItem,...(category==="All"?sideActive:{})}}>✨ All Features <b>{catalog.length}</b></button>
                {categories.slice(1).map(c=>{
                  const [icon,label]=categoryMeta[c]||["🧩",c]
                  const count=merged.filter(x=>x.category===c).length
                  return <button key={c} onClick={()=>setCategory(c)} style={{...sideItem,...(category===c?sideActive:{})}}>{icon}<span style={{flex:1}}>{label}</span><b>{count}</b></button>
                })}
                <div style={sideDivider}/>
                <div style={sideTitle}>STATUS</div>
                {[
                  ["all","All Plugins","🧩"],
                  ["active","Active","🟢"],
                  ["locked","Locked / Off","⚪"]
                ].map(([v,label,icon])=><button key={v} onClick={()=>setStatusFilter(v)} style={{...sideItem,...(statusFilter===v?sideActive:{})}}>{icon}<span style={{flex:1}}>{label}</span></button>)}
                <div style={sideNote}>OFF = unavailable to this restaurant.<br/><br/>ACTIVE = Super Admin has enabled the feature.</div>
              </aside>

              <section>
                <div style={contentHeader}>
                  <div>
                    <div style={miniLabel}>{selected.name.toUpperCase()}</div>
                    <h2 style={{margin:"4px 0 0",fontSize:24}}>Feature Library</h2>
                  </div>
                  <div style={resultPill}>{filtered.length} results</div>
                </div>

                <div className="plugin-cards">
                  {filtered.map(p=>{
                    const alwaysOn = false
                     const on=p.plugin?.enabled===true
                    const [catIcon,catLabel]=categoryMeta[p.category]||["🧩",p.category]
                    return <article key={p.code} style={{...pluginCard,...(on?pluginOn:{})}}>
                      <div style={cardTop}>
                        <div style={pluginIcon}>{p.icon||catIcon}</div>
                        <span style={{...status,...(on?statusOn:statusOff)}}>{on?"ACTIVE":"OFF"}</span>
                      </div>
                      <div style={miniLabel}>{catLabel}</div>
                      <h3 style={pluginName}>{p.name}</h3>
                      <p style={pluginDesc}>{p.description}</p>
                      <div style={cardBottom}>
                        <span style={code}>{p.code}</span>
                        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",justifyContent:"flex-end"}}>
                          <button className="plugin-btn" disabled={alwaysOn || saving===p.code} onClick={()=>toggle(p)} style={alwaysOn?ghost:(on?switchOn:switchOff)}>
                            {alwaysOn ? "Always On" : saving===p.code?"Saving…":on?"Deactivate":"Activate"}
                          </button>
                          {on && <button className="plugin-btn" onClick={()=>loadConfig(p)} style={ghost}>⚙ Configure</button>}
                        </div>
                      </div>
                      {configOpen===p.code && on && <PluginConfig plugin={p} config={config} setConfig={setConfig} themeOptions={themeOptions} onSave={()=>saveConfig(p)} onTest={testPluginConnection} onWhatsAppTest={testWhatsApp} onVoiceTest={()=>testCallingVoice(config,setMessage)} />}
                    </article>
                  })}
                </div>

                {!filtered.length&&<div style={emptyResults}>No plugins match the current filters.</div>}
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

const PLUGIN_SETTINGS = {
  "reservations-pro": {
    title:"Reservation Settings",
    sections:[
      {title:"Reservation Rules",fields:[
        ["enabled","Reservation accepting","toggle",true],
        ["auto_confirm","Auto-confirm reservations","toggle",true],
        ["advance_days","Maximum advance booking (days)","number",30],
        ["min_notice_minutes","Minimum notice (minutes)","number",30],
        ["default_duration_minutes","Default reservation duration (minutes)","number",90],
        ["allow_waitlist","Enable waitlist","toggle",true],
        ["allow_no_show","Track no-show status","toggle",true],
      ]},
      {title:"Table & Customer",fields:[
        ["auto_assign_table","Automatically assign table","toggle",false],
        ["allow_table_selection","Customer can request table","toggle",true],
        ["require_phone","Phone number required","toggle",true],
        ["require_email","Email required","toggle",false],
        ["max_guests","Maximum guests per reservation","number",20],
      ]},
      {title:"Deposit & Cancellation",fields:[
        ["deposit_enabled","Require deposit","toggle",false],
        ["deposit_type","Deposit type","select",["fixed","percentage"]],
        ["deposit_value","Deposit value","number",0],
        ["cancellation_hours","Free cancellation before (hours)","number",4],
      ]},
    ]
  },
  "operations-hub": {
    title:"Operations Hub Settings",
    sections:[
      {title:"Optional Controls",fields:[
        ["expenses_enabled","Expenses","toggle",true],
        ["cash_closing_enabled","Cash Closing","toggle",true],
      ]},
    ]
  },
  "theme-branding": {
    title:"Theme & Branding Settings",
    sections:[
      {title:"Restaurant Theme Control",fields:[
        ["theme_id","Theme to assign to this restaurant","theme_select",DEFAULT_THEME.id],
        ["theme_scope","Where should the selected restaurant theme apply?","select",["restaurant","qr","both"]],
      ]},
      {title:"Branding",fields:[
        ["show_restaurant_logo","Show restaurant logo across restaurant surfaces","toggle",true],
        ["show_brand_name","Show restaurant brand name","toggle",true],
      ]},
    ]
  },
  "restaurant-settings": {
    title:"Restaurant Settings",
    sections:[
      {title:"Restaurant Configuration",fields:[
        ["allow_admin_branding_changes","Allow restaurant Admin to edit branding","toggle",false],
        ["allow_admin_theme_changes","Allow restaurant Admin to change the active theme","toggle",false],
        ["admin_theme_change_scope","Allow Admin to change theme for","select",["none","restaurant","qr","both"]],
        ["allow_admin_operational_settings","Allow restaurant Admin to change operational settings","toggle",true],
      ]}
    ]
  },
  "qr-ordering-pro": {
    title:"Advanced QR Ordering Settings",
    sections:[
      {title:"Ordering",fields:[
        ["customer_name_required","Customer name required","toggle",false],
        ["customer_phone_required","Customer phone required","toggle",false],
        ["allow_reorder","Allow repeat/reorder","toggle",true],
        ["allow_cooking_request","Allow cooking instructions","toggle",true],
        ["allow_customer_request","Allow call/request waiter","toggle",true],
        ["auto_send_kitchen","Send confirmed order to kitchen","toggle",true],
      ]},
      {title:"Billing",fields:[
        ["payment_mode","Payment mode","select",["pay_at_counter","pay_online","both"]],
        ["service_charge_enabled","Service charge","toggle",false],
        ["service_charge_percent","Service charge %","number",0],
        ["minimum_order","Minimum order amount","number",0],
      ]}
    ]
  },
  "qr-print-center": {
    title:"QR Print Settings",
    sections:[{title:"QR Output",fields:[
      ["qr_size_mm","QR size (mm)","number",35],
      ["include_logo","Include restaurant logo","toggle",true],
      ["include_restaurant_name","Print restaurant name","toggle",true],
      ["include_table_number","Print table/room number","toggle",true],
      ["include_instruction","Print scan instruction","toggle",true],
      ["instruction_text","Scan instruction","text","Scan to order"],
    ]}]
  },
  "website-ordering": {
    title:"Website Ordering Settings",
    sections:[
      {title:"Connection",fields:[
        ["domain","Restaurant website domain","text",""],
        ["slug","Public ordering slug","text",""],
        ["auto_send_kitchen","Automatically send new order to kitchen","toggle",true],
      ]},
      {title:"Order Rules",fields:[
        ["order_mode","Allowed order mode","select",["pickup","delivery","both"]],
        ["minimum_order","Minimum order amount","number",0],
        ["accept_online_payment","Accept online payment","toggle",false],
        ["accept_cash","Accept cash on delivery/pickup","toggle",true],
        ["customer_phone_required","Customer phone required","toggle",true],
        ["customer_address_required","Delivery address required","toggle",false],
      ]}
    ]
  },
  "captain-app": {
    title:"Captain / Waiter Settings",
    sections:[
      {title:"Staff Workflow",fields:[
        ["allow_table_order","Allow table order taking","toggle",true],
        ["allow_open_order","Allow open order","toggle",false],
        ["auto_send_kot","Send KOT immediately after submit","toggle",true],
        ["allow_item_edit_after_kot","Allow edit after KOT","toggle",false],
        ["show_item_stock","Show live item availability","toggle",true],
        ["allow_discount_request","Allow discount request","toggle",false],
      ]},
      {title:"Access",fields:[
        ["require_pin","Require staff PIN","toggle",true],
        ["session_timeout_minutes","Session timeout (minutes)","number",480],
        ["restrict_to_assigned_tables","Restrict captain to assigned tables","toggle",false],
      ]}
    ]
  },
  "smart-notifications": {
    title:"Smart Notification Settings",
    sections:[
      {title:"Order Alerts",fields:[
        ["new_order","New order notification","toggle",true],
        ["kitchen_ready","Kitchen ready notification","toggle",true],
        ["payment_received","Payment received notification","toggle",true],
        ["delivery_update","Delivery status notification","toggle",true],
        ["reservation_alert","Reservation notification","toggle",true],
      ]},
      {title:"Channels",fields:[
        ["in_app","In-app notifications","toggle",true],
        ["sound","Notification sound","toggle",true],
        ["browser","Browser notification","toggle",false],
        ["email","Email notifications","toggle",false],
      ]}
    ]
  },
  "calling-device": {
    title:"Calling Device Settings",
    sections:[
      {title:"Voice",fields:[
        ["enabled","Voice announcement","toggle",true],
        ["language","Voice language","select",["en-IN","hi-IN","en-US"]],
        ["repeat","Repeat announcement","number",3],
        ["volume","Volume (0-1)","number",1],
        ["rate","Speech rate","number",0.9],
        ["phrase","Announcement phrase","text","New order received. Order {order_number} has arrived."],
      ]},
      {title:"Events",fields:[
        ["new_order","Announce new order","toggle",true],
        ["order_ready","Announce order ready","toggle",false],
        ["waiter_call","Announce waiter call","toggle",true],
      ]}
    ]
  },
  "offers": {
    title:"Offers & Combos Settings",
    sections:[
      {title:"Feature Access",fields:[
        ["offers_enabled","Offers","toggle",true],
        ["combos_enabled","Combos","toggle",true],
        ["monthly_limit","Monthly offer creation limit","number",10],
      ]},
      {title:"Offer Rules",fields:[
        ["allow_discount","Allow percentage/fixed discounts","toggle",true],
        ["auto_apply","Automatically apply eligible offer","toggle",false],
        ["allow_stack","Allow stacking multiple offers","toggle",false],
        ["require_coupon","Require coupon code","toggle",false],
      ]},
      {title:"Promotion",fields:[
        ["facebook_promotion","Allow Facebook promotion","toggle",false],
        ["instagram_promotion","Allow Instagram promotion","toggle",false],
        ["whatsapp_promotion","Allow WhatsApp promotion","toggle",false],
      ]}
    ]
  },
  "thermal-printing": {
    title:"Thermal / KOT Printer Settings",
    sections:[
      {title:"Printer",fields:[
        ["printer_name","Printer name / ID","text",""],
        ["printer_type","Printer type","select",["escpos","network","usb","bridge"]],
        ["bridge_url","Local printer bridge URL","text",""],
        ["ip","Printer IP","text",""],
        ["port","Printer port","number",9100],
        ["copies","Number of copies","number",1],
      ]},
      {title:"KOT",fields:[
        ["print_kot","Print KOT automatically","toggle",true],
        ["print_receipt","Print customer receipt","toggle",true],
        ["print_void","Print void/cancel slip","toggle",true],
        ["print_delivery","Print delivery order","toggle",true],
      ]}
    ]
  },
  "a4-invoice": {
    title:"A4 Invoice Settings",
    sections:[{title:"Invoice Printer",fields:[
      ["printer_name","Printer name / ID","text",""],
      ["bridge_url","Printer bridge URL","text",""],
      ["copies","Number of copies","number",1],
      ["auto_print","Auto-print finalized bill","toggle",false],
      ["include_gst","Show GST details","toggle",true],
      ["include_customer","Show customer details","toggle",true],
    ]}]
  },
  "hardware-print-queue": {
    title:"Hardware Print Queue Settings",
    sections:[{title:"Bridge",fields:[
      ["queue","Print queue / agent","text",""],
      ["bridge_url","Bridge URL","text",""],
      ["api_key","Bridge API key","password",""],
      ["retry_count","Retry count","number",3],
      ["retry_delay_ms","Retry delay (ms)","number",1000],
    ]}]
  },
  "cashfree-payment-gateway": {
    title:"Cashfree Payment Gateway",
    sections:[
      {title:"Gateway Connection",fields:[
        ["environment","Environment","select",["sandbox","production"]],
        ["client_id","Cashfree App ID / Client ID","text",""],
        ["client_secret","Cashfree Secret Key","password",""],
        ["api_version","Cashfree API Version","text","2025-01-01"],
      ]},
      {title:"Checkout & Order",fields:[
        ["enabled_for_restaurant","Allow restaurant to use Cashfree","toggle",true],
        ["customer_phone_required","Require customer phone","toggle",true],
        ["order_expiry_minutes","Cashfree order expiry (minutes)","number",30],
        ["return_url","Payment return URL (optional)","text",""],
        ["notify_url","Webhook URL (optional)","text",""],
      ]},
      {title:"Payment Modes",fields:[
        ["allow_upi","UPI","toggle",true],
        ["allow_cards","Cards","toggle",true],
        ["allow_netbanking","Net Banking","toggle",true],
        ["allow_wallets","Wallets","toggle",true],
      ]},
    ]
  },

  "whatsapp-invoice": {
    title:"WhatsApp Business API",
    sections:[
      {title:"Connection",fields:[
        ["provider","Provider","select",["meta-cloud"]],
        ["credential_owner","Credentials","select",["restaurant","platform"]],
        ["business_number","WhatsApp business number","text",""],
        ["phone_number_id","Phone Number ID","text",""],
        ["waba_id","WhatsApp Business Account ID","text",""],
        ["api_version","Graph API version","text","v23.0"],
        ["access_token","Permanent/System User access token","password",""],
        ["base_url","Graph API base URL","text","https://graph.facebook.com"],
      ]},
      {title:"Webhook",fields:[
        ["webhook_verify_token","Webhook verify token","password",""],
        ["webhook_app_secret","Meta App Secret","password",""],
      ]},
      {title:"Automatic Messages",fields:[
        ["send_invoice","Send invoice after billing","toggle",true],
        ["send_order_confirmation","Send order confirmation to customer","toggle",true],
        ["send_payment_receipt","Send payment receipt","toggle",false],
        ["send_qr_order_notification","Send new QR order to restaurant/staff","toggle",true],
        ["order_notification_recipient","Restaurant/staff WhatsApp recipient","text",""],
        ["invoice_template_name","Approved invoice template name","text","invoice_ready"],
        ["invoice_template_language","Template language","text","en_US"],
        ["order_template_name","Approved order confirmation template","text","order_confirmation"],
        ["qr_order_template_name","Approved QR order notification template","text","new_qr_order"],
        ["payment_template_name","Approved payment receipt template","text","payment_receipt"],
      ]},
      {title:"Test / Fallback",fields:[
        ["test_recipient","Test recipient number","text",""],
        ["allow_24h_text","Allow free-form text inside customer 24h window","toggle",true],
      ]}
    ]
  },

  "swiggy-integration": {
    title:"Swiggy Integration Settings",
    sections:[
      {title:"Partner Connection",fields:[
        ["outlet_id","Outlet / Store ID","text",""],
        ["base_url","Partner API base URL","text",""],
        ["api_key","API credential","password",""],
        ["webhook_secret","Webhook secret","password",""],
        ["webhook_signature_header","Webhook signature header","text","x-webhook-signature"],
        ["webhook_signature_algorithm","Webhook signature algorithm","text","sha256"],
        ["webhook_signature_prefix","Webhook signature prefix","text","sha256="],
        ["health_path","Connection test path","text","/"],
        ["environment","Environment","select",["sandbox","production"]],
      ]},
      {title:"Order Sync",fields:[
        ["accept_orders","Accept incoming orders","toggle",true],
        ["auto_kitchen","Send Swiggy orders to kitchen","toggle",true],
        ["sync_status","Sync order status back","toggle",true],
        ["sync_menu","Enable menu sync","toggle",false],
      ]}
    ]
  },
  "zomato-integration": {
    title:"Zomato Integration Settings",
    sections:[
      {title:"Partner Connection",fields:[
        ["outlet_id","Outlet ID","text",""],
        ["base_url","Partner API base URL","text",""],
        ["api_key","API credential","password",""],
        ["webhook_secret","Webhook secret","password",""],
        ["webhook_signature_header","Webhook signature header","text","x-webhook-signature"],
        ["webhook_signature_algorithm","Webhook signature algorithm","text","sha256"],
        ["webhook_signature_prefix","Webhook signature prefix","text","sha256="],
        ["health_path","Connection test path","text","/"],
        ["environment","Environment","select",["sandbox","production"]],
      ]},
      {title:"Order Sync",fields:[
        ["accept_orders","Accept incoming orders","toggle",true],
        ["auto_kitchen","Send Zomato orders to kitchen","toggle",true],
        ["sync_status","Sync order status back","toggle",true],
        ["sync_menu","Enable menu sync","toggle",false],
      ]}
    ]
  },
  "facebook-integration": {
    title:"Facebook Settings",
    sections:[
      {title:"Meta Connection",fields:[
        ["account_id","Facebook Page ID","text",""],
        ["access_token","Page access token","password",""],
        ["base_url","Graph API base URL","text","https://graph.facebook.com"],
      ]},
      {title:"Publishing",fields:[
        ["publish_offers","Publish offers","toggle",false],
        ["publish_manual","Allow manual publishing","toggle",true],
        ["default_hashtags","Default hashtags","text",""],
      ]}
    ]
  },
  "instagram-integration": {
    title:"Instagram Settings",
    sections:[
      {title:"Meta Connection",fields:[
        ["account_id","Instagram Professional Account ID","text",""],
        ["access_token","Access token","password",""],
        ["base_url","Graph API base URL","text","https://graph.facebook.com"],
      ]},
      {title:"Publishing",fields:[
        ["publish_offers","Publish offers","toggle",false],
        ["publish_manual","Allow manual publishing","toggle",true],
        ["default_hashtags","Default hashtags","text",""],
      ]}
    ]
  }
}

function testCallingVoice(config = {}, setMessage = () => {}) {
  unlockCallingAudio()
  const ok = speakCallingAnnouncement(
    "New order received. Order TEST 001 has arrived in the kitchen.",
    {
      language: config?.language || "hi-IN",
      volume: Number(config?.volume ?? 1),
      rate: Number(config?.rate ?? .9),
      repeat: Number(config?.repeat ?? 1),
    },
    {
      onError: error => setMessage(`❌ Calling voice: ${error}`),
    }
  )
  if (!ok) setMessage("❌ Calling voice is unavailable on this device.")
  else setMessage("🔊 Calling voice test started.")
}

function PluginConfig({plugin,config,setConfig,themeOptions=[],onSave,onTest,onWhatsAppTest,onVoiceTest}){
  const schema=PLUGIN_SETTINGS[plugin.code]
  const set=(key,value)=>setConfig(c=>{
    const next={...c,[key]:value}

    // Theme permission is a two-part policy: the master checkbox and the
    // scope. If Super Admin enables the permission without choosing a scope,
    // default the scope to BOTH instead of silently leaving the Admin locked.
    if (plugin.code === "restaurant-settings" && key === "allow_admin_theme_changes") {
      if (value === true && String(c.admin_theme_change_scope || "none").toLowerCase() === "none") {
        next.admin_theme_change_scope = "both"
      }
      if (value === false) {
        next.admin_theme_change_scope = "none"
      }
    }

    return next
  })
  if(!schema){
    return <div className="plugin-settings-panel" style={configBox}><div style={miniLabel}>PLUGIN RUNTIME</div><p style={sectionText}>This plugin uses the application's canonical runtime. No restaurant-specific credentials are required for this module.</p><div className="plugin-settings-save" style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}><button className="plugin-btn" onClick={onSave} style={hubActivate}>💾 Save Settings</button><button className="plugin-btn" onClick={()=>onTest(plugin)} style={success}>🧪 Test Runtime</button></div></div>
  }
  return <div style={configBox}>
    <div style={miniLabel}>RESTAURANT-SPECIFIC SETTINGS · {schema.title.toUpperCase()}</div>
    {schema.sections.map(section=><div key={section.title} style={{marginTop:12}}>
      <h4 style={{margin:"0 0 7px",fontSize:12}}>{section.title}</h4>
      <div className="plugin-settings-grid" style={settingsGrid}>
        {section.fields.map(([key,label,type,defaultValue])=>{
          const value=config[key] ?? defaultValue
          if(type==="toggle") return <label key={key} className="plugin-setting-toggle" style={settingRow}><span>{label}</span><input type="checkbox" checked={Boolean(value)} onChange={e=>set(key,e.target.checked)}/></label>
          if(type==="theme_select") {
            const selected = value || defaultValue || DEFAULT_THEME.id
            return <label key={key} style={field}>
              <span>{label}</span>
              <select value={selected} onChange={e=>set(key,e.target.value)} style={searchInput}>
                {themeOptions.map(x=><option key={x.id} value={x.id}>{x.name}{x.id===DEFAULT_THEME.id?" — MAIN THEME":""}</option>)}
              </select>
              <small style={{color:"var(--muted)",lineHeight:1.4}}>
                Super Admin assignment. This is the theme the restaurant receives until an allowed Admin changes it.
              </small>
            </label>
          }
          if(type==="select") {
             const options=Array.isArray(defaultValue)?defaultValue:[]
             let selected=Array.isArray(value)?(value[0]??options[0]??""):(value??options[0]??"")
             // A legacy configuration may have the permission checkbox ON but
             // the scope still set to none. Show BOTH in that case so the
             // saved UI matches the effective permission.
             if (plugin.code === "restaurant-settings" && key === "admin_theme_change_scope" &&
                 config.allow_admin_theme_changes === true && String(selected).toLowerCase() === "none") {
               selected = "both"
             }
             return <label key={key} style={field}><span>{label}</span><select value={selected} onChange={e=>set(key,e.target.value)} style={searchInput}>{options.map(x=><option key={String(x)} value={x}>{x}</option>)}</select></label>
           }
          return <label key={key} style={field}><span>{label}</span>{type==="textarea"?<textarea rows={3} value={value||""} onChange={e=>set(key,e.target.value)} style={searchInput}/>:<input type={type==="number"?"number":type} value={value??""} onChange={e=>set(key,type==="number"?Number(e.target.value):e.target.value)} style={searchInput}/>}</label>
        })}
      </div>
    </div>)}
    <div className="plugin-settings-save" style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>
      <button className="plugin-btn" onClick={onSave} style={hubActivate}>💾 Save {schema.title}</button>
      <button className="plugin-btn" onClick={()=>onTest(plugin)} style={success}>🧪 Test Connection</button>
      {plugin.code==="calling-device" && <button className="plugin-btn" onClick={onVoiceTest} style={success}>🔊 Test Voice</button>}
      {plugin.code==="whatsapp-invoice" && <button className="plugin-btn" onClick={onWhatsAppTest} style={success}>📨 Send Test WhatsApp</button>}
      <button className="plugin-btn" onClick={()=>setConfig({})} style={ghost}>Reset Form</button>
    </div>
  </div>
}

function Stat({icon,label,value}){return <div style={stat}><span style={{fontSize:23}}>{icon}</span><small>{label}</small><strong title={String(value)}>{value}</strong></div>}

const configBox={marginTop:12,padding:15,borderRadius:14,background:"var(--background)",border:"1px solid var(--border)"}
const settingsGrid={display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:9}
const field={display:"grid",gap:5,fontSize:10,fontWeight:900,color:"var(--muted)"}
const settingRow={display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,padding:"10px 11px",borderRadius:10,border:"1px solid var(--border)",fontSize:10,fontWeight:900,color:"var(--muted)",background:"var(--surface)"}
const shell={minHeight:"100vh"}
const hero={padding:"30px",borderRadius:24,marginBottom:14,position:"relative",overflow:"hidden",background:"linear-gradient(135deg,var(--surface),rgba(var(--primary-rgb),.06))",border:"1px solid var(--border)",boxShadow:"0 18px 60px rgba(0,0,0,.12)"}
const heroGlow={position:"absolute",width:320,height:320,right:-100,top:-150,borderRadius:"50%",background:"rgba(var(--primary-rgb),.12)",filter:"blur(12px)"}
const eyebrow={fontSize:10,fontWeight:900,letterSpacing:1.5,color:"var(--primary)"}
const miniLabel={fontSize:10,fontWeight:900,letterSpacing:1.25,color:"var(--muted)",fontWeight:900}
const title={fontSize:40,margin:"5px 0 8px",letterSpacing:-1}
const subtitle={maxWidth:760,margin:0,color:"var(--muted)",lineHeight:1.65}
const heroBadges={display:"flex",gap:8,flexWrap:"wrap",marginTop:18}
const badge={padding:"8px 11px",borderRadius:999,background:"rgba(var(--primary-rgb),.08)",border:"1px solid rgba(var(--primary-rgb),.16)",fontSize:11,fontWeight:800}
const heroBadge={display:"grid",gridTemplateColumns:"auto auto",gap:"0 8px",alignItems:"center",padding:"14px 17px",minWidth:130,borderRadius:18,background:"rgba(var(--primary-rgb),.08)",border:"1px solid rgba(var(--primary-rgb),.18)"}
const topBar={display:"flex",justifyContent:"space-between",gap:18,alignItems:"end",flexWrap:"wrap",padding:"14px 16px",marginBottom:14,borderRadius:18,background:"var(--surface)",border:"1px solid var(--border)"}
const restaurantBox={display:"grid",gap:7}
const restaurantSearchWrap={display:"flex",alignItems:"center",gap:7,padding:"0 11px",borderRadius:11,border:"1px solid var(--border)",background:"var(--background)"}
const searchInput={width:190,padding:"10px 0",border:0,outline:"none",background:"transparent",color:"var(--text)"}
const select={padding:"10px 12px",minWidth:270,borderRadius:11,border:"1px solid var(--border)",background:"var(--background)",color:"var(--text)"}
const actionRow={display:"flex",gap:8,flexWrap:"wrap"}
const ghost={padding:"10px 13px",borderRadius:11,border:"1px solid var(--border)",background:"var(--background)",color:"var(--text)",fontWeight:800,cursor:"pointer"}
const success={...ghost,border:"1px solid rgba(34,197,94,.3)",color:"var(--success)"}
const danger={...ghost,border:"1px solid rgba(248,113,113,.3)",color:"var(--danger)"}
const toast={padding:"11px 14px",marginBottom:14,borderRadius:12,background:"rgba(var(--primary-rgb),.08)",border:"1px solid rgba(var(--primary-rgb),.18)",fontWeight:800}
const welcome={display:"flex",alignItems:"center",gap:18,padding:30,borderRadius:22,marginBottom:14,background:"var(--surface)",border:"1px solid var(--border)"}
const welcomeIcon={width:62,height:62,borderRadius:19,display:"grid",placeItems:"center",fontSize:30,background:"rgba(var(--primary-rgb),.1)"}
const stats={display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12,marginBottom:14}
const stat={padding:16,borderRadius:17,background:"var(--surface)",border:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:4,minWidth:0}
const hubPanel={padding:22,borderRadius:22,marginBottom:22,background:"linear-gradient(135deg,var(--surface),rgba(var(--primary-rgb),.045))",border:"1px solid rgba(var(--primary-rgb),.16)"}
const sectionHead={display:"flex",justifyContent:"space-between",gap:12,alignItems:"end",marginBottom:14,flexWrap:"wrap"}
const sectionTitle={margin:"4px 0 3px",fontSize:23}
const sectionText={margin:0,color:"var(--muted)",fontSize:12}
const masterStatus={padding:"7px 10px",borderRadius:999,background:"rgba(var(--primary-rgb),.08)",color:"var(--primary)",fontSize:10,fontWeight:900}
const hubCard={display:"flex",gap:12,padding:15,borderRadius:17,background:"var(--background)",border:"1px solid var(--border)",minWidth:0}
const hubCardOn={border:"1px solid rgba(var(--primary-rgb),.28)",boxShadow:"0 10px 30px rgba(var(--primary-rgb),.06)"}
const hubIcon={width:50,height:50,borderRadius:15,display:"grid",placeItems:"center",fontSize:25,background:"rgba(var(--primary-rgb),.1)",flexShrink:0}
const hubActivate={padding:"9px 12px",borderRadius:10,border:"1px solid rgba(var(--primary-rgb),.3)",background:"rgba(var(--primary-rgb),.08)",color:"var(--primary)",fontWeight:900,cursor:"pointer"}
const hubDeactivate={padding:"9px 12px",borderRadius:10,border:"1px solid rgba(248,113,113,.3)",background:"rgba(248,113,113,.07)",color:"var(--danger)",fontWeight:900,cursor:"pointer"}
const side={padding:16,borderRadius:20,background:"var(--surface)",border:"1px solid var(--border)",position:"sticky",top:14,height:"fit-content"}
const sideTitle={padding:"7px 8px",fontSize:10,fontWeight:900,letterSpacing:1.3,color:"var(--muted)"}
const sideSearch={display:"flex",alignItems:"center",gap:7,padding:"0 10px",marginBottom:8,borderRadius:11,border:"1px solid var(--border)",background:"var(--background)"}
const sideItem={width:"100%",display:"flex",alignItems:"center",gap:8,padding:"10px 9px",marginBottom:3,border:0,borderRadius:10,background:"transparent",color:"var(--text)",textAlign:"left",cursor:"pointer",fontWeight:800}
const sideActive={background:"rgba(var(--primary-rgb),.09)",color:"var(--primary)"}
const sideDivider={height:1,background:"var(--border)",margin:"12px 7px"}
const sideNote={marginTop:12,padding:11,borderRadius:12,background:"rgba(var(--primary-rgb),.05)",fontSize:10,lineHeight:1.55,color:"var(--muted)"}
const contentHeader={display:"flex",justifyContent:"space-between",alignItems:"end",gap:10,marginBottom:12,flexWrap:"wrap"}
const resultPill={padding:"7px 10px",borderRadius:999,background:"var(--surface)",border:"1px solid var(--border)",fontSize:10,fontWeight:900,color:"var(--muted)"}
const pluginCard={padding:19,borderRadius:19,background:"var(--surface)",border:"1px solid var(--border)",display:"flex",flexDirection:"column",minHeight:210,transition:"all .18s"}
const pluginOn={border:"1px solid rgba(var(--primary-rgb),.25)",boxShadow:"0 12px 34px rgba(var(--primary-rgb),.05)"}
const cardTop={display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}
const pluginIcon={width:46,height:46,borderRadius:14,display:"grid",placeItems:"center",fontSize:23,background:"rgba(var(--primary-rgb),.08)"}
const status={padding:"5px 8px",borderRadius:999,fontSize:9,fontWeight:900,letterSpacing:1}
const statusOn={background:"rgba(34,197,94,.1)",color:"var(--success)",border:"1px solid rgba(34,197,94,.2)"}
const statusOff={background:"rgba(148,163,184,.08)",color:"var(--muted)",border:"1px solid var(--border)"}
const pluginName={fontSize:16,margin:"4px 0 6px"}
const pluginDesc={fontSize:11,color:"var(--muted)",lineHeight:1.55,margin:"5px 0 12px"}
const cardBottom={display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginTop:"auto"}
const code={fontSize:9,color:"var(--muted)",fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis"}
const switchOn={padding:"8px 10px",borderRadius:10,border:"1px solid rgba(248,113,113,.3)",background:"rgba(248,113,113,.07)",color:"var(--danger)",fontWeight:900,cursor:"pointer"}
const switchOff={padding:"8px 10px",borderRadius:10,border:"1px solid rgba(var(--primary-rgb),.3)",background:"rgba(var(--primary-rgb),.08)",color:"var(--primary)",fontWeight:900,cursor:"pointer"}
const emptyResults={padding:40,textAlign:"center",borderRadius:18,background:"var(--surface)",border:"1px dashed var(--border)",color:"var(--muted)"}
const loadingCard={maxWidth:480,margin:"18vh auto",padding:32,textAlign:"center",borderRadius:20,background:"var(--surface)",border:"1px solid var(--border)",color:"var(--text)"}