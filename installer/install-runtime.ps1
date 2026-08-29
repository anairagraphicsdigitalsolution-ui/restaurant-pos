param(
  [Parameter(Mandatory=$true)][string]$ConfigFile
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$logPath = Join-Path $logDir 'installer.log'
function Log($m) {
  Add-Content -Path $logPath -Value "$(Get-Date -Format s) $m"
}

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable('Path','Machine')
  $user = [Environment]::GetEnvironmentVariable('Path','User')
  $env:Path = "$machine;$user"
}

function Ensure-Winget {
  if (Get-Command winget.exe -ErrorAction SilentlyContinue) { return }
  throw 'Windows App Installer (winget) is required. Please install Microsoft App Installer once and rerun setup.'
}

function Ensure-Node {
  if (Get-Command node.exe -ErrorAction SilentlyContinue) {
    Log 'Node.js already present.'
    return
  }

  $version = '24.20.0'
  $url = "https://nodejs.org/dist/v$version/node-v$version-x64.msi"
  $sha256 = '28b69132c35ccc033bf8a67cd10c9d75ef5822593363309da448f2afff2d8a'
  $tempMsi = Join-Path $env:TEMP "node-v$version-x64.msi"

  Log "Downloading Node.js LTS $version."
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $tempMsi
  $actual = (Get-FileHash -Path $tempMsi -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $sha256) {
    Remove-Item -Force -ErrorAction SilentlyContinue $tempMsi
    throw "Node.js download hash verification failed."
  }

  Log 'Installing Node.js LTS silently.'
  $p = Start-Process msiexec.exe -ArgumentList @('/i', $tempMsi, '/qn', '/norestart') -Wait -PassThru
  Remove-Item -Force -ErrorAction SilentlyContinue $tempMsi
  if ($p.ExitCode -notin @(0,3010)) { throw "Node.js installation failed with exit code $($p.ExitCode)." }
  Refresh-Path
  if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Node.js is still unavailable after installation.' }
}

function Ensure-Docker {
  if (Get-Command docker.exe -ErrorAction SilentlyContinue) {
    Log 'Docker CLI already present.'
  } else {
    Ensure-Winget
    Log 'Installing Docker Desktop via winget.'
    winget install --id Docker.DockerDesktop -e --accept-package-agreements --accept-source-agreements --silent --disable-interactivity | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Docker Desktop installation failed (winget exit code $LASTEXITCODE)." }
    Refresh-Path
  }
  if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI is unavailable. Restart Windows if Docker Desktop requested a reboot, then rerun setup.'
  }
}

function Start-Docker {
  $desktop = @(
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "$env:LOCALAPPDATA\Programs\Docker\Docker\Docker Desktop.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($desktop) {
    Log 'Starting Docker Desktop.'
    Start-Process $desktop -WindowStyle Hidden
  }
  $deadline = (Get-Date).AddMinutes(8)
  while ((Get-Date) -lt $deadline) {
    & docker info *> $null
    if ($LASTEXITCODE -eq 0) { return }
    Start-Sleep 4
  }
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Docker Engine did not become ready. Windows may require a restart/WSL2/virtualization setup.' }
}

