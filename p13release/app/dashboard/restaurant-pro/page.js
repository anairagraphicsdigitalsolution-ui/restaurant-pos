 "use client"

import { useEffect, useMemo, useState } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { FEATURE_CATALOG, CORE_FEATURE_CODES, OPERATIONS_FEATURE_CODES, INVENTORY_FEATURE_CODES } from "@/lib/featureCatalog"

const OPEN_RUNTIME = {
  "qr-ordering-pro": ["/dashboard/qr", "Open QR Ordering"],
  "qr-print-center": ["/dashboard/qr?view=print", "Open QR Print Center"],
  "smart-notifications": ["/dashboard/notifications", "Open Notifications"],
  "calling-device": ["/dashboard/calling", "Open Calling Device"],
  "captain-app": ["/staff", "Open Captain / Waiter"],
  "offers": ["/dashboard/offers", "Open Offers & Combos"],
}

export default function RestaurantProPage(){
  const [restaurant,setRestaurant]=useState(null)
  const [active,setActive]=useState({})
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState("")

  useEffect(()=>{ load() },[])

  async function load(){
    setLoading(true); setMessage("")
    try{
      const {data:{user}}=await supabaseCloud.auth.getUser()
      if(!user){ setLoading(false); return }

      const {data:profile,error:profileError}=await supabaseCloud
        .from("profiles")
        .select("restaurant_id,role")
        .eq("id",user.id)
        .maybeSingle()

      if(profileError) throw profileError
      if(!profile?.restaurant_id) { setLoading(false); return }

      const rid=profile.restaurant_id
      const [{data:r,error:restaurantError},{data:rows,error:pluginError}]=await Promise.all([
        supabaseCloud.from("restaurants").select("id,name").eq("id",rid).maybeSingle(),
        supabaseCloud.from("restaurant_plugins").select("plugin_code,enabled").eq("restaurant_id",rid)
      ])

      if(restaurantError) throw restaurantError
      if(pluginError) throw pluginError

      setRestaurant(r||null)

      const state={}
      for(const row of rows||[]) state[row.plugin_code]=row.enabled===true
      setActive(state)
    }catch(e){
      setMessage(`❌ ${e.message||"Unable to load Pro features"}`)
    }finally{
      setLoading(false)
    }
  }

  const visible=useMemo(()=>FEATURE_CATALOG.filter(f=>{
    if(f.code === "combos-variants") return false // internal runtime is managed by Offers & Combos
    if(CORE_FEATURE_CODES.has(f.code)||OPERATIONS_FEATURE_CODES.has(f.code)||INVENTORY_FEATURE_CODES.has(f.code)) return false
    return active[f.code]===true || (f.aliases||[]).some(a=>active[a]===true)
  }),[active])

  const grouped=useMemo(()=>{
    const m={}
    for(const f of visible) (m[f.category] ||= []).push(f)
    return m
  },[visible])

  if(loading) return <main style={shell}><div style={loadingCard}>Loading Restaurant Pro…</div></main>

  return (
    <main style={shell}>
      <div style={wrap}>
        <header style={hero}>
          <div>
            <div style={eyebrow}>RESTAURANT PRO</div>
            <h1 style={title}>{restaurant?.name||"Restaurant"}</h1>
            <p style={muted}>
              Pro plugins enabled by Super Admin are shown here. Configuration, credentials,
              limits and activation are managed only from Super Admin.
            </p>
          </div>
          <span style={badge}>🔐 Super Admin controlled</span>
        </header>

        {message && <div style={toast}>{message}</div>}

        {!visible.length ? (
          <div style={empty}>
            <b>No Restaurant Pro plugin is active.</b>
            <span>Ask Super Admin to activate a Pro plugin for this restaurant.</span>
          </div>
        ) : (
          Object.entries(grouped).map(([category,features])=>(
            <section key={category} style={section}>
              <div style={sectionHead}>
                <div>
                  <div style={eyebrow}>{category.toUpperCase()}</div>
                  <h2 style={sectionTitle}>{category}</h2>
                </div>
                <span style={count}>{features.length} active</span>
              </div>

              <div style={grid}>
                {features.map(f=>{
                  const runtime=OPEN_RUNTIME[f.code]
                  return (
                    <article key={f.code} style={card}>
                      <div style={cardTop}>
                        <div style={icon}>{f.icon||"🧩"}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <h3 style={cardTitle}>{f.name}</h3>
                          <p style={muted}>{f.description}</p>
                        </div>
                        <span style={activeBadge}>ACTIVE</span>
                      </div>

                      {runtime ? (
                        <a href={runtime[0]} style={primary}>{runtime[1]} →</a>
                      ) : (
                        <div style={managed}>
                          <span>⚙️ Configuration managed by Super Admin</span>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  )
}

const shell={minHeight:"100vh",padding:"28px",background:"var(--background)",color:"var(--text)"}
const wrap={maxWidth:1400,margin:"0 auto"}
const hero={padding:26,borderRadius:24,background:"var(--surface)",border:"1px solid var(--border)",display:"flex",justifyContent:"space-between",gap:18,alignItems:"center",flexWrap:"wrap",marginBottom:16}
const title={fontSize:32,margin:"5px 0 7px",fontWeight:900}
const eyebrow={fontSize:10,fontWeight:900,letterSpacing:1.5,color:"var(--primary)"}
const muted={color:"var(--muted)",lineHeight:1.55,margin:0,fontSize:12}
const badge={padding:"8px 12px",borderRadius:999,background:"rgba(var(--primary-rgb),.09)",fontSize:11,fontWeight:900}
const toast={padding:"11px 14px",borderRadius:12,background:"rgba(var(--primary-rgb),.1)",marginBottom:14}
const section={padding:20,borderRadius:22,background:"var(--surface)",border:"1px solid var(--border)",marginBottom:18}
const sectionHead={display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:14}
const sectionTitle={margin:"4px 0 0",fontSize:20}
const count={fontSize:10,fontWeight:900,padding:"6px 10px",borderRadius:999,background:"rgba(var(--primary-rgb),.08)"}
const grid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(310px,1fr))",gap:14}
const card={padding:17,borderRadius:18,border:"1px solid var(--border)",background:"var(--surface-2)"}
const cardTop={display:"flex",gap:11,alignItems:"flex-start",marginBottom:13}
const icon={width:44,height:44,borderRadius:13,display:"grid",placeItems:"center",fontSize:22,background:"rgba(var(--primary-rgb),.08)",flex:"0 0 auto"}
const cardTitle={fontSize:16,margin:"0 0 4px"}
const activeBadge={fontSize:9,fontWeight:900,color:"var(--success)",background:"rgba(34,197,94,.12)",padding:"5px 7px",borderRadius:999}
const primary={display:"inline-flex",alignItems:"center",justifyContent:"center",border:0,borderRadius:11,padding:"10px 13px",background:"var(--primary)",color:"#111",fontWeight:900,textDecoration:"none",cursor:"pointer"}
const managed={padding:"10px 12px",borderRadius:11,background:"var(--surface)",border:"1px dashed var(--border)",color:"var(--muted)",fontSize:11,fontWeight:800}
const empty={maxWidth:650,margin:"15vh auto",padding:30,borderRadius:22,background:"var(--surface)",border:"1px solid var(--border)",display:"grid",gap:8,textAlign:"center"}
const loadingCard={maxWidth:500,margin:"15vh auto",padding:30,textAlign:"center",borderRadius:20,background:"var(--surface)",border:"1px solid var(--border)"}
