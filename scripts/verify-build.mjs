import { existsSync } from "node:fs";
const required = ["node_modules/next/package.json", "node_modules/react/package.json", "node_modules/typescript/package.json"];
const missing = required.filter((p) => !existsSync(p));
if (missing.length) { console.error("Dependencies are not installed. Run npm install first."); process.exit(1); }
console.log("Dependency preflight OK");
