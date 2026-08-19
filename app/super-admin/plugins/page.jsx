"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

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
    const {data:{session}}=await supabase.auth.getSession()
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
      setCatalog(data.catalog||[])
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
      setCatalog(data.catalog||catalog)
      setInstalled(data.plugins||[])
    }catch(e){
      setMessage(`❌ ${e.message}`)
    }
  }

  const merged=useMemo(()=>catalog.map(c=>({
    ...c,
    plugin:installed.find(p=>p.plugin_code===c.code)||null
  })),[catalog,installed])

  const categories=["All",...Array.from(new Set(catalog.map(x=>x.category).filter(Boolean)))]
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

  async function toggle(plugin){
    if(!selected) return
    const row=plugin.plugin
    setSaving(plugin.code)
    setMessage("")
    try{
      const headers=await authHeaders()
      const res=await fetch("/api/super-admin/plugins",{
        method:row?"PATCH":"POST",
        headers,
        body:JSON.stringify(row
          ? {restaurant_id:selected.id,id:row.id,enabled:!row.enabled}
          : {restaurant_id:selected.id,plugin_code:plugin.code}
        )
      })
      const data=await res.json()
      if(!res.ok||!data.success) throw new Error(data.error||"Plugin update failed")
      await selectRestaurant(selected)
      if(typeof window!=="undefined") window.dispatchEvent(new CustomEvent("anaira:plugins-updated"))
      setMessage(`✅ ${plugin.name} ${row?.enabled?"deactivated":"activated"}`)
    }catch(e){
      setMessage(`❌ ${e.message}`)
    }finally{
      setSaving("")
    }
  }

  async function setAll(enabled){
    if(!selected) return
    const rows=enabled ? merged.filter(x=>!x.plugin) : installed.filter(x=>x.enabled).map(x=>({
      code:x.plugin_code,
      name:x.display_name||x.plugin_code,
      plugin:x
    }))
    if(!rows.length){
      setMessage(enabled?"All plugins are already installed.":"No active plugins to disable.")
      return
    }
    const action=enabled?"activate":"deactivate"
    if(!confirm(`${action[0].toUpperCase()+action.slice(1)} ${rows.length} plugins for ${selected.name}?`)) return

    const headers=await authHeaders()
    setSaving("__all__")
    try{
      for(const item of rows){
        if(enabled){
          await fetch("/api/super-admin/plugins",{
            method:"POST",headers,
            body:JSON.stringify({restaurant_id:selected.id,plugin_code:item.code})
          })
        }else{
          await fetch("/api/super-admin/plugins",{
            method:"PATCH",headers,
            body:JSON.stringify({restaurant_id:selected.id,id:item.plugin.id,enabled:false})
          })
        }
      }
      await selectRestaurant(selected)
      if(typeof window!=="undefined") window.dispatchEvent(new CustomEvent("anaira:plugins-updated"))
      setMessage(`✅ ${enabled?"Plugins activated":"Plugins deactivated"}`)
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
        @media(max-width:1180px){.plugin-grid{grid-template-columns:1fr}.plugin-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.hub-cards{grid-template-columns:1fr}}
        @media(max-width:650px){.plugin-pro-shell{padding:12px 10px 35px}.plugin-cards{grid-template-columns:1fr}.stats-grid{grid-template-columns:1fr 1fr!important}}
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
              <button className="plugin-btn" style={success} disabled={saving==="__all__"} onClick={()=>setAll(true)}>⚡ Activate All</button>
              <button className="plugin-btn" style={danger} disabled={saving==="__all__"} onClick={()=>setAll(false)}>⏻ Disable All</button>
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
                  const on=p.plugin?.enabled===true
                  return <article key={p.code} style={{...hubCard,...(on?hubCardOn:{})}}>
                    <div style={hubIcon}>{p.icon||"🧩"}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
                        <h3 style={{margin:0,fontSize:16}}>{p.name}</h3>
                        <span style={{...status,...(on?statusOn:statusOff)}}>{on?"ACTIVE":"LOCKED"}</span>
                      </div>
                      <p style={pluginDesc}>{p.description}</p>
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
                        <button className="plugin-btn" disabled={saving===p.code} onClick={()=>toggle(p)} style={on?switchOn:switchOff}>
                          {saving===p.code?"Saving…":on?"Deactivate":"Activate"}
                        </button>
                      </div>
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

function Stat({icon,label,value}){return <div style={stat}><span style={{fontSize:23}}>{icon}</span><small>{label}</small><strong title={String(value)}>{value}</strong></div>}

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
const danger={...ghost,border:"1px solid rgba(248,113,113,.3)",color:"#ef4444"}
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
const hubDeactivate={padding:"9px 12px",borderRadius:10,border:"1px solid rgba(248,113,113,.3)",background:"rgba(248,113,113,.07)",color:"#ef4444",fontWeight:900,cursor:"pointer"}
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
const switchOn={padding:"8px 10px",borderRadius:10,border:"1px solid rgba(248,113,113,.3)",background:"rgba(248,113,113,.07)",color:"#ef4444",fontWeight:900,cursor:"pointer"}
const switchOff={padding:"8px 10px",borderRadius:10,border:"1px solid rgba(var(--primary-rgb),.3)",background:"rgba(var(--primary-rgb),.08)",color:"var(--primary)",fontWeight:900,cursor:"pointer"}
const emptyResults={padding:40,textAlign:"center",borderRadius:18,background:"var(--surface)",border:"1px dashed var(--border)",color:"var(--muted)"}
const loadingCard={maxWidth:480,margin:"18vh auto",padding:32,textAlign:"center",borderRadius:20,background:"var(--surface)",border:"1px solid var(--border)",color:"var(--text)"}
