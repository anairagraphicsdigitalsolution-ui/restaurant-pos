import os from "node:os"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const FALLBACK_TERMINAL_FILE = ".anaira-terminal-id"

function getDataDir() {
  return process.env.ANAIRA_LOCAL_DATA_DIR || process.cwd()
}

export function getLocalServerConfig() {
  return {
    enabled: process.env.ANAIRA_LOCAL_SERVER_ENABLED === "true",
    host: process.env.ANAIRA_LOCAL_SERVER_HOST || "0.0.0.0",
    port: Number(process.env.ANAIRA_LOCAL_SERVER_PORT || process.env.PORT || 3000),
    databaseUrl: process.env.LOCAL_DATABASE_URL || "",
  }
}

export function getTerminalId() {
  // Stable per installation when a writable local data directory is available.
  // Falls back to a host-derived identifier without exposing MAC addresses.
  try {
    const file = path.join(getDataDir(), FALLBACK_TERMINAL_FILE)
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim()
    const id = crypto.randomUUID()
    fs.writeFileSync(file, id, "utf8")
    return id
  } catch {
    return crypto.createHash("sha256").update(`${os.hostname()}:anaira-pos`).digest("hex").slice(0, 32)
  }
}
