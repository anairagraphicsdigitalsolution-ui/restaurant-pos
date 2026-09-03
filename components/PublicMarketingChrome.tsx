"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

export default function PublicMarketingChrome({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try {
      if (!sessionStorage.getItem("anaira_marketing_session")) sessionStorage.setItem("anaira_marketing_session", crypto.randomUUID())
    } catch {}
  }, [])
  return (
    <div className="amSite">
      <style jsx global>{`
        .amSite{--gold:#f5b72e;--gold2:#ffd66b;--ink:#07101c;--ink2:#0b1626;--muted:#9aa8bb;--line:rgba(255,255,255,.10);--green:#38d39f;color:#f7f9fc;background:#050b14;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-x:hidden}
        .amNav{position:sticky;top:0;z-index:1000;background:rgba(5,11,20,.88);backdrop-filter:blur(20px);border-bottom:1px solid var(--line)}
        .amNavIn,.amContainer{width:min(1180px,calc(100% - 36px));margin:auto}.amNavIn{min-height:76px;display:flex;align-items:center;justify-content:space-between;gap:24px}
        .amBrand{display:flex;align-items:center;gap:11px;text-decoration:none;color:#fff;min-width:0}.amBrand img{width:43px;height:43px;object-fit:contain;border-radius:12px}.amBrand b{display:block;font:800 21px Georgia,serif;color:var(--gold)}.amBrand small{display:block;color:var(--muted);font-size:9px;margin-top:3px;font-weight:700;letter-spacing:.04em}
        .amLinks{display:flex;align-items:center;gap:20px}.amLinks a{color:#cbd5e1;text-decoration:none;font-size:13px;font-weight:750;white-space:nowrap}.amLinks a:hover{color:var(--gold)}
        .amSignIn{padding:10px 14px!important;border:1px solid rgba(245,183,46,.35);border-radius:11px;color:#fff!important;background:rgba(245,183,46,.07)}
        .amNavCta{padding:11px 16px!important;border-radius:11px;background:linear-gradient(135deg,var(--gold),var(--gold2));color:#17110a!important;box-shadow:0 8px 24px rgba(245,183,46,.18)}
        .amMenu{display:none;background:none;border:1px solid var(--line);color:#fff;border-radius:10px;padding:8px 11px;font-size:18px}
        .amFooter{border-top:1px solid var(--line);margin-top:70px;padding:42px 0 30px;color:var(--muted);background:#040a12}.amFooterGrid{display:grid;grid-template-columns:1.5fr 1fr 1fr 1.35fr;gap:30px}.amFooter h4{margin:0 0 12px;color:#fff;font-size:13px}.amFooter a{display:block;color:var(--muted);text-decoration:none;font-size:12px;margin:8px 0}.amFooter a:hover{color:var(--gold)}.amFooterContact{font-size:12px;line-height:1.65}.amFooterContact a{margin:5px 0}.amCopy{margin-top:30px;padding-top:18px;border-top:1px solid var(--line);font-size:11px;display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap}.amFounderMini{margin-top:18px;padding-top:15px;border-top:1px solid var(--line);font-size:11px;line-height:1.65}.amFounderMini strong{display:block;color:#fff;font-size:12px}
        @media(max-width:920px){.amLinks{gap:12px}.amLinks a{font-size:12px}.amNavCta{padding:10px 12px!important}}
        @media(max-width:800px){.amLinks{display:${open ? "flex" : "none"};position:absolute;left:12px;right:12px;top:70px;padding:16px;flex-direction:column;align-items:stretch;background:#0a1321;border:1px solid var(--line);border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.4)}.amLinks a{padding:10px 8px}.amSignIn,.amNavCta{text-align:center}.amMenu{display:block}.amFooterGrid{grid-template-columns:1fr 1fr}}
        @media(max-width:520px){.amContainer,.amNavIn{width:min(100% - 24px,1180px)}.amNavIn{min-height:68px}.amBrand img{width:38px;height:38px}.amBrand b{font-size:18px}.amFooterGrid{grid-template-columns:1fr}.amCopy{display:block}.amCopy span{display:block;margin-top:8px}}
      `}</style>
      <header className="amNav"><div className="amNavIn">
        <Link href="/" className="amBrand" onClick={()=>setOpen(false)}><img src="/anaira-branding.png" alt="Anaira"/><span><b>Anaira</b><small>RESTAURANT SAAS</small></span></Link>
        <nav className="amLinks">
          <Link href="/#features" onClick={()=>setOpen(false)}>Features</Link>
          <Link href="/demo" onClick={()=>setOpen(false)}>Demo</Link>
          <Link href="/pricing" onClick={()=>setOpen(false)}>Pricing</Link>
          <Link href="/founder" onClick={()=>setOpen(false)}>Founder</Link>
          <Link href="/contact" onClick={()=>setOpen(false)}>Contact</Link>
          <Link href="/login" className="amSignIn" onClick={()=>setOpen(false)}>Existing Customer · Sign In</Link>
          <Link href="/demo#demo" className="amNavCta" onClick={()=>setOpen(false)}>Book a Demo →</Link>
        </nav><button className="amMenu" onClick={()=>setOpen(v=>!v)} aria-label="Open menu" aria-expanded={open}>☰</button>
      </div></header>
      {children}
      <footer className="amFooter"><div className="amContainer">
        <div className="amFooterGrid">
          <div>
            <Link href="/" className="amBrand"><img src="/anaira-branding.png" alt="Anaira"/><span><b>Anaira</b><small>RESTAURANT SAAS</small></span></Link>
            <p style={{fontSize:12,lineHeight:1.7,maxWidth:330}}>One connected platform for restaurant operations, ordering, kitchen, billing, delivery, customer engagement and growth.</p>
            <div className="amFounderMini"><strong>ANKUR VERMA</strong>Founder • Full-Stack Developer • Graphic Designer • Digital Solutions Specialist</div>
          </div>
          <div><h4>Product</h4><Link href="/#features">Features</Link><Link href="/demo">Live Demo</Link><Link href="/pricing">Pricing</Link><Link href="/login">Existing Customer Sign In</Link></div>
          <div><h4>Company</h4><Link href="/founder">Founder & Portfolio</Link><Link href="/contact">Contact</Link><Link href="/contact">Request a Demo</Link></div>
          <div className="amFooterContact"><h4>Contact</h4><a href="tel:+919736580084">+91 97365 80084</a><a href="tel:+919736500084">97365 00084</a><a href="mailto:anairagraphicsdigitalsolution@gmail.com">anairagraphicsdigitalsolution@gmail.com</a><div style={{marginTop:10}}>Near Petrol Pump,<br/>Akhara Bazar, Kullu (H.P.)</div></div>
        </div>
        <div className="amCopy"><span>© {new Date().getFullYear()} Anaira Graphics & Digital Solution. All rights reserved.</span><span>Technology • Design • Marketing • Print</span></div>
      </div></footer>
    </div>
  )
}
