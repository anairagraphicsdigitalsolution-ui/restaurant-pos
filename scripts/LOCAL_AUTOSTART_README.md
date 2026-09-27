# Anaira POS - Local Docker + Automatic Sync Auto-Start

Run PowerShell **as Administrator** from the project root:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\install-local-autostart.ps1
```

This configures Docker Desktop to start at Windows logon, then waits for the
Docker Engine and starts `local-server/docker-compose.yml`. It also installs
the existing automatic bidirectional sync task.

Tasks:
- `Anaira POS - Local Docker Stack`
- `Anaira POS - Automatic Bidirectional Sync`

Check:
```powershell
Get-ScheduledTask -TaskName "Anaira POS - Local Docker Stack" | Select TaskName,State
Get-ScheduledTask -TaskName "Anaira POS - Automatic Bidirectional Sync" | Select TaskName,State
docker ps
```

Remove:
```powershell
.\scripts\uninstall-local-autostart.ps1
```

Do not distribute real `.env.local` cloud/service-role secrets in a public
installer. Each restaurant installation needs its own secure credentials and
restaurant ID.
