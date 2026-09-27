-- P1/P2 feature-control catalog
-- Safe upsert: does not delete existing restaurant plugin rows or business data.
insert into public.plugin_catalog (code,name,icon,category,description,kind,active,sort_order)
values
('p1-enterprise-hq','P1 Enterprise HQ','🏢','P1 Advanced Operations','Enterprise HQ, outlet comparison, central menu/pricing, transfers, approvals, staff movement and consolidated accounting.','feature',true,150),
('p1-payment-terminals','P1 Payment Terminals','💳','P1 Advanced Operations','Payment terminal registration, health, callbacks, transaction monitoring and reconciliation.','feature',true,151),
('p1-supplier-automation','P1 Supplier Automation','🚚','P1 Advanced Operations','Reorder automation, RFQ, supplier quotes, purchase orders, GRN, payables and supplier performance.','feature',true,152),
('p1-marketing-hub','P1 Marketing Hub','📣','P1 Advanced Operations','Campaigns, audience, content, automation, delivery events and performance.','feature',true,153),
('p1-advanced-reporting','P1 Advanced Reporting','📊','P1 Advanced Operations','Advanced reporting, profitability, dynamic reports and scheduled reports.','feature',true,154),
('p2-call-center','P2 Call Center','📞','P2 Advanced Operations','Caller identification, customer 360, quick reorder, delivery, callback, history and agent assignment.','feature',true,200),
('p2-banquet-events','P2 Banquet / Events / Catering','🎪','P2 Advanced Operations','Event enquiry, quotes, packages, guest count, menu, advance, contract, operations and final billing.','feature',true,201),
('p2-advanced-kiosk','P2 Advanced Kiosk','🖥️','P2 Advanced Operations','Self ordering, modifiers, combos, upsell, payment, token, offline queue and KDS.','feature',true,202),
('p2-customer-display','P2 Customer Display','📺','P2 Advanced Operations','Dual-screen cart, tax, discount, offers, QR payment, loyalty, feedback and thank-you flow.','feature',true,203),
('p2-device-hq','P2 Device HQ','🧰','P2 Advanced Operations','Central device registration, heartbeat, online/offline health, configuration, replacement and audit.','feature',true,204),
('p2-ai-intelligence','P2 AI Decision Intelligence','🧠','P2 Advanced Operations','Historical datasets, forecasts, backtesting, recommendations, risk signals and business insights.','feature',true,205)
on conflict (code) do update set name=excluded.name,icon=excluded.icon,category=excluded.category,description=excluded.description,kind=excluded.kind,active=true,sort_order=excluded.sort_order;
