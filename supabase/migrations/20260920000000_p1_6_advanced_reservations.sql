-- P1.6 Advanced Reservations
-- Applied to connected Supabase project. Existing reservation data preserved.
ALTER TABLE public.reservation_waitlist ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.reservation_waitlist ADD COLUMN IF NOT EXISTS preferred_start_at timestamptz;
ALTER TABLE public.reservation_waitlist ADD COLUMN IF NOT EXISTS preferred_end_at timestamptz;
ALTER TABLE public.reservation_waitlist ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100;
ALTER TABLE public.reservation_waitlist ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS public.reservation_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE, event_type text NOT NULL,
 old_status text, new_status text, message text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_res_waitlist_slot ON public.reservation_waitlist(restaurant_id,preferred_date,status,priority,created_at);
CREATE INDEX IF NOT EXISTS idx_res_events_reservation ON public.reservation_events(restaurant_id,reservation_id,created_at);
CREATE INDEX IF NOT EXISTS idx_reservations_slot_status ON public.reservations(restaurant_id,reservation_start_at,reservation_end_at,status);
ALTER TABLE public.reservation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY reservation_events_access ON public.reservation_events FOR ALL TO authenticated USING(public.is_super_admin() OR public.is_restaurant_member(restaurant_id)) WITH CHECK(public.is_super_admin() OR public.is_restaurant_member(restaurant_id));
-- RPC definitions are deployed in the connected Supabase project as part of P1.6.
