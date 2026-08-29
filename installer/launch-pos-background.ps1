$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Set-Location $root
$logDir=Join-Path $root 'logs'; New-Item -ItemType Directory -Force $logDir | Out-Null
$log=Join-Path $logDir 'anaira-pos.log'
function Log($m){Add-Content $log "$(Get-Date -Format s) $m"}

$deadline=(Get-Date).AddMinutes(2)
while((Get-Date)-lt $deadline){
  & docker info *> $null
  if($LASTEXITCODE -eq 0){break}
  Start-Sleep 3
}
try{
  & docker info *> $null
  if($LASTEXITCODE -ne 0){throw 'Docker Engine not ready.'}
  if(Test-Path (Join-Path $root 'supabase\config.toml')){
    npx --yes supabase@latest start *>> $log
    if($LASTEXITCODE -ne 0){throw 'Supabase start failed.'}
  }
  $env:HOST='127.0.0.1'; $env:PORT='3000'
  $env:ANAIRA_LOCAL_SERVER_ENABLED='true'; $env:ANAIRA_LOCAL_PRIMARY='true'
  Log 'Starting Anaira POS production server.'
  npm run start *>> $log
  Log "POS exited with code $LASTEXITCODE."
}catch{
  Log "POS launcher error: $($_.Exception.Message)"
  exit 1
}
