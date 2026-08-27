"use client"

import { useState } from "react"

const products = [
  ["🍽️", "Restaurant POS", "Orders, tables, billing and daily restaurant operations in one workspace."],
  ["📱", "QR Ordering", "Separate QR codes for every table and room with a branded digital menu."],
  ["👨‍🍳", "Kitchen Display", "Keep incoming orders organized with live kitchen status updates."],
  ["🧾", "Billing & Invoices", "Fast payment collection with professional invoice generation."],
  ["📊", "Reports & Analytics", "Understand sales, orders and restaurant performance at a glance."],
  ["🎨", "Branding & Themes", "Each restaurant gets its own logo, colors and theme independently."],
  ["🖨️", "QR Print Center", "Print or download individual or bulk table and room QR cards."],
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

export default function ContactPage() {
  const [active, setActive] = useState("dashboard")
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sent, setSent] = useState(false)

  const preview = previewData[active]

  return (
    <main className="contactPage">

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        html {
          scroll-behavior: smooth;
        }

        body {
          margin: 0;
          background: var(--background);
          color: var(--text);
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .contactPage {
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
              var(--background) 0%,
              var(--background) 50%,
              var(--background) 100%
            );
        }

        .container {
          width: min(1180px, calc(100% - 36px));
          margin: 0 auto;
        }

        /* ================= NAVBAR ================= */

        .nav {
          height: 72px;
          position: sticky;
          top: 0;
          z-index: 100;
          backdrop-filter: blur(18px);
          background: rgba(2,6,23,.82);
          border-bottom: 1px solid rgba(255,255,255,.08);
        }

        .navIn {
          height: 72px;
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
          color: var(--text);
        }

        .brand img {
          width: 42px;
          height: 42px;
          object-fit: contain;
          border-radius: 11px;
        }

        .brandName {
          display: block;
          color: #f4b942;
          font-family:
            Georgia,
            "Times New Roman",
            serif;
          font-size: 21px;
          line-height: 1;
          font-weight: 800;
          letter-spacing: -.025em;
          text-shadow: 0 1px 14px rgba(244,185,66,.18);
        }

        .brand small {
          display: block;
          margin-top: 4px;
          color: var(--muted);
          font-size: 9px;
          font-family: Inter, sans-serif;
          font-weight: 600;
        }

        .navLinks {
          display: flex;
          align-items: center;
          gap: 18px;
        }

        .navLinks a {
          color: var(--border);
          text-decoration: none;
          font-size: 13px;
          font-weight: 700;
          transition: .2s ease;
        }

        .navLinks a:hover {
          color: var(--warning);
        }

        .navContact {
          color: var(--warning) !important;
          padding: 9px 14px;
          border: 1px solid rgba(251,191,36,.35);
          border-radius: 10px;
          background: rgba(251,191,36,.07);
        }

        .navContact:hover {
          background: rgba(251,191,36,.14);
        }

        .navBtn {
          color: var(--surface) !important;
          padding: 11px 16px;
          border-radius: 10px;
          background: linear-gradient(
            135deg,
            var(--warning),
            var(--warning)
          );
        }

        .mobileToggle {
          display: none;
          background: transparent;
          color: var(--text);
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 10px;
          padding: 8px 11px;
          font-size: 18px;
        }

        /* ================= HERO ================= */

        .hero {
          padding: 86px 0 68px;
        }

        .heroGrid {
          display: grid;
          grid-template-columns: 1.05fr .95fr;
          gap: 55px;
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
          font-size: 11px;
          font-weight: 850;
          letter-spacing: .11em;
          text-transform: uppercase;
        }

        h1 {
          margin: 20px 0 18px;
          font-size: clamp(42px,6vw,72px);
          line-height: .98;
          letter-spacing: -.055em;
          max-width: 760px;
        }

        .accent {
          color: var(--warning);
        }

        .heroText {
          max-width: 660px;
          color: var(--muted);
          font-size: 17px;
          line-height: 1.75;
          margin: 0;
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 28px;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          text-decoration: none;
          border-radius: 12px;
          padding: 14px 18px;
          font-size: 13px;
          font-weight: 850;
          transition: .2s ease;
        }

        .btn:hover {
          transform: translateY(-2px);
        }

        .primary {
          color: var(--surface);
          background: linear-gradient(
            135deg,
            var(--warning),
            var(--warning)
          );
        }

        .secondary {
          color: var(--text);
          background: rgba(255,255,255,.05);
          border: 1px solid rgba(255,255,255,.12);
        }

        .trust {
          margin-top: 22px;
          color: var(--muted);
          font-size: 12px;
        }

        /* ================= CONTACT CARD ================= */

        .contactCard {
          padding: 28px;
          border-radius: 25px;
          background:
            linear-gradient(
              145deg,
              #101b2c,
              #07101c
            );
          border: 1px solid rgba(255,255,255,.10);
          box-shadow: 0 35px 90px rgba(0,0,0,.38);
        }

        .contactCard h2 {
          margin: 0 0 8px;
          font-size: 26px;
          letter-spacing: -.03em;
        }

        .contactCard > p {
          margin: 0 0 20px;
          color: var(--muted);
          font-size: 13px;
          line-height: 1.7;
        }

        .contactItem {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 0;
          border-top: 1px solid rgba(255,255,255,.07);
        }

        .contactIcon {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          border-radius: 10px;
          background: rgba(251,191,36,.08);
          border: 1px solid rgba(251,191,36,.12);
        }

        .contactItem strong {
          display: block;
          margin-bottom: 4px;
          font-size: 11px;
        }

        .contactItem span,
        .contactItem a {
          color: var(--border);
          font-size: 13px;
          line-height: 1.5;
          text-decoration: none;
        }

        .contactItem a:hover {
          color: var(--warning);
        }

        .location {
          margin-top: 17px;
          padding: 16px;
          border-radius: 14px;
          background: rgba(16,185,129,.07);
          border: 1px solid rgba(16,185,129,.16);
        }

        .location strong {
          color: #e2e8f0;
          font-size: 11px;
        }

        .location p {
          margin: 6px 0 0;
          color: var(--muted);
          font-size: 11px;
          line-height: 1.6;
        }

        /* ================= SECTIONS ================= */

        .section {
          padding: 78px 0;
        }

        .head {
          max-width: 720px;
          margin-bottom: 30px;
        }

        .head h2 {
          margin: 12px 0;
          color: var(--text);
          font-size: clamp(30px,4vw,46px);
          line-height: 1.05;
          letter-spacing: -.045em;
        }

        .head p {
          margin: 0;
          color: var(--muted);
          line-height: 1.7;
          font-size: 14px;
        }

        /* ================= FEATURES ================= */

        .productGrid {
          display: grid;
          grid-template-columns: repeat(4,1fr);
          gap: 14px;
        }

        .product {
          min-height: 185px;
          padding: 21px;
          border-radius: 19px;
          background:
            linear-gradient(
              145deg,
              rgba(255,255,255,.07),
              rgba(255,255,255,.025)
            );
          border: 1px solid rgba(255,255,255,.08);
          transition: .25s ease;
        }

        .product:hover {
          transform: translateY(-4px);
          border-color: rgba(251,191,36,.25);
          box-shadow: 0 18px 45px rgba(0,0,0,.18);
        }

        .productIcon {
          font-size: 25px;
        }

        .product h3 {
          margin: 14px 0 8px;
          color: var(--text);
          font-size: 15px;
        }

        .product p {
          margin: 0;
          color: var(--muted);
          font-size: 12px;
          line-height: 1.65;
        }

        /* ================= APP PREVIEW ================= */

        .appPreview {
          overflow: hidden;
          border-radius: 25px;
          background: #07101d;
          border: 1px solid rgba(255,255,255,.10);
          box-shadow: 0 30px 80px rgba(0,0,0,.35);
        }

        .appTop {
          min-height: 64px;
          padding: 11px 17px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255,255,255,.07);
          background: #0a1422;
        }

        .appBrand {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .appBrand img {
          width: 35px;
          height: 35px;
          object-fit: contain;
          border-radius: 8px;
        }

        .appBrand strong {
          display: block;
          color: #f4b942;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 16px;
        }

        .appBrand small {
          display: block;
          margin-top: 2px;
          color: var(--muted);
          font-size: 9px;
        }

        .appStatus {
          color: var(--success);
          font-size: 10px;
          font-weight: 800;
        }

        .appLayout {
          display: grid;
          grid-template-columns: 185px 1fr;
          min-height: 460px;
        }

        .appSidebar {
          padding: 18px 11px;
          background: #08111e;
          border-right: 1px solid rgba(255,255,255,.06);
        }

        .sideLabel {
          margin: 9px 8px 7px;
          color: #475569;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .13em;
        }

        .sideItem {
          padding: 9px 10px;
          border-radius: 9px;
          color: var(--muted);
          font-size: 11px;
          margin-bottom: 3px;
        }

        .sideItem.active {
          color: var(--warning);
          background: rgba(251,191,36,.10);
        }

        .appContent {
          padding: 23px;
          background: #0b1524;
        }

        .appContentHead {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 15px;
        }

        .appContentHead h3 {
          margin: 0 0 4px;
          font-size: 22px;
        }

        .appContentHead p {
          margin: 0;
          color: var(--muted);
          font-size: 11px;
        }

        .appDate {
          padding: 7px 10px;
          border-radius: 8px;
          background: #111c2c;
          border: 1px solid #243244;
          color: var(--muted);
          font-size: 10px;
        }

        .statGrid {
          display: grid;
          grid-template-columns: repeat(4,1fr);
          gap: 10px;
          margin-top: 20px;
        }

        .statBox {
          padding: 14px;
          border-radius: 13px;
          background: #101c2d;
          border: 1px solid #1d2b3d;
        }

        .statBox span {
          display: block;
          color: var(--muted);
          font-size: 9px;
        }

        .statBox b {
          display: block;
          margin: 7px 0 4px;
          color: var(--text);
          font-size: 20px;
        }

        .statBox em {
          color: var(--success);
          font-size: 8px;
          font-style: normal;
        }

        .appBottom {
          display: grid;
          grid-template-columns: 1.25fr .75fr;
          gap: 12px;
          margin-top: 12px;
        }

        .panel {
          overflow: hidden;
          border: 1px solid #1d2b3d;
          border-radius: 15px;
          background: #0e1928;
        }

        .panelHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 13px 15px;
          border-bottom: 1px solid #1d2b3d;
        }

        .panelHead strong {
          color: var(--text);
          font-size: 11px;
        }

        .panelHead span {
          color: var(--muted);
          font-size: 9px;
        }

        .orderRow {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 12px;
          align-items: center;
          padding: 12px 15px;
          border-bottom: 1px solid rgba(255,255,255,.045);
        }

        .orderRow b,
        .orderRow small {
          display: block;
        }

        .orderRow b {
          color: var(--text);
          font-size: 10px;
        }

        .orderRow small {
          margin-top: 3px;
          color: var(--muted);
          font-size: 8px;
        }

        .orderRow strong {
          color: var(--text);
          font-size: 10px;
        }

        .orderStatus {
          padding: 5px 7px;
          border-radius: 6px;
          font-size: 8px;
          font-weight: 800;
        }

        .preparing {
          color: var(--warning);
          background: rgba(251,191,36,.10);
        }

        .newOrder {
          color: var(--info);
          background: rgba(96,165,250,.10);
        }

        .ready {
          color: var(--success);
          background: rgba(74,222,128,.10);
        }

        .paid {
          color: #a78bfa;
          background: rgba(167,139,250,.10);
        }

        .snapshot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 15px;
          border-bottom: 1px solid rgba(255,255,255,.045);
          color: var(--muted);
          font-size: 10px;
        }

        .snapshot b {
          color: var(--text);
          font-size: 11px;
        }

        /* ================= CONTACT FORM ================= */

        .contactSection {
          background:
            radial-gradient(
              circle at 20% 30%,
              rgba(16,185,129,.08),
              transparent 30%
            );
        }

        .split {
          display: grid;
          grid-template-columns: .85fr 1.15fr;
          gap: 20px;
        }

        .info {
          padding: 30px;
          border-radius: 22px;
          background:
            linear-gradient(
              145deg,
              #101b2c,
              #07101c
            );
          border: 1px solid rgba(255,255,255,.09);
        }

        .info h2 {
          margin: 14px 0 10px;
          color: var(--text);
          font-size: 31px;
          line-height: 1.1;
          letter-spacing: -.035em;
        }

        .info > p {
          color: var(--muted);
          line-height: 1.75;
          font-size: 13px;
        }

        .checks {
          display: grid;
          gap: 10px;
          margin-top: 22px;
        }

        .check {
          display: flex;
          gap: 9px;
          color: var(--border);
          font-size: 12px;
        }

        .check b {
          color: var(--success);
        }

        .formCard {
          padding: 30px;
          border-radius: 22px;
          background: var(--text);
          color: var(--surface);
          border: 1px solid #e2e8f0;
          box-shadow: 0 20px 55px rgba(0,0,0,.15);
        }

        .formCard h2 {
          margin: 0 0 6px;
          font-size: 25px;
          letter-spacing: -.03em;
        }

        .formCard > p {
          color: var(--muted);
          font-size: 13px;
          margin: 0 0 20px;
        }

        .formGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        label {
          display: grid;
          gap: 6px;
          color: var(--muted);
          font-size: 11px;
          font-weight: 800;
        }

        input,
        textarea,
        select {
          width: 100%;
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 12px;
          background: var(--text);
          color: var(--surface);
          font: inherit;
          font-size: 13px;
          outline: none;
        }

        input:focus,
        textarea:focus,
        select:focus {
          border-color: #0f766e;
          box-shadow:
            0 0 0 3px
            rgba(15,118,110,.08);
        }

        textarea {
          min-height: 120px;
          resize: vertical;
        }

        .full {
          grid-column: 1 / -1;
        }

        .submit {
          border: 0;
          padding: 13px 18px;
          border-radius: 11px;
          background:
            linear-gradient(
              135deg,
              var(--warning),
              var(--warning)
            );
          color: var(--surface);
          font-weight: 900;
          cursor: pointer;
        }

        .success {
          margin-top: 12px;
          padding: 13px 15px;
          border-radius: 10px;
          background: #ecfdf5;
          color: #047857;
          border: 1px solid #a7f3d0;
          font-size: 13px;
        }

        /* ================= FOOTER ================= */

        .footer {
          padding: 28px 0 35px;
          border-top: 1px solid rgba(255,255,255,.07);
          color: var(--muted);
          font-size: 12px;
        }

        .footerIn {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 15px;
        }

        /* ================= RESPONSIVE ================= */

        @media (max-width: 950px) {

          .heroGrid,
          .split {
            grid-template-columns: 1fr;
          }

          .productGrid {
            grid-template-columns: repeat(2,1fr);
          }

          .appLayout {
            grid-template-columns: 145px 1fr;
          }

          .statGrid {
            grid-template-columns: repeat(2,1fr);
          }

          .appBottom {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 700px) {

          .container {
            width: min(100% - 24px,1180px);
          }

          .nav {
            height: 68px;
          }

          .navIn {
            height: 68px;
          }

          .navLinks {
            display: none;
          }

          .mobileToggle {
            display: block;
          }

          .mobileOpen {
            display: flex;
            position: absolute;
            top: 68px;
            left: 12px;
            right: 12px;
            padding: 12px;
            flex-direction: column;
            align-items: stretch;
            background: #08101d;
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 15px;
            box-shadow: 0 25px 60px rgba(0,0,0,.35);
          }

          .mobileOpen a {
            padding: 11px;
          }

          .hero {
            padding: 55px 0 40px;
          }

          .heroText {
            font-size: 15px;
          }

          .productGrid {
            grid-template-columns: 1fr;
          }

          .appLayout {
            grid-template-columns: 1fr;
          }

          .appSidebar {
            display: none;
          }

          .appContent {
            padding: 15px;
          }

          .appContentHead {
            align-items: flex-start;
            flex-direction: column;
          }

          .statGrid {
            grid-template-columns: 1fr 1fr;
          }

          .appBottom {
            grid-template-columns: 1fr;
          }

          .formGrid {
            grid-template-columns: 1fr;
          }

          .full {
            grid-column: auto;
          }

          .footerIn {
            flex-direction: column;
            align-items: flex-start;
          }

          .contactCard,
          .info,
          .formCard {
            padding: 22px;
          }
        }

        @media (max-width: 420px) {

          .brandName {
            font-size: 18px;
          }

          .brandSub {
            font-size: 8px;
          }

          .statGrid {
            grid-template-columns: 1fr;
          }

          .orderRow {
            grid-template-columns: 1fr auto;
          }

          .orderRow strong {
            display: none;
          }

          h1 {
            font-size: 43px;
          }
        }
      `}</style>

      {/* ================= NAVBAR ================= */}

      <header className="nav">

        <div className="container navIn">

          <a href="/demo" className="brand">

            <img
              src="/Logo.png"
              alt="Anaira POS"
            />

            <span>
              <span className="brandName">
                Anaira POS
              </span>

              <small>
                Restaurant Management SaaS
              </small>
            </span>

          </a>

          <button
            className="mobileToggle"
            onClick={() =>
              setMobileOpen(!mobileOpen)
            }
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
              href="/demo#features"
              onClick={() =>
                setMobileOpen(false)
              }
            >
              Features
            </a>

            <a
              href="/demo#demo"
              onClick={() =>
                setMobileOpen(false)
              }
            >
              Live Demo
            </a>

            <a
              href="/demo#how"
              onClick={() =>
                setMobileOpen(false)
              }
            >
              How It Works
            </a>

            <a
              href="/contact"
              className="navContact"
              onClick={() =>
                setMobileOpen(false)
              }
            >
              Contact
            </a>

            <a
              href="/login"
              className="navBtn"
              onClick={() =>
                setMobileOpen(false)
              }
            >
              Login
            </a>

          </nav>

        </div>

      </header>

      {/* ================= HERO ================= */}

      <section className="hero">

        <div className="container heroGrid">

          <div>

            <div className="eyebrow">
              Restaurant Software • Kullu,
              Himachal Pradesh
            </div>

            <h1>
              Let’s build a{" "}
              <span className="accent">
                smarter restaurant.
              </span>
            </h1>

            <p className="heroText">
              Anaira POS brings restaurant orders,
              QR ordering, kitchen operations,
              billing, reports and
              branded digital menus together in one
              simple platform — designed for modern
              restaurants, cafés and food businesses.
            </p>

            <div className="actions">

              <a
                className="btn primary"
                href="tel:+919736580084"
              >
                📞 Call 97365 80084
              </a>

              <a
                className="btn secondary"
                href="#contact-form"
              >
                Send Enquiry →
              </a>

            </div>

            <div className="trust">
              Built specifically for restaurants,
              cafés, dhabas and food businesses.
            </div>

          </div>

          {/* ================= CONTACT CARD ================= */}

          <div className="contactCard">

            <h2>
              Talk to Anaira POS
            </h2>

            <p>
              Have a restaurant, café, dhaba or
              food business? Tell us what you need
              and we can show you the right workflow.
            </p>

            <div className="contactItem">

              <div className="contactIcon">
                📞
              </div>

              <div>
                <strong>
                  Phone
                </strong>

                <a href="tel:+919736580084">
                  +91 97365 80084
                </a>
              </div>

            </div>

            <div className="contactItem">

              <div className="contactIcon">
                ✉️
              </div>

              <div>
                <strong>
                  Contact
                </strong>

                <a href="mailto:anairagraphicsdigitalsolutio@gmail.com">
                  anairagraphicsdigitalsolutio@gmail.com
                </a>
              </div>

            </div>

            <div className="contactItem">

              <div className="contactIcon">
                📍
              </div>

              <div>

                <strong>
                  Office
                </strong>

                <span>
                  Near Petrol Pump,
                  Akhara Bazar, Kullu,
                  Himachal Pradesh
                </span>

              </div>

            </div>

            <div className="location">

              <strong>
                Restaurant technology,
                built for practical
                day-to-day operations.
              </strong>

              <p>
                POS • QR Ordering • Kitchen •
                Billing • Reports •
                Restaurant Branding
              </p>

            </div>

          </div>

        </div>

      </section>

      {/* ================= FEATURES ================= */}

      <section
        className="section"
        id="features"
      >

        <div className="container">

          <div className="head">

            <div className="eyebrow">
              What we offer
            </div>

            <h2>
              Everything your restaurant
              needs to run the day.
            </h2>

            <p>
              Only restaurant-focused products —
              no hotel, travel or unrelated business
              modules on this page.
            </p>

          </div>

          <div className="productGrid">

            {products.map(
              ([icon, title, text]) => (

                <article
                  className="product"
                  key={title}
                >

                  <div className="productIcon">
                    {icon}
                  </div>

                  <h3>
                    {title}
                  </h3>

                  <p>
                    {text}
                  </p>

                </article>

              )
            )}

          </div>

        </div>

      </section>

      {/* ================= APP PREVIEW ================= */}

      <section
        className="section"
        id="preview"
      >

        <div className="container">

          <div className="head">

            <div className="eyebrow">
              Anaira POS Experience
            </div>

            <h2>
              Your complete restaurant
              workspace.
            </h2>

            <p>
              A single dashboard for restaurant
              owners, staff, kitchen and billing
              teams.
            </p>

          </div>

          <div className="appPreview">

            <div className="appTop">

              <div className="appBrand">

                <img
                  src="/Logo.png"
                  alt="Anaira POS"
                />

                <div>

                  <strong>
                    Anaira POS
                  </strong>

                  <small>
                    Restaurant Management
                  </small>

                </div>

              </div>

              <span className="appStatus">
                ● Live Demo
              </span>

            </div>

            <div className="appLayout">

              <aside className="appSidebar">

                <div className="sideLabel">
                  MAIN
                </div>

                <div className="sideItem active">
                  ▦ Dashboard
                </div>

                <div className="sideItem">
                  🍽️ Orders
                </div>

                <div className="sideItem">
                  🪑 Tables
                </div>

                <div className="sideItem">
                  📱 QR Ordering
                </div>

                <div className="sideLabel">
                  OPERATIONS
                </div>

                <div className="sideItem">
                  👨‍🍳 Kitchen
                </div>

                <div className="sideItem">
                  🧾 Billing
                </div>

                <div className="sideItem">
                  
                </div>

                <div className="sideLabel">
                  MANAGEMENT
                </div>

                <div className="sideItem">
                  📊 Reports
                </div>

                <div className="sideItem">
                  🎁 Offers
                </div>

                <div className="sideItem">
                  🎨 Branding
                </div>

                <div className="sideItem">
                  ⚙️ Settings
                </div>

              </aside>

              <div className="appContent">

                <div className="appContentHead">

                  <div>

                    <h3>
                      Good Morning 👋
                    </h3>

                    <p>
                      Here’s what is happening
                      in your restaurant today.
                    </p>

                  </div>

                  <span className="appDate">
                    19 Aug 2026
                  </span>

                </div>

                <div className="statGrid">

                  <div className="statBox">
                    <span>
                      Today's Sales
                    </span>
                    <b>
                      ₹24,850
                    </b>
                    <em>
                      ↗ 18.4%
                    </em>
                  </div>

                  <div className="statBox">
                    <span>
                      Total Orders
                    </span>
                    <b>
                      128
                    </b>
                    <em>
                      Today
                    </em>
                  </div>

                  <div className="statBox">
                    <span>
                      Kitchen Pending
                    </span>
                    <b>
                      07
                    </b>
                    <em>
                      Needs attention
                    </em>
                  </div>

                  <div className="statBox">
                    <span>
                      Tables Occupied
                    </span>
                    <b>
                      18/24
                    </b>
                    <em>
                      75% occupancy
                    </em>
                  </div>

                </div>

                <div className="appBottom">

                  <div className="panel">

                    <div className="panelHead">
                      <strong>
                        Live Orders
                      </strong>

                      <span>
                        View all →
                      </span>
                    </div>

                    <div className="orderRow">

                      <div>
                        <b>
                          #1048
                        </b>

                        <small>
                          Table 08 • 3 items
                        </small>
                      </div>

                      <span className="orderStatus preparing">
                        Preparing
                      </span>

                      <strong>
                        ₹1,240
                      </strong>

                    </div>

                    <div className="orderRow">

                      <div>
                        <b>
                          #1047
                        </b>

                        <small>
                          Table 14 • 5 items
                        </small>
                      </div>

                      <span className="orderStatus newOrder">
                        New
                      </span>

                      <strong>
                        ₹2,180
                      </strong>

                    </div>

                    <div className="orderRow">

                      <div>
                        <b>
                          #1046
                        </b>

                        <small>
                          QR Order • Table 03
                        </small>
                      </div>

                      <span className="orderStatus ready">
                        Ready
                      </span>

                      <strong>
                        ₹860
                      </strong>

                    </div>

                    <div className="orderRow">

                      <div>
                        <b>
                          #1045
                        </b>

                        <small>
                          Table 21 • 2 items
                        </small>
                      </div>

                      <span className="orderStatus paid">
                        Paid
                      </span>

                      <strong>
                        ₹620
                      </strong>

                    </div>

                  </div>

                  <div className="panel">

                    <div className="panelHead">
                      <strong>
                        Restaurant Snapshot
                      </strong>

                      <span>
                        Today
                      </span>
                    </div>

                    <div className="snapshot">
                      <span>
                        🍽️ Dine-in
                      </span>

                      <b>
                        ₹16,420
                      </b>
                    </div>

                    <div className="snapshot">
                      <span>
                        📱 QR Orders
                      </span>

                      <b>
                        ₹5,680
                      </b>
                    </div>

                    <div className="snapshot">
                      <span>
                        🥡 Takeaway
                      </span>

                      <b>
                        ₹2,750
                      </b>
                    </div>

                    <div className="snapshot">
                      <span>
                        💳 Avg. Bill
                      </span>

                      <b>
                        ₹684
                      </b>
                    </div>

                  </div>

                </div>

              </div>

            </div>

          </div>

        </div>

      </section>

      {/* ================= WORKFLOW ================= */}

      <section
        className="section"
        id="workflow"
      >

        <div className="container">

          <div className="head">

            <div className="eyebrow">
              Complete Restaurant Flow
            </div>

            <h2>
              From QR scan to payment —
              one connected system.
            </h2>

            <p>
              Anaira POS keeps the guest, staff,
              kitchen and owner experience connected.
            </p>

          </div>

          <div className="workflowGrid">

            <div className="workflowCard">

              <span>
                01
              </span>

              <div className="workflowIcon">
                📱
              </div>

              <h3>
                Guest scans QR
              </h3>

              <p>
                Table-specific digital menu opens
                with your restaurant branding.
              </p>

            </div>

            <div className="workflowArrow">
              →
            </div>

            <div className="workflowCard">

              <span>
                02
              </span>

              <div className="workflowIcon">
                🛒
              </div>

              <h3>
                Order is placed
              </h3>

              <p>
                Customer selects items and sends
                the order directly into POS.
              </p>

            </div>

            <div className="workflowArrow">
              →
            </div>

            <div className="workflowCard">

              <span>
                03
              </span>

              <div className="workflowIcon">
                👨‍🍳
              </div>

              <h3>
                Kitchen prepares
              </h3>

              <p>
                Kitchen team receives orders and
                updates preparation status.
              </p>

            </div>

            <div className="workflowArrow">
              →
            </div>

            <div className="workflowCard">

              <span>
                04
              </span>

              <div className="workflowIcon">
                🧾
              </div>

              <h3>
                Bill is closed
              </h3>

              <p>
                Billing completes payment and
                generates the professional invoice.
              </p>

            </div>

          </div>

        </div>

      </section>

      {/* ================= CONTACT ================= */}

      <section
        className="section contactSection"
        id="contact-form"
      >

        <div className="container split">

          <div className="info">

            <div className="eyebrow">
              Why Anaira POS
            </div>

            <h2>
              Built around the
              restaurant workflow.
            </h2>

            <p>
              From a guest scanning a table QR to
              the kitchen preparing the order,
              billing closing the sale and the
              owner checking reports, the system
              keeps the complete flow connected.
            </p>

            <div className="checks">

              <div className="check">
                <b>✓</b>
                Restaurant-wise data and
                branding isolation
              </div>

              <div className="check">
                <b>✓</b>
                Table and room QR ordering
              </div>

              <div className="check">
                <b>✓</b>
                Staff, kitchen and billing workflows
              </div>

              <div className="check">
                <b>✓</b>
                Professional invoices and QR
                print layouts
              </div>

              <div className="check">
                <b>✓</b>
                Mobile, tablet and desktop
                responsive interface
              </div>

            </div>

          </div>

          <div className="formCard">

            <h2>
              Request a Demo
            </h2>

            <p>
              Share your restaurant details.
              We’ll use them to understand your
              workflow.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                setSent(true)
              }}
              className="formGrid"
            >

              <label>
                Restaurant Name

                <input
                  required
                  placeholder="Your restaurant name"
                />
              </label>

              <label>
                Your Name

                <input
                  required
                  placeholder="Owner / Manager"
                />
              </label>

              <label>
                Phone

                <input
                  required
                  placeholder="Mobile number"
                />
              </label>

              <label>
                Business Type

                <select defaultValue="">
                  <option
                    value=""
                    disabled
                  >
                    Select
                  </option>

                  <option>
                    Restaurant
                  </option>

                  <option>
                    Café
                  </option>

                  <option>
                    Dhaba
                  </option>

                  <option>
                    Cloud Kitchen
                  </option>

                </select>

              </label>

              <label className="full">
                What do you need?

                <textarea
                  placeholder="QR ordering, POS, billing, kitchen, etc."
                />
              </label>

              <button
                className="submit"
                type="submit"
              >
                Send Demo Request →
              </button>

            </form>

            {sent && (
              <div className="success">
                Thank you. Your demo request
                has been captured on this demo page.
              </div>
            )}

          </div>

        </div>

      </section>

      {/* ================= FOOTER ================= */}

      <footer className="footer">

        <div className="container footerIn">

          <span>
            © {new Date().getFullYear()}
            {" "}
            Anaira Graphics & Digital Solution
          </span>

          <span>
            Restaurant Management Software •
            Kullu, Himachal Pradesh
          </span>

        </div>

      </footer>

    </main>
  )
}