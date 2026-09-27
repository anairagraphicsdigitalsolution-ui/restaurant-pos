# Anaira Floor Management v36

Restaurant admins can now manage floors from `/admin`.

## Flow
Restaurant Admin → Admin Control Center → Floor Management → Add/Edit/Delete Floor.

Tables can be assigned to a managed floor while adding them. The Order POS loads active floors and shows floor tabs above the table grid.

## Database
Run migration:
`supabase/migrations/20260909090000_restaurant_admin_floors.sql`

The migration creates `public.floors`, seeds existing restaurant floor names, and keeps the existing `tables.floor` field compatible.

Deleting a floor is blocked when tables are still assigned to it. Renaming a floor synchronizes the existing `tables.floor` values.
