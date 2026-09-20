$ErrorActionPreference = "Stop"

# Anaira Phase 5 local runtime for the existing custom Supabase Compose stack.
# Do NOT call the Supabase CLI here: this installation is managed by
# D:\my soft saas\Anairat-POS-Enterprise\server\docker.

$stack = 'D:\my soft saas\Anairat-POS-Enterprise\server\docker'
if (-not (Test-Path $stack)) {
  throw "Restaurant Supabase Compose stack was not found at $stack"
}

Write-Host "Anaira POS - Local Supabase Compose stack" -ForegroundColor Cyan
Set-Location $stack
docker compose up -d --wait
docker compose ps
