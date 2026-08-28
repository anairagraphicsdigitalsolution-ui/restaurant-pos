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

Write-Log "Anaira customer installation started for restaurant $RestaurantId."

# Check/install Node and Docker via WinGet when available.
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  if (Get-Command winget.exe -ErrorAction SilentlyContinue) {
    winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements --silent
  }
}
if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) {
  if (Get-Command winget.exe -ErrorAction SilentlyContinue) {
    winget install --id Docker.DockerDesktop -e --accept-package-agreements --accept-source-agreements --silent
  }
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
$docker = Get-Command docker.exe -ErrorAction SilentlyContinue
if (-not $node) { throw "Node.js could not be installed. Install Node.js LTS and rerun Anaira POS Setup." }
if (-not $docker) { throw "Docker Desktop could not be installed. Install Docker Desktop and rerun Anaira POS Setup." }

# Start Docker Desktop.
$dockerDesktop = @(
  "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
  "$env:LOCALAPPDATA\Programs\Docker\Docker\Docker Desktop.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($dockerDesktop) { Start-Process $dockerDesktop -WindowStyle Hidden }

$deadline=(Get-Date).AddSeconds(240)
while((Get-Date)-lt $deadline) {
  docker info *> $null
  if($LASTEXITCODE -eq 0){break}
  Start-Sleep 3
}
docker info *> $null
if($LASTEXITCODE -ne 0){throw "Docker Engine did not become ready within 240 seconds."}

# Install JS dependencies.
if(Test-Path (Join-Path $root 'package-lock.json')) { npm ci } else { npm install }
if($LASTEXITCODE -ne 0){throw "npm dependency installation failed."}

# Start the local Supabase stack. This downloads missing Docker images automatically.
if(Test-Path (Join-Path $root 'supabase\config.toml')) {
  npx supabase start
  if($LASTEXITCODE -ne 0){throw "Local Supabase could not be started."}
}

# Read local Supabase credentials without printing secrets.
$status = npx supabase status -o env 2>$null
if($LASTEXITCODE -ne 0){throw "Could not read local Supabase status."}
$map=@{}
foreach($line in ($status -split "`r?`n")){
  if($line -match '^([^=]+)=(.*)$'){$map[$matches[1]]=$matches[2].Trim('"')}
}
$localUrl=$map['API_URL']
$localAnon=$map['ANON_KEY']
$localService=$map['SERVICE_ROLE_KEY']
if(-not $localUrl -or -not $localAnon -or -not $localService){throw "Local Supabase credentials were not available."}

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
  "NEXT_PUBLIC_LOCAL_SUPABASE_SERVICE_ROLE_KEY=$localService"
  "LOCAL_DATABASE_URL=postgresql://supabase_admin@127.0.0.1:54322/postgres"
  "LOCAL_DB_CONTAINER=supabase-db"
  "LOCAL_DB_USER=supabase_admin"
  "LOCAL_DB_NAME=postgres"
  "NEXT_PUBLIC_APP_TIMEZONE=Asia/Kolkata"
)
Set-Content -Path $envPath -Value $lines -Encoding UTF8

# Build once for production use.
npm run build
if($LASTEXITCODE -ne 0){throw "Anaira POS production build failed."}

# Install existing auto-start tasks.
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
& (Join-Path $root 'scripts\install-docker-autostart.ps1')
& (Join-Path $root 'scripts\install-sync-background.ps1')

# POS auto-start task: start Next.js production server hidden.
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
