# Anaira Restaurant POS — Sync / Local-First Review

## Scope
Reviewed the uploaded project source, with focus on:
- local PostgreSQL access
- local-first admin operations
- bidirectional event capture
- restaurant/tenant isolation
- sync worker cursor handling
- `restaurant_banners`
- local sync APIs
- existing local outbox vs event-based sync

## Changes applied

### 1. Local database connection
The sync worker now prefers:
1. `LOCAL_DATABASE_URL`
2. `SUPABASE_LOCAL_DB_URL`
3. `postgresql://supabase_admin@127.0.0.1:54322/postgres`

This matches the project's current local Docker setup and removes the old dummy password fallback.

### 2. Local schema self-healing
The sync worker now verifies/creates:
- `restaurant_banners`
- `anaira_sync_events`
- `anaira_sync_state`
- sync helper functions
- sync capture triggers

It also installs the capture trigger across local public tables having primary keys. This prevents a fresh local database from silently missing event capture.

### 3. `restaurant_banners`
Added to the local snapshot core list and local sync push allow-list.

The Admin banner flow already correctly calls `/api/local/admin` when local mode is enabled, so it was preserved rather than replaced with a second API architecture.

### 4. Restaurant ID propagation
The sync trigger now derives `restaurant_id` not only from a direct `restaurant_id` column, but also through common relationships:
- `order_id -> orders.restaurant_id`
- `menu_item_id -> menu_items.restaurant_id`
- `item_id -> menu_items.restaurant_id`
- `inventory_id -> inventory.restaurant_id`
- `table_id -> tables.restaurant_id`
- `room_id -> rooms.restaurant_id`
- `customer_id -> customers.restaurant_id`

This is important because `order_items` has no `restaurant_id`; without this, its events were filtered out by the worker and could not reliably sync.

### 5. Tenant security on local APIs
Added a shared local tenant resolver and applied it to:
- local orders
- local kitchen
- local billing
- manual local snapshot sync

Non-super-admin users can only access their linked restaurant. Super admins may explicitly select a restaurant.

### 6. Local runtime status
The worker now updates `local_sync_state` after each cycle and records sync errors. Pending count is based on local event IDs still ahead of the local->cloud cursor rather than counting every historical event.

### 7. Banner ordering
Multiple banner uploads now receive deterministic sequential `sort_order` values.

### 8. Admin banner delete API
Added `banner.delete` support to the existing local admin API without changing the current UI architecture.

### 9. Fresh-install init
Added `local-server/init/003_sync.sql` so a new local database receives the banner and sync infrastructure without depending only on a manual repair command.

## Important finding: the app is NOT yet 100% local-first

The project contains many direct Supabase writes outside the local-admin/local-order paths. Examples include POS/order flows, delivery, billing, inventory, restaurant operations, plugin settings, and several dashboard pages.

That means the current architecture is:

**local-first for selected flows + cloud-direct for other flows**, not a completely offline POS yet.

I did not blindly rewrite all of those paths because doing so would require a table-by-table transaction and conflict strategy. The event worker itself is generic enough to replicate many tables once writes occur locally, but the application must actually write to local PostgreSQL for offline operation.

## Storage limitation

Admin banner/logo files are uploaded to Supabase Storage before their database row is written locally. Therefore database sync can be offline/local-first, but the actual image upload is still cloud-dependent.

## Validation performed

Node syntax checks passed for the modified JavaScript/MJS files:
- sync worker
- local DB
- local sync
- local tenant resolver
- local admin
- local orders
- local kitchen
- local billing
- local sync routes

No production database was modified by this review; changes were made to the uploaded project copy.


## v3 hotfix
- Fixed localDb psql session initialization so `set_config(app.sync_node, ...)` output is redirected to `/dev/null`. This prevents the configuration value from being concatenated with JSON query output, which caused `Unexpected token ... is not valid JSON` in local admin mutations.
