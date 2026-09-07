# Anaira SaaS — MPT-III / Windows Thermal Print Bridge

This bridge is for the **Vercel/Chrome web app running on a Windows POS PC**.

## Why it exists

A classic Bluetooth MPT-III printer is normally paired by Windows and exposed as a
COM port. Chrome Web Bluetooth cannot directly open that classic SPP/COM port.
Anaira therefore uses:

`Chrome/Vercel → http://127.0.0.1:3211 → AnairaPrintBridge → COM port → MPT-III`

The bridge sends raw ESC/POS bytes, so no proprietary vendor SDK is required for
printing after Windows has paired/installed the printer.

## Install once

1. Pair MPT-III in **Windows Bluetooth settings**.
2. Confirm Windows shows a COM port for the printer (Device Manager → Ports).
3. Run PowerShell as Administrator:
   `.\scripts\install-anaira-print-bridge.ps1`
4. Or test manually:
   `.\scripts\print-bridge\START-ANAIRA-PRINT-BRIDGE.bat`
5. Open Anaira POS in Chrome and press **PRINTER / CONNECT PRINTER**.
6. Anaira will detect the local bridge and automatically choose a likely MPT/
   thermal/POS COM port. The saved port is reused on later prints.
7. **Test Print** can be sent from:
   `http://127.0.0.1:3211/test-print`

## Print behavior

If the printer is already connected, print goes immediately.

If it is not connected:
- Anaira asks the local bridge to reconnect to the saved/available COM port.
- If no COM printer exists, the web app shows **Connect Printer**.
- The user can pair the printer in Windows Bluetooth settings and then press
  Connect/Print again.

## Important

This is a local Windows print agent. Vercel cannot install or access a Windows
printer driver remotely. The bridge must run on the same PC that owns the printer.
