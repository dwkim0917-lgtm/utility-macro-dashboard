// 2026-10-13 데이터 정합성 보정(재실행 안전). 결과는 data/repair-log-<날짜>.json.
// 1) Yahoo 계열: 확정 일봉으로 전체 재수집 → 같은 출처 행을 통째로 교체(장중가·주말 날짜 행 제거, 값 정정)
// 2) 거래소 시장 계열의 주말 날짜 행 제거(Investing 일요일 세션 표기 등)
// 3) 깨진 출처 문자열(�) 정리: 같은 날짜 정상 행이 있으면 삭제, 없으면 정상 출처명으로 교체
// 4) 출처 문구 변경(‘당일 장중 포함’ → ‘확정 종가’)에 맞춰 기존 행 출처명 일괄 변경
import fs from 'node:fs/promises';
import {mutate,today} from './store.mjs';
import {settledBars} from './yahoo-bars.mjs';
const UA={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'};
const YAHOO=[['wti_cl1','CL=F','Yahoo Finance · NYMEX CL1 확정 종가'],['brent_b1','BZ=F','Yahoo Finance · ICE B1 확정 종가'],['hh_ng1','NG=F','Yahoo Finance · NYMEX NG1 확정 종가'],
 ['fei','A7E=F','Yahoo Finance · CME Argus 프로판 FEI 연속(A7E=F) 종가'],['cpo','CPO=F','Yahoo Finance · CME CPO=F 종가'],['copper','HG=F','Yahoo Finance · HG=F 종가'],['iron_ore','TIO=F','Yahoo Finance · TIO=F 종가']];
const RENAME={'Yahoo Finance · NYMEX CL1 종가(당일 장중 포함)':'Yahoo Finance · NYMEX CL1 확정 종가','Yahoo Finance · ICE B1 종가(당일 장중 포함)':'Yahoo Finance · ICE B1 확정 종가','Yahoo Finance · NYMEX NG1 종가(당일 장중 포함)':'Yahoo Finance · NYMEX NG1 확정 종가'};
// 거래일만 존재하는 시장 계열(주말 날짜는 오류). SMP·전력수요·기온·JEPX·원전·PJM(주말 인도분) 등 달력일 계열은 제외.
const MARKET=['jkm_futures','fei','hh_ng1','coal','wti_cl1','brent_b1','wti_m12','brent_m12','wti','dubai_d','ttf','usdkrw','kr3y','credit','us10y','hh','brent','kau','cpo','copper','iron_ore','usdjpy','jkm_fei','jkm_hh'];
const log={at:new Date().toISOString(),yahoo:{},weekend:{},mojibake:[],renamed:0};
const fetched={};
for(const [id,sym,src] of YAHOO){const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=946684800&period2=${Math.floor(Date.now()/1000)+86400}&interval=1d`,{headers:UA,signal:AbortSignal.timeout(40000)});if(!r.ok)throw Error(sym+' HTTP '+r.status);
 const j=await r.json();if(j?.chart?.result?.[0]?.meta?.symbol!==sym)throw Error('종목 검증 실패 '+sym);fetched[id]={src,url:'https://finance.yahoo.com/quote/'+encodeURIComponent(sym)+'/',rows:settledBars(j).filter(b=>b.date<=today())};}
await mutate(db=>{const now=new Date().toISOString();
 for(const s of Object.values(db.series))for(const r of s)if(RENAME[r.source]){r.source=RENAME[r.source];log.renamed++;}
 for(const [id,f] of Object.entries(fetched)){const old=(db.series[id]||[]).filter(r=>r.source===f.src),keep=(db.series[id]||[]).filter(r=>r.source!==f.src);const om=new Map(old.map(r=>[r.date,r]));
  const fresh=f.rows.map(b=>({id,date:b.date,value:b.close,source:f.src,url:f.url,collectedAt:om.get(b.date)?.value===b.close?om.get(b.date).collectedAt:now}));const fm=new Map(fresh.map(r=>[r.date,r.value]));
  const changed=old.filter(r=>fm.has(r.date)&&Math.abs(fm.get(r.date)-r.value)>1e-9).map(r=>({date:r.date,old:r.value,new:fm.get(r.date)}));const removed=old.filter(r=>!fm.has(r.date)&&r.date>=f.rows[0].date).map(r=>({date:r.date,value:r.value}));
  // 재수집 범위 이전의 과거 행은 유지(원천이 더 이상 주지 않는 구간)
  const before=old.filter(r=>r.date<f.rows[0].date);db.series[id]=[...keep,...before,...fresh].sort((a,b)=>a.date.localeCompare(b.date)||a.collectedAt.localeCompare(b.collectedAt));
  log.yahoo[id]={rows:fresh.length,changed:changed.length,removed:removed.length,changedRecent:changed.filter(c=>c.date>='2026-09-01'),removedRecent:removed.filter(r=>r.date>='2026-09-01')};}
 for(const id of MARKET){const s=db.series[id]||[];const bad=s.filter(r=>{const d=new Date(r.date+'T00:00:00Z').getUTCDay();/* 한국 시장은 2000년 5월까지 토요일 장 운영 → 그 이전 토요일은 실제 거래일 */if(d===6&&id==='kr3y'&&r.date<'2000-06-01')return false;return d===0||d===6;});if(bad.length){log.weekend[id]=bad.map(r=>r.date+'='+r.value+' ['+r.source.slice(0,30)+']');db.series[id]=s.filter(r=>!bad.includes(r));}}
 for(const [id,s] of Object.entries(db.series)){const bad=s.filter(r=>r.source.includes('�'));if(!bad.length)continue;const main=s.filter(r=>!r.source.includes('�')).at(-1)?.source;
  for(const b of bad){const dup=s.some(r=>r!==b&&r.date===b.date&&!r.source.includes('�'));if(dup||!main){s.splice(s.indexOf(b),1);log.mojibake.push({id,date:b.date,action:'삭제(같은 날짜 정상 행 존재)'});}else{log.mojibake.push({id,date:b.date,action:'출처명 교체 → '+main,value:b.value});b.source=main;}}}
});
await fs.writeFile(`data/repair-log-${today()}.json`,JSON.stringify(log,null,1));
console.log(JSON.stringify({renamed:log.renamed,yahoo:Object.fromEntries(Object.entries(log.yahoo).map(([k,v])=>[k,{rows:v.rows,changed:v.changed,removed:v.removed,recent:v.changedRecent.slice(-4),removedRecent:v.removedRecent}])),weekend:Object.fromEntries(Object.entries(log.weekend).map(([k,v])=>[k,v.length+': '+v.slice(-3).join(' ')])),mojibake:log.mojibake},null,1));
