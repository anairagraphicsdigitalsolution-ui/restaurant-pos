# Phase 5 — Cloud Schema Lint Fix

This package is based directly on the uploaded `anaira-pos-phase5-cli1150-clean-status-fixed(1).zip`.

It adds:
`supabase/migrations/20260827010000_cloud_schema_lint_fixes.sql`

The migration fixes the three blocking errors reported by:

```powershell
npx supabase@2.115.0 db lint --db-url "$env:SUPABASE_CLOUD_DB_URL" --schema public
```

- `set_whatsapp_config`: uses `plugin_code` and update-then-insert.
- `issue_order_token`: casts `token_no` to text before `regexp_replace`.
- `stage3_finalize_order`: removes overload ambiguity by explicitly calling the canonical 8-argument billing function.

The two non-blocking warnings from `reopen_cash_closing` and `stage3_finalize_order` are intentionally not changed because they do not prevent compilation or execution.

IMPORTANT:
Do not run `supabase db reset`.
For the live Cloud project, apply this SQL through the Supabase SQL Editor first, then rerun the read-only `db lint` command. Do not push the entire local migration history to production just to apply this one fix.
