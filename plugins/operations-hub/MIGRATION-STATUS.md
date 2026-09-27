# Migration status — Operations Hub

- Canonical boundary: `plugins/operations-hub/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/operations-hub/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/operations-control/`
- `app/dashboard/system-ops/`
- `app/api/integrations/`
- `app/api/webhooks/`
