"use client"

import { PLUGIN_CATALOG } from "@/lib/pluginCatalog"
import { pluginPriceLabel, PLUGIN_FEATURE_PRICING } from "@/lib/pluginPricing"

const plans = [
  { name: "Starter", price: "₹999", year: "₹9,990/year", note: "For small restaurants getting started", featured: false },
  { name: "Professional", price: "₹1,999", year: "₹19,990/year", note: "For growing restaurants and automation", featured: true },
  { name: "Enterprise", price: "₹3,999", year: "₹39,990/year", note: "Everything included, no plugin add-on", featured: false },
]

const featurePrice = (pair, plan) => {
  if (!pair) return null
  if (plan === "enterprise") return "Included"
  return `₹${plan === "professional" ? pair[1] : pair[0]}/mo`
}

export default function PricingPage() {
  return (
    <main className="pricingPage">
      <style jsx global>{`
        *{box-sizing:border-box} body{margin:0;background:#070b12;color:#f8fafc;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .pricingPage{min-height:100vh;background:radial-gradient(circle at 15% 0%,rgba(16,185,129,.14),transparent 30%),radial-gradient(circle at 85% 5%,rgba(251,191,36,.13),transparent 28%),#070b12;padding-bottom:70px}
        .wrap{width:min(1180px,calc(100% - 36px));margin:auto}.nav{height:72px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;background:rgba(7,11,18,.86);backdrop-filter:blur(18px)}
        .brand{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-weight:900}.brand img{width:40px;height:40px;object-fit:contain;border-radius:10px}.brand small{display:block;color:#94a3b8;font-size:11px;font-weight:600;margin-top:3px}.links{display:flex;gap:20px;align-items:center}.links a{color:#cbd5e1;text-decoration:none;font-weight:700;font-size:14px}.links a:hover{color:#f4b942}.login{padding:10px 15px;border-radius:10px;background:#f4b942;color:#111!important}
        .hero{text-align:center;padding:76px 0 44px}.eyebrow{display:inline-block;color:#f4b942;font-weight:900;letter-spacing:.12em;font-size:11px}.hero h1{font-size:clamp(38px,6vw,68px);line-height:1.02;margin:15px auto;max-width:850px}.hero p{max-width:760px;margin:auto;color:#94a3b8;line-height:1.7;font-size:16px}.actions{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:25px}.btn{display:inline-flex;padding:13px 19px;border-radius:12px;text-decoration:none;font-weight:900}.primary{background:#f4b942;color:#111}.secondary{border:1px solid rgba(255,255,255,.13);color:#fff;background:rgba(255,255,255,.04)}
        .plans{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:24px}.plan{padding:28px;border:1px solid rgba(255,255,255,.1);border-radius:22px;background:rgba(255,255,255,.035);position:relative}.plan.featured{border-color:rgba(244,185,66,.55);box-shadow:0 20px 60px rgba(0,0,0,.22)}.badge{position:absolute;right:18px;top:18px;background:#f4b942;color:#111;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:900}.plan h2{margin:0 0 12px}.price{font-size:40px;font-weight:950;color:#f4b942}.price small{font-size:13px;color:#94a3b8}.year{color:#94a3b8;margin-top:4px}.plan p{color:#94a3b8;line-height:1.6;min-height:48px}.plan ul{padding:0;margin:18px 0 0;list-style:none;color:#cbd5e1;line-height:2}.section{margin-top:62px}.section h2{font-size:32px;margin-bottom:8px}.muted{color:#94a3b8;line-height:1.7}.plugins{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:22px}.plugin{border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.025);border-radius:18px;padding:18px}.pluginTop{display:flex;gap:11px;align-items:flex-start}.icon{font-size:25px}.plugin h3{margin:2px 0 4px;font-size:16px}.cat{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em}.pluginDesc{color:#94a3b8;font-size:12px;line-height:1.55;margin:10px 0 14px}.prices{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px}.prices div{padding:8px 9px;border-radius:9px;background:rgba(255,255,255,.04)}.prices b{display:block;color:#fff;margin-bottom:2px}.switches{margin-top:13px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08)}.switches summary{cursor:pointer;color:#f4b942;font-weight:800;font-size:12px}.switch{display:flex;justify-content:space-between;gap:10px;color:#94a3b8;font-size:11px;margin-top:7px}.cta{margin-top:55px;padding:32px;border-radius:22px;text-align:center;border:1px solid rgba(244,185,66,.2);background:rgba(244,185,66,.05)}.cta h2{margin:0 0 8px}.email{color:#f4b942;font-weight:900;text-decoration:none}.foot{text-align:center;color:#64748b;margin-top:45px;font-size:12px}
        @media(max-width:850px){.plans,.plugins{grid-template-columns:1fr}.links{gap:10px}.links a:not(.login){display:none}.hero{padding-top:52px}}
      `}</style>

      <header className="nav"><div className="wrap" style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"min(1180px,calc(100% - 36px))"}}>
        <a className="brand" href="/demo"><img src="/Logo.png" alt="Anaira POS"/><span>Anaira POS<small>Restaurant Management SaaS</small></span></a>
        <nav className="links"><a href="/demo">Demo</a><a href="/contact">Contact</a><a href="/login" className="login">Login</a></nav>
      </div></header>

      <div className="wrap">
        <section className="hero"><div className="eyebrow">ANAIRA RESTAURANT POS • PRICING</div><h1>Simple pricing. Powerful restaurant operations.</h1><p>Start with the core platform, add only the plugins your restaurant needs, or choose Enterprise and run the complete Anaira suite without plugin add-on charges.</p><div className="actions"><a className="btn primary" href="/contact">Request a Demo →</a><a className="btn secondary" href="/demo">Explore Live Demo</a></div></section>

        <section className="plans">{plans.map(p=><article className={`plan ${p.featured?"featured":""}`} key={p.name}>{p.featured&&<span className="badge">MOST POPULAR</span>}<h2>{p.name}</h2><div className="price">{p.price}<small>/month</small></div><div className="year">{p.year}</div><p>{p.note}</p><ul><li>✓ Restaurant management workspace</li><li>✓ Secure restaurant-level access</li><li>{p.name === "Enterprise" ? "✓ All 21 plugins included" : "✓ Add plugins when you need them"}</li></ul></article>)}</section>

        <section className="section"><h2>All Plugins & Add-ons</h2><p className="muted">Every catalog plugin has a clear monthly price. No plugin is priced above ₹199/month. Professional gets discounted add-on pricing, QR Print Center is included, and Enterprise includes everything.</p><div className="plugins">{PLUGIN_CATALOG.map(p=><article className="plugin" key={p.code}><div className="pluginTop"><span className="icon">{p.icon}</span><div><h3>{p.name}</h3><div className="cat">{p.category}</div></div></div><div className="pluginDesc">{p.description}</div><div className="prices"><div><b>Starter</b>{p.code === "qr-ordering-pro" ? "Included" : `₹${p.monthlyPrice}/mo`}</div><div><b>Professional</b>{pluginPriceLabel(p,"professional")}</div><div><b>Enterprise</b>Included</div></div>{PLUGIN_FEATURE_PRICING[p.code]&&<details className="switches"><summary>Optional feature switches</summary>{Object.entries(PLUGIN_FEATURE_PRICING[p.code]).map(([key,pair])=><div className="switch" key={key}><span>{key.replaceAll("_"," ")}</span><span>{featurePrice(pair,"starter")} · Pro {featurePrice(pair,"professional")}</span></div>)}</details>}</article>)}</div></section>

        <section className="cta"><h2>Need help choosing the right setup?</h2><p className="muted">Tell us your restaurant type, tables and required features. We can recommend the right plan and plugin combination.</p><a className="email" href="mailto:anairagraphicsdigitalsolutio@gmail.com">anairagraphicsdigitalsolutio@gmail.com</a><div className="actions"><a className="btn primary" href="/contact">Talk to Anaira →</a><a className="btn secondary" href="/demo">See the Demo</a></div></section>
        <div className="foot">© {new Date().getFullYear()} Anaira Graphics & Digital Solution • Anaira POS</div>
      </div>
    </main>
  )
}
