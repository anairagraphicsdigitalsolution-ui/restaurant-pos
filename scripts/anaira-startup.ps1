param(
  [string]$ProjectRoot = "",
  [int]$DockerWaitSeconds = 180
)

$ErrorActionPreference = "Stop"
if (-not $ProjectRoot) { $ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path) }

function Write-Log($m) {
  $log = Join-Path $ProjectRoot "logs\anaira-launcher.log"
  New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
  Add-Content -Path $log -Value "$(Get-Date -Format s) $m"
}

Write-Log "Launcher starting."

# Start Docker Desktop if installed.
$dockerDesktop = @(
  "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
  "$env:LOCALAPPDATA\Programs\Docker\Docker\Docker Desktop.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($dockerDesktop) {
  Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
  Write-Log "Docker Desktop start requested."
} else {
  Write-Log "Docker Desktop executable not found."
}

# Wait for Docker engine.
$deadline = (Get-Date).AddSeconds($DockerWaitSeconds)
while ((Get-Date) -lt $deadline) {
  try {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { break }
  } catch {}
  Start-Sleep -Seconds 2
}

try {
  docker info *> $null
  if ($LASTEXITCODE -ne 0) { throw "Docker Engine is not ready." }
} catch {
  Write-Log $_.Exception.Message
  exit 10
}

# Start the local Supabase compose stack when present.
$composeCandidates = @(
  (Join-Path $ProjectRoot "server\docker\docker-compose.yml"),
  (Join-Path $ProjectRoot "docker\docker-compose.yml"),
  (Join-Path $ProjectRoot "docker-compose.yml")
)
$compose = $composeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($compose) {
  Push-Location (Split-Path $compose)
  try {
    docker compose up -d | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "docker compose up failed." }
    Write-Log "Local Docker stack started."
  } finally { Pop-Location }
}

# Start production Next server if package.json has start script.
$pkg = Join-Path $ProjectRoot "package.json"
if (Test-Path $pkg) {
  try {
    $package = Get-Content $pkg -Raw | ConvertFrom-Json
    if ($package.scripts.start) {
      Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c","cd /d `"$ProjectRoot`" && npm run start" `
        -WorkingDirectory $ProjectRoot `
        -WindowStyle Hidden
      Write-Log "Anaira POS production server started."
    }
  } catch {
    Write-Log "POS production server not started: $($_.Exception.Message)"
  }
}

Write-Log "Launcher finished."
