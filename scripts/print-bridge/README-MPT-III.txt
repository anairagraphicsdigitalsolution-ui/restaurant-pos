ANAIRA POS - MPT-III WINDOWS PRINTING

The Anaira bridge supports the classic MPT-III Bluetooth path:
Windows Bluetooth pairing -> Bluetooth Serial/COM port -> Anaira Print Bridge -> ESC/POS.

MPT-III is an ESC/POS printer and the default serial setting documented for the MPT series is 9600 baud, 8 data bits, no parity, 1 stop bit, no flow control.

IMPORTANT:
1. Pair the printer in Windows Bluetooth settings.
2. Open Device Manager -> Ports (COM & LPT).
3. Look for a Bluetooth/serial COM port (for example COM5).
4. In Anaira POS -> PRINTER -> CONNECT MPT-III / LOCAL, select that COM port and connect.
5. Use TEST PRINT before taking live orders.

The Windows printer driver is NOT required for Anaira raw ESC/POS printing when the Bluetooth device exposes a COM port. A normal Windows print queue/driver is only needed if you want to print through the Windows printer spooler.

HPRT publishes model-specific MPT3 Windows drivers and SDKs. Do not install a different HPRT model driver (TP808/TP809/etc.) for MPT-III.

Official HPRT MPT-III documentation identifies USB, RS-232 and Bluetooth interfaces and Windows driver support.
