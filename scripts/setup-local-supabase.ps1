$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$target = Join-Path $root 'local-supabase/stack'
$tag = 'self-hosted/v0.8.0'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is required.' }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker Desktop is required.' }
if (-not (Test-Path $target)) {
  git clone --depth 1 --branch $tag https://github.com/supabase/supabase.git (Join-Path $root 'local-supabase/supabase-source')
  New-Item -ItemType Directory -Force $target | Out-Null
  Copy-Item -Recurse -Force (Join-Path $root 'local-supabase/supabase-source/docker/*') $target
}
Set-Location $target
if (-not (Test-Path '.env')) { Copy-Item '.env.example' '.env' }
Write-Host 'Local Supabase stack prepared.'
Write-Host 'IMPORTANT: review .env and replace every default password/secret before first production use.'
Write-Host 'Starting local Supabase...'
if (Test-Path 'run.sh') { throw 'run.sh is a Unix shell script. Use Docker Compose on Windows:' }
docker compose pull
docker compose up -d --wait
Write-Host 'Local Supabase is running. API: http://localhost:8000'
