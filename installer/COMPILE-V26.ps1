$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$iss = Join-Path $PSScriptRoot "AnairaPOS-Setup.iss"
$out = Join-Path $PSScriptRoot "output"
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force -Path $out | Out-Null
$iscc = @("$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe", "$env:ProgramFiles(x86)\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw "Inno Setup ISCC.exe not found." }
& $iscc $iss
if ($LASTEXITCODE -ne 0) { throw "Inno Setup compilation failed." }
Write-Host "Built: $out\AnairaPOS-Setup.exe"
