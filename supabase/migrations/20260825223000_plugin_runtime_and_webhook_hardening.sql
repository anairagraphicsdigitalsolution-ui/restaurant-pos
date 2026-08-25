-- Canonical 20260825223000 migration. This version is already applied on the remote database.
-- Keep the local filename/content aligned with the remote migration history.
BEGIN;

INSERT INTO public.plugin_catalog(code,name,icon,category,description,kind,sort_order,active)
VALUES
  ('pos','POS Runtime','🧾','POS','Database-backed POS runtime used by plugin execution and existing Core POS flows.','feature',11,true)
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name,
  description=excluded.description,
  active=true;

CREATE INDEX IF NOT EXISTS idx_aggregator_integrations_provider_outlet
  ON public.aggregator_integrations(provider,outlet_code,active);

CREATE INDEX IF NOT EXISTS idx_aggregator_orders_external_lookup
  ON public.aggregator_orders(restaurant_id,provider,external_order_id);

COMMENT ON TABLE public.aggregator_integrations IS
  'Future-ready restaurant aggregator integrations. Credentials are server-side; integration stays inactive until required credentials are configured.';
COMMIT;
