// 해외(일본·미국) 지표·종목 원천 (2026-10-13). 외부 라이브러리 없이 CSV·XLSX를 직접 읽는다.
import zlib from 'node:zlib';
import {settledBars} from './yahoo-bars.mjs';
import {seriesRows} from './store.mjs';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const get=async(url,ms=60000)=>{const r=await fetch(url,{signal:AbortSignal.timeout(ms),headers:{'User-Agent':UA}});if(!r.ok)throw Error('HTTP '+r.status+' '+url);return r;};
const kstToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());

// 해외 비교 종목: 주가 시차 분석(해외)과 종목 필터에 쓴다. market = 월수익률 회귀에서 통제하는 시장 지수.
export const globalStocks={
 '8058.T':{name:'미쓰비시상사',region:'JP',sector:'일본 상사',market:'1306.T'},
 '8031.T':{name:'미쓰이물산',region:'JP',sector:'일본 상사',market:'1306.T'},
 '8001.T':{name:'이토추상사',region:'JP',sector:'일본 상사',market:'1306.T'},
 '8002.T':{name:'마루베니',region:'JP',sector:'일본 상사',market:'1306.T'},
 '8053.T':{name:'스미토모상사',region:'JP',sector:'일본 상사',market:'1306.T'},
 '9501.T':{name:'도쿄전력HD',region:'JP',sector:'일본 전력가스',market:'1306.T'},
 '9503.T':{name:'간사이전력',region:'JP',sector:'일본 전력가스',market:'1306.T'},
 '9502.T':{name:'주부전력',region:'JP',sector:'일본 전력가스',market:'1306.T'},
 '9531.T':{name:'도쿄가스',region:'JP',sector:'일본 전력가스',market:'1306.T'},
 '9532.T':{name:'오사카가스',region:'JP',sector:'일본 전력가스',market:'1306.T'},
 'VST':{name:'Vistra',region:'US',sector:'미국 발전(독립)',market:'^GSPC'},
 'CEG':{name:'Constellation',region:'US',sector:'미국 발전(독립)',market:'^GSPC'},
 'NRG':{name:'NRG Energy',region:'US',sector:'미국 발전(독립)',market:'^GSPC'},
 'TLN':{name:'Talen Energy',region:'US',sector:'미국 발전(독립)',market:'^GSPC'},
 'NEE':{name:'NextEra',region:'US',sector:'미국 규제 유틸리티',market:'^GSPC'},
 'SO':{name:'Southern Co.',region:'US',sector:'미국 규제 유틸리티',market:'^GSPC'},
 'DUK':{name:'Duke Energy',region:'US',sector:'미국 규제 유틸리티',market:'^GSPC'},
 'AEP':{name:'AEP',region:'US',sector:'미국 규제 유틸리티',market:'^GSPC'}};
export const globalMarkets={'1306.T':'TOPIX (NEXT FUNDS ETF)','^GSPC':'S&P 500'};
export const globalNames=Object.fromEntries(Object.entries(globalStocks).map(([k,v])=>[k,v.name]));

// Yahoo 일별 종가: 거래소 현지 날짜(gmtoffset 반영). 당일(미확정)은 제외.
export function parseYahooLocal(j,id,source,url){const today=kstToday();const out=settledBars(j).filter(b=>b.date<=today).map(b=>({id,date:b.date,value:Math.round(b.close*10000)/10000,source,url}));
 if(!out.length)throw Error('Yahoo 종가 없음');return out;}
