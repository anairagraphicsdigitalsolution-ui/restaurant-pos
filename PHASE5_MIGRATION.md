# Anaira POS Phase 5

This build adds the missing Cloud -> Local migration tooling to the supplied base ZIP.

## Commands

1. Set Cloud PostgreSQL URL in the current PowerShell session:
   `$env:SUPABASE_CLOUD_DB_URL="..."`

2. Export Cloud application data:
   `npm run phase5:cloud:backup`

3. Restore the newest export into local PostgreSQL:
   `npm run phase5:local:restore`

4. Verify local services and key application tables:
   `npm run phase5:data:verify`

5. Start the existing sync worker:
   `npm run phase5:sync`

## Safety

- Cloud backup is read-only.
- Restore targets `127.0.0.1:54322` only.
- Restore does not run `supabase db reset`.
- Export is restricted to `public` data to avoid overwriting Supabase-managed auth/storage/realtime internals.
- The sync command only starts an existing `scripts/sync-worker.mjs`; it does not fabricate sync logic if the worker is absent.


## Restore compatibility
The restore script strips PostgreSQL 17 `\restrict`/`\unrestrict` psql meta-commands because the bundled local Supabase database uses PostgreSQL 15. The Cloud SQL/COPY data is otherwise preserved.


## v10 table reconciliation
Before data restore, the compatibility step now detects public BASE TABLEs missing locally and obtains table-specific schema-only DDL from the Cloud using PostgreSQL 17. It does not import the full remote schema dump and therefore avoids Supabase-managed realtime/storage internals. PostgreSQL 17 `\restrict`/`\unrestrict` and `transaction_timeout` lines are removed for the PostgreSQL 15 local client.


## v11 schema-first restore
v11 uses a PostgreSQL 17 `pg_dump --schema-only --schema=public` as the source of truth before the data restore. This is intentionally limited to `public` so Supabase-managed auth/storage/realtime internals are not imported. PostgreSQL-17-only `\restrict`/`\unrestrict` and `transaction_timeout` lines are removed for the local PostgreSQL 15 client.


## v12 public schema compatibility
v12 strips the pg_dump `CREATE SCHEMA public`, public-schema comments/alter statements, and search_path setup before applying the Cloud public application schema. The existing Local `public` schema is never dropped or recreated.


## v13 routine collision fix
v13 excludes Cloud routines (functions/procedures), triggers, policies, views, indexes, grants and RLS enablement from the schema compatibility import. Existing Local Supabase/application routines are preserved so collisions such as `decrease_inventory` do not abort the schema step.
