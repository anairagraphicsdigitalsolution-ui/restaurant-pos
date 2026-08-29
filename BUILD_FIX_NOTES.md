# Anaira POS Build Fix

Applied:
- Fixed `eslint.config.mjs` to import `eslint-config-next/core-web-vitals.js`.
- Removed generated `.next` and `node_modules` if present.
- Preserved the existing app structure, migrations, local backups, plugins and source code.
- Verified the uploaded archive itself is a valid ZIP and contains the expected dynamic order routes and `app/favicon.ico`.

Before the final build:
1. `npm install`
2. `Remove-Item .next -Recurse -Force -ErrorAction SilentlyContinue`
3. `npm run build`

The dynamic routes are present:
- `app/[slug]/order/page.jsx`
- `app/[slug]/order/[type]/[id]/page.jsx`
- `app/admin/page.tsx`
- `app/favicon.ico`
