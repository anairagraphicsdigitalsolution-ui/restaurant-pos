# Anaira SaaS — Plugin Independence Refactor

## Safety contract
- Restaurant Core is intentionally preserved as the existing POS/core owner.
- No business table rows are deleted by this refactor.
- Legacy plugin rows are retained for backward compatibility with older clients/offline builds.
- Canonical runtime gating is now one feature → one plugin owner.
- Restaurant Pro is no longer a runtime master dependency.
- P1/P2 canonical plugins remain independently activated.

## Canonical ownership
- P1 Enterprise HQ → enterprise/outlet/HQ features.
- P1 Payment Terminals → payment-terminal runtime.
- P1 Supplier Automation → procurement automation.
- P1 Supplier Portal → supplier-facing RFQ/quotation portal.
- P1 Marketing Hub → campaign/audience/content orchestration.
- P1 Advanced Reporting → analytics/reporting/profitability/scheduled reports.
- P0 System Reliability → offline/retry/conflict/aggregator/idempotency monitoring.
- P2 plugins retain their existing dedicated ownership.
- Restaurant Suite is retained as a workspace for its own operational modules, not as a universal master gate.
- Operations Hub is retained for its own customer/staff/operational modules.

## Completed runtime changes
1. Added `lib/pluginOwnership.js`.
2. Replaced server feature gating with canonical owner resolution; removed Restaurant Pro fallback.
3. Updated Sidebar to stop presenting unrelated features under Restaurant Pro and Restaurant Core.
4. Split QR Ordering, QR Print Center, WhatsApp, Facebook, Instagram, Swiggy, Zomato, Merchant Payments, Captain, Calling and Notifications into their own navigation/plugin boundaries.
5. Removed mixed Marketing Hub dependency on provider activation; provider plugins remain independently gated at provider-specific publish/send operations.
6. Updated server path gates for Supplier Portal, Supplier Automation, P2 Kiosk, P2 AI, P2 Call Center, P2 Banquet and P2 Device HQ.
7. Updated reporting/accounting/aggregator routes to canonical plugin owners.
8. Normalized legacy QR/WhatsApp/reservation aliases so they no longer act as alternate plugin dependencies.
9. Completed Supplier Portal payment-terms submission by adding a backward-compatible 7-argument RPC overload; the existing 6-argument RPC remains intact.
10. Migrated active legacy feature state into missing canonical plugin rows without deleting or disabling legacy rows.

## Validation
- JavaScript syntax check passed for all `.js` files in the refactored tree.
- Full TypeScript/Next build could not be completed in this isolated archive because dependencies were not installed; the repository's existing build/type errors therefore remain outside this validation result.
- The Supabase canonical ownership migration was applied successfully.
- The Supplier Portal payment-terms RPC migration was applied successfully.

## Deliberately not changed
- Restaurant Core business behavior.
- Existing POS/offline/local-first engine.
- Enterprise HQ data model and outlet identity.
- Subscription activation fix.
- Existing business data.
