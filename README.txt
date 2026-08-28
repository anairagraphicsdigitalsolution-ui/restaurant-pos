ANAIRA LOCAL/CLOUD FIX

Purpose
-------
Restaurant Admin/POS data remains local-first on the restaurant PC. Super Admin pages and Super Admin server APIs explicitly use the Cloud Supabase control plane. Local database changes are captured by anaira_sync_events and can be pushed to Cloud without relying only on the legacy local_sync_outbox.

Important changes
-----------------
1. All /super-admin client pages now explicitly use supabaseCloud.
2. Super Admin subscription/restaurant APIs now explicitly use supabaseCloudAdmin.
3. Local sync push reads anaira_sync_events and handles INSERT/UPDATE/DELETE.
4. Local pull marks sync_apply=true so a Cloud -> Local pull does not create a feedback sync event.
5. Local status component pushes local changes periodically while online. When coming back online it PUSHES before pulling, so offline local changes are not overwritten first.
6. run-local-pos.ps1 no longer assumes a hard-coded Docker Compose directory. Optionally set LOCAL_SUPABASE_STACK_DIR in .env.local.

Apply
-----
Extract this ZIP over the existing restaurant-pos project and replace existing files when asked. Do NOT replace your .env.local with a file from a ZIP. Keep your current credentials.

Then from the project root run:
  powershell -ExecutionPolicy Bypass -File .\scripts\run-local-pos.ps1

Test
----
1. Login as restaurant Admin.
2. Change a menu item price locally.
3. Confirm local PostgreSQL:
   docker exec supabase-db psql -U supabase_admin -d postgres -c "SELECT id,name,price FROM menu_items WHERE name='VEG PIZZA';"
4. With internet available, wait for Local • Online / sync or reload.
5. Check the Cloud Super Admin view; it should read Cloud data.
6. Open /super-admin and verify it does not switch to local data.

Security note
-------------
The existing local-primary design uses a local service key for the browser data plane because Cloud Auth tokens are not automatically valid for the separate local Supabase Auth stack. This is acceptable only for a trusted desktop/LAN restaurant installation; never expose the local service key in a public deployment.
