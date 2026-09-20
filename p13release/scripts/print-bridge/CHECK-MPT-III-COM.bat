@echo off
setlocal
chcp 65001 >nul

echo ================================================
echo ANAIRA MPT-III / WINDOWS DIAGNOSTIC
echo ================================================
echo.

echo [1] Checking local print bridge port 3211...
powershell.exe -NoProfile -Command "$c=New-Object Net.Sockets.TcpClient; try{$c.Connect('127.0.0.1',3211); 'BRIDGE: RUNNING'; $c.Close()}catch{'BRIDGE: NOT RUNNING'}"
echo.

echo [2] Win32_SerialPort:
powershell.exe -NoProfile -Command "Get-CimInstance Win32_SerialPort -ErrorAction SilentlyContinue | Select-Object DeviceID,Name,Description | Format-Table -AutoSize"
echo.

echo [3] Windows Ports class:
powershell.exe -NoProfile -Command "Get-PnpDevice -Class Ports -PresentOnly -ErrorAction SilentlyContinue | Select-Object Status,FriendlyName,InstanceId | Format-Table -AutoSize"
echo.

echo.
echo If both port lists are empty, Windows has NOT created a Bluetooth SPP/COM port for MPT-III yet.
echo Pair the printer in Windows Bluetooth and check Device Manager ^> Ports (COM ^& LPT).
echo.
pause
