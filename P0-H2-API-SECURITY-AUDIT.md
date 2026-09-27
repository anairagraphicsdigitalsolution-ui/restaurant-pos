# P0-H2 API + Security Audit

Generated from H1-C source: 120 API route files.

## Coverage summary
- Authenticated/role or signed webhook: 95/120
- Public/local/webhook/oauth category: 32/120
- Rate limiting: 16/120
- Request size guard: 9/120
- Service-role/server admin usage: 108/120
- JSON body parsing: 73/120
- Basic input validation markers: 97/120
- Webhook/signature logic: 12/120
- Audit logging markers: 15/120

## Routes requiring manual/targeted attention
- `app/api/installer/login/route.js` — auth=False, public/local/webhook/oauth=False, rate=False, size=False, service-admin=True, validation=True
- `app/api/marketing/meta/oauth/callback/route.js` — auth=False, public/local/webhook/oauth=True, rate=False, size=False, service-admin=True, validation=True
- `app/api/marketing/meta/oauth/route.js` — auth=False, public/local/webhook/oauth=True, rate=False, size=False, service-admin=False, validation=False
- `app/api/marketing/meta/oauth/select/route.js` — auth=True, public/local/webhook/oauth=True, rate=False, size=False, service-admin=True, validation=True
- `app/api/marketing/meta/oauth/start/route.js` — auth=True, public/local/webhook/oauth=True, rate=False, size=False, service-admin=True, validation=True
- `app/api/marketing/meta/oauth/tenant-select/route.js` — auth=True, public/local/webhook/oauth=True, rate=False, size=False, service-admin=True, validation=True
- `app/api/marketing/platform/track/click/route.js` — auth=False, public/local/webhook/oauth=False, rate=False, size=False, service-admin=True, validation=True
- `app/api/orders/create/route.js` — auth=False, public/local/webhook/oauth=False, rate=True, size=True, service-admin=True, validation=True
- `app/api/printing/local-bridge/route.js` — auth=False, public/local/webhook/oauth=False, rate=False, size=False, service-admin=False, validation=False
- `app/api/printing/local-bridge/start/route.js` — auth=False, public/local/webhook/oauth=False, rate=False, size=False, service-admin=False, validation=False
- `app/api/restaurant/operations/route.js` — auth=False, public/local/webhook/oauth=False, rate=False, size=False, service-admin=False, validation=True
- `app/api/social/publish/route.js` — auth=False, public/local/webhook/oauth=False, rate=False, size=False, service-admin=False, validation=False

## Service-role exposure result
- Server-side service-role clients are confined to server libraries/API routes; `server-only` guards were added to service-role-capable libraries.
- No service-role secret is returned by the audited installer/plugin APIs. Plugin secrets are sanitized before responses.

## Implemented P0-H2 hardening
- Added `p0_api_security_audit` with RLS and tenant-aware reads.
- Added shared request size + rate-limit guards to aggregator, Cashfree, WhatsApp and Meta webhook endpoints.
- Hardened anonymous local health/terminal responses to stop exposing host/port/terminal identifiers.
- Replaced custom in-memory marketing-lead limiter with shared public rate-limit utility and request-size cap.
- Added `server-only` protections to server/admin Supabase libraries.

## Remaining production certification
- Cluster-wide rate limiting still requires an edge/WAF/shared limiter for multi-instance deployment; current helper is per-process.
- Some legacy/public compatibility routes intentionally remain unauthenticated and must be protected by their canonical target route or signed/session token.
- Provider sandbox tests require actual Swiggy/Zomato/Cashfree/Meta credentials; no fake production events were inserted.