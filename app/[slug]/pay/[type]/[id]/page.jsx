"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import QRCode from "react-qr-code"
import { useParams, useSearchParams } from "next/navigation"

const money=v=>`₹${Number(v||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`

function buildUpiUri(raw, amount){
  try{
    const value=String(raw||"").trim()
    if(!/^upi:\/\//i.test(value)) return value
    const u=new URL(value)
    if(amount>0 && !u.searchParams.get("am")) u.searchParams.set("am",amount.toFixed(2))
    if(!u.searchParams.get("cu")) u.searchParams.set("cu","INR")
    return u.toString()
  }catch{return String(raw||"").trim()}
}

function PaymentQrScanner({amount,onDetected,onClose}){
  const videoRef=useRef(null), streamRef=useRef(null), timerRef=useRef(null)
  const [status,setStatus]=useState("Starting camera…")
  const [unsupported,setUnsupported]=useState(false)
  const [manual,setManual]=useState("")

  useEffect(()=>{
    let cancelled=false
    async function start(){
      try{
        if(!window.isSecureContext && !["localhost","127.0.0.1"].includes(location.hostname)) throw new Error("Camera requires HTTPS or localhost")
        if(!navigator.mediaDevices?.getUserMedia) throw new Error("Camera is not available in this browser")
        if(!("BarcodeDetector" in window)) { setUnsupported(true); setStatus("QR camera scanning is not supported here") ; return }
        const detector=new window.BarcodeDetector({formats:["qr_code"]})
        const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720},audio:false}})
        if(cancelled){stream.getTracks().forEach(t=>t.stop());return}
        streamRef.current=stream
        if(videoRef.current){videoRef.current.srcObject=stream; await videoRef.current.play()}
        setStatus("Point the camera at a UPI payment QR")
        const scan=async()=>{
          if(cancelled||!videoRef.current) return
          try{
            const codes=await detector.detect(videoRef.current)
            const value=codes?.find(x=>x?.rawValue)?.rawValue
            if(value){
              const upi=buildUpiUri(value,amount)
              onDetected(upi)
              return
            }
          }catch{}
          timerRef.current=setTimeout(scan,350)
        }
        scan()
      }catch(e){setStatus(e?.message||"Unable to access camera")}
    }
    start()
    return()=>{cancelled=true;if(timerRef.current)clearTimeout(timerRef.current);streamRef.current?.getTracks?.().forEach(t=>t.stop());streamRef.current=null}
  },[amount,onDetected])

  return <div style={scannerOverlay}>
    <div style={scannerCard}>
      <div style={scannerHead}><div><small style={eyebrow}>PAYMENT QR SCANNER</small><h3 style={{margin:"4px 0 0"}}>Scan UPI QR</h3></div><button style={closeBtn} onClick={onClose}>✕</button></div>
      <div style={cameraBox}>
        {!unsupported?<video ref={videoRef} playsInline muted style={video}/>:<div style={scannerFallback}><div style={{fontSize:40}}>▦</div><b>Camera scanner unavailable</b><p>Paste the UPI QR value below if your browser does not support camera scanning.</p></div>}
        {!unsupported&&<div style={scanFrame}><span/><span/><span/><span/></div>}
      </div>
      <div style={{fontSize:13,color:"var(--muted,#9ca3af)",marginTop:10}}>{status}</div>
      <input value={manual} onChange={e=>setManual(e.target.value)} placeholder="Paste UPI QR value (optional)" style={input}/>
      <button style={primary} disabled={!manual.trim()} onClick={()=>onDetected(buildUpiUri(manual,amount))}>Use QR Value</button>
      <button style={secondary} onClick={onClose}>Close Scanner</button>
    </div>
  </div>
}

