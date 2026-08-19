drop extension if exists "pg_net";

drop trigger if exists "trg_notify_new_order" on "public"."orders";

alter table "public"."restaurant_subscriptions" drop constraint "restaurant_subscriptions_plan_id_fkey";

drop index if exists "public"."idx_inventory_restaurant_low_stock";

drop index if exists "public"."idx_menu_items_restaurant_category";

drop index if exists "public"."idx_orders_restaurant_status";

drop index if exists "public"."idx_reservations_restaurant_start";


  create table "public"."plan_features" (
    "id" uuid not null default gen_random_uuid(),
    "plan_id" uuid not null,
    "plugin_code" text not null,
    "enabled" boolean not null default true,
    "limits" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."plan_features" enable row level security;


  create table "public"."plans" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "code" text not null,
    "description" text,
    "price_monthly" numeric(10,2) not null default 0,
    "price_yearly" numeric(10,2) not null default 0,
    "max_staff" integer,
    "max_tables" integer,
    "max_menu_items" integer,
    "max_orders" integer,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."plans" enable row level security;

alter table "public"."restaurant_subscriptions" add column "expires_at" timestamp with time zone;

alter table "public"."restaurant_subscriptions" alter column "plan_id" set not null;

alter table "public"."restaurant_subscriptions" alter column "starts_at" set default now();

alter table "public"."restaurant_subscriptions" alter column "starts_at" set not null;

alter table "public"."restaurants" add column "address" text;

alter table "public"."restaurants" add column "gst" text;

alter table "public"."restaurants" add column "owner_name" text;

alter table "public"."restaurants" add column "phone" text;

alter table "public"."restaurants" add column "status" text default 'active'::text;

alter table "public"."restaurants" alter column "theme_config" drop default;

alter table "public"."restaurants" alter column "theme_config" drop not null;

CREATE UNIQUE INDEX idx_one_active_subscription_per_restaurant ON public.restaurant_subscriptions USING btree (restaurant_id) WHERE (status = ANY (ARRAY['trial'::text, 'active'::text]));

CREATE INDEX idx_plan_features_plan ON public.plan_features USING btree (plan_id);

CREATE INDEX idx_plan_features_plugin ON public.plan_features USING btree (plugin_code);

CREATE INDEX idx_plans_active ON public.plans USING btree (is_active);

CREATE INDEX idx_restaurant_subscriptions_plan ON public.restaurant_subscriptions USING btree (plan_id);

CREATE INDEX idx_restaurant_subscriptions_restaurant ON public.restaurant_subscriptions USING btree (restaurant_id);

CREATE INDEX idx_restaurant_subscriptions_status ON public.restaurant_subscriptions USING btree (status);

CREATE UNIQUE INDEX plan_features_pkey ON public.plan_features USING btree (id);

CREATE UNIQUE INDEX plan_features_unique ON public.plan_features USING btree (plan_id, plugin_code);

CREATE UNIQUE INDEX plans_code_key ON public.plans USING btree (code);

CREATE UNIQUE INDEX plans_pkey ON public.plans USING btree (id);

alter table "public"."plan_features" add constraint "plan_features_pkey" PRIMARY KEY using index "plan_features_pkey";

alter table "public"."plans" add constraint "plans_pkey" PRIMARY KEY using index "plans_pkey";

alter table "public"."plan_features" add constraint "plan_features_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE CASCADE not valid;

alter table "public"."plan_features" validate constraint "plan_features_plan_id_fkey";

alter table "public"."plan_features" add constraint "plan_features_unique" UNIQUE using index "plan_features_unique";

alter table "public"."plans" add constraint "plans_code_key" UNIQUE using index "plans_code_key";

alter table "public"."plans" add constraint "plans_max_menu_items_positive" CHECK (((max_menu_items IS NULL) OR (max_menu_items >= 0))) not valid;

alter table "public"."plans" validate constraint "plans_max_menu_items_positive";

alter table "public"."plans" add constraint "plans_max_orders_positive" CHECK (((max_orders IS NULL) OR (max_orders >= 0))) not valid;

alter table "public"."plans" validate constraint "plans_max_orders_positive";

alter table "public"."plans" add constraint "plans_max_staff_positive" CHECK (((max_staff IS NULL) OR (max_staff >= 0))) not valid;

alter table "public"."plans" validate constraint "plans_max_staff_positive";

alter table "public"."plans" add constraint "plans_max_tables_positive" CHECK (((max_tables IS NULL) OR (max_tables >= 0))) not valid;

alter table "public"."plans" validate constraint "plans_max_tables_positive";

alter table "public"."plans" add constraint "plans_price_monthly_nonnegative" CHECK ((price_monthly >= (0)::numeric)) not valid;

alter table "public"."plans" validate constraint "plans_price_monthly_nonnegative";

alter table "public"."plans" add constraint "plans_price_yearly_nonnegative" CHECK ((price_yearly >= (0)::numeric)) not valid;

alter table "public"."plans" validate constraint "plans_price_yearly_nonnegative";

alter table "public"."restaurant_subscriptions" add constraint "restaurant_subscriptions_dates_check" CHECK (((expires_at IS NULL) OR (expires_at >= starts_at))) not valid;

alter table "public"."restaurant_subscriptions" validate constraint "restaurant_subscriptions_dates_check";

alter table "public"."restaurant_subscriptions" add constraint "restaurant_subscriptions_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE RESTRICT not valid;

alter table "public"."restaurant_subscriptions" validate constraint "restaurant_subscriptions_plan_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.has_plan_feature(p_plugin_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT
        CASE
            WHEN public.is_super_admin() THEN true

            ELSE EXISTS (
                SELECT 1
                FROM public.restaurant_subscriptions rs
                JOIN public.plan_features pf
                    ON pf.plan_id = rs.plan_id
                WHERE rs.restaurant_id = public.current_restaurant_id()
                  AND rs.status IN ('trial', 'active')
                  AND pf.plugin_code = p_plugin_code
                  AND pf.enabled = true
                  AND (
                      rs.expires_at IS NULL
                      OR rs.expires_at > now()
                  )
            )
        END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_order_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source text;
  v_total text;
begin
  v_source := coalesce(nullif(trim(new.source_label), ''), initcap(replace(coalesce(new.source_type, 'order'), '_', ' ')), 'New order');
  v_total := '₹' || to_char(coalesce(new.total_amount, 0), 'FM999,999,999,990.00');

  insert into public.notifications (
    restaurant_id,
    user_id,
    type,
    title,
    message,
    action_url
  ) values (
    new.restaurant_id,
    null,
    'success',
    'New order received',
    format('%s • %s', v_source, v_total),
    '/kitchen'
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_new_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  restaurant_name text;
  order_source text;
  order_total text;
begin
  select r.name into restaurant_name
  from public.restaurants r
  where r.id = NEW.restaurant_id;

  order_source := coalesce(nullif(NEW.source_label, ''), initcap(coalesce(NEW.source_type, 'order')));
  order_total := to_char(coalesce(NEW.total_amount, 0), 'FM999999990.00');

  insert into public.notifications (
    restaurant_id,
    type,
    title,
    message,
    action_url
  )
  values (
    NEW.restaurant_id,
    'order',
    'New order received',
    format('%s • Order #%s • ₹%s', order_source, left(NEW.id::text, 8), order_total),
    '/kitchen'
  );

  return NEW;
end;
$function$
;

grant delete on table "public"."plan_features" to "anon";

grant insert on table "public"."plan_features" to "anon";

grant references on table "public"."plan_features" to "anon";

grant select on table "public"."plan_features" to "anon";

grant trigger on table "public"."plan_features" to "anon";

grant truncate on table "public"."plan_features" to "anon";

grant update on table "public"."plan_features" to "anon";

grant delete on table "public"."plan_features" to "authenticated";

grant insert on table "public"."plan_features" to "authenticated";

grant references on table "public"."plan_features" to "authenticated";

grant select on table "public"."plan_features" to "authenticated";

grant trigger on table "public"."plan_features" to "authenticated";

grant truncate on table "public"."plan_features" to "authenticated";

grant update on table "public"."plan_features" to "authenticated";

grant delete on table "public"."plan_features" to "service_role";

grant insert on table "public"."plan_features" to "service_role";

grant references on table "public"."plan_features" to "service_role";

grant select on table "public"."plan_features" to "service_role";

grant trigger on table "public"."plan_features" to "service_role";

grant truncate on table "public"."plan_features" to "service_role";

grant update on table "public"."plan_features" to "service_role";

grant delete on table "public"."plans" to "anon";

grant insert on table "public"."plans" to "anon";

grant references on table "public"."plans" to "anon";

grant select on table "public"."plans" to "anon";

grant trigger on table "public"."plans" to "anon";

grant truncate on table "public"."plans" to "anon";

grant update on table "public"."plans" to "anon";

grant delete on table "public"."plans" to "authenticated";

grant insert on table "public"."plans" to "authenticated";

grant references on table "public"."plans" to "authenticated";

grant select on table "public"."plans" to "authenticated";

grant trigger on table "public"."plans" to "authenticated";

grant truncate on table "public"."plans" to "authenticated";

grant update on table "public"."plans" to "authenticated";

grant delete on table "public"."plans" to "service_role";

grant insert on table "public"."plans" to "service_role";

grant references on table "public"."plans" to "service_role";

grant select on table "public"."plans" to "service_role";

grant trigger on table "public"."plans" to "service_role";

grant truncate on table "public"."plans" to "service_role";

grant update on table "public"."plans" to "service_role";


  create policy "plan_features_delete_superadmin"
  on "public"."plan_features"
  as permissive
  for delete
  to authenticated
using (public.is_super_admin());



  create policy "plan_features_insert_superadmin"
  on "public"."plan_features"
  as permissive
  for insert
  to authenticated
with check (public.is_super_admin());



  create policy "plan_features_select_access"
  on "public"."plan_features"
  as permissive
  for select
  to authenticated
using ((public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM public.restaurant_subscriptions rs
  WHERE ((rs.plan_id = plan_features.plan_id) AND (rs.restaurant_id = public.current_restaurant_id()) AND (rs.status = ANY (ARRAY['trial'::text, 'active'::text])))))));



  create policy "plan_features_update_superadmin"
  on "public"."plan_features"
  as permissive
  for update
  to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());



  create policy "plans_delete_superadmin"
  on "public"."plans"
  as permissive
  for delete
  to authenticated
