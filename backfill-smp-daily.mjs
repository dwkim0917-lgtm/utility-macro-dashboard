// 일회성: KPX 일간 SMP를 2021-01부터 주 단위로 받아 저장. 사용: node backfill-smp-daily.mjs [시작일]
import {kpxSession,fetchKpxSmpWeek,deriveSmpMonthly} from './kpx-smp-daily.mjs';
import {mergeRows,mutate} from './store.mjs';
const start=process.argv[2]||'2021-01-07';const rows=[];let s=await kpxSession(),fail=0;
for(let d=new Date(start+'T00:00:00Z');d<=new Date();d=new Date(d.getTime()+7*864e5)){const iso=d.toISOString().slice(0,10);
 try{rows.push(...await fetchKpxSmpWeek(s,iso));}catch(e){fail++;console.error(iso,e.message);s=await kpxSession();try{rows.push(...await fetchKpxSmpWeek(s,iso));fail--;}catch{}}
 await new Promise(r=>setTimeout(r,250));}
const uniq=[...new Map(rows.map(r=>[r.date,r])).values()].sort((a,b)=>a.date.localeCompare(b.date));
await mutate(db=>{mergeRows(db,uniq);mergeRows(db,deriveSmpMonthly(db));});
console.log(JSON.stringify({rows:uniq.length,first:uniq[0]?.date,last:uniq.at(-1)?.date,failedWeeks:fail}));
