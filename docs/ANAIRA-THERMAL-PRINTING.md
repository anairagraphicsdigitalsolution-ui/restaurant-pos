# Anaira Thermal Printing

Anaira now has three printer paths:

1. **Android app + classic Bluetooth** — the native `AnairaBluetoothPrinter` Capacitor plugin uses Bluetooth SPP and ESC/POS raw bytes. This is the path intended for classic MPT-III/MPT-III/BT printers after the printer is paired in Android Bluetooth settings.
2. **Web Bluetooth** — supported for BLE ESC/POS printers that expose a supported GATT UART profile (FFE0/FFE1 or Nordic UART). Browser support is device/browser dependent.
3. **Windows / Electron / bridge** — the existing `/api/printing/print` bridge remains available for USB/network/Windows-driver printers.

The browser cannot silently pair a classic Bluetooth SPP printer. The first connection therefore requires a user action and, on Android, pairing in the system Bluetooth settings. This is a platform security requirement, not an Anaira limitation.

## Order page printing

- SAVE / KOT saves the order and prints KOT.
- PRINT KOT prints the selected order.
- FINALIZE & PAY finalizes the bill and immediately sends the bill to the thermal printer.
- PRINT BILL can reprint the completed bill.
- The order page shows active offers, manual discounts, GST, delivery charge and final total.
- Product images remain in the order UI but thermal receipts use ESC/POS text so they remain fast and reliable.

## MPT-III

The MPT-III family commonly uses classic Bluetooth SPP and ESC/POS. It cannot be treated as a generic Web Bluetooth BLE device. The Android native printer bridge included in this package is therefore the correct route for an MPT-III-style printer on Android.


## Production-domain Windows MPT-III flow

Anaira uses the same proven architecture as Sofson for classic Bluetooth MPT-III on Windows:

`https://ANAIRA-DOMAIN` → browser JavaScript → `http://127.0.0.1:3211` → `AnairaPrintBridge.ps1` → Windows COM port → MPT-III.

The Next.js/Vercel server does not start PowerShell and never accesses the customer's COM port. Install the bridge once on the Windows POS PC; it is placed in Windows Startup.
