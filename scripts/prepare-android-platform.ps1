$ErrorActionPreference = 'Stop'
if (-not (Test-Path '.\node_modules')) { npm install }
if (-not (Test-Path '.\android')) { npx cap add android }
npx cap sync android
Write-Host 'Android platform prepared. Native integration files are in android-native/.'
