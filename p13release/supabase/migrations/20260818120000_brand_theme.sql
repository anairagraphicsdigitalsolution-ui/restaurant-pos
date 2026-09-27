-- Restaurant-level white-label theme configuration.
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS theme_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.restaurants.theme_config IS
  'White-label POS theme selection and generated brand theme presets.';


-- Public restaurant-branding logo bucket.
-- The POS uploads logos under <restaurant_id>/...
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Local Supabase compatibility: storage.objects is owned/managed by Supabase Storage.
-- Branding bucket is preserved above; object policies are intentionally managed by local Storage.
