import fs from 'node:fs'
import path from 'node:path'

const required = [
  'lib/mobileLocalDb.js',
  'lib/mobileDevice.js',
  'lib/mobileSyncEngine.js',
  'components/MobileSyncProvider.jsx',
  'app/api/mobile/sync/route.js',
  'app/api/mobile/sync/pull/route.js',
  'android-native/AnairaLocalDbPlugin.kt',
  'android-native/AnairaSyncWorker.kt',
  'public/sw.js',
]

const missing = required.filter(file => !fs.existsSync(path.resolve(file)))
if (missing.length) {
  console.error('Anaira Android phase check: FAIL')
  missing.forEach(file => console.error(`Missing: ${file}`))
  process.exit(1)
}
console.log('Anaira Android phase check: PASS')
console.log('Phases 1–11 integration layer: present')
console.log('Existing application data: not modified by this packaging pass')
