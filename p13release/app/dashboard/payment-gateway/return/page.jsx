"use client"
import { useEffect,useState } from "react"
import { useSearchParams,useRouter } from "next/navigation"
import { supabaseCloud } from "@/lib/supabaseCloud"

export default function CashfreeReturn(){
  const params=useSearchParams()
  const router=useRouter()
  const [state,setState]=useState("Checking Cashfree payment…")
  const [detail,setDetail]=useState("")
  useEffect(()=>{
    let cancelled=false
    async function verify(){
      const orderId=String(params.get("order_id")||"").trim()
      if(!orderId){setState("Payment return received");setDetail("No order ID was provided.");return}
      try{
        const {data:{session}}=await supabaseCloud.auth.getSession()
        if(!session?.access_token) throw new Error("Please sign in again.")
        const res=await fetch(`/api/payments/cashfree/status?order_id=${encodeURIComponent(orderId)}`,{
          headers:{Authorization:`Bearer ${session.access_token}`},cache:"no-store"
        })
        const data=await res.json()
        if(!res.ok||!data.success) throw new Error(data.error||"Unable to verify payment")
        if(cancelled)return
        setState(data.status==="SUCCESS"?"Payment successful":"Payment not completed")
        setDetail(data.status==="SUCCESS"?"Cashfree payment was verified and recorded in the POS.":`Cashfree status: ${data.status}`)
      }catch(e){if(!cancelled){setState("Payment verification failed");setDetail(e.message||"Unable to verify payment")}}
    }
    verify()
    return()=>{cancelled=true}
  },[params])
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"var(--background)",color:"var(--text)"}}>
    <section style={{width:"min(520px,100%)",padding:28,borderRadius:22,background:"var(--surface)",border:"1px solid var(--border)",textAlign:"center"}}>
      <div style={{fontSize:42,marginBottom:10}}>{state==="Payment successful"?"✅":"💳"}</div>
      <h1 style={{margin:"0 0 8px"}}>{state}</h1>
      <p style={{color:"var(--muted)",lineHeight:1.5}}>{detail}</p>
      <button onClick={()=>router.push("/billing")} style={{marginTop:16,padding:"11px 18px",border:0,borderRadius:12,cursor:"pointer"}}>Back to Billing</button>
    </section>
  </main>
}
