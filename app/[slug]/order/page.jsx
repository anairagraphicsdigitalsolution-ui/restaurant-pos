"use client"

import { useEffect,useState } from "react"
import { useParams } from "next/navigation"

export default function WebsiteOrderPage(){
  const {slug}=useParams()
  const [restaurant,setRestaurant]=useState(null),[menu,setMenu]=useState([]),[cart,setCart]=useState([]),[loading,setLoading]=useState(true),[placing,setPlacing]=useState(false),[msg,setMsg]=useState("")
  const [comboItem,setComboItem]=useState(null),[comboSelection,setComboSelection]=useState([])
  const [variantItem,setVariantItem]=useState(null),[variantSelection,setVariantSelection]=useState(null),[variantQuantities,setVariantQuantities]=useState({})
  useEffect(()=>{if(slug)load()},[slug])
  async function load(){
    const r=await fetch(`/api/public/website-context?slug=${encodeURIComponent(slug)}`)
    const d=await r.json()
    if(!r.ok||!d.success){setMsg(d.error||"Restaurant not found");setLoading(false);return}
    setRestaurant(d.restaurant);setMenu(d.menu||[]);setLoading(false)
  }
  function comboPrice(item, selection=[]) {
    const variant=(item?.variants||[]).find(v=>String(v.id)===String(item?.variant_id))
    const base=Number(item?.comboBasePrice ?? item?.price ?? 0)
    if(item?.item_type!=="combo") return base + Number(variant?.price_delta||0)
    const options=item?.combo_config?.groups?.[0]?.options||[]
    return base+(selection||[]).reduce((sum,row)=>{
      const itemId=typeof row==="string"?row:row?.item_id
      const option=options.find(o=>String(o.item_id)===String(itemId))
      const component=menu.find(m=>String(m.id)===String(itemId))
      const variantId=typeof row==="string"?null:row?.variant_id
      const variant=(component?.variants||[]).find(v=>String(v.id)===String(variantId))
      return sum+Number(option?.price_delta||0)+Number(variant?.price_delta||0)
    },0)
  }
  function add(item){
    if(item?.item_type==="combo" && item?.combo_config?.groups?.length){ setComboItem(item);setComboSelection([]);return }
    const variants=Array.isArray(item?.variants)?item.variants:[]
    if(variants.length){ const initial={};variants.forEach(v=>initial[v.id]=0);setVariantItem(item);setVariantSelection(null);setVariantQuantities(initial);return }
    addConfigured(item,null)
  }
  function addConfigured(item,variant,quantity=1){
    const configured=variant ? {...item,price:Number(item.price||0)+Number(variant.price_delta||0),variant_id:variant.id,variant_name:variant.name} : item
    const cartKey=`${configured.id}:${configured.variant_id||"base"}`
    setCart(c=>{const x=c.find(i=>i.cartKey===cartKey);return x?c.map(i=>i.cartKey===cartKey?{...i,qty:i.qty+Number(quantity||1)}:i):[...c,{...configured,qty:Number(quantity||1),cartKey}]})
  }
  function setVariantQty(variantId,change){setVariantQuantities(prev=>({...prev,[variantId]:Math.max(0,Number(prev[variantId]||0)+change)}))}
  function addVariant(){
    if(!variantItem)return
    const selected=(variantItem.variants||[]).map(v=>({v,qty:Number(variantQuantities[v.id]||0)})).filter(x=>x.qty>0)
    if(!selected.length){setMsg("Please select at least one variant quantity.");return}
    selected.forEach(({v,qty})=>addConfigured(variantItem,v,qty))
    setVariantItem(null);setVariantSelection(null);setVariantQuantities({})
  }
  function addCombo(){
    if(!comboItem)return
    const group=comboItem.combo_config?.groups?.[0]||{}
    const min=Number(group.min||1),max=Number(group.max||1)
    if(comboSelection.length<min||comboSelection.length>max){setMsg(`Please select ${min===max?min:`${min}-${max}`} option(s).`);return}
    const comboRows=comboSelection.map(row=>typeof row==="string"?{item_id:row}:row)
    const cartKey=`${comboItem.id}:combo:${comboRows.map(row=>`${row.item_id}:${row.variant_id||"base"}`).sort().join(",")}`
    const row={...comboItem,qty:1,cartKey,comboBasePrice:Number(comboItem.price||0),combo_selection:comboRows,price:comboPrice(comboItem,comboRows)}
    setCart(c=>{const x=c.find(i=>i.cartKey===cartKey);return x?c.map(i=>i.cartKey===cartKey?{...i,qty:i.qty+1}:i):[...c,row]})
    setComboItem(null);setComboSelection([])
  }
  function qty(cartKey,n){setCart(c=>c.flatMap(i=>i.cartKey===cartKey?((i.qty+n)>0?[{...i,qty:i.qty+n}]:[]):[i]))}
  async function place(){
    if(!cart.length)return
    setPlacing(true);setMsg("")
    try{
      const r=await fetch("/api/orders/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        slug,source_type:"website",source_id:restaurant.id,overall_note:null,items:cart.map(i=>({item_id:i.id,quantity:i.qty,variant_id:i.variant_id||null,combo_selection:i.combo_selection||[]}))
      })})
      const d=await r.json()
      if(!r.ok||!d.success)throw new Error(d.error||"Order failed")
      setCart([]);setMsg(`✅ Order #${String(d.order?.order_id||"").slice(0,8)} sent to kitchen`)
    }catch(e){setMsg(`❌ ${e.message}`)}finally{setPlacing(false)}
  }
  const total=cart.reduce((s,i)=>s+comboPrice(i,i.combo_selection||[])*i.qty,0)
  if(loading)return <main style={shell}><h2>Loading…</h2></main>
  return <main style={shell}><div style={wrap}><header style={hero}><img src={restaurant?.logo||""} style={logo}/><div><div style={eyebrow}>ONLINE ORDERING</div><h1>{restaurant?.name}</h1><p>{restaurant?.description||"Order directly from our restaurant."}</p></div></header>{msg&&<div style={msgBox}>{msg}</div>}<section style={grid}><div>{menu.map(i=><article key={i.id} style={item}><div style={{flex:1}}><b>{i.name}</b><p>{i.description||""}</p><strong>₹{Number(i.price||0).toFixed(2)}{i.item_type==="combo"?" • Combo":""}</strong></div><button style={button} onClick={()=>add(i)}>＋ {i.item_type==="combo"?"Choose":"Add"}</button></article>)}</div><aside style={cartBox}><h2>Your Order</h2>{!cart.length?<p>No items added.</p>:cart.map(i=><div key={i.cartKey} style={cartRow}><span>{i.name}{i.variant_name ? ` — ${i.variant_name}` : ""} × {i.qty}<small style={{display:"block",color:"var(--muted)"}}>₹{comboPrice(i,i.combo_selection||[]).toFixed(2)} each</small></span><span><button onClick={()=>qty(i.cartKey,-1)}>−</button><button onClick={()=>qty(i.cartKey,1)}>＋</button></span></div>)}<hr/><b>Total ₹{total.toFixed(2)}</b><button style={button} disabled={placing||!cart.length} onClick={place}>{placing?"Sending…":"Place Order"}</button></aside></section>{variantItem&&<div style={overlay}><div style={modal}><h2>{variantItem.name}</h2><p>Select quantity for each variant.</p>{(variantItem.variants||[]).map(v=>{const qty=Number(variantQuantities[v.id]||0);return <div key={v.id} style={{...option,...(qty>0?optionActive:{})}}><span><b>{v.name}</b><small style={{display:"block",color:"var(--muted)"}}>₹{(Number(variantItem.price||0)+Number(v.price_delta||0)).toFixed(2)} each</small></span><span style={{display:"flex",alignItems:"center",gap:8}}><button type="button" onClick={()=>setVariantQty(v.id,-1)}>−</button><b style={{minWidth:20,textAlign:"center"}}>{qty}</b><button type="button" onClick={()=>setVariantQty(v.id,1)}>+</button></span></div>})}<div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}><button style={secondary} onClick={()=>{setVariantItem(null);setVariantSelection(null);setVariantQuantities({})}}>Cancel</button><button style={button} onClick={addVariant} disabled={!Object.values(variantQuantities).some(q=>Number(q)>0)}>Add Selected</button></div></div></div>}

