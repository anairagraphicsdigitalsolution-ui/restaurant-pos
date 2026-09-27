BEGIN;
WITH owner_map(legacy_code, owner_code) AS (
  VALUES
    ('analytics','p1-advanced-reporting'),('purchasing','p1-supplier-automation'),('purchase-manager','p1-supplier-automation'),
    ('campaigns','p1-marketing-hub'),('sms-marketing','p1-marketing-hub'),('message-center','p1-marketing-hub'),
    ('dynamic-reports','p1-advanced-reporting'),('profit-food-cost','p1-advanced-reporting'),('tax-reports','p1-advanced-reporting'),
    ('staff-reports','p1-advanced-reporting'),('scheduled-reports','p1-advanced-reporting'),('multi-branch','p1-enterprise-hq'),
    ('branch-menu','p1-enterprise-hq'),('forecasting','p2-ai-intelligence'),('reservations','reservations-pro'),('qr-menu','qr-ordering-pro'),
    ('self-service-kiosk','p2-advanced-kiosk'),('kiosk-runtime','p2-advanced-kiosk'),('kiosk-multilanguage','p2-advanced-kiosk'),
    ('calling-runtime','calling-device'),('captain-runtime','captain-app'),('token-display','p2-customer-display'),('scan-order-runtime','qr-ordering-pro'),
    ('combos-variants','offers'),('central-kitchen','restaurant-suite'),('inventory-advanced','restaurant-suite'),('recipe-bom','restaurant-suite'),
    ('auto-stock-deduction','restaurant-suite'),('low-stock-alerts','restaurant-suite'),('fifo','restaurant-suite'),('stock-transfer','restaurant-suite'),
    ('online-ordering','restaurant-suite'),('aggregator-menu','restaurant-suite'),('aggregator-runtime','restaurant-suite'),('online-reconciliation','restaurant-suite'),
    ('order-channel-hub','restaurant-suite'),('restaurant-website','restaurant-suite'),('virtual-brands','restaurant-suite'),('pos-terminals','restaurant-suite'),
    ('staff-shifts','restaurant-suite'),('manager-approvals','restaurant-suite'),('central-menu-publishing','restaurant-suite'),('accounting-integrations','restaurant-suite'),
    ('crm','operations-hub'),('customer-segments','operations-hub'),('loyalty','operations-hub'),('wallet','operations-hub'),('feedback-reviews','operations-hub'),
    ('staff-attendance','operations-hub'),('permissions','operations-hub'),('expenses','operations-hub'),('delivery','restaurant-core'),('delivery-settlement','restaurant-core'),
    ('discounts-tax','restaurant-core'),('e-bill','restaurant-core'),('kds','restaurant-core'),('kds-stations','restaurant-core'),('payments','restaurant-core'),
    ('pos-core','restaurant-core'),('table-management','restaurant-core'),('table-transfer','restaurant-core'),('takeaway','restaurant-core'),('token-management','restaurant-core'),('cash-shift','restaurant-core')
), active_legacy AS (
  SELECT DISTINCT rp.restaurant_id, m.owner_code FROM public.restaurant_plugins rp JOIN owner_map m ON m.legacy_code=rp.plugin_code WHERE rp.enabled=true
), missing AS (
  SELECT a.restaurant_id,a.owner_code FROM active_legacy a WHERE NOT EXISTS (SELECT 1 FROM public.restaurant_plugins x WHERE x.restaurant_id=a.restaurant_id AND x.plugin_code=a.owner_code)
)
INSERT INTO public.restaurant_plugins (restaurant_id,plugin_code,plugin_slug,enabled,config,display_name,category,description,feature_kind,activated_at)
SELECT m.restaurant_id,m.owner_code,m.owner_code,true,'{}'::jsonb,COALESCE(pc.name,m.owner_code),COALESCE(pc.category,'General'),COALESCE(pc.description,'Canonical plugin owner migrated from legacy feature state.'),COALESCE(pc.kind,'plugin'),now()
FROM missing m LEFT JOIN public.plugin_catalog pc ON pc.code=m.owner_code;
COMMIT;
