#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "app/order/page.js",
  "app/[slug]/pay/[type]/[id]/page.jsx",
  "app/[slug]/order/[type]/[id]/page.jsx",
  "app/track/[token]/page.jsx",
  "components/Sidebar.tsx",
  "components/AuthProvider.tsx",
  "components/AppUtilities.tsx",
  "android/app/src/main/java/in/anairapos/app/MainActivity.java",
  "electron/main.cjs",
  "lib/supabaseCloud.js",
  "lib/featureGateServer.js",
  "lib/pluginManager.js",
];

let failed = false;
for (const rel of required) {
  const ok = fs.existsSync(path.join(root, rel));
  console.log(`${ok ? "PASS" : "FAIL"} ${rel}`);
  failed ||= !ok;
}

const order = fs.readFileSync(path.join(root, "app/order/page.js"), "utf8");
const checks = [
  ["Order drawer exists", order.includes("pos-navigation-drawer-layer")],
  ["Order menu button exists", order.includes('aria-label="Open navigation menu"')],
  ["Order back uses dashboard", order.includes('router.replace("/dashboard")')],
  ["Order drawer has role fallback", order.includes('role={role || "admin"}')],
];

for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  failed ||= !ok;
}

if (failed) process.exit(1);
console.log("Phase 1 static reliability checks passed.");
