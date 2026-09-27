$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Starting Anaira local PostgreSQL..." -ForegroundColor Cyan
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "Docker Desktop is required for the Phase 1 local database. Install/start Docker Desktop first."
}

$envFile = Join-Path $root "local-server/.env"
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $root "local-server/.env.example") $envFile
  Write-Host "Created local-server/.env. Change LOCAL_DB_PASSWORD before production use." -ForegroundColor Yellow
}

docker compose --env-file $envFile -f local-server/docker-compose.yml up -d

$env:HOST = "0.0.0.0"
$env:PORT = "3000"
$env:ANAIRA_LOCAL_SERVER_ENABLED = "true"
$env:ANAIRA_LOCAL_SERVER_HOST = "0.0.0.0"
$env:ANAIRA_LOCAL_SERVER_PORT = "3000"
$env:ANAIRA_LOCAL_DATA_DIR = $root
# Export local DB settings to the Next.js process as well as Docker Compose.
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$' -and $matches[1] -notmatch '^#') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
    Set-Item -Path ("Env:" + $matches[1]) -Value $matches[2]
  }
}
$env:LOCAL_DB_CONTAINER = "anaira-pos-postgres"

Write-Host "Anaira POS local server: http://localhost:3000" -ForegroundColor Green
Write-Host "LAN access: http://<LOCAL-SERVER-IP>:3000" -ForegroundColor Green
npm run dev -- --hostname 0.0.0.0 --port 3000
