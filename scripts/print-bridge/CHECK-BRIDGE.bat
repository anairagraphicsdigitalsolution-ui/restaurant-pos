@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-RestMethod 'http://127.0.0.1:3211/health' -TimeoutSec 3; Write-Host 'ANAIRA PRINT BRIDGE: RUNNING' -ForegroundColor Green; $r | ConvertTo-Json -Depth 6 } catch { Write-Host 'ANAIRA PRINT BRIDGE: NOT RUNNING' -ForegroundColor Red; Write-Host $_.Exception.Message -ForegroundColor Yellow }"
echo.
pause
