// 실시간 공시 현황 (2026-10-14). 화면 상단 '실시간 현황' 띠와 /api/live. 저장 시계열과 분리(장중·미확정 값 포함, 조회 시각 병기).
// 원천: KPX 메인(실시간 전력수급 5분, 오늘의 SMP 하루전 결정가, 최대부하 전망, 오늘의 REC), 한수원 운영현황, Yahoo 장중 선물가.
import {parseNuclearLive} from './nuclear-source.mjs';
const UA={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'};
const text=h=>h.replace(/<script[\s\S]*?<\/script>/g,' ').replace(/<style[\s\S]*?<\/style>/g,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');
const num=s=>s==null?null:Number(String(s).replace(/,/g,''));
const kst=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
export function parseKpxMain(html){const t=text(html);const m=(re)=>t.match(re);
 const live=m(/실시간전력수급현황\s+(\S+)\s+공급능력\s+([\d,]+)\s*MW\s+현재부하\s+([\d,]+)\s*MW\s+공급예비력\s+([\d,]+)\s*MW\s+공급예비율\s+([\d.]+)\s*%/);
 const smp=m(/오늘의 SMP\(육지\)[\s\S]*?거래일\s+(\d{4})\.(\d{2})\.(\d{2})\S*\s+최고가\s+([\d.]+)\s+최소가\s+([\d.]+)\s+평균가\s+([\d.]+)/);
 const peakH=html.match(/피크예상시간은\s*<strong>([^<]+)<\/strong>/),peakMw=html.match(/최대전력은\s*<strong>([\d,]+)<\/strong>/);
 const pk=html.match(/최대부하<\/h4>[\s\S]*?graph_value">([\d,]+)\s*MW[\s\S]*?공급예비력<\/h4>[\s\S]*?graph_value">([\d,]+)\s*MW[\s\S]*?공급예비율<\/h4>[\s\S]*?graph_value">([\d.]+)\s*%/);const vals=pk?[num(pk[1]),num(pk[2]),num(pk[3])]:[];
 const rec=m(/오늘의 REC[\s\S]{0,200}?거래일\s+(\d{4})\.(\d{2})\.(\d{2})\S*\s+거래량\s+([\d,]+)\s+평균가\s+([\d,]+)/);
 const out={};
 if(live)out.grid={status:live[1],supply:num(live[2]),load:num(live[3]),reserve:num(live[4]),reserveRate:num(live[5])};
 if(smp)out.smpToday={date:`${smp[1]}-${smp[2]}-${smp[3]}`,max:num(smp[4]),min:num(smp[5]),avg:num(smp[6])};
 if(peakMw)out.peakForecast={date:kst(),mw:num(peakMw[1]),hour:peakH?.[1]||null,reserve:vals[1]??null,reserveRate:vals[2]??null};
 if(rec)out.recToday={date:`${rec[1]}-${rec[2]}-${rec[3]}`,volume:num(rec[4]),avg:num(rec[5])};
 if(!out.grid&&!out.smpToday)throw Error('KPX 메인 형식 변경');return out;}
const YQ=[['CL=F','WTI'],['BZ=F','Brent'],['NG=F','Henry Hub'],['TTF=F','TTF'],['HG=F','구리'],['KRW=X','원/달러'],['JPY=X','엔/달러']];
async function yq(sym){const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`,{headers:UA,signal:AbortSignal.timeout(15000)});const m=(await r.json())?.chart?.result?.[0]?.meta;if(!m?.regularMarketPrice)throw Error(sym);return {price:m.regularMarketPrice,prev:m.chartPreviousClose??m.previousClose??null,at:new Date(m.regularMarketTime*1000).toISOString(),tz:m.exchangeTimezoneName};}
let cache=null;
export async function fetchLive({maxAgeMs=5*60e3}={}){if(cache&&Date.now()-cache.t<maxAgeMs)return cache.v;const v={fetchedAt:new Date().toISOString(),sources:{kpx:'https://new.kpx.or.kr/',khnp:'https://npp.khnp.co.kr/',yahoo:'https://finance.yahoo.com/'},errors:[]};
 const tasks=[(async()=>{const r=await fetch('https://new.kpx.or.kr/',{headers:UA,signal:AbortSignal.timeout(20000)});Object.assign(v,parseKpxMain(await r.text()));})(),
  (async()=>{const r=await fetch('https://npp.khnp.co.kr/',{headers:UA,signal:AbortSignal.timeout(20000)});const rows=parseNuclearLive(await r.text(),kst());v.nuclear={util:rows.find(x=>x.id==='nuclear_live')?.value??null,units:rows.find(x=>x.id==='nuclear_units')?.value??null,total:Number(rows.find(x=>x.id==='nuclear_units')?.source.match(/총 (\d+)/)?.[1])||null};})(),
  (async()=>{v.quotes=[];for(const [s,n] of YQ){try{v.quotes.push({sym:s,name:n,...await yq(s)});}catch(e){v.errors.push('Yahoo '+s);}}})()];
 for(const r of await Promise.allSettled(tasks))if(r.status==='rejected')v.errors.push(r.reason?.message||String(r.reason));
 cache={t:Date.now(),v};return v;}
// 일별 저장용: 오늘 최대부하 전망(KPX), 날짜=조회일(KST)
export async function fetchPeakForecastRow(){const r=await fetch('https://new.kpx.or.kr/',{headers:UA,signal:AbortSignal.timeout(20000)});const p=parseKpxMain(await r.text()).peakForecast;if(!p?.mw)throw Error('최대부하 전망 없음');return [{id:'peak_fcst',date:p.date,value:p.mw,source:'KPX · 오늘 최대부하 전망(수집 시점)',url:'https://new.kpx.or.kr/menu.es?mid=a10606010000'}];}
