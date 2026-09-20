// Installable plugin catalog. Restaurant Suite is an independent master hub;
// Restaurant Core and Operations Hub remain separate master modules.
export const PLUGIN_CATALOG = [
  {code:"operations-hub",name:"Operations Hub",icon:"🧭",category:"Core",description:"Master restaurant operations workspace. Super Admin controls only Expenses and Daily Cash Closing; all other hub tools follow the Operations Hub master switch.",monthlyPrice:149,yearlyPrice:1490,starterAddon:true,professionalIncluded:true,enterpriseIncluded:true},
  {code:"restaurant-suite",name:"Restaurant Suite",icon:"🍽️",category:"Core",description:"Independent restaurant management workspace with Control Center, Advanced Operations and Anaira Suite.",monthlyPrice:149,yearlyPrice:1490,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"restaurant-core",name:"Restaurant Core",icon:"🏪",category:"Core",description:"Core POS, orders, tables, KDS, billing and delivery master switch.",monthlyPrice:149,yearlyPrice:1490,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"restaurant-pro",name:"Restaurant Pro",icon:"⚡",category:"Pro",description:"Master visibility switch for enabled Pro plugins.",monthlyPrice:199,yearlyPrice:1990,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"reservations-pro",name:"Advanced Reservations",icon:"📅",category:"Operations",description:"Reservation calendar, waitlist, table assignment, reminders, no-show and deposits.",aliases:["reservations"],monthlyPrice:149,yearlyPrice:1490,starterAddon:true,professionalIncluded:true,enterpriseIncluded:true},
  {code:"qr-ordering-pro",name:"Advanced QR Ordering",icon:"📱",category:"Ordering",description:"Table/room QR ordering, reorder and customer requests.",aliases:["qr-menu"],monthlyPrice:0,yearlyPrice:0,starterAddon:true,professionalIncluded:true,enterpriseIncluded:true},
  {code:"qr-print-center",name:"QR Print Center",icon:"🖨️",category:"Printing",description:"QR generation, preview and print-ready output.",monthlyPrice:99,yearlyPrice:990,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"website-ordering",name:"Website Ordering",icon:"🌐",category:"Ordering",description:"Public restaurant website ordering connected to the same POS/Kitchen pipeline.",monthlyPrice:149,yearlyPrice:1490,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"captain-app",name:"Captain / Waiter App",icon:"📲",category:"Staff",description:"Mobile table service and order-taking workflow.",monthlyPrice:99,yearlyPrice:990,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"smart-notifications",name:"Smart Notifications",icon:"🔔",category:"Operations",description:"Operational order, payment and service notifications.",monthlyPrice:99,yearlyPrice:990,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"calling-device",name:"Calling Device",icon:"📢",category:"Operations",description:"Voice announcement station for new orders and service calls.",monthlyPrice:99,yearlyPrice:990,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"theme-branding",name:"Theme & Branding",icon:"🎨",category:"Appearance",description:"Restaurant theme, logo and white-label branding. Super Admin controls whether the selected theme is available on POS, QR, or both.",monthlyPrice:149,yearlyPrice:1490,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"restaurant-settings",name:"Restaurant Settings",icon:"⚙️",category:"Settings",description:"Restaurant configuration and operational settings controlled by Super Admin.",monthlyPrice:49,yearlyPrice:490,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"offers",name:"Offers & Combos",icon:"🎁",category:"Marketing",description:"Single master plugin for restaurant offers and combo meals. Super Admin can enable Offers, Combos, both, or neither.",monthlyPrice:149,yearlyPrice:1490,starterAddon:true,professionalIncluded:true,enterpriseIncluded:true},
  {code:"thermal-printing",name:"Thermal / KOT Printing",icon:"🖨️",category:"Printing",description:"Thermal receipt and kitchen print workflow.",monthlyPrice:99,yearlyPrice:990,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"a4-invoice",name:"A4 Invoice Printing",icon:"📄",category:"Printing",description:"A4 invoice printing.",monthlyPrice:79,yearlyPrice:790,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"hardware-print-queue",name:"Hardware Print Queue",icon:"📋",category:"Printing",description:"Local printer bridge / hardware print queue.",monthlyPrice:99,yearlyPrice:990,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"payment-accounts",name:"Merchant Payments & Voice",icon:"💳",category:"Payments",description:"Merchant UPI account, manual QR payment, payment claim/UTR and voice payment announcement.",monthlyPrice:0,yearlyPrice:0,starterAddon:true,professionalIncluded:true,enterpriseIncluded:true},
  {code:"cashfree-payment-gateway",name:"Cashfree Payment Gateway",icon:"💳",category:"Payments",description:"Cashfree online payments with hosted checkout, payment status verification and signed webhooks.",monthlyPrice:199,yearlyPrice:1990,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"whatsapp-invoice",name:"WhatsApp",icon:"💬",category:"Integrations",description:"WhatsApp number, invoice messaging and click-to-chat.",aliases:["whatsapp"],monthlyPrice:149,yearlyPrice:1490,starterAddon:true,professionalIncluded:true,enterpriseIncluded:true},
  {code:"whatsapp-marketing",name:"WhatsApp Marketing",icon:"📣",category:"Marketing",description:"Opt-in marketing campaigns using approved WhatsApp templates and customer segments. Separate from transactional WhatsApp.",monthlyPrice:99,yearlyPrice:990,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"swiggy-integration",name:"Swiggy",icon:"🟠",category:"Integrations",description:"Swiggy partner integration configuration.",monthlyPrice:199,yearlyPrice:1990,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"zomato-integration",name:"Zomato",icon:"🔴",category:"Integrations",description:"Zomato POS integration configuration.",monthlyPrice:199,yearlyPrice:1990,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"facebook-integration",name:"Facebook",icon:"📘",category:"Marketing",description:"Facebook Page connection and approved publishing.",monthlyPrice:99,yearlyPrice:990,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"instagram-integration",name:"Instagram",icon:"📸",category:"Marketing",description:"Instagram Professional account connection and approved publishing.",monthlyPrice:99,yearlyPrice:990,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"ai-image-studio",name:"AI Image Studio",icon:"🖼️",category:"AI Studio",description:"AI image generation workspace for restaurant marketing and creative assets.",monthlyPrice:199,yearlyPrice:1990,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"ai-poster-studio",name:"AI Poster Studio",icon:"🪧",category:"AI Studio",description:"AI poster generation workspace for offers, promotions and campaigns.",monthlyPrice:199,yearlyPrice:1990,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"ai-logo-studio",name:"AI Logo Studio",icon:"🎨",category:"AI Studio",description:"AI-assisted logo generation workspace for restaurant branding.",monthlyPrice:199,yearlyPrice:1990,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"business-card-studio",name:"Business Card Studio",icon:"💳",category:"AI Studio",description:"Professional business-card design editor with front/back layouts and HD export.",monthlyPrice:149,yearlyPrice:1490,starterAddon:true,professionalIncluded:false,enterpriseIncluded:true},
  {code:"p1-enterprise-hq",name:"P1 Enterprise HQ",icon:"🏢",category:"P1 Advanced Operations",description:"Enterprise HQ, outlet comparison, central menu and pricing, transfers, approvals, staff movement and group accounting.",monthlyPrice:0,yearlyPrice:0,starterAddon:true,professionalIncluded:true,enterpriseIncluded:true},
  {code:"p1-payment-terminals",name:"P1 Payment Terminals",icon:"💳",category:"P1 Advanced Operations",description:"Payment terminal registration, health, callbacks, transactions and reconciliation.",monthlyPrice:0,yearlyPrice:0,starterAddon:true,professionalIncluded:true,enterpriseIncluded:true},
  {code:"p1-supplier-automation",name:"P1 Supplier Automation",icon:"🚚",category:"P1 Advanced Operations",description:"Reorder, RFQ, supplier comparison, purchase orders, GRN, payables and performance.",monthlyPrice:0,yearlyPrice:0,starterAddon:true,professionalIncluded:true,enterpriseIncluded:true},
  {code:"p1-marketing-hub",name:"P1 Marketing Hub",icon:"📣",category:"P1 Advanced Operations",description:"Campaigns, audience, automation, delivery monitoring and performance.",monthlyPrice:0,yearlyPrice:0,starterAddon:true,professionalIncluded:true,enterpriseIncluded:true},
  {code:"p1-advanced-reporting",name:"P1 Advanced Reporting",icon:"📊",category:"P1 Advanced Operations",description:"Advanced reports, profitability, dynamic and scheduled reporting.",monthlyPrice:0,yearlyPrice:0,starterAddon:true,professionalIncluded:true,enterpriseIncluded:true},
  {code:"p2-call-center",name:"P2 Call Center",icon:"📞",category:"P2 Advanced Operations",description:"Caller identification, customer 360, quick reorder, delivery, callback, history and agent assignment.",monthlyPrice:0,yearlyPrice:0,starterAddon:true,professionalIncluded:true,enterpriseIncluded:true},
  {code:"p2-banquet-events",name:"P2 Banquet / Events / Catering",icon:"🎪",category:"P2 Advanced Operations",description:"Event enquiry, quotes, packages, guest count, menu, advance, contract, operations and final billing.",monthlyPrice:0,yearlyPrice:0,starterAddon:true,professionalIncluded:true,enterpriseIncluded:true},
  {code:"p2-advanced-kiosk",name:"P2 Advanced Kiosk",icon:"🖥️",category:"P2 Advanced Operations",description:"Self ordering, modifiers, combos, upsell, payment, token, offline queue and KDS.",monthlyPrice:0,yearlyPrice:0,starterAddon:true,professionalIncluded:true,enterpriseIncluded:true},
  {code:"p2-customer-display",name:"P2 Customer Display",icon:"📺",category:"P2 Advanced Operations",description:"Dual-screen cart, tax, discount, offers, QR payment, loyalty, feedback and thank-you flow.",monthlyPrice:0,yearlyPrice:0,starterAddon:true,professionalIncluded:true,enterpriseIncluded:true},
  {code:"p2-device-hq",name:"P2 Device HQ",icon:"🧰",category:"P2 Advanced Operations",description:"Central device registration, heartbeat, online/offline health, configuration, replacement and audit.",monthlyPrice:0,yearlyPrice:0,starterAddon:true,professionalIncluded:true,enterpriseIncluded:true},
  {code:"p2-ai-intelligence",name:"P2 AI Decision Intelligence",icon:"🧠",category:"P2 Advanced Operations",description:"Historical datasets, forecasts, backtesting, recommendations, risk signals and business insights.",monthlyPrice:0,yearlyPrice:0,starterAddon:true,professionalIncluded:true,enterpriseIncluded:true},
]
export const PLUGIN_CODES=new Set(PLUGIN_CATALOG.map(x=>x.code))


/**
 * Super Admin must never be blocked by restaurant/plugin subscription gates.
 * Use this helper before restaurant-level plugin permission checks.
 */
export function isSuperAdminRole(role) {
  const normalized = String(role || "").toLowerCase().replace(/[\s-]+/g, "_")
  return normalized === "super_admin" ||
         normalized === "superadmin" ||
         normalized === "owner_super_admin"
}

/**
 * Returns true for Super Admin and otherwise leaves plugin access
 * to the normal restaurant subscription/plugin checks.
 */
export function canManageSaleablePlugin(role, normalPluginAccess) {
  if (isSuperAdminRole(role)) return true
  return Boolean(normalPluginAccess)
}
