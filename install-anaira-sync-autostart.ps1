$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "scripts\install-automatic-sync-autostart.ps1"
if (-not (Test-Path $script)) { throw "Installer script not found: $script" }
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script
