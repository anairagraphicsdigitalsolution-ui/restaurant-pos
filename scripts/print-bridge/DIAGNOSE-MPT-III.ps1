$ErrorActionPreference = 'Continue'
Write-Host '=== ANAIRA MPT-III DIAGNOSTIC ===' -ForegroundColor Cyan
Write-Host ''
Write-Host '1) Bridge port 3211:' -ForegroundColor Yellow
try {
  $tcp = New-Object System.Net.Sockets.TcpClient
  $tcp.Connect('127.0.0.1',3211)
  $tcp.Close()
  Write-Host 'RUNNING' -ForegroundColor Green
} catch { Write-Host 'NOT RUNNING' -ForegroundColor Red }
Write-Host ''
Write-Host '2) Win32_SerialPort:' -ForegroundColor Yellow
try { Get-CimInstance Win32_SerialPort | Select-Object DeviceID,Name,Description | Format-Table -AutoSize } catch { Write-Host $_.Exception.Message -ForegroundColor Red }
Write-Host ''
Write-Host '3) Windows Ports (PnP):' -ForegroundColor Yellow
try { Get-PnpDevice -Class Ports -PresentOnly | Select-Object Status,FriendlyName,InstanceId | Format-Table -AutoSize } catch { Write-Host $_.Exception.Message -ForegroundColor Red }
Write-Host ''
Write-Host '4) Bluetooth devices mentioning MPT/serial:' -ForegroundColor Yellow
try { Get-PnpDevice -PresentOnly | Where-Object { $_.FriendlyName -match 'MPT|Bluetooth|Serial over Bluetooth' } | Select-Object Status,Class,FriendlyName | Format-Table -AutoSize } catch {}
Write-Host ''
Write-Host "Bridge log: $env:APPDATA\Anaira\print-bridge.log" -ForegroundColor Cyan
pause
