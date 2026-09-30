import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {catalog} from './catalog.mjs';
export const ROOT=path.dirname(fileURLToPath(import.meta.url));
export const DATA=path.join(ROOT,'data');
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export async function readStore(){try{return JSON.parse(await fs.readFile(path.join(DATA,'observations.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {series:{},runs:[],updatedAt:null};throw e;}}
export function validateRows(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>200000)throw Error('관측값 배열이 비어 있거나 너무 큽니다.');
 const ids=new Set(catalog.map(x=>x.id));
 return rows.map(r=>{if(!ids.has(r.id))throw Error('알 수 없는 지표 ID: '+r.id);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date||r.date>today())throw Error('유효하지 않거나 미래인 관측일: '+r.date);
 if(typeof r.value!=='number'||!Number.isFinite(r.value))throw Error('유한한 숫자 값이 필요합니다.');
 if(typeof r.source!=='string'||!r.source.trim()||r.source.length>200)throw Error('출처가 필요합니다.');
 let u;try{u=new URL(r.url);}catch{throw Error('출처 URL이 필요합니다.');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('출처 URL 오류');
 return {id:r.id,date:r.date,value:r.value,source:r.source,url:r.url,collectedAt:r.collectedAt||new Date().toISOString()};});
}
export async function mutate(fn){await fs.mkdir(DATA,{recursive:true});const lock=path.join(DATA,'write.lock');let h;
 for(let n=0;n<30;n++){try{h=await fs.open(lock,'wx');break;}catch(e){if(e.code!=='EEXIST')throw e;await new Promise(r=>setTimeout(r,100));}}
 if(!h)throw Error('데이터 저장 작업이 진행 중입니다. 잠시 후 재시도하세요.');
 try{const db=await readStore();await fn(db);db.updatedAt=new Date().toISOString();const tmp=path.join(DATA,'observations.tmp');await fs.writeFile(tmp,JSON.stringify(db,null,2));await fs.rename(tmp,path.join(DATA,'observations.json'));return db;}finally{await h.close();await fs.unlink(lock);}}
export function mergeRows(db,rows){for(const r of validateRows(rows)){let s=db.series[r.id]??=[];const at=s.findIndex(p=>p.date===r.date&&p.source===r.source);if(at>=0)s[at]=r;else s.push(r);s.sort((a,b)=>a.date.localeCompare(b.date)||a.collectedAt.localeCompare(b.collectedAt));}}
export function parseCSV(text){const lines=[];let row=[],field='',quoted=false;text=text.replace(/^\uFEFF/,'');for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));if(row.some(Boolean))lines.push(row);row=[];field='';}else field+=c;}if(quoted)throw Error('CSV 따옴표가 닫히지 않았습니다.');if(field||row.length){row.push(field.replace(/\r$/,''));lines.push(row);}const head=lines.shift()||[];for(const k of ['id','date','value','source','url'])if(!head.includes(k))throw Error('CSV 필수 열 누락: '+k);return lines.map(l=>{const r=Object.fromEntries(head.map((k,i)=>[k,l[i]||'']));if(!r.value.trim())throw Error('빈 값을 0으로 입력할 수 없습니다.');r.value=Number(r.value);return r;});}
export function csvExport(db){const q=x=>'"'+String(x??'').replaceAll('"','""')+'"';return '\uFEFFid,date,value,source,url,collectedAt\n'+Object.values(db.series).flat().map(r=>['id','date','value','source','url','collectedAt'].map(k=>q(r[k])).join(',')).join('\n');}
