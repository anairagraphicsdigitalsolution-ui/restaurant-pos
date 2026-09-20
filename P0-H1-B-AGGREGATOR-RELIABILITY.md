# P0-H1-B — Aggregator Reliability

## Implemented
- Retry queue for failed provider actions with exponential backoff.
- Maximum 5 attempts by default and dead-letter timestamp after terminal failure.
- `FOR UPDATE SKIP LOCKED` worker claims to prevent duplicate concurrent processing.
- Retry support for failed menu/availability sync jobs.
- Authenticated Aggregator Control retry action.
- Provider timeout/error results remain persisted in the action/job ledger.
- Existing H1-A webhook verification, idempotency and provider adapter preserved.

## Retry schedule
15s → 30s → 60s → 120s → 240s, capped at 30 minutes. The database worker claim only selects due, non-dead-lettered failures.

## Safety
No order, payment, inventory, customer, menu, or business data is deleted. Retry execution remains tenant-scoped through the authenticated restaurant context and integration lookup.

## Limitation
Actual Swiggy/Zomato production certification still requires provider sandbox credentials/endpoints and controlled test orders. This ZIP does not claim that external provider sandbox testing has been performed.
