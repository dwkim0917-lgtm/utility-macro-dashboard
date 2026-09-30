import fs from 'node:fs/promises';
let s=await fs.readFile('server.mjs','utf8');
s=s.replace("{catalog,sources,stocks,db:await readStore()", "{catalog:await auditedCatalog(),sources,stocks,db:await readStore()");
s=s.replace("const port=", `async function auditedCatalog(){let audit;try{audit=JSON.parse(await fs.readFile(path.join(ROOT,'data','impact-evidence.json'),'utf8'));}catch{return catalog;}return catalog.map(c=>({...c,effects:[...new Set(c.effects.flatMap(e=>e.codes))].map(code=>{const old=c.effects.find(e=>e.codes.includes(code)),a=audit.byPair[c.id+':'+code];return a?{...old,codes:[code],text:a.text,lag:a.lag,status:a.status,auditSources:a.sourceIds.map(id=>audit.sources[id]),analysisUrl:'/analysis?indicator='+c.id+'&stock='+code}:old;})}));}
const port=`);
s=s.replace(" const files=",` if(url.pathname==='/api/analysis'&&req.method==='GET')return send(200,{analysis:JSON.parse(await fs.readFile(path.join(ROOT,'data','relationship-analysis.json'),'utf8')),evidence:JSON.parse(await fs.readFile(path.join(ROOT,'data','impact-evidence.json'),'utf8'))});
 if(url.pathname==='/api/analysis/export'&&req.method==='GET'){res.setHeader('Content-Disposition','attachment; filename="relationship-tests.csv"');return send(200,await fs.readFile(path.join(ROOT,'data','relationship-tests.csv'),'utf8'),'text/csv; charset=utf-8');}
 const files=`);
s=s.replace("'/':'index.html'","'/analysis':'analysis.html','/analysis.js':'analysis.js','/analysis.css':'analysis.css','/':'index.html'");
await fs.writeFile('server.mjs',s);
let a=await fs.readFile('dist/app.js','utf8');
const old='<a href="${esc(payload.sources[e.ref].url)}" target="_blank" rel="noopener">근거 ↗</a>';
const next='${(e.auditSources||[payload.sources[e.ref]]).map((s,i)=>`<a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.title||s.name)}">근거 ${i+1} ↗</a>`).join(" · ")} ${e.analysisUrl?`<a href="${esc(e.analysisUrl)}">주가 시차·수치 비교 →</a>`:""}';
if(!a.includes(old))throw Error('effect source marker missing');a=a.replace(old,next);await fs.writeFile('dist/app.js',a);
let h=await fs.readFile('dist/index.html','utf8');h=h.replace('<div id="coverage"', '<p><a href="/analysis">실적 근거 · 전체 종목 주가 시차 비교 →</a></p><div id="coverage"');await fs.writeFile('dist/index.html',h);
