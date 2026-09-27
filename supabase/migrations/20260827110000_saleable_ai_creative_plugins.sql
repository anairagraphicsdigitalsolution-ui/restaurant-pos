-- Saleable AI / Creative plugins
-- Additive only: existing plugins and application tables are not modified or deleted.

insert into public.plugin_catalog(code,name,icon,category,description,kind,sort_order) values
('ai-image-studio','AI Image Studio','🖼️','AI Studio','AI image generation workspace for restaurant marketing and creative assets.','plugin',310),
('ai-poster-studio','AI Poster Studio','🪧','AI Studio','AI poster generation workspace for offers, promotions and campaigns.','plugin',320),
('ai-logo-studio','AI Logo Studio','🎨','AI Studio','AI-assisted logo generation workspace for restaurant branding.','plugin',330),
('business-card-studio','Business Card Studio','💳','AI Studio','Professional business-card design editor with front/back layouts and HD export.','plugin',340)
on conflict(code) do update set
  name=excluded.name, icon=excluded.icon, category=excluded.category,
  description=excluded.description, kind=excluded.kind, sort_order=excluded.sort_order, active=true;

insert into public.restaurant_plugins(
  restaurant_id, plugin_code, plugin_slug, enabled, config, display_name, category, description, feature_kind
)
select r.id,c.code,c.code,false,'{}'::jsonb,c.name,c.category,c.description,c.kind
from public.restaurants r
join public.plugin_catalog c on c.code in ('ai-image-studio','ai-poster-studio','ai-logo-studio','business-card-studio')
where not exists (
  select 1 from public.restaurant_plugins rp
  where rp.restaurant_id=r.id and rp.plugin_code=c.code
);

create index if not exists idx_restaurant_plugins_ai_creative
on public.restaurant_plugins(restaurant_id,plugin_code,enabled)
where plugin_code in ('ai-image-studio','ai-poster-studio','ai-logo-studio','business-card-studio');
