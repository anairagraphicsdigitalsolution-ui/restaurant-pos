# Sidebar Plugin Visibility Fix

## Behavior
- Restaurant Admin sidebar now shows a plugin/group only when its controlling plugin/feature is actually enabled for the current restaurant.
- Disabled plugin groups are hidden instead of showing a `Disabled` link or routing to Control Center.
- Disabled child pages are hidden.
- Empty section headings are hidden.
- Sidebar cache version was bumped to v2 so older cached plugin states do not keep stale visibility.
- P1/P2 canonical plugins are independently visible when their own `restaurant_plugins` row is enabled; they are not forced behind the Restaurant Pro master.

## Delivery master
`Delivery` in the sidebar is a child of **Restaurant Core**. Its visibility is resolved from the `restaurant-core` master switch. The `delivery` child feature is also part of `CORE_FEATURE_CODES`, so Core OFF hides Delivery; Core ON makes the Core delivery feature available.

## Other master relationships found in this source
- Restaurant Core -> POS, Tables, KDS, Billing, Delivery, etc.
- Restaurant Pro -> non-core Pro child plugins in the existing architecture.
- Restaurant Suite -> Gift Cards, Payroll, Feedback & Reviews.
- Operations Hub -> independent operations features such as Cash Closing/Expenses.
- Offers -> Offers/Combos.
- QR Print Center -> QR Menu/Print Center group in this sidebar implementation.
- P1/P2 canonical plugin codes -> their own plugin activation state.
