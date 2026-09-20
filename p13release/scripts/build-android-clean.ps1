$ErrorActionPreference = 'Stop'

Write-Host 'Anaira POS — clean Android debug build' -ForegroundColor Cyan

if (-not $env:ANDROID_HOME) { throw 'ANDROID_HOME is not set.' }
if (-not (Get-Command java -ErrorAction SilentlyContinue)) { throw 'Java is not installed.' }
if (-not (Get-Command adb -ErrorAction SilentlyContinue)) { Write-Warning 'adb was not found on PATH; APK build can still continue if Android SDK is configured.' }

if (-not (Test-Path '.\node_modules')) { npm ci }

# Clean generated web output and Android platform; this does not touch Supabase data.
Remove-Item -Recurse -Force '.\.next' -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force '.\android' -ErrorAction SilentlyContinue

npm run build
npx cap add android
npx cap sync android

$pkgDir = '.\android\app\src\main\java\in\anairapos\app'
New-Item -ItemType Directory -Force -Path $pkgDir | Out-Null
Copy-Item '.\android-native\AnairaLocalDbPlugin.kt' $pkgDir -Force
Copy-Item '.\android-native\AnairaSyncWorker.kt' $pkgDir -Force

# Register the custom SQLite bridge with Capacitor.
$main = '.\android\app\src\main\java\in\anairapos\app\MainActivity.java'
if (-not (Test-Path $main)) {
  @'
package in.anairapos.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AnairaLocalDbPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
'@ | Set-Content -Path $main -Encoding UTF8
}
else {
  $text = Get-Content $main -Raw
  if ($text -notmatch 'AnairaLocalDbPlugin') {
    $text = $text -replace '(import com\.getcapacitor\.BridgeActivity;)', '$1`r`n'
    $text = $text -replace '(public class MainActivity extends BridgeActivity \{)', '$1`r`n    @Override`r`n    public void onCreate(android.os.Bundle savedInstanceState) {`r`n        registerPlugin(AnairaLocalDbPlugin.class);`r`n        super.onCreate(savedInstanceState);`r`n    }'
    Set-Content -Path $main -Value $text -Encoding UTF8
  }
}

# Add WorkManager dependency only if it is not already present.
$gradle = '.\android\app\build.gradle'
if (Test-Path $gradle) {
  $g = Get-Content $gradle -Raw
  if ($g -notmatch 'androidx\.work:work-runtime-ktx') {
    $g = $g -replace '(dependencies\s*\{)', '$1`r`n    implementation "androidx.work:work-runtime-ktx:2.10.1"'
    Set-Content -Path $gradle -Value $g -Encoding UTF8
  }
}

Push-Location '.\android'
try {
  .\gradlew.bat clean
  .\gradlew.bat assembleDebug
}
finally { Pop-Location }

Write-Host 'APK:' (Resolve-Path '.\android\app\build\outputs\apk\debug\app-debug.apk') -ForegroundColor Green
