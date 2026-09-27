CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 name text NOT NULL, channel text NOT NULL CHECK(channel IN ('whatsapp','sms','email','push','in_app')),
 campaign_type text NOT NULL DEFAULT 'broadcast' CHECK(campaign_type IN ('broadcast','birthday','winback','loyalty','promotion','reservation','custom')),
 segment_id uuid REFERENCES public.customer_segments(id) ON DELETE SET NULL, subject text, message_template text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','running','completed','cancelled')),
 scheduled_at timestamptz, started_at timestamptz, completed_at timestamptz, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.marketing_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE, customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
 channel text NOT NULL, recipient text, rendered_message text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sent','delivered','failed','skipped')),
 provider_message_id text, error_message text, sent_at timestamptz, delivered_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.marketing_automations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 name text NOT NULL, trigger_type text NOT NULL CHECK(trigger_type IN ('birthday','winback','first_order','loyalty_milestone','reservation_reminder','inactive_customer')),
 channel text NOT NULL CHECK(channel IN ('whatsapp','sms','email','push','in_app')), delay_days integer NOT NULL DEFAULT 0,
 message_template text NOT NULL, active boolean NOT NULL DEFAULT true, last_run_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON public.marketing_campaigns(restaurant_id,status,scheduled_at);
CREATE INDEX IF NOT EXISTS idx_marketing_messages_campaign ON public.marketing_messages(restaurant_id,campaign_id,status);
CREATE INDEX IF NOT EXISTS idx_marketing_messages_customer ON public.marketing_messages(restaurant_id,customer_id,created_at);
CREATE INDEX IF NOT EXISTS idx_marketing_automations_active ON public.marketing_automations(restaurant_id,active,trigger_type);
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketing_campaign_access ON public.marketing_campaigns FOR ALL TO authenticated USING(public.is_super_admin() OR public.is_restaurant_member(restaurant_id)) WITH CHECK(public.is_super_admin() OR public.is_restaurant_member(restaurant_id));
CREATE POLICY marketing_message_access ON public.marketing_messages FOR ALL TO authenticated USING(public.is_super_admin() OR public.is_restaurant_member(restaurant_id)) WITH CHECK(public.is_super_admin() OR public.is_restaurant_member(restaurant_id));
CREATE POLICY marketing_automation_access ON public.marketing_automations FOR ALL TO authenticated USING(public.is_super_admin() OR public.is_restaurant_member(restaurant_id)) WITH CHECK(public.is_super_admin() OR public.is_restaurant_member(restaurant_id));
CREATE OR REPLACE FUNCTION public.p1_7_build_campaign_audience(p_restaurant_id uuid,p_campaign_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.marketing_campaigns%rowtype; cust record; rendered text; recipient text; queued_count integer:=0; skipped_count integer:=0;
BEGIN
IF NOT(auth.role()='service_role' OR public.is_super_admin() OR public.is_restaurant_member(p_restaurant_id)) THEN RAISE EXCEPTION 'Restaurant access denied'; END IF;
SELECT * INTO c FROM public.marketing_campaigns WHERE id=p_campaign_id AND restaurant_id=p_restaurant_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;
FOR cust IN SELECT * FROM public.customers x WHERE x.restaurant_id=p_restaurant_id AND x.marketing_opt_in=true AND ((c.channel='whatsapp' AND x.whatsapp_opt_in=true) OR c.channel<>'whatsapp') AND (c.segment_id IS NULL OR EXISTS(SELECT 1 FROM public.customer_segments s WHERE s.id=c.segment_id AND s.restaurant_id=p_restaurant_id AND s.active=true)) LOOP
recipient:=CASE WHEN c.channel IN ('whatsapp','sms') THEN cust.phone ELSE cust.email END;
IF recipient IS NULL OR recipient='' THEN skipped_count:=skipped_count+1; CONTINUE; END IF;
rendered:=replace(replace(replace(c.message_template,'{{name}}',coalesce(cust.name,'Customer')),'{{points}}',cust.loyalty_points::text),'{{orders}}',cust.total_orders::text);
INSERT INTO public.marketing_messages(restaurant_id,campaign_id,customer_id,channel,recipient,rendered_message) VALUES(p_restaurant_id,c.id,cust.id,c.channel,recipient,rendered);
queued_count:=queued_count+1;
END LOOP;
UPDATE public.marketing_campaigns SET status='scheduled',updated_at=now() WHERE id=c.id;
RETURN jsonb_build_object('success',true,'queued',queued_count,'skipped',skipped_count);
END $$;
REVOKE ALL ON FUNCTION public.p1_7_build_campaign_audience(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.p1_7_build_campaign_audience(uuid,uuid) TO authenticated,service_role;
