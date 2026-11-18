// 2026-11-18 LME 니켈: Westmetall(LME 공식 현물·3개월·재고, 일간) 수집 + 기관 전망(data/nickel-forecast.json) 요약
import fs from 'node:fs/promises';
import path from 'node:path';
const WM='https://www.westmetall.com/en/markdaten.php?action=table&field=LME_Ni_cash';
const MON={January:1,February:2,March:3,April:4,May:5,June:6,July:7,August:8,September:9,October:10,November:11,December:12};
const num=s=>{const v=Number(String(s).replace(/,/g,''));return Number.isFinite(v)?v:null;};
export function parseWestmetall(html){const out=[];const src='Westmetall · LME 니켈 공식가(Cash-Settlement·3-month)·LME 재고';
 for(const r of html.matchAll(/<tr[\s\S]*?<\/tr>/g)){const c=[...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(x=>x[1].replace(/<[^>]+>|&nbsp;/g,' ').replace(/\s+/g,' ').trim());
  const m=(c[0]||'').match(/^(\d{1,2})\.\s*([A-Za-z]+)\s+(\d{4})$/);if(!m||!MON[m[2]])continue;const date=`${m[3]}-${String(MON[m[2]]).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  const [cash,m3,stock]=[num(c[1]),num(c[2]),num(c[3])];
  if(cash!=null){if(cash<5000||cash>120000)throw Error('LME 니켈 현물 범위 이상 '+date+' '+cash);out.push({id:'lme_ni_cash',date,value:cash,source:src,url:WM});}
  if(m3!=null)out.push({id:'lme_ni_3m',date,value:m3,source:src,url:WM});
  if(stock!=null&&stock>0)out.push({id:'lme_ni_stock',date,value:stock,source:src,url:WM});}
 if(!out.length)throw Error('Westmetall 니켈 표 형식 변경');return out;}
export async function fetchNickel(fromYear=2019,ua='Mozilla/5.0'){const now=new Date().getUTCFullYear();const out=[];
 for(let y=fromYear;y<=now;y++){const r=await fetch(WM+(y===now?'':'&year='+y),{headers:{'User-Agent':ua},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Westmetall HTTP '+r.status);out.push(...parseWestmetall(await r.text()));await new Promise(s=>setTimeout(s,300));}
 return out;}
export const NI_FC_STALE_DAYS=120;
export async function readNickelForecast(root){const j=JSON.parse(await fs.readFile(path.join(root,'data','nickel-forecast.json'),'utf8'));
 for(const f of j.forecasts){if(!j.sources[f.src])throw Error('니켈 전망 출처 키 없음 '+f.src);if(!(f.value>3000&&f.value<100000))throw Error('니켈 전망 값 이상 '+f.src+' '+f.year);}return j;}
// 화면용: 기관별 표, 연초 이후 평균, 연간 전망 달성에 필요한 남은 기간 평균, 차트 점(연중앙)
export function nickelSummary(fc,cash,asOf){
 const rows=[...cash].filter(r=>Number.isFinite(r.value)).sort((a,b)=>a.date<b.date?-1:1);const last=rows.at(-1);const y=+asOf.slice(0,4);
 const ytd=rows.filter(r=>r.date.startsWith(String(y)));const ytdAvg=ytd.length?ytd.reduce((s,r)=>s+r.value,0)/ytd.length:null;
 const yAvg=yr=>{const a=rows.filter(r=>r.date.startsWith(String(yr)));return a.length?{year:yr,avg:a.reduce((s,r)=>s+r.value,0)/a.length,n:a.length}:null;};
 // 연 거래일 약 252일 가정
 const need=f=>{if(!ytdAvg||f.year!==y)return null;const n=ytd.length,N=Math.max(n+1,252);return (f.value*N-ytdAvg*n)/(N-n);};
 const table=fc.forecasts.map(f=>({...f,...fc.sources[f.src],vsLast:last&&!f.real?(f.value/last.value-1)*100:null,needRest:need(f)}));
 const dots=k=>fc.forecasts.filter(f=>f.src===k&&!f.real).map(f=>({date:`${f.year}-07-01`,value:f.value}));
 const age=Math.round((Date.parse(asOf)-Date.parse(fc.updatedAt))/864e5);
 return {asOf,updatedAt:fc.updatedAt,last,ytdAvg,ytdN:ytd.length,years:[y-2,y-1].map(yAvg).filter(Boolean),actual:fc.actual,table,unverified:fc.unverified||[],sources:fc.sources,note:fc.note,
  series:{niWB:dots('WB2610'),niWBprev:dots('WB2604'),niActualAnnual:(fc.actual||[]).map(a=>({date:`${a.year}-07-01`,value:a.value}))},stale:age>NI_FC_STALE_DAYS,ageDays:age};}
