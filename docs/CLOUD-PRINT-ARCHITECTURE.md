# Anaira Cloud Printing

Anaira is cloud-first for thermal printing. Supabase stores durable `print_jobs`; the Next/Vercel server never connects to `127.0.0.1` or a customer's Bluetooth adapter.

## Production flow

`Anaira POS -> Supabase print_jobs -> Anaira Android printer agent -> BLE GATT -> ESC/POS thermal printer`

The Android app must be running, signed in to the restaurant, and connected to the BLE printer. It claims queued jobs every 2.5 seconds and marks them `printed` or retries them.

## Windows browser

Chrome Web Bluetooth remains available for supported BLE ESC/POS printers. Windows COM/local bridge is legacy fallback only and is not required by the cloud queue.

## Important limitation

A cloud server cannot directly operate a Bluetooth adapter attached to a customer's PC. The local hardware endpoint must be a client device (Android app, desktop/native agent, or network printer). Supabase is the shared cloud queue, not the Bluetooth transport.
