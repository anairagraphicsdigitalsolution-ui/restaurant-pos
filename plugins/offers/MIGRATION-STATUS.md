# Migration status — Offers & Combos

- Canonical boundary: `plugins/offers/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/offers/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/offers/`
- `app/dashboard/combos/`
