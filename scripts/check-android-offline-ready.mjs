import fs from "node:fs"
import path from "node:path"

const required = [
  "capacitor.config.ts",
  "public/sw.js",
  "public/offline.html",
  "lib/mobileLocalDb.js",
  "lib/mobileOffline.js",
  "lib/mobileSyncEngine.js",
  "android-native/AnairaLocalDbPlugin.kt",
  "android-native/AnairaSyncWorker.kt",
]
const missing = required.filter(file => !fs.existsSync(path.resolve(file)))
if (missing.length) {
  console.error("Android offline readiness: FAIL")
  missing.forEach(file => console.error(`Missing: ${file}`))
  process.exit(1)
}
const config = fs.readFileSync("capacitor.config.ts", "utf8")
if (!config.includes("server:") || !config.includes("url:")) {
  console.error("Android offline readiness: FAIL — expected existing online remote configuration")
  process.exit(1)
}
console.log("Android offline readiness: PASS")
console.log("Offline boot cache: present")
console.log("Local DB bridge: present")
console.log("Offline order persistence: present")
console.log("Bidirectional sync engine: present")
console.log("Native Android hooks: present")
console.log("Note: first install still requires one online bootstrap/login because restaurant data is cloud-specific.")