export async function fetchYahooDaily(sym,id,label,from=1262304000){const r=await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${from}&period2=${Math.floor(Date.now()/1000)+86400}&interval=1d`,30000);
 const j=await r.json();if(j?.chart?.result?.[0]?.meta?.symbol!==sym)throw Error('Yahoo 종목 검증 실패 '+sym);return parseYahooLocal(j,id,'Yahoo Finance · '+label+' 종가','https://finance.yahoo.com/quote/'+encodeURIComponent(sym)+'/history/');}

// JEPX 스팟: 30분 단위 시스템프라이스(円/kWh) → 일평균. CSV는 Shift_JIS.
export function parseJepx(buf){const text=new TextDecoder('shift_jis').decode(buf);const lines=text.trim().split(/\r?\n/);const head=lines.shift().split(',');const col=head.findIndex(h=>h.includes('システムプライス'));if(col<0)throw Error('JEPX 시스템프라이스 열 없음');
 const by=new Map();for(const l of lines){const c=l.split(',');const d=(c[0]||'').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);const v=Number(c[col]);if(!d||!Number.isFinite(v))continue;const date=`${d[1]}-${d[2].padStart(2,'0')}-${d[3].padStart(2,'0')}`;const a=by.get(date)||[];a.push(v);by.set(date,a);}
 const today=kstToday(),out=[];for(const [date,a] of by){if(a.length<46||date>today)continue;out.push({id:'jepx',date,value:Math.round(a.reduce((s,x)=>s+x,0)/a.length*100)/100,source:'JEPX · 스팟 시스템프라이스(30분 단위 일평균)',url:'https://www.jepx.jp/electricpower/market-data/spot/'});}
 if(!out.length)throw Error('JEPX 일평균 없음');return out.sort((a,b)=>a.date.localeCompare(b.date));}
export async function fetchJepx(years){const y=new Date().getUTCFullYear();const out=[];for(const yr of years||[y-1,y]){try{out.push(...parseJepx(new Uint8Array(await (await get(`https://www.jepx.jp/market/excel/spot_${yr}.csv`,90000)).arrayBuffer())));}catch(e){if(yr===y)throw e;}}return out;}

// 최소 XLSX 리더: ZIP 중앙 디렉터리 → 첫 시트 XML → 행 배열. 공유문자열·인라인 문자열·숫자만 지원.
export function unzip(buf){const out={};const sig=Buffer.from([0x50,0x4b,0x05,0x06]);const e=buf.lastIndexOf(sig);if(e<0)throw Error('ZIP 형식 아님');const n=buf.readUInt16LE(e+10);let p=buf.readUInt32LE(e+16);
 for(let i=0;i<n;i++){const method=buf.readUInt16LE(p+10),cs=buf.readUInt32LE(p+20),nl=buf.readUInt16LE(p+28),el=buf.readUInt16LE(p+30),cl=buf.readUInt16LE(p+32),lho=buf.readUInt32LE(p+42);const name=buf.toString('utf8',p+46,p+46+nl);
  const start=lho+30+buf.readUInt16LE(lho+26)+buf.readUInt16LE(lho+28);const data=buf.subarray(start,start+cs);out[name]=method===8?zlib.inflateRawSync(data):data;p+=46+nl+el+cl;}return out;}
const ent=s=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
export function xlsxRows(buf){const z=unzip(Buffer.from(buf));const ss=[...(z['xl/sharedStrings.xml']?.toString('utf8')||'').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>ent([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t=>t[1]).join('')));
 const sheetName=Object.keys(z).filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];if(!sheetName)throw Error('XLSX 시트 없음');const xml=z[sheetName].toString('utf8');
 return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(r=>{const row=[];for(const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){const col=[...c[1]].reduce((a,ch)=>a*26+ch.charCodeAt(0)-64,0)-1;const t=(c[2].match(/t="(\w+)"/)||[])[1];const v=(c[3]?.match(/<v>([\s\S]*?)<\/v>/)||[])[1];const is=(c[3]?.match(/<t[^>]*>([\s\S]*?)<\/t>/)||[])[1];
  row[col]=t==='s'?ss[Number(v)]:t==='inlineStr'?ent(is||''):t==='str'?ent(v||''):v==null?null:Number.isFinite(Number(v))?Number(v):v;}return row;});}
const serial=v=>typeof v==='number'?new Date(Date.UTC(1899,11,30)+Math.round(v)*864e5).toISOString().slice(0,10):String(v).match(/^\d{4}-\d{2}-\d{2}/)?.[0];

// EIA 도매전력(ICE 거래소 일간 평균): PJM West Hub 피크. 날짜 = 인도 시작일.
export function parseEiaIce(rows,url){const head=rows.findIndex(r=>r?.some(c=>typeof c==='string'&&/price hub/i.test(c)));if(head<0)throw Error('EIA ICE 헤더 없음');const h=rows[head].map(c=>String(c||'').toLowerCase());
 const iHub=h.findIndex(c=>c.includes('price hub')),iDel=h.findIndex(c=>c.includes('delivery')&&c.includes('start')),iWt=h.findIndex(c=>c.includes('wtd avg'));if(iDel<0||iWt<0)throw Error('EIA ICE 열 변경');
 const out=[];for(const r of rows.slice(head+1)){if(!/^PJM W/i.test(String(r?.[iHub]||'')))continue;const date=serial(r[iDel]),v=Number(r[iWt]);if(!date||!Number.isFinite(v))continue;out.push({id:'pjm_west',date,value:v,source:'EIA · ICE PJM West Hub 피크 일간 가중평균',url});}
 if(!out.length)throw Error('EIA PJM West 행 없음');const by=new Map(out.map(r=>[r.date,r]));return [...by.values()].sort((a,b)=>a.date.localeCompare(b.date));}
