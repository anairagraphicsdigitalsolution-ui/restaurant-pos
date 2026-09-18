# Anaira POS — A-to-Z Build / Source Audit

## Current build blockers addressed

### ESLint / Next.js 15
`eslint.config.mjs` now uses the official flat-config entry directly:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  globalIgnores([...]),
]);
```

This removes the previous namespace/default normalization that produced `nextVitals is not iterable` and avoids manually registering a blank plugin name.

### React Hooks
The unsupported `react-hooks/set-state-in-effect` directive was removed from source. React Hooks linting itself was not globally disabled.

### `lucide-react`
`lucide-react` is declared in `package.json` and present in `package-lock.json` at version `0.468.0`. The supplied project archive does not contain `node_modules`, so a target machine must run `npm ci`/`npm install` before TypeScript can resolve the package. The source import in `components/layout/Header.tsx` is valid.

### Dependency alignment
Next.js remains `15.5.23` to match the application's current build target. `eslint-config-next` and `@next/eslint-plugin-next` remain pinned to `15.5.24`, which are compatible with ESLint 9 and the current Next 15 stack.

## Static source audit

- 263 JS/JSX/TS/TSX source files scanned.
- Relative source-module resolution was checked.
- CSS-module imports are expected and were excluded from JavaScript module resolution.
- `lib/supabase/client.ts -> ../supabase.js` resolves to the existing `lib/supabase.js` file.
- No source files were intentionally removed by this revision.
- Existing POS, QR, billing, kitchen, delivery, printing, Supabase, offline, Capacitor and Electron areas were preserved.

## Important target-machine step

Because `node_modules` is machine-local and is not shipped in the ZIP, run from the extracted project:

```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm ci
npm run lint
npm run typecheck
npm run build
```

If `npm ci` reports a lock mismatch, use `npm install` once and then repeat lint/typecheck/build.

## Security

The uploaded source contained `.env.local` credentials. It is intentionally excluded from this deliverable. Rotate any credentials that were exposed in the uploaded archive, especially Supabase service-role and OpenAI keys.

## Verification limitation

A fresh dependency install/build could not be completed in the sandbox because npm registry access timed out. Therefore this deliverable is not falsely labeled as a sandbox-verified production build. The exact Windows build commands above are required to verify the target machine's dependency state.

## Supabase migration caution

Do not blindly rename/delete already-applied migration versions. The project contains migration-version collisions that must be reconciled with the actual deployed Supabase migration history before applying new migrations.
