ANAIRA MPT-III WINDOWS PRINTING
================================

The MPT-III classic Bluetooth model uses Windows Bluetooth SPP and a COM port.
The Anaira website does NOT connect to Bluetooth directly. The browser calls:

  http://127.0.0.1:3211

The local Anaira Print Bridge then writes ESC/POS bytes to the Windows COM port.

ONE-TIME WINDOWS SETUP
-----------------------
1. Pair MPT-III in Windows Bluetooth settings.
2. Confirm Windows exposes a Standard Serial over Bluetooth Link / COM port in:
   Device Manager -> Ports (COM & LPT)
3. Run scripts\INSTALL-MPT-III.bat once.
4. The installer installs Windows Startup and starts the bridge immediately.
5. Open Anaira -> Order -> PRINTER -> Refresh.
6. Select the MPT-III COM port -> CONNECT MPT-III -> TEST PRINT.

If the bridge says RUNNING but Anaira says no COM port, run:
  scripts\print-bridge\CHECK-MPT-III-COM.bat

If BOTH COM lists are empty, this is a Windows Bluetooth SPP pairing/driver issue,
not an Anaira website issue. The MPT-III must be paired as classic Bluetooth/SPP.

Bridge endpoints:
  GET  /health
  GET  /printers
  POST /connect
  POST /disconnect
  POST /test-print
  POST /print-raw

Serial settings:
  9600 baud, 8 data bits, no parity, 1 stop bit, no flow control.


V21 DIAGNOSTICS
If the website says the bridge is not running, run START-ANAIRA-PRINT-BRIDGE.bat without WindowStyle Hidden to see the real PowerShell error. The bridge also logs to %APPDATA%\Anaira\print-bridge.log.

V22: The bridge intentionally uses the the same Windows HttpListener architecture used by the Anaira MPT-III bridge. INSTALL-MPT-III.bat must be run once as Administrator to reserve 127.0.0.1:3211 and install Windows Startup. The Anaira domain browser then calls the local bridge directly.
