import {buildKepcoForecast} from './kepco-forecast.mjs';
// 서버(/api/*)와 정적 빌드(site/api/*.json)가 공유하는 응답 생성기.
import fs from 'node:fs/promises';
import path from 'node:path';
import {catalog,sources,stocks} from './catalog.mjs';
import {readStore,ROOT} from './store.mjs';
import {buildView} from './sensitivity-engine.mjs';
const readJson=async(name,fallback=null)=>{try{return JSON.parse(await fs.readFile(path.join(ROOT,'data',name),'utf8'));}catch{return fallback;}};
export async function auditedCatalog(analysisBase='/analysis'){const audit=await readJson('impact-evidence.json');if(!audit)return catalog;
 return catalog.map(c=>({...c,effects:[...new Set(c.effects.flatMap(e=>e.codes))].map(code=>{const old=c.effects.find(e=>e.codes.includes(code)),a=audit.byPair[c.id+':'+code];return a?{...old,codes:[code],text:a.text,lag:a.lag,status:a.status,direction:a.direction,auditSources:a.sourceIds.map(id=>audit.sources[id]),analysisUrl:analysisBase+'?indicator='+c.id+'&stock='+code}:old;})}));}
export async function dataPayload({analysisBase='/analysis',refreshing=false,isStatic=false}={}){const db=await readStore();let kepcoForecast=null;try{kepcoForecast=buildKepcoForecast(db);}catch{}return {catalog:await auditedCatalog(analysisBase),sources,stocks,db,kepcoForecast,monitor:await readJson('monitor-status.json'),oilCurve:await readJson('oil-curve.json'),refreshing,static:isStatic,builtAt:new Date().toISOString()};}
export const impactPayload=()=>readJson('impact-evidence.json',{});
export async function analysisPayload(){return {analysis:await readJson('relationship-analysis.json',{}),evidence:await readJson('impact-evidence.json',{})};}
export async function sensitivityPayload(){return buildView(await readStore());}
