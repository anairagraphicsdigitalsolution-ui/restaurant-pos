-- Anaira Supabase query-health maintenance
-- Safe: ANALYZE only refreshes PostgreSQL planner statistics. It does not
-- delete, alter, or migrate application/business data.
ANALYZE public.restaurant_subscriptions;
ANALYZE public.saas_plans;
ANALYZE public.restaurant_plugins;
ANALYZE public.plugin_settings;
ANALYZE public.notifications;
ANALYZE public.orders;
ANALYZE public.order_items;
ANALYZE public.profiles;
