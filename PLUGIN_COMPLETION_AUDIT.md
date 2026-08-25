# Plugin completion audit — 2026-08-25

## Runtime fixes in this build
- WhatsApp plugin manager now resolves both `whatsapp` and canonical `whatsapp-invoice` to the same implementation.
- WhatsApp no longer reports `success: true` when Cloud API credentials are absent; it explicitly returns `WHATSAPP_CLOUD_API_NOT_CONFIGURED` and a usable click-to-chat URL without claiming a sent message.
- QR URL generation validates an absolute HTTP/HTTPS domain and encodes type/id safely.
- Captain / Waiter route now requires the independent `captain-app` plugin to be enabled instead of treating a legacy `pos` row as the captain gate.
- Restaurant Core remains independent from optional plugins.

## Verified provider-backed runtimes
- Reservations: server route and plugin gate exist; reservation page exists.
- QR ordering / QR print: public QR context, order flow and print center routes exist.
- Website ordering: public order runtime exists and feeds the normal order pipeline.
- Smart Notifications: realtime notification UI and browser sound are implemented.
- Calling Device: browser speech synthesis, repeat count and language/voice selection are implemented. Native Android TTS still requires the Android bridge for WebView devices.
- Offers: offer creation, usage and plan-limit controls exist.
- Printing: real HTTP printer-bridge requests; no fake success.
- WhatsApp: real Meta Cloud API path when credentials are configured; no false success otherwise.
- Facebook/Instagram: real Meta Graph API publish requests when valid credentials and account configuration are present.
- Swiggy/Zomato: real configurable REST/webhook plumbing; partner-approved credentials/endpoints are required.

## Provider-dependent items
A plugin cannot be honestly marked "live" without the external provider credentials and endpoint contract. The app therefore fails clearly instead of pretending that a connection or payment succeeded.

- WhatsApp Cloud API: phone number ID, access token, approved templates and webhook verification.
- Facebook/Instagram: approved Page/Professional account token and required permissions; Instagram media must be publicly reachable.
- Printer hardware: reachable bridge/agent and printer profile.
- Swiggy/Zomato: partner-issued credentials and approved POS endpoint contract.
- Razorpay: merchant credentials/webhooks and payment verification; the legacy plugin adapter intentionally does not fake payment success.

## Remaining architectural note
The catalog contains feature modules whose runtime is implemented in dashboard/API routes rather than `plugins/<code>/index.js`. They are still independently gated through `restaurant_plugins`. The generic `/api/plugin-exec` endpoint only exposes explicit adapters, currently including WhatsApp; it is not the source of truth for dashboard/API-native plugins.
