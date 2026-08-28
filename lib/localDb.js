import { spawn } from "node:child_process"

function env(name, fallback = "") {
  return process.env[name] || fallback
}

export function localDbEnabled() {
  return (
    process.env.ANAIRA_LOCAL_SERVER_ENABLED === "true" &&
    Boolean(
      process.env.LOCAL_DATABASE_URL ||
      process.env.LOCAL_DB_PASSWORD
    )
  )
}

function dockerArgs() {
  const container = env(
    "LOCAL_DB_CONTAINER",
    "supabase-db"
  )

  const user = env(
    "LOCAL_DB_USER",
    "supabase_admin"
  )

  const db = env(
    "LOCAL_DB_NAME",
    "postgres"
  )

  const syncNodeBase =
    process.env.ANAIRA_SYNC_NODE ||
    "restaurant-local-server"

  const restaurantId =
    process.env.ANAIRA_RESTAURANT_ID ||
    ""

  const syncNode = restaurantId
    ? `${syncNodeBase}:${restaurantId}`
    : syncNodeBase

  return [
    "exec",
    "-i",
    "-e",
    `PGOPTIONS=-c app.sync_node=${syncNode}`,
    container,
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    user,
    "-d",
    db,
    "-At",
    "-F",
    "\t"
  ]
}

export async function localSql(sql, options = {}) {
  if (!localDbEnabled()) {
    throw new Error(
      "Local database is not enabled"
    )
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      dockerArgs(),
      {
        windowsHide: true
      }
    )

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", b => {
      stdout += b.toString()
    })

    child.stderr.on("data", b => {
      stderr += b.toString()
    })

    child.on("error", reject)

    child.on("close", code => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        reject(
          new Error(
            stderr.trim() ||
            `Local SQL failed (${code})`
          )
        )
      }
    })

    child.stdin.end(sql)
  })
}

export function sqlText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "NULL"
  }

  return `'${String(value).replaceAll("'", "''")}'`
}

export function sqlJson(value) {
  return `${sqlText(
    JSON.stringify(value ?? {})
  )}::jsonb`
}

export async function localJson(sql) {
  const cleanSql = String(sql)
    .trim()
    .replace(/;+\s*$/, "")

  const raw = await localSql(
    `SELECT COALESCE(
      json_agg(x),
      '[]'::json
    )
    FROM (${cleanSql}) x;`
  )

  if (!raw) {
    return []
  }

  return JSON.parse(raw)
}

export async function localOne(sql) {
  const rows = await localJson(sql)

  return rows[0] || null
}