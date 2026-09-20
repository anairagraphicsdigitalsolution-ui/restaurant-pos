// Centralized public plugin pricing. Keep plugin prices <= ₹199/month.
export const PLUGIN_PRICING = {
  starter: "Each plugin is an optional paid add-on except Advanced QR Ordering, which is included.",
  professional: "Professional includes only Advanced QR Ordering, WhatsApp, Operations Hub, Advanced Reservations, and Offers & Combos. All other plugins are discounted paid add-ons.",
  enterprise: "All catalog plugins and optional features are included at no extra plugin charge.",
}

// Optional internal feature/switch add-ons. These are pricing metadata only;
// runtime settings remain controlled by Super Admin and existing plugin policies.
export const PLUGIN_FEATURE_PRICING = {
  "reservations-pro": {
    auto_confirm: [29, 19], require_phone: [19, 9], require_email: [19, 9], allow_waitlist: [29, 19], allow_no_show: [29, 19],
    auto_assign_table: [39, 29], allow_table_selection: [29, 19],
    deposit_enabled: [49, 39],
  },
  "operations-hub": { expenses_enabled: [49, 29], cash_closing_enabled: [49, 29] },
  "theme-branding": { show_restaurant_logo: [29, 19], show_brand_name: [29, 19] },
  "restaurant-settings": { allow_admin_branding_changes: [29, 19], allow_admin_theme_changes: [49, 29], allow_admin_operational_settings: [29, 19] },
  "qr-ordering-pro": {
    customer_name_required: [19, 9], customer_phone_required: [19, 9], allow_reorder: [29, 19],
    allow_cooking_request: [29, 19], allow_customer_request: [29, 19], auto_send_kitchen: [49, 29],
    service_charge_enabled: [39, 29],
  },
  "qr-print-center": { include_logo: [19, 9], include_restaurant_name: [19, 9], include_table_number: [19, 9], include_instruction: [19, 9] },
  "website-ordering": {
    auto_send_kitchen: [39, 29], accept_online_payment: [49, 39], accept_cash: [19, 9],
    customer_phone_required: [19, 9], customer_address_required: [29, 19],
  },
  "captain-app": {
    allow_table_order: [29, 19], allow_open_order: [39, 29], auto_send_kot: [39, 29],
    allow_item_edit_after_kot: [29, 19], show_item_stock: [29, 19], allow_discount_request: [29, 19],
    require_pin: [19, 9], restrict_to_assigned_tables: [29, 19],
  },
  "smart-notifications": {
    new_order: [19, 9], kitchen_ready: [19, 9], payment_received: [19, 9], delivery_update: [19, 9],
    reservation_alert: [19, 9], in_app: [19, 9], sound: [99, 49], browser: [49, 29], email: [79, 49],
  },
  "calling-device": {
    new_order: [49, 29], order_ready: [39, 29], waiter_call: [39, 29],
  },
  "offers": {
    offers_enabled: [49, 29], combos_enabled: [49, 29], allow_discount: [39, 29], auto_apply: [49, 29],
    allow_stack: [39, 29], require_coupon: [29, 19], facebook_promotion: [29, 19], instagram_promotion: [29, 19], whatsapp_promotion: [29, 19],
  },
  "thermal-printing": { print_kot: [49, 29], print_receipt: [39, 29], print_void: [29, 19], print_delivery: [39, 29] },
  "a4-invoice": { auto_print: [39, 29], include_gst: [19, 9], include_customer: [19, 9] },
  "whatsapp-invoice": { send_invoice: [49, 29], send_order_confirmation: [49, 29], send_payment_receipt: [49, 29], send_qr_order_notification: [39, 29], allow_24h_text: [39, 29] },
  "swiggy-integration": { accept_orders: [49, 39], auto_kitchen: [39, 29], sync_status: [39, 29], sync_menu: [49, 39] },
  "zomato-integration": { accept_orders: [49, 39], auto_kitchen: [39, 29], sync_status: [39, 29], sync_menu: [49, 39] },
  "facebook-integration": { publish_offers: [49, 29], publish_manual: [39, 29] },
  "instagram-integration": { publish_offers: [49, 29], publish_manual: [39, 29] },
}

export function pluginPriceLabel(plugin, plan = "starter") {
  if (plan === "enterprise" || plugin?.enterpriseIncluded) return "Included"
  if (plan === "professional" && plugin?.professionalIncluded) return "Included"
  if (plugin?.code === "qr-ordering-pro") return "Included"
  return `₹${Number(plugin?.monthlyPrice || 0).toLocaleString("en-IN")}/month`
}

export function pluginFeaturePriceLabel(pluginCode, featureKey, plan = "starter") {
  if (plan === "enterprise") return "Included"
  const pair = PLUGIN_FEATURE_PRICING?.[pluginCode]?.[featureKey]
  if (!pair) return null
  const price = plan === "professional" ? pair[1] : pair[0]
  return `₹${price}/month`
}

// Saleable AI / creative plugins. Enterprise includes all plugins.
PLUGIN_FEATURE_PRICING["smart-notifications"].sound = [99, 49]

export const SALEABLE_PLUGIN_PRICING = {
  "ai-image-studio": { starter: 199, professional: 149, enterprise: 0 },
  "ai-poster-studio": { starter: 199, professional: 149, enterprise: 0 },
  "ai-logo-studio": { starter: 199, professional: 149, enterprise: 0 },
  "business-card-studio": { starter: 149, professional: 99, enterprise: 0 },
}

export const PROFESSIONAL_INCLUDED_PLUGINS = new Set([
  "qr-ordering-pro",
  "whatsapp-invoice",
  "operations-hub",
  "reservations-pro",
  "offers",
])

export function saleablePluginPriceLabel(plugin, plan = "starter") {
  if (plan === "enterprise") return "Included"
  if (plan === "professional" && PROFESSIONAL_INCLUDED_PLUGINS.has(plugin?.code)) return "Included"
  if (plugin?.code === "qr-ordering-pro") return "Included"
  const price = SALEABLE_PLUGIN_PRICING?.[plugin?.code]?.[plan] ?? plugin?.monthlyPrice
  return `₹${Number(price || 0).toLocaleString("en-IN")}/month`
}


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
