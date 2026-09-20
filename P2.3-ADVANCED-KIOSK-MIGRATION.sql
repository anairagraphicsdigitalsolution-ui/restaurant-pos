-- P2.3 Advanced Kiosk hardening/finalization
-- Foundation tables/RPCs were deployed to Supabase separately.
-- This file documents the final incremental DB objects used by the completed kiosk flow.

create unique index if not exists p2_3_kiosk_orders_dedupe_idx
  on public.p2_3_kiosk_orders(restaurant_id, client_request_id);

create unique index if not exists p2_3_kiosk_events_idempotency_idx
  on public.p2_3_kiosk_events(restaurant_id, idempotency_key)
  where idempotency_key is not null;

-- Final server-authoritative order RPC is deployed in the connected Supabase project.
-- It validates kiosk/tenant/menu/variant/modifier, calculates totals, creates order items,
-- KDS tickets, token and print job atomically, and is executable only by service_role.
