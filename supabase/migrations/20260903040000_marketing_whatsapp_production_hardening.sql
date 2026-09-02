-- Marketing WhatsApp production hardening. No POS/Billing/Delivery/KOT/Offers changes.
alter table public.platform_marketing_message_events add column if not exists phone_number_id text;
alter table public.platform_marketing_message_events add column if not exists idempotency_key text;
create unique index if not exists platform_marketing_message_events_idempotency_idx on public.platform_marketing_message_events(idempotency_key) where idempotency_key is not null;
create index if not exists platform_marketing_message_events_phone_idx on public.platform_marketing_message_events(phone_number_id,created_at desc);
alter table public.whatsapp_messages add column if not exists campaign_id uuid;
alter table public.whatsapp_messages add column if not exists marketing_post_id uuid;
alter table public.whatsapp_messages add column if not exists idempotency_key text;
create unique index if not exists whatsapp_messages_marketing_idempotency_idx on public.whatsapp_messages(idempotency_key) where idempotency_key is not null;
create index if not exists whatsapp_messages_restaurant_wamid_idx on public.whatsapp_messages(restaurant_id,wamid) where wamid is not null;
