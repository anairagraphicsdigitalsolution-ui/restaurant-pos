# Anaira Merchant Payments & Voice Plugin

Plugin code: `payment-accounts`

## Super Admin
Open **Super Admin → Plugins**, select a restaurant, then activate/deactivate **Merchant Payments & Voice**.

When disabled, the restaurant's Merchant Payments tab is hidden and the payment-account configuration UI is unavailable.

## Restaurant payment settings
The plugin stores merchant configuration in `restaurant_payment_accounts` and supports:
- Merchant name
- Merchant UPI ID
- Merchant reference
- Auto payment detection flag
- Voice payment announcement
- Hindi/English voice preference

Automatic payment confirmation is only authoritative when a merchant payment provider sends a verified webhook/API event. A UPI ID alone does not provide payment confirmation.

## Supabase migration
Apply:
`supabase/migrations/20260823140000_merchant_payment_plugin.sql`

The migration adds/updates the plugin catalog row and seeds the plugin as disabled for restaurants that do not already have it.
