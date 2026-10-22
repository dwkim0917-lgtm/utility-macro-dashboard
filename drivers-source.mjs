// 2026-10-22 추가 원천·파생: ① 원전 월간 이용률(EPSIS 전력거래량 → 연간 공식치 보정) + 3개월 추정
// ② 유가 결정 변수(IMF PortWatch 요충지 통항, CFTC 투기 포지션, 파생 스프레드·크랙) ③ 일본 연료비조정 시차 지표
import fs from 'node:fs/promises';
import path from 'node:path';
const UA={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'};
const get=async(url,opt={},ms=60000)=>{const r=await fetch(url,{...opt,headers:{...UA,...(opt.headers||{})},signal:AbortSignal.timeout(ms)});if(!r.ok)throw Error('HTTP '+r.status+' '+url.slice(0,60));return r;};
const latest=(db,id)=>{const s=db.series[id]||[];const src=s.at(-1)?.source;return s.filter(r=>r.source===src);};
const ym=d=>d.slice(0,7);
const daysIn=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();

// ── ① 원전: EPSIS 전력거래량(전력시장) 지역별 월간 응답에서 '소계' 원자력(c1, GWh)
export function parseEpsisNuclearTraded(js){const parts=js.split('gridData.push');const cur={};const out=new Map();
 for(const p of parts.slice(0,-1)){for(const [,k,v] of p.matchAll(/(c\d+)\s*=\s*textFormmat\("([^"]*)"/g))cur[k]=v;const ln=[...p.matchAll(/localnm\s*=\s*"([^"]*)"/g)].at(-1);if(ln)cur.loc=ln[1];const yr=[...p.matchAll(/year = "(\d{4})\/(\d{2})"/g)].at(-1);if(yr)cur.per=`${yr[1]}-${yr[2]}`;
  if(cur.loc==='소계'&&cur.per){const v=Number(cur.c1);if(Number.isFinite(v)&&v>0)out.set(cur.per,v);}}
 if(out.size<100)throw Error('EPSIS 원자력 거래량 소계 행 부족: '+out.size);
 return [...out].map(([m,v])=>({id:'nuclear_gwh',date:m+'-01',value:Math.round(v*10)/10,source:'KPX EPSIS · 원자력 전력거래량(전력시장)',url:'https://epsis.kpx.or.kr/epsisnew/selectEkmaPtdBftChart.do?menuId=040501'}));}
export async function fetchNuclearTraded(){const page=await get('https://epsis.kpx.or.kr/epsisnew/selectEkmaPtdBftChart.do?menuId=040501');const cookie=(page.headers.getSetCookie?.()||[]).map(c=>c.split(';')[0]).join('; ');await page.text();
 const r=await get('https://epsis.kpx.or.kr/epsisnew/selectEkmaPtdBft.ajax',{method:'POST',body:new URLSearchParams({selYear:'N',selRegion:'0'}),headers:{'Content-Type':'application/x-www-form-urlencoded','X-Requested-With':'XMLHttpRequest',Cookie:cookie}},120000);
 return parseEpsisNuclearTraded(await r.text());}
// 공식 연간 이용률(한수원)로 연도별 '거래량 기준 유효설비'를 역산해 월간 이용률을 만든다. 공식치가 없는 해는 직전 해 유효설비 × 설비 변동.
// 설비 변동(명판 MW, 공식 이용률 산정 기준 포함 시점): 고리2 계속운전 재가동 2026-04-10.
export const NUC_CHANGES=[{from:'2026-04',mw:650,note:'고리2 계속운전 재가동'}];
const NUC_BASE_MW=24925; // 2025 한수원 공식 기준 평균설비 = 184,720GWh ÷ (84.6% × 8,760h)
export function deriveNuclearMonthly(db){const ann=new Map(latest(db,'nuclear').map(r=>[+r.date.slice(0,4),r.value]));const g=new Map(latest(db,'nuclear_gwh').map(r=>[ym(r.date),r.value]));if(!g.size||!ann.size)return [];
 const cap={};for(const [y,u] of ann){const ms=[...Array(12)].map((_,i)=>g.get(`${y}-${String(i+1).padStart(2,'0')}`));if(ms.some(v=>v==null))continue;const h=(Date.UTC(y+1,0,1)-Date.UTC(y,0,1))/36e5;cap[y]=ms.reduce((a,b)=>a+b,0)*1000/(u/100*h);}
 const ys=Object.keys(cap).map(Number);if(!ys.length)return [];const lastY=Math.max(...ys);const out=[];
 for(const [m,v] of [...g].sort()){const y=+m.slice(0,4),mo=+m.slice(5,7);if(y<Math.min(...ys))continue;let c=cap[y];if(c==null){if(y<lastY)continue;const add=NUC_CHANGES.filter(x=>x.from<=m&&+x.from.slice(0,4)>lastY).reduce((a,x)=>a+x.mw,0);c=cap[lastY]*(1+add/NUC_BASE_MW);}
  out.push({id:'nuclear_m',date:m+'-01',value:Math.round(v*1000/(c*24*daysIn(y,mo))*1000)/10,source:'자체 산출 · EPSIS 원자력 거래량 ÷ 공식 연간 이용률 보정 설비',url:'https://epsis.kpx.or.kr/epsisnew/selectEkmaPtdBftChart.do?menuId=040501'});}
 return out;}
// 3개월 추정: 정비 트래커의 월별 이용률 상한(정비·불시정지·미공시 추정 반영, 명판 기준)과 실제 월간 이용률의 최근 12개월 선형관계로 다음 5개월 추정.
export function estimateNuclear(rows,ceil,{validFrom='0000-00'}={}){const act=new Map(rows.map(r=>[ym(r.date),r.value]));const ks=[...act.keys()].sort();if(!ks.length)return {rows:[],fit:null};const last=ks.at(-1);
 const pairs=ks.filter(k=>ceil[k]!=null&&k>=validFrom).slice(-12).map(k=>[ceil[k],act.get(k)]);if(pairs.length<4)return {rows:[],fit:null};
 const mx=pairs.reduce((a,p)=>a+p[0],0)/pairs.length,my=pairs.reduce((a,p)=>a+p[1],0)/pairs.length;const sxx=pairs.reduce((a,p)=>a+(p[0]-mx)**2,0),sxy=pairs.reduce((a,p)=>a+(p[0]-mx)*(p[1]-my),0);const b=sxx?sxy/sxx:1,a=my-b*mx;
 const sd=Math.sqrt(pairs.reduce((s,p)=>s+(p[1]-(a+b*p[0]))**2,0)/pairs.length);const out=[];
 for(const k of Object.keys(ceil).sort())if(k>last&&out.length<5){const v=Math.min(100,Math.max(40,a+b*ceil[k]));const e=Math.max(sd,0.5)*1.5;out.push({month:k,value:Math.round(v*10)/10,lo:Math.round((v-e)*10)/10,hi:Math.round((v+e)*10)/10,ceiling:ceil[k]});}
 return {rows:out,fit:{a,b,sd,n:pairs.length}};}
export async function readCeiling(root){try{return JSON.parse(await fs.readFile(path.join(root,'data','nuclear-oh-ceiling.json'),'utf8'));}catch{return {ceiling:{}};}}

// ── ② 요충지 통항: IMF PortWatch(위성 AIS) 일별 통과 선박 수
const PW='https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query';
export const CHOKE=[{id:'hormuz',port:'Strait of Hormuz',f:'n_total'},{id:'hormuz_tanker',port:'Strait of Hormuz',f:'n_tanker'},{id:'babel',port:'Bab el-Mandeb Strait',f:'n_total'},{id:'suez',port:'Suez Canal',f:'n_total'}];
export function parsePortWatch(j,spec){const fs_=j?.features;if(!Array.isArray(fs_))throw Error('PortWatch 형식 변경');return fs_.map(f=>f.attributes).filter(a=>a&&a.date!=null&&Number.isFinite(a[spec.f])).map(a=>({id:spec.id,date:new Date(a.date).toISOString().slice(0,10),value:a[spec.f],source:'IMF PortWatch · '+spec.port+' 일 통과 선박('+(spec.f==='n_tanker'?'탱커':'전체')+')',url:'https://portwatch.imf.org/pages/cb5856222a5b4105adc6ee7e880a1730'}));}
export async function fetchChokepoints({since}={}){const from=since||new Date(Date.now()-120*864e5).toISOString().slice(0,10);const out=[];
 for(const port of [...new Set(CHOKE.map(c=>c.port))]){let off=0;for(let i=0;i<40;i++){const q=new URLSearchParams({where:`portname='${port}' AND date >= DATE '${from}'`,outFields:'date,portname,n_total,n_tanker',orderByFields:'date ASC',resultOffset:String(off),resultRecordCount:'2000',f:'json'});const j=await (await get(PW+'?'+q)).json();for(const spec of CHOKE.filter(c=>c.port===port))out.push(...parsePortWatch(j,spec));const n=j.features?.length||0;if(!n||(!j.exceededTransferLimit&&n<1000))break;off+=n;}}
 if(!out.length)throw Error('PortWatch 행 없음');return out;}

// ── ② CFTC 분리보고서: NYMEX WTI(067651) 운용사(Managed Money) 순매수 계약 수
export function parseCftc(arr){if(!Array.isArray(arr)||!arr.length)throw Error('CFTC 응답 없음');return arr.map(r=>({id:'cftc_wti',date:String(r.report_date_as_yyyy_mm_dd).slice(0,10),value:Number(r.m_money_positions_long_all)-Number(r.m_money_positions_short_all),source:'CFTC · WTI 운용사 순매수(분리보고서)',url:'https://publicreporting.cftc.gov/'})).filter(r=>Number.isFinite(r.value));}
export async function fetchCftc({since='2006-01-01'}={}){const q=new URLSearchParams({$select:'report_date_as_yyyy_mm_dd,m_money_positions_long_all,m_money_positions_short_all',$where:`cftc_contract_market_code='067651' AND report_date_as_yyyy_mm_dd >= '${since}'`,$order:'report_date_as_yyyy_mm_dd',$limit:'5000'});return parseCftc(await (await get('https://publicreporting.cftc.gov/resource/72hh-3qpy.json?'+q)).json());}

// ── ② 유가 파생(같은 날짜끼리): Brent−WTI, Dubai−Brent, 3-2-1 크랙(NY 휘발유·난방유 ×42 − WTI 현물)
export function deriveOil(db){const m=id=>new Map(latest(db,id).map(r=>[r.date,r.value]));const out=[];const B=m('brent_b1'),W=m('wti_cl1'),D=m('dubai_d'),G=m('gas_nyh'),H=m('ho_nyh'),WS=m('wti');
 for(const [d,b] of B){if(W.has(d))out.push({id:'brent_wti',date:d,value:Math.round((b-W.get(d))*100)/100,source:'자체 산출 · ICE Brent − NYMEX WTI 최근월',url:'https://finance.yahoo.com/quote/BZ%3DF/'});if(D.has(d))out.push({id:'dubai_brent',date:d,value:Math.round((D.get(d)-b)*100)/100,source:'자체 산출 · Dubai − ICE Brent',url:'https://www.petronet.co.kr/'});}
 for(const [d,g] of G){if(H.has(d)&&WS.has(d))out.push({id:'crack_321',date:d,value:Math.round(((2*g+H.get(d))/3*42-WS.get(d))*100)/100,source:'자체 산출 · (2×휘발유+난방유)/3×42 − WTI 현물',url:'https://fred.stlouisfed.org/series/DGASNYH'});}
 return out;}

// ── ③ 일본 연료비조정 시차(期ずれ): 연료비 지수(엔) = 0.7×Brent×엔/달러 + 0.3×Newcastle×엔/달러(각 2020년 평균=100), 시차 = 당월 ÷ 3~5개월 전 평균 − 1
// 연료비조정 단가는 3~5개월 전 3개월 평균 수입가로 정해지므로, (+)면 원가가 요금보다 빨리 올라 일시 손실, (−)면 일시 이익.
export function deriveJpFuelLag(db){const mon=id=>{const acc=new Map();for(const r of latest(db,id)){const k=ym(r.date);const a=acc.get(k)||[0,0];a[0]+=r.value;a[1]++;acc.set(k,a);}return new Map([...acc].map(([k,[s,n]])=>[k,s/n]));};
 const B=mon('brent_b1'),C=mon('coal'),J=mon('usdjpy');const ks=[...B.keys()].filter(k=>C.has(k)&&J.has(k)).sort();const base=k=>k.startsWith('2020');
 const bb=ks.filter(base).map(k=>B.get(k)*J.get(k)),cb=ks.filter(base).map(k=>C.get(k)*J.get(k));if(!bb.length||!cb.length)return [];const B0=bb.reduce((a,b)=>a+b)/bb.length,C0=cb.reduce((a,b)=>a+b)/cb.length;
 const idx=new Map(ks.map(k=>[k,0.7*B.get(k)*J.get(k)/B0*100+0.3*C.get(k)*J.get(k)/C0*100]));const out=[];
 for(let i=5;i<ks.length;i++){const lag=[ks[i-5],ks[i-4],ks[i-3]].map(k=>idx.get(k));if(lag.some(v=>v==null))continue;const v=(idx.get(ks[i])/(lag.reduce((a,b)=>a+b)/3)-1)*100;out.push({id:'jp_fuel_lag',date:ks[i]+'-01',value:Math.round(v*10)/10,source:'자체 산출 · 엔화 연료비 지수(Brent 70%·석탄 30%) 당월 ÷ 3~5개월 전 평균',url:'https://fred.stlouisfed.org/series/DEXJPUS'});}
 return out;}
