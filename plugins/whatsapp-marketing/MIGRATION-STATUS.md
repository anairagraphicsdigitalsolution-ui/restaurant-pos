# Migration status — WhatsApp Marketing

- Canonical boundary: `plugins/whatsapp-marketing/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/whatsapp-marketing/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/marketing/`
- `app/dashboard/marketing-automation/`
- `app/api/marketing/`
