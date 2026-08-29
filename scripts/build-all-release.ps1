$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
$root=Split-Path -Parent $PSScriptRoot; Set-Location $root
function step($n,$exe,$args){Write-Host "=== $n ===" -ForegroundColor Cyan; & $exe @args; if($LASTEXITCODE -ne 0){throw "$n failed ($LASTEXITCODE)"}}
step 'npm ci' 'npm' @('ci','--no-audit','--no-fund')
Remove-Item -Recurse -Force '.next' -ErrorAction SilentlyContinue
step 'Next build' 'npm' @('run','build')
if(!(Test-Path '.\android\gradlew.bat')){step 'Capacitor add android' 'npx' @('cap','add','android')}
step 'Capacitor sync' 'npx' @('cap','sync','android')
Push-Location android; try { step 'Gradle clean' '.\gradlew.bat' @('clean'); step 'APK debug' '.\gradlew.bat' @('assembleDebug') } finally {Pop-Location}
$apk=Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk'; if(!(Test-Path $apk)){throw 'APK not produced'}
$iscc=$null; foreach($p in @('C:\Program Files (x86)\Inno Setup 6\ISCC.exe','C:\Program Files\Inno Setup 6\ISCC.exe')){if(Test-Path $p){$iscc=$p;break}}
if($iscc){step 'Inno compile' $iscc @((Join-Path $root 'installer\AnairaPOS-Setup.iss'))}else{Write-Warning 'ISCC.exe not found; install Inno Setup and compile installer with installer\AnairaPOS-Setup.iss'}
Write-Host "APK: $apk" -ForegroundColor Green
