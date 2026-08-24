-- WhatsApp Cloud API Pro runtime: outbound/inbound/status audit log.
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('outbound','inbound')),
  recipient text,
  sender text,
  message_type text,
  template_name text,
  wamid text,
  status text,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_restaurant_created
  ON public.whatsapp_messages(restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wamid
  ON public.whatsapp_messages(wamid);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_messages_super_admin" ON public.whatsapp_messages;
CREATE POLICY "whatsapp_messages_super_admin"
ON public.whatsapp_messages
FOR ALL TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());
