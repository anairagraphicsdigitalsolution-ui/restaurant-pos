"use client"

import { useState } from "react"

const features = [
  {
    id: "dashboard",
    icon: "📊",
    title: "Smart Dashboard",
    text: "Track sales, orders, top-selling items and daily performance from one place.",
  },
  {
    id: "qr",
    icon: "📱",
    title: "QR Table Ordering",
    text: "Give every table or room its own QR. Guests scan, browse the menu and order directly.",
  },
  {
    id: "kitchen",
    icon: "👨‍🍳",
    title: "Kitchen Display",
    text: "Keep incoming orders organized with live kitchen status updates.",
  },
  {
    id: "billing",
    icon: "🧾",
    title: "Fast Billing",
    text: "Finalize orders, handle payments and generate professional invoices.",
  },
  {
    id: "reservations",
    icon: "📅",
    title: "Reservations",
    text: "Keep restaurant reservations organized and easy to manage.",
  },
  {
    id: "offers",
    icon: "🎁",
    title: "Offers",
    text: "Create restaurant offers and apply them during billing.",
  },
  {
    id: "branding",
    icon: "🎨",
    title: "White-Label Branding",
    text: "Give every restaurant its own logo, colors and theme without affecting other restaurants.",
  },
]

const previewData = {
  dashboard: {
    title: "Restaurant Dashboard",
    subtitle: "Everything your team needs at a glance.",
    stats: [
      ["Today's Sale", "₹24,850", "↗ 18.4%"],
      ["Total Orders", "128", "Today"],
      ["Top Item", "Paneer Tikka", "42 sold"],
      ["Pending", "07", "Kitchen"],
    ],
  },

  qr: {
    title: "QR Ordering",
    subtitle: "One QR for every table and room.",
    stats: [
      ["Tables", "24", "QR Ready"],
      ["Rooms", "12", "QR Ready"],
      ["Orders", "86", "Today"],
      ["Avg. Order", "₹684", "Today"],
    ],
  },

  kitchen: {
    title: "Kitchen Display",
    subtitle: "Live order flow for the kitchen team.",
    stats: [
      ["Pending", "07", "New"],
      ["Preparing", "11", "In Kitchen"],
      ["Ready", "05", "For Service"],
      ["Completed", "105", "Today"],
    ],
  },

  billing: {
    title: "Billing & Invoices",
    subtitle: "Fast, clear and professional billing.",
    stats: [
      ["Bills", "118", "Today"],
      ["Revenue", "₹72,480", "Today"],
      ["Paid", "₹68,920", "Collected"],
      ["Pending", "₹3,560", "Balance"],
    ],
  },

  reservations: {
    title: "Reservations",
    subtitle: "Keep bookings organized.",
    stats: [
      ["Today", "34", "Bookings"],
      ["Confirmed", "28", "Guests"],
      ["Pending", "04", "Awaiting"],
      ["Cancelled", "02", "Today"],
    ],
  },

  offers: {
    title: "Offers",
    subtitle: "Promotions that are easy to manage.",
    stats: [
      ["Active", "06", "Offers"],
      ["Redeemed", "42", "Today"],
      ["Savings", "₹8,420", "Customers"],
      ["Conversion", "18.6%", "Today"],
    ],
  },

  branding: {
    title: "Restaurant Branding",
    subtitle: "Your brand, your identity, your theme.",
    stats: [
      ["Themes", "07", "Premium"],
      ["Brand Themes", "03", "From Logo"],
      ["Logo", "Ready", "Uploaded"],
      ["Restaurants", "12", "Isolated"],
    ],
  },
}

