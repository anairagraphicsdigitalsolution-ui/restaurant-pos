# QR Print Center Final Fix

- QR Print Center is a separate plugin: `qr-print-center`.
- Advanced QR Ordering remains `qr-ordering-pro` / alias `qr-menu`.
- Super Admin can activate/deactivate QR Print Center per restaurant.
- Admin sidebar shows QR Print Center only when that restaurant's plugin is enabled.
- API access is checked server-side.
- Existing enabled states are preserved; missing rows are created OFF.
- Added migration `20260823270000_ensure_qr_print_center_plugin_catalog_and_rows.sql`.
- Fixed the legacy `plugins/page.jsx` syntax error and added QR Print Center to its hardcoded plugin list.
