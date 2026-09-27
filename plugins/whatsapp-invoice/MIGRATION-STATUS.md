# Migration status — WhatsApp

- Canonical boundary: `plugins/whatsapp-invoice/`
- Existing source: preserved unchanged.
- Implementation snapshot: `plugins/whatsapp-invoice/implementation/`
- Supabase: untouched.
- Settings: retained when disabled.
- Next step for production cutover: replace route implementations with thin adapters **only after dependency/build verification**.

## Snapshotted source
- `app/dashboard/notifications/`
- `app/api/whatsapp/`