export default function PayPage(){
 const p=useParams(), q=useSearchParams(); const slug=p?.slug,type=p?.type,id=p?.id; const orderId=q?.get("order_id")||""
 const [data,setData]=useState(null),[token,setToken]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState(""),[request,setRequest]=useState(null),[reference,setReference]=useState(""),[busy,setBusy]=useState(false),[sent,setSent]=useState(false),[scanner,setScanner]=useState(false),[scannedUpi,setScannedUpi]=useState("")
 useEffect(()=>{try{const m=window.location.hash.match(/token=([^&]+)/);setToken(m?.[1]?decodeURIComponent(m[1]):window.localStorage.getItem(`anaira:qr-session:${slug}:${type}:${id}`)||"")}catch{}},[slug,type,id])
 useEffect(()=>{if(!orderId||!token)return; let stop=false; async function load(){try{const r=await fetch(`/api/public/qr-status?order_id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`,{cache:"no-store"});const d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||"Unable to load bill");if(!stop)setData(d)}catch(e){if(!stop)setError(e.message)}finally{if(!stop)setLoading(false)}}load();return()=>{stop=true}},[orderId,token])
 const order=data?.order; const due=Math.max(0,Number(order?.total_amount||0)-Number(order?.paid_amount||0)); const orderNo=String(order?.order_number??orderId).padStart(4,"0")
 const activeUpi=scannedUpi||request?.upi_uri||""
 const handleScan=async(v)=>{setScannedUpi(v);setScanner(false);if(!request) await start()}
 const openUpi=()=>{if(activeUpi)window.location.href=activeUpi}
 async function start(){if(!token||!orderId)return;setBusy(true);setError("");try{const r=await fetch("/api/public/qr-payment/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({order_id:orderId,session_token:token,method:"manual_qr"})});const d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||"Payment QR unavailable");setRequest(d)}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function claim(){if(!request?.request_id)return;setBusy(true);setError("");try{const r=await fetch("/api/public/qr-payment/claim",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request_id:request.request_id,session_token:token,reference:reference.trim()||null})});const d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||"Unable to send confirmation");setSent(true)}catch(e){setError(e.message)}finally{setBusy(false)}}
 if(loading)return <main style={shell}><div style={card}>Loading bill…</div></main>
 if(error&&!order)return <main style={shell}><div style={card}><b>Unable to open bill</b><p>{error}</p></div></main>
 return <main className="qr-pay-shell" style={shell}><div style={wrap}>
   <header className="qr-pay-head qr-pay-card" style={head}><div><small style={eyebrow}>SECURE QR BILL</small><h1 className="qr-pay-title" style={{margin:"5px 0"}}>{data?.restaurant?.name||"Restaurant"}</h1><p style={{margin:0}}>Order <b>#{orderNo}</b></p></div><div className="qr-pay-amount" style={amount}>{money(due)}<span>Amount Due</span></div></header>
   <section className="qr-pay-card" style={card}><h2 style={sectionTitle}>Bill Summary</h2>{(data?.order_items||data?.items||[]).map((x,i)=><div className="qr-pay-row" key={x.id||i} style={row}><span>{x.item_name||x.name} × {x.quantity||1}</span><b>{money(x.line_total||Number(x.unit_price||0)*Number(x.quantity||1))}</b></div>)}<div style={row}><span>Subtotal</span><b>{money(order?.subtotal)}</b></div>{Number(order?.discount_amount)>0&&<div style={row}><span>Discount</span><b>-{money(order.discount_amount)}</b></div>}<div style={{...row,fontSize:20,borderTop:"1px solid var(--border)",paddingTop:14}}><strong>Total</strong><strong>{money(order?.total_amount)}</strong></div>{Number(order?.paid_amount)>0&&<div style={row}><span>Already paid</span><b>{money(order.paid_amount)}</b></div>}</section>
   {due>0&&<section className="qr-pay-card" style={card}><div style={paymentTitle}><div><small style={eyebrow}>MANUAL / UPI PAYMENT</small><h2 style={{margin:"4px 0"}}>Pay Bill</h2></div><span style={dueBadge}>{money(due)} due</span></div><p style={{color:"var(--muted)",marginTop:0}}>Use the restaurant QR below or scan any UPI QR with the scanner.</p>
     {request?.qr_image_url?<img className="qr-pay-qr" src={request.qr_image_url} alt="Restaurant payment QR" style={qr}/>:request?.upi_uri?<div style={qrBox}><QRCode value={request.upi_uri} size={210}/></div>:<button style={primary} disabled={busy} onClick={start}>{busy?"Loading…":"Show Restaurant Payment QR"}</button>}
     <div className="qr-pay-actions" style={payActions}><button style={secondaryHalf} onClick={()=>setScanner(true)}>📷 Scan UPI QR</button>{activeUpi&&<button style={secondaryHalf} onClick={openUpi}>Open UPI App</button>}</div>{activeUpi&&scannedUpi&&<div style={detected}>✓ UPI QR detected. Amount {money(due)} will be requested when supported by the payment app.</div>}
     {request&&!sent&&<><input value={reference} onChange={e=>setReference(e.target.value.slice(0,120))} placeholder="UTR / transaction reference (optional)" style={input}/><button style={primary} disabled={busy} onClick={claim}>{busy?"Sending…":"✓ I Have Paid — Notify Restaurant"}</button></>}
     {sent&&<div style={success}>✓ Payment confirmation sent. Restaurant staff will verify and settle the payment from the billing screen.</div>}{error&&<div style={err}>{error}</div>}
   </section>}
   {due<=0&&<section style={{...card,textAlign:"center"}}><div style={{fontSize:44}}>✓</div><h2>Payment Complete</h2><p style={{color:"var(--muted)"}}>Invoice {order?.invoice_no||"generated"}. This order is closed.</p></section>}
   <button style={secondary} onClick={()=>window.location.href=`/${slug}/order/${type}/${id}`}>← Back to QR Menu</button>
 </div>{scanner&&<PaymentQrScanner amount={due} onDetected={handleScan} onClose={()=>setScanner(false)}/>}</main>
}
const shell={minHeight:"100dvh",boxSizing:"border-box",background:"var(--background,#0b1020)",color:"var(--text,#fff)",padding:"22px 14px"};const wrap={maxWidth:760,margin:"0 auto",display:"grid",gap:14};const card={background:"var(--surface,#171b2d)",border:"1px solid var(--border,rgba(255,255,255,.12))",borderRadius:22,padding:20,boxShadow:"0 14px 40px rgba(0,0,0,.18)"};const head={...card,display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",flexWrap:"wrap"};const amount={fontSize:30,fontWeight:900,textAlign:"right"};amount.span={};const row={display:"flex",justifyContent:"space-between",gap:12,padding:"8px 0"};const qr={display:"block",width:260,height:260,objectFit:"contain",background:"#fff",padding:12,borderRadius:16,margin:"14px auto"};const qrBox={width:230,height:230,background:"#fff",padding:10,borderRadius:16,margin:"14px auto",display:"grid",placeItems:"center"};const primary={width:"100%",minHeight:52,border:0,borderRadius:14,background:"var(--primary,#fbbf24)",color:"#111",fontWeight:900,fontSize:16,cursor:"pointer",marginTop:10};const secondary={width:"100%",minHeight:48,border:"1px solid rgba(var(--primary-rgb),.45)",borderRadius:14,background:"transparent",color:"var(--text)",fontWeight:800,fontSize:15,cursor:"pointer",marginTop:10};const secondaryHalf={flex:1,minHeight:48,border:"1px solid rgba(var(--primary-rgb),.45)",borderRadius:14,background:"transparent",color:"var(--text)",fontWeight:800,fontSize:14,cursor:"pointer"};const input={width:"100%",boxSizing:"border-box",marginTop:10,padding:13,borderRadius:12,border:"1px solid var(--border)",background:"var(--surface-2)",color:"var(--text)"};const success={marginTop:12,padding:14,borderRadius:14,background:"rgba(34,197,94,.12)",color:"var(--text)"};const err={marginTop:12,padding:12,borderRadius:12,background:"rgba(239,68,68,.12)"};const eyebrow={fontSize:11,fontWeight:900,letterSpacing:".12em",color:"var(--primary,#fbbf24)"};const sectionTitle={marginTop:0};const paymentTitle={display:"flex",alignItems:"center",justifyContent:"space-between",gap:12};const dueBadge={padding:"7px 10px",borderRadius:999,background:"rgba(251,191,36,.12)",color:"var(--primary,#fbbf24)",fontWeight:900,fontSize:13};const payActions={display:"flex",gap:10,marginTop:10};const detected={marginTop:10,padding:10,borderRadius:12,background:"rgba(34,197,94,.10)",fontSize:13};const scannerOverlay={position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.76)",display:"grid",placeItems:"center",padding:14};const scannerCard={width:"min(620px,100%)",maxHeight:"92vh",overflowY:"auto",background:"var(--surface,#171b2d)",color:"var(--text,#fff)",border:"1px solid var(--border,rgba(255,255,255,.12))",borderRadius:22,padding:16,boxShadow:"0 20px 60px rgba(0,0,0,.4)"};const scannerHead={display:"flex",justifyContent:"space-between",alignItems:"center",gap:12};const closeBtn={border:0,background:"transparent",color:"var(--text)",fontSize:22,cursor:"pointer"};const cameraBox={position:"relative",marginTop:12,aspectRatio:"4/3",background:"#050505",borderRadius:18,overflow:"hidden",display:"grid",placeItems:"center"};const video={width:"100%",height:"100%",objectFit:"cover"};const scanFrame={position:"absolute",inset:"18% 14%",border:"2px solid rgba(251,191,36,.9)",borderRadius:18,pointerEvents:"none"};const scannerFallback={padding:24,textAlign:"center",color:"#fff"};
