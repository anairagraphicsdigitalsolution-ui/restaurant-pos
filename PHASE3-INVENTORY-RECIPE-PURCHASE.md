# Anaira Phase 3 — Inventory, Recipe/BOM, Purchasing & Food Cost

Base: Anaira SaaS v59 Phase 2 POS Core Hardened (2026-09-19).

## Implemented
- Additive inventory reorder-level/index support.
- Purchase order line items and GRN line items.
- Tenant-scoped RLS for Phase 3 stock/purchase tables.
- Atomic wastage RPC with inventory ledger + movement entry.
- Food-cost RPC from recipe/BOM + current ingredient cost.
- Atomic purchase receiving RPC: stock, batches, movements, transactions and PO status update together.
- Recipe-to-legacy `item_ingredients` compatibility bridge so existing order inventory consumption can use the new Recipe/BOM data.
- New Inventory Pro workspace: overview, suppliers, recipes/BOM, purchasing and wastage.
- Restaurant Core inventory/purchasing links now point to the Phase 3 workspace.

## Safety
- No existing orders, menu items, inventory rows, payments or restaurant data are deleted.
- Existing inventory remains the stock source of truth.
- Existing Phase 2 payment/order hardening is preserved.
