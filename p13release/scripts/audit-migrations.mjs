import fs from "node:fs"
import path from "node:path"

const dir=path.resolve("supabase/migrations")
const files=fs.readdirSync(dir).filter(x=>x.endsWith(".sql")).sort()
const versions=new Map()
for(const file of files){
  const m=file.match(/^(\d+)_/)
  if(!m) continue
  const v=m[1]
  if(!versions.has(v)) versions.set(v,[])
  versions.get(v).push(file)
}
const dup=[...versions.entries()].filter(([,xs])=>xs.length>1)
console.log(`migrations: ${files.length}`)
if(dup.length){
  console.error("duplicate migration versions:")
  for(const [v,xs] of dup) console.error(v,xs.join(", "))
  process.exitCode=1
}else{
  console.log("duplicate versions: none")
}
const last=files.slice(-5)
console.log("latest:")
for(const x of last) console.log(`  ${x}`)
