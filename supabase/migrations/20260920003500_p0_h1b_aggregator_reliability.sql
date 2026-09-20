-- P0-H1-B Aggregator Reliability: retry/backoff/dead-letter/worker claim
ALTER TABLE public.aggregator_provider_actions
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by text;

ALTER TABLE public.aggregator_menu_sync_jobs
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by text;

CREATE INDEX IF NOT EXISTS idx_aggregator_actions_retry
ON public.aggregator_provider_actions(status,next_retry_at,created_at)
WHERE status='failed' AND dead_lettered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_aggregator_menu_retry
ON public.aggregator_menu_sync_jobs(status,next_retry_at,created_at)
WHERE status='failed' AND dead_lettered_at IS NULL;

CREATE OR REPLACE FUNCTION public.p0_h1b_claim_aggregator_action(p_worker_id text,p_limit integer DEFAULT 10)
RETURNS SETOF public.aggregator_provider_actions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id FROM public.aggregator_provider_actions
    WHERE status='failed' AND dead_lettered_at IS NULL
      AND attempts < max_attempts
      AND (next_retry_at IS NULL OR next_retry_at <= now())
    ORDER BY created_at FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1,LEAST(COALESCE(p_limit,10),50))
  )
  UPDATE public.aggregator_provider_actions a
  SET status='processing',claimed_at=now(),claimed_by=p_worker_id,attempts=a.attempts+1,updated_at=now()
  FROM candidates c WHERE a.id=c.id RETURNING a.*;
END $$;

CREATE OR REPLACE FUNCTION public.p0_h1b_record_aggregator_action_failure(p_action_id uuid,p_error text,p_retry boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.aggregator_provider_actions%rowtype; delay_seconds integer;
BEGIN
  SELECT * INTO a FROM public.aggregator_provider_actions WHERE id=p_action_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aggregator action not found'; END IF;
  IF p_retry AND a.attempts < a.max_attempts THEN
    delay_seconds := LEAST(1800,GREATEST(15,15*(2^GREATEST(a.attempts-1,0))));
    UPDATE public.aggregator_provider_actions SET status='failed',error_message=left(coalesce(p_error,'Unknown provider error'),2000),next_retry_at=now()+make_interval(secs=>delay_seconds),claimed_at=NULL,claimed_by=NULL,updated_at=now() WHERE id=a.id RETURNING * INTO a;
  ELSE
    UPDATE public.aggregator_provider_actions SET status='failed',dead_lettered_at=coalesce(dead_lettered_at,now()),error_message=left(coalesce(p_error,'Unknown provider error'),2000),next_retry_at=NULL,claimed_at=NULL,claimed_by=NULL,updated_at=now() WHERE id=a.id RETURNING * INTO a;
  END IF;
  RETURN jsonb_build_object('success',true,'status',a.status,'attempts',a.attempts,'next_retry_at',a.next_retry_at,'dead_lettered_at',a.dead_lettered_at);
END $$;

CREATE OR REPLACE FUNCTION public.p0_h1b_claim_menu_sync(p_worker_id text,p_limit integer DEFAULT 5)
RETURNS SETOF public.aggregator_menu_sync_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id FROM public.aggregator_menu_sync_jobs
    WHERE status='failed' AND dead_lettered_at IS NULL AND attempts < max_attempts
      AND (next_retry_at IS NULL OR next_retry_at <= now())
    ORDER BY created_at FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1,LEAST(COALESCE(p_limit,5),25))
  )
  UPDATE public.aggregator_menu_sync_jobs j
  SET status='running',claimed_at=now(),claimed_by=p_worker_id,attempts=j.attempts+1,started_at=coalesce(j.started_at,now())
  FROM candidates c WHERE j.id=c.id RETURNING j.*;
END $$;

REVOKE ALL ON FUNCTION public.p0_h1b_claim_aggregator_action(text,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.p0_h1b_record_aggregator_action_failure(uuid,text,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.p0_h1b_claim_menu_sync(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p0_h1b_claim_aggregator_action(text,integer) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.p0_h1b_record_aggregator_action_failure(uuid,text,boolean) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.p0_h1b_claim_menu_sync(text,integer) TO authenticated,service_role;
