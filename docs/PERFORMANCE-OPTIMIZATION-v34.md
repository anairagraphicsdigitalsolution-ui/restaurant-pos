# Anaira POS Performance Optimization v34

## Changes
- Dashboard overview queries now run in one parallel batch, including top-selling RPC.
- Dashboard recent activity is limited to 7 rows instead of 50.
- Dashboard menu, active offers, reservations and tables have bounded payload sizes.
- Dashboard hourly sales aggregation uses a single India-time formatter and one pass over today's orders instead of repeatedly filtering all orders for every hour.
- Order POS reuses the restaurant object already loaded from the slug route, avoiding a duplicate restaurant request on hard navigation.
- Kitchen and delivery background polling changed from every 10 seconds to every 15 seconds and pauses while the browser tab is hidden.
- Existing Petpooja-style order, delivery, billing, KOT and printer functionality is preserved.

## Validation
- `node --check app/order/page.js`
- `node --check app/dashboard/page.js`
- `node --check app/api/dashboard/overview/route.js`

A full production Next.js build still requires the project's installed dependencies and should be run in the user's development environment with `npm run build`.
