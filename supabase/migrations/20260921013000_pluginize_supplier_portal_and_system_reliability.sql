BEGIN;
INSERT INTO public.plugin_catalog (code,name,icon,category,description,kind,active,sort_order) VALUES
('p1-supplier-portal','P1 Supplier Portal','📦','P1 Advanced Operations','Supplier-facing portal for RFQs, quotations and supplier collaboration.','feature',true,153),
('p0-system-reliability','P0 System Reliability','🛡️','P0 Core POS','Offline queue, retry state, sync conflicts, aggregator events and idempotency monitoring.','feature',true,26)
ON CONFLICT (code) DO UPDATE SET name=excluded.name,icon=excluded.icon,category=excluded.category,description=excluded.description,kind=excluded.kind,active=true,sort_order=excluded.sort_order;
CREATE TABLE IF NOT EXISTS public.p0_system_reliability_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,source_table text NOT NULL,source_id uuid,event_type text NOT NULL,severity text NOT NULL DEFAULT 'info' CHECK(severity IN ('info','warning','error','critical')),status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved','dismissed')),message text,payload jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz,resolved_by uuid);
CREATE INDEX IF NOT EXISTS idx_p0_sysrel_rest_created ON public.p0_system_reliability_events(restaurant_id,created_at DESC);
ALTER TABLE public.p0_system_reliability_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p0_sysrel_read ON public.p0_system_reliability_events;
CREATE POLICY p0_sysrel_read ON public.p0_system_reliability_events FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND (p.role='super_admin' OR p.restaurant_id=p0_system_reliability_events.restaurant_id)));
CREATE OR REPLACE FUNCTION public.p0_emit_reliability_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; sev text; msg text; sid uuid; et text; payload jsonb;
BEGIN
 IF TG_OP='DELETE' THEN rid:=OLD.restaurant_id; sid:=OLD.id; ELSE rid:=NEW.restaurant_id; sid:=NEW.id; END IF; IF rid IS NULL THEN RETURN COALESCE(NEW,OLD); END IF;
 et:=TG_TABLE_NAME||'.'||TG_OP;
 sev:=CASE WHEN TG_TABLE_NAME='p0_sync_conflicts' THEN 'warning' WHEN COALESCE(CASE WHEN TG_OP='DELETE' THEN OLD.status ELSE NEW.status END,'') IN ('failed','error','dead') THEN 'error' ELSE 'info' END;
 msg:=TG_TABLE_NAME||' '||lower(TG_OP); payload:=jsonb_build_object('operation',TG_OP,'table',TG_TABLE_NAME,'row',to_jsonb(CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END));
 INSERT INTO public.p0_system_reliability_events(restaurant_id,source_table,source_id,event_type,severity,message,payload) VALUES(rid,TG_TABLE_NAME,sid,et,sev,msg,payload); RETURN COALESCE(NEW,OLD); END $$;
DROP TRIGGER IF EXISTS trg_reliability_offline ON public.offline_pos_events; CREATE TRIGGER trg_reliability_offline AFTER INSERT OR UPDATE ON public.offline_pos_events FOR EACH ROW EXECUTE FUNCTION public.p0_emit_reliability_event();
DROP TRIGGER IF EXISTS trg_reliability_aggregator ON public.p0_aggregator_events; CREATE TRIGGER trg_reliability_aggregator AFTER INSERT OR UPDATE ON public.p0_aggregator_events FOR EACH ROW EXECUTE FUNCTION public.p0_emit_reliability_event();
DROP TRIGGER IF EXISTS trg_reliability_conflicts ON public.p0_sync_conflicts; CREATE TRIGGER trg_reliability_conflicts AFTER INSERT OR UPDATE ON public.p0_sync_conflicts FOR EACH ROW EXECUTE FUNCTION public.p0_emit_reliability_event();
DROP TRIGGER IF EXISTS trg_reliability_idempotency ON public.p0_idempotency_keys; CREATE TRIGGER trg_reliability_idempotency AFTER INSERT OR UPDATE ON public.p0_idempotency_keys FOR EACH ROW EXECUTE FUNCTION public.p0_emit_reliability_event();
DO $$ BEGIN BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.p0_system_reliability_events; EXCEPTION WHEN duplicate_object THEN NULL; END; END $$;
REVOKE ALL ON FUNCTION public.p0_emit_reliability_event() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.p0_emit_reliability_event() TO service_role;
COMMIT;
