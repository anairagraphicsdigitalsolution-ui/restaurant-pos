-- Restaurant Pro is a master visibility switch only.
-- Individual Pro features/integrations remain independently enabled.
-- This migration does not enable any feature.

INSERT INTO public.plugin_catalog (code,name,icon,category,description,kind,sort_order,active)
VALUES
  ('swiggy-integration','Swiggy Integration','🟠','Integrations','Connect the restaurant POS to Swiggy partner services for orders and channel operations.','integration',901,true),
  ('zomato-integration','Zomato Integration','🔴','Integrations','Connect the restaurant POS to Zomato POS APIs for menu, orders and outlet operations.','integration',902,true)
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name,
  icon=excluded.icon,
  category=excluded.category,
  description=excluded.description,
  kind=excluded.kind,
  active=true;