export default function DemoPage() {
  const [active, setActive] = useState("dashboard")
  const [mobileOpen, setMobileOpen] = useState(false)

  const preview = previewData[active]

  return (
    <div className="demoPage">

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        html {
          scroll-behavior: smooth;
        }

        body {
          margin: 0;
          background: #020617;
          color: #fff;
        }

        .demoPage {
          min-height: 100vh;
          overflow-x: hidden;
          background:
            radial-gradient(
              circle at 15% 5%,
              rgba(16,185,129,.16),
              transparent 28%
            ),
            radial-gradient(
              circle at 85% 10%,
              rgba(251,191,36,.12),
              transparent 24%
            ),
            linear-gradient(
              180deg,
              #020617 0%,
              #07111f 55%,
              #020617 100%
            );
          color: #fff;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .demoNav {
          position: sticky;
          top: 0;
          z-index: 100;
          backdrop-filter: blur(18px);
          background: rgba(2,6,23,.78);
          border-bottom: 1px solid rgba(255,255,255,.08);
        }

        .demoNavInner,
        .demoContainer {
          width: min(1180px, calc(100% - 36px));
          margin: 0 auto;
        }

        .demoNavInner {
          min-height: 72px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 11px;
          text-decoration: none;
          color: #fff;
          font-weight: 800;
          letter-spacing: -.02em;
        }

        .brand img {
          width: 42px;
          height: 42px;
          object-fit: contain;
          border-radius: 11px;
        }

        .brandName {
          display: block;
          font-family:
            Georgia,
            "Times New Roman",
            serif;
          font-size: 21px;
          line-height: 1;
          font-weight: 800;
          letter-spacing: -.025em;
          color: #f4b942;
          text-shadow:
            0 1px 14px rgba(244,185,66,.18);
        }

        .brandSub {
          display: block;
          margin-top: 4px;
          color: #94a3b8;
          font-family: Inter, sans-serif;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: .02em;
        }

        .navLinks {
          display: flex;
          align-items: center;
          gap: 18px;
        }

        .navLinks a {
          color: #cbd5e1;
          text-decoration: none;
          font-size: 13px;
          font-weight: 600;
        }

        .navLinks a:hover {
          color: #fbbf24;
        }

        .navContact {
          color: #fbbf24 !important;
          padding: 9px 14px;
          border: 1px solid rgba(251,191,36,.35);
          border-radius: 10px;
          background: rgba(251,191,36,.07);
        }

        .navContact:hover {
          background: rgba(251,191,36,.14);
        }

        .navCta,
        .heroCta {
          border: 0;
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 13px;
          font-weight: 800;
        }

        .navCta {
          padding: 11px 16px;
          color: #111827 !important;
          background: linear-gradient(
            135deg,
            #fbbf24,
            #f59e0b
          );
        }

        .hero {
          padding: 86px 0 62px;
        }

        .heroGrid {
          display: grid;
          grid-template-columns: 1.05fr .95fr;
          gap: 52px;
          align-items: center;
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 12px;
          border-radius: 999px;
          background: rgba(16,185,129,.10);
          border: 1px solid rgba(16,185,129,.28);
          color: #6ee7b7;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .12em;
        }

        h1 {
          margin: 20px 0 18px;
          font-size: clamp(42px,6vw,72px);
          line-height: .98;
          letter-spacing: -.055em;
          max-width: 760px;
        }

        .gold {
          color: #fbbf24;
        }

        .heroText {
          max-width: 650px;
          color: #94a3b8;
          font-size: 18px;
          line-height: 1.75;
        }

        .heroActions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 28px;
        }

        .heroCta {
          padding: 14px 19px;
        }

        .heroCta.primary {
          color: #111827;
          background:
            linear-gradient(
              135deg,
              #fbbf24,
              #f59e0b
            );
        }

        .heroCta.secondary {
          color: #fff;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.12);
        }

        .trust {
          margin-top: 24px;
          color: #64748b;
          font-size: 13px;
        }

        .mockup {
          position: relative;
          border-radius: 25px;
          padding: 12px;
          background:
            linear-gradient(
              145deg,
              rgba(255,255,255,.15),
              rgba(255,255,255,.03)
            );
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 35px 90px rgba(0,0,0,.45);
          transform:
            perspective(1200px)
            rotateY(-5deg)
            rotateX(2deg);
        }

        .mockTop {
          height: 32px;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0 10px;
          color: #64748b;
          font-size: 11px;
        }

        .dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #334155;
        }

        .mockBody {
          display: grid;
          grid-template-columns: 130px 1fr;
          min-height: 350px;
          border-radius: 18px;
          overflow: hidden;
          background: #0b1220;
          border: 1px solid rgba(255,255,255,.07);
        }

        .mockSide {
          padding: 18px 12px;
          border-right: 1px solid rgba(255,255,255,.06);
          background: #0a101c;
        }

        .mockSide strong {
          display: block;
          color: #fbbf24;
          font-size: 13px;
          margin-bottom: 22px;
        }

        .mockItem {
          padding: 9px 10px;
          border-radius: 9px;
          color: #64748b;
          font-size: 11px;
          margin-bottom: 5px;
        }

        .mockItem.active {
          background: rgba(251,191,36,.12);
          color: #fbbf24;
        }

        .mockMain {
          padding: 20px;
        }

        .mockTitle {
          font-size: 20px;
          font-weight: 800;
          margin-bottom: 4px;
        }

        .mockSub {
          color: #64748b;
          font-size: 11px;
        }

        .miniGrid {
          display: grid;
          grid-template-columns: repeat(2,1fr);
          gap: 10px;
          margin-top: 18px;
        }

        .miniCard {
          padding: 14px;
          border-radius: 14px;
          background:
            linear-gradient(
              145deg,
              #111827,
              #0f172a
            );
          border: 1px solid rgba(255,255,255,.06);
        }

        .miniCard small {
          color: #64748b;
          font-size: 9px;
        }

        .miniCard b {
          display: block;
          color: #fff;
          font-size: 20px;
          margin-top: 7px;
        }

        .miniCard span {
          color: #22c55e;
          font-size: 9px;
        }

        .section {
          padding: 76px 0;
        }

        .sectionHead {
          max-width: 720px;
          margin-bottom: 30px;
        }

        .sectionHead h2 {
          margin: 10px 0;
          font-size: clamp(30px,4vw,46px);
          letter-spacing: -.04em;
        }

        .sectionHead p {
          margin: 0;
          color: #94a3b8;
          line-height: 1.7;
        }

        .featureGrid {
          display: grid;
          grid-template-columns: repeat(4,1fr);
          gap: 15px;
        }

        .feature {
          padding: 21px;
          min-height: 180px;
          border-radius: 20px;
          background:
            linear-gradient(
              145deg,
              rgba(255,255,255,.07),
              rgba(255,255,255,.025)
            );
          border: 1px solid rgba(255,255,255,.08);
          transition: .25s ease;
        }

        .feature:hover {
          transform: translateY(-4px);
          border-color: rgba(251,191,36,.28);
        }

        .featureIcon {
          font-size: 25px;
        }

        .feature h3 {
          margin: 14px 0 8px;
          font-size: 16px;
        }

        .feature p {
          margin: 0;
          color: #94a3b8;
          font-size: 13px;
          line-height: 1.65;
        }

        .demoShell {
          border: 1px solid rgba(255,255,255,.10);
          border-radius: 26px;
          overflow: hidden;
          background: #070d18;
          box-shadow: 0 30px 80px rgba(0,0,0,.35);
        }

        .demoTabs {
          display: flex;
          gap: 8px;
          padding: 12px;
          overflow-x: auto;
          border-bottom: 1px solid rgba(255,255,255,.08);
        }

        .demoTab {
          white-space: nowrap;
          padding: 10px 13px;
          border-radius: 11px;
          border: 1px solid transparent;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          font-weight: 700;
          font-size: 12px;
        }

        .demoTab.active {
          background: rgba(251,191,36,.12);
          border-color: rgba(251,191,36,.25);
          color: #fbbf24;
        }

        .demoPreview {
          padding: 25px;
        }

        .previewHead {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 15px;
        }

        .previewHead h3 {
          margin: 0 0 5px;
          font-size: 25px;
        }

        .previewHead p {
          margin: 0;
          color: #64748b;
          font-size: 13px;
        }

        .liveBadge {
          padding: 7px 10px;
          border-radius: 999px;
          background: rgba(34,197,94,.10);
          color: #4ade80;
          font-size: 11px;
          font-weight: 800;
        }

        .previewGrid {
          display: grid;
          grid-template-columns: repeat(4,1fr);
          gap: 12px;
          margin-top: 20px;
        }

        .previewCard {
          padding: 18px;
          border-radius: 17px;
          background: #0f172a;
          border: 1px solid rgba(255,255,255,.06);
        }

        .previewCard small {
          color: #64748b;
        }

        .previewCard b {
          display: block;
          font-size: 25px;
          margin: 8px 0;
        }

        .previewCard span {
          color: #fbbf24;
          font-size: 11px;
        }

        .steps {
          display: grid;
          grid-template-columns: repeat(3,1fr);
          gap: 15px;
        }

        .step {
          padding: 25px;
          border-radius: 20px;
          background: rgba(255,255,255,.045);
          border: 1px solid rgba(255,255,255,.08);
        }

        .stepNo {
          color: #fbbf24;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .12em;
        }

        .step h3 {
          margin: 10px 0 8px;
        }

        .step p {
          margin: 0;
          color: #94a3b8;
          line-height: 1.65;
          font-size: 14px;
        }

        .cta {
          margin: 30px auto 70px;
          padding: 50px 30px;
          text-align: center;
          border-radius: 28px;
          background:
            radial-gradient(
              circle at 50% 0%,
              rgba(251,191,36,.18),
              transparent 50%
            ),
            linear-gradient(
              145deg,
              #101827,
              #070d18
            );
          border: 1px solid rgba(251,191,36,.18);
        }

        .cta h2 {
          margin: 0 0 12px;
          font-size: clamp(30px,4vw,48px);
          letter-spacing: -.04em;
        }

        .cta p {
          margin: 0 auto 23px;
          max-width: 620px;
          color: #94a3b8;
          line-height: 1.7;
        }

        .footer {
          padding: 25px 0 35px;
          border-top: 1px solid rgba(255,255,255,.07);
          color: #64748b;
          font-size: 12px;
        }

        .footerInner {
          display: flex;
          justify-content: space-between;
          gap: 15px;
          align-items: center;
        }

        .mobileToggle {
          display: none;
        }

        @media (max-width: 900px) {
          .heroGrid {
            grid-template-columns: 1fr;
          }

          .mockup {
            transform: none;
            max-width: 760px;
            margin: 0 auto;
            width: 100%;
          }

          .featureGrid {
            grid-template-columns: repeat(2,1fr);
          }

          .previewGrid {
            grid-template-columns: repeat(2,1fr);
          }
        }

        @media (max-width: 700px) {
          .demoNavInner,
          .demoContainer {
            width: min(100% - 24px,1180px);
          }

          .navLinks {
            display: none;
          }

          .mobileToggle {
            display: block;
            background: transparent;
            border: 1px solid rgba(255,255,255,.12);
            color: #fff;
            border-radius: 10px;
            padding: 9px 11px;
          }

          .mobileOpen {
            display: flex;
            position: absolute;
            top: 72px;
            left: 12px;
            right: 12px;
            padding: 12px;
            flex-direction: column;
            background: #08101d;
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 15px;
          }

          .hero {
            padding: 55px 0 40px;
          }

          .heroText {
            font-size: 16px;
          }

          .featureGrid,
          .steps {
            grid-template-columns: 1fr;
          }

          .previewGrid {
            grid-template-columns: 1fr 1fr;
          }

          .previewHead {
            align-items: flex-start;
            flex-direction: column;
          }

          .mockBody {
            grid-template-columns: 90px 1fr;
          }

          .mockSide {
            padding: 14px 7px;
          }

          .mockMain {
            padding: 15px;
          }

          .miniCard b {
            font-size: 17px;
          }

          .footerInner {
            flex-direction: column;
            align-items: flex-start;
          }
        }

        @media (max-width: 420px) {
          .previewGrid {
            grid-template-columns: 1fr;
          }

          .mockBody {
            min-height: 310px;
          }

          .mockSide {
            display: none;
          }

          .mockBody {
            grid-template-columns: 1fr;
          }

          .brandName {
            font-size: 18px;
          }
        }
      `}</style>

      <header className="demoNav">
        <div className="demoNavInner">

          <a href="#top" className="brand">
            <img src="/Logo.png" alt="Anaira Graphics" />

            <span>
              <span className="brandName">Anaira POS</span>
              <span className="brandSub">
                Restaurant Management SaaS
              </span>
            </span>
          </a>

          <button
            className="mobileToggle"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Open menu"
          >
            ☰
          </button>

          <nav
            className={
              mobileOpen
                ? "navLinks mobileOpen"
                : "navLinks"
            }
          >
            <a
              href="#features"
              onClick={() => setMobileOpen(false)}
            >
              Features
            </a>

            <a
              href="#demo"
              onClick={() => setMobileOpen(false)}
            >
              Live Preview
            </a>

            <a
              href="#how"
              onClick={() => setMobileOpen(false)}
            >
              How It Works
            </a>

            <a
              href="/contact"
              className="navContact"
              onClick={() => setMobileOpen(false)}
            >
              Contact
            </a>

            <a
              href="/login"
              className="navCta"
              onClick={() => setMobileOpen(false)}
            >
              Login
            </a>
          </nav>

        </div>
      </header>

      <main id="top">

        <section className="hero">
          <div className="demoContainer heroGrid">

            <div>

              <div className="eyebrow">
                ✦ Premium Restaurant SaaS
              </div>

              <h1>
                Run your restaurant
                <br />
                <span className="gold">
                  smarter, faster.
                </span>
              </h1>

              <p className="heroText">
                One powerful platform for orders, QR ordering,
                kitchen operations, billing, reservations,
                offers and restaurant branding.
              </p>

              <div className="heroActions">

                <a
                  href="#demo"
                  className="heroCta primary"
                >
                  🚀 Explore Demo
                </a>

                <a
                  href="/contact"
                  className="heroCta secondary"
                >
                  Contact Us
                </a>

              </div>

              <div className="trust">
                Built specifically for restaurants,
                cafés, dhabas and food businesses.
              </div>

            </div>

            <div className="mockup">

              <div className="mockTop">

                <span className="dot" />
                <span className="dot" />
                <span className="dot" />

                <span style={{ marginLeft: 8 }}>
                  Anaira POS • Demo
                </span>

              </div>

              <div className="mockBody">

                <aside className="mockSide">

                  <strong>
                    ANAIRA POS
                  </strong>

                  <div className="mockItem active">
                    📊 Dashboard
                  </div>

                  <div className="mockItem">
                    🧾 Orders
                  </div>

                  <div className="mockItem">
                    👨‍🍳 Kitchen
                  </div>

                  <div className="mockItem">
                    💳 Billing
                  </div>

                  <div className="mockItem">
                    
                  </div>

                  <div className="mockItem">
                    📱 QR Menu
                  </div>

                </aside>

                <div className="mockMain">

                  <div className="mockTitle">
                    Welcome Back 👋
                  </div>

                  <div className="mockSub">
                    Monitor your restaurant in real time.
                  </div>

                  <div className="miniGrid">

                    <div className="miniCard">
                      <small>Today's Sale</small>
                      <b>₹24,850</b>
                      <span>↗ 18.4%</span>
                    </div>

                    <div className="miniCard">
                      <small>Total Orders</small>
                      <b>128</b>
                      <span>Today</span>
                    </div>

                    <div className="miniCard">
                      <small>Top Selling</small>
                      <b>42</b>
                      <span>Paneer Tikka</span>
                    </div>

                    <div className="miniCard">
                      <small>Pending</small>
                      <b>07</b>
                      <span>Kitchen</span>
                    </div>

                  </div>

                </div>

              </div>

            </div>

          </div>
        </section>

        <section
          className="section"
          id="features"
        >

          <div className="demoContainer">

            <div className="sectionHead">

              <div className="eyebrow">
                Everything in one place
              </div>

              <h2>
                Powerful tools for daily
                restaurant operations.
              </h2>

              <p>
                From the first customer scan to the final invoice,
                Anaira POS keeps the complete workflow connected.
              </p>

            </div>

            <div className="featureGrid">

              {features.map((f) => (
                <div
                  className="feature"
                  key={f.id}
                >

                  <div className="featureIcon">
                    {f.icon}
                  </div>

                  <h3>
                    {f.title}
                  </h3>

                  <p>
                    {f.text}
                  </p>

                </div>
              ))}

            </div>

          </div>

        </section>

        <section
          className="section"
          id="demo"
        >

          <div className="demoContainer">

            <div className="sectionHead">

              <div className="eyebrow">
                Interactive preview
              </div>

              <h2>
                See the experience before you buy.
              </h2>

              <p>
                Select a module below to preview the kind
                of information your restaurant team can
                manage from Anaira POS.
              </p>

            </div>

            <div className="demoShell">

              <div className="demoTabs">

                {features.map((f) => (
                  <button
                    key={f.id}
                    className={
                      active === f.id
                        ? "demoTab active"
                        : "demoTab"
                    }
                    onClick={() => setActive(f.id)}
                  >
                    {f.icon} {f.title}
                  </button>
                ))}

              </div>

              <div className="demoPreview">

                <div className="previewHead">

                  <div>

                    <h3>
                      {preview.title}
                    </h3>

                    <p>
                      {preview.subtitle}
                    </p>

                  </div>

                  <div className="liveBadge">
                    ● DEMO PREVIEW
                  </div>

                </div>

                <div className="previewGrid">

                  {preview.stats.map(
                    ([label, value, note]) => (
                      <div
                        className="previewCard"
                        key={label}
                      >

                        <small>
                          {label}
                        </small>

                        <b>
                          {value}
                        </b>

                        <span>
                          {note}
                        </span>

                      </div>
                    )
                  )}

                </div>

              </div>

            </div>

          </div>

        </section>

        <section
          className="section"
          id="how"
        >

          <div className="demoContainer">

            <div className="sectionHead">

              <div className="eyebrow">
                Simple setup
              </div>

              <h2>
                From setup to service
                in three steps.
              </h2>

            </div>

            <div className="steps">

              <div className="step">

                <div className="stepNo">
                  01 / SET UP
                </div>

                <h3>
                  Add your restaurant
                </h3>

                <p>
                  Set your restaurant profile,
                  menu, tables, rooms, staff and
                  business settings.
                </p>

              </div>

              <div className="step">

                <div className="stepNo">
                  02 / BRAND
                </div>

                <h3>
                  Make it yours
                </h3>

                <p>
                  Upload your logo and choose a
                  theme. Each restaurant keeps its
                  own branding independently.
                </p>

              </div>

              <div className="step">

                <div className="stepNo">
                  03 / OPERATE
                </div>

                <h3>
                  Run every order
                </h3>

                <p>
                  Customers scan QR codes, staff
                  manage orders, kitchen prepares
                  them and billing completes the journey.
                </p>

              </div>

            </div>

          </div>

        </section>

        <div className="demoContainer">

          <section className="cta">

            <h2>
              Ready to see Anaira POS in action?
            </h2>

            <p>
              Explore the platform and talk to us
              about setting up your restaurant.
            </p>

            <a
              href="/contact"
              className="heroCta primary"
            >
              Contact Anaira POS →
            </a>

          </section>

        </div>

      </main>

      <footer className="footer">

        <div className="demoContainer footerInner">

          <span>
            © {new Date().getFullYear()}
            {" "}
            Anaira Graphics & Digital Solution
          </span>

          <span>
            Powered by Anaira POS • Restaurant Management SaaS
          </span>

        </div>

      </footer>

    </div>
  )
}