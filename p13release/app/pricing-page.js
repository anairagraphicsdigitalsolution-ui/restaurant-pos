"use client"

import { useMemo, useState } from "react"
import { PLUGIN_CATALOG } from "@/lib/pluginCatalog"
import { PLUGIN_FEATURE_PRICING, pluginPriceLabel } from "@/lib/pluginPricing"

const plans = [
  {
    key: "starter",
    name: "Starter",
    monthly: 999,
    yearly: 9990,
    note: "Core POS for small restaurants",
    features: ["Restaurant POS", "Orders, tables & billing", "Advanced QR Ordering", "Basic restaurant operations"],
  },
  {
    key: "professional",
    name: "Professional",
    monthly: 1999,
    yearly: 19990,
    note: "Automation and growth features",
    popular: true,
    features: ["Everything in Starter", "WhatsApp", "Operations Hub", "Advanced Reservations", "Offers & Combos"],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    monthly: 3999,
    yearly: 39990,
    note: "Everything included",
    features: ["Everything in Professional", "All catalog plugins", "All optional features", "Enterprise-ready operations"],
  },
]

const categories = ["All", ...new Set(PLUGIN_CATALOG.map((p) => p.category))]

function money(value) {
  return `₹${Number(value).toLocaleString("en-IN")}`
}

