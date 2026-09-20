-- P2 Feature Control Center catalog
-- Safe to re-run. Does not delete restaurant data or plugin state.
insert into public.plugin_catalog (code,name,icon,category,description,kind,active,sort_order)
values
('p2-call-center','P2 Call Center','📞','P2 Advanced Operations','Call Center workflow.','feature',true,200),
('p2-banquet-events','P2 Banquet / Events / Catering','🎪','P2 Advanced Operations','Banquet and catering workflow.','feature',true,201),
('p2-advanced-kiosk','P2 Advanced Kiosk','🖥️','P2 Advanced Operations','Advanced self-order kiosk workflow.','feature',true,202),
('p2-customer-display','P2 Customer Display','📺','P2 Advanced Operations','Dual-screen customer display workflow.','feature',true,203),
('p2-device-hq','P2 Device HQ','🧰','P2 Advanced Operations','Central device management workflow.','feature',true,204),
('p2-ai-intelligence','P2 AI Decision Intelligence','🧠','P2 Advanced Operations','AI decision intelligence workflow.','feature',true,205)
on conflict (code) do update set name=excluded.name,icon=excluded.icon,category=excluded.category,description=excluded.description,kind=excluded.kind,active=true,sort_order=excluded.sort_order;
