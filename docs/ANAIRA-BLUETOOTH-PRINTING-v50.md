# Anaira v50 — Native BLE Thermal Printing

## Printer transports

Anaira supports three independent printer paths:

1. **Browser BLE:** Chrome/Chromium Web Bluetooth for BLE ESC/POS printers.
2. **Windows Electron BLE:** the Electron shell intercepts Chromium's Bluetooth device selection and shows an Anaira-branded device picker instead of relying on the browser chooser.
3. **Android native BLE:** the Capacitor plugin scans BLE devices, connects over GATT, discovers a writable ESC/POS characteristic, and writes receipt bytes in chunks.

The legacy Windows COM / Print Bridge path is retained as a compatibility fallback for genuine classic Bluetooth SPP printers. It is not required for BLE printers.

## Cloud architecture

Supabase remains the source of truth for authentication, restaurant configuration, orders, billing and other application data. Printer hardware is local to the Windows PC or Android device. Supabase cannot directly access a customer's local Bluetooth radio, so print bytes are sent from the client runtime after the cloud order/bill operation succeeds.

## Android BLE behavior

- `scanPrinters` performs an 8-second native BLE scan.
- `connect` opens a GATT connection to the selected BLE device.
- Preferred ESC/POS services include FFE0, FF00, HM-10/Nordic UART-style service, and common SPP-over-BLE vendor service UUIDs.
- If a preferred service is absent, the plugin searches all discovered services for a writable characteristic.
- Raw ESC/POS data is sent in ~180-byte chunks.
- BLUETOOTH_SCAN and BLUETOOTH_CONNECT are declared for Android 12+.

## Windows Electron BLE behavior

The POS page still calls the standard Web Bluetooth API. In the packaged Electron shell, `select-bluetooth-device` is intercepted by the main process. Anaira displays its own device-selection window and supplies the selected Chromium Bluetooth device ID back to the Web Bluetooth request. This keeps the application independent of the Chrome native chooser UI while still using Chromium's BLE stack.

## Important printer compatibility note

A BLE printer may be visible to Web Bluetooth but never create a Windows COM port. That is expected. Such a printer must use BLE/GATT, not the classic Bluetooth SPP/COM path.
