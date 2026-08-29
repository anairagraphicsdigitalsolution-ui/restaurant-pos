# Phase 13 — Premium Installer Account & Custom Supabase Provisioning

## Normal installation

- Select **Sign in with Anaira Account**.
- Enter only Email + Password.
- The Anaira portal resolves the Restaurant UUID automatically.
- No Restaurant UUID is requested from the operator.

## Advanced installation

- Select **Advanced — Use my own Supabase**.
- Enter Supabase Project URL, Project Ref, Anon/Public Key and Database Password.
- Restaurant UUID is optional. Leave it blank for a fresh Supabase project so the Super Admin can create restaurants later.
- The Service Role Key is requested only when the optional Super Admin creation is enabled.
- The installer applies the bundled Supabase migrations/schema. It does not import the existing restaurant's application rows.
- When requested, it creates a confirmed Supabase Auth user and upserts `public.profiles` with `role = super_admin`.

## Security

The Service Role Key is an installation-time administrative secret. It is never placed in `NEXT_PUBLIC_*` variables or a browser bundle. The installer writes it only to the local server/runtime environment required by the Windows local-primary architecture.

## Caveat

A fresh custom Supabase project must allow the provided database credentials and API key to be used. If a Super Admin email already exists, the installer will fail rather than silently change an existing account's password.
