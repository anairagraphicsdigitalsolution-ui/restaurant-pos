@echo off
setlocal
cd /d "%~dp0\..\.."
echo ===============================================
echo Anaira MPT-III Print Bridge
echo ===============================================
echo Starting: %~dp0AnairaPrintBridge.ps1
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0AnairaPrintBridge.ps1"
echo.
echo Bridge exited with code %ERRORLEVEL%.
echo Log: %APPDATA%\Anaira\print-bridge.log
pause
