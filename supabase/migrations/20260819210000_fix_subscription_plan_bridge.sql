-- Anaira POS: bridge legacy POS plans to the new SaaS subscription plans.
-- Safe migration: keeps the existing restaurant_subscriptions.plan_id column
-- untouched because it may already reference public.plans in older projects.
-- New SaaS subscription linkage is stored in saas_plan_id.

ALTER TABLE public.restaurant_subscriptions
  ADD COLUMN IF NOT EXISTS saas_plan_id uuid
  REFERENCES public.saas_plans(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_saas_plan
  ON public.restaurant_subscriptions(saas_plan_id);

-- Existing saas_plan_id values are preserved.
-- The legacy public.plans table is not part of the clean migration history,
-- so this migration intentionally does not reference it.
-- Existing production rows are migrated separately only when a valid
-- saas_plan_id is already present.
-- Keep feature checks on the new SaaS relationship.
CREATE OR REPLACE FUNCTION public.has_restaurant_plan_feature(
  p_restaurant_id uuid,
  p_plugin_code text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_plan public.saas_plans%ROWTYPE;
  v_code text := lower(trim(coalesce(p_plugin_code, '')));
BEGIN
  SELECT status INTO v_status
  FROM public.restaurants
  WHERE id = p_restaurant_id;

  IF COALESCE(v_status, 'inactive') <> 'active' THEN
    RETURN false;
  END IF;

  SELECT sp.* INTO v_plan
  FROM public.restaurant_subscriptions rs
  JOIN public.saas_plans sp ON sp.id = rs.saas_plan_id
  WHERE rs.restaurant_id = p_restaurant_id
    AND rs.status = 'active'
    AND sp.active = true
    AND (rs.starts_at IS NULL OR rs.starts_at <= now())
    AND (rs.ends_at IS NULL OR rs.ends_at >= now())
  ORDER BY rs.updated_at DESC NULLS LAST, rs.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  CASE v_code
    WHEN 'pos' THEN RETURN true;
    WHEN 'billing' THEN RETURN true;
    WHEN 'qr-menu' THEN RETURN COALESCE(v_plan.qr_ordering, false);
    WHEN 'loyalty' THEN RETURN COALESCE(v_plan.loyalty, false);
    WHEN 'offers' THEN RETURN COALESCE(v_plan.offers, false);
    WHEN 'analytics' THEN RETURN COALESCE(v_plan.analytics, false);
    WHEN 'reservations' THEN RETURN COALESCE(v_plan.reservations, false);
    WHEN 'whatsapp' THEN RETURN COALESCE(v_plan.whatsapp, false);
    ELSE RETURN false;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.has_restaurant_plan_feature(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_restaurant_plan_feature(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_restaurant_plan_feature(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_restaurant_plan(p_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'subscription', to_jsonb(rs),
    'plan', to_jsonb(sp)
  )
  INTO v_result
  FROM public.restaurant_subscriptions rs
  LEFT JOIN public.saas_plans sp ON sp.id = rs.saas_plan_id
  WHERE rs.restaurant_id = p_restaurant_id
  ORDER BY rs.updated_at DESC NULLS LAST, rs.created_at DESC
  LIMIT 1;

  RETURN COALESCE(v_result, jsonb_build_object('subscription', null, 'plan', null));
END;
$$;

REVOKE ALL ON FUNCTION public.get_restaurant_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_restaurant_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_plan(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_restaurant_status_from_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.saas_plan_id IS NOT NULL THEN
    UPDATE public.restaurants
    SET status = 'active'
    WHERE id = NEW.restaurant_id;
  ELSIF NEW.status IN ('pending','past_due','cancelled','expired') THEN
    UPDATE public.restaurants
    SET status = 'inactive'
    WHERE id = NEW.restaurant_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_restaurant_subscription_status ON public.restaurant_subscriptions;
CREATE TRIGGER trg_sync_restaurant_subscription_status
AFTER INSERT OR UPDATE OF status, saas_plan_id, starts_at, ends_at
ON public.restaurant_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.sync_restaurant_status_from_subscription();
