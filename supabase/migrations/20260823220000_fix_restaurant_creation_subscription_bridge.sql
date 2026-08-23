-- Anaira POS: fix restaurant onboarding + subscription bridge.
-- A newly-created restaurant is intentionally PENDING until Super Admin approves a plan.
-- Legacy databases may have restaurant_subscriptions.plan_id marked NOT NULL and pointing
-- to the old public.plans table. The current application uses saas_plan_id -> saas_plans.
-- Keep the legacy column for compatibility, but allow it to be NULL for pending records.

ALTER TABLE public.restaurant_subscriptions
  ADD COLUMN IF NOT EXISTS saas_plan_id uuid
  REFERENCES public.saas_plans(id)
  ON DELETE SET NULL;

ALTER TABLE public.restaurant_subscriptions
  ALTER COLUMN plan_id DROP NOT NULL;

-- Pending subscriptions do not have a start date until approval.
ALTER TABLE public.restaurant_subscriptions
  ALTER COLUMN starts_at DROP NOT NULL;

-- Backfill the new SaaS plan bridge where an old plan can be matched by name.
DO $$
BEGIN
  IF to_regclass('public.plans') IS NOT NULL THEN
    UPDATE public.restaurant_subscriptions rs
    SET saas_plan_id = sp.id
    FROM public.plans oldp
    JOIN public.saas_plans sp
      ON lower(trim(sp.name)) = lower(trim(oldp.name))
    WHERE rs.saas_plan_id IS NULL
      AND rs.plan_id = oldp.id;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_restaurant_subscriptions_saas_plan
  ON public.restaurant_subscriptions(saas_plan_id);

-- Pending subscriptions are valid without a selected plan.
-- Active subscriptions must have a SaaS plan.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'restaurant_subscriptions_active_requires_plan'
      AND conrelid = 'public.restaurant_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.restaurant_subscriptions
      ADD CONSTRAINT restaurant_subscriptions_active_requires_plan
      CHECK (status <> 'active' OR saas_plan_id IS NOT NULL);
  END IF;
END $$;
