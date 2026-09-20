import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const routes=[]
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.name==='route.js')routes.push(p)}}
walk(path.join(root,'app/api'))
const publicPrefixes=['/public/','/integrations/']
const exemptPrefixes=['/super-admin/','/installer/','/local/']
const findings=[]
for(const file of routes){
 const rel=file.replaceAll(path.sep,'/').replace(/^app\/api/,'')
 const s=fs.readFileSync(file,'utf8')
 if(publicPrefixes.some(x=>rel.startsWith(x))||exemptPrefixes.some(x=>rel.startsWith(x))) continue
 const auth=/requireApiUser\s*\(/.test(s)||/auth\.getUser\s*\(/.test(s)
 if(!auth) findings.push({rel,kind:'NO_AUTH'})
}
console.log(JSON.stringify({routes:routes.length,protectedRouteFindings:findings.length,findings},null,2))
process.exitCode=findings.length?1:0
