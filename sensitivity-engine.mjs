// 매크로 단위 충격 → 종목별 연간 영업이익 환산. 수치·출처는 sensitivity-data.mjs에서 수동 관리한다.
// 환산은 "해당 변동이 1년 지속 + 다른 변수 일정 + 선형" 가정의 정태적 추정이며 주가 예측이 아니다.
import {catalog,stocks} from './catalog.mjs';
import {sensitivities,opBase,dataAsOf} from './sensitivity-data.mjs';
const day=86400000;
const windows=[{key:'d1',label:'직전 관측'},{key:'d7',label:'7일',days:7},{key:'d30',label:'30일',days:30},{key:'d90',label:'90일',days:90},{key:'yoy',label:'전년 동기(계절성 제거)',days:365}];
// 계절·용도 믹스로 월별 수준이 출렁이는 월간 지표: 전월 대비 환산은 오해 소지가 커 전년동월 비교를 기본으로 쓴다.
export const seasonal=new Set(['tariff','purchase','smp','smp_daily','smp_mtd','consumption','gas_sales']);
export function sameSourceRows(db,id,date){const all=(db.series?.[id]||[]).filter(r=>!date||r.date<=date);const latest=all.at(-1);return latest?all.filter(r=>r.source===latest.source):[];}
export function moves(rows){const latest=rows.at(-1);if(!latest)return null;const out={latest,windows:{}};
 for(const w of windows){let base;if(!w.days)base=rows.at(-2);else{const target=Date.parse(latest.date)-w.days*day;base=rows.findLast(r=>Date.parse(r.date)<=target);if(base&&target-Date.parse(base.date)>Math.max(35,w.days)*day)base=null;}
  if(base&&base!==latest)out.windows[w.key]={from:base.date,base:base.value,abs:latest.value-base.value,pct:base.value?(latest.value/base.value-1)*100:null};}
 return out;}
// 충격 1건을 영업이익(억원/년)으로 환산. mode abs: 단위 절대변화, pct: % 변화.
export function translate(s,move){if(!move)return null;const delta=s.per.mode==='pct'?move.pct:move.abs;if(delta==null||!Number.isFinite(delta))return null;const k=delta/s.per.size;const base=opBase[s.stock]?.op;const v=s.op*k;
 return {value:v,low:s.range?Math.min(s.range[0]*k,s.range[1]*k):null,high:s.range?Math.max(s.range[0]*k,s.range[1]*k):null,pctOfOp:base?v/base*100:null};}
export function buildView(db,date){const byId=Object.fromEntries(catalog.map(c=>[c.id,c]));const indicators={};
 for(const id of new Set(sensitivities.map(s=>s.indicator))){const c=byId[id];if(!c)continue;const m=moves(sameSourceRows(db,id,date));indicators[id]={id,name:c.name,unit:c.unit,frequency:c.frequency,latest:m?.latest||null,windows:m?.windows||{}};}
 const rows=sensitivities.filter(s=>byId[s.indicator]).map(s=>{const ind=indicators[s.indicator];const impacts={};for(const w of windows)impacts[w.key]=translate(s,ind.windows[w.key]);return {...s,stockName:stocks[s.stock],indicatorName:ind.name,unitPctOfOp:opBase[s.stock]?.op?s.op/opBase[s.stock].op*100:null,seasonal:seasonal.has(s.indicator),impacts};});
 const gaps=[];for(const c of catalog)for(const code of new Set(c.effects.flatMap(e=>e.codes)))if(!sensitivities.some(s=>s.indicator===c.id&&s.stock===code))gaps.push({indicator:c.id,indicatorName:c.name,stock:code,stockName:stocks[code]});
 return {dataAsOf,windows,stocks,opBase,indicators,rows,gaps,assumption:'환산값 = 민감도 × 실제 변동폭. 변동이 1년 지속되고 다른 변수·요금·헤지가 그대로라는 선형 가정. 시차(lag) 이후 반영되며 규제 정산·헤지로 실제와 다를 수 있음. 주가 예측 아님.'};}
// 아침 브리핑용 한 줄: 해당 지표의 7일(없으면 직전) 변동을 영향 큰 순으로 최대 3종목.
export function briefLine(db,id,date){const list=sensitivities.filter(s=>s.indicator===id);if(!list.length)return '';const m=moves(sameSourceRows(db,id,date));if(!m)return '';const key=seasonal.has(id)?'yoy':m.windows.d7?'d7':'d1',w=m.windows[key];if(!w)return '';
 const parts=list.map(s=>({s,t:translate(s,w)})).filter(x=>x.t&&Math.abs(x.t.value)>=1).sort((a,b)=>Math.abs(b.t.pctOfOp??0)-Math.abs(a.t.pctOfOp??0)).slice(0,3).map(({s,t})=>`${stocks[s.stock]} ${t.value>0?'+':'−'}${Math.round(Math.abs(t.value)).toLocaleString('ko-KR')}억${t.pctOfOp!=null?`(${t.pctOfOp>0?'+':'−'}${Math.abs(t.pctOfOp).toFixed(1)}%)`:''}[${s.grade}]`);
 return parts.length?`환산(${key==='yoy'?'전년동월 대비':key==='d7'?'7일 변동':'직전 대비'}·연율): `+parts.join(' · '):'';}
