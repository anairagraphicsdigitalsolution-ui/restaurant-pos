$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$iss = Join-Path $PSScriptRoot 'AnairaPOS-Setup.iss'
$possible = @(
  (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
  (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
) | Where-Object { $_ -and (Test-Path $_) }
if (-not $possible) {
  throw 'Inno Setup Compiler (ISCC.exe) was not found. Install Inno Setup, then run this script again.'
}
$out = Join-Path $PSScriptRoot 'output'
New-Item -ItemType Directory -Force $out | Out-Null
& $possible[0] $iss
if ($LASTEXITCODE -ne 0) { throw "Inno Setup compilation failed with exit code $LASTEXITCODE." }
Write-Host "Installer created under: $out" -ForegroundColor Green
