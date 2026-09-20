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

# The packaged Windows app is Cloud-only. Require the Cloud runtime
# credentials at build time and explicitly disable all legacy local-mode
# switches for the Electron/Next.js process.
$envFile = Join-Path $root ".env.local"
if (-not (Test-Path $envFile)) {
    throw ".env.local not found. Create it with the Cloud Supabase credentials before building the Windows app."
}

$envText = Get-Content $envFile -Raw
$requiredCloudKeys = @(
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY"
)
foreach ($key in $requiredCloudKeys) {
    if ($envText -notmatch "(?m)^\s*$([regex]::Escape($key))\s*=") {
        throw "Required Cloud Supabase variable is missing from .env.local: $key"
    }
}

$env:NEXT_PUBLIC_ANAIRA_LOCAL_PRIMARY = "false"
$env:ANAIRA_LOCAL_PRIMARY = "false"
$env:ANAIRA_LOCAL_SERVER_ENABLED = "false"
Remove-Item Env:NEXT_PUBLIC_LOCAL_SUPABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:NEXT_PUBLIC_LOCAL_SUPABASE_ANON_KEY -ErrorAction SilentlyContinue
Remove-Item Env:ANAIRA_LOCAL_SUPABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:ANAIRA_LOCAL_SUPABASE_ANON_KEY -ErrorAction SilentlyContinue
Remove-Item Env:SUPABASE_LOCAL_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:ANAIRA_LOCAL_SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:LOCAL_DATABASE_URL -ErrorAction SilentlyContinue

# Force the packaged Electron build to use Cloud Supabase values from .env.local.
$envFile = Join-Path $root ".env.local"
if (-not (Test-Path $envFile)) { throw "Cloud configuration file not found: $envFile" }

$legacyKeys = @(
    "ANAIRA_LOCAL_PRIMARY","NEXT_PUBLIC_ANAIRA_LOCAL_PRIMARY",
    "NEXT_PUBLIC_LOCAL_SUPABASE_URL","NEXT_PUBLIC_LOCAL_SUPABASE_ANON_KEY",
    "LOCAL_DATABASE_URL","DATABASE_URL","LOCAL_SUPABASE_URL","LOCAL_SUPABASE_ANON_KEY"
)
foreach ($key in $legacyKeys) { Remove-Item "Env:$key" -ErrorAction SilentlyContinue }

$cloudKeys = @("NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY")
foreach ($rawLine in Get-Content $envFile) {
    $line=$rawLine.Trim()
    if (-not $line -or $line.StartsWith("#")) { continue }
    $eq=$line.IndexOf("=")
    if ($eq -le 0) { continue }
    $key=$line.Substring(0,$eq).Trim()
    $value=$line.Substring($eq+1).Trim()
    if ($key -in $cloudKeys) {
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value=$value.Substring(1,$value.Length-2)
        }
        if ([string]::IsNullOrWhiteSpace($value)) { throw "Cloud environment value is empty: $key" }
        Set-Item "Env:$key" $value
    }
}
foreach ($key in $cloudKeys) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($key,"Process"))) {
        throw "Required Cloud Supabase environment variable is missing: $key"
    }
}
if ($env:NEXT_PUBLIC_SUPABASE_URL -notmatch '^https://[A-Za-z0-9._-]+\.supabase\.co/?$') {
    throw "Electron build requires a Cloud Supabase URL (.supabase.co). Got: $($env:NEXT_PUBLIC_SUPABASE_URL)"
}
$env:NEXT_PUBLIC_SUPABASE_URL=$env:NEXT_PUBLIC_SUPABASE_URL.TrimEnd("/")
Write-Host "Cloud Supabase build configuration validated: $($env:NEXT_PUBLIC_SUPABASE_URL)"

Write-Host "Building Next.js standalone in Cloud-only mode..."
npm run build
if ($LASTEXITCODE -ne 0) { throw "Next.js build failed." }

Write-Host "Copying Electron runtime..."
Copy-Item (Join-Path $electronDist "*") $appOut -Recurse -Force

Write-Host "Copying Electron application..."
Copy-Item ".\electron" $appDir -Recurse -Force
Copy-Item ".\package.json" $appDir -Force
Copy-Item ".\public" $appDir -Recurse -Force
# Cloud runtime configuration for the packaged Next server.
Copy-Item ".\.env.local" $appDir -Force

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
