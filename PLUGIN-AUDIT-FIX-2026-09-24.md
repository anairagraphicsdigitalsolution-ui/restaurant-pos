# Anaira Plugin Boundary Audit & Safe-Fix Report — 2026-09-24

## Safety contract
- Existing `app/`, `lib/`, `components/`, Supabase, Android and Electron runtime sources were not deleted.
- No Supabase schema/data/RPC/function/RLS/migration changes were made.
- Existing POS/Core live routes remain in place to avoid breaking the application flow.
- This package performs boundary/scaffold corrections only; it does not claim a production runtime cutover.

## Findings
1. `lib/pluginCatalog.js` currently contains **42** entries, not 40. All entries are preserved.
2. The earlier scaffold had incorrect `MIGRATION-STATUS.md` canonical paths for many plugins; these were corrected.
3. Several manifests incorrectly required Operation Hub for core/business modules. Activation was corrected:
   - Core/Suite/Pro: plugin-owned enablement.
   - Operation Hub: its own master switch.
   - Provider integrations: Hub + parent plugin + individual integration.
4. Several source snapshots overlap across plugins. These are retained as snapshots and are **not live runtime duplicates**. Ownership is recorded rather than deleting code.
5. Some copied snapshot files contain relative imports that would not resolve if moved directly into runtime. Therefore no blind route cutover was performed.
6. Standard plugin boundary directories/index files were completed so every canonical plugin has the same configuration surface.

## Protected POS flow
The live route flow remains:
`Order -> KOT -> KDS/Kitchen -> Bill -> Payment -> Receipt/Cashier`

No live route replacement was performed.

## Plugin configuration contract
Every canonical plugin has:
`Dashboard / Settings / API / Runtime / Services / Permissions / Integrations`

Existing configuration/data is intended to remain retained when disabled.

## Remaining safe production migration
The next stage must be performed plugin-by-plugin:
1. Dependency graph audit.
2. Move implementation behind canonical plugin boundary.
3. Convert existing `app/...` routes to thin adapters.
4. Resolve imports and shared dependencies.
5. Apply plugin/parent/integration gates at runtime.
6. Run typecheck/build.
7. Run POS regression.
8. Only then remove duplicate implementation — and only with explicit approval.

## Validation performed
- ZIP integrity: PASS.
- Static Phase-1 reliability check: PASS.
- Supabase destructive changes: 0.
- Live route cutover: 0.
