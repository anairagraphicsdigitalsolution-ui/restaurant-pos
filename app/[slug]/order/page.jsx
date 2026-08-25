"use client"

import { useEffect,useState } from "react"
import { useParams } from "next/navigation"

export default function WebsiteOrderPage(){
  const {slug}=useParams()
  const [restaurant,setRestaurant]=useState(null),[menu,setMenu]=useState([]),[cart,setCart]=useState([]),[loading,setLoading]=useState(true),[placing,setPlacing]=useState(false),[msg,setMsg]=useState("")
  useEffect(()=>{if(slug)load()},[slug])
  async function load(){
    const r=await fetch(`/api/public/website-context?slug=${encodeURIComponent(slug)}`)
    const d=await r.json()
    if(!r.ok||!d.success){setMsg(d.error||"Restaurant not found");setLoading(false);return}
    setRestaurant(d.restaurant);setMenu(d.menu||[]);setLoading(false)
  }
  function add(item){setCart(c=>{const x=c.find(i=>i.id===item.id);return x?c.map(i=>i.id===item.id?{...i,qty:i.qty+1}:i):[...c,{...item,qty:1}]})}
  function qty(id,n){setCart(c=>c.flatMap(i=>i.id===id?((i.qty+n)>0?[{...i,qty:i.qty+n}]:[]):[i]))}
  async function place(){
    if(!cart.length)return
    setPlacing(true);setMsg("")
    try{
      const r=await fetch("/api/orders/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        slug,source_type:"website",source_id:restaurant.id,overall_note:null,items:cart.map(i=>({item_id:i.id,quantity:i.qty}))
      })})
      const d=await r.json()
      if(!r.ok||!d.success)throw new Error(d.error||"Order failed")
      setCart([]);setMsg(`✅ Order #${String(d.order?.order_id||"").slice(0,8)} sent to kitchen`)
    }catch(e){setMsg(`❌ ${e.message}`)}finally{setPlacing(false)}
  }
  const total=cart.reduce((s,i)=>s+Number(i.price||0)*i.qty,0)
  if(loading)return <main style={shell}><h2>Loading…</h2></main>
  return <main style={shell}><div style={wrap}><header style={hero}><img src={restaurant?.logo||""} style={logo}/><div><div style={eyebrow}>ONLINE ORDERING</div><h1>{restaurant?.name}</h1><p>{restaurant?.description||"Order directly from our restaurant."}</p></div></header>{msg&&<div style={msgBox}>{msg}</div>}<section style={grid}><div>{menu.map(i=><article key={i.id} style={item}><div style={{flex:1}}><b>{i.name}</b><p>{i.description||""}</p><strong>₹{i.price}</strong></div><button style={button} onClick={()=>add(i)}>＋ Add</button></article>)}</div><aside style={cartBox}><h2>Your Order</h2>{!cart.length?<p>No items added.</p>:cart.map(i=><div key={i.id} style={cartRow}><span>{i.name} × {i.qty}</span><span><button onClick={()=>qty(i.id,-1)}>−</button><button onClick={()=>qty(i.id,1)}>＋</button></span></div>)}<hr/><b>Total ₹{total.toFixed(2)}</b><button style={button} disabled={placing||!cart.length} onClick={place}>{placing?"Sending…":"Place Order"}</button></aside></section></div></main>
}
const shell={minHeight:"100vh",padding:20,background:"var(--background)",color:"var(--text)"}
const wrap={maxWidth:1100,margin:"0 auto"}
const hero={display:"flex",gap:15,alignItems:"center",padding:22,borderRadius:20,background:"var(--surface)",border:"1px solid var(--border)",marginBottom:15}
const logo={width:65,height:65,objectFit:"contain",borderRadius:14,background:"var(--text)"}
const eyebrow={fontSize:10,fontWeight:900,letterSpacing:1.5,color:"var(--primary)"}
const grid={display:"grid",gridTemplateColumns:"1fr 330px",gap:15}
const item={display:"flex",gap:12,padding:15,borderRadius:16,background:"var(--surface)",border:"1px solid var(--border)",marginBottom:10}
const cartBox={position:"sticky",top:15,height:"fit-content",padding:18,borderRadius:18,background:"var(--surface)",border:"1px solid var(--border)"}
const cartRow={display:"flex",justifyContent:"space-between",gap:8,padding:"10px 0",borderBottom:"1px solid var(--border)"}
const button={border:0,borderRadius:10,padding:"9px 12px",background:"var(--primary)",color:"#111",fontWeight:900,cursor:"pointer"}
const msgBox={padding:12,borderRadius:11,background:"rgba(var(--primary-rgb),.1)",marginBottom:15}
