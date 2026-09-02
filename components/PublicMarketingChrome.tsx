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
        .amSite{--gold:#f5b72e;--gold2:#ffd66b;--ink:#07101c;--ink2:#0b1626;--muted:#9aa8bb;--line:rgba(255,255,255,.10);--green:#38d39f;color:#f7f9fc;background:#050b14;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .amNav{position:sticky;top:0;z-index:1000;background:rgba(5,11,20,.84);backdrop-filter:blur(20px);border-bottom:1px solid var(--line)}
        .amNavIn,.amContainer{width:min(1180px,calc(100% - 36px));margin:auto}.amNavIn{min-height:76px;display:flex;align-items:center;justify-content:space-between;gap:24px}
        .amBrand{display:flex;align-items:center;gap:11px;text-decoration:none;color:#fff}.amBrand img{width:43px;height:43px;object-fit:contain;border-radius:12px}.amBrand b{display:block;font:800 21px Georgia,serif;color:var(--gold)}.amBrand small{display:block;color:var(--muted);font-size:9px;margin-top:3px;font-weight:700;letter-spacing:.04em}
        .amLinks{display:flex;align-items:center;gap:22px}.amLinks a{color:#cbd5e1;text-decoration:none;font-size:13px;font-weight:750}.amLinks a:hover{color:var(--gold)}
        .amNavCta{padding:11px 16px!important;border-radius:11px;background:linear-gradient(135deg,var(--gold),var(--gold2));color:#17110a!important;box-shadow:0 8px 24px rgba(245,183,46,.18)}
        .amMenu{display:none;background:none;border:1px solid var(--line);color:#fff;border-radius:10px;padding:8px 11px;font-size:18px}
        .amFooter{border-top:1px solid var(--line);margin-top:70px;padding:34px 0 42px;color:var(--muted)}.amFooterGrid{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:30px}.amFooter h4{margin:0 0 12px;color:#fff;font-size:13px}.amFooter a{display:block;color:var(--muted);text-decoration:none;font-size:12px;margin:8px 0}.amFooter a:hover{color:var(--gold)}.amCopy{margin-top:30px;padding-top:18px;border-top:1px solid var(--line);font-size:11px}
        @media(max-width:800px){.amLinks{display:${open ? "flex" : "none"};position:absolute;left:18px;right:18px;top:70px;padding:16px;flex-direction:column;align-items:stretch;background:#0a1321;border:1px solid var(--line);border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.4)}.amMenu{display:block}.amFooterGrid{grid-template-columns:1fr 1fr}}
        @media(max-width:520px){.amContainer,.amNavIn{width:min(100% - 24px,1180px)}.amFooterGrid{grid-template-columns:1fr}}
      `}</style>
      <header className="amNav"><div className="amNavIn">
        <Link href="/" className="amBrand"><img src="/anaira-branding.png" alt="Anaira"/><span><b>Anaira</b><small>RESTAURANT SAAS</small></span></Link>
        <nav className="amLinks">
          <Link href="/#features" onClick={()=>setOpen(false)}>Features</Link><Link href="/demo" onClick={()=>setOpen(false)}>Demo</Link><Link href="/pricing" onClick={()=>setOpen(false)}>Pricing</Link><Link href="/contact" onClick={()=>setOpen(false)}>Contact</Link><Link href="/login" onClick={()=>setOpen(false)}>Sign in</Link><Link href="/demo#demo" className="amNavCta" onClick={()=>setOpen(false)}>Book a Demo →</Link>
        </nav><button className="amMenu" onClick={()=>setOpen(v=>!v)} aria-label="Open menu">☰</button>
      </div></header>
      {children}
      <footer className="amFooter"><div className="amContainer">
        <div className="amFooterGrid"><div><Link href="/" className="amBrand"><img src="/anaira-branding.png" alt="Anaira"/><span><b>Anaira</b><small>RESTAURANT SAAS</small></span></Link><p style={{fontSize:12,lineHeight:1.7,maxWidth:330}}>One cloud platform for restaurant operations, ordering, kitchen, billing, growth and marketing.</p></div>
          <div><h4>Product</h4><Link href="/#features">Features</Link><Link href="/demo">Live Demo</Link><Link href="/pricing">Pricing</Link></div>
          <div><h4>Sales</h4><Link href="/contact">Contact Sales</Link><Link href="/demo#demo">Book Demo</Link><Link href="/pricing">Compare Plans</Link></div>
          <div><h4>Account</h4><Link href="/login">Sign in</Link><Link href="/contact">Support</Link></div>
        </div><div className="amCopy">© {new Date().getFullYear()} Anaira Graphics & Digital Solution. All rights reserved.</div>
      </div></footer>
    </div>
  )
}
