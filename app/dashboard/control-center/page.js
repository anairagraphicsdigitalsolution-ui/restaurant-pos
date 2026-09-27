"use client"

import { useSearchParams } from "next/navigation"

const features = [
  ["P0", "Core POS", ["POS & Orders", "Tables", "Kitchen / KDS", "Billing", "Inventory", "Production", "Delivery", "Customers", "Procurement", "Payments", "Printing", "QR & Ordering", "Reservations", "Reports"]],
  ["P1", "Advanced Operations", ["Restaurant Suite", "Enterprise HQ", "Payment Terminals", "Payment Reconciliation", "Supplier Automation", "Marketing Hub", "Advanced Reporting"]],
  ["P2", "Advanced Operations", ["Call Center", "Banquet / Events / Catering", "Advanced Kiosk", "Customer Display", "Device HQ", "AI Decision Intelligence"]],
]

export default function ControlCenter(){
  const params = useSearchParams()
  const feature = params.get("feature")
  return <main style={{minHeight:"100vh",padding:"32px",background:"var(--background)",color:"var(--text)"}}>
    <div style={{maxWidth:1100,margin:"0 auto"}}>
      <div style={{fontSize:12,fontWeight:900,letterSpacing:".12em",color:"var(--muted)"}}>ADMIN CONTROL CENTER</div>
      <h1 style={{margin:"8px 0 10px"}}>P0 → P2 Feature Control</h1>
      <p style={{color:"var(--muted)",lineHeight:1.6}}>This screen is a status/control guide for restaurant admins. Feature activation is controlled by SuperAdmin. A disabled feature remains visible in navigation but cannot bypass server-side authorization.</p>
      {feature && <div style={{padding:16,borderRadius:14,border:"1px solid var(--border)",background:"var(--surface)",margin:"18px 0",fontWeight:800}}>🔒 <span>{feature}</span> is disabled. Ask SuperAdmin to enable it from Plugin Control Center.</div>}
      <div style={{display:"grid",gap:16,marginTop:22}}>{features.map(([code,title,items])=><section key={code} style={{padding:20,borderRadius:18,border:"1px solid var(--border)",background:"var(--surface)"}}><div style={{fontSize:11,fontWeight:900,color:"var(--muted)",letterSpacing:".1em"}}>{code}</div><h2 style={{margin:"5px 0 14px"}}>{title}</h2><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{items.map(x=><span key={x} style={{padding:"8px 11px",borderRadius:10,border:"1px solid var(--border)",fontSize:12}}>{x}</span>)}</div></section>)}</div>
      <div style={{marginTop:22,padding:18,borderRadius:16,border:"1px dashed var(--border)",color:"var(--muted)"}}>🔐 Enable/disable actions are intentionally not available to restaurant Admin. Use <b>SuperAdmin → Plugin Control Center</b>.</div>
    </div>
  </main>
}
