"use client"

import { PLUGIN_CATALOG } from "@/lib/pluginCatalog"
import { pluginPriceLabel, PLUGIN_FEATURE_PRICING, pluginFeaturePriceLabel } from "@/lib/pluginPricing"

const plans = [
  { name:"Starter", price:"₹999", year:"₹9,990/year", note:"Core POS for small restaurants" },
  { name:"Professional", price:"₹1,999", year:"₹19,990/year", note:"Automation and growth features" },
  { name:"Enterprise", price:"₹3,999", year:"₹39,990/year", note:"Everything included" },
]

export default function PricingPage(){
 return <main style={{minHeight:"100vh",padding:"70px 20px",background:"var(--background)",color:"var(--text)"}}>
  <div style={{maxWidth:1150,margin:"0 auto"}}>
   <div style={{textAlign:"center",maxWidth:760,margin:"0 auto 45px"}}>
    <div style={{color:"var(--warning)",fontWeight:800,letterSpacing:".12em",fontSize:12}}>ANAIRA RESTAURANT POS</div>
    <h1 style={{fontSize:"clamp(38px,6vw,64px)",margin:"14px 0"}}>Simple plans. Powerful restaurant operations.</h1>
    <p style={{color:"var(--muted)",lineHeight:1.7}}>Choose a restaurant plan and add only the plugins you need. Advanced QR Ordering is included; Enterprise includes every catalog plugin.</p>
   </div>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16,marginBottom:55}}>
    {plans.map(p=><div key={p.name} style={{padding:25,borderRadius:20,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.04)"}}><h2>{p.name}</h2><div style={{fontSize:32,fontWeight:900,color:"var(--warning)"}}>{p.price}<small style={{fontSize:13,color:"var(--muted)"}}>/month</small></div><div style={{color:"var(--muted)",marginTop:7}}>{p.year}</div><p style={{color:"var(--muted)"}}>{p.note}</p></div>)}
   </div>
   <h2 style={{fontSize:32}}>Plugin Add-ons</h2>
   <p style={{color:"var(--muted)",lineHeight:1.7}}>Starter: QR Ordering is included; other plugins are affordable add-ons. Professional: selected plugins are discounted add-ons and QR Print Center is included. Enterprise: all plugins and optional features are included.</p>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:12,marginTop:22}}>
    {PLUGIN_CATALOG.map(p=><div key={p.code} style={{padding:18,borderRadius:16,border:"1px solid rgba(255,255,255,.08)",background:"rgba(255,255,255,.025)"}}><div style={{fontSize:24}}>{p.icon}</div><strong style={{display:"block",marginTop:8}}>{p.name}</strong><span style={{display:"block",color:"var(--muted)",fontSize:12,margin:"7px 0 12px",lineHeight:1.5}}>{p.description}</span><div style={{fontWeight:800}}>Starter: {p.code === "qr-ordering-pro" ? "Included" : `₹${Number(p.monthlyPrice).toLocaleString("en-IN")}/month`}</div><div style={{fontSize:12,color:"var(--muted)",marginTop:4}}>Professional: {pluginPriceLabel(p,"professional")}</div><div style={{fontSize:12,color:"var(--muted)",marginTop:4}}>Enterprise: Included</div>{PLUGIN_FEATURE_PRICING[p.code] && <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid rgba(255,255,255,.08)"}}><strong style={{fontSize:11}}>Optional feature switches</strong><div style={{display:"grid",gap:4,marginTop:6}}>{Object.keys(PLUGIN_FEATURE_PRICING[p.code]).map(key=><div key={key} style={{fontSize:11,color:"var(--muted)",display:"flex",justifyContent:"space-between",gap:8}}><span>{key.replaceAll("_"," ")}</span><span style={{whiteSpace:"nowrap"}}>₹{PLUGIN_FEATURE_PRICING[p.code][0]}/mo · Pro ₹{PLUGIN_FEATURE_PRICING[p.code][1]}/mo</span></div>)}</div></div>}</div>)}
   </div>
   <div style={{textAlign:"center",marginTop:50,padding:30,borderRadius:20,border:"1px solid rgba(251,191,36,.2)",background:"rgba(251,191,36,.05)"}}>
    <h2>Need a custom restaurant setup?</h2><p style={{color:"var(--muted)"}}>Talk to Anaira Graphics & Digital Solution.</p><a href="mailto:anairagraphicsdigitalsolutio@gmail.com" style={{color:"var(--warning)",fontWeight:800}}>anairagraphicsdigitalsolutio@gmail.com</a>
   </div>
  </div>
 </main>
}
