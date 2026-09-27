import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const checks = []
const add = (name, pass, evidence='') => checks.push({name, pass: !!pass, evidence})

add('package.json', fs.existsSync(path.join(root,'package.json')))
add('package-lock.json', fs.existsSync(path.join(root,'package-lock.json')), 'Required for reproducible production installs.')
add('capacitor.config.ts', fs.existsSync(path.join(root,'capacitor.config.ts')))
add('android project', fs.existsSync(path.join(root,'android','gradlew')))
add('android native offline bridge', fs.existsSync(path.join(root,'android-native','AnairaLocalDbPlugin.kt')) && fs.existsSync(path.join(root,'android-native','AnairaSyncWorker.kt')))
add('electron main', fs.existsSync(path.join(root,'electron','main.cjs')))
add('no .env.local in release', !fs.existsSync(path.join(root,'.env.local')))
add('social publish target', fs.existsSync(path.join(root,'app','api','marketing','publish','route.js')))

const jsFiles=[]
function walk(dir){
  if(!fs.existsSync(dir)) return
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,e.name)
    if(e.isDirectory() && !['node_modules','.next'].includes(e.name)) walk(p)
    else if(e.isFile() && /\.(js|mjs|cjs)$/.test(e.name)) jsFiles.push(p)
  }
}
for(const dir of ['app','components','lib','scripts','electron']) walk(path.join(root,dir))
add('javascript source inventory', jsFiles.length > 0, `${jsFiles.length} JS/MJS/CJS files discovered; run node --check for executable validation.`)

const report = {generatedAt:new Date().toISOString(), checks, allStaticChecksPass:checks.every(c=>c.pass)}
console.log(JSON.stringify(report,null,2))
process.exitCode = report.allStaticChecksPass ? 0 : 1
