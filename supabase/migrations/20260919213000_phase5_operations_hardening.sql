-- Phase 5 Operations hardening. Safe for existing Anaira schema.
CREATE TABLE IF NOT EXISTS public.service_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 table_id uuid REFERENCES public.tables(id) ON DELETE SET NULL, room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
 customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL, request_type text NOT NULL, message text,
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','in_progress','completed','cancelled')),
 priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')), assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), acknowledged_at timestamptz, completed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_requests_restaurant_status ON public.service_requests(restaurant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_requests_assigned ON public.service_requests(assigned_to,status,created_at DESC);
CREATE TABLE IF NOT EXISTS public.reservation_guests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE, customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
 name text NOT NULL, phone text, email text, guest_count integer NOT NULL DEFAULT 1 CHECK (guest_count > 0), notes text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reservation_guests_reservation ON public.reservation_guests(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_guests_phone ON public.reservation_guests(restaurant_id,phone);
ALTER TABLE public.delivery_assignments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.delivery_assignments ADD COLUMN IF NOT EXISTS picked_up_at timestamptz;
ALTER TABLE public.delivery_assignments ADD COLUMN IF NOT EXISTS notes text;
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_restaurant_status ON public.delivery_assignments(restaurant_id,status,assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_rider ON public.delivery_assignments(rider_id,status,assigned_at DESC);
CREATE TABLE IF NOT EXISTS public.staff_shifts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, shift_date date NOT NULL DEFAULT current_date,
 start_at timestamptz NOT NULL, end_at timestamptz, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','absent','cancelled')),
 notes text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_restaurant_date ON public.staff_shifts(restaurant_id,shift_date,staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_staff_status ON public.staff_shifts(staff_id,status,shift_date DESC);
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS phase5_service_requests_scoped ON public.service_requests;
CREATE POLICY phase5_service_requests_scoped ON public.service_requests FOR ALL TO authenticated USING (public.is_restaurant_member(restaurant_id)) WITH CHECK (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS phase5_reservation_guests_scoped ON public.reservation_guests;
CREATE POLICY phase5_reservation_guests_scoped ON public.reservation_guests FOR ALL TO authenticated USING (public.is_restaurant_member(restaurant_id)) WITH CHECK (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS phase5_delivery_assignments_scoped ON public.delivery_assignments;
CREATE POLICY phase5_delivery_assignments_scoped ON public.delivery_assignments FOR ALL TO authenticated USING (public.is_restaurant_member(restaurant_id)) WITH CHECK (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS phase5_staff_shifts_scoped ON public.staff_shifts;
CREATE POLICY phase5_staff_shifts_scoped ON public.staff_shifts FOR ALL TO authenticated USING (public.is_restaurant_member(restaurant_id)) WITH CHECK (public.is_restaurant_member(restaurant_id));
CREATE OR REPLACE FUNCTION public.phase5_update_service_request(p_request_id uuid,p_status text,p_assigned_to uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v record; v_now timestamptz:=now(); BEGIN IF p_status NOT IN ('open','acknowledged','in_progress','completed','cancelled') THEN RAISE EXCEPTION 'Invalid service request status'; END IF; SELECT * INTO v FROM public.service_requests WHERE id=p_request_id FOR UPDATE; IF NOT FOUND OR NOT public.is_restaurant_member(v.restaurant_id) THEN RAISE EXCEPTION 'Request not found'; END IF; UPDATE public.service_requests SET status=p_status,assigned_to=COALESCE(p_assigned_to,assigned_to),acknowledged_at=CASE WHEN p_status IN ('acknowledged','in_progress','completed') THEN COALESCE(acknowledged_at,v_now) ELSE acknowledged_at END,completed_at=CASE WHEN p_status='completed' THEN COALESCE(completed_at,v_now) ELSE NULL END,updated_at=v_now WHERE id=p_request_id; RETURN (SELECT to_jsonb(sr) FROM public.service_requests sr WHERE sr.id=p_request_id); END; $$;
REVOKE ALL ON FUNCTION public.phase5_update_service_request(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase5_update_service_request(uuid,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.phase5_assign_delivery(p_order_id uuid,p_rider_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_order record; BEGIN SELECT o.id,o.restaurant_id INTO v_order FROM public.orders o WHERE o.id=p_order_id FOR UPDATE; IF NOT FOUND OR NOT public.is_restaurant_member(v_order.restaurant_id) THEN RAISE EXCEPTION 'Order not found'; END IF; IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_rider_id AND (p.restaurant_id=v_order.restaurant_id OR p.role='super_admin')) THEN RAISE EXCEPTION 'Rider does not belong to restaurant'; END IF; INSERT INTO public.delivery_assignments(restaurant_id,order_id,rider_id,status,assigned_at,updated_at) VALUES(v_order.restaurant_id,v_order.id,p_rider_id,'assigned',now(),now()) ON CONFLICT(order_id) DO UPDATE SET rider_id=EXCLUDED.rider_id,status='assigned',assigned_at=now(),updated_at=now(); RETURN (SELECT to_jsonb(d) FROM public.delivery_assignments d WHERE d.order_id=p_order_id); END; $$;
REVOKE ALL ON FUNCTION public.phase5_assign_delivery(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.phase5_assign_delivery(uuid,uuid) TO authenticated;
