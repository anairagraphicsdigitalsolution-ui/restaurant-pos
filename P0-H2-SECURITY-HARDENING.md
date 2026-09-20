# P0-H2 API + Security Hardening

Scope: all 120 `app/api` route files in the H1-C source.

Implemented:
- API route inventory and auth/role/tenant isolation audit.
- Server-only protection for service-role-capable libraries.
- Shared request-size and rate-limit guards on high-risk webhook endpoints.
- Hardened anonymous local health/terminal responses so they no longer disclose host/port/terminal identifiers.
- Replaced marketing-lead custom per-process limiter with the shared public limiter and request-size protection.
- Added `p0_api_security_audit` table with RLS and tenant-aware reads.
- Added server helper for security audit events.
- Verified all audited JS/JSX API/lib files with `node --check`.

Important production notes:
- The existing rate limiter is per application process. Multi-instance production should pair it with a shared limiter/WAF.
- Public QR/session endpoints intentionally remain public and are protected by signed/hashed session tokens, tenant checks, validation and rate limits.
- Provider webhooks require provider signatures; real provider sandbox certification still requires credentials.
- No service-role secret is returned by the audited APIs; plugin secrets are sanitized where configuration is returned.
