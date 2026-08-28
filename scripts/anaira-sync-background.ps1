param(
  [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"
if (-not $ProjectRoot) { $ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path) }

$logDir = Join-Path $ProjectRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "anaira-sync-service.log"

function Log($m) {
  Add-Content -Path $log -Value "$(Get-Date -Format s) $m"
}

$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) {
  Log "npm.cmd not found."
  exit 20
}

Set-Location $ProjectRoot
Log "Background sync service starting."

while ($true) {
  try {
    Log "Starting sync worker."
    & $npm run sync:worker *>> $log
    $code = $LASTEXITCODE
    Log "Sync worker exited with code $code. Restarting in 5 seconds."
  } catch {
    Log "Worker exception: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 5
}