try {
  $cfg = Get-Content -Raw -Path $ConfigFile | ConvertFrom-Json
  Log "Starting runtime installation. Restaurant=$($cfg.restaurantId) ProjectRef=$($cfg.projectRef)."

  Ensure-Node
  Ensure-Docker
  Start-Docker

  $env:ANAIRA_RESTAURANT_ID = [string]$cfg.restaurantId
  $env:NEXT_PUBLIC_SUPABASE_URL = [string]$cfg.cloudUrl
  $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = [string]$cfg.cloudAnonKey
  $env:SUPABASE_SERVICE_ROLE_KEY = [string]$cfg.cloudServiceRoleKey
  $env:SUPABASE_ACCESS_TOKEN = [string]$cfg.accessToken
  $env:SUPABASE_REFRESH_TOKEN = [string]$cfg.refreshToken
  $env:ANAIRA_SYNC_NODE = 'restaurant-local-server'
  $env:ANAIRA_LOCAL_PRIMARY = 'true'
  $env:NEXT_PUBLIC_ANAIRA_LOCAL_PRIMARY = 'true'
  $env:ANAIRA_LOCAL_SERVER_ENABLED = 'true'
  $env:NEXT_PUBLIC_APP_TIMEZONE = 'Asia/Kolkata'
  $env:LOCAL_DB_CONTAINER = 'supabase-db'
  $env:LOCAL_DB_USER = 'supabase_admin'
  $env:LOCAL_DB_NAME = 'postgres'

  $envFile = @(
    "NEXT_PUBLIC_SUPABASE_URL=$($cfg.cloudUrl)",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=$($cfg.cloudAnonKey)",
    "SUPABASE_SERVICE_ROLE_KEY=$($cfg.cloudServiceRoleKey)",
    "SUPABASE_ACCESS_TOKEN=$($cfg.accessToken)",
    "SUPABASE_REFRESH_TOKEN=$($cfg.refreshToken)",
    "ANAIRA_RESTAURANT_ID=$($cfg.restaurantId)",
    'ANAIRA_SYNC_NODE=restaurant-local-server',
    'ANAIRA_SYNC_INTERVAL_MS=5000',
    'ANAIRA_LOCAL_PRIMARY=true',
    'NEXT_PUBLIC_ANAIRA_LOCAL_PRIMARY=true',
    'ANAIRA_LOCAL_SERVER_ENABLED=true',
    'NEXT_PUBLIC_APP_TIMEZONE=Asia/Kolkata',
    'LOCAL_DB_CONTAINER=supabase-db',
    'LOCAL_DB_USER=supabase_admin',
    'LOCAL_DB_NAME=postgres'
  )
  Set-Content -Path (Join-Path $root '.env.local') -Value $envFile -Encoding UTF8
  Log '.env.local written.'

  # Optional: when Advanced Supabase mode is selected, provision ONLY the bundled schema/migrations.
  # `supabase db push` applies migrations and does not copy application table rows.
  if ($cfg.projectRef -and $cfg.dbPassword) {
    Log "Provisioning custom Supabase project $($cfg.projectRef) from bundled migrations only."
    npx --yes supabase@latest link --project-ref ([string]$cfg.projectRef) --password ([string]$cfg.dbPassword) --yes
    if ($LASTEXITCODE -ne 0) { throw 'Custom Supabase project linking failed.' }
    npx --yes supabase@latest db push
    if ($LASTEXITCODE -ne 0) { throw 'Custom Supabase schema migration failed.' }
    Log 'Custom Supabase schema migration completed; application rows were not copied by the installer.'
  }

  if (Test-Path (Join-Path $root 'supabase\config.toml')) {
    Log 'Starting local Supabase stack and applying local migrations.'
    npx --yes supabase@latest start
    if ($LASTEXITCODE -ne 0) { throw 'Local Supabase could not be started.' }
    npx --yes supabase@latest db push --local --yes
    if ($LASTEXITCODE -ne 0) { throw 'Local Supabase migrations failed.' }
  }

  if ($cfg.createSuperAdmin -and $cfg.cloudServiceRoleKey -and $cfg.superAdminEmail -and $cfg.superAdminPassword) {
    Log "Creating Super Admin in custom Supabase project."
    $saScript = Join-Path $root 'installer\provision-custom-super-admin.ps1'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $saScript `
      -SupabaseUrl ([string]$cfg.cloudUrl) `
      -ServiceRoleKey ([string]$cfg.cloudServiceRoleKey) `
      -Email ([string]$cfg.superAdminEmail) `
      -Password ([string]$cfg.superAdminPassword) `
      -RestaurantId ([string]$cfg.restaurantId)
    if ($LASTEXITCODE -ne 0) { throw 'Super Admin creation failed.' }
    Log 'Super Admin creation completed.'
  }

  # The local-primary Next server needs a local service-role key. Obtain it from the local Supabase stack when the Cloud service-role key is intentionally omitted.
  if ([string]::IsNullOrWhiteSpace([string]$cfg.cloudServiceRoleKey) -and (Test-Path (Join-Path $root 'supabase\config.toml'))) {
    try {
      $status = npx --yes supabase@latest status -o env 2>$null | Out-String
      $match = [regex]::Match($status, '(?m)^SERVICE_ROLE_KEY=(.+)$')
      if ($match.Success) {
        $localServiceRole = $match.Groups[1].Value.Trim().Trim('"')
        if ($localServiceRole) {
          $env:SUPABASE_LOCAL_SERVICE_ROLE_KEY = $localServiceRole
          $envFile += "SUPABASE_LOCAL_SERVICE_ROLE_KEY=$localServiceRole"
          Set-Content -Path (Join-Path $root '.env.local') -Value $envFile -Encoding UTF8
          Log 'Local Supabase service-role key provisioned from local stack.'
        }
      }
    } catch { Log "WARN: Could not read local Supabase service-role key: $($_.Exception.Message)" }
  }

  Log 'Installing Node dependencies.'
  if (Test-Path (Join-Path $root 'package-lock.json')) { npm ci } else { npm install }
  if ($LASTEXITCODE -ne 0) { throw 'npm dependency installation failed.' }

  Log 'Building production Next.js application.'
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Next.js production build failed.' }

  Log 'Installing automatic sync background task.'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\install-sync-background.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'Automatic sync task installation failed.' }

  Log 'Installing Docker/background app startup task.'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\install-docker-autostart.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'Docker autostart installation failed.' }

  $taskName = 'Anaira POS - Application'
  $ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $launcher = Join-Path $root 'installer\launch-pos-background.ps1'
  $action = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Log 'Application scheduled task installed.'

  Start-ScheduledTask -TaskName $taskName
  Log 'Anaira POS runtime installation completed successfully.'
  exit 0
}
catch {
  Log "ERROR: $($_.Exception.Message)"
  Write-Error $_.Exception.Message
  exit 1
}
