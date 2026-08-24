export const FEATURE_CATALOG = [
  { code: "pos-core", name: "POS Core", icon: "🧾", category: "POS", description: "Dine-in, takeaway, delivery, quick order, hold, park, reopen and void workflows.", aliases: ["pos"] },
  { code: "multi-terminal", name: "Multi-Terminal POS", icon: "🖥️", category: "POS", description: "Multiple billing terminals, shared KOT and bill-print workflow." },
  { code: "combos-variants", name: "Combos, Variants & Add-ons", icon: "🧩", category: "POS", description: "Item variants, modifiers, combos and paid add-ons." },
  { code: "takeaway", name: "Takeaway & Pickup", icon: "🥡", category: "Orders", description: "Pickup tokens, ready status and customer pickup workflow." },
  { code: "delivery", name: "Delivery Management", icon: "🛵", category: "Delivery", description: "Zones, charges, riders, assignment, COD, delivery status and settlement." },
  { code: "delivery-settlement", name: "Rider Settlement", icon: "💰", category: "Delivery", description: "Expected vs collected cash, UPI, card and rider reconciliation." },
  { code: "token-management", name: "Token Management", icon: "🎟️", category: "Orders", description: "Takeaway and delivery tokens with ready and pickup boards." },
  { code: "split-merge-bills", name: "Split & Merge Bills", icon: "🧮", category: "Billing", description: "Split bills, merge bills and move items between bills." },
  { code: "table-management", name: "Advanced Table Management", icon: "🪑", category: "Operations", description: "Floor map, sections, capacity, table status and waiter assignment." },
  { code: "table-transfer", name: "Table Transfer", icon: "🔄", category: "Operations", description: "Transfer tables and move items table-to-table." },
  { code: "payments", name: "Multiple Payments", icon: "💳", category: "Billing", description: "Cash, card, UPI, online, credit and partial payments." },
  { code: "refunds-voids", name: "Refund & Void", icon: "↩️", category: "Billing", description: "Refunds, voids, reasons and audit trail." },
  { code: "discounts-tax", name: "Discounts, Tax & Service Charge", icon: "🏷️", category: "Billing", description: "Discounts, coupons, GST, service charge and tips." },
  { code: "e-bill", name: "E-Bill & Invoice", icon: "📄", category: "Billing", description: "E-bills, A4 invoices and customer document delivery." },
  { code: "cash-closing", name: "Cashier Closing", icon: "💵", category: "Billing", description: "Opening cash, expected cash, actual cash and manager reconciliation." },
  { code: "kds", name: "Kitchen Display System", icon: "👨‍🍳", category: "Kitchen", description: "New, preparing, ready, served, timers and priorities." },
  { code: "kds-stations", name: "Kitchen Stations", icon: "🍕", category: "Kitchen", description: "Kitchen, bar, pizza, dessert and custom preparation stations." },
  { code: "central-kitchen", name: "Central Kitchen", icon: "🏭", category: "Kitchen", description: "Central production, branch dispatch and kitchen transfers." },
  { code: "inventory-advanced", name: "Advanced Inventory", icon: "📦", category: "Inventory", description: "Movements, batches, expiry, wastage, damaged stock and transfers." },
  { code: "recipe-bom", name: "Recipe / BOM", icon: "🍳", category: "Inventory", description: "Ingredient recipes and recipe-based costing." },
  { code: "auto-stock-deduction", name: "Automatic Stock Deduction", icon: "⚙️", category: "Inventory", description: "Automatically deduct ingredients when a menu item is sold." },
  { code: "low-stock-alerts", name: "Low Stock Alerts", icon: "📉", category: "Inventory", description: "Reorder thresholds and low-stock notifications." },
  { code: "fifo", name: "FIFO & Expiry", icon: "⏳", category: "Inventory", description: "FIFO batches, expiry tracking and ageing controls." },
  { code: "stock-transfer", name: "Stock Transfer & Wastage", icon: "🔁", category: "Inventory", description: "Branch/store transfers, wastage and damaged stock." },
  { code: "purchasing", name: "Purchasing & Suppliers", icon: "🚚", category: "Purchasing", description: "Suppliers, purchase orders, invoices, GRN and supplier payments." },
  { code: "purchase-manager", name: "Purchase Manager", icon: "🧾", category: "Purchasing", description: "Vendor comparison, purchase planning and purchase-to-stock workflow." },
  { code: "crm", name: "Customer CRM", icon: "👥", category: "CRM", description: "Customer history, favourites, VIP, birthdays, tags and segments." },
  { code: "customer-segments", name: "Customer Segments", icon: "🎯", category: "CRM", description: "VIP, repeat, dormant and custom customer segments." },
  { code: "loyalty", name: "Loyalty & Membership", icon: "⭐", category: "CRM", description: "Points, tiers, memberships, rewards and multipliers." },
  { code: "wallet", name: "Customer Wallet", icon: "👛", category: "CRM", description: "Wallet balance, top-up, redemption and ledger." },
  { code: "campaigns", name: "CRM Campaigns", icon: "📣", category: "Marketing", description: "Customer campaigns, targeted offers and campaign drafts." },
  { code: "sms-marketing", name: "SMS Marketing", icon: "📨", category: "Marketing", description: "SMS campaign infrastructure and delivery tracking." },
  // WhatsApp is a standalone integration plugin; alias "whatsapp" is kept for legacy runtime calls.
  { code: "whatsapp-invoice", name: "WhatsApp Invoice", icon: "💬", category: "Integrations", description: "Send invoices and customer documents through WhatsApp.", aliases: ["whatsapp"] },
  { code: "swiggy-integration", name: "Swiggy Integration", icon: "🟠", category: "Integrations", description: "Connect the restaurant POS to Swiggy partner services for orders and channel operations." },
  { code: "zomato-integration", name: "Zomato Integration", icon: "🔴", category: "Integrations", description: "Connect the restaurant POS to Zomato POS APIs for menu, orders and outlet operations." },
  { code: "facebook-integration", name: "Facebook Integration", icon: "📘", category: "Marketing", description: "Connect a Facebook Page for approved publishing and campaign workflows." },
  { code: "instagram-integration", name: "Instagram Integration", icon: "📸", category: "Marketing", description: "Connect an Instagram professional account for approved publishing workflows." },
  { code: "feedback-reviews", name: "Feedback & Reviews", icon: "⭐", category: "CRM", description: "Ratings, feedback, review analytics and response workflow.", aliases: ["reviews"] },
  { code: "reservations-pro", name: "Advanced Reservations", icon: "📅", category: "Operations", description: "Calendar, waitlist, table assignment, reminders, no-show and deposits.", aliases: ["reservations"] },
  { code: "qr-ordering-pro", name: "Advanced QR Ordering", icon: "📱", category: "Digital", description: "QR ordering, waiter call, bill request, reorder and upselling.", aliases: ["qr-menu"] },
  { code: "qr-print-center", name: "QR Print Center", icon: "🖨️", category: "QR", description: "Restaurant QR card generation, preview, download and printing. Enabled independently by Super Admin." },
  { code: "scan-pay", name: "Scan & Pay", icon: "📲", category: "Digital", description: "Customer scan-to-pay and payment request workflow." },
  { code: "online-ordering", name: "Online Ordering", icon: "🌐", category: "Digital", description: "Website and digital ordering channel infrastructure." },
  { code: "aggregator-menu", name: "Aggregator Menu Control", icon: "🔗", category: "Online", description: "Availability, pricing and menu controls for delivery channels." },
  { code: "online-reconciliation", name: "Online Order Reconciliation", icon: "🧾", category: "Online", description: "Commission, platform charges, payouts, cancellations and reconciliation." },
  { code: "website-ordering", name: "Restaurant Website Ordering", icon: "🖥️", category: "Digital", description: "Restaurant website menu and online ordering foundation." },
  { code: "captain-app", name: "Captain / Waiter App", icon: "📱", category: "Staff", description: "Mobile table service, order taking, KOT and payment workflow." },
  { code: "staff-attendance", name: "Staff & Attendance", icon: "👨‍💼", category: "Staff", description: "Profiles, shifts, attendance, breaks, overtime and commission." },
  { code: "permissions", name: "Role Permissions", icon: "🔐", category: "Security", description: "Owner, manager, cashier, waiter, kitchen and inventory permissions." },
  { code: "analytics", name: "Restaurant Analytics", icon: "📊", category: "Reports", description: "Sales, orders, average order, payment, discount and operational reports." },
  { code: "dynamic-reports", name: "Dynamic Reports", icon: "📈", category: "Reports", description: "Custom filters, saved reports and exportable operational reports." },
  { code: "profit-food-cost", name: "Profit & Food Cost", icon: "💰", category: "Reports", description: "Item cost, food cost, margin and profitability." },
  { code: "tax-reports", name: "Tax Reports", icon: "🧮", category: "Reports", description: "GST, tax and invoice reporting/export." },
  { code: "staff-reports", name: "Staff Performance Reports", icon: "🏅", category: "Reports", description: "Staff sales, attendance, productivity and performance reporting." },
  { code: "smart-notifications", name: "Smart Notifications", icon: "🔔", category: "Operations", description: "New order, delayed order, low stock, payment and operational alerts." },
  { code: "self-service-kiosk", name: "Self-Service Kiosk", icon: "🖥️", category: "Digital", description: "Customer self-ordering kiosk workflow." },
  { code: "digital-display", name: "Digital Display", icon: "📺", category: "Digital", description: "Customer-facing menu, token and order-ready display." },
  { code: "calling-device", name: "Calling Device", icon: "📢", category: "Digital", description: "Customer/staff calling queue and alert device foundation." },
  { code: "multi-branch", name: "Multi Branch", icon: "🏢", category: "Enterprise", description: "Branches, central menu, branch inventory and branch reporting." },
  { code: "branch-menu", name: "Central Menu Publishing", icon: "🗂️", category: "Enterprise", description: "Central menu with branch-level overrides and availability." },
  { code: "forecasting", name: "Forecasting", icon: "🔮", category: "Enterprise", description: "Demand and sales forecasting foundation." },
  { code: "thermal-printing", name: "Thermal Printing", icon: "🖨️", category: "Integrations", description: "Thermal receipt, KOT and slip printing workflow." },
  { code: "a4-invoice", name: "A4 Invoice", icon: "📄", category: "Integrations", description: "Professional A4 invoice generation." },
  { code: "payment-gateways", name: "Payment Gateways", icon: "💳", category: "Integrations", description: "Online payment gateway configuration and reconciliation." },
  { code: "offers", name: "Offers & Promotions", icon: "🎁", category: "Marketing", description: "Offers, coupons, smart promotions and targeting." },
  { code: "reservations-pro", name: "Reservation Runtime", icon: "📅", category: "Operations", description: "Waitlist, deposits, reminders and reservation operations." },
  { code: "captain-runtime", name: "Captain Runtime", icon: "📱", category: "Staff", description: "Table service, order taking and KOT runtime." },
  { code: "kds-runtime", name: "Live KDS Runtime", icon: "👨‍🍳", category: "Kitchen", description: "Live station queues, timers and bump workflow." },
  { code: "token-display", name: "Token Display Runtime", icon: "🎟️", category: "Digital", description: "Live pickup and delivery token calling." },
  { code: "scan-order-runtime", name: "Scan & Order Runtime", icon: "📲", category: "Digital", description: "Table QR order and reorder workflow." },
  { code: "kiosk-runtime", name: "Kiosk Runtime", icon: "🖥️", category: "Digital", description: "Self-order kiosk runtime." },
  { code: "calling-runtime", name: "Calling Runtime", icon: "📢", category: "Digital", description: "Waiter and service request queue." },
  { code: "aggregator-runtime", name: "Aggregator Runtime", icon: "🔗", category: "Online", description: "Provider configuration, ingestion and settlement jobs." },
  { code: "cash-shift", name: "Cash Shift", icon: "💵", category: "Billing", description: "Cash drawer shifts and variance control." },
  { code: "customer-segments", name: "Customer Segmentation", icon: "🎯", category: "CRM", description: "Rule-based customer segments." },
  { code: "message-center", name: "Message Queue", icon: "💬", category: "Marketing", description: "Provider-ready SMS, WhatsApp and email queue." },
  { code: "scheduled-reports", name: "Scheduled Reports", icon: "📈", category: "Reports", description: "Recurring report delivery definitions." },
  { code: "hardware-print-queue", name: "Hardware Print Queue", icon: "🖨️", category: "Integrations", description: "KOT, bill and invoice print jobs." },
  { code: "payment-accounts", name: "Merchant Payments & Voice", icon: "💳", category: "Payments", description: "Merchant UPI account, payment confirmation, receipt attachment and voice payment announcement." },
  { code: "order-channel-hub", name: "Unified Order Channel Hub", icon: "🌐", category: "Online", description: "POS, takeaway, delivery, QR, kiosk, website, aggregator, Captain, phone and walk-in channels." },
  { code: "restaurant-website", name: "Restaurant Website Manager", icon: "🖥️", category: "Digital", description: "Website domain, SEO, direct ordering and WhatsApp configuration." },
  { code: "virtual-brands", name: "Virtual Brand Management", icon: "🍱", category: "Enterprise", description: "Multiple cloud-kitchen brands under one restaurant setup." },
  { code: "pos-terminals", name: "POS Terminal Management", icon: "🧾", category: "POS", description: "Terminal registry, device status, printer controls and offline readiness." },
  { code: "offline-pos", name: "Offline POS Queue", icon: "📴", category: "POS", description: "Queue local operations and synchronize them after connectivity returns." },
  { code: "staff-shifts", name: "Staff Shift Scheduler", icon: "🕐", category: "Staff", description: "Shift planning, breaks and overtime tracking." },
  { code: "manager-approvals", name: "Manager Approval Workflow", icon: "✅", category: "Security", description: "Approve discounts, refunds, voids, price overrides and complimentary bills." },
  { code: "central-menu-publishing", name: "Central Menu Publishing", icon: "📢", category: "Enterprise", description: "Version and publish restaurant menu configurations to digital channels." },
  { code: "accounting-integrations", name: "Accounting Integrations", icon: "🔗", category: "Integrations", description: "Integration registry for Tally, SAP and Microsoft Dynamics." },
  { code: "virtual-brand-orders", name: "Virtual Brand Order Routing", icon: "🍔", category: "Online", description: "Operate multiple online food brands from one POS environment." },
  { code: "kiosk-multilanguage", name: "Kiosk Multi-language", icon: "🌍", category: "Digital", description: "Language-aware kiosk configuration for customer self-ordering." },

]

