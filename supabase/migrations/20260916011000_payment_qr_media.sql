BEGIN;
INSERT INTO storage.buckets (id,name,public) VALUES ('payment-qr-media','payment-qr-media',true)
ON CONFLICT (id) DO UPDATE SET public=true;
COMMIT;
