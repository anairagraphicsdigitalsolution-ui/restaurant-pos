# Advanced Supabase + Super Admin

The premium installer has two paths:

1. **Sign in with Anaira Account** — Email + Password. Restaurant UUID is resolved automatically by the Anaira portal.
2. **Advanced — Use my own Supabase** — Project URL, Project Ref, Anon/Public Key, Database Password, optional Service Role Key, optional existing Restaurant UUID, and an optional Create Super Admin step.

When Create Super Admin is selected:
- Schema/migrations are applied to the target project.
- No application rows are copied by the installer.
- The installer creates a confirmed Auth user using the Service Role Key.
- A matching `public.profiles` row is upserted with `role = super_admin`.
- Restaurant UUID may be blank; a Super Admin with no tenant can create restaurants from the software.

Never put a Service Role Key in a browser/client bundle or NEXT_PUBLIC_* variable.
