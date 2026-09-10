# Anaira v38 — Anaira Restaurant Suite Implementation

This release builds on the existing Anaira POS rather than replacing working modules.

## Implemented / connected
- Purchase & supplier workflow using `restaurant_suppliers` and `restaurant_purchases`.
- Inventory / recipe / food-cost entry point using the existing inventory engine.
- Loyalty reward creation using `loyalty_rewards`, with existing CRM/customer modules retained.
- Captain/waiter session visibility and POS entry point.
- Self-service kiosk registration plus existing QR center.
- Central kitchen registration plus existing inventory/transfer workflows.
- Online channel registration and order reconciliation records.
- Calling device registration plus existing service-call center.
- Audit/reports entry points and recent audit visibility.
- Restaurant-scoped tenant resolution for all new UI operations.
- New professional Anaira Restaurant Suite at `/dashboard/restaurant-suite/Anaira`.
- Existing Operations Hub now links to the Parity Center.

## Existing Anaira capabilities preserved
The repository already contains substantial Anaira-style backend/schema work for KOT/KDS, tables/floors, delivery, reservations, inventory recipes, loyalty, QR ordering, online channels, reports, hardware, staff permissions and multi-branch controls. This release surfaces those capabilities without deleting the older pages.

## Important
This is a parity/operational implementation, not a copy of Anaira's proprietary code or private UI. Third-party aggregator APIs still require their real provider credentials/configuration before live order synchronization can occur.
