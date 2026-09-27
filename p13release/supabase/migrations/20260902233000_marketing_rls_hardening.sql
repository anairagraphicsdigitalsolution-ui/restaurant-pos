-- Marketing tenant RLS hardening.
-- Server APIs use service role; browser access is limited by marketing permission.

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' AND tablename IN (
    'marketing_campaigns','marketing_connections','marketing_posts','marketing_leads','marketing_attribution','marketing_audit_logs','marketing_audience_members'
  ) LOOP
    EXECUTE format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

CREATE POLICY marketing_campaigns_marketing_access ON public.marketing_campaigns
FOR ALL TO authenticated
USING (public.is_super_admin() OR (restaurant_id = public.current_restaurant_id() AND (public.current_user_role()='admin' OR public.has_staff_permission(auth.uid(),'marketing'))))
WITH CHECK (public.is_super_admin() OR (restaurant_id = public.current_restaurant_id() AND (public.current_user_role()='admin' OR public.has_staff_permission(auth.uid(),'marketing'))));

CREATE POLICY marketing_connections_marketing_access ON public.marketing_connections
FOR ALL TO authenticated
USING (public.is_super_admin() OR (restaurant_id = public.current_restaurant_id() AND (public.current_user_role()='admin' OR public.has_staff_permission(auth.uid(),'marketing'))))
WITH CHECK (public.is_super_admin() OR (restaurant_id = public.current_restaurant_id() AND (public.current_user_role()='admin' OR public.has_staff_permission(auth.uid(),'marketing'))));

CREATE POLICY marketing_posts_marketing_access ON public.marketing_posts
FOR ALL TO authenticated
USING (public.is_super_admin() OR (restaurant_id = public.current_restaurant_id() AND (public.current_user_role()='admin' OR public.has_staff_permission(auth.uid(),'marketing'))))
WITH CHECK (public.is_super_admin() OR (restaurant_id = public.current_restaurant_id() AND (public.current_user_role()='admin' OR public.has_staff_permission(auth.uid(),'marketing'))));

CREATE POLICY marketing_leads_marketing_access ON public.marketing_leads
FOR ALL TO authenticated
USING (public.is_super_admin() OR (restaurant_id = public.current_restaurant_id() AND (public.current_user_role()='admin' OR public.has_staff_permission(auth.uid(),'marketing'))))
WITH CHECK (public.is_super_admin() OR (restaurant_id = public.current_restaurant_id() AND (public.current_user_role()='admin' OR public.has_staff_permission(auth.uid(),'marketing'))));

CREATE POLICY marketing_audience_marketing_access ON public.marketing_audience_members
FOR ALL TO authenticated
USING (public.is_super_admin() OR (restaurant_id = public.current_restaurant_id() AND (public.current_user_role()='admin' OR public.has_staff_permission(auth.uid(),'marketing'))))
WITH CHECK (public.is_super_admin() OR (restaurant_id = public.current_restaurant_id() AND (public.current_user_role()='admin' OR public.has_staff_permission(auth.uid(),'marketing'))));

CREATE POLICY marketing_attribution_read ON public.marketing_attribution
FOR SELECT TO authenticated
USING (public.is_super_admin() OR (restaurant_id = public.current_restaurant_id() AND (public.current_user_role()='admin' OR public.has_staff_permission(auth.uid(),'marketing'))));

CREATE POLICY marketing_audit_read ON public.marketing_audit_logs
FOR SELECT TO authenticated
USING (public.is_super_admin() OR (restaurant_id = public.current_restaurant_id() AND (public.current_user_role()='admin' OR public.has_staff_permission(auth.uid(),'marketing'))));
