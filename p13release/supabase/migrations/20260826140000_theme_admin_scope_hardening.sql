-- Theme Admin permission hardening.
-- A checked "Allow Admin to change theme" switch cannot coexist with scope=none.
-- Existing contradictory rows are normalized to BOTH, while explicitly disabled
-- theme permission always uses scope=none.

UPDATE public.plugin_settings
SET config = jsonb_set(
  COALESCE(config, '{}'::jsonb),
  '{admin_theme_change_scope}',
  to_jsonb(
    CASE
      WHEN COALESCE((config->>'allow_admin_theme_changes')::boolean, false) = false
        THEN 'none'
      WHEN lower(COALESCE(config->>'admin_theme_change_scope','none')) = 'none'
        THEN 'both'
      WHEN lower(COALESCE(config->>'admin_theme_change_scope','none')) IN ('restaurant','qr','both')
        THEN lower(config->>'admin_theme_change_scope')
      ELSE 'both'
    END
  ),
  true
)
WHERE plugin_code = 'restaurant-settings';

CREATE OR REPLACE FUNCTION public.admin_save_restaurant_theme(
  p_restaurant_id uuid,
  p_theme_config jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  actor_role text;
  actor_restaurant uuid;
  theme_plugin_enabled boolean;
  settings_plugin_enabled boolean;
  allow_theme boolean;
  allowed_scope text;
  selected_scope text;
  existing_config jsonb;
  next_config jsonb;
BEGIN
  SELECT role, restaurant_id
    INTO actor_role, actor_restaurant
  FROM public.profiles
  WHERE id = auth.uid();

  IF actor_role <> 'admin' THEN
    RAISE EXCEPTION 'Only restaurant Admin can change the restaurant theme';
  END IF;

  IF actor_restaurant IS NULL OR actor_restaurant <> p_restaurant_id THEN
    RAISE EXCEPTION 'Restaurant access denied';
  END IF;

  SELECT enabled INTO theme_plugin_enabled
  FROM public.restaurant_plugins
  WHERE restaurant_id = p_restaurant_id
    AND plugin_code = 'theme-branding'
  LIMIT 1;

  IF COALESCE(theme_plugin_enabled,false) = false THEN
    RAISE EXCEPTION 'Theme & Branding plugin is disabled';
  END IF;

  SELECT enabled INTO settings_plugin_enabled
  FROM public.restaurant_plugins
  WHERE restaurant_id = p_restaurant_id
    AND plugin_code = 'restaurant-settings'
  LIMIT 1;

  IF COALESCE(settings_plugin_enabled,false) = false THEN
    RAISE EXCEPTION 'Restaurant Settings plugin is disabled';
  END IF;

  SELECT
    COALESCE((config->>'allow_admin_theme_changes')::boolean,false),
    LOWER(COALESCE(config->>'admin_theme_change_scope','none'))
  INTO allow_theme, allowed_scope
  FROM public.plugin_settings
  WHERE restaurant_id = p_restaurant_id
    AND plugin_code = 'restaurant-settings'
  LIMIT 1;

  -- Self-heal legacy contradictory configuration from older UI saves.
  IF allow_theme AND allowed_scope = 'none' THEN
    allowed_scope := 'both';
  END IF;

  IF NOT COALESCE(allow_theme,false) OR allowed_scope NOT IN ('restaurant','qr','both') THEN
    RAISE EXCEPTION 'Super Admin has not allowed Admin theme changes';
  END IF;

  selected_scope := LOWER(COALESCE(p_theme_config->>'theme_scope', allowed_scope));

  IF allowed_scope <> 'both' AND selected_scope <> allowed_scope THEN
    selected_scope := allowed_scope;
  ELSIF allowed_scope = 'both' AND selected_scope NOT IN ('restaurant','qr','both') THEN
    selected_scope := 'both';
  END IF;

  SELECT COALESCE(theme_config,'{}'::jsonb)
    INTO existing_config
  FROM public.restaurants
  WHERE id = p_restaurant_id
  FOR UPDATE;

  next_config := existing_config || jsonb_build_object(
    'selected', COALESCE(p_theme_config->>'selected', existing_config->>'selected', 'logo-premium'),
    'themes', COALESCE(p_theme_config->'themes', existing_config->'themes', '[]'::jsonb),
    'updated_at', now(),
    'selected_by', 'admin',
    'theme_scope', selected_scope
  );

  UPDATE public.restaurants
  SET theme_config = next_config
  WHERE id = p_restaurant_id;

  RETURN next_config;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_save_restaurant_theme(uuid,jsonb)
  TO authenticated, service_role;
