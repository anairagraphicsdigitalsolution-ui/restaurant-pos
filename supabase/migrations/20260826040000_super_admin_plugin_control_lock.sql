-- Super Admin owns plugin activation/deactivation.
-- Restaurant Admin may consume enabled plugins, but may not install,
-- activate, deactivate, or delete plugin rows directly.

DROP POLICY IF EXISTS restaurant_plugins_manage_admin ON public.restaurant_plugins;

CREATE POLICY restaurant_plugins_manage_super_admin
ON public.restaurant_plugins
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- plugin_settings writes are already routed through Super Admin APIs for
-- configuration-heavy integrations. Keep the existing read policy because
-- some runtime pages need non-secret feature state, but do not broaden it.
