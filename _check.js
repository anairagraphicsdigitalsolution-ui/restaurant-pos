
const fs=require("fs"),path=require("path"),ts=require("typescript");
const root=process.argv[2];let fails=[],files=0;
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){
 if(e.name==="node_modules"||e.name.startsWith("."))continue;
 const p=path.join(d,e.name);
 if(e.isDirectory())walk(p);
 else if(/\.(js|jsx|ts|tsx)$/.test(e.name)){
  files++; const kind=/\.(ts|tsx)$/.test(e.name)?ts.ScriptKind.TSX:ts.ScriptKind.JSX;
  const sf=ts.createSourceFile(p,fs.readFileSync(p,"utf8"),ts.ScriptTarget.Latest,true,kind);
  if(sf.parseDiagnostics?.length)fails.push([path.relative(root,p),sf.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,"\n"))]);
 }}
walk(root); console.log(JSON.stringify({files,fails},null,2));
