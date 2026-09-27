# Migration status — Business Card Studio

- Canonical boundary: `plugins/business-card-studio/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/business-card-studio/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/business-card/`
