"use client"
import {useEffect,useMemo,useState} from "react"
import {useParams,useSearchParams} from "next/navigation"

export default function PublicOrderTrackingPage(){
 const params=useParams(); const search=useSearchParams(); const token=String(params?.token||""); const orderId=String(search?.get("order_id")||"")
 const [data,setData]=useState(null); const [error,setError]=useState(""); const [busy,setBusy]=useState(""); const [message,setMessage]=useState("")
 const load=async()=>{if(!token||!orderId)return;try{const r=await fetch(`/api/public/qr-status?order_id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`,{cache:"no-store"});const d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||"Unable to load order");setData(d);setError("")}catch(e){setError(e.message||"Unable to load order")}}
 useEffect(()=>{load();const t=setInterval(load,8000);return()=>clearInterval(t)},[token,orderId])
 const order=data?.order; const session=data?.session; const restaurant=data?.restaurant
 const paid=String(order?.payment_status||"").toLowerCase()==="paid"; const status=String(order?.status||"pending").toLowerCase()
 const statusText=status.includes("ready")||status==="done"||status==="completed"?"Ready / Done":status.includes("prepar")||status.includes("cook")?"Preparing":status.includes("cancel")?"Cancelled":"Order Received"
 const sourceUrl=useMemo(()=>{if(!restaurant?.slug||!session?.source_type||!session?.source_id)return "";return `/${restaurant.slug}/order/${session.source_type}/${session.source_id}?order_id=${encodeURIComponent(orderId)}&payment=return#track=${encodeURIComponent(token)}`},[restaurant,session,orderId,token])
 const service=async(type)=>{setBusy(type);setMessage("");try{const r=await fetch("/api/public/qr-service-request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_token:token,request_type:type,order_id:orderId})});const d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||"Request failed");setMessage(type==="bill"?"Bill request sent to the restaurant.":"Waiter has been notified.")}catch(e){setMessage(e.message||"Request failed")}finally{setBusy("")}}
 if(!orderId||!token)return <main style={styles.wrap}><section style={styles.card}><h1>Order Tracking</h1><p>Invalid tracking link.</p></section></main>
 return <main style={styles.wrap}><section style={styles.card}>
   <div style={styles.brand}>{restaurant?.name||"Anaira Restaurant"}</div><div style={styles.live}>● LIVE TRACKING</div>
   <h1>Order #{orderId.slice(0,8)}</h1>
   {error?<div style={styles.error}>{error}<button style={styles.button} onClick={load}>Retry</button></div>:!order?<p>Loading order status…</p>:<>
    <div style={styles.status}>{statusText}</div>
    <div style={styles.row}><span>Order total</span><strong>₹{Number(order.total_amount||0).toFixed(2)}</strong></div>
    <div style={styles.row}><span>Paid</span><strong>₹{Number(order.paid_amount||0).toFixed(2)}</strong></div>
    <div style={styles.row}><span>Payment</span><strong>{paid?"PAID":"PENDING"}</strong></div>
    {order.invoice_no&&<div style={styles.row}><span>Invoice</span><strong>{order.invoice_no}</strong></div>}
    <div style={styles.actions}>
      <button style={styles.button} onClick={()=>service("waiter")} disabled={!!busy}>🛎️ {busy==="waiter"?"Calling…":"Call Waiter"}</button>
      {!paid&&<button style={styles.button} onClick={()=>service("bill")} disabled={!!busy}>🧾 {busy==="bill"?"Requesting…":"Request Bill"}</button>}
      {sourceUrl&&<a style={styles.button} href={sourceUrl}>➕ Add More / Open Menu</a>}
      {sourceUrl&&!paid&&<a style={styles.pay} href={sourceUrl}>💳 Pay Bill</a>}
    </div>
    {message&&<div style={styles.note}>{message}</div>}
    <h2>Status History</h2><div>{(data.history||[]).map((h,i)=><div key={i} style={styles.history}><strong>{h.status}</strong><span>{new Date(h.created_at).toLocaleString()}</span></div>)}</div>
   </>}
   <p style={styles.footer}>Keep this link to check your order without scanning the QR again.</p>
 </section></main>
}
const styles={wrap:{minHeight:"100vh",padding:20,display:"flex",justifyContent:"center",alignItems:"center",background:"radial-gradient(circle at top,#163b2b,#07130e 65%)",fontFamily:"system-ui,-apple-system,sans-serif"},card:{width:"min(620px,100%)",background:"rgba(255,255,255,.96)",borderRadius:24,padding:24,boxShadow:"0 24px 70px rgba(0,0,0,.3)"},brand:{fontWeight:800,fontSize:18},live:{fontSize:11,letterSpacing:1.2,marginTop:6,opacity:.65},status:{margin:"18px 0",padding:16,borderRadius:16,background:"#eef8f1",fontWeight:800,fontSize:20},row:{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #eee"},actions:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginTop:20},button:{border:0,borderRadius:13,padding:"13px 14px",background:"#173c2b",color:"white",fontWeight:700,textAlign:"center",textDecoration:"none",cursor:"pointer"},pay:{borderRadius:13,padding:"13px 14px",background:"#c99a2e",color:"white",fontWeight:800,textAlign:"center",textDecoration:"none"},error:{padding:14,borderRadius:12,background:"#fff0f0",color:"#9b1c1c"},note:{marginTop:14,padding:12,borderRadius:12,background:"#f2f6f3"},history:{display:"flex",justifyContent:"space-between",gap:12,padding:"9px 0",borderBottom:"1px solid #eee",fontSize:13},footer:{marginTop:22,fontSize:12,opacity:.6}}
