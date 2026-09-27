import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const required = [
  "supabase/migrations/20260829010000_offline_sync_bill_kot_finalization.sql",
  "scripts/sync-worker.mjs",
  "app/api/mobile/sync/route.js",
  "lib/mobileLocalDb.js",
  "lib/mobileOffline.js",
  "components/MobileSyncProvider.jsx",
  "components/ServiceWorkerRegister.jsx",
  "android/app/src/main/java/in/anairapos/app/AnairaLocalDbPlugin.java",
]
const missing = required.filter(f => !fs.existsSync(path.join(root, f)))
if (missing.length) throw new Error(`Missing offline files: ${missing.join(", ")}`)
const migration = fs.readFileSync(path.join(root, required[0]), "utf8")
for (const token of ["sync_status", "cloud_received_at", "invoice_generated_at", "kot_generated_at", "finalize_synced_order_numbers"]) {
  if (!migration.includes(token)) throw new Error(`Offline migration missing ${token}`)
}
const worker = fs.readFileSync(path.join(root, "scripts/sync-worker.mjs"), "utf8")
for (const token of ["finalize_synced_order_numbers", "PENDING", "kot_tickets"]) {
  if (!worker.includes(token)) throw new Error(`Sync worker missing ${token}`)
}
console.log("Anaira offline contract validation: PASS")
