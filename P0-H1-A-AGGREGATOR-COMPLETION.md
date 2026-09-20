# P0-H1-A — Aggregator Completion

Implemented on top of the P0.4 aggregator engine.

## Added
- Provider webhook endpoint: `/api/webhooks/aggregator/[provider]`
- Raw-body HMAC verification with provider-specific signature headers
- Outlet-code based tenant resolution before order processing
- Idempotent webhook ingestion through `p0_aggregator_events`
- Generic provider adapter with configurable action endpoints
- Provider action queue with idempotency and retry metadata
- Accept/reject/prepare/ready/picked-up/cancel actions
- Menu and availability sync jobs
- Variant/option mapping fields
- Provider status and sync timestamps
- Aggregator Control integration with queued provider actions

## Provider configuration
`aggregator_integrations.credentials` can contain:
- `base_url`
- `api_key`
- `webhook_secret`
- `signature_header`
- `signature_algorithm`
- `signature_encoding`
- `signature_prefix`
- `timeout_ms`
- `headers`
- `actions`: `{accept,reject,prepare,ready,picked_up,cancel,sync_menu,sync_availability}`

No provider success is fabricated. A provider action is marked succeeded only after the configured endpoint returns a successful HTTP response.
