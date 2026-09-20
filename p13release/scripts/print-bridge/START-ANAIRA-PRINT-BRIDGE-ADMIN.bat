@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process PowerShell.exe -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ''%~dp0AnairaPrintBridge.ps1'''"
