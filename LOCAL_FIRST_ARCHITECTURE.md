# Anaira POS — Local-First Restaurant Architecture

## Goal

The platform uses two deployment roles:

- **Cloud deployment:** Super Admin/control plane. Uses the cloud Supabase project.
- **Restaurant deployment:** Admin/staff POS on the restaurant PC. Uses the local Supabase Docker stack as the primary application database.

The same source tree supports both modes through environment configuration.

## Data flow

```text
Cloud / Super Admin
        |
        | HTTPS + sync worker
        v
Restaurant PC
  Next.js POS
        |
        v
Local Supabase API (Kong :8000)
        |
        v
Local PostgreSQL (supabase-db :54322)
```

The restaurant PC can continue serving operational POS data while the internet is unavailable. Changes are captured by the `anaira_sync_capture` trigger and synchronized when cloud connectivity returns.

## Control-plane vs operational data

Cloud remains authoritative for platform/control-plane data such as restaurant accounts, subscriptions, plans, billing and Super Admin configuration.

Restaurant operational tables are tenant-scoped by `restaurant_id` and are replicated between the cloud and the restaurant's local database. This keeps the local POS responsive/offline-capable while allowing the cloud control plane to receive synchronized operational data.

## Runtime modes

### Cloud / Super Admin

```env
NEXT_PUBLIC_ANAIRA_LOCAL_PRIMARY=false
ANAIRA_LOCAL_PRIMARY=false
```

The normal `NEXT_PUBLIC_SUPABASE_*` and `SUPABASE_SERVICE_ROLE_KEY` variables are used.

### Restaurant / Local Primary

```env
NEXT_PUBLIC_ANAIRA_LOCAL_PRIMARY=true
ANAIRA_LOCAL_PRIMARY=true
NEXT_PUBLIC_LOCAL_SUPABASE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_LOCAL_SUPABASE_ANON_KEY=...
SUPABASE_LOCAL_SERVICE_ROLE_KEY=...
ANAIRA_LOCAL_SERVER_ENABLED=true
LOCAL_DATABASE_URL=postgresql://supabase_admin@127.0.0.1:54322/postgres
LOCAL_DB_CONTAINER=supabase-db
ANAIRA_RESTAURANT_ID=...
SUPABASE_CLOUD_DB_URL=...
```

The browser/server application uses the local Supabase stack in local-primary mode. A separate explicit `supabaseCloudAdmin` client remains available for synchronization to the cloud control plane.

## Important operational rule

Do **not** run `supabase start`, `supabase stop`, `supabase status`, `supabase db reset`, or `docker compose down -v` against the restaurant stack described above. It is managed by the existing custom Docker Compose project and its DB container is `supabase-db`.

Use:

```powershell
cd "D:\my soft saas\Anairat-POS-Enterprise\server\docker"
docker compose ps
```

to inspect that stack.

## Local mode setup

From the POS project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\enable-local-mode.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\run-local-pos.ps1
```

If the local key source file is unavailable, populate the local key variables manually from the restaurant Supabase stack's own credentials. Never print service-role keys to logs or commit them to source control.

## Sync worker

The bidirectional worker is:

```text
scripts/sync-worker.mjs
```

It uses direct PostgreSQL connections:

- `SUPABASE_CLOUD_DB_URL` → cloud Postgres
- `LOCAL_DATABASE_URL` → local Postgres

It scopes events to `ANAIRA_RESTAURANT_ID` and uses a tenant-specific node name.

Run it separately on the restaurant PC:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\phase5-start-sync.ps1
```

## Security

- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_LOCAL_SERVICE_ROLE_KEY`, or database URLs as `NEXT_PUBLIC_*` variables.
- Rotate any service-role/OpenAI credentials that have previously been exposed outside the machine.
- Keep Super Admin/control-plane credentials server-side.
