$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$composeFile = Join-Path $root "local-server\docker-compose.yml"
if (-not (Test-Path $composeFile)) { throw "Docker Compose file not found: $composeFile" }
if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) { throw "docker.exe is not available on PATH. Start Docker Desktop and retry." }
$deadline = (Get-Date).AddMinutes(3)
while ((Get-Date) -lt $deadline) {
  & docker info *> $null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 3
}
& docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker Engine did not become ready within 3 minutes." }
& docker compose -f $composeFile up -d
if ($LASTEXITCODE -ne 0) { throw "Anaira local Docker stack failed to start." }
