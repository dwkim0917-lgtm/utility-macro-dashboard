// 전 지표 최신값·관측일 점검 + Yahoo/FRED 같은 날짜 교차 확인. 결과: 콘솔 표 + data/verify-latest.json
// 사용: node verify-latest.mjs   (DATA_VERIFY_MANUAL.md 2단계)
import fs from 'node:fs/promises';
import path from 'node:path';
import {catalog} from './catalog.mjs';
import {ROOT,readStore,today} from './store.mjs';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const day=864e5;
// 대시보드 id → 독립 출처(같은 상품·같은 정의). tol=허용 상대오차. Yahoo KRW=X는 일봉 날짜가 하루 어긋나(10/2 값=Investing 10/2 시가) 제외 — 환율은 FRED와 Investing으로 대조
const XY={wti_cl1:['CL=F',0.002],brent_b1:['BZ=F',0.002],hh_ng1:['NG=F',0.005],cpo:['CPO=F',0.005],fei:['A7E=F',0.005],jkm_futures:['JKM=F',0.003],ttf:['TTF=F',0.01],us10y:['^TNX',0.01]};
const XF={wti:'DCOILWTICO',brent:'DCOILBRENTEU',hh:'DHHNGSP',usdkrw:'DEXKOUS',us10y:'DGS10'};
async function yahoo(sym){const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1mo&interval=1d`,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(20000)});const x=(await r.json())?.chart?.result?.[0];if(!x?.timestamp)return new Map();const off=x.meta.gmtoffset||0;const m=new Map();x.timestamp.forEach((t,i)=>{const v=x.indicators.quote[0].close[i];if(v>0)m.set(new Date((t+off)*1000).toISOString().slice(0,10),v);});return m;}
async function fred(id){const r=await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${new Date(Date.now()-40*day).toISOString().slice(0,10)}`,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(20000)});const m=new Map();for(const l of (await r.text()).trim().split('\n').slice(1)){const [d,v]=l.split(',');if(v&&v!=='.')m.set(d,Number(v));}return m;}
const db=await readStore();const t0=Date.parse(today());const rows=[];
for(const c of catalog){const s=db.series[c.id]||[];const l=s.at(-1);if(!l){rows.push({id:c.id,name:c.name,status:'미연결'});continue;}
 const same=s.filter(r=>r.source===l.source);const p=same.at(-2);const age=Math.round((t0-Date.parse(l.date))/day);const stale=age>(c.staleDays??(c.frequency==='월간'?65:c.frequency==='연간'?500:8));
 const fut=l.date>today();rows.push({id:c.id,name:c.name,freq:c.frequency,unit:c.unit,date:l.date,value:l.value,prevDate:p?.date,prev:p?.value,age,stale,future:fut,source:l.source,checks:[]});}
for(const r of rows){if(!r.date)continue;const s=(db.series[r.id]||[]).filter(x=>x.source===r.source);const recent=s.slice(-6);
 try{if(XY[r.id]){/* Yahoo 원천 계열은 날짜 정합성 점검, 그 외는 독립 출처 대조 */const [sym,tol]=XY[r.id];const m=await yahoo(sym);for(const o of recent){if(!m.has(o.date))continue;let v=m.get(o.date);const d=Math.abs(v/o.value-1);r.checks.push({src:'Yahoo '+sym,date:o.date,ours:o.value,ref:+v.toFixed(4),diff:+(d*100).toFixed(2),ok:d<=tol});}}
  if(XF[r.id]){const m=await fred(XF[r.id]);for(const o of recent){if(!m.has(o.date))continue;const v=m.get(o.date);const d=Math.abs(v/o.value-1);r.checks.push({src:'FRED '+XF[r.id],date:o.date,ours:o.value,ref:v,diff:+(d*100).toFixed(2),ok:d<=0.001});}}}
 catch(e){r.checks.push({src:'error',err:e.message});}}
const bad=rows.filter(r=>r.checks?.some(c=>c.ok===false));const fut=rows.filter(r=>r.future);const stale=rows.filter(r=>r.stale);
await fs.writeFile(path.join(ROOT,'data','verify-latest.json'),JSON.stringify({at:new Date().toISOString(),rows},null,1));
for(const r of rows)console.log([r.id,r.freq||'',r.date||'-',r.value!=null?+Number(r.value).toFixed(3):'',r.age!=null?r.age+'d':'',r.stale?'STALE':'',r.future?'FUTURE':'',(r.checks||[]).length?((r.checks.every(c=>c.ok)?'X✓':'X✗')+r.checks.length):'',r.source||r.status].join(' | '));
console.log(`\n교차 불일치 ${bad.length} · 미래날짜 ${fut.length} · 지연 ${stale.length}`);
for(const r of bad)console.log('불일치',r.id,JSON.stringify(r.checks.filter(c=>!c.ok)));
for(const r of fut)console.log('미래날짜',r.id,r.date);
