$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$envFile = Join-Path $root "local-server/.env"
if (Test-Path $envFile) {
  docker compose --env-file $envFile -f local-server/docker-compose.yml stop
} else {
  docker compose -f local-server/docker-compose.yml stop
}
