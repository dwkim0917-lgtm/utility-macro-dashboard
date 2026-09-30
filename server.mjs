import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {readStore,mutate,mergeRows,parseCSV,csvExport,ROOT} from './store.mjs';
import {refresh} from './collector.mjs';
import {dataPayload,impactPayload,analysisPayload,sensitivityPayload} from './payload.mjs';
const port=Number(process.env.PORT||8765);let running=null;
function startRefresh(){if(!running)running=refresh().finally(()=>running=null);return running;}
const server=http.createServer(async(req,res)=>{const send=(status,body,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"});res.end(typeof body==='string'?body:JSON.stringify(body));};
 try{const host=req.headers.host;if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host))return send(403,{error:'로컬 호스트만 허용됩니다.'});const url=new URL(req.url,`http://${host}`);
 if(req.method==='POST'){if(req.headers.origin!==`http://${host}`)return send(403,{error:'같은 로컬 화면에서만 변경할 수 있습니다.'});}
 if(url.pathname==='/api/data'&&req.method==='GET')return send(200,await dataPayload({refreshing:!!running}));
 if(url.pathname==='/api/refresh'&&req.method==='POST'){await startRefresh();return send(200,{ok:true});}
 if(url.pathname==='/api/import'&&req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>5e6)return send(413,{error:'파일 최대 5MB'});}const rows=parseCSV(body);await mutate(db=>mergeRows(db,rows));return send(200,{count:rows.length});}
 if(url.pathname==='/api/export'&&req.method==='GET'){res.setHeader('Content-Disposition','attachment; filename="utility-macro.csv"');return send(200,csvExport(await readStore()),'text/csv; charset=utf-8');}
 if(url.pathname==='/api/impact'&&req.method==='GET')return send(200,await impactPayload());
 if(url.pathname==='/api/sensitivity'&&req.method==='GET')return send(200,await sensitivityPayload());
 if(url.pathname==='/api/analysis'&&req.method==='GET')return send(200,await analysisPayload());
 if(url.pathname==='/api/analysis/export'&&req.method==='GET'){res.setHeader('Content-Disposition','attachment; filename="relationship-tests.csv"');return send(200,await fs.readFile(path.join(ROOT,'data','relationship-tests.csv'),'utf8'),'text/csv; charset=utf-8');}
 const files={'/sensitivity':'sensitivity.html','/sensitivity.js':'sensitivity.js','/sensitivity.css':'sensitivity.css','/analysis':'analysis.html','/macro-ui.js':'macro-ui.js','/analysis.js':'analysis.js','/analysis.css':'analysis.css','/':'index.html','/app.js':'app.js','/style.css':'style.css','/favicon.svg':'favicon.svg'};if(req.method!=='GET'||!files[url.pathname])return send(404,{error:'Not found'});const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};return send(200,await fs.readFile(path.join(ROOT,'dist',files[url.pathname]),'utf8'),types[path.extname(files[url.pathname])]);
 }catch(e){send(400,{error:e.message});}});
server.listen(port,'127.0.0.1',()=>console.log(`Utility Macro running: http://127.0.0.1:${port}`));
server.on('error',e=>{console.error(e.code);process.exitCode=1;});
// Browser need not remain open. Public sources refresh once per KST date while server runs.
setInterval(async()=>{try{const db=await readStore();const last=db.runs.at(-1)?.at;const kst=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(d);if(!last||kst(new Date(last))!==kst(new Date()))await startRefresh();}catch(e){console.error('Daily refresh failed:',e.message);}},60000).unref();
