-- Security Advisor hardening
-- Fixes public plugin catalog exposure and makes the analytics view obey
-- the caller's RLS policies on public.order_payments.

-- 1) plugin_catalog is global metadata, but it should not be writable by
-- arbitrary clients. Authenticated users may read it; only Super Admin may mutate it.
alter table public.plugin_catalog enable row level security;

drop policy if exists plugin_catalog_read_authenticated on public.plugin_catalog;
create policy plugin_catalog_read_authenticated
on public.plugin_catalog
for select
to authenticated
using (true);

drop policy if exists plugin_catalog_super_admin_insert on public.plugin_catalog;
create policy plugin_catalog_super_admin_insert
on public.plugin_catalog
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists plugin_catalog_super_admin_update on public.plugin_catalog;
create policy plugin_catalog_super_admin_update
on public.plugin_catalog
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists plugin_catalog_super_admin_delete on public.plugin_catalog;
create policy plugin_catalog_super_admin_delete
on public.plugin_catalog
for delete
to authenticated
using (public.is_super_admin());

-- 2) The daily payment summary is an analytics view over order_payments.
-- Make it SECURITY INVOKER so the caller's permissions/RLS on the base table
-- are respected instead of the view owner's privileges.
alter view public.restaurant_daily_payment_summary
set (security_invoker = true);

-- The app's server/API routes use the service role where appropriate.
-- Direct browser access is limited to authenticated users.
revoke all on public.restaurant_daily_payment_summary from anon;
grant select on public.restaurant_daily_payment_summary to authenticated;
