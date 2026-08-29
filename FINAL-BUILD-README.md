# Anaira POS — Final Build / Installer Notes

## Windows
Use `installer\AnairaPOS-Setup.iss` in Inno Setup Compiler.
The installer uses a premium Anaira-branded wizard and offers:
- Anaira account email/password login (restaurant UUID is resolved automatically).
- Advanced custom Supabase mode (Project URL, Project Ref, Anon/Public Key, DB password, email/password).
- In custom Supabase mode, bundled migrations are applied as schema only; source restaurant rows are not copied by `supabase db push`.

## Android
The Android build artifacts/source are preserved for Capacitor builds. The Android app should use bundled local assets and local-first storage; the release APK still must be physically tested in Airplane Mode before claiming full offline parity.

## Security
Do not put a Supabase service-role key in the Git repository. The normal installer flow does not request a cloud service-role key.
