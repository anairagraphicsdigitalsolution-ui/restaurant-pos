const fs = require("fs")
const path = require("path")
const ts = require("typescript")

const root = process.argv[2] || "."
const fails = []
let files = 0

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(file)
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      files++
      const kind = /\.(ts|tsx)$/.test(entry.name) ? ts.ScriptKind.TSX : ts.ScriptKind.JSX
      const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, kind)
      if (source.parseDiagnostics?.length) {
        fails.push([
          path.relative(root, file),
          source.parseDiagnostics.map((x) => ts.flattenDiagnosticMessageText(x.messageText, "\n")),
        ])
      }
    }
  }
}

walk(root)
console.log(JSON.stringify({ files, fails }, null, 2))
process.exitCode = fails.length ? 1 : 0
