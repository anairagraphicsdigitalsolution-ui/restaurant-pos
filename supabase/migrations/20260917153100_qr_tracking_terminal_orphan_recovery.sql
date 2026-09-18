-- One-time compatibility repair for a terminal QR order created before the
-- stale-session binding fix. This preserves the order and payment history.
UPDATE public.orders o
SET qr_session_id = s.id, updated_at = now()
FROM public.qr_guest_sessions s
WHERE o.qr_session_id IS NULL
  AND lower(coalesce(o.status,'')) IN ('done','paid','completed','settled','cancelled','canceled','void','voided','refunded')
  AND o.restaurant_id = s.restaurant_id
  AND o.source_type = s.source_type
  AND o.source_id::text = s.source_id::text
  AND NOT EXISTS (
    SELECT 1 FROM public.orders other
    WHERE other.qr_session_id = s.id
      AND other.id <> o.id
      AND other.created_at > o.created_at
  );
NOTIFY pgrst, 'reload schema';
