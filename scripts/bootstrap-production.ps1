$ErrorActionPreference = 'Stop'
Write-Host 'Anaira production bootstrap'
Write-Host '1) Install exact dependencies and generate/verify lockfile.'
npm install --ignore-scripts --no-audit --no-fund
if (!(Test-Path package-lock.json)) { throw 'package-lock.json was not generated.' }
Write-Host '2) Validate source syntax.'
npm run phase1:check
Write-Host '3) Run TypeScript check.'
npm run typecheck
Write-Host '4) Run production build.'
npm run build
Write-Host '5) Optional Windows installer.'
Write-Host '   npm run electron:build'
Write-Host '6) Android APK from the restored android/ project.'
Write-Host '   .\android\gradlew.bat -p android assembleDebug'
Write-Host 'Bootstrap/build sequence completed.'