export const FEATURE_ALIASES = Object.fromEntries(
  FEATURE_CATALOG.flatMap(feature => [
    [feature.code, [feature.code, ...(feature.aliases || [])]],
    ...(feature.aliases || []).map(alias => [alias, [feature.code, alias]])
  ])
)

export function featureCodes(code) {
  return FEATURE_ALIASES[code] || [code]
}


/**
 * Features that are part of the always-available Core POS.
 * These are never hard-disabled by Restaurant Pro.
 */
export const CORE_FEATURE_CODES = new Set([
  "operations-hub",
  "restaurant-core",
  "pos-core",
  "payments",
  "takeaway",
  "delivery",
  "delivery-settlement",
  "token-management",
  "split-merge-bills",
  "table-management",
  "table-transfer",
  "refunds-voids",
  "discounts-tax",
  "e-bill",
  "cash-closing",
  "kds",
  "kds-stations",
])

/**
 * Loyalty is intentionally NOT part of Restaurant Pro.
 * It remains an independent Operations Hub feature.
 */
export const OPERATIONS_FEATURE_CODES = new Set([
  "loyalty",
])

/** Inventory is intentionally left outside the Restaurant Pro master switch. */
export const INVENTORY_FEATURE_CODES = new Set([
  "inventory-advanced",
  "recipe-bom",
  "auto-stock-deduction",
  "low-stock-alerts",
  "fifo",
  "stock-transfer",
  "central-kitchen",
])

/**
 * Everything else in the feature catalogue is a Restaurant Pro
 * feature unless it is explicitly Core or Operations/Loyalty.
 */
export function isRestaurantProFeature(code) {
  if (!code) return false
  return !CORE_FEATURE_CODES.has(code) && !OPERATIONS_FEATURE_CODES.has(code) &&
    !INVENTORY_FEATURE_CODES.has(code) && code !== "restaurant-pro"
}
