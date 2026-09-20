# P1/P2 Canonical Gate Fix

Fixed canonical independent feature gates for P1/P2 modules, plugin-center catalog rendering from the API catalog, and Super Admin P1/P2 visibility.

P1: enterprise-hq, payment-terminals (canonical gate utility ready), supplier-automation (canonical gate utility ready), marketing-hub, advanced-reporting.
P2: call-center, banquet-events, advanced-kiosk, customer-display, device-hq, ai-intelligence.

The Super Admin Plugin Control Center now uses the database/API catalog returned by `/api/super-admin/plugins`, preventing the P1/P2 entries from disappearing when the runtime static catalog differs from the database catalog.

Full Next.js production build/E2E certification still requires dependencies and runtime credentials.
