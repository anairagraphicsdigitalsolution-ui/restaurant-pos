CREATE TABLE IF NOT EXISTS public.p0_h1c_test_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 restaurant_id uuid NOT NULL,
 provider text NOT NULL,
 test_type text NOT NULL CHECK (test_type IN ('webhook','action','retry','dedupe','reconciliation')),
 status text NOT NULL DEFAULT 'passed' CHECK (status IN ('passed','failed')),
 external_id text,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_p0_h1c_test_runs_restaurant_created ON public.p0_h1c_test_runs(restaurant_id,created_at DESC);
ALTER TABLE public.p0_h1c_test_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p0_h1c_test_runs_member ON public.p0_h1c_test_runs;
CREATE POLICY p0_h1c_test_runs_member ON public.p0_h1c_test_runs FOR SELECT USING (public.is_restaurant_member(restaurant_id) OR public.is_super_admin());
CREATE OR REPLACE FUNCTION public.p0_h1c_record_test_run(p_restaurant_id uuid,p_provider text,p_test_type text,p_status text,p_external_id text DEFAULT NULL,p_details jsonb DEFAULT '{}'::jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 IF NOT (public.is_restaurant_member(p_restaurant_id) OR public.is_super_admin()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 INSERT INTO public.p0_h1c_test_runs(restaurant_id,provider,test_type,status,external_id,details) VALUES(p_restaurant_id,p_provider,p_test_type,p_status,p_external_id,coalesce(p_details,'{}'::jsonb)) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.p0_h1c_record_test_run(uuid,text,text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p0_h1c_record_test_run(uuid,text,text,text,text,jsonb) TO authenticated,service_role;
