# Admin Restaurant + Subscription Fix

Fixes:
- Allows pending restaurant subscriptions to have no legacy plan_id.
- Adds safe saas_plan_id bridge/backfill from legacy public.plans by name.
- New restaurant API accepts an optional initial SaaS plan and billing cycle.
- Super Admin dashboard loads subscription plans and shows inline plan/status controls.
- Add Restaurant form can assign an initial plan and billing cycle; restaurant remains pending until activated.
- Subscription dashboard gets an Add Restaurant button and clearer pending/no-plan states.
- Super Admin hero and subscription action button hover states use consistent contrast.
- Existing plugin, payment, kitchen, billing, QR, and restaurant modules are preserved.