export async function fetchEiaPjm(files){const out=[];for(const f of files||['xls/ice_electric-'+new Date().getUTCFullYear()+'.xlsx']){const url='https://www.eia.gov/electricity/wholesale/'+f;const r=await get(url,90000);if(!/sheet|octet|excel/.test(r.headers.get('content-type')||''))throw Error('EIA 파일 형식 아님 '+f);out.push(...parseEiaIce(xlsxRows(new Uint8Array(await r.arrayBuffer())),'https://www.eia.gov/electricity/wholesale/'));}return out;}

// PJM 용량시장(BRA) RTO 낙찰가. 날짜 = 경매 결과 발표 월(인도연도는 출처 문구). 출처: PJM 2027/28 BRA 결과 리뷰 자료의 연도별 표.
const PJM_BRA_URL='https://www.pjm.com/-/media/DotCom/committees-groups/committees/mrc/2025/20251219-special/item-01---review-of-2027-2028-base-residual-auction-results---presentation.pdf';
export const pjmCapacityRows=()=>[['2014-05-01','2017/18',120.00],['2015-08-01','2018/19',164.77],['2016-05-01','2019/20',100.00],['2017-05-01','2020/21',76.53],['2018-05-01','2021/22',140.00],['2021-06-01','2022/23',50.00],['2022-06-01','2023/24',34.13],['2023-02-01','2024/25',28.92],['2024-07-01','2025/26',269.92],['2025-07-01','2026/27',329.17],['2025-12-01','2027/28',333.44]]
 .map(([date,dy,value])=>({id:'pjm_cap',date,value,source:'PJM · BRA RTO 낙찰가(인도연도별, 결과 발표월 기준)',url:PJM_BRA_URL,note:dy}));

// 월평균 유틸
const monthMean=(rows)=>{const m=new Map();for(const r of rows){const k=r.date.slice(0,7);const a=m.get(k)||[];a.push(r.value);m.set(k,a);}return m;};
const latestSource=rows=>{const s=rows.at(-1)?.source;return rows.filter(r=>r.source===s);};
// 해외 파생: 일본 스파크(JEPX 월평균 − LNG 수입가×엔/달러×7,000Btu/kWh), PJM 스파크(PJM West − HH 현물×7 MMBtu/MWh).
export const JP_HEAT_MMBTU_PER_KWH=0.007,US_HEAT_MMBTU_PER_MWH=7;
export function deriveGlobal(db){const out=[];const S=id=>seriesRows(db,id);
 const jepx=S('jepx'),jlng=S('jlng'),jpy=S('usdjpy');if(jepx.length&&jlng.length&&jpy.length){const jm=monthMean(jepx),ym=monthMean(jpy);for(const r of jlng){const k=r.date.slice(0,7),a=jm.get(k),y=ym.get(k);if(!a||a.length<20||!y||y.length<10)continue;const p=a.reduce((s,x)=>s+x,0)/a.length,fx=y.reduce((s,x)=>s+x,0)/y.length;out.push({id:'jp_spark',date:k+'-01',value:Math.round((p-r.value*fx*JP_HEAT_MMBTU_PER_KWH)*100)/100,source:'자체 산출 · JEPX 월평균 − IMF 일본 LNG 수입가×엔/달러×0.007',url:'https://fred.stlouisfed.org/series/PNGASJPUSDM'});}}
 const pjm=S('pjm_west'),hh=S('hh');if(pjm.length&&hh.length){const hm=new Map(hh.map(r=>[r.date,r.value]));for(const r of pjm){let v=hm.get(r.date);if(v==null){const prev=hh.findLast(h=>h.date<r.date&&Date.parse(r.date)-Date.parse(h.date)<=4*864e5);v=prev?.value;}if(v==null)continue;out.push({id:'pjm_spark',date:r.date,value:Math.round((r.value-v*US_HEAT_MMBTU_PER_MWH)*100)/100,source:'자체 산출 · EIA PJM West 피크 − FRED Henry Hub 현물×7',url:'https://www.eia.gov/electricity/wholesale/'});}}
 return out;}
