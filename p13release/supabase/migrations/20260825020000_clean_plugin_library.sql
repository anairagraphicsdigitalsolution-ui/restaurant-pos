-- Clean plugin library. Core application modules remain untouched.
UPDATE public.plugin_catalog
SET active = false
WHERE code NOT IN ('restaurant-pro','reservations-pro','qr-ordering-pro','qr-print-center','website-ordering','captain-app','smart-notifications','calling-device','offers','thermal-printing','a4-invoice','hardware-print-queue','whatsapp-invoice','whatsapp','swiggy-integration','zomato-integration','facebook-integration','instagram-integration','pos-core','multi-terminal','combos-variants','takeaway','delivery','delivery-settlement','token-management','split-merge-bills','table-management','table-transfer','payments','refunds-voids','discounts-tax','e-bill','cash-closing','kds','kds-stations','inventory-advanced','recipe-bom','auto-stock-deduction','low-stock-alerts','fifo','stock-transfer','purchasing','purchase-manager','crm','customer-segments','loyalty','wallet','feedback-reviews','staff-attendance','permissions','analytics');

-- Remove obsolete plugin rows only when they are not a Core/Operations module.
DELETE FROM public.restaurant_plugins
WHERE plugin_code NOT IN ('restaurant-pro','reservations-pro','qr-ordering-pro','qr-print-center','website-ordering','captain-app','smart-notifications','calling-device','offers','thermal-printing','a4-invoice','hardware-print-queue','whatsapp-invoice','whatsapp','swiggy-integration','zomato-integration','facebook-integration','instagram-integration','pos-core','multi-terminal','combos-variants','takeaway','delivery','delivery-settlement','token-management','split-merge-bills','table-management','table-transfer','payments','refunds-voids','discounts-tax','e-bill','cash-closing','kds','kds-stations','inventory-advanced','recipe-bom','auto-stock-deduction','low-stock-alerts','fifo','stock-transfer','purchasing','purchase-manager','crm','customer-segments','loyalty','wallet','feedback-reviews','staff-attendance','permissions','analytics','operations-hub','restaurant-core')
  AND plugin_code NOT IN ('reservations','qr-menu','whatsapp');

-- Keep the legacy aliases only for backwards compatibility; they are not
-- shown as separate plugins by the UI.
UPDATE public.plugin_catalog SET active=false WHERE code IN ('whatsapp','reservations','qr-menu');

-- Ensure the clean Pro plugins exist in the catalog.
INSERT INTO public.plugin_catalog (code,name,icon,category,description,kind,sort_order,active)
VALUES
('restaurant-pro','Restaurant Pro','⚡','Pro','Master visibility switch for enabled Pro plugins.','hub',1,true),
('reservations-pro','Advanced Reservations','📅','Operations','Reservation calendar, waitlist, table assignment, reminders, no-show and deposits.','plugin',20,true),
('qr-ordering-pro','Advanced QR Ordering','📱','Ordering','Table/room QR ordering, reorder and customer requests.','plugin',30,true),
('qr-print-center','QR Print Center','🖨️','Printing','QR generation, preview and print-ready output.','plugin',31,true),
('website-ordering','Website Ordering','🌐','Ordering','Public restaurant website ordering connected to the same POS/Kitchen pipeline.','plugin',32,true),
('captain-app','Captain / Waiter App','📲','Staff','Mobile table service and order-taking workflow.','plugin',40,true),
('smart-notifications','Smart Notifications','🔔','Operations','Operational order, payment and service notifications.','plugin',41,true),
('calling-device','Calling Device','📢','Operations','Voice announcement station for new orders and service calls.','plugin',42,true),
('offers','Offers & Promotions','🎁','Marketing','Offers and combos with monthly plan limits.','plugin',50,true),
('thermal-printing','Thermal / KOT Printing','🖨️','Printing','Thermal receipt and kitchen print workflow.','plugin',60,true),
('a4-invoice','A4 Invoice Printing','📄','Printing','A4 invoice printing.','plugin',61,true),
('hardware-print-queue','Hardware Print Queue','📋','Printing','Local printer bridge / hardware print queue.','plugin',62,true),
('whatsapp-invoice','WhatsApp','💬','Integrations','WhatsApp number, invoice messaging and click-to-chat.','integration',70,true),
('swiggy-integration','Swiggy','🟠','Integrations','Swiggy partner integration configuration.','integration',71,true),
('zomato-integration','Zomato','🔴','Integrations','Zomato POS integration configuration.','integration',72,true),
('facebook-integration','Facebook','📘','Marketing','Facebook Page connection and approved publishing.','integration',73,true),
('instagram-integration','Instagram','📸','Marketing','Instagram Professional account connection and approved publishing.','integration',74,true)
ON CONFLICT (code) DO UPDATE SET
 name=excluded.name,icon=excluded.icon,category=excluded.category,
 description=excluded.description,kind=excluded.kind,sort_order=excluded.sort_order,active=true;
