# Anaira POS — One-Click Customer Installation Package

## Goal
Install once, then at Windows login Anaira starts its local Docker stack, local database, sync infrastructure, and production POS server automatically.

## Before packaging for customers
1. Build the Next.js app for production (`npm run build`).
2. Ensure the project's production `start` script exists.
3. Do NOT distribute developer `.env.local` files or service-role secrets.
4. Give each restaurant its own restaurant ID and securely provision its cloud credentials.

## One-time setup (Administrator PowerShell)
```powershell
cd "D:\my soft saas\restaurant-pos"
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\install-one-click-autostart.ps1
```

After installation, Windows login starts:
- Docker Desktop (if installed)
- Docker Compose local stack
- Anaira POS production server
- Existing automatic sync infrastructure

## Important
Docker Desktop must still be installed on the PC in this Docker-based architecture. The installer automates startup/configuration; it does not legally redistribute Docker Desktop itself.

For a true single `Anaira-Setup.exe`, use an installer builder such as Inno Setup or WiX and package the application/runtime. Docker Desktop installation should be handled as a prerequisite or by an approved enterprise deployment process.
