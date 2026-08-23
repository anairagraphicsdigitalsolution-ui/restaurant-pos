# KOT + Delivery-first Kitchen Flow

- Every order creates a persistent kitchen_order_tickets row.
- Delivery POS orders redirect to `/kitchen?order_id=...&next=delivery`.
- KDS has A4/A5/58mm/80mm KOT print + HTML download.
- Mark Done on a delivery order redirects to `/dashboard/delivery?order_id=...`.
- Delivery page auto-selects the matching delivery.
- KOT ticket status syncs with order status.
