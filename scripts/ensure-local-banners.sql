CREATE TABLE IF NOT EXISTS public.restaurant_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid,
  image_url text,
  sort_order integer DEFAULT 4,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT restaurant_banners_restaurant_id_fkey
    FOREIGN KEY (restaurant_id)
    REFERENCES public.restaurants(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_restaurant_banners_restaurant
ON public.restaurant_banners(restaurant_id);

DROP TRIGGER IF EXISTS anaira_sync_capture
ON public.restaurant_banners;

CREATE TRIGGER anaira_sync_capture
AFTER INSERT OR DELETE OR UPDATE
ON public.restaurant_banners
FOR EACH ROW
EXECUTE FUNCTION public.anaira_sync_capture();
