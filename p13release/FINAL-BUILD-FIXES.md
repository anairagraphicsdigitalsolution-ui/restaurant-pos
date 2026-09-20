# Anaira POS — Final Build / Calling / Business Card Fixes

## Fixed

### 1. Business Card build syntax error
`app/business-card/page.js` contained a malformed ternary after `createClientUuid()`:
`createClientUuid("business-card") : ...`
It is now a valid UUID helper call:
`createClientUuid("business-card")`.

### 2. Calling Device SSR / Next.js window error
The Capacitor TextToSpeech package was previously imported at module evaluation time from `lib/callingVoice.js`. That can cause a native/client-only Capacitor package to be evaluated while Next.js is rendering server modules.

The TTS package is now lazy-loaded only in a browser/native runtime. Browser `speechSynthesis` remains the fallback.

### 3. Capacitor TextToSpeech duplicate registration hardening
The TTS plugin is no longer imported at the top level of the calling runtime. A single cached dynamic-import promise is used, preventing repeated module initialization from the Calling Device page/runtime provider path.

No manual TextToSpeech registration was added to `MainActivity`; Capacitor's generated plugin registration remains intact.

### 4. Calling Device state completeness
The Calling Device page now declares the `availableVoices` and `voiceName` state used by its voice selector.

## Verification
- `node --check app/business-card/page.js` — PASS
- `node --check app/dashboard/calling/page.js` — PASS
- `node --check lib/callingVoice.js` — PASS

A full `npm run build` was not claimed inside the packaging environment because dependencies are not installed/cached there. On the development machine, clear the old Next build cache before rebuilding.
