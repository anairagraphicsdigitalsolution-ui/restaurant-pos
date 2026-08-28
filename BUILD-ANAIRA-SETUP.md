# Anaira POS Setup Builder

This package contains the branded Inno Setup source for `Anaira-POS-Setup.exe`.

## Build on Windows

1. Install Inno Setup.
2. Open `installer\AnairaPOS.iss` in Inno Setup.
3. Click **Compile**.
4. The output will be `dist\Anaira-POS-Setup.exe`.

The installer copies the Anaira POS source, asks for the restaurant connection details, installs Node.js/Docker Desktop through WinGet when missing, starts the local Supabase stack, installs npm dependencies, builds the production app, installs Docker/sync/POS auto-start tasks, and starts the application.

### Important security note

Do not ship a shared Cloud `SUPABASE_SERVICE_ROLE_KEY` to untrusted customers. The current app's sync worker requires it, so this installer matches the current architecture but should be replaced by a per-restaurant authenticated sync credential/API before broad commercial distribution.
