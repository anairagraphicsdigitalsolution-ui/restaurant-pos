# Migration status — P2 AI Decision Intelligence

- Canonical boundary: `plugins/p2-ai-intelligence/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/p2-ai-intelligence/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/ai-intelligence/`
- `app/dashboard/ai-governance/`
- `app/api/ai-intelligence/`
