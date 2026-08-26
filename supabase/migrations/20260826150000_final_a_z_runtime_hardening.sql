-- Normalize any legacy contradictory theme permission state before runtime use.
UPDATE public.plugin_settings
SET config=jsonb_set(COALESCE(config,'{}'::jsonb),'{admin_theme_change_scope}',
  CASE WHEN COALESCE((config->>'allow_admin_theme_changes')::boolean,false)
       AND lower(COALESCE(config->>'admin_theme_change_scope','none'))='none'
       THEN '"both"'::jsonb
       WHEN NOT COALESCE((config->>'allow_admin_theme_changes')::boolean,false) THEN '"none"'::jsonb
       ELSE to_jsonb(lower(COALESCE(config->>'admin_theme_change_scope','both'))) END,true)
WHERE plugin_code='restaurant-settings';

-- Final A-Z runtime hardening. Non-destructive.
CREATE OR REPLACE FUNCTION public.has_staff_permission(p_staff_id uuid,p_permission_key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT COALESCE((SELECT sp.enabled FROM public.staff_permissions sp WHERE sp.staff_id=p_staff_id AND sp.restaurant_id=public.current_restaurant_id() AND sp.permission_key=lower(trim(p_permission_key)) LIMIT 1),false); $$;
GRANT EXECUTE ON FUNCTION public.has_staff_permission(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.prevent_closed_cash_closing_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE actor_role text; BEGIN IF OLD.closed_at IS NOT NULL THEN SELECT role INTO actor_role FROM public.profiles WHERE id=auth.uid(); IF COALESCE(actor_role,'') NOT IN ('admin','super_admin') THEN RAISE EXCEPTION 'Cash closing is locked after close'; END IF; IF OLD.business_date=NEW.business_date AND OLD.restaurant_id=NEW.restaurant_id AND OLD.closed_at=NEW.closed_at THEN RAISE EXCEPTION 'Cash closing is locked. Reopen it before correction.'; END IF; END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_prevent_closed_cash_closing_update ON public.cash_closings;
CREATE TRIGGER trg_prevent_closed_cash_closing_update BEFORE UPDATE ON public.cash_closings FOR EACH ROW EXECUTE FUNCTION public.prevent_closed_cash_closing_update();

CREATE OR REPLACE FUNCTION public.reopen_cash_closing(p_restaurant_id uuid,p_business_date date,p_reason text DEFAULT 'Admin correction') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE actor_role text; v_id uuid; BEGIN SELECT role INTO actor_role FROM public.profiles WHERE id=auth.uid(); IF actor_role NOT IN ('admin','super_admin') THEN RAISE EXCEPTION 'Only Admin or Super Admin can reopen cash closing'; END IF; SELECT id INTO v_id FROM public.cash_closings WHERE restaurant_id=p_restaurant_id AND business_date=p_business_date LIMIT 1; IF v_id IS NULL THEN RAISE EXCEPTION 'Cash closing not found'; END IF; UPDATE public.cash_closings SET closed_at=NULL,closed_by=NULL,difference=NULL,actual_cash=0 WHERE id=v_id; BEGIN INSERT INTO public.pos_audit_events(restaurant_id,actor_id,action,entity_type,entity_id,reason) VALUES(p_restaurant_id,auth.uid(),'cash_closing.reopened','cash_closing',v_id,p_reason); EXCEPTION WHEN undefined_table THEN NULL; END; RETURN jsonb_build_object('success',true,'business_date',p_business_date); END; $$;
GRANT EXECUTE ON FUNCTION public.reopen_cash_closing(uuid,date,text) TO authenticated,service_role;

DROP POLICY IF EXISTS expenses_insert_feature ON public.expenses; DROP POLICY IF EXISTS expenses_update_feature ON public.expenses; DROP POLICY IF EXISTS expenses_delete_feature ON public.expenses;
CREATE POLICY expenses_insert_feature ON public.expenses FOR INSERT TO authenticated WITH CHECK (public.is_restaurant_member(restaurant_id) AND public.is_restaurant_feature_enabled(restaurant_id,'expenses') AND (public.is_admin() OR public.has_staff_permission(auth.uid(),'expenses')));
CREATE POLICY expenses_update_feature ON public.expenses FOR UPDATE TO authenticated USING (public.is_restaurant_member(restaurant_id) AND public.is_restaurant_feature_enabled(restaurant_id,'expenses') AND (public.is_admin() OR public.has_staff_permission(auth.uid(),'expenses'))) WITH CHECK (public.is_restaurant_member(restaurant_id) AND public.is_restaurant_feature_enabled(restaurant_id,'expenses') AND (public.is_admin() OR public.has_staff_permission(auth.uid(),'expenses')));
CREATE POLICY expenses_delete_feature ON public.expenses FOR DELETE TO authenticated USING (public.is_restaurant_member(restaurant_id) AND public.is_restaurant_feature_enabled(restaurant_id,'expenses') AND (public.is_admin() OR public.has_staff_permission(auth.uid(),'expenses')));

DROP POLICY IF EXISTS cash_closing_insert_feature ON public.cash_closings; DROP POLICY IF EXISTS cash_closing_update_feature ON public.cash_closings;
CREATE POLICY cash_closing_insert_feature ON public.cash_closings FOR INSERT TO authenticated WITH CHECK (public.is_restaurant_member(restaurant_id) AND public.is_restaurant_feature_enabled(restaurant_id,'cash-closing') AND (public.is_admin() OR public.has_staff_permission(auth.uid(),'cash-closing')));
CREATE POLICY cash_closing_update_feature ON public.cash_closings FOR UPDATE TO authenticated USING (public.is_restaurant_member(restaurant_id) AND public.is_restaurant_feature_enabled(restaurant_id,'cash-closing') AND (public.is_admin() OR public.has_staff_permission(auth.uid(),'cash-closing'))) WITH CHECK (public.is_restaurant_member(restaurant_id) AND public.is_restaurant_feature_enabled(restaurant_id,'cash-closing') AND (public.is_admin() OR public.has_staff_permission(auth.uid(),'cash-closing')));

CREATE OR REPLACE FUNCTION public.admin_can_change_operational_settings(p_restaurant_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('super_admin','admin') AND (p.role='super_admin' OR p.restaurant_id=p_restaurant_id)) AND COALESCE((SELECT (config->>'allow_admin_operational_settings')::boolean FROM public.plugin_settings WHERE restaurant_id=p_restaurant_id AND plugin_code='restaurant-settings' LIMIT 1),false); $$;
GRANT EXECUTE ON FUNCTION public.admin_can_change_operational_settings(uuid) TO authenticated,service_role;

-- Staff must be able to read only their own permission rows so the UI can enforce them.
DROP POLICY IF EXISTS permissions_select_self ON public.staff_permissions;
CREATE POLICY permissions_select_self
ON public.staff_permissions FOR SELECT TO authenticated
USING (staff_id=auth.uid() AND public.is_restaurant_member(restaurant_id));
