import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url));process.chdir(root);
const lock=path.join(root,'data','analysis-refresh.lock');let handle;
try{handle=await fs.open(lock,'wx');}catch(e){if(e.code==='EEXIST'){console.log('Analysis refresh already running; see OPERATIONS.md for stale lock recovery');process.exit(0);}throw e;}
const run=(exe,args)=>new Promise((resolve,reject)=>{const p=spawn(exe,args,{cwd:root,windowsHide:true,stdio:'inherit'});p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(Error(args.join(' ')+' exit '+c)));});
try{
 const month=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'}).slice(0,7);
 const input=createHash('sha256').update(await fs.readFile('data/observations.json')).update(await fs.readFile('analyze-links.py')).update(await fs.readFile('analysis_stats.py')).update(await fs.readFile('catalog.mjs')).update(month).digest('hex');
 let state={};try{state=JSON.parse(await fs.readFile('data/analysis-refresh-state.json','utf8'));}catch{}
 if(state.input===input&&!process.argv.includes('--force')){console.log('Analysis unchanged');}
 else{const python=process.env.UTILITY_ANALYSIS_PYTHON||path.join(process.env.USERPROFILE,'.cache','codex-runtimes','codex-primary-runtime','dependencies','python','python.exe');
  for(const script of ['collect-stock-history.mjs','crosscheck-stock-history.mjs','export-analysis-input.mjs'])await run(process.execPath,[script]);
  await run(python,['analyze-links.py']);await fs.writeFile('data/analysis-refresh-state.json',JSON.stringify({input,updatedAt:new Date().toISOString()}));console.log('Analysis updated');}
}finally{await handle.close();await fs.unlink(lock);}
