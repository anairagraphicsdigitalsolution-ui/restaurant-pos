# Anaira POS — Automatic Background Sync

This package adds a hidden, self-restarting Windows Scheduled Task for the existing sync worker.

One-time installation (Administrator PowerShell):

```powershell
cd "D:\my soft saas\restaurant-pos"
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\install-sync-background.ps1
```

Check status:

```powershell
.\scripts\sync-background-status.ps1
```

The worker runs:

`npm run sync:worker`

If the worker exits, the wrapper waits 5 seconds and starts it again. The Scheduled Task also has restart settings.

Do not distribute development `.env.local` or service-role secrets to customers.


## Fix included in this version

The background worker now loads `.env.local` / `.env` itself before validating:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANAIRA_RESTAURANT_ID`
- local database settings

This is required because a plain Node worker does not automatically receive Next.js `.env.local` values when launched by Windows Task Scheduler.

The worker remains hidden and self-restarting.


## Clean worker fix

`sync-worker.mjs` has been rebuilt with a valid import section and a single `.env.local` loader. The previous duplicate-import/malformed-loader issue is removed. The file was syntax-checked with Node before packaging.
