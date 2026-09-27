-- Plugin configuration is platform-controlled.
-- Restaurant Admins can see plugin status, but only Super Admin may
-- create/update/delete plugin_settings for a restaurant.
DROP POLICY IF EXISTS "plugin_settings_manage_admin" ON public.plugin_settings;
DROP POLICY IF EXISTS "plugin_settings_manage_super_admin" ON public.plugin_settings;

CREATE POLICY "plugin_settings_manage_super_admin"
ON public.plugin_settings
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());
