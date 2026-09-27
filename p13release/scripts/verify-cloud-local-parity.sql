-- Run on both databases after migration/reset.
SELECT 'restaurants' table_name, count(*) FROM public.restaurants
UNION ALL SELECT 'orders', count(*) FROM public.orders
UNION ALL SELECT 'order_items', count(*) FROM public.order_items
UNION ALL SELECT 'kot_tickets', count(*) FROM public.kot_tickets
UNION ALL SELECT 'order_payments', count(*) FROM public.order_payments
UNION ALL SELECT 'notifications', count(*) FROM public.notifications
UNION ALL SELECT 'audit_logs', count(*) FROM public.audit_logs
UNION ALL SELECT 'restaurant_plugins', count(*) FROM public.restaurant_plugins
UNION ALL SELECT 'plugin_settings', count(*) FROM public.plugin_settings
UNION ALL SELECT 'plugin_catalog', count(*) FROM public.plugin_catalog
UNION ALL SELECT 'anaira_sync_events', count(*) FROM public.anaira_sync_events
UNION ALL SELECT 'anaira_sync_state', count(*) FROM public.anaira_sync_state
UNION ALL SELECT 'billing_idempotency_keys', count(*) FROM public.billing_idempotency_keys
UNION ALL SELECT 'invoice_sequences', count(*) FROM public.invoice_sequences
ORDER BY 1;

SELECT count(*) AS orders_without_items
FROM public.orders o
WHERE NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id=o.id);

SELECT count(*) AS orphan_order_items
FROM public.order_items oi
WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id=oi.order_id);

SELECT count(*) AS orphan_kot_tickets
FROM public.kot_tickets k
WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id=k.order_id);
