# Anaira POS - Automatic Local Startup

This setup makes the local restaurant environment start automatically when the Windows user logs in.

## What it installs

1. `Anaira POS - Docker Auto-Start` — starts Docker Desktop at Windows logon.
2. `Anaira POS - Automatic Bidirectional Sync` — starts the sync worker at Windows logon and waits for Docker Engine to become ready before starting the worker.

The sync startup deliberately does **not** use `New-ScheduledTaskTrigger -Delay`, because that parameter is not available in Windows PowerShell versions commonly shipped with Windows.

## Install once

Run **PowerShell as Administrator** from the project root:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\install-local-autostart.ps1
```

The existing Docker Compose services use `restart: unless-stopped`, so once Docker Engine is available, containers can recover automatically after a reboot.

## Remove

```powershell
.\scripts\uninstall-automatic-sync-autostart.ps1
```

To remove the Docker task separately:

```powershell
Unregister-ScheduledTask -TaskName 'Anaira POS - Docker Auto-Start' -Confirm:$false
```

## Important

Do not distribute a real `.env.local` containing production secrets inside a customer ZIP. Each restaurant must receive its own restaurant ID and credentials.
