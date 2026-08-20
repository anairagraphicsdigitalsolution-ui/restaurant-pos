-- Unified runtime plugin controls.
-- Keeps legacy plugin codes working with the Super Admin catalog.
-- No destructive deletes and no dependency on restaurant_plugins.updated_at.

insert into public.plugin_catalog
  (code,name,icon,category,description,kind,sort_order)
values
  ('qr-menu','QR Menu Runtime','📱','QR','Legacy runtime alias for Advanced QR Ordering.','feature',151),
  ('pos','POS Runtime','🧾','POS','Legacy runtime alias for Advanced POS Core.','feature',11),
  ('whatsapp','WhatsApp Runtime','💬','Integrations','Legacy runtime alias for WhatsApp Invoice.','feature',261),
  ('reservations','Reservations Runtime','📅','Operations','Legacy runtime alias for Advanced Reservations.','feature',241)
on conflict (code) do update set
  name=excluded.name,
  icon=excluded.icon,
  category=excluded.category,
  description=excluded.description,
  kind=excluded.kind,
  sort_order=excluded.sort_order;

-- Create missing runtime alias rows without deleting existing rows.
with alias_pairs(canonical_code, runtime_code) as (
  values
    ('qr-ordering-pro','qr-menu'),
    ('pos-core','pos'),
    ('whatsapp-invoice','whatsapp'),
    ('reservations-pro','reservations')
),
states as (
  select
    r.id as restaurant_id,
    a.canonical_code,
    a.runtime_code,
    exists (
      select 1
      from public.restaurant_plugins rp
      where rp.restaurant_id = r.id
        and rp.plugin_code in (a.canonical_code, a.runtime_code)
        and rp.enabled = true
    ) as enabled
  from public.restaurants r
  cross join alias_pairs a
)
insert into public.restaurant_plugins
  (restaurant_id, plugin_code, plugin_slug, enabled, config, display_name, category, description, feature_kind)
select
  s.restaurant_id,
  s.runtime_code,
  s.runtime_code,
  s.enabled,
  '{}'::jsonb,
  c.name,
  c.category,
  c.description,
  c.kind
from states s
join public.plugin_catalog c on c.code = s.runtime_code
where not exists (
  select 1
  from public.restaurant_plugins rp
  where rp.restaurant_id = s.restaurant_id
    and rp.plugin_code = s.runtime_code
);

-- Make both sides of every alias pair reflect the same enabled state.
with alias_pairs(canonical_code, runtime_code) as (
  values
    ('qr-ordering-pro','qr-menu'),
    ('pos-core','pos'),
    ('whatsapp-invoice','whatsapp'),
    ('reservations-pro','reservations')
),
states as (
  select
    r.id as restaurant_id,
    a.canonical_code,
    a.runtime_code,
    exists (
      select 1
      from public.restaurant_plugins rp
      where rp.restaurant_id = r.id
        and rp.plugin_code in (a.canonical_code, a.runtime_code)
        and rp.enabled = true
    ) as enabled
  from public.restaurants r
  cross join alias_pairs a
)
update public.restaurant_plugins rp
set enabled = s.enabled
from states s
where rp.restaurant_id = s.restaurant_id
  and rp.plugin_code in (s.canonical_code, s.runtime_code);

-- Central DB-side feature check understands legacy/runtime aliases.
create or replace function public.is_restaurant_feature_enabled(
  p_restaurant_id uuid,
  p_plugin_code text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.restaurant_plugins rp
    where rp.restaurant_id = p_restaurant_id
      and rp.enabled = true
      and (
        rp.plugin_code = lower(trim(p_plugin_code))
        or (
          lower(trim(p_plugin_code)) in ('qr-menu','qr-ordering-pro')
          and rp.plugin_code in ('qr-menu','qr-ordering-pro')
        )
        or (
          lower(trim(p_plugin_code)) in ('pos','pos-core')
          and rp.plugin_code in ('pos','pos-core')
        )
        or (
          lower(trim(p_plugin_code)) in ('whatsapp','whatsapp-invoice')
          and rp.plugin_code in ('whatsapp','whatsapp-invoice')
        )
        or (
          lower(trim(p_plugin_code)) in ('reservations','reservations-pro')
          and rp.plugin_code in ('reservations','reservations-pro')
        )
      )
  );
$$;
