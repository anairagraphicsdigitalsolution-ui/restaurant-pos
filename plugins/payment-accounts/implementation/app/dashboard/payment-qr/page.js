"use client"

import { useCallback, useEffect, useState } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"

const Card=({title,children})=><section className="pcard"><h2>{title}</h2>{children}</section>

export default function PaymentQrPage(){
 const [rid,setRid]=useState("")
 const [loading,setLoading]=useState(true)
 const [msg,setMsg]=useState("")
 const [pluginEnabled,setPluginEnabled]=useState(false)
 const [qrUploadBusy,setQrUploadBusy]=useState(false)
 const [voiceUploadBusy,setVoiceUploadBusy]=useState(false)
 const [pay,setPay]=useState({provider:"payment-accounts",display_name:"Merchant Payments & Voice",merchant_reference:"",active:false,merchant_name:"",upi_id:"",auto_payment_detection:false,voice_enabled:true,voice_language:"hi-IN",voice_audio_url:"",voice_audio_path:"",voice_audio_name:"",browser_notification:true,manual_qr_image_url:"",manual_qr_label:"Restaurant QR"})

 const getRid=useCallback(async()=>{
  const {data:u}=await supabaseCloud.auth.getUser()
  if(!u?.user)throw new Error("Please sign in again.")
  const {data,error}=await supabaseCloud.from("profiles").select("restaurant_id").eq("id",u.user.id).maybeSingle()
  if(error)throw error
  if(!data?.restaurant_id)throw new Error("No restaurant linked with this account.")
  return data.restaurant_id
 },[])

 const load=useCallback(async()=>{
  try{
   setLoading(true)
   const r=rid||await getRid();setRid(r)
   const [pluginRes,accountRes]=await Promise.all([
    supabaseCloud.from("restaurant_plugins").select("plugin_code,enabled").eq("restaurant_id",r).eq("plugin_code","payment-accounts"),
    supabaseCloud.from("restaurant_payment_accounts").select("*").eq("restaurant_id",r).eq("provider","payment-accounts").order("updated_at",{ascending:false}).limit(1)
   ])
   if(pluginRes.error)throw pluginRes.error
   if(accountRes.error)throw accountRes.error
   const enabled=Boolean(pluginRes.data?.some(x=>x.enabled===true));setPluginEnabled(enabled)
   const account=accountRes.data?.[0]
   if(account){
    const cfg=account.settings||{}
    setPay(x=>({...x,
      provider:account.provider||x.provider,display_name:account.display_name||x.display_name,
      merchant_reference:account.merchant_reference||"",active:account.active===true,
      merchant_name:cfg.merchant_name||"",upi_id:cfg.upi_id||"",
      auto_payment_detection:cfg.auto_payment_detection===true,voice_enabled:cfg.voice_enabled!==false,
      voice_language:cfg.voice_language||"hi-IN",voice_audio_url:cfg.voice_audio_url||"",
      voice_audio_path:cfg.voice_audio_path||"",voice_audio_name:cfg.voice_audio_name||"",
      browser_notification:cfg.browser_notification!==false,
      manual_qr_image_url:cfg.manual_qr_image_url||"",manual_qr_label:cfg.manual_qr_label||"Restaurant QR"
    }))
   }
  }catch(e){setMsg(e?.message||"Unable to load")}
  finally{setLoading(false)}
 },[getRid,rid])

 useEffect(()=>{load()},[load])

 async function uploadPaymentQr(file){
  if(!file||!rid)return
  setQrUploadBusy(true);setMsg("")
  try{
   const form=new FormData();form.append("file",file);form.append("restaurant_id",rid)
   const r=await fetch("/api/payment-qr/upload",{method:"POST",body:form});const d=await r.json()
   if(!r.ok||!d.success)throw new Error(d.error||"Unable to upload QR")
   setPay(x=>({...x,manual_qr_image_url:d.url||""}))
   setMsg("Payment QR uploaded. Save Payment Settings to publish it.")
  }catch(e){setMsg(e.message||"Unable to upload QR")}
  finally{setQrUploadBusy(false)}
 }

 async function uploadPaymentVoice(file){
  if(!file||!rid)return
  setVoiceUploadBusy(true);setMsg("")
  try{
   if(file.size>15*1024*1024)throw new Error("Voice audio must be 15 MB or smaller")
   if(!String(file.type||"").startsWith("audio/"))throw new Error("Please select an audio file")
   const form=new FormData();form.append("file",file);form.append("restaurant_id",rid);form.append("event_key","payment_received")
   const r=await fetch("/api/calling/audio",{method:"POST",body:form});const d=await r.json()
   if(!r.ok||!d.success)throw new Error(d.error||"Unable to upload payment voice")
   setPay(x=>({...x,voice_audio_url:d.url||"",voice_audio_path:d.path||"",voice_audio_name:d.name||file.name}))
   setMsg("Custom payment voice uploaded. Save Payment Settings to apply it.")
  }catch(e){setMsg(e.message||"Unable to upload payment voice")}
  finally{setVoiceUploadBusy(false)}
 }

 async function removePaymentVoice(){
  if(!pay.voice_audio_path){setPay(x=>({...x,voice_audio_url:"",voice_audio_name:""}));return}
  try{
   const r=await fetch("/api/calling/audio",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({restaurant_id:rid,path:pay.voice_audio_path})})
   const d=await r.json();if(!r.ok||!d.success)throw new Error(d.error||"Unable to remove voice")
   setPay(x=>({...x,voice_audio_url:"",voice_audio_path:"",voice_audio_name:""}));setMsg("Voice removed. TTS fallback is active.")
  }catch(e){setMsg(e.message||"Unable to remove voice")}
 }

 async function save(){
  const settings={merchant_name:pay.merchant_name,upi_id:pay.upi_id,auto_payment_detection:pay.auto_payment_detection,voice_enabled:pay.voice_enabled,voice_language:pay.voice_language,voice_audio_url:pay.voice_audio_url,voice_audio_path:pay.voice_audio_path,voice_audio_name:pay.voice_audio_name,browser_notification:pay.browser_notification,manual_qr_image_url:pay.manual_qr_image_url,manual_qr_label:pay.manual_qr_label}
  const {error}=await supabaseCloud.from("restaurant_payment_accounts").upsert({restaurant_id:rid,provider:pay.provider,display_name:pay.display_name,merchant_reference:pay.merchant_reference,active:pay.active,settings,updated_at:new Date().toISOString()},{onConflict:"restaurant_id,provider,display_name"})
  setMsg(error?.message||"Merchant payment settings saved")
  if(!error)load()
 }

 if(loading)return <main className="payment-page"><div className="loading">Loading Merchant Payments…</div></main>
 return <main className="payment-page">
  <header className="hero"><div><small>SEPARATE PAYMENT PLUGIN</small><h1>Payment QR / Merchant Payments</h1><p>Merchant UPI, QR payments, payment notifications and payment voice settings.</p></div><button onClick={load}>↻ Refresh</button></header>
  {!pluginEnabled&&<div className="disabled"><b>Merchant Payments plugin is OFF</b><span>Activate <strong>Merchant Payments & Voice</strong> from Super Admin → Plugins to use this section.</span></div>}
  {msg&&<div className="msg">{msg}</div>}
  <div className="grid">
   <Card title="Merchant Payment Account">
    <form onSubmit={e=>{e.preventDefault();save()}}>
     <input placeholder="Merchant / Restaurant name" value={pay.merchant_name} disabled={!pluginEnabled} onChange={e=>setPay({...pay,merchant_name:e.target.value})}/>
     <input placeholder="Merchant UPI ID (e.g. restaurant@upi)" value={pay.upi_id} disabled={!pluginEnabled} onChange={e=>setPay({...pay,upi_id:e.target.value})}/>
     <input placeholder="Merchant reference" value={pay.merchant_reference} disabled={!pluginEnabled} onChange={e=>setPay({...pay,merchant_reference:e.target.value})}/>
     <input placeholder="Provider" value={pay.provider} disabled onChange={e=>setPay({...pay,provider:e.target.value})}/>
     <label><input type="checkbox" checked={pay.active} disabled={!pluginEnabled} onChange={e=>setPay({...pay,active:e.target.checked})}/> Account active</label>
     <label><input type="checkbox" checked={pay.auto_payment_detection} disabled={!pluginEnabled} onChange={e=>setPay({...pay,auto_payment_detection:e.target.checked})}/> Auto payment detection</label>
     <label><input type="checkbox" checked={pay.voice_enabled} disabled={!pluginEnabled} onChange={e=>setPay({...pay,voice_enabled:e.target.checked})}/> Voice payment announcement</label>
     <select value={pay.voice_language} disabled={!pluginEnabled} onChange={e=>setPay({...pay,voice_language:e.target.value})}><option value="hi-IN">Hindi</option><option value="en-IN">English (India)</option></select>
     <label><input type="checkbox" checked={pay.browser_notification} disabled={!pluginEnabled} onChange={e=>setPay({...pay,browser_notification:e.target.checked})}/> Browser notification + calling voice</label>
     <div className="voice-box">
      <div><b>🎙️ Add Custom Payment Voice</b><small>Recorded MP3/WAV/OGG voice for Payment Received announcement.</small></div>
      {pay.voice_audio_url?<><div className="voice-file">🎵 {pay.voice_audio_name||"Custom payment voice"}</div><audio controls preload="metadata" src={pay.voice_audio_url}/><div className="voice-actions"><button type="button" disabled={!pluginEnabled} onClick={()=>{const a=new Audio(pay.voice_audio_url);a.volume=1;a.play().catch(()=>{})}}>▶ Preview</button><button type="button" disabled={!pluginEnabled} onClick={removePaymentVoice}>Remove</button></div></>:<label className="voice-upload">{voiceUploadBusy?"Uploading…":"＋ Add / Upload Voice"}<input type="file" accept="audio/*,.mp3,.wav,.ogg,.webm,.aac" disabled={!pluginEnabled||voiceUploadBusy} hidden onChange={e=>{const f=e.target.files?.[0];uploadPaymentVoice(f);e.target.value=""}}/></label>}
      <small>Max 15 MB. Without custom voice, normal TTS is the fallback.</small>
     </div>
     <input placeholder="Payment QR label" value={pay.manual_qr_label} disabled={!pluginEnabled} onChange={e=>setPay({...pay,manual_qr_label:e.target.value})}/>
     <input value={pay.manual_qr_image_url} disabled={!pluginEnabled} onChange={e=>setPay({...pay,manual_qr_image_url:e.target.value})} placeholder="Manual QR image URL (any UPI company)"/>
     <label className="qr-upload"><span>Upload restaurant payment QR</span><input type="file" accept="image/*" disabled={!pluginEnabled||qrUploadBusy} onChange={e=>{uploadPaymentQr(e.target.files?.[0]);e.target.value=""}}/></label>
     {pay.manual_qr_image_url&&<img src={pay.manual_qr_image_url} alt="Payment QR preview" className="qr-preview"/>}
     <button disabled={!pluginEnabled}>Save Payment Settings</button>
    </form>
   </Card>
   <Card title="Supported payment workflows"><ul><li>UPI / QR</li><li>GPay / PhonePe customer payment</li><li>Receipt / UTR attachment</li><li>Automatic verified payment status via provider webhook</li><li>Voice announcement on POS device</li><li>Any-company manual UPI QR upload + customer “I Have Paid” confirmation</li><li>Automatic online payment confirmation when the payment gateway plugin is enabled</li><li>Cash / card / split payment records</li></ul></Card>
  </div>
  <style jsx global>{`.payment-page{min-height:100vh;padding:24px;max-width:1450px;margin:auto;background:var(--background);color:var(--text)}.hero{display:flex;justify-content:space-between;gap:20px;padding:28px;border:1px solid var(--border);border-radius:24px;background:var(--surface)}.hero small{color:var(--primary,#e5ad38);font-weight:800;letter-spacing:.16em}.hero h1{margin:8px 0;font:800 clamp(28px,4vw,48px)/1.05 Georgia,serif}.hero p,.msg,.disabled span,.pcard small,.pcard li{color:var(--muted)}.hero button,.pcard button{border:1px solid var(--border);border-radius:11px;padding:10px 14px;background:var(--surface-2);color:var(--text);font-weight:700;cursor:pointer}.hero button:hover,.pcard button:hover:not(:disabled){background:var(--primary,#e5ad38);color:#111}.disabled{display:flex;gap:12px;align-items:center;margin:16px 0;padding:14px 16px;border:1px solid rgba(229,173,56,.35);border-radius:14px;background:rgba(229,173,56,.08)}.msg{margin:16px 0;padding:12px;border:1px solid rgba(229,173,56,.3);border-radius:12px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.pcard{padding:20px;border:1px solid var(--border);border-radius:20px;background:var(--surface)}.pcard h2{margin:0 0 16px;font-size:21px}.pcard form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pcard input,.pcard select{width:100%;padding:11px;border:1px solid var(--border);border-radius:10px;background:rgba(0,0,0,.15);color:var(--text)}.pcard form>label{display:flex;align-items:center;gap:8px}.pcard form>label input{width:auto}.pcard form>button{grid-column:1/-1}.voice-box{grid-column:1/-1;display:grid;gap:8px;padding:13px;border:1px dashed var(--border);border-radius:14px;background:rgba(0,0,0,.08)}.voice-box small{display:block;font-size:11px;line-height:1.4}.voice-file{font-size:12px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.voice-box audio{width:100%}.voice-upload,.qr-upload{display:inline-flex;justify-content:center;align-items:center;width:max-content;max-width:100%;padding:10px 13px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2);font-weight:800;cursor:pointer}.voice-upload input,.qr-upload input{width:auto;border:0;padding:0}.voice-actions{display:flex;gap:8px}.qr-preview{width:180px;height:180px;object-fit:contain;background:#fff;padding:8px;border-radius:12px}.loading{min-height:70vh;display:grid;place-items:center;color:var(--muted)}@media(max-width:850px){.grid{grid-template-columns:1fr}}@media(max-width:600px){.payment-page{padding:14px}.hero{flex-direction:column}.pcard form{grid-template-columns:1fr}.voice-box{grid-column:1}.pcard form>button{grid-column:1}}`}</style>
 </main>
}
