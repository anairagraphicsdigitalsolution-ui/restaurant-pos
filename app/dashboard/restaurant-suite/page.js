"use client"

import { indiaDateKey } from "@/lib/indiaTime"
import { formatIndiaDateTime } from "@/lib/indiaTime"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN",{maximumFractionDigits:2})}`

export default function RestaurantSuite() {
  const [rid,setRid]=useState(null),[tab,setTab]=useState("overview"),[loading,setLoading]=useState(true),[msg,setMsg]=useState("")
  const [orders,setOrders]=useState([]),[tokens,setTokens]=useState([]),[channels,setChannels]=useState([]),[recon,setRecon]=useState([])
  const [campaigns,setCampaigns]=useState([]),[captains,setCaptains]=useState([]),[items,setItems]=useState([])
  const [terminals,setTerminals]=useState([]),[settlements,setSettlements]=useState([]),[payouts,setPayouts]=useState([])
  const [calls,setCalls]=useState([]),[wallets,setWallets]=useState([]),[exports,setExports]=useState([])
  const [online,setOnline]=useState({channel_code:"swiggy",channel_name:"Swiggy",active:false})
  const [settle,setSettle]=useState({rider_name:"",expected_cash:"",expected_upi:"",expected_card:"",submitted_cash:"",submitted_upi:"",submitted_card:""})
  const [terminal,setTerminal]=useState({terminal_code:"",terminal_name:"",device_type:"pos"})
  const [call,setCall]=useState({token_no:"",display_name:"",message:""})
  const [campaign,setCampaign]=useState({name:"",channel:"whatsapp",message:""})

  useEffect(()=>{init()},[])

  async function init(){
    const {data:u}=await supabase.auth.getUser()
    if(!u?.user){setLoading(false);return}
    const {data:p}=await supabase.from("profiles").select("restaurant_id").eq("id",u.user.id).maybeSingle()
    if(!p?.restaurant_id){setLoading(false);return}
    setRid(p.restaurant_id); await load(p.restaurant_id)
  }

  async function load(r=rid){
    if(!r)return
    setLoading(true)
    const today=indiaDateKey()
    const results=await Promise.all([
      supabase.from("orders").select("id,source_label,order_mode,status,total_amount,payment_status,created_at").eq("restaurant_id",r).order("created_at",{ascending:false}).limit(200),
      supabase.from("order_tokens").select("*").eq("restaurant_id",r).eq("token_date",today).order("token_no"),
      supabase.from("online_channels").select("*").eq("restaurant_id",r).order("channel_name"),
      supabase.from("online_order_reconciliations").select("*").eq("restaurant_id",r).order("order_date",{ascending:false}).limit(100),
      supabase.from("marketing_campaigns").select("*").eq("restaurant_id",r).order("created_at",{ascending:false}).limit(50),
      supabase.from("captain_sessions").select("*").eq("restaurant_id",r).order("last_seen_at",{ascending:false}),
      supabase.from("menu_items").select("id,name,price").eq("restaurant_id",r).order("name"),
      supabase.from("pos_terminals").select("*").eq("restaurant_id",r).order("terminal_name"),
      supabase.from("delivery_settlements").select("*").eq("restaurant_id",r).order("created_at",{ascending:false}).limit(100),
      supabase.from("aggregator_payouts").select("*").eq("restaurant_id",r).order("payout_date",{ascending:false}).limit(100),
      supabase.from("digital_display_calls").select("*").eq("restaurant_id",r).order("created_at",{ascending:false}).limit(50),
      supabase.from("customer_wallets").select("*").eq("restaurant_id",r).order("updated_at",{ascending:false}).limit(100),
      supabase.from("report_exports").select("*").eq("restaurant_id",r).order("created_at",{ascending:false}).limit(50)
    ])
    setOrders(results[0].data||[]);setTokens(results[1].data||[]);setChannels(results[2].data||[]);setRecon(results[3].data||[])
    setCampaigns(results[4].data||[]);setCaptains(results[5].data||[]);setItems(results[6].data||[]);setTerminals(results[7].data||[])
    setSettlements(results[8].data||[]);setPayouts(results[9].data||[]);setCalls(results[10].data||[]);setWallets(results[11].data||[]);setExports(results[12].data||[])
    setLoading(false)
  }

  async function patchToken(id,status){
    const patch={status}; if(status==="ready")patch.ready_at=new Date().toISOString();if(status==="picked_up")patch.picked_up_at=new Date().toISOString()
    const {error}=await supabase.from("order_tokens").update(patch).eq("id",id).eq("restaurant_id",rid)
    setMsg(error?.message||"Token updated");if(!error)load()
  }

  async function saveChannel(e){
    e.preventDefault()
    const {error}=await supabase.from("online_channels").upsert({...online,restaurant_id:rid,updated_at:new Date().toISOString()},{onConflict:"restaurant_id,channel_code"})
    setMsg(error?.message||"Channel saved");if(!error)load()
  }

  async function saveSettlement(e){
    e.preventDefault()
    const ec=Number(settle.expected_cash||0),eu=Number(settle.expected_upi||0),ed=Number(settle.expected_card||0)
    const sc=Number(settle.submitted_cash||0),su=Number(settle.submitted_upi||0),sd=Number(settle.submitted_card||0)
    const diff=Number(sc+su+sd-ec-eu-ed)
    const {error}=await supabase.from("delivery_settlements").insert({restaurant_id:rid,...Object.fromEntries(Object.entries(settle).map(([k,v])=>[k,Number(v)||0])),rider_name:settle.rider_name,difference:diff,status:Math.abs(diff)<.01?"settled":"short_or_excess",settled_at:new Date().toISOString()})
    setMsg(error?.message||`Settlement saved • Difference ${money(diff)}`);if(!error){setSettle({rider_name:"",expected_cash:"",expected_upi:"",expected_card:"",submitted_cash:"",submitted_upi:"",submitted_card:""});load()}
  }

  async function saveTerminal(e){
    e.preventDefault()
    const {error}=await supabase.from("pos_terminals").insert({...terminal,restaurant_id:rid})
    setMsg(error?.message||"Terminal registered");if(!error){setTerminal({terminal_code:"",terminal_name:"",device_type:"pos"});load()}
  }

  async function saveCall(e){
    e.preventDefault()
    const {error}=await supabase.from("digital_display_calls").insert({...call,restaurant_id:rid})
    setMsg(error?.message||"Display call queued");if(!error){setCall({token_no:"",display_name:"",message:""});load()}
  }

  async function saveCampaign(e){
    e.preventDefault()
    const {data:u}=await supabase.auth.getUser()
    const {error}=await supabase.from("marketing_campaigns").insert({restaurant_id:rid,...campaign,created_by:u?.user?.id||null,status:"draft"})
    setMsg(error?.message||"Campaign saved");if(!error){setCampaign({name:"",channel:"whatsapp",message:""});load()}
  }

  async function requestExport(type){
    const {data:u}=await supabase.auth.getUser()
    const {error}=await supabase.from("report_exports").insert({restaurant_id:rid,report_type:type,format:"csv",requested_by:u?.user?.id||null,status:"requested"})
    setMsg(error?.message||"Report export requested");if(!error)load()
  }

  const stats=useMemo(()=>{
    const valid=orders.filter(o=>!["cancelled","canceled","void","voided","refunded"].includes(String(o.status||"").toLowerCase()))
    return {sales:valid.reduce((s,o)=>s+Number(o.total_amount||0),0),orders:valid.length,takeaway:valid.filter(o=>o.order_mode==="takeaway").length,delivery:valid.filter(o=>o.order_mode==="delivery").length}
  },[orders])

  const tabs=[["overview","Overview"],["tokens","Tokens / Pickup"],["delivery","Rider Settlement"],["online","Online / Aggregators"],["inventory","Inventory / Food Cost"],["crm","CRM / Loyalty"],["staff","Captain / Staff"],["terminals","POS Terminals"],["devices","Kiosk / Display"],["reports","Reports"]]

  return <main className="suite">
    <section className="hero"><div><div className="eyebrow">ANAIRA • RESTAURANT OPERATIONS</div><h1>Complete Restaurant Control Center</h1><p>Dine-in, takeaway, delivery, KOT, tokens, riders, aggregators, inventory, CRM, staff, terminals, kiosk, display and reports.</p></div><button onClick={()=>load()} className="refresh">↻ Refresh</button></section>
    <nav className="tabs">{tabs.map(([id,label])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}</button>)}</nav><a className="link suiteAdvancedLink" href="/dashboard/restaurant-suite/advanced">⚙ Advanced Operations — Modifiers, Kitchen, Staff, Branches, Kiosk, Printing, Gateways, Reports & Forecasting →</a>
    {msg&&<div className="message">{msg}</div>}

    {tab==="overview"&&<><section className="stats"><Stat label="Sales" value={money(stats.sales)}/><Stat label="Orders" value={stats.orders}/><Stat label="Takeaway" value={stats.takeaway}/><Stat label="Delivery" value={stats.delivery}/><Stat label="Ready Tokens" value={tokens.filter(x=>x.status==="ready").length}/><Stat label="Settlements" value={settlements.length}/></section><Panel title="End-to-end restaurant workflow"><div className="flow">{["Dine-in / Quick Order","Takeaway Token","Delivery Slip","KOT","KDS","Ready","Pickup / Rider","Payment","Settlement","Inventory Consumption","CRM / Loyalty","Reports"].map((x,i)=><span key={x}>{i+1}. {x}</span>)}</div></Panel></>}

    {tab==="tokens"&&<Panel title="Today's Takeaway / Delivery Tokens"><div className="tokenGrid">{tokens.length?tokens.map(t=><div className={"token "+t.status} key={t.id}><div className="tokenNo">#{t.token_no}</div><b>{String(t.token_type).toUpperCase()}</b><small>{t.pickup_name||"Customer"}</small><strong>{String(t.status).replaceAll("_"," ")}</strong><div className="actions"><button onClick={()=>patchToken(t.id,"ready")}>READY</button><button onClick={()=>patchToken(t.id,"picked_up")}>PICKED UP</button></div></div>):<Empty text="No tokens today."/>}</div></Panel>}

    {tab==="delivery"&&<section className="grid"><Panel title="Rider Settlement"><form className="form" onSubmit={saveSettlement}><input value={settle.rider_name} onChange={e=>setSettle({...settle,rider_name:e.target.value})} placeholder="Rider name"/>{["expected_cash","expected_upi","expected_card","submitted_cash","submitted_upi","submitted_card"].map(k=><input key={k} type="number" value={settle[k]} onChange={e=>setSettle({...settle,[k]:e.target.value})} placeholder={k.replaceAll("_"," ")}/>)}<button>Settle Rider</button></form>{settlements.map(s=><div className="row" key={s.id}><b>{s.rider_name||"Rider"}</b><span>{s.status} • Difference {money(s.difference)}</span></div>)}</Panel><Panel title="Delivery operational links"><a className="link" href="/dashboard/delivery">Open Delivery Management →</a><a className="link" href="/order">Create Delivery Order →</a></Panel></section>}

    {tab==="online"&&<section className="grid"><Panel title="Aggregator Channels"><form className="form" onSubmit={saveChannel}><select value={online.channel_code} onChange={e=>setOnline({...online,channel_code:e.target.value,channel_name:e.target.value==="swiggy"?"Swiggy":e.target.value==="zomato"?"Zomato":e.target.value})}><option value="swiggy">Swiggy</option><option value="zomato">Zomato</option><option value="website">Website</option><option value="qr">QR</option></select><input value={online.channel_name} onChange={e=>setOnline({...online,channel_name:e.target.value})}/><label><input type="checkbox" checked={online.active} onChange={e=>setOnline({...online,active:e.target.checked})}/> Active</label><button>Save Channel</button></form>{channels.map(c=><div className="row" key={c.id}><b>{c.channel_name}</b><span>{c.active?"ACTIVE":"OFF"}</span></div>)}</Panel><Panel title="Reconciliation"><div className="row"><b>Pending rows</b><span>{recon.filter(r=>r.settlement_status==="pending").length}</span></div>{payouts.map(p=><div className="row" key={p.id}><b>{p.channel_code} • {p.payout_reference||"Payout"}</b><span>{money(p.net_payout)} • {p.status}</span></div>)}</Panel></section>}

    {tab==="inventory"&&<section className="grid"><Panel title="Inventory / Recipe"><p className="muted">Existing Recipe/BOM and inventory remain intact. Terminal sale triggers recipe consumption through the existing automation migration.</p><a className="link" href="/dashboard/inventory">Open Inventory →</a><a className="link" href="/dashboard/restaurant-pro">Open Restaurant Pro →</a></Panel><Panel title="Food Cost"><p className="muted">Use the existing food-cost calculator/snapshots and menu prices to monitor margin.</p><a className="link" href="/dashboard/restaurant-suite">Refresh cost data →</a></Panel></section>}

    {tab==="crm"&&<section className="grid"><Panel title="CRM Campaigns"><form className="form" onSubmit={saveCampaign}><input value={campaign.name} onChange={e=>setCampaign({...campaign,name:e.target.value})} placeholder="Campaign name"/><select value={campaign.channel} onChange={e=>setCampaign({...campaign,channel:e.target.value})}><option>whatsapp</option><option>sms</option><option>email</option></select><textarea rows={4} value={campaign.message} onChange={e=>setCampaign({...campaign,message:e.target.value})} placeholder="Message"/><button>Save Draft</button></form>{campaigns.map(c=><div className="row" key={c.id}><b>{c.name}</b><span>{c.channel} • {c.status}</span></div>)}</Panel><Panel title="Loyalty Wallet"><p className="muted">Wallet/points ledger foundation is available without modifying existing customer balances.</p>{wallets.map(w=><div className="row" key={w.id}><b>Customer {String(w.customer_id).slice(0,8)}</b><span>{money(w.balance)} • {w.points} points</span></div>)}</Panel></section>}

    {tab==="staff"&&<Panel title="Captain / Staff"><p className="muted">Captain sessions are device-aware. Connect staff mobile order screens to the same restaurant scope.</p>{captains.map(c=><div className="row" key={c.id}><b>{c.staff_name||"Staff"}</b><span>{c.device_name||"Device"} • {formatIndiaDateTime(c.last_seen_at)}</span></div>)}{!captains.length&&<Empty text="No active captain sessions."/>}</Panel>}

    {tab==="terminals"&&<Panel title="Multi-terminal POS"><form className="form" onSubmit={saveTerminal}><input value={terminal.terminal_code} onChange={e=>setTerminal({...terminal,terminal_code:e.target.value})} placeholder="Terminal code"/><input value={terminal.terminal_name} onChange={e=>setTerminal({...terminal,terminal_name:e.target.value})} placeholder="Terminal name"/><select value={terminal.device_type} onChange={e=>setTerminal({...terminal,device_type:e.target.value})}><option>pos</option><option>kitchen</option><option>billing</option><option>captain</option></select><button>Register Terminal</button></form>{terminals.map(t=><div className="row" key={t.id}><b>{t.terminal_name}</b><span>{t.terminal_code} • {t.active?"ACTIVE":"OFF"}</span></div>)}</Panel>}

    {tab==="devices"&&<section className="grid"><Panel title="Digital Display / Calling"><form className="form" onSubmit={saveCall}><input value={call.token_no} onChange={e=>setCall({...call,token_no:e.target.value})} placeholder="Token"/><input value={call.display_name} onChange={e=>setCall({...call,display_name:e.target.value})} placeholder="Customer / display name"/><input value={call.message} onChange={e=>setCall({...call,message:e.target.value})} placeholder="Message"/><button>Call Token</button></form>{calls.map(c=><div className="row" key={c.id}><b>#{c.token_no} {c.display_name}</b><span>{c.status}</span></div>)}</Panel><Panel title="Kiosk / Customer Ordering"><a className="link" href="/order">Open Customer POS →</a><a className="link" href="/kitchen">Open KDS →</a><a className="link" href="/dashboard/qr">Open QR Center →</a></Panel></section>}

    {tab==="reports"&&<Panel title="Reports & Exports"><div className="reportGrid">{["sales","orders","payments","inventory","food_cost","online_reconciliation","staff","customers","delivery_settlement","tax"].map(x=><button key={x} onClick={()=>requestExport(x)}>{x.replaceAll("_"," ")} → CSV</button>)}</div>{exports.map(x=><div className="row" key={x.id}><b>{x.report_type}</b><span>{x.status} • {formatIndiaDateTime(x.created_at)}</span></div>)}</Panel>}

    {loading&&<div className="loading">Loading…</div>}
    <style jsx>{`
      .suite{min-height:100vh;padding:24px;background:var(--background);color:var(--text);transition:.2s}
      .hero,.panel,.stat{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 18px 45px rgba(0,0,0,.12)}
      .hero{padding:28px;display:flex;justify-content:space-between;gap:20px}.eyebrow{font-size:11px;letter-spacing:.16em;color:var(--primary);font-weight:900}.hero h1{margin:8px 0;font-size:clamp(28px,4vw,46px);color:var(--text)}.hero p,.muted{color:var(--muted)}
      .refresh,.tabs button,.form button,.actions button,.reportGrid button{cursor:pointer;border:1px solid var(--border);border-radius:10px;padding:10px 13px;background:var(--surface-2);color:var(--text);font-weight:800}.tabs{display:flex;gap:8px;overflow:auto;padding:14px 0}.tabs button{white-space:nowrap}.tabs .active{background:var(--primary);color:#111;border-color:var(--primary)}.message{padding:12px;border:1px solid rgba(var(--primary-rgb),.25);background:rgba(var(--primary-rgb),.08);border-radius:12px;margin-bottom:14px}.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:16px}.stat{padding:18px}.stat b{display:block;font-size:11px;color:var(--muted)}.stat strong{font-size:25px;display:block;margin-top:7px;color:var(--text)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.panel{padding:20px;margin-bottom:16px}.panel h2{margin:0 0 15px;color:var(--text)}.flow{display:flex;gap:10px;flex-wrap:wrap}.flow span{padding:11px;border-radius:12px;background:rgba(var(--primary-rgb),.08);border:1px solid rgba(var(--primary-rgb),.15);color:var(--text)}.tokenGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}.token{padding:16px;border-radius:16px;background:var(--surface-2);border:1px solid var(--border)}.tokenNo{font-size:30px;font-weight:900;color:var(--primary)}.token small,.token strong{display:block;margin-top:6px}.actions{display:flex;gap:6px;margin-top:12px}.actions button{font-size:10px;padding:7px}.form{display:grid;gap:9px;margin-bottom:16px}.form input,.form select,.form textarea{background:var(--background);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:11px}.form button{background:var(--primary);color:#111;border:0}.row{display:flex;justify-content:space-between;gap:10px;padding:11px 0;border-bottom:1px solid var(--border);color:var(--text)}.link{display:block;color:var(--primary);margin:12px 0}.reportGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:18px}.loading{text-align:center;padding:20px;color:var(--muted)}.suite a{color:var(--primary)}
      @media(max-width:900px){.stats{grid-template-columns:repeat(3,1fr)}.grid{grid-template-columns:1fr}}@media(max-width:600px){.suite{padding:12px}.hero{flex-direction:column}.stats{grid-template-columns:repeat(2,1fr)}.reportGrid{grid-template-columns:1fr 1fr}}
    `}</style>
  </main>
}
function Stat({label,value}){return <div className="stat"><b>{label}</b><strong>{value}</strong></div>}
function Panel({title,children}){return <section className="panel"><h2>{title}</h2>{children}</section>}
function Empty({text}){return <div className="muted">{text}</div>}
