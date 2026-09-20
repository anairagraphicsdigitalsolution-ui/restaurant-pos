# P0 Production Certification Suite

## Exit criteria
- Real financial transaction replay: payment, refund, void, split, merge
- Cash closing replay protection
- Accounting journal duplicate prevention and balance checks
- Inventory movement, purchase, GRN, wastage, recipe consumption, COGS replay
- Offline -> online reconciliation
- Payment reconciliation
- Aggregator webhook/action/retry/idempotency checks
- Restaurant isolation and role/security tests
- No existing business data deletion

## Certification rule
A case is PASS only with executable evidence. A migration existing is not evidence of runtime correctness.

## Test matrix
| Case | Area | Required evidence |
|---|---|---|
| FIN-01 | Payment replay | same request twice; one ledger transaction |
| FIN-02 | Refund replay | same request twice; one refund |
| FIN-03 | Void replay | same request twice; one state transition |
| FIN-04 | Split replay | same request twice; no duplicate split |
| FIN-05 | Merge guard | paid/part-paid merge rejected |
| FIN-06 | Cash close replay | one closing per request/business date |
| FIN-07 | Accounting replay | journal source remains unique/balanced |
| INV-01 | Stock replay | one movement for one request |
| INV-02 | Purchase replay | one PO for one client request |
| INV-03 | GRN replay | one GRN for one client request |
| INV-04 | Wastage replay | one wastage transaction |
| INV-05 | Recipe/COGS replay | one consumption/COGS transaction |
| OFF-01 | Offline sync | offline transaction reconciles exactly once |
| PAY-01 | Reconciliation | provider ledger matches internal payment |
| AGG-01 | Webhook dedupe | duplicate event creates one order |
| AGG-02 | Action retry | failure retries then dead-letters |
| SEC-01 | Tenant isolation | restaurant A cannot access B |
| SEC-02 | Role isolation | staff cannot perform admin-only operation |
| SEC-03 | Service-role exposure | no privileged credential reaches client |
| SEC-04 | Webhook verification | invalid signature rejected |
| SEC-05 | Input limits | malformed/oversized payload rejected |

## Current gate
Static/database certification infrastructure is installed. Real provider sandbox, real device offline/online, and authenticated end-to-end transaction execution must be run before declaring P0 PASS.
