-- Add master restaurant control hubs to the Super Admin plugin catalog.
insert into public.plugin_catalog(code,name,icon,category,description,kind,sort_order) values
('operations-hub','Operations Hub','🧭','Core Hubs','Central restaurant operations workspace for day-to-day management.','hub',1),
('restaurant-core','Restaurant Core','⚡','Core Hubs','Core restaurant POS, tables, kitchen, billing and operational foundation.','hub',2),
('restaurant-pro','Restaurant Pro','🚀','Core Hubs','Advanced restaurant business suite for professional operations and growth.','hub',3)
on conflict(code) do update set
  name=excluded.name,
  icon=excluded.icon,
  category=excluded.category,
  description=excluded.description,
  kind=excluded.kind,
  sort_order=excluded.sort_order;
