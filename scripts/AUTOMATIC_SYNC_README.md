# Anaira automatic bidirectional sync

The worker reuses the existing Cloud Supabase API credentials:
- NEXT_PUBLIC_SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY

It does not require SUPABASE_CLOUD_DB_URL or a Cloud PostgreSQL password.

Start from the project root:
`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
`./scripts/start-automatic-sync.ps1`

Default cycle: 5000 ms.
