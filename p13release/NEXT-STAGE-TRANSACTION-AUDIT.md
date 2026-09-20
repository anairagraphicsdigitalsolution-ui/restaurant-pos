# Anaira SaaS — Transaction / Integrity Stage

Applied live to Supabase production.

- SECURITY DEFINER functions now use `search_path = public, pg_temp`.
- Exact duplicate `order_items(item_id)` index removed; equivalent application index retained.
- `order_payments(order_id)` now has a NOT VALID foreign key to `orders(id)`, preserving historical orphan rows while blocking new orphan payments.
- Existing orphan rows were not deleted.
- Billing finalize already locks the order and records payment atomically inside the canonical RPC.
- QR manual settlement remains staff-verified and does not treat customer self-claim as authoritative.
- Full production build is not claimed because this archive/environment has no installed node_modules.
