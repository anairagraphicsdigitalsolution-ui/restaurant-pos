// Windows PowerShell/Command Prompt script to run Next.js on 0.0.0.0:3000
// Save this as run-local-server.ps1 and double-click or run in terminal

$env:HOST = "0.0.0.0"
$env:PORT = "3000"
npm run dev
