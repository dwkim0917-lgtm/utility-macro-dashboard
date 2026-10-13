// 2026-10-13 신규 지표의 과거 이력 1회 적재(재실행 가능: 같은 날짜·출처는 덮어씀).
// Yahoo 2010~, JEPX 2016~, EIA ICE(xlsx) 2017~. FRED·EPSIS·PJM 표는 일일 수집이 전체 이력을 받으므로 여기서는 제외.
import {mutate,mergeRows} from './store.mjs';
import {catalog} from './catalog.mjs';
import {fetchYahooDaily,fetchJepx,fetchEiaPjm,deriveGlobal} from './global-source.mjs';
const rows=[],log=[];
for(const c of catalog.filter(x=>x.yahoo)){try{const r=await fetchYahooDaily(c.yahoo,c.id,c.yahoo,1262304000);rows.push(...r);log.push([c.id,r.length,r[0].date,r.at(-1).date]);}catch(e){log.push([c.id,'ERR',e.message]);}}
const y=new Date().getUTCFullYear();
try{const r=await fetchJepx(Array.from({length:y-2016+1},(_,i)=>2016+i));rows.push(...r);log.push(['jepx',r.length,r[0].date,r.at(-1).date]);}catch(e){log.push(['jepx','ERR',e.message]);}
const eia=[];for(let yr=2017;yr<=y;yr++)eia.push(yr===y?`xls/ice_electric-${yr}.xlsx`:`xls/archive/ice_electric-${yr}final.xlsx`);
const pjm=[];for(const f of eia){try{pjm.push(...await fetchEiaPjm([f]));}catch(e){log.push(['pjm_west',f,'ERR',e.message]);}}
if(pjm.length){const by=new Map(pjm.map(r=>[r.date,r]));const u=[...by.values()].sort((a,b)=>a.date.localeCompare(b.date));rows.push(...u);log.push(['pjm_west',u.length,u[0].date,u.at(-1).date]);}
await mutate(db=>{mergeRows(db,rows);const g=deriveGlobal(db);if(g.length)mergeRows(db,g);log.push(['derived',g.length]);});
console.log(log.map(x=>x.join(' ')).join('\n'));
