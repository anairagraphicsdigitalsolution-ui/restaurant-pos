-- Anaira: production fix for Super Admin subscription activation.
-- Root cause: subscription activation fired sync_platform_marketing_subscription(),
-- which inserted NULL revenue when the restaurant had no marketing lead.
-- platform_marketing_attribution.revenue is NOT NULL, so activation rolled back.
-- Keep activation independent of marketing attribution data.

CREATE OR REPLACE FUNCTION public.sync_platform_marketing_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead record;
  v_revenue numeric(14,2) := 0;
BEGIN
  IF lower(coalesce(NEW.status,'')) NOT IN ('active','past_due') THEN
    RETURN NEW;
  END IF;

  SELECT l.*
  INTO v_lead
  FROM public.platform_marketing_leads l
  WHERE l.restaurant_id = NEW.restaurant_id
  ORDER BY l.created_at DESC
  LIMIT 1;

  SELECT COALESCE(sp.monthly_price,0)::numeric(14,2)
  INTO v_revenue
  FROM public.saas_plans sp
  WHERE sp.id = NEW.saas_plan_id;

  INSERT INTO public.platform_marketing_attribution
    (campaign_id, lead_id, restaurant_id, subscription_id, stage, revenue)
  VALUES
    (v_lead.campaign_id,
     v_lead.id,
     NEW.restaurant_id,
     NEW.id,
     CASE
       WHEN lower(coalesce(NEW.status,'')) = 'active' THEN 'subscribed'
       ELSE 'past_due'
     END,
     COALESCE(v_revenue,0))
  ON CONFLICT (subscription_id)
  DO UPDATE SET
    stage = EXCLUDED.stage,
    revenue = EXCLUDED.revenue,
    campaign_id = COALESCE(EXCLUDED.campaign_id, platform_marketing_attribution.campaign_id),
    lead_id = COALESCE(EXCLUDED.lead_id, platform_marketing_attribution.lead_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_marketing_subscription
ON public.restaurant_subscriptions;

CREATE TRIGGER trg_platform_marketing_subscription
AFTER INSERT OR UPDATE OF status, plan_id
ON public.restaurant_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.sync_platform_marketing_subscription();
