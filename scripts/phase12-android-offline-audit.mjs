import fs from 'node:fs'
import path from 'node:path'

const checks = [
  ['capacitor config present', fs.existsSync('capacitor.config.ts')],
  ['Android local DB plugin source', fs.existsSync('android-native/AnairaLocalDbPlugin.kt')],
  ['Offline API bridge', fs.existsSync('components/AndroidOfflineApiBridge.jsx')],
  ['Mobile local DB layer', fs.existsSync('lib/mobileLocalDb.js')],
  ['Offline cache service worker', fs.existsSync('public/sw.js')],
  ['Offline fallback page', fs.existsSync('public/offline.html')],
  ['Sync engine', fs.existsSync('lib/mobileSyncEngine.js')],
]
const fail = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (fail.length) process.exit(1)
console.log('Anaira Phase 12 Android offline core audit: PASS')
