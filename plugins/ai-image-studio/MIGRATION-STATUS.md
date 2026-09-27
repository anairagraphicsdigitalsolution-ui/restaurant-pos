# Migration status — AI Image Studio

- Canonical boundary: `plugins/ai-image-studio/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/ai-image-studio/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/ai/`
