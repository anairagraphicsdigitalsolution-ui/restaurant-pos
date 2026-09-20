# Anaira Fast POS — 19 Point Implementation

This release is additive. Existing routes, tables, rooms, QR ordering, delivery,
takeaway, printing, offline/local runtime, billing, inventory and plugin code are
kept. The fast flow is layered over the existing architecture.

## 19-point checklist

1. **3-click POS direction** — POS is the default Staff workflow when POS is enabled; source → menu → send.
2. **Kitchen active-order performance** — KDS loads up to 200 live orders and 50 recent terminal orders instead of the full historical dataset.
3. **N+1 POS lookup removal** — menu and variant validation is batched by IDs.
4. **Automatic KOT** — existing DB trigger remains authoritative; POS now also performs best-effort KOT printing.
5. **Single order vocabulary** — `lib/orderEngine.js` centralizes sources/statuses without removing legacy values.
6. **Table state automation foundation** — order status remains the source of truth; billing completion remains the existing release point.
7. **Done → billing queue** — Staff Done action uses the secure kitchen-status API and opens Billing.
8. **Automatic printer routing** — existing print bridge/thermal infrastructure is preserved; POS invokes the existing slip printer best-effort.
9. **Multiple orders per table/room compatibility** — no schema restriction added; existing source IDs remain unchanged.
10. **Delivery simplified** — fast POS now has Delivery mode with customer/phone/address fields; existing delivery page remains intact.
11. **Lazy runtime activation** — realtime, calling, cleanup and cloud-print workers are gated to restaurant application routes.
12. **Menu cache-friendly loading** — POS loads menu/variants in parallel and filters search/category client-side after the initial load.
13. **Offline-first preservation** — existing Android/local sync code is untouched and remains the fallback path.
14. **Common order engine** — shared source/status vocabulary is introduced as the compatibility layer for POS/QR/website/kitchen.
15. **Server-authoritative totals** — POS subtotal/total is recalculated from validated menu/variant prices instead of trusting client totals.
16. **Retry/idempotency** — `client_request_id`/`idempotency_key` is stored with a unique restaurant-scoped index to make network retries safe.
17. **Table + Room QR** — existing QR endpoint accepts both `table` and `room`; this release preserves that behavior while sharing the same order engine vocabulary.
18. **Notification automation preservation** — existing realtime/notification components and DB order-ticket triggers remain in place; no notification feature is removed.
19. **Existing-code preservation** — changes are additive: old Staff tabs, Take Order, Delivery, Kitchen, Billing, QR, printer and offline modules remain available.

## Operator flow

```text
TABLE / ROOM / TAKEAWAY / DELIVERY
              ↓
          MENU + SEARCH
              ↓
             SEND
              ↓
        AUTO KOT + PRINT
              ↓
           KITCHEN
              ↓
            DONE
              ↓
        READY TO BILL
              ↓
           PAYMENT
              ↓
       INVOICE + PRINT
              ↓
         TABLE/ROOM FREE
```

## QR flow

```text
TABLE QR ─┐
          ├── same public order engine ── KOT ── Kitchen ── Billing
ROOM QR ──┘
```
