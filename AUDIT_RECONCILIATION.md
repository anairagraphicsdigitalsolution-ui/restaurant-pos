# Anaira POS — Audit Reconciliation

This package aligns the local migration timeline with the current Cloud Supabase state and contains the post-audit hardening.

## Canonical authority

Cloud Supabase is the authoritative SaaS master. Local POS data must sync to Cloud using stable UUIDs; invoice/KOT numbers are authoritative on Cloud for synced offline orders.

## Applied to Cloud

Migration `20260829021629_offline_sync_schema_and_security_hardening` was applied successfully.

It adds the offline-sync fields/indexes to `public.orders`, installs the Cloud-side offline invoice/KOT finalizer, and removes anonymous execution from privileged configuration/admin RPCs.

## Local migration alignment

- Removed the old local-only `20260829010000_offline_sync_bill_kot_finalization.sql` marker.
- Added `20260828225905_restore_cloud_billing_finalize_compatibility.sql` as a non-destructive local history marker.
- Added `20260829021629_offline_sync_schema_and_security_hardening.sql` matching the Cloud migration.

## Data reconciliation

The audit found four Cloud restaurants vs five local-backup restaurants. The extra local record was the known test restaurant `00000000-0000-0000-0000-000000000506`; the local backup contained no dependent rows for it.

The supplied `scripts/local-data-reconciliation.sql` removes only that known test record when present. It does not delete or rewrite the real NH3 restaurant or its orders.

Run `scripts/verify-cloud-local-parity.sql` on both databases after local reset to compare counts and integrity.

## Important

Do not overwrite Cloud with the local backup. The audit found real count differences in order_items, KOT tickets and payments, so destructive full-database replacement is unsafe without record-level reconciliation.
