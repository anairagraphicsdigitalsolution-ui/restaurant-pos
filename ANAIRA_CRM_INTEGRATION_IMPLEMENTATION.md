# Anaira Restaurant SaaS ↔ Anaira CRM Integration

Implemented in the v59 source baseline.

## Ownership
- Restaurant SaaS: restaurant profile, menu, variants, offers, operational order creation, POS/KOT/inventory/delivery/payment operations.
- CRM: Customer 360, CRM identity, segments, loyalty, reviews, marketing and service workflows.
- Integration contract: connection credentials, event delivery, retry records and marketplace bridge.

## Runtime contract
- `GET /api/integrations/anaira-crm/bridge` — authenticated machine-to-machine restaurant snapshot.
- `POST /api/integrations/anaira-crm/bridge` with `type=marketplace.order` — validates menu item IDs/variants through the canonical Restaurant SaaS order function and creates the operational order.
- Restaurant-originated order events are sent to CRM when configured.
- Failed CRM callbacks are retained in `anaira_crm_integration_events`.

## Security
- Restaurant integration key is stored as SHA-256 hash.
- CRM API key stored by the Restaurant SaaS connector is encrypted with `ANAIRA_SECRET_KEY`.
- Bridge endpoints require the machine key; they do not expose the service-role key.
- Admin UI requires authenticated restaurant admin/super-admin access.

## Offline behavior
The CRM connection is not a prerequisite for POS operation. Existing offline/local order paths remain independent; only the cross-product event path is retried separately.

## Setup
1. Restaurant SaaS → `/integrations/anaira-crm` → generate Restaurant Integration Key.
2. CRM Business Admin → `/integrations` → enter Restaurant SaaS URL + key.
3. CRM connection marks the restaurant marketplace catalog source as `restaurant_saas`.
4. Restaurant SaaS → enter CRM URL + CRM Integration Key if CRM event callbacks are required.

## Verification status
Static JavaScript syntax checks were run on all newly added/changed route and integration UI files. A production build was not claimed because dependency installation/build execution was not available within the build verification window.
