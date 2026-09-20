-- Monthly offer/combo limits controlled by the SaaS plan.
-- NULL limit = unlimited. 0 = no new offers.
CREATE TABLE IF NOT EXISTS public.plan_feature_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  plugin_code text NOT NULL,
  monthly_limit integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id, plugin_code),
  CHECK (monthly_limit IS NULL OR monthly_limit >= 0)
);

ALTER TABLE public.plan_feature_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_feature_limits_select_superadmin ON public.plan_feature_limits;
CREATE POLICY plan_feature_limits_select_superadmin
ON public.plan_feature_limits FOR SELECT TO authenticated
USING (public.is_super_admin());

DROP POLICY IF EXISTS plan_feature_limits_manage_superadmin ON public.plan_feature_limits;
CREATE POLICY plan_feature_limits_manage_superadmin
ON public.plan_feature_limits FOR ALL TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.check_monthly_offer_limit(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_limit integer;
  v_used integer;
BEGIN
  SELECT COALESCE(rs.saas_plan_id, rs.plan_id)
    INTO v_plan_id
  FROM public.restaurant_subscriptions rs
  WHERE rs.restaurant_id = p_restaurant_id
    AND rs.status IN ('trial','active')
  ORDER BY rs.updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RETURN true;
  END IF;

  SELECT monthly_limit
    INTO v_limit
  FROM public.plan_feature_limits
  WHERE plan_id = v_plan_id
    AND plugin_code = 'offers';

  IF NOT FOUND OR v_limit IS NULL THEN
    RETURN true;
  END IF;

  SELECT COUNT(*)::integer
    INTO v_used
  FROM public.offers
  WHERE restaurant_id = p_restaurant_id
    AND created_at >= date_trunc('month', now())
    AND created_at < date_trunc('month', now()) + interval '1 month';

  RETURN v_used < v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_monthly_offer_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NOT public.check_monthly_offer_limit(NEW.restaurant_id) THEN
    RAISE EXCEPTION 'Monthly offer limit reached for this restaurant plan';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_monthly_offer_limit ON public.offers;
CREATE TRIGGER trg_monthly_offer_limit
BEFORE INSERT ON public.offers
FOR EACH ROW
EXECUTE FUNCTION public.enforce_monthly_offer_limit();

GRANT EXECUTE ON FUNCTION public.check_monthly_offer_limit(uuid) TO authenticated, service_role;
