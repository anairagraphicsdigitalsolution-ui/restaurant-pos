# Anaira Plugin Boundary Migration — 2026-09-21

This package establishes canonical `/plugins/<plugin>` boundaries for every entry in `lib/pluginCatalog.js`.

## Non-destructive rule
Existing `app/`, `lib/`, `components/`, `supabase/`, Android/Electron and current plugin implementations are intentionally preserved. This migration does NOT delete or alter existing Supabase schema/data/functions/RPC/RLS/migrations.

## Runtime safety
The current application routes remain in place so existing URLs and POS/Core behaviour are not broken. Each canonical plugin folder contains a manifest and ownership boundaries plus the exact current source locations to migrate into that boundary in a later verified step.

## Activation
`Operation Hub ON && Parent Plugin ON && Individual Integration ON = ACTIVE`. Settings are retained when disabled.

## Important catalog finding
The current `lib/pluginCatalog.js` contains 42 catalog entries. They are all scaffolded rather than silently dropping two entries.
