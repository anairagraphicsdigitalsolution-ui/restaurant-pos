# Anaira Restaurant POS — Windows Electron Build

This project is configured for a standalone Electron Windows app.

## Build

From PowerShell in the project root:

    powershell -ExecutionPolicy Bypass -File .\scripts\build-electron-windows.ps1

The Windows app is generated at:

    installer\output\win-unpacked\Anaira Restaurant POS.exe

The project uses `signAndEditExecutable: false` for the current electron-builder 26.x setup. This bypasses the failing legacy winCodeSign executable-edit/signing step. The app is unsigned; Windows SmartScreen may therefore show a warning until a code-signing certificate is added.

## Inno Setup installer

Open:

    installer\Anaira-Restaurant-POS.iss

in Inno Setup 6 and choose Build -> Compile.

The final installer is written to:

    installer\installer-build\Anaira-Restaurant-POS-Setup-1.0.0.exe