using (public.is_super_admin());



  create policy "plans_insert_superadmin"
  on "public"."plans"
  as permissive
  for insert
  to authenticated
with check (public.is_super_admin());



  create policy "plans_select_superadmin"
  on "public"."plans"
  as permissive
  for select
  to authenticated
using (public.is_super_admin());



  create policy "plans_update_superadmin"
  on "public"."plans"
  as permissive
  for update
  to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());



  create policy "subscriptions_delete_superadmin"
  on "public"."restaurant_subscriptions"
  as permissive
  for delete
  to authenticated
using (public.is_super_admin());



  create policy "subscriptions_insert_superadmin"
  on "public"."restaurant_subscriptions"
  as permissive
  for insert
  to authenticated
with check (public.is_super_admin());



  create policy "subscriptions_select_access"
  on "public"."restaurant_subscriptions"
  as permissive
  for select
  to authenticated
using ((public.is_super_admin() OR (public.current_restaurant_id() = restaurant_id)));



  create policy "subscriptions_update_superadmin"
  on "public"."restaurant_subscriptions"
  as permissive
  for update
  to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());


CREATE TRIGGER trg_notify_new_order AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.notify_new_order();

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


  create policy "Authenticated users can delete restaurant logos"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'logos'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))));



  create policy "Authenticated users can update restaurant logos"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'logos'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))))
with check (((bucket_id = 'logos'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))));



  create policy "Authenticated users can upload restaurant logos"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'logos'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))));



  create policy "Public can view restaurant logos"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'logos'::text));



  create policy "allow images upload 1xs2w12_0"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'menu-images'::text));



  create policy "allow images upload 1xs2w12_1"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'menu-images'::text));



  create policy "allow images upload 1xs2w12_2"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'menu-images'::text));



  create policy "allow images upload 1xs2w12_3"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'menu-images'::text));



  create policy "allow upload 1peuqw_0"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'logos'::text));



  create policy "allow upload 1peuqw_1"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'logos'::text));



  create policy "allow upload a8wi7g_0"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'restaurant-covers'::text));



  create policy "allow upload a8wi7g_1"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check ((bucket_id = 'restaurant-covers'::text));



  create policy "allow upload a8wi7g_2"
  on "storage"."objects"
  as permissive
  for delete
  to public
using ((bucket_id = 'restaurant-covers'::text));



  create policy "allow upload a8wi7g_3"
  on "storage"."objects"
  as permissive
  for update
  to public
using ((bucket_id = 'restaurant-covers'::text));