function featureLabel(key) {
  const labels = {
    auto_confirm: "Auto-confirm reservations",
    require_phone: "Phone number required",
    require_email: "Email required",
    allow_waitlist: "Waitlist",
    allow_no_show: "No-show tracking",
    auto_assign_table: "Automatic table assignment",
    allow_table_selection: "Customer table selection",
    deposit_enabled: "Reservation deposit",
    expenses_enabled: "Expenses",
    cash_closing_enabled: "Daily cash closing",
    show_restaurant_logo: "Restaurant logo",
    show_brand_name: "Restaurant brand name",
    allow_admin_branding_changes: "Admin branding changes",
    allow_admin_theme_changes: "Admin theme changes",
    allow_admin_operational_settings: "Admin operational settings",
    customer_name_required: "Customer name required",
    customer_phone_required: "Customer phone required",
    allow_reorder: "Repeat / reorder",
    allow_cooking_request: "Cooking instructions",
    allow_customer_request: "Waiter / customer request",
    auto_send_kitchen: "Auto-send to kitchen",
    service_charge_enabled: "Service charge",
    include_logo: "Include restaurant logo",
    include_restaurant_name: "Print restaurant name",
    include_table_number: "Print table / room number",
    include_instruction: "Print scan instruction",
    accept_online_payment: "Online payment",
    accept_cash: "Cash payment",
    customer_address_required: "Customer address required",
    allow_table_order: "Table order taking",
    allow_open_order: "Open order",
    auto_send_kot: "Auto-send KOT",
    allow_item_edit_after_kot: "Edit after KOT",
    show_item_stock: "Live item availability",
    allow_discount_request: "Discount request",
    require_pin: "Staff PIN",
    restrict_to_assigned_tables: "Assigned-table restriction",
    new_order: "New order alerts",
    kitchen_ready: "Kitchen ready alerts",
    payment_received: "Payment received alerts",
    delivery_update: "Delivery update alerts",
    reservation_alert: "Reservation alerts",
    in_app: "In-app notifications",
    sound: "Sound notifications",
    browser: "Browser notifications",
    email: "Email notifications",
    waiter_call: "Waiter call",
    order_ready: "Order ready announcement",
    print_kot: "KOT printing",
    print_receipt: "Receipt printing",
    print_void: "Void printing",
    print_delivery: "Delivery printing",
    send_invoice: "Send invoice",
    send_order_confirmation: "Order confirmation",
    send_payment_receipt: "Payment receipt",
    send_qr_order_notification: "QR order notification",
    allow_24h_text: "24-hour text messaging",
    accept_orders: "Accept orders",
    sync_status: "Sync order status",
    sync_menu: "Sync menu",
    publish_offers: "Publish offers",
    publish_manual: "Manual publishing",
    offers_enabled: "Offers",
    combos_enabled: "Combos",
    allow_discount: "Discounts",
    auto_apply: "Auto-apply offers",
    allow_stack: "Stack offers",
    require_coupon: "Coupon requirement",
    facebook_promotion: "Facebook promotion",
    instagram_promotion: "Instagram promotion",
    whatsapp_promotion: "WhatsApp promotion",
    auto_print: "Auto-print",
    include_gst: "GST details",
    include_customer: "Customer details",
  }
  return labels[key] || String(key).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function PricingPage() {
  const [billing, setBilling] = useState("monthly")
  const [category, setCategory] = useState("All")

  const visiblePlugins = useMemo(
    () => category === "All" ? PLUGIN_CATALOG : PLUGIN_CATALOG.filter((p) => p.category === category),
    [category]
  )

  return (
    <main className="pricingPage">
      <style jsx global>{`
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { margin: 0; background: var(--background); color: var(--text); }
        .pricingPage {
          min-height: 100vh;
          overflow-x: hidden;
          background:
            radial-gradient(circle at 12% 4%, rgba(16,185,129,.16), transparent 28%),
            radial-gradient(circle at 88% 8%, rgba(251,191,36,.12), transparent 25%),
            var(--background);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .pricingNav { position: sticky; top: 0; z-index: 50; backdrop-filter: blur(18px); background: rgba(2,6,23,.82); border-bottom: 1px solid rgba(255,255,255,.08); }
        .pricingNavIn, .pricingContainer { width: min(1180px, calc(100% - 36px)); margin: 0 auto; }
        .pricingNavIn { min-height: 72px; display:flex; align-items:center; justify-content:space-between; gap:20px; }
        .brand { display:flex; align-items:center; gap:11px; text-decoration:none; color:var(--text); }
        .brand img { width:42px; height:42px; object-fit:contain; border-radius:11px; }
        .brandName { display:block; color:#f4b942; font:800 21px/1 Georgia,serif; }
        .brandSub { display:block; margin-top:4px; color:var(--muted); font-size:9px; font-weight:600; }
        .pricingLinks { display:flex; align-items:center; gap:18px; }
        .pricingLinks a { color:var(--border); text-decoration:none; font-size:13px; font-weight:650; }
        .pricingLinks a:hover { color:#f4b942; }
        .loginBtn { padding:10px 15px; border:1px solid rgba(251,191,36,.35); border-radius:10px; color:#f4b942 !important; }
        .hero { padding:72px 0 34px; text-align:center; }
        .eyebrow { color:#f4b942; font-size:11px; font-weight:850; letter-spacing:.16em; text-transform:uppercase; }
        h1 { max-width:850px; margin:14px auto 15px; font-size:clamp(40px,6vw,68px); line-height:1.03; letter-spacing:-.045em; }
        .gold { color:#f4b942; }
        .hero p { max-width:720px; margin:0 auto; color:var(--muted); line-height:1.75; font-size:15px; }
        .switch { display:inline-flex; margin-top:28px; padding:5px; border:1px solid rgba(255,255,255,.1); border-radius:14px; background:rgba(255,255,255,.04); }
        .switch button { border:0; background:transparent; color:var(--muted); padding:10px 18px; border-radius:10px; cursor:pointer; font-weight:800; }
        .switch button.active { background:rgba(251,191,36,.14); color:#f4b942; }
        .save { margin-left:5px; font-size:10px; color:#34d399; }
        .plans { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; padding:24px 0 68px; }
        .plan { position:relative; padding:28px; border:1px solid rgba(255,255,255,.1); border-radius:22px; background:rgba(255,255,255,.045); box-shadow:0 20px 60px rgba(0,0,0,.14); }
        .plan.popular { border-color:rgba(251,191,36,.45); transform:translateY(-8px); }
        .badge { position:absolute; top:-12px; right:20px; padding:6px 10px; border-radius:999px; background:#f4b942; color:#111827; font-size:10px; font-weight:900; }
        .plan h2 { margin:0; font-size:25px; }
        .planNote { min-height:40px; color:var(--muted); font-size:13px; margin:8px 0 20px; }
        .price { font-size:42px; font-weight:950; letter-spacing:-.04em; color:#f4b942; }
        .price small { font-size:12px; color:var(--muted); font-weight:650; }
        .annual { margin-top:4px; min-height:18px; color:var(--muted); font-size:11px; }
        .plan ul { list-style:none; padding:0; margin:22px 0; display:grid; gap:10px; }
        .plan li { color:#d8dee8; font-size:13px; line-height:1.4; }
        .plan li::before { content:"✓"; color:#34d399; font-weight:900; margin-right:9px; }
        .planCta { display:block; text-align:center; text-decoration:none; padding:13px 16px; border-radius:12px; border:1px solid rgba(251,191,36,.3); color:#f4b942; font-weight:850; }
        .plan.popular .planCta { background:#f4b942; color:#111827; }
        .sectionTitle { text-align:center; margin-bottom:12px; font-size:34px; letter-spacing:-.03em; }
        .sectionIntro { max-width:720px; margin:0 auto 24px; text-align:center; color:var(--muted); line-height:1.7; font-size:14px; }
        .filters { display:flex; flex-wrap:wrap; justify-content:center; gap:8px; margin:0 auto 24px; }
        .filter { border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.035); color:var(--muted); border-radius:999px; padding:8px 13px; cursor:pointer; font-size:11px; font-weight:750; }
        .filter.active { color:#f4b942; border-color:rgba(251,191,36,.4); background:rgba(251,191,36,.08); }
        .plugins { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; padding-bottom:62px; }
        .plugin { padding:19px; border-radius:17px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.025); }
        .pluginTop { display:flex; align-items:flex-start; gap:11px; }
        .pluginIcon { font-size:25px; }
        .plugin strong { display:block; margin-top:2px; font-size:14px; }
        .pluginCat { display:block; margin-top:3px; color:#f4b942; font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
        .plugin p { color:var(--muted); font-size:11px; line-height:1.55; min-height:52px; margin:12px 0; }
        .pluginPrice { display:grid; gap:5px; padding-top:11px; border-top:1px solid rgba(255,255,255,.07); font-size:11px; color:var(--muted); }
        .pluginPrice b { color:#e7edf5; }
        .pluginPrice .included { color:#34d399; font-weight:800; }
        .featurePricing { margin-top:14px; padding-top:14px; border-top:1px solid rgba(255,255,255,.07); }
        .featurePricingHead { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:9px; color:#e7edf5; font-size:11px; font-weight:850; }
        .featurePricingHead span { color:#f4b942; font-size:9px; text-transform:uppercase; letter-spacing:.06em; }
        .featureRow { display:flex; justify-content:space-between; gap:12px; padding:9px 0; border-bottom:1px dashed rgba(255,255,255,.07); }
        .featureRow:last-child { border-bottom:0; }
        .featureRow strong { display:block; color:#d8dee8; font-size:10px; line-height:1.35; }
        .featureRow small { display:block; margin-top:2px; color:#64748b; font-size:8px; }
        .featureRates { display:flex; flex-direction:column; gap:3px; align-items:flex-end; white-space:nowrap; }
        .featureRates span { color:#94a3b8; font-size:8px; }
        .featureRates b { color:#f4b942; font-size:10px; }
        .custom { margin:0 0 60px; padding:34px; border-radius:22px; border:1px solid rgba(251,191,36,.22); background:rgba(251,191,36,.055); text-align:center; }
        .custom h2 { margin:0 0 8px; }
        .custom p { color:var(--muted); margin:0 0 20px; }
        .custom a { display:inline-block; padding:12px 20px; border-radius:11px; background:#f4b942; color:#111827; text-decoration:none; font-weight:900; }
        .footer { padding:24px 0 34px; border-top:1px solid rgba(255,255,255,.07); color:var(--muted); font-size:11px; }
        .footerIn { display:flex; justify-content:space-between; gap:20px; }
        @media (max-width: 900px) { .plans,.plugins { grid-template-columns:1fr; } .plan.popular { transform:none; } }
        @media (max-width: 650px) { .pricingLinks a:not(.loginBtn) { display:none; } .hero { padding-top:48px; } .plan { padding:23px; } .footerIn { flex-direction:column; } }
      `}</style>

      <header className="pricingNav">
        <div className="pricingNavIn">
          <a href="/demo" className="brand">
            <img src="/Logo.png" alt="Anaira POS" />
            <span><span className="brandName">Anaira POS</span><span className="brandSub">Restaurant Management SaaS</span></span>
          </a>
          <nav className="pricingLinks">
            <a href="/demo#features">Features</a>
            <a href="/demo#demo">Live Demo</a>
            <a href="/pricing">Pricing</a>
            <a href="/contact">Contact</a>
            <a href="/login" className="loginBtn">Login</a>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="pricingContainer">
          <div className="eyebrow">ANAIRA POS · SIMPLE & TRANSPARENT</div>
          <h1>Choose the right plan for your <span className="gold">restaurant.</span></h1>
          <p>Start with the core restaurant workflow and add only what you need. Professional adds the most-used growth tools, while Enterprise unlocks the complete catalog.</p>
          <div className="switch" aria-label="Billing period">
            <button className={billing === "monthly" ? "active" : ""} onClick={() => setBilling("monthly")}>Monthly</button>
            <button className={billing === "yearly" ? "active" : ""} onClick={() => setBilling("yearly")}>Yearly <span className="save">Save 2 months</span></button>
          </div>
        </div>
      </section>

      <section className="pricingContainer">
        <div className="plans">
          {plans.map((plan) => {
            const price = billing === "monthly" ? plan.monthly : plan.yearly
            const suffix = billing === "monthly" ? "/month" : "/year"
            return (
              <article key={plan.key} className={`plan ${plan.popular ? "popular" : ""}`}>
                {plan.popular && <div className="badge">MOST POPULAR</div>}
                <h2>{plan.name}</h2>
                <div className="planNote">{plan.note}</div>
                <div className="price">{money(price)} <small>{suffix}</small></div>
                <div className="annual">{billing === "monthly" ? `${money(plan.yearly)}/year when billed yearly` : `${money(Math.round(plan.yearly / 12))}/month equivalent`}</div>
                <ul>{plan.features.map((f) => <li key={f}>{f}</li>)}</ul>
                <a className="planCta" href={`/contact?plan=${plan.key}`}>{plan.key === "enterprise" ? "Talk to Sales →" : "Request a Demo →"}</a>
              </article>
            )
          })}
        </div>

        <h2 className="sectionTitle">Plugin Add-ons</h2>
        <p className="sectionIntro">See exactly what is included in each plan. Advanced QR Ordering is included across plans; Enterprise includes the complete catalog.</p>
        <div className="filters">{categories.map((item) => <button key={item} className={`filter ${category === item ? "active" : ""}`} onClick={() => setCategory(item)}>{item}</button>)}</div>
        <div className="plugins">
          {visiblePlugins.map((p) => (
            <article className="plugin" key={p.code}>
              <div className="pluginTop"><div className="pluginIcon">{p.icon}</div><div><strong>{p.name}</strong><span className="pluginCat">{p.category}</span></div></div>
              <p>{p.description}</p>
              <div className="pluginPrice">
                <div>Plugin: <b>{pluginPriceLabel(p, "starter")}</b></div>
                <div>Professional: <b>{pluginPriceLabel(p, "professional")}</b></div>
                <div>Enterprise: <span className="included">Included</span></div>
              </div>
              {PLUGIN_FEATURE_PRICING[p.code] && (
                <div className="featurePricing">
                  <div className="featurePricingHead">Optional features / switches <span>separate rate</span></div>
                  {Object.entries(PLUGIN_FEATURE_PRICING[p.code]).map(([key, pair]) => (
                    <div className="featureRow" key={key}>
                      <div>
                        <strong>{featureLabel(key)}</strong>
                        <small>Optional switch / feature</small>
                      </div>
                      <div className="featureRates">
                        <span>Starter <b>{money(pair[0])}/mo</b></span>
                        <span>Pro <b>{money(pair[1])}/mo</b></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>

        <div className="custom">
          <h2>Not sure which plan fits?</h2>
          <p>Open the demo first, then send your restaurant details with the plan you want to discuss.</p>
          <a href="/contact?source=pricing">Request a Demo →</a>
        </div>
      </section>

      <footer className="footer">
        <div className="pricingContainer footerIn">
          <span>© {new Date().getFullYear()} Anaira Graphics & Digital Solution</span>
          <span><a href="/demo" style={{color:"inherit"}}>Demo</a> · <a href="/pricing" style={{color:"inherit"}}>Pricing</a> · <a href="/contact" style={{color:"inherit"}}>Contact</a></span>
        </div>
      </footer>
    </main>
  )
}
