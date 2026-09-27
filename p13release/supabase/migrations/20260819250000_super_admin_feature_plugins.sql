-- Super Admin Feature Plugin Control
-- Every major restaurant feature can be activated/deactivated by Super Admin.
-- New feature plugins default to OFF. Existing legacy plugins keep their current state.

create table if not exists public.plugin_catalog (
  code text primary key,
  name text not null,
  icon text,
  category text not null,
  description text,
  kind text default 'feature',
  active boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now()
);

alter table public.restaurant_plugins
  add column if not exists display_name text,
  add column if not exists category text,
  add column if not exists description text,
  add column if not exists feature_kind text default 'feature',
  add column if not exists activated_by uuid,
  add column if not exists activated_at timestamptz,
  add column if not exists disabled_at timestamptz;

-- Catalog
insert into public.plugin_catalog(code,name,icon,category,description,kind,sort_order) values
('pos-core','Advanced POS Core','🧾','POS','Dine-in, takeaway, delivery, quick order, hold, park, reopen and void workflows.','feature',10),
('split-merge-bills','Split & Merge Bills','🧮','Billing','Split bills, merge bills and move items between bills.','feature',20),
('table-management','Advanced Table Management','🪑','Operations','Floor map, sections, table status, capacity, QR and waiter assignment.','feature',30),
('table-transfer','Table Transfer','🔄','Operations','Transfer tables and move items table-to-table.','feature',40),
('payments','Multiple Payments','💳','Billing','Cash, card, UPI, online, credit and partial payments.','feature',50),
('refunds-voids','Refund & Void','↩️','Billing','Refunds, voids, reasons and audit trail.','feature',60),
('discounts-tax','Discounts & Tax','🏷️','Billing','Discount, tax, service charge, tip and coupon controls.','feature',70),
('kds','Kitchen Display System','👨‍🍳','Kitchen','New, preparing, ready, served, stations, timers and priorities.','feature',80),
('kds-stations','Kitchen Stations','🍕','Kitchen','Kitchen, bar, pizza, dessert and custom preparation stations.','feature',90),
('inventory-advanced','Advanced Inventory','📦','Inventory','Movements, batches, expiry, wastage, damaged stock and transfers.','feature',100),
('recipe-bom','Recipe / BOM','🍳','Inventory','Ingredient recipes and recipe-based costing.','feature',110),
('auto-stock-deduction','Automatic Recipe Stock Deduction','⚙️','Inventory','Automatically deduct ingredients when a menu item is sold.','feature',120),
('purchasing','Purchasing & Suppliers','🚚','Inventory','Suppliers, purchase orders, invoices, GRN and supplier payments.','feature',130),
('delivery','Delivery Management','🛵','Delivery','Zones, charges, riders, assignment, COD and delivery events.','feature',140),
('qr-ordering-pro','Advanced QR Ordering','📱','QR','Waiter call, bill request, reorder, special instructions and upselling.','feature',150),
('crm','Customer CRM','👥','CRM','Customer history, favorites, VIP, birthdays, tags and segments.','feature',160),
('loyalty','Loyalty & Membership','⭐','CRM','Points, tiers, memberships, rewards and multipliers.','feature',170),
('analytics','Restaurant Analytics','📊','Reports','Sales, orders, average order, payment, discount and operational reports.','feature',180),
('profit-food-cost','Profit & Food Cost','💰','Reports','Item cost, food cost, margin and profitability.','feature',190),
('staff-attendance','Staff & Attendance','👨‍💼','Staff','Profiles, shifts, attendance, breaks, overtime and commission.','feature',200),
('permissions','Role Permissions','🔐','Security','Owner, manager, cashier, waiter, kitchen and inventory permissions.','feature',210),
('smart-notifications','Smart Notifications','🔔','Operations','New order, delayed order, low stock, payment and operational alerts.','feature',220),
('reviews','Reviews & Reputation','⭐','CRM','Ratings, review analytics and reply workflow.','feature',230),
('reservations-pro','Advanced Reservations','📅','Operations','Calendar, waitlist, table assignment, reminders, no-show and deposits.','feature',240),
('cash-closing','Cashier Closing','💵','Billing','Opening cash, expected cash, actual cash and manager reconciliation.','feature',250),
('whatsapp-invoice','WhatsApp Invoice','💬','Integrations','Send invoices and customer documents through WhatsApp.','feature',260),
('thermal-printing','Thermal Printing','🖨️','Integrations','Thermal receipt printing workflow.','feature',270),
('a4-invoice','A4 Invoice','📄','Billing','Professional A4 invoice generation.','feature',280),
('multi-branch','Multi Branch','🏢','Enterprise','Branches, central menu, branch inventory and branch reporting.','feature',290),
('forecasting','Forecasting','🔮','Enterprise','Demand and sales forecasting foundation.','feature',300)
on conflict(code) do update set name=excluded.name,icon=excluded.icon,category=excluded.category,description=excluded.description;

-- Seed all feature plugins for every restaurant. New features are OFF.
insert into public.restaurant_plugins(
  restaurant_id, plugin_code, plugin_slug, enabled, config, display_name, category, description, feature_kind
)
select r.id,c.code,c.code,
       case when c.code in ('pos-core','payments','whatsapp-invoice') then false else false end,
       '{}'::jsonb,c.name,c.category,c.description,c.kind
from public.restaurants r cross join public.plugin_catalog c
where not exists (
  select 1 from public.restaurant_plugins rp
  where rp.restaurant_id=r.id and rp.plugin_code=c.code
);

create index if not exists idx_restaurant_plugins_feature
on public.restaurant_plugins(restaurant_id,plugin_code,enabled);

-- Helper for server-side enforcement.
create or replace function public.is_restaurant_feature_enabled(
  p_restaurant_id uuid,
  p_plugin_code text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.restaurant_plugins
    where restaurant_id=p_restaurant_id
      and plugin_code=p_plugin_code
      and enabled=true
  );
$$;
