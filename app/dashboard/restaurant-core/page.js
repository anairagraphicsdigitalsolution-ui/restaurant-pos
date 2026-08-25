"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useTheme } from "@/components/ThemeProvider"

const modes=["dine_in","takeaway","delivery","quick_order"]
const money=n=>`₹${Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2})}`

export default function RestaurantCore(){
  const searchParams = useSearchParams()
  const { refreshTheme } = useTheme()
  const [rid,setRid]=useState("")
  const [orders,setOrders]=useState([])
  const [tables,setTables]=useState([])
  const [selected,setSelected]=useState("")
  const [tab,setTab]=useState(searchParams.get("tab") || "pos")
  const [loading,setLoading]=useState(true)
  const [pluginEnabled,setPluginEnabled]=useState(false)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState("")
  const [mode,setMode]=useState("dine_in")
  const [amount,setAmount]=useState("")
  const [method,setMethod]=useState("cash")
  const [parts,setParts]=useState(2)
  const [reason,setReason]=useState("")
  const [toTable,setToTable]=useState("")

  useEffect(()=>{
    const requested = searchParams.get("tab") || "pos"
    const allowed = ["pos","tables","kds","billing","inventory","delivery","crm","analytics"]
    setTab(allowed.includes(requested) ? requested : "pos")
  },[searchParams])

  useEffect(()=>{
    refreshTheme().catch(()=>{})
    init()
  },[refreshTheme])
  async function init(){
    const {data:{user}}=await supabase.auth.getUser()
    if(!user){setLoading(false);return}
    const {data:p}=await supabase.from("profiles").select("restaurant_id").eq("id",user.id).single()
    if(!p?.restaurant_id){setLoading(false);return}
    setRid(p.restaurant_id);
    const { data: pluginRow } = await supabase.from("restaurant_plugins").select("enabled").eq("restaurant_id", p.restaurant_id).eq("plugin_code", "restaurant-core").maybeSingle()
    const enabled = pluginRow?.enabled === true
    setPluginEnabled(enabled)
    if (enabled) await load(p.restaurant_id)
    setLoading(false)
  }
  async function load(r=rid){
    if(!r)return
    const [{data:o},{data:t}]=await Promise.all([
      supabase.from("orders").select("id,status,total_amount,payment_status,source_type,source_id,source_label,order_mode,priority,created_at,hold_status").eq("restaurant_id",r).order("created_at",{ascending:false}).limit(100),
      supabase.from("tables").select("id,table_number,seats,status,floor,section").eq("restaurant_id",r).order("table_number")
    ])
    setOrders(o||[]);setTables(t||[])
  }
  const order=useMemo(()=>orders.find(x=>x.id===selected),[orders,selected])
  async function op(action,extra={}){
    if(!selected && !["mode"].includes(action)){setMessage("Select an order first");return}
    setBusy(true);setMessage("")
    try{
      const {data:{session}}=await supabase.auth.getSession()
      const res=await fetch("/api/restaurant/operations",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session?.access_token||""}`},body:JSON.stringify({action,order_id:selected,...extra})})
      const out=await res.json()
      if(!res.ok||!out.success)throw new Error(out.error||"Operation failed")
      setMessage("✅ Done");await load()
    }catch(e){setMessage(`❌ ${e.message}`)}finally{setBusy(false)}
  }
  if(loading)return <main className="core-page" style={wrap}>\n    <style jsx global>{`
@media(max-width:1100px){.core-grid2{grid-template-columns:1fr!important}.core-table-grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))!important}}
@media(max-width:700px){.core-page{padding:14px!important}.core-grid2{gap:14px!important}.core-button-grid,.core-mode-grid{grid-template-columns:1fr!important}.core-inline{grid-template-columns:1fr!important}.core-table-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.core-card{padding:16px!important}.core-action-row{grid-template-columns:1fr!important}.core-action-row button{width:100%!important}.core-tabs{display:flex!important;overflow-x:auto!important;flex-wrap:nowrap!important;padding-bottom:5px!important}.core-tabs button{flex:0 0 auto!important}}
`}</style><div style={empty}>Loading Restaurant Core…</div></main>
  if(!pluginEnabled) return <main style={{minHeight:"100vh",padding:"40px",display:"grid",placeItems:"center",background:"var(--background)",color:"var(--text)"}}>
    <div style={{maxWidth:620,padding:32,borderRadius:24,background:"var(--surface)",border:"1px solid var(--border)",textAlign:"center"}}>
      <div style={{fontSize:48}}>🔒</div>
      <div style={{fontSize:11,fontWeight:900,letterSpacing:1.5,color:"var(--primary)"}}>SUPER ADMIN CONTROL</div>
      <h1 style={{margin:"8px 0"}}>Restaurant Core</h1>
      <p style={{color:"var(--muted)",lineHeight:1.6}}>Core POS, tables, KDS, billing and restaurant operations are controlled by Super Admin.</p>
      <p style={{fontSize:12,color:"var(--muted)"}}>This module is locked until Super Admin activates its plugin for this restaurant.</p>
      <a href="/dashboard" style={{display:"inline-block",marginTop:10,padding:"11px 16px",borderRadius:12,background:"var(--primary)",color:"var(--text)",textDecoration:"none",fontWeight:800}}>← Back to Dashboard</a>
    </div>
  </main>

  return (
    <main className="core-page" style={wrap}>
      <style jsx global>{`
        .core-shell{max-width:1440px;margin:0 auto;display:grid;grid-template-columns:250px minmax(0,1fr);gap:20px;align-items:start}
        .core-sidebar{position:sticky;top:18px;max-height:calc(100vh - 36px);overflow:auto;padding:16px;border:1px solid var(--border);border-radius:var(--radius);background:linear-gradient(180deg,var(--surface),var(--surface-2));box-shadow:0 18px 50px rgba(0,0,0,.22)}
        .core-brand{padding:8px 10px 16px;border-bottom:1px solid rgba(var(--primary-rgb),.2);margin-bottom:14px}
        .core-brand-kicker{font-size:10px;font-weight:900;letter-spacing:1.5px;color:var(--primary)}
        .core-brand-title{font-size:19px;font-weight:900;margin-top:5px}
        .core-menu-group{margin-top:16px}
        .core-menu-label{padding:0 10px 7px;font-size:10px;font-weight:900;letter-spacing:1.3px;color:var(--muted);text-transform:uppercase}
        .core-menu-main{width:100%;display:flex;align-items:center;gap:10px;padding:11px 10px;border-radius:12px;border:1px solid transparent;background:transparent;color:var(--text);font-weight:900;text-align:left;cursor:pointer}
        .core-menu-main:hover{background:rgba(var(--primary-rgb),.06)}
        .core-menu-main.active{background:rgba(var(--primary-rgb),.11);border-color:rgba(var(--primary-rgb),.25);color:var(--primary)}
        .core-submenu{margin:4px 0 0 18px;padding-left:10px;border-left:1px solid rgba(var(--primary-rgb),.16);display:grid;gap:3px}
        .core-sub{width:100%;padding:8px 9px;border:0;background:transparent;color:var(--muted);border-radius:9px;text-align:left;font-size:12px;font-weight:800;cursor:pointer}
        .core-sub:hover,.core-sub.active{background:rgba(var(--primary-rgb),.08);color:var(--primary)}
        .core-content{min-width:0}
        .core-header{padding:22px 24px;border:1px solid var(--border);border-radius:var(--radius);background:linear-gradient(135deg,var(--surface),var(--surface-2));margin-bottom:16px}
        .core-header-row{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}
        .core-title{font-size:34px;line-height:1.08;margin:5px 0 8px;color:var(--text)}
        .core-subtitle{margin:0;color:var(--muted);line-height:1.55}
        .core-mobile-menu{display:none}
        @media(max-width:1050px){.core-shell{grid-template-columns:215px minmax(0,1fr)}.core-grid2{grid-template-columns:1fr!important}}
        @media(max-width:760px){
          .core-page{padding:12px!important}
          .core-shell{display:block}
          .core-sidebar{display:none;position:static;max-height:none;margin-bottom:12px}
          .core-sidebar.mobile-open{display:block}
          .core-mobile-menu{display:flex;align-items:center;justify-content:space-between;width:100%;margin-bottom:10px;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-weight:900}
          .core-header{padding:17px;border-radius:18px}
          .core-header-row{align-items:stretch;flex-direction:column}
          .core-title{font-size:28px}
          .core-grid2{gap:14px!important}
          .core-card{padding:16px!important}
          .core-button-grid{grid-template-columns:1fr!important}
          .core-inline{grid-template-columns:1fr!important}
          .core-table-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        }
      `}</style>

      <div className="core-shell">
        <aside className="core-sidebar" id="core-sidebar">
          <div className="core-brand">
            <div className="core-brand-kicker">RESTAURANT CORE</div>
            <div className="core-brand-title">POS Control Center</div>
          </div>

          <div className="core-menu-group">
            <div className="core-menu-label">Sales</div>
            <button className={"core-menu-main "+(tab==="pos"?"active":"")} onClick={()=>setTab("pos")}>🧾 <span>POS & Orders</span></button>
            <div className="core-submenu">
              <button className={"core-sub "+(tab==="pos"?"active":"")} onClick={()=>setTab("pos")}>Order workflow</button>
              <button className="core-sub" onClick={()=>setTab("billing")}>Payments & Billing</button>
            </div>
          </div>

          <div className="core-menu-group">
            <div className="core-menu-label">Floor & Kitchen</div>
            <button className={"core-menu-main "+(tab==="tables"?"active":"")} onClick={()=>setTab("tables")}>🪑 <span>Tables</span></button>
            <div className="core-submenu">
              <button className={"core-sub "+(tab==="tables"?"active":"")} onClick={()=>setTab("tables")}>Floor map</button>
              <a className="core-sub" href="/dashboard/tables">Table management →</a>
            </div>
            <button className={"core-menu-main "+(tab==="kds"?"active":"")} onClick={()=>setTab("kds")}>👨‍🍳 <span>Kitchen / KDS</span></button>
            <div className="core-submenu">
              <button className={"core-sub "+(tab==="kds"?"active":"")} onClick={()=>setTab("kds")}>KDS overview</button>
              <a className="core-sub" href="/kitchen">Open kitchen →</a>
            </div>
          </div>

          <div className="core-menu-group">
            <div className="core-menu-label">Operations</div>
            <button className={"core-menu-main "+(tab==="inventory"?"active":"")} onClick={()=>setTab("inventory")}>📦 <span>Inventory</span></button>
            <div className="core-submenu">
              <button className={"core-sub "+(tab==="inventory"?"active":"")} onClick={()=>setTab("inventory")}>Stock & recipes</button>
              <a className="core-sub" href="/dashboard/restaurant-pro?tab=purchases">Purchasing →</a>
            </div>
            <button className={"core-menu-main "+(tab==="delivery"?"active":"")} onClick={()=>setTab("delivery")}>🛵 <span>Delivery</span></button>
            <button className={"core-menu-main "+(tab==="crm"?"active":"")} onClick={()=>setTab("crm")}>👥 <span>Customers & CRM</span></button>
            <div className="core-submenu">
              <a className="core-sub" href="/dashboard/customers">Customers →</a>
              <a className="core-sub" href="/dashboard/reservations">Reservations →</a>
              <a className="core-sub" href="/dashboard/business?tab=loyalty">Loyalty →</a>
            </div>
          </div>

          <div className="core-menu-group">
            <div className="core-menu-label">Business</div>
            <button className={"core-menu-main "+(tab==="analytics"?"active":"")} onClick={()=>setTab("analytics")}>📊 <span>Reports & Analytics</span></button>
            <div className="core-submenu">
              <a className="core-sub" href="/dashboard/reports">Reports →</a>
              <a className="core-sub" href="/dashboard/restaurant-pro">Restaurant Pro →</a>
            </div>
          </div>
        </aside>

        <div className="core-content">
          <button className="core-mobile-menu" onClick={()=>{
            const el=document.getElementById("core-sidebar")
            el?.classList.toggle("mobile-open")
          }}>
            <span>☰ Restaurant Core Menu</span><span>⌄</span>
          </button>

          <header className="core-header">
            <div className="core-header-row">
              <div>
                <div style={eyebrow}>RESTAURANT CORE · POS</div>
                <h1 className="core-title">{tab==="pos"?"POS & Orders":tab==="tables"?"Tables":tab==="kds"?"Kitchen / KDS":tab==="billing"?"Payments & Billing":tab==="inventory"?"Inventory":tab==="delivery"?"Delivery":tab==="crm"?"Customers & CRM":"Reports & Analytics"}</h1>
                <p className="core-subtitle">Restaurant operations in one workspace. Use the main menu for major modules and the sub-menu for focused actions.</p>
              </div>
              <button style={refresh} onClick={()=>load()}>↻ Refresh</button>
            </div>
          </header>

          {message&&<div style={toast}>{message}</div>}

          <nav className="core-tabs" style={{...tabs,display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
            {[["pos","🧾 POS & Orders"],["tables","🪑 Tables"],["kds","👨‍🍳 KDS"],["billing","💳 Billing"],["inventory","📦 Inventory"],["delivery","🛵 Delivery"],["crm","👥 CRM"],["analytics","📊 Analytics"]].map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)} style={{...tabBtn,...(tab===id?active:{})}}>{label}</button>
            ))}
          </nav>

          {tab==="pos" && (
            <div className="core-grid2" style={grid2}>
              <Panel title="Create / Manage Order">
                <div style={modeGrid}>
                  {modes.map(m=><button key={m} onClick={()=>setMode(m)} style={mode===m?activeMode:modeBtn}>{m.replace("_"," ").toUpperCase()}</button>)}
                </div>
                <OrderSelect orders={orders} selected={selected} setSelected={setSelected}/>
                <div style={buttonGrid}>
                  <button disabled={busy} style={button} onClick={()=>op("hold_order")}>Hold Order</button>
                  <button disabled={busy} style={button} onClick={()=>op("hold_order",{hold_type:"park"})}>Park Order</button>
                  <button disabled={busy} style={button} onClick={()=>op("reopen_order")}>Reopen Order</button>
                  <button disabled={busy} style={button} onClick={()=>{ window.location.href="/order" }}>Open POS / Quick Order</button>
                </div>
                <p style={muted}>Select an existing order to run workflow actions. New POS order creation remains available through the main POS screen.</p>
              </Panel>
              <Panel title="Latest Orders">
                {orders.length===0 ? <div style={muted}>No orders found for this restaurant.</div> : (
                  <div style={{display:"grid",gap:8}}>
                    {orders.slice(0,8).map(o=>(
                      <button key={o.id} onClick={()=>setSelected(o.id)} style={{...button,textAlign:"left",borderColor:selected===o.id?"rgba(var(--primary-rgb),.5)":"rgba(255,255,255,.08)"}}>
                        <strong>#{String(o.id).slice(0,8)}</strong> · {o.source_label||o.source_type||o.order_mode||"Order"} · {money(o.total_amount)}
                        <small style={{display:"block",color:"var(--muted)",marginTop:4}}>{o.status} · {o.payment_status||"payment pending"}</small>
                      </button>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          )}

          {tab==="tables" && (
            <Panel title="Restaurant Floor">
              <div style={tableGrid} className="core-table-grid">
                {tables.length===0 ? <div style={muted}>No tables configured yet. Open Table Management to create tables.</div> : tables.map(t=>{
                  const busyTable=String(t.status||"").toLowerCase()==="occupied"
                  return <div key={t.id} style={{...tableCard,...(busyTable?tableBusy:{})}}>
                    <strong>Table {t.table_number}</strong>
                    <span style={muted}>{t.seats||0} seats</span>
                    <span style={{fontSize:12,fontWeight:800}}>{t.status||"available"}</span>
                    {t.floor||t.section ? <small style={{color:"var(--muted)"}}>{[t.floor,t.section].filter(Boolean).join(" · ")}</small> : null}
                  </div>
                })}
              </div>
              <a href="/dashboard/tables" style={link}>Open Advanced Table Management →</a>
            </Panel>
          )}

          {tab==="kds" && (
            <div className="core-grid2" style={grid2}>
              <Panel title="Kitchen Display">
                <div style={{display:"grid",gap:9}}>
                  {orders.filter(o=>["new","pending","preparing","ready"].includes(String(o.status||"").toLowerCase())).slice(0,12).map(o=>(
                    <div key={o.id} style={{padding:13,borderRadius:14,background:"var(--surface-2)",border:"1px solid var(--border)"}}>
                      <strong>#{String(o.id).slice(0,8)}</strong>
                      <div style={{marginTop:5}}>{o.source_label||o.source_type||"Order"} · {money(o.total_amount)}</div>
                      <small style={{display:"block",marginTop:4,color:"var(--muted)"}}>{o.status||"pending"}</small>
                    </div>
                  ))}
                  {orders.filter(o=>["new","pending","preparing","ready"].includes(String(o.status||"").toLowerCase())).length===0 && <div style={muted}>No active kitchen orders.</div>}
                </div>
              </Panel>
              <Panel title="Kitchen Controls">
                <p style={muted}>Use the dedicated KDS screen for full preparation workflow, timers, stations and bump actions.</p>
                <a href="/kitchen" style={link}>Open Full KDS →</a>
              </Panel>
            </div>
          )}

          {tab==="billing" && (
            <div className="core-grid2" style={grid2}>
              <Panel title="Payments & Billing">
                <OrderSelect orders={orders} selected={selected} setSelected={setSelected}/>
                <div style={inline}>
                  <input style={input} value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Payment amount" inputMode="decimal"/>
                  <select style={input} value={method} onChange={e=>setMethod(e.target.value)}>
                    <option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option>
                  </select>
                </div>
                <div style={buttonGrid}>
                  <button disabled={busy} style={primary} onClick={()=>op("payment",{amount:Number(amount||0),payment_method:method})}>Partial Payment</button>
                  <button disabled={busy} style={button} onClick={()=>op("split",{parts:Number(parts||2)})}>Split Bill</button>
                  <button disabled={busy} style={button} onClick={()=>op("refund",{amount:Number(amount||0),reason})}>Refund</button>
                  <button disabled={busy} style={button} onClick={()=>op("void",{reason})}>Void</button>
                  <button disabled={busy} style={button} onClick={()=>op("reopen_order")}>Reopen Order</button>
                </div>
                <input style={input} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Refund / void reason"/>
              </Panel>
              <Panel title="Bill Summary">
                {order ? <>
                  <div style={{fontSize:30,fontWeight:900}}>{money(order.total_amount)}</div>
                  <div style={muted}>Order #{String(order.id).slice(0,8)}</div>
                  <div style={{display:"grid",gap:8}}>
                    <div style={{...button,display:"flex",justifyContent:"space-between"}}><span>Status</span><strong>{order.status||"—"}</strong></div>
                    <div style={{...button,display:"flex",justifyContent:"space-between"}}><span>Payment</span><strong>{order.payment_status||"Pending"}</strong></div>
                  </div>
                </> : <div style={muted}>Select an order to view billing details.</div>}
                <a href="/billing" style={link}>Open Full Billing Workspace →</a>
              </Panel>
            </div>
          )}

          {tab==="inventory" && (
            <div className="core-grid2" style={grid2}>
              <Panel title="Inventory & Recipes">
                <p style={muted}>Manage ingredients, recipes, stock levels, wastage and food-cost workflows from the inventory workspace.</p>
                <div style={buttonGrid}>
                  <a href="/dashboard/inventory" style={link}>Inventory →</a>
                  <a href="/dashboard/inventory" style={link}>Recipes →</a>
                </div>
              </Panel>
              <Panel title="Purchasing">
                <p style={muted}>Supplier purchases and purchase history are handled in Restaurant Pro.</p>
                <a href="/dashboard/restaurant-pro?tab=purchases" style={link}>Open Purchasing →</a>
              </Panel>
            </div>
          )}

          {tab==="delivery" && (
            <div className="core-grid2" style={grid2}>
              <Panel title="Delivery Operations">
                <p style={muted}>Manage delivery orders, riders, zones, charges and delivery status from the dedicated workspace.</p>
                <a href="/dashboard/delivery" style={link}>Open Delivery Management →</a>
              </Panel>
              <Panel title="Order Queue">
                {orders.filter(o=>String(o.order_mode||o.source_type||"").toLowerCase().includes("delivery")).slice(0,8).map(o=>(
                  <div key={o.id} style={{...button,textAlign:"left"}}><strong>#{String(o.id).slice(0,8)}</strong> · {money(o.total_amount)}<small style={{display:"block",color:"var(--muted)"}}>{o.status||"pending"}</small></div>
                ))}
                {orders.filter(o=>String(o.order_mode||o.source_type||"").toLowerCase().includes("delivery")).length===0 && <div style={muted}>No delivery orders in the current queue.</div>}
              </Panel>
            </div>
          )}

          {tab==="crm" && (
            <div className="core-grid2" style={grid2}>
              <Panel title="Customers & CRM">
                <p style={muted}>Customer profiles, order history, loyalty and feedback are available from the CRM workspace.</p>
                <a href="/dashboard/customers" style={link}>Open Customers CRM →</a>
              </Panel>
              <Panel title="Reservations & Loyalty">
                <a href="/dashboard/reservations" style={link}>Reservations →</a>
                <a href="/dashboard/business?tab=loyalty" style={link}>Loyalty & Customer Rewards →</a>
              </Panel>
            </div>
          )}

          {tab==="analytics" && (
            <div className="core-grid2" style={grid2}>
              <Panel title="Reports & Analytics">
                <p style={muted}>Sales, orders, payments, tax, discounts, item performance and profitability reports.</p>
                <a href="/dashboard/reports" style={link}>Open Reports →</a>
              </Panel>
              <Panel title="Business Intelligence">
                <a href="/dashboard/restaurant-pro?tab=overview" style={link}>Restaurant Pro Overview →</a>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:9}}>
                  <div style={button}><strong>{orders.length}</strong><small style={{display:"block",color:"var(--muted)"}}>Orders loaded</small></div>
                  <div style={button}><strong>{tables.length}</strong><small style={{display:"block",color:"var(--muted)"}}>Tables loaded</small></div>
                  <div style={button}><strong>{money(orders.reduce((sum,o)=>sum+Number(o.total_amount||0),0))}</strong><small style={{display:"block",color:"var(--muted)"}}>Order value</small></div>
                </div>
              </Panel>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

function OrderSelect({orders,selected,setSelected}){return <select style={input} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select order…</option>{orders.map(o=><option key={o.id} value={o.id}>#{String(o.id).slice(0,8)} · {o.source_label||o.source_type} · {money(o.total_amount)} · {o.status}</option>)}</select>}
function Panel({title,children}){return <section style={panel}><h2 style={panelTitle}>{title}</h2>{children}</section>}
const wrap={minHeight:"100vh",padding:"28px",background:"var(--background)",color:"var(--text)"}
const hero={maxWidth:1280,margin:"0 auto 18px",display:"flex",justifyContent:"space-between",alignItems:"end",gap:20,flexWrap:"wrap"}
const tabs={display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:8,borderRadius:16,border:"1px solid var(--border)",background:"var(--surface)"}
const active={background:"var(--primary)",border:"1px solid var(--primary)",color:"#111"}
const eyebrow={color:"var(--primary)",fontSize:11,fontWeight:900,letterSpacing:2}
const title={fontSize:38,margin:"7px 0"}
const sub={color:"var(--muted)",margin:0}
const refresh={padding:"10px 14px",borderRadius:12,border:"1px solid rgba(var(--primary-rgb),.25)",background:"rgba(var(--primary-rgb),.08)",color:"var(--primary)",fontWeight:900,cursor:"pointer"}
const toast={maxWidth:1280,margin:"0 auto 15px",padding:12,borderRadius:12,background:"rgba(var(--primary-rgb),.1)",border:"1px solid rgba(var(--primary-rgb),.2)"}
const tabBtn={whiteSpace:"nowrap",padding:"10px 13px",borderRadius:12,border:"1px solid rgba(255,255,255,.08)",background:"var(--surface-2)",color:"var(--text)",fontWeight:800,cursor:"pointer"}
const grid2={maxWidth:1280,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:18}
const panel={padding:22,borderRadius:22,background:"var(--surface)",border:"1px solid rgba(255,255,255,.07)",display:"grid",gap:12}
const panelTitle={margin:0,fontSize:19}
const input={width:"100%",boxSizing:"border-box",padding:"12px 13px",borderRadius:12,border:"1px solid rgba(255,255,255,.1)",background:"rgba(0,0,0,.24)",color:"var(--text)"}
const buttonGrid={display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:9}
const button={padding:12,borderRadius:12,border:"1px solid rgba(255,255,255,.08)",background:"var(--surface-2)",color:"var(--text)",fontWeight:900,cursor:"pointer"}
const danger={...button,borderColor:"rgba(248,113,113,.3)",color:"var(--danger)"}
const primary={padding:12,borderRadius:12,border:0,background:"var(--primary)",color:"#111",fontWeight:900,cursor:"pointer"}
const inline={display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}
const modeGrid={display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:9}
const modeBtn={padding:13,borderRadius:12,border:"1px solid rgba(255,255,255,.08)",background:"rgba(255,255,255,.04)",color:"var(--text)",fontWeight:900,cursor:"pointer"}
const activeMode={...modeBtn,borderColor:"rgba(var(--primary-rgb),.5)",color:"var(--primary)"}
const muted={color:"var(--muted)",lineHeight:1.6,fontSize:13}
const link={display:"block",padding:12,borderRadius:12,textDecoration:"none",color:"var(--primary)",background:"rgba(var(--primary-rgb),.06)",border:"1px solid rgba(var(--primary-rgb),.16)",fontWeight:900}
const tableGrid={display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))",gap:10}
const tableCard={minHeight:110,padding:15,borderRadius:16,background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.22)",display:"flex",flexDirection:"column",gap:6}
const tableBusy={background:"rgba(239,68,68,.08)",borderColor:"rgba(239,68,68,.25)"}
const empty={maxWidth:500,margin:"15vh auto",padding:30,textAlign:"center"}
