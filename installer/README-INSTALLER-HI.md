# Anaira POS — Automatic Windows Installer

Ye installer **Inno Setup Compiler** ke liye ready hai.

## Customer PC par setup kya karega

1. Anaira POS files install karega.
2. Node.js LTS check karega; missing ho to official Node.js 24.20.0 x64 MSI download karke SHA-256 verify karega aur silently install karega.
3. Docker Desktop check karega; missing ho to `winget` se automatically install karega.
4. Docker Desktop start karega aur engine ready hone ka wait karega.
5. Local Supabase stack start karega aur local migrations apply karega.
6. `npm ci` karega aur production Next.js build banayega.
7. Existing automatic bidirectional sync task install karega.
8. Anaira POS ko Windows logon par automatically start karne ke liye scheduled task banayega.
9. Desktop aur Start Menu shortcuts banayega.

## Setup ke waqt kya bharna hai

- Restaurant UUID
- Cloud Supabase URL
- Cloud Service Role Key
- Cloud Anon/Public Key (optional)

Current sync worker ko Cloud Service Role Key ki zarurat hai. Installer ise `.env.local` ke server-side variable `SUPABASE_SERVICE_ROLE_KEY` mein rakhta hai; ise `NEXT_PUBLIC_*` variable mein nahi rakhta.

## Compile

Inno Setup Compiler mein:

`installer\AnairaPOS-Setup.iss`

open karke **Compile** karo.

Ya PowerShell:

`powershell -ExecutionPolicy Bypass -File .\installer\Compile-AnairaPOS.ps1`

## Important

Docker Desktop ke liye kuch PCs par WSL2/virtualization ya reboot required ho sakta hai. Installer is OS prerequisite ko automatically bypass nahi kar sakta.

App uninstall karne par installer-defined scheduled tasks remove honge. Existing restaurant application data ko intentionally delete nahi kiya jata.
