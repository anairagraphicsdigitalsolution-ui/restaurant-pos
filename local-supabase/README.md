# Anaira Local Supabase (production-style LAN mirror)

This folder bootstraps a self-hosted Supabase stack for the restaurant server. It is intentionally separate from the existing Next.js app so the current cloud setup is not broken.

The recommended production LAN setup is self-hosted Supabase with Docker Compose, not the Supabase CLI development stack.

## Setup

1. Install Docker Desktop on the restaurant server.
2. Run `scripts\\setup-local-supabase.ps1` as Administrator.
3. The script downloads the pinned self-hosted Supabase Docker configuration and starts it.
4. Set the generated local URL/key values in the app environment.
5. Run `scripts\\migrate-cloud-to-local.ps1` with the current cloud Postgres connection string.
6. Run `scripts\\migrate-storage-to-local.ps1` to copy Storage objects.
7. Start the Anaira app on the LAN server.

The local Supabase API is normally exposed on port 8000. Do not expose it directly to the public internet without a reverse proxy and security hardening.
