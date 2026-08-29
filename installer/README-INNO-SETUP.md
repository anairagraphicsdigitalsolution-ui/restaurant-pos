# Anaira POS — Inno Setup Installer

Open `installer/AnairaPOS-Setup.iss` in Inno Setup Compiler and compile.

The generated installer:

1. Installs the Anaira POS application files.
2. During installation, checks for Node.js and installs the official Node.js 24.20.0 LTS x64 MSI when missing. The download is SHA-256 verified before installation.
3. Checks for Docker Desktop and installs it through Windows Package Manager (`winget`) when missing.
4. Starts Docker Desktop and waits for the engine.
5. Starts the local Supabase stack and applies local migrations.
6. Runs `npm ci` and `npm run build`.
7. Installs the existing automatic sync background task.
8. Installs an automatic Anaira POS application task.
9. Creates desktop/Start Menu shortcuts.

The installer asks for restaurant UUID, Supabase URL, service-role key, and optional anon/public key. The service-role key is written only to the server-side `.env.local`; it is not put in any `NEXT_PUBLIC_*` variable.

Important: Docker Desktop may require Windows/WSL2/virtualization prerequisites or a reboot on some machines. Inno Setup cannot bypass those operating-system prerequisites.
