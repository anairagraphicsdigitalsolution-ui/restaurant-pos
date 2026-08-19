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

DROP POLICY IF EXISTS "Public can read restaurant branding logos" ON storage.objects;
CREATE POLICY "Public can read restaurant branding logos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'logos');

DROP POLICY IF EXISTS "Admins can upload restaurant branding logos" ON storage.objects;
CREATE POLICY "Admins can upload restaurant branding logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
      AND (
        p.role = 'super_admin'
        OR split_part(name, '/', 1) = p.restaurant_id::text
      )
  )
);

DROP POLICY IF EXISTS "Admins can update restaurant branding logos" ON storage.objects;
CREATE POLICY "Admins can update restaurant branding logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
      AND (
        p.role = 'super_admin'
        OR split_part(name, '/', 1) = p.restaurant_id::text
      )
  )
)
WITH CHECK (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
      AND (
        p.role = 'super_admin'
        OR split_part(name, '/', 1) = p.restaurant_id::text
      )
  )
);

DROP POLICY IF EXISTS "Admins can delete restaurant branding logos" ON storage.objects;
CREATE POLICY "Admins can delete restaurant branding logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'super_admin')
      AND (
        p.role = 'super_admin'
        OR split_part(name, '/', 1) = p.restaurant_id::text
      )
  )
);
