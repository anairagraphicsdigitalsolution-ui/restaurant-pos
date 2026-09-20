# Anaira SaaS — Phase 2 POS Core Hardening

Base: Phase 1 Reliability Fixed (19 Sep 2026)

## Implemented
- Hardened payment recording against over-collection by calculating the authoritative outstanding balance from `order_payments` minus `order_refunds`.
- Hardened refunds so a refund cannot exceed the net refundable amount.
- Prevented voiding paid or partially paid orders; paid orders must use the refund flow.
- Added order status history for void operations.
- Hardened split bills: maximum 20 parts, deterministic 2-decimal rounding, no split of paid/partially-paid/cancelled orders.
- Hardened order merge: duplicate IDs removed, paid/partially-paid/cancelled orders rejected, actual `order_items` moved to the target order before source orders are cancelled, and the target total is updated.
- Hardened KDS status input with an explicit allow-list.
- Existing restaurant scoping and audit events remain in place.

## Data safety
No data is deleted by this source change and no migration is executed automatically. Existing Supabase tables are reused.

## Remaining Phase 2 work
- UI for split/merge/refund/void should expose these already-supported server operations in a consistent POS workflow.
- End-to-end testing should cover order → KOT → KDS → payment → bill → print, including offline/retry cases.
