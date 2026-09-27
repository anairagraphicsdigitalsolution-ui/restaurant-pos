# P0-H1-C — Aggregator Certification

## Scope
- End-to-end aggregator certification harness foundation
- Webhook/action/retry/dedupe/reconciliation test-run ledger
- Live Supabase schema verification
- Provider sandbox certification remains credential-dependent

## Live verification
The connected Supabase project was checked after migration. Current aggregator tables contain zero production/test rows, so no live provider order was altered or fabricated.

## Certification rules
1. Webhook must verify provider signature before processing.
2. Duplicate external event must not create a second POS order.
3. Action requests require an idempotency key.
4. Failed actions retry with bounded exponential backoff.
5. Exhausted actions enter dead-letter state.
6. Provider status changes are recorded on the aggregator order.
7. Menu/availability sync jobs are retryable and auditable.
8. Reconciliation must not invent settlement data.

## Test ledger
`p0_h1c_test_runs` stores authenticated certification results without touching business orders.

## Limitation
Actual Swiggy/Zomato sandbox execution cannot be certified without valid provider sandbox credentials, endpoint configuration, and test outlet IDs. The release therefore certifies the application-side controls and explicitly leaves external-provider execution as a final environment test.
