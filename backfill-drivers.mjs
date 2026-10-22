// 일회성: 요충지 통항(2019~)·CFTC WTI 포지션(2006~) 과거 이력 적재. 사용: node backfill-drivers.mjs
import {fetchChokepoints,fetchCftc} from './drivers-source.mjs';
import {mergeRows,mutate} from './store.mjs';
const ch=await fetchChokepoints({since:'2019-01-01'});const cf=await fetchCftc({since:'2006-01-01'});
await mutate(db=>{mergeRows(db,ch);mergeRows(db,cf);});
const by={};for(const r of [...ch,...cf])by[r.id]=(by[r.id]||0)+1;console.log(JSON.stringify(by));
