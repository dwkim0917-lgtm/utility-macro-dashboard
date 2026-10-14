// ECOS 공식 금리·환율 이력 적재(2010~, 재실행 안전). sample 키는 요청당 10행 → 14일 창 반복. ECOS_API_KEY가 있으면 1년 창.
import {mutate,mergeRows} from './store.mjs';
import {fetchEcos,ECOS} from './official-source.mjs';
const big=!!process.env.ECOS_API_KEY,stepDays=big?365:14,ymd=d=>d.toISOString().slice(0,10).replace(/-/g,'');
const from=new Date(process.argv[2]||'2010-01-01'),end=new Date(),rows=[],log={};
for(const key of Object.keys(ECOS)){let n=0;for(let s=new Date(from);s<end;s=new Date(+s+stepDays*864e5)){const e=new Date(Math.min(+s+(stepDays-1)*864e5,+end));for(let k=0;k<3;k++){try{const r=await fetchEcos(key,ymd(s),ymd(e));rows.push(...r);n+=r.length;break;}catch(err){if(k===2)console.log(key,ymd(s),err.message);await new Promise(r=>setTimeout(r,800));}}await new Promise(r=>setTimeout(r,big?50:120));}log[key]=n;console.log(key,n);}
await mutate(db=>mergeRows(db,rows));console.log(JSON.stringify(log));
