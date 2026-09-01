# Anaira Restaurant POS — Windows Desktop Build

This project uses a standalone Electron + Next.js Windows build and Inno Setup.
It does NOT use electron-builder for the Windows installer, so the winCodeSign
symbolic-link problem is bypassed.

## Build the Windows app only

PowerShell:

    npm run electron:dir

Output:

    installer\output\win-unpacked\Anaira Restaurant POS.exe

## Build the Windows app + branded installer

    npm run electron:build

Installer:

    installer\installer-build\Anaira-Restaurant-POS-Setup-1.0.0.exe

The Android/Capacitor project remains untouched. Android build artifacts are not
copied into the Windows app.

The installer and shortcuts use the Anaira branding icon generated from
public/Logo.png.
