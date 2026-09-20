CREATE TABLE IF NOT EXISTS public.platform_settings (
  setting_key text PRIMARY KEY,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_settings_select_super_admin ON public.platform_settings;
DROP POLICY IF EXISTS platform_settings_manage_super_admin ON public.platform_settings;

CREATE POLICY platform_settings_select_super_admin
  ON public.platform_settings
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE POLICY platform_settings_manage_super_admin
  ON public.platform_settings
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

INSERT INTO public.platform_settings (setting_key, config, updated_at)
VALUES ('theme', jsonb_build_object('selected', 'logo-premium'), now())
ON CONFLICT (setting_key) DO NOTHING;

-- Restaurant theme source of truth remains restaurants.theme_config.selected.
-- plugin_settings.theme-branding stores plugin policy only; legacy theme_id is
-- retained for backwards compatibility with existing Super Admin screens.
COMMENT ON COLUMN public.restaurants.theme_config IS
  'Authoritative restaurant theme document. selected is the canonical selected theme; theme_scope controls application scope. plugin_settings theme-branding is policy/backward-compatible metadata.';
