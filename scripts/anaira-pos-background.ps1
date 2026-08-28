$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Set-Location $root
$logDir=Join-Path $root 'logs'; New-Item -ItemType Directory -Force $logDir | Out-Null
$log=Join-Path $logDir 'anaira-pos-background.log'
function Log($m){Add-Content $log "$(Get-Date -Format s) $m"}
Log 'POS launcher starting.'
$deadline=(Get-Date).AddSeconds(180)
while((Get-Date)-lt $deadline){
  docker info *> $null
  if($LASTEXITCODE -eq 0){break}
  Start-Sleep 2
}
try{
  docker info *> $null
  if($LASTEXITCODE -ne 0){throw 'Docker Engine not ready.'}
  if(Test-Path (Join-Path $root 'supabase\config.toml')){
    npx supabase start | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Supabase start failed.'}
  }
  $env:HOST='127.0.0.1'; $env:PORT='3000'
  $env:ANAIRA_LOCAL_SERVER_ENABLED='true'; $env:ANAIRA_LOCAL_PRIMARY='true'
  Log 'Starting npm run start.'
  npm run start *>> $log
  Log "POS exited with code $LASTEXITCODE."
}catch{Log "POS launcher error: $($_.Exception.Message)"; exit 1}
