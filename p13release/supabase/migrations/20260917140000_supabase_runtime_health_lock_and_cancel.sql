-- Runtime health hardening: auth lock-safe client transport and cancellation lifecycle.
-- Live database companion migrations were applied separately through Supabase.
-- This migration is intentionally idempotent.

create index if not exists idx_restaurant_subscriptions_restaurant_updated_created
  on public.restaurant_subscriptions (restaurant_id, updated_at desc, created_at desc);

create index if not exists idx_billing_idempotency_keys_order_id on public.billing_idempotency_keys(order_id);
create index if not exists idx_cashfree_payment_attempts_order_id on public.cashfree_payment_attempts(order_id);
create index if not exists idx_customer_segment_members_customer_id on public.customer_segment_members(customer_id);
create index if not exists idx_dining_tables_area_id on public.dining_tables(area_id);
create index if not exists idx_marketing_attribution_campaign_id on public.marketing_attribution(campaign_id);
create index if not exists idx_marketing_attribution_lead_id on public.marketing_attribution(lead_id);
create index if not exists idx_marketing_audience_members_lead_id on public.marketing_audience_members(lead_id);
create index if not exists idx_marketing_oauth_sessions_restaurant_id on public.marketing_oauth_sessions(restaurant_id);
create index if not exists idx_menu_item_modifier_groups_modifier_group_id on public.menu_item_modifier_groups(modifier_group_id);
create index if not exists idx_offer_products_variant_id on public.offer_products(variant_id);
create index if not exists idx_offers_get_product_variant_id on public.offers(get_product_variant_id);
create index if not exists idx_order_discount_applications_discount_rule_id on public.order_discount_applications(discount_rule_id);
create index if not exists idx_order_payments_source_request_id on public.order_payments(source_request_id);
create index if not exists idx_restaurant_approval_requests_approved_by on public.restaurant_approval_requests(approved_by);
create index if not exists idx_restaurant_approval_requests_requested_by on public.restaurant_approval_requests(requested_by);
create index if not exists idx_staff_permissions_staff_id on public.staff_permissions(staff_id);

-- The application keeps one intentional index for each exact duplicate pair.
drop index if exists public.idx_fk_central_kitchens_central_kitchens_restaurant_id_auto;
drop index if exists public.idx_fk_delivery_assignments_delivery_assignments_order_id_au;
drop index if exists public.idx_fk_kot_tickets_kot_tickets_order_id_auto;
drop index if exists public.idx_fk_modifier_groups_modifier_groups_restaurant_id_auto;
drop index if exists public.idx_fk_modifiers_modifiers_group_id_auto;
drop index if exists public.idx_fk_order_item_modifiers_order_item_modifiers_order_item_;
drop index if exists public.idx_fk_order_items_order_items_item_id1_auto;
drop index if exists public.idx_fk_order_items_order_items_order_id_auto;
drop index if exists public.idx_fk_order_items_order_items_variant_id_auto;
drop index if exists public.idx_fk_payment_gateway_configs_payment_gateway_configs_resta;
drop index if exists public.idx_fk_plan_features_plan_features_plan_id_auto;
drop index if exists public.idx_fk_printer_devices_printer_devices_restaurant_id_auto;
drop index if exists public.idx_fk_profiles_fk_restaurant_auto;
drop index if exists public.idx_fk_profiles_profiles_restaurant_id_auto;
drop index if exists public.idx_fk_reservations_reservations_restaurant_id_auto;
drop index if exists public.idx_fk_restaurant_banners_restaurant_banners_restaurant_id_a;
drop index if exists public.idx_fk_restaurant_payment_settings_restaurant_payment_settin;
drop index if exists public.idx_fk_restaurant_plugins_restaurant_plugins_restaurant_id_a;
drop index if exists public.idx_fk_restaurant_subscriptions_restaurant_subscriptions_pla;
drop index if exists public.idx_fk_restaurant_subscriptions_restaurant_subscriptions_res;
drop index if exists public.idx_fk_restaurant_subscriptions_restaurant_subscriptions_saa;

notify pgrst,'reload schema';
