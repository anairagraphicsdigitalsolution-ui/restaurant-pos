-- Automatic public slugs for QR ordering links.
-- Existing slugs are preserved. Missing slugs get a stable, readable value.

CREATE OR REPLACE FUNCTION public.make_restaurant_slug(p_name text, p_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug text;
  candidate text;
  n integer := 0;
BEGIN
  base_slug := lower(trim(regexp_replace(coalesce(p_name, 'restaurant'), '[^a-zA-Z0-9]+', '-', 'g')));
  base_slug := trim(both '-' from base_slug);

  IF base_slug = '' THEN
    base_slug := 'restaurant';
  END IF;

  candidate := base_slug;

  WHILE EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.slug = candidate AND r.id <> p_id
  ) LOOP
    n := n + 1;
    candidate := base_slug || '-' || substr(p_id::text, 1, 6);
    IF n > 1 THEN
      candidate := base_slug || '-' || substr(p_id::text, 1, 6) || '-' || n::text;
    END IF;
  END LOOP;

  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_restaurant_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.slug IS NULL OR trim(NEW.slug) = '' THEN
    NEW.slug := public.make_restaurant_slug(NEW.name, NEW.id);
  ELSE
    NEW.slug := lower(trim(NEW.slug));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_restaurant_slug ON public.restaurants;
CREATE TRIGGER trg_set_restaurant_slug
BEFORE INSERT OR UPDATE OF name, slug ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.set_restaurant_slug();

-- Backfill existing restaurants that do not yet have a public slug.
UPDATE public.restaurants r
SET slug = public.make_restaurant_slug(r.name, r.id)
WHERE r.slug IS NULL OR trim(r.slug) = '';
