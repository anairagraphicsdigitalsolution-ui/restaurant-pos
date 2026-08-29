# V25 Audit

Base: Anaira-POS-PREMIUM-INNO-ANDROID-V24.zip

Changes verified:
- Premium Inno Setup flow preserved.
- Normal setup is Email + Password only; Restaurant UUID is resolved by the Anaira installer login endpoint.
- Advanced custom Supabase path supports optional existing Restaurant UUID.
- Optional Create Super Admin flow added.
- Service Role Key required only when Super Admin creation is selected.
- Custom Supabase schema/migrations are applied before Super Admin creation.
- Super Admin is created through the Supabase Auth admin endpoint and linked to `public.profiles` with role `super_admin`.
- Existing application rows are not copied by the installer; provisioning relies on bundled migrations.
- Existing Android/Offline/Sync files preserved from V24.
- JS syntax checks passed for modified/related installer and sync API files.

Known limitation:
- Inno Setup Compiler and physical device execution are not available in this build environment, so the final Windows EXE and APK binaries were not compiled here.
