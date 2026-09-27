# Enterprise HQ Ultra Premium UI + Outlet Network

## Included
- Enterprise HQ redesigned to match Anaira dark cinematic / gold premium UI.
- All Enterprise HQ tabs use the same visual system: Overview, Outlets, Comparison, Central Menu, Pricing, Inventory, Transfers, Approvals, Staff Movement, Reports, Accounting, Devices, Audit.
- New **Outlet Network** sidebar entry.
- New **+ Add Outlet** drawer/form.
- Existing restaurant selector is server-populated from restaurants owned by the authenticated enterprise account and excludes already linked restaurants.
- Secure server-side `outlet_create` action.
- Existing restaurant data is linked through `enterprise_outlets`; no restaurant duplication or deletion.
- Server-side authorization allows owner / enterprise_admin / operations to add or edit enterprise outlets.
- Enterprise audit log records outlet creation.
- Existing P1.8 RPCs and enterprise workflows are preserved.

## Important
This package does not delete or overwrite business data. The outlet form links an existing restaurant to the enterprise using `enterprise_outlets`.

## Validation
- Node syntax checks passed for the Enterprise HQ page and API route.
- Full Next.js production build should be run in the user's normal project environment with dependencies installed.
