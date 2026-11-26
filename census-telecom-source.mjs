// 2026-11-26 미국 통신망 투자: Census ACES 표 4a(통신사 설비투자 — 유선 5171 / 무선 5172, 2020년부터 5173 통합) + FRED(Census 건설투자 '통신')
import {sheetjs} from './capacity-source.mjs';
export const ACES_URL=y=>`https://www2.census.gov/programs-surveys/aces/tables/${y}/table4a.xlsx`;
const num=v=>{const n=Number(String(v??'').replace(/,/g,'').trim());return Number.isFinite(n)&&String(v).trim()!==''?n:null;};
// 열: NAICS | 업종 | 총투자 | 신규 총투자 | 구조물(총·신규·중고) | 장비(총·신규·중고), 단위 백만달러
export function parseAcesRows(rows,year){const pick=code=>rows.find(r=>String(r[0]??'').trim()===code);const w=pick('5171'),wl=pick('5172'),c=pick('5173');
 const out=[];const d=`${year}-12-31`;const src=`Census ACES ${year} 표 4a(고용 기업, 백만달러)`;const url=ACES_URL(year);const add=(id,v)=>{if(v!=null)out.push({id,date:d,value:v,source:src,url});};
 if(w&&wl){const W=num(w[2]),L=num(wl[2]);if(!(W>1000&&L>1000))throw Error('ACES 유선·무선 값 이상 '+year);add('aces_wired_capex',W);add('aces_wireless_capex',L);add('aces_tel_capex',W+L);add('aces_wired_share',Math.round(W/(W+L)*1000)/10);
  const ws=num(w[4]),ls=num(wl[4]),we=num(w[7]),le=num(wl[7]);if(ws!=null&&ls!=null)add('aces_tel_struct',ws+ls);if(we!=null&&le!=null)add('aces_tel_equip',we+le);add('aces_wired_struct',ws);add('aces_wireless_struct',ls);}
 else if(c){const T=num(c[2]);if(!(T>1000))throw Error('ACES 5173 값 이상 '+year);add('aces_tel_capex',T);add('aces_tel_struct',num(c[4]));add('aces_tel_equip',num(c[7]));}
 else throw Error('ACES 통신 행 없음 '+year);
 return out;}
export function readAcesXlsx(buf,year){const X=sheetjs();const wb=X.read(buf,{type:'buffer'});return parseAcesRows(X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:null}),year);}
export async function fetchAces(ua='Mozilla/5.0',from=2010){const now=new Date().getUTCFullYear();const out=[];let miss=0;
 for(let y=from;y<=now-1;y++){const r=await fetch(ACES_URL(y),{headers:{'User-Agent':ua},signal:AbortSignal.timeout(60000)});if(r.status===404){miss++;continue;}if(!r.ok)throw Error('Census HTTP '+r.status+' '+y);
  const b=Buffer.from(await r.arrayBuffer());if(!(b[0]===0x50&&b[1]===0x4b))throw Error('ACES xlsx 아님 '+y);out.push(...readAcesXlsx(b,y));await new Promise(s=>setTimeout(s,300));}
 if(out.length<20)throw Error('ACES 수집 부족');return out;}
