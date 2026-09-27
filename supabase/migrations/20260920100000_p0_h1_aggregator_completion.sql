-- P0-H1 Aggregator Completion
CREATE TABLE IF NOT EXISTS public.aggregator_provider_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 integration_id uuid REFERENCES public.aggregator_integrations(id) ON DELETE SET NULL, aggregator_order_id uuid REFERENCES public.aggregator_orders(id) ON DELETE SET NULL,
 provider text NOT NULL, external_order_id text, action text NOT NULL CHECK(action IN ('accept','reject','prepare','ready','picked_up','cancel','sync_menu','sync_availability','sync_order')),
 idempotency_key text NOT NULL, status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','succeeded','failed')),
 request_payload jsonb NOT NULL DEFAULT '{}'::jsonb, response_payload jsonb NOT NULL DEFAULT '{}'::jsonb, error_message text,
 attempts integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(restaurant_id,provider,idempotency_key)
);
CREATE TABLE IF NOT EXISTS public.aggregator_menu_sync_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 integration_id uuid REFERENCES public.aggregator_integrations(id) ON DELETE CASCADE, provider text NOT NULL,
 sync_type text NOT NULL CHECK(sync_type IN ('full','incremental','availability')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed')),
 requested_version integer, external_version text, payload jsonb NOT NULL DEFAULT '{}'::jsonb, error_message text,
 created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz
);
ALTER TABLE public.aggregator_item_mappings ADD COLUMN IF NOT EXISTS variant_external_id text;
ALTER TABLE public.aggregator_item_mappings ADD COLUMN IF NOT EXISTS option_mappings jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.aggregator_item_mappings ADD COLUMN IF NOT EXISTS external_price numeric;
ALTER TABLE public.aggregator_item_mappings ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
ALTER TABLE public.aggregator_orders ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE public.aggregator_orders ADD COLUMN IF NOT EXISTS provider_status text;
ALTER TABLE public.aggregator_orders ADD COLUMN IF NOT EXISTS last_provider_sync_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS uq_aggregator_order_provider_external ON public.aggregator_orders(restaurant_id,provider,external_order_id);
CREATE INDEX IF NOT EXISTS idx_aggregator_actions_status ON public.aggregator_provider_actions(restaurant_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_aggregator_actions_order ON public.aggregator_provider_actions(restaurant_id,aggregator_order_id,created_at);
CREATE INDEX IF NOT EXISTS idx_aggregator_menu_sync_status ON public.aggregator_menu_sync_jobs(restaurant_id,status,created_at);
ALTER TABLE public.aggregator_provider_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregator_menu_sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY aggregator_provider_actions_access ON public.aggregator_provider_actions FOR ALL TO authenticated USING(public.is_super_admin() OR public.is_restaurant_member(restaurant_id)) WITH CHECK(public.is_super_admin() OR public.is_restaurant_member(restaurant_id));
CREATE POLICY aggregator_menu_sync_access ON public.aggregator_menu_sync_jobs FOR ALL TO authenticated USING(public.is_super_admin() OR public.is_restaurant_member(restaurant_id)) WITH CHECK(public.is_super_admin() OR public.is_restaurant_member(restaurant_id));
CREATE OR REPLACE FUNCTION public.p0_h1_queue_aggregator_action(p_restaurant_id uuid,p_provider text,p_action text,p_idempotency_key text,p_integration_id uuid DEFAULT NULL,p_aggregator_order_id uuid DEFAULT NULL,p_external_order_id text DEFAULT NULL,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.aggregator_provider_actions%rowtype;
BEGIN
IF NOT(auth.role()='service_role' OR public.is_super_admin() OR public.is_restaurant_member(p_restaurant_id)) THEN RAISE EXCEPTION 'Restaurant access denied'; END IF;
IF p_action NOT IN ('accept','reject','prepare','ready','picked_up','cancel','sync_menu','sync_availability','sync_order') THEN RAISE EXCEPTION 'Invalid aggregator action'; END IF;
IF p_idempotency_key IS NULL OR p_idempotency_key='' THEN RAISE EXCEPTION 'Idempotency key required'; END IF;
INSERT INTO public.aggregator_provider_actions(restaurant_id,integration_id,aggregator_order_id,provider,external_order_id,action,idempotency_key,request_payload)
VALUES(p_restaurant_id,p_integration_id,p_aggregator_order_id,p_provider,p_external_order_id,p_action,p_idempotency_key,coalesce(p_payload,'{}'::jsonb))
ON CONFLICT(restaurant_id,provider,idempotency_key) DO UPDATE SET updated_at=now()
RETURNING * INTO a;
RETURN jsonb_build_object('success',true,'action_id',a.id,'status',a.status);
END $$;
REVOKE ALL ON FUNCTION public.p0_h1_queue_aggregator_action(uuid,text,text,text,uuid,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p0_h1_queue_aggregator_action(uuid,text,text,text,uuid,uuid,text,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.p0_h1_update_aggregator_order_status(p_restaurant_id uuid,p_aggregator_order_id uuid,p_status text,p_provider_status text DEFAULT NULL,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.aggregator_orders%rowtype; now_ts timestamptz:=now();
BEGIN
IF NOT(auth.role()='service_role' OR public.is_super_admin() OR public.is_restaurant_member(p_restaurant_id)) THEN RAISE EXCEPTION 'Restaurant access denied'; END IF;
IF p_status NOT IN ('new','accepted','preparing','ready','picked_up','rejected','cancelled','failed') THEN RAISE EXCEPTION 'Invalid aggregator order status'; END IF;
SELECT * INTO a FROM public.aggregator_orders WHERE id=p_aggregator_order_id AND restaurant_id=p_restaurant_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Aggregator order not found'; END IF;
UPDATE public.aggregator_orders SET status=p_status,provider_status=coalesce(p_provider_status,provider_status),cancellation_reason=CASE WHEN p_status IN ('cancelled','rejected') THEN p_reason ELSE cancellation_reason END,accepted_at=CASE WHEN p_status='accepted' AND accepted_at IS NULL THEN now_ts ELSE accepted_at END,ready_at=CASE WHEN p_status='ready' AND ready_at IS NULL THEN now_ts ELSE ready_at END,picked_up_at=CASE WHEN p_status='picked_up' AND picked_up_at IS NULL THEN now_ts ELSE picked_up_at END,rejected_at=CASE WHEN p_status='rejected' AND rejected_at IS NULL THEN now_ts ELSE rejected_at END,last_provider_sync_at=now_ts,updated_at=now_ts WHERE id=a.id RETURNING * INTO a;
RETURN jsonb_build_object('success',true,'aggregator_order_id',a.id,'status',a.status);
END $$;
REVOKE ALL ON FUNCTION public.p0_h1_update_aggregator_order_status(uuid,uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p0_h1_update_aggregator_order_status(uuid,uuid,text,text,text) TO authenticated,service_role;
