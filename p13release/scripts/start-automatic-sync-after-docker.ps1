$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$timeoutSeconds = 180
$deadline = (Get-Date).AddSeconds($timeoutSeconds)

while ((Get-Date) -lt $deadline) {
  try {
    docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
  } catch {}
  Start-Sleep -Seconds 2
}

try {
  docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Docker Engine did not become ready within 180 seconds.' }
} catch {
  throw $_
}

& (Join-Path $root 'scripts\start-automatic-sync.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
