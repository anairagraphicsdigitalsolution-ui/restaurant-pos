"use client"

import { useEffect,useState } from "react"
import { useParams } from "next/navigation"

export default function WebsiteOrderPage(){
  const {slug}=useParams()
  const [restaurant,setRestaurant]=useState(null),[menu,setMenu]=useState([]),[cart,setCart]=useState([]),[loading,setLoading]=useState(true),[placing,setPlacing]=useState(false),[msg,setMsg]=useState("")
  const [comboItem,setComboItem]=useState(null),[comboSelection,setComboSelection]=useState([])
  useEffect(()=>{if(slug)load()},[slug])
  async function load(){
    const r=await fetch(`/api/public/website-context?slug=${encodeURIComponent(slug)}`)
    const d=await r.json()
    if(!r.ok||!d.success){setMsg(d.error||"Restaurant not found");setLoading(false);return}
    setRestaurant(d.restaurant);setMenu(d.menu||[]);setLoading(false)
  }
  function comboPrice(item, selection=[]) {
    const base=Number(item?.comboBasePrice ?? item?.price ?? 0)
    if(item?.item_type!=="combo") return base
    const ids=new Set(selection.map(x=>typeof x==="string"?x:x?.item_id).filter(Boolean))
    return base+(item?.combo_config?.groups?.[0]?.options||[]).reduce((sum,o)=>ids.has(o.item_id)?sum+Number(o.price_delta||0):sum,0)
  }
  function add(item){
    if(item?.item_type==="combo" && item?.combo_config?.groups?.length){
      setComboItem(item);setComboSelection([]);return
    }
    const cartKey=`${item.id}:base`
    setCart(c=>{const x=c.find(i=>i.cartKey===cartKey);return x?c.map(i=>i.cartKey===cartKey?{...i,qty:i.qty+1}:i):[...c,{...item,qty:1,cartKey}]})
  }
  function addCombo(){
    if(!comboItem)return
    const group=comboItem.combo_config?.groups?.[0]||{}
    const min=Number(group.min||1),max=Number(group.max||1)
    if(comboSelection.length<min||comboSelection.length>max){setMsg(`Please select ${min===max?min:`${min}-${max}`} option(s).`);return}
    const cartKey=`${comboItem.id}:combo:${comboSelection.slice().sort().join(",")}`
    const row={...comboItem,qty:1,cartKey,comboBasePrice:Number(comboItem.price||0),combo_selection:comboSelection.map(item_id=>({item_id})),price:comboPrice(comboItem,comboSelection)}
    setCart(c=>{const x=c.find(i=>i.cartKey===cartKey);return x?c.map(i=>i.cartKey===cartKey?{...i,qty:i.qty+1}:i):[...c,row]})
    setComboItem(null);setComboSelection([])
  }
  function qty(cartKey,n){setCart(c=>c.flatMap(i=>i.cartKey===cartKey?((i.qty+n)>0?[{...i,qty:i.qty+n}]:[]):[i]))}
  async function place(){
    if(!cart.length)return
    setPlacing(true);setMsg("")
    try{
      const r=await fetch("/api/orders/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        slug,source_type:"website",source_id:restaurant.id,overall_note:null,items:cart.map(i=>({item_id:i.id,quantity:i.qty,combo_selection:i.combo_selection||[]}))
      })})
      const d=await r.json()
      if(!r.ok||!d.success)throw new Error(d.error||"Order failed")
      setCart([]);setMsg(`✅ Order #${String(d.order?.order_id||"").slice(0,8)} sent to kitchen`)
    }catch(e){setMsg(`❌ ${e.message}`)}finally{setPlacing(false)}
  }
  const total=cart.reduce((s,i)=>s+comboPrice(i,i.combo_selection||[])*i.qty,0)
  if(loading)return <main style={shell}><h2>Loading…</h2></main>
  return <main style={shell}><div style={wrap}><header style={hero}><img src={restaurant?.logo||""} style={logo}/><div><div style={eyebrow}>ONLINE ORDERING</div><h1>{restaurant?.name}</h1><p>{restaurant?.description||"Order directly from our restaurant."}</p></div></header>{msg&&<div style={msgBox}>{msg}</div>}<section style={grid}><div>{menu.map(i=><article key={i.id} style={item}><div style={{flex:1}}><b>{i.name}</b><p>{i.description||""}</p><strong>₹{Number(i.price||0).toFixed(2)}{i.item_type==="combo"?" • Combo":""}</strong></div><button style={button} onClick={()=>add(i)}>＋ {i.item_type==="combo"?"Choose":"Add"}</button></article>)}</div><aside style={cartBox}><h2>Your Order</h2>{!cart.length?<p>No items added.</p>:cart.map(i=><div key={i.cartKey} style={cartRow}><span>{i.name} × {i.qty}<small style={{display:"block",color:"var(--muted)"}}>₹{comboPrice(i,i.combo_selection||[]).toFixed(2)} each</small></span><span><button onClick={()=>qty(i.cartKey,-1)}>−</button><button onClick={()=>qty(i.cartKey,1)}>＋</button></span></div>)}<hr/><b>Total ₹{total.toFixed(2)}</b><button style={button} disabled={placing||!cart.length} onClick={place}>{placing?"Sending…":"Place Order"}</button></aside></section>{comboItem&&<div style={overlay}><div style={modal}><h2>{comboItem.name}</h2><p>Choose {comboItem.combo_config?.groups?.[0]?.name||"options"}</p>{(comboItem.combo_config?.groups?.[0]?.options||[]).map(o=>{const chosen=comboSelection.includes(o.item_id);const component=menu.find(m=>m.id===o.item_id);return <button key={o.item_id} style={{...option,...(chosen?optionActive:{})}} onClick={()=>{const max=Number(comboItem.combo_config?.groups?.[0]?.max||1);setComboSelection(p=>p.includes(o.item_id)?p.filter(x=>x!==o.item_id):p.length>=max?p:[...p,o.item_id])}}><span>{chosen?"✓":"○"} {component?.name||"Item"}</span><span>{Number(o.price_delta||0)>0?`+₹${Number(o.price_delta).toFixed(2)}`:Number(o.price_delta||0)<0?`−₹${Math.abs(Number(o.price_delta)).toFixed(2)}`:"Included"}</span></button>})}<div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}><button style={secondary} onClick={()=>{setComboItem(null);setComboSelection([])}}>Cancel</button><button style={button} onClick={addCombo}>Add • ₹{comboPrice(comboItem,comboSelection).toFixed(2)}</button></div></div></div>}</div></main>
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
const overlay={position:"fixed",inset:0,zIndex:100,display:"grid",placeItems:"center",padding:16,background:"rgba(0,0,0,.55)"}
const modal={width:"min(560px,100%)",maxHeight:"85vh",overflow:"auto",padding:20,borderRadius:18,background:"var(--surface)",border:"1px solid var(--border)",color:"var(--text)"}
const option={width:"100%",display:"flex",justifyContent:"space-between",gap:10,padding:12,marginBottom:8,borderRadius:12,border:"1px solid var(--border)",background:"var(--background)",color:"var(--text)",cursor:"pointer",textAlign:"left"}
const optionActive={borderColor:"var(--primary)",background:"rgba(var(--primary-rgb),.12)"}
const secondary={border:"1px solid var(--border)",borderRadius:10,padding:"9px 12px",background:"transparent",color:"var(--text)",fontWeight:800,cursor:"pointer"}
const msgBox={padding:12,borderRadius:11,background:"rgba(var(--primary-rgb),.1)",marginBottom:15}