{comboItem&&<div style={overlay}><div style={modal}><h2>{comboItem.name}</h2><p>Choose {comboItem.combo_config?.groups?.[0]?.name||"options"}</p>{(comboItem.combo_config?.groups?.[0]?.options||[]).map(o=>{const chosenRow=comboSelection.find(x=>String(typeof x==="string"?x:x?.item_id)===String(o.item_id));const chosen=!!chosenRow;const component=menu.find(m=>m.id===o.item_id);const variants=(component?.variants||[]).filter(v=>v.active!==false);const chosenVariantId=typeof chosenRow==="string"?"":chosenRow?.variant_id||"";return <div key={o.item_id} style={{...option,...(chosen?optionActive:{})}}><button type="button" style={{border:0,background:"transparent",color:"inherit",padding:0,display:"flex",justifyContent:"space-between",width:"100%",cursor:"pointer",textAlign:"left"}} onClick={()=>{const max=Number(comboItem.combo_config?.groups?.[0]?.max||1);setComboSelection(p=>{const exists=p.some(x=>String(typeof x==="string"?x:x?.item_id)===String(o.item_id));return exists?p.filter(x=>String(typeof x==="string"?x:x?.item_id)!==String(o.item_id)):p.length>=max?p:[...p,{item_id:o.item_id,variant_id:null}]})}}><span>{chosen?"✓":"○"} {component?.name||"Item"}</span><span>{Number(o.price_delta||0)>0?`+₹${Number(o.price_delta).toFixed(2)}`:Number(o.price_delta||0)<0?`−₹${Math.abs(Number(o.price_delta)).toFixed(2)}`:"Included"}</span></button>{chosen&&variants.length>0&&<select value={chosenVariantId} onChange={e=>setComboSelection(p=>p.map(x=>String(typeof x==="string"?x:x?.item_id)===String(o.item_id)?{item_id:o.item_id,variant_id:e.target.value||null}:x))} style={{marginTop:7,width:"100%",padding:8,borderRadius:8,border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text)"}}><option value="">Base item</option>{variants.map(v=><option key={v.id} value={v.id}>{v.name} · +₹{Number(v.price_delta||0).toFixed(2)}</option>)}</select>}</div>})}<div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}><button style={secondary} onClick={()=>{setComboItem(null);setComboSelection([])}}>Cancel</button><button style={button} onClick={addCombo}>Add • ₹{comboPrice(comboItem,comboSelection).toFixed(2)}</button></div></div></div>}</div></main>
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
