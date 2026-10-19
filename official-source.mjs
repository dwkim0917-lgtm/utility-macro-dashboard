// 1차(공식) 원천 (2026-10-14): CME 공식 정산가, 한국은행 ECOS.
// CME: 거래소 확정 정산가(Final). 최근 5거래일만 제공 → 일일 수집·교차검증용(과거 이력은 기존 원천 유지).
// ECOS: 국고채 3년·회사채 AA− 3년(금융투자협회 최종호가수익률), 원/달러 매매기준율(서울). 키는 ECOS_API_KEY(없으면 공개 sample 키: 요청당 10행).
const UA={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',Accept:'application/json'};
const get=async(url,ms=25000)=>{const r=await fetch(url,{headers:UA,signal:AbortSignal.timeout(ms)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();};
const iso=mdy=>{const [m,d,y]=mdy.split('/');return `${y}-${m}-${d}`;};
// 최근월 = 정산가가 있는 첫 월물(목록은 만기순). 월물명도 함께 저장해 교체 시점을 추적한다.
export const CME={wti_cl1:{id:425,name:'CL'},brent_b1:{id:424,name:'BZ'},hh_ng1:{id:444,name:'NG'},copper:{id:438,name:'HG'},jkm_futures:{id:7049,name:'JKM'},ttf:{id:8378,name:'TTF'},fei:{id:4615,name:'7E'},cpo:{id:2457,name:'CPO'}};
export const cmeSource=k=>`CME · ${CME[k].name} 최근월 확정 정산가`;
const MON={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
// 2026-10-19: JKM은 계약월 직전 달 15일 만기. 만기 다음 거래일에도 CME 목록 첫 행에 만기 월물(최종정산가 고정)이 남아 있어 전일값이 반복 기록됐다(10/16 26.532). minIdx(년*12+월) 미만 월물은 건너뛴다.
export function jkmMinMonthIdx(tradeIso){const y=+tradeIso.slice(0,4),m=+tradeIso.slice(5,7),d=+tradeIso.slice(8,10);return y*12+m+(d>15?2:1);}
export function parseCmeSettlements(j,{minIdx=0}={}){const s=(j?.settlements||[]).find(x=>{const m=/^([A-Z]{3}) (\d{2})$/.exec(x.month||'');if(!m||!Number.isFinite(parseFloat(String(x.settle).replace(/,/g,''))))return false;return (2000+ +m[2])*12+MON[m[1]]>=minIdx;});return s?{month:s.month,settle:parseFloat(String(s.settle).replace(/,/g,'')),final:j.reportType==='Final'}:null;}
export async function fetchCme(key,{days=5}={}){const {id}=CME[key];const dates=(await get(`https://www.cmegroup.com/CmeWS/mvc/Settlements/Futures/TradeDate/${id}`)).filter(d=>d[1]==='Final').slice(0,days).map(d=>d[0]);const out=[];
 for(const d of dates){const s=parseCmeSettlements(await get(`https://www.cmegroup.com/CmeWS/mvc/Settlements/Futures/Settlements/${id}/FUT?strategy=DEFAULT&tradeDate=${d}&pageSize=10`),{minIdx:key==='jkm_futures'?jkmMinMonthIdx(iso(d)):0});if(s?.final)out.push({id:key,date:iso(d),value:s.settle,source:cmeSource(key),url:`https://www.cmegroup.com/search.html?q=${CME[key].name}`,contract:s.month});}
 if(!out.length)throw Error('CME 정산가 없음 '+key);return out;}
export const ECOS={kr3y:{stat:'817Y002',item:'010200000',src:'한국은행 ECOS · 국고채 3년(금투협 최종호가)'},credit:{stat:'817Y002',item:'010300000',src:'한국은행 ECOS · 회사채 AA− 3년(금투협 최종호가)'},usdkrw:{stat:'731Y001',item:'0000001',src:'한국은행 ECOS · 원/달러 매매기준율(서울)'}};
const ymd=d=>d.toISOString().slice(0,10).replace(/-/g,'');
export async function fetchEcos(key,from,to,apiKey=process.env.ECOS_API_KEY||'sample'){const {stat,item,src}=ECOS[key];const n=apiKey==='sample'?10:10000;
 const j=await get(`https://ecos.bok.or.kr/api/StatisticSearch/${apiKey}/json/kr/1/${n}/${stat}/D/${from}/${to}/${item}`,30000);if(j?.RESULT&&j.RESULT.CODE!=='INFO-200')throw Error('ECOS '+j.RESULT.MESSAGE);
 return (j?.StatisticSearch?.row||[]).map(r=>({id:key,date:`${r.TIME.slice(0,4)}-${r.TIME.slice(4,6)}-${r.TIME.slice(6,8)}`,value:+r.DATA_VALUE,source:src,url:'https://ecos.bok.or.kr/'})).filter(r=>Number.isFinite(r.value));}
// 최근 구간(sample 키는 10행 제한이라 14일 창으로 나눠 조회)
export async function fetchEcosRecent(key,days=28){const out=[];const end=new Date();for(let s=new Date(end-days*864e5);s<end;s=new Date(+s+14*864e5)){const e=new Date(Math.min(+s+13*864e5,+end));out.push(...await fetchEcos(key,ymd(s),ymd(e)));}if(!out.length)throw Error('ECOS 관측 없음 '+key);return out;}
