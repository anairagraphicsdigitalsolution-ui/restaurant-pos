-- Anaira Enterprise HQ: fix recursive RLS on enterprise_members.
-- Non-destructive: replaces only the recursive membership policies with
-- SECURITY DEFINER helper functions that read enterprise_members safely.

create or replace function public.is_enterprise_member(
  p_enterprise_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.enterprise_members em
    where em.enterprise_id = p_enterprise_id
      and em.user_id = p_user_id
  );
$$;

create or replace function public.is_enterprise_admin(
  p_enterprise_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.enterprise_members em
    where em.enterprise_id = p_enterprise_id
      and em.user_id = p_user_id
      and em.role in ('owner', 'enterprise_admin')
  );
$$;

revoke all on function public.is_enterprise_member(uuid, uuid) from public;
revoke all on function public.is_enterprise_admin(uuid, uuid) from public;
grant execute on function public.is_enterprise_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_enterprise_admin(uuid, uuid) to authenticated, service_role;

drop policy if exists enterprise_members_self_select on public.enterprise_members;
create policy enterprise_members_self_select
on public.enterprise_members
for select to authenticated
using (
  user_id = auth.uid()
  or public.is_enterprise_admin(enterprise_id)
);

drop policy if exists enterprise_groups_member_select on public.enterprise_groups;
create policy enterprise_groups_member_select
on public.enterprise_groups
for select to authenticated
using (public.is_enterprise_member(id));

drop policy if exists enterprise_outlets_member_select on public.enterprise_outlets;
create policy enterprise_outlets_member_select
on public.enterprise_outlets
for select to authenticated
using (public.is_enterprise_member(enterprise_id));

-- Same non-recursive membership predicate for other Enterprise HQ read policies.
drop policy if exists enterprise_menu_catalog_member_select on public.enterprise_menu_catalog;
create policy enterprise_menu_catalog_member_select
on public.enterprise_menu_catalog
for select to authenticated
using (public.is_enterprise_member(enterprise_id));

drop policy if exists enterprise_menu_prices_member_select on public.enterprise_menu_prices;
create policy enterprise_menu_prices_member_select
on public.enterprise_menu_prices
for select to authenticated
using (public.is_enterprise_member(enterprise_id));

drop policy if exists enterprise_transfers_member_select on public.enterprise_inventory_transfers;
create policy enterprise_transfers_member_select
on public.enterprise_inventory_transfers
for select to authenticated
using (public.is_enterprise_member(enterprise_id));

drop policy if exists enterprise_devices_member_select on public.enterprise_devices;
create policy enterprise_devices_member_select
on public.enterprise_devices
for select to authenticated
using (public.is_enterprise_member(enterprise_id));

drop policy if exists enterprise_audit_member_select on public.enterprise_audit_logs;
create policy enterprise_audit_member_select
on public.enterprise_audit_logs
for select to authenticated
using (public.is_enterprise_member(enterprise_id));
