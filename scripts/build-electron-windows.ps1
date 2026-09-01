param(
    [switch]$CreateInstaller
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

$root = (Get-Location).Path
$out = Join-Path $root "installer\output"
$appOut = Join-Path $out "win-unpacked"
$appDir = Join-Path $appOut "resources\app"
$electronDist = Join-Path $root "node_modules\electron\dist"

Write-Host "Cleaning previous Windows Electron output..."
Remove-Item $appOut -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $appDir | Out-Null

if (-not (Test-Path (Join-Path $electronDist "electron.exe"))) {
    throw "Electron runtime not found. Run npm install first."
}

Write-Host "Building Next.js standalone..."
npm run build
if ($LASTEXITCODE -ne 0) { throw "Next.js build failed." }

Write-Host "Copying Electron runtime..."
Copy-Item (Join-Path $electronDist "*") $appOut -Recurse -Force

Write-Host "Copying Electron application..."
Copy-Item ".\electron" $appDir -Recurse -Force
Copy-Item ".\package.json" $appDir -Force
Copy-Item ".\public" $appDir -Recurse -Force
# Cloud runtime configuration for the packaged Next server.
if (Test-Path ".\.env.local") {
    Copy-Item ".\.env.local" $appDir -Force
}

Write-Host "Copying Next.js standalone output..."
$standaloneSource = Join-Path $root ".next\standalone"
$standaloneTarget = Join-Path $appDir ".next\standalone"

if (-not (Test-Path (Join-Path $standaloneSource "server.js"))) {
    throw "Next.js standalone server.js was not found: $standaloneSource"
}

New-Item -ItemType Directory -Force $standaloneTarget | Out-Null

# Use Robocopy for the standalone tree. Copy-Item can fail when nested
# node_modules entries already exist as leaf/container conflicts.
& robocopy $standaloneSource $standaloneTarget /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
$robocopyExit = $LASTEXITCODE
if ($robocopyExit -gt 7) {
    throw "Failed to copy Next.js standalone output. Robocopy exit code: $robocopyExit"
}

# Next standalone expects static assets relative to its own .next directory.
$standaloneNext = Join-Path $appDir ".next\standalone\.next"
New-Item -ItemType Directory -Force $standaloneNext | Out-Null
$staticSource = Join-Path $root ".next\static"
$staticTarget = Join-Path $standaloneNext "static"
New-Item -ItemType Directory -Force $staticTarget | Out-Null
& robocopy $staticSource $staticTarget /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
$robocopyExit = $LASTEXITCODE
if ($robocopyExit -gt 7) {
    throw "Failed to copy Next.js static assets. Robocopy exit code: $robocopyExit"
}

# Windows Electron does not need Capacitor Android native artifacts.
$standaloneNodeModules = Join-Path $appDir ".next\standalone\node_modules"
$androidPackages = @(
    "@capacitor\android",
    "@capacitor\cli",
    "@capacitor\core"
)
foreach ($pkg in $androidPackages) {
    $pkgPath = Join-Path $standaloneNodeModules $pkg
    if (Test-Path $pkgPath) { Remove-Item $pkgPath -Recurse -Force -ErrorAction SilentlyContinue }
}
# Public assets are copied next to the standalone server's root as expected by Next.
Copy-Item ".\public" (Join-Path $appDir ".next\standalone\public") -Recurse -Force

# Installer/shortcut branding asset.
Copy-Item ".\installer\Anaira-Restaurant-POS.ico" (Join-Path $appOut "Anaira-Restaurant-POS.ico") -Force

# Rename Electron executable to the product name.
$electronExe = Join-Path $appOut "electron.exe"
$productExe = Join-Path $appOut "Anaira Restaurant POS.exe"
if (Test-Path $productExe) { Remove-Item $productExe -Force }
Rename-Item $electronExe "Anaira Restaurant POS.exe"

# Create a small package.json specifically for the Electron app root.
$appPackage = @{
    name = "anaira-restaurant-pos"
    version = "1.0.0"
    main = "electron/main.cjs"
}
$appPackage | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $appDir "package.json") -Encoding UTF8

$exe = Join-Path $appOut "Anaira Restaurant POS.exe"
if (-not (Test-Path $exe)) {
    throw "Electron Windows app was not created: $exe"
}

Write-Host ""
Write-Host "Electron Windows app created successfully:"
Write-Host (Resolve-Path $exe)

if ($CreateInstaller) {
    $isccCandidates = @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "${env:ProgramFiles}\Inno Setup 6\ISCC.exe"
    )

    $iscc = $isccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $iscc) {
        throw "Inno Setup 6 ISCC.exe was not found."
    }

    Write-Host "Compiling branded Inno Setup installer..."
    & $iscc ".\installer\Anaira-Restaurant-POS.iss"
    if ($LASTEXITCODE -ne 0) {
        throw "Inno Setup compilation failed."
    }

    Write-Host ""
    Write-Host "Installer created successfully:"
    Write-Host (Resolve-Path ".\installer\installer-build\Anaira-Restaurant-POS-Setup-1.0.0.exe")
}
