-- Unified Super Admin plugin catalog for the restaurant POS feature set.
-- Additive migration: no existing restaurant/menu/order/customer/payment rows are deleted.

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

insert into public.plugin_catalog(code,name,icon,category,description,kind,sort_order) values
('pos-core','POS Core','🧾','POS','Dine-in, takeaway, delivery, quick order, hold, park, reopen and void workflows.','feature',10),
('multi-terminal','Multi-Terminal POS','🖥️','POS','Multiple billing terminals, shared KOT and bill-print workflow.','feature',20),
('combos-variants','Combos, Variants & Add-ons','🧩','POS','Item variants, modifiers, combos and paid add-ons.','feature',30),
('takeaway','Takeaway & Pickup','🥡','Orders','Pickup tokens, ready status and customer pickup workflow.','feature',40),
('delivery','Delivery Management','🛵','Delivery','Zones, charges, riders, assignment, COD, delivery status and settlement.','feature',50),
('delivery-settlement','Rider Settlement','💰','Delivery','Expected vs collected cash, UPI, card and rider reconciliation.','feature',60),
('token-management','Token Management','🎟️','Orders','Takeaway and delivery tokens with ready and pickup boards.','feature',70),
('split-merge-bills','Split & Merge Bills','🧮','Billing','Split bills, merge bills and move items between bills.','feature',80),
('table-management','Advanced Table Management','🪑','Operations','Floor map, sections, capacity, table status and waiter assignment.','feature',90),
('table-transfer','Table Transfer','🔄','Operations','Transfer tables and move items table-to-table.','feature',100),
('payments','Multiple Payments','💳','Billing','Cash, card, UPI, online, credit and partial payments.','feature',110),
('refunds-voids','Refund & Void','↩️','Billing','Refunds, voids, reasons and audit trail.','feature',120),
('discounts-tax','Discounts, Tax & Service Charge','🏷️','Billing','Discounts, coupons, GST, service charge and tips.','feature',130),
('e-bill','E-Bill & Invoice','📄','Billing','E-bills, A4 invoices and customer document delivery.','feature',140),
('cash-closing','Cashier Closing','💵','Billing','Opening cash, expected cash, actual cash and manager reconciliation.','feature',150),
('kds','Kitchen Display System','👨‍🍳','Kitchen','New, preparing, ready, served, timers and priorities.','feature',160),
('kds-stations','Kitchen Stations','🍕','Kitchen','Kitchen, bar, pizza, dessert and custom preparation stations.','feature',170),
('central-kitchen','Central Kitchen','🏭','Kitchen','Central production, branch dispatch and kitchen transfers.','feature',180),
('inventory-advanced','Advanced Inventory','📦','Inventory','Movements, batches, expiry, wastage, damaged stock and transfers.','feature',190),
('recipe-bom','Recipe / BOM','🍳','Inventory','Ingredient recipes and recipe-based costing.','feature',200),
('auto-stock-deduction','Automatic Stock Deduction','⚙️','Inventory','Automatically deduct ingredients when a menu item is sold.','feature',210),
('low-stock-alerts','Low Stock Alerts','📉','Inventory','Reorder thresholds and low-stock notifications.','feature',220),
('fifo','FIFO & Expiry','⏳','Inventory','FIFO batches, expiry tracking and ageing controls.','feature',230),
('stock-transfer','Stock Transfer & Wastage','🔁','Inventory','Branch/store transfers, wastage and damaged stock.','feature',240),
('purchasing','Purchasing & Suppliers','🚚','Purchasing','Suppliers, purchase orders, invoices, GRN and supplier payments.','feature',250),
('purchase-manager','Purchase Manager','🧾','Purchasing','Vendor comparison, purchase planning and purchase-to-stock workflow.','feature',260),
('crm','Customer CRM','👥','CRM','Customer history, favourites, VIP, birthdays, tags and segments.','feature',270),
('customer-segments','Customer Segments','🎯','CRM','VIP, repeat, dormant and custom customer segments.','feature',280),
('loyalty','Loyalty & Membership','⭐','CRM','Points, tiers, memberships, rewards and multipliers.','feature',290),
('wallet','Customer Wallet','👛','CRM','Wallet balance, top-up, redemption and ledger.','feature',300),
('campaigns','CRM Campaigns','📣','Marketing','Customer campaigns, targeted offers and campaign drafts.','feature',310),
('sms-marketing','SMS Marketing','📨','Marketing','SMS campaign infrastructure and delivery tracking.','feature',320),
('whatsapp-invoice','WhatsApp Invoice','💬','Integrations','Send invoices and customer documents through WhatsApp.','feature',330),
('feedback-reviews','Feedback & Reviews','⭐','CRM','Ratings, feedback, review analytics and response workflow.','feature',340),
('reservations-pro','Advanced Reservations','📅','Operations','Calendar, waitlist, table assignment, reminders, no-show and deposits.','feature',350),
('qr-ordering-pro','Advanced QR Ordering','📱','Digital','QR ordering, waiter call, bill request, reorder and upselling.','feature',360),
('scan-pay','Scan & Pay','📲','Digital','Customer scan-to-pay and payment request workflow.','feature',370),
('online-ordering','Online Ordering','🌐','Digital','Website and digital ordering channel infrastructure.','feature',380),
('aggregator-menu','Aggregator Menu Control','🔗','Online','Availability, pricing and menu controls for delivery channels.','feature',390),
('online-reconciliation','Online Order Reconciliation','🧾','Online','Commission, platform charges, payouts, cancellations and reconciliation.','feature',400),
('website-ordering','Restaurant Website Ordering','🖥️','Digital','Restaurant website menu and online ordering foundation.','feature',410),
('captain-app','Captain / Waiter App','📱','Staff','Mobile table service, order taking, KOT and payment workflow.','feature',420),
('staff-attendance','Staff & Attendance','👨‍💼','Staff','Profiles, shifts, attendance, breaks, overtime and commission.','feature',430),
('permissions','Role Permissions','🔐','Security','Owner, manager, cashier, waiter, kitchen and inventory permissions.','feature',440),
('analytics','Restaurant Analytics','📊','Reports','Sales, orders, average order, payment, discount and operational reports.','feature',450),
('dynamic-reports','Dynamic Reports','📈','Reports','Custom filters, saved reports and exportable operational reports.','feature',460),
('profit-food-cost','Profit & Food Cost','💰','Reports','Item cost, food cost, margin and profitability.','feature',470),
('tax-reports','Tax Reports','🧮','Reports','GST, tax and invoice reporting/export.','feature',480),
('staff-reports','Staff Performance Reports','🏅','Reports','Staff sales, attendance, productivity and performance reporting.','feature',490),
('smart-notifications','Smart Notifications','🔔','Operations','New order, delayed order, low stock, payment and operational alerts.','feature',500),
('self-service-kiosk','Self-Service Kiosk','🖥️','Digital','Customer self-ordering kiosk workflow.','feature',510),
('digital-display','Digital Display','📺','Digital','Customer-facing menu, token and order-ready display.','feature',520),
('calling-device','Calling Device','📢','Digital','Customer/staff calling queue and alert device foundation.','feature',530),
('multi-branch','Multi Branch','🏢','Enterprise','Branches, central menu, branch inventory and branch reporting.','feature',540),
('branch-menu','Central Menu Publishing','🗂️','Enterprise','Central menu with branch-level overrides and availability.','feature',550),
('forecasting','Forecasting','🔮','Enterprise','Demand and sales forecasting foundation.','feature',560),
('thermal-printing','Thermal Printing','🖨️','Integrations','Thermal receipt, KOT and slip printing workflow.','feature',570),
('a4-invoice','A4 Invoice','📄','Integrations','Professional A4 invoice generation.','feature',580),
('payment-gateways','Payment Gateways','💳','Integrations','Online payment gateway configuration and reconciliation.','feature',590),
('offers','Offers & Promotions','🎁','Marketing','Offers, coupons, smart promotions and targeting.','feature',600)
on conflict(code) do update set
 name=excluded.name,
 icon=excluded.icon,
 category=excluded.category,
 description=excluded.description,
 kind=excluded.kind,
 active=true,
 sort_order=excluded.sort_order;

-- Seed missing plugin rows only. Existing enabled/disabled state is preserved.
insert into public.restaurant_plugins(
  restaurant_id, plugin_code, plugin_slug, enabled, config,
  display_name, category, description, feature_kind
)
select r.id,c.code,c.code,false,'{}'::jsonb,
       c.name,c.category,c.description,c.kind
from public.restaurants r
cross join public.plugin_catalog c
where c.active=true
and not exists (
  select 1 from public.restaurant_plugins rp
  where rp.restaurant_id=r.id and rp.plugin_code=c.code
);

create index if not exists idx_restaurant_plugins_control
on public.restaurant_plugins(restaurant_id, plugin_code, enabled);
