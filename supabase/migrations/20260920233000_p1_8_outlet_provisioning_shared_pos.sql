-- Anaira P1.8 Enterprise Outlet Provisioning / Shared POS Foundation
-- Non-destructive. Adds outlet admin metadata, source menu lineage and outlet menu linkage.
alter table public.enterprise_outlets add column if not exists admin_user_id uuid references auth.users(id) on delete set null;
alter table public.enterprise_outlets add column if not exists admin_email text;
alter table public.enterprise_outlets add column if not exists provisioned_at timestamptz;
alter table public.enterprise_outlets add column if not exists provisioned_by uuid references auth.users(id) on delete set null;

alter table public.enterprise_menu_catalog add column if not exists source_restaurant_id uuid references public.restaurants(id) on delete set null;
alter table public.enterprise_menu_catalog add column if not exists source_menu_item_id uuid;

alter table public.menu_items add column if not exists enterprise_catalog_item_id uuid references public.enterprise_menu_catalog(id) on delete set null;

create index if not exists idx_enterprise_outlets_admin_user on public.enterprise_outlets(admin_user_id);
create index if not exists idx_enterprise_menu_catalog_source on public.enterprise_menu_catalog(source_restaurant_id,source_menu_item_id);
create unique index if not exists ux_menu_items_enterprise_catalog on public.menu_items(restaurant_id,enterprise_catalog_item_id) where enterprise_catalog_item_id is not null;
