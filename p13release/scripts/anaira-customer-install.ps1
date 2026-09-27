param(
  [Parameter(Mandatory=$true)][string]$RestaurantId,
  [Parameter(Mandatory=$true)][string]$CloudUrl,
  [Parameter(Mandatory=$true)][string]$CloudServiceRoleKey,
  [string]$CloudAnonKey = ""
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Write-Log($m) {
  $dir = Join-Path $root "logs"
  New-Item -ItemType Directory -Force $dir | Out-Null
  Add-Content (Join-Path $dir "installer.log") "$(Get-Date -Format s) $m"
}
function Refresh-Path {
  $machine=[Environment]::GetEnvironmentVariable('Path','Machine')
  $user=[Environment]::GetEnvironmentVariable('Path','User')
  $env:Path="$machine;$user"
}
function Ensure-WingetPackage([string]$Id,[string]$Name) {
  if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    throw "Windows App Installer (winget) is required to automatically install $Name. Please install App Installer from Microsoft Store and run setup again."
  }
  Write-Log "Installing/checking $Name ($Id)."
  winget install --id $Id -e --accept-package-agreements --accept-source-agreements --silent --disable-interactivity | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "$Name installation failed (winget exit code $LASTEXITCODE)." }
  Refresh-Path
}

Write-Log "Anaira customer installation started for restaurant $RestaurantId."

# The installer is intentionally dependency-aware: it installs the runtime tools
# needed by this local-first build instead of assuming they already exist.
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  Ensure-WingetPackage 'OpenJS.NodeJS.LTS' 'Node.js LTS'
}
if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) {
  Ensure-WingetPackage 'Docker.DockerDesktop' 'Docker Desktop'
}
Refresh-Path

$node = Get-Command node.exe -ErrorAction SilentlyContinue
$docker = Get-Command docker.exe -ErrorAction SilentlyContinue
if (-not $node) { throw "Node.js LTS is not available after installation. Restart Windows and run Anaira POS Setup again." }
if (-not $docker) { throw "Docker Desktop is not available after installation. Restart Windows and run Anaira POS Setup again." }

# Start Docker Desktop and wait for the engine. Docker Desktop includes Compose,
# so no separate Docker Compose installation is required.
$dockerDesktop = @(
  "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
  "$env:LOCALAPPDATA\Programs\Docker\Docker\Docker Desktop.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($dockerDesktop) { Start-Process $dockerDesktop -WindowStyle Hidden }

$deadline=(Get-Date).AddMinutes(6)
while((Get-Date)-lt $deadline) {
  docker info *> $null
  if($LASTEXITCODE -eq 0){ break }
  Start-Sleep 4
}
docker info *> $null
if($LASTEXITCODE -ne 0){
  throw "Docker Engine is not ready. Docker Desktop may require WSL2/virtualization or a Windows restart. Restart Windows and run Anaira POS Setup again."
}

# Supabase CLI is fetched through npx; this avoids installing a second global CLI
# and automatically downloads the CLI/Docker images required by local Supabase.
if(Test-Path (Join-Path $root 'supabase\config.toml')) {
  Write-Log "Starting local Supabase. Missing CLI/package and Docker images will be downloaded automatically."
  npx --yes supabase@latest start
  if($LASTEXITCODE -ne 0){ throw "Local Supabase could not be started." }
  Write-Log "Applying pending application migrations to the fresh/local database."
  npx --yes supabase@latest db push --local --yes
  if($LASTEXITCODE -ne 0){ throw "Local Anaira database migrations could not be applied." }
}

$status = npx --yes supabase@latest status -o env 2>$null
if($LASTEXITCODE -ne 0){throw "Could not read local Supabase status."}
$map=@{}
foreach($line in ($status -split "`r?`n")){
  if($line -match '^([^=]+)=(.*)$'){$map[$matches[1]]=$matches[2].Trim('"')}
}
$localUrl=$map['API_URL']
$localAnon=$map['ANON_KEY']
$localService=$map['SERVICE_ROLE_KEY']
if(-not $localUrl -or -not $localAnon -or -not $localService){throw "Local Supabase credentials were not available."}

# Write only the restaurant-scoped runtime configuration. Cloud service role is
# server-side only; it is never written to NEXT_PUBLIC_* variables.
$envPath=Join-Path $root '.env.local'
$lines=@(
  "NEXT_PUBLIC_SUPABASE_URL=$CloudUrl"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY=$CloudAnonKey"
  "SUPABASE_SERVICE_ROLE_KEY=$CloudServiceRoleKey"
  "ANAIRA_RESTAURANT_ID=$RestaurantId"
  "ANAIRA_SYNC_NODE=restaurant-local-server"
  "ANAIRA_SYNC_INTERVAL_MS=5000"
  "ANAIRA_LOCAL_PRIMARY=true"
  "NEXT_PUBLIC_ANAIRA_LOCAL_PRIMARY=true"
  "ANAIRA_LOCAL_SERVER_ENABLED=true"
  "NEXT_PUBLIC_LOCAL_SUPABASE_URL=$localUrl"
  "NEXT_PUBLIC_LOCAL_SUPABASE_ANON_KEY=$localAnon"
  "SUPABASE_LOCAL_SERVICE_ROLE_KEY=$localService"
  "LOCAL_DATABASE_URL=postgresql://supabase_admin@127.0.0.1:54322/postgres"
  "LOCAL_DB_CONTAINER=supabase-db"
  "LOCAL_DB_USER=supabase_admin"
  "LOCAL_DB_NAME=postgres"
  "NEXT_PUBLIC_APP_TIMEZONE=Asia/Kolkata"
)
Set-Content -Path $envPath -Value $lines -Encoding UTF8

# Install application dependencies and build the existing Next.js application.
if(Test-Path (Join-Path $root 'package-lock.json')) { npm ci } else { npm install }
if($LASTEXITCODE -ne 0){throw "npm dependency installation failed."}
npm run build
if($LASTEXITCODE -ne 0){throw "Anaira POS production build failed."}

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
foreach($script in @('install-docker-autostart.ps1','install-sync-background.ps1')) {
  $p=Join-Path $root "scripts\$script"
  if(Test-Path $p){ & $p; if($LASTEXITCODE -ne 0){ throw "$script failed." } }
}

$taskName='Anaira POS - Application'
$ps="$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$launcher=Join-Path $root 'scripts\anaira-pos-background.ps1'
$action=New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal=New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Log "Anaira customer installation completed."
Write-Host "Anaira POS installation completed successfully." -ForegroundColor Green
