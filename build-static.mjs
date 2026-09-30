// dist/ + data/ → site/ (GitHub Pages용 정적 사이트). 로컬 서버 코드는 건드리지 않고 경로만 치환한다.
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT,readStore,csvExport} from './store.mjs';
import {dataPayload,impactPayload,analysisPayload,sensitivityPayload} from './payload.mjs';
const SITE=path.join(ROOT,'site'),DIST=path.join(ROOT,'dist');
await fs.rm(SITE,{recursive:true,force:true});await fs.mkdir(path.join(SITE,'api'),{recursive:true});
const rewrite=s=>s
 .replace(/fetch\('\/api\/data'\)/g,"fetch('api/data.json')").replace(/fetch\('\/api\/analysis'\)/g,"fetch('api/analysis.json')")
 .replace(/fetch\('\/api\/impact'\)/g,"fetch('api/impact.json')").replace(/fetch\('\/api\/sensitivity'\)/g,"fetch('api/sensitivity.json')")
 .replace(/href="\/api\/export"/g,'href="api/utility-macro.csv"').replace(/href="\/api\/analysis\/export"/g,'href="api/relationship-tests.csv"')
 .replace(/href="\/analysis(\?|")/g,'href="analysis.html$1').replace(/href="\/sensitivity"/g,'href="sensitivity.html"').replace(/href="\/"/g,'href="./"')
 .replace(/\/analysis\?indicator=/g,'analysis.html?indicator=')
 .replace(/(href|src)="\/([a-z-]+\.(css|js|svg))"/g,'$1="$2"');
for(const f of await fs.readdir(DIST)){let s=await fs.readFile(path.join(DIST,f),'utf8');if(/\.(html|js|css)$/.test(f))s=rewrite(s);
 if(f==='index.html')s=s.replace('</head>','<style>#refresh,#import,#paste-import,#csv,#paste-csv,label[for=csv]{display:none!important}</style></head>');
 await fs.writeFile(path.join(SITE,f),s);}
const write=(name,obj)=>fs.writeFile(path.join(SITE,'api',name),typeof obj==='string'?obj:JSON.stringify(obj));
await write('data.json',await dataPayload({analysisBase:'analysis.html',isStatic:true}));
await write('impact.json',await impactPayload());await write('analysis.json',await analysisPayload());await write('sensitivity.json',await sensitivityPayload());
await write('utility-macro.csv',csvExport(await readStore()));
try{await fs.copyFile(path.join(ROOT,'data','relationship-tests.csv'),path.join(SITE,'api','relationship-tests.csv'));}catch{}
await fs.writeFile(path.join(SITE,'.nojekyll'),'');
const size=async d=>{let n=0;for(const e of await fs.readdir(d,{withFileTypes:true}))n+=e.isDirectory()?await size(path.join(d,e.name)):(await fs.stat(path.join(d,e.name))).size;return n;};
console.log('site built',(await size(SITE)/1048576).toFixed(1)+' MB');
