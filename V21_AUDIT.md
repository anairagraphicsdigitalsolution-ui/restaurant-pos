# Anaira POS V21 Audit

Base: refined V19 Inno Setup package.

Applied:
- Inno Setup icon paths changed to .ico.
- [Files] Excludes changed to comma-separated patterns so node_modules/.next/android/installer output are excluded.
- Shortcut icon paths use AnairaPOS.ico.
- Android V20 offline boot/cache/order improvements carried forward.

Verified statically:
- All source JS/MJS/CJS files pass node --check when their syntax is available to the runtime.
- Required V20 offline files are present.
- The installer script no longer references BMP in SetupIconFile.

Not claimed:
- A production APK/EXE binary build, because the isolated build environment cannot reliably download npm/Gradle dependencies or run the user's Inno Setup Compiler.
- 100% offline parity for server-backed Next.js routes; the current Android design still relies on the remote Next.js server for features that do not have native/local implementations.
