// Installable plugin catalog. Core application modules are intentionally not
// listed here; they are part of Restaurant Core / Operations Hub.
export const PLUGIN_CATALOG = [
  {code:"operations-hub",name:"Operations Hub",icon:"🧭",category:"Core",description:"Master restaurant operations workspace. Super Admin controls only Expenses and Daily Cash Closing; all other hub tools follow the Operations Hub master switch."},
  {code:"restaurant-core",name:"Restaurant Core",icon:"🏪",category:"Core",description:"Core POS, orders, tables, KDS, billing and delivery master switch."},
  {code:"restaurant-pro",name:"Restaurant Pro",icon:"⚡",category:"Pro",description:"Master visibility switch for enabled Pro plugins."},
  {code:"reservations-pro",name:"Advanced Reservations",icon:"📅",category:"Operations",description:"Reservation calendar, waitlist, table assignment, reminders, no-show and deposits.",aliases:["reservations"]},
  {code:"qr-ordering-pro",name:"Advanced QR Ordering",icon:"📱",category:"Ordering",description:"Table/room QR ordering, reorder and customer requests.",aliases:["qr-menu"]},
  {code:"qr-print-center",name:"QR Print Center",icon:"🖨️",category:"Printing",description:"QR generation, preview and print-ready output."},
  {code:"website-ordering",name:"Website Ordering",icon:"🌐",category:"Ordering",description:"Public restaurant website ordering connected to the same POS/Kitchen pipeline."},
  {code:"captain-app",name:"Captain / Waiter App",icon:"📲",category:"Staff",description:"Mobile table service and order-taking workflow."},
  {code:"smart-notifications",name:"Smart Notifications",icon:"🔔",category:"Operations",description:"Operational order, payment and service notifications."},
  {code:"calling-device",name:"Calling Device",icon:"📢",category:"Operations",description:"Voice announcement station for new orders and service calls."},
  {code:"theme-branding",name:"Theme & Branding",icon:"🎨",category:"Appearance",description:"Restaurant theme, logo and white-label branding. Super Admin controls whether the selected theme is available on POS, QR, or both."},
  {code:"restaurant-settings",name:"Restaurant Settings",icon:"⚙️",category:"Settings",description:"Restaurant configuration and operational settings controlled by Super Admin."},
  {code:"offers",name:"Offers & Combos",icon:"🎁",category:"Marketing",description:"Single master plugin for restaurant offers and combo meals. Super Admin can enable Offers, Combos, both, or neither."},
  {code:"thermal-printing",name:"Thermal / KOT Printing",icon:"🖨️",category:"Printing",description:"Thermal receipt and kitchen print workflow."},
  {code:"a4-invoice",name:"A4 Invoice Printing",icon:"📄",category:"Printing",description:"A4 invoice printing."},
  {code:"hardware-print-queue",name:"Hardware Print Queue",icon:"📋",category:"Printing",description:"Local printer bridge / hardware print queue."},
  {code:"whatsapp-invoice",name:"WhatsApp",icon:"💬",category:"Integrations",description:"WhatsApp number, invoice messaging and click-to-chat.",aliases:["whatsapp"]},
  {code:"swiggy-integration",name:"Swiggy",icon:"🟠",category:"Integrations",description:"Swiggy partner integration configuration."},
  {code:"zomato-integration",name:"Zomato",icon:"🔴",category:"Integrations",description:"Zomato POS integration configuration."},
  {code:"facebook-integration",name:"Facebook",icon:"📘",category:"Marketing",description:"Facebook Page connection and approved publishing."},
  {code:"instagram-integration",name:"Instagram",icon:"📸",category:"Marketing",description:"Instagram Professional account connection and approved publishing."},
]
export const PLUGIN_CODES=new Set(PLUGIN_CATALOG.map(x=>x.code))
