# Restaurant tenant-link fix

- AuthProvider now resolves restaurant_id from profiles first, then auth user/app metadata, then restaurants.owner_id.
- Dashboard overview API uses the same resolver.
- Kitchen already uses metadata fallback and remains compatible.
- Restaurant operations APIs use the shared resolver.
- No new database migration is required for this code fix.
- Existing backfill migration can remain in place; it is still useful for repairing legacy profiles.
