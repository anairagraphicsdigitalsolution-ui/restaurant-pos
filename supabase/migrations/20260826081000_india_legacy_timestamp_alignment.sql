-- Safe compatibility migration for the legacy India timestamp alignment.
-- The original migration performed a destructive +05:30 rewrite of timestamp-without-
-- timezone values. That rewrite has already been performed on the live database.
-- Do not repeat it: doing so would shift existing records a second time.
-- Kept as a no-op so local/remote migration history can advance safely.
DO $$
BEGIN
  RAISE NOTICE '20260826081000 legacy timestamp alignment already applied; no-op.';
END $$;
