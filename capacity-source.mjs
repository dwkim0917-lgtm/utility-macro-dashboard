// 2026-11-03 KPX EPSIS 연료원별 설비용량(월) → 신재생 월별 신규 설치량(순증)
// 원천: 발전설비 > 연료원별(menuId=020100) 그리드 ajax. 2018-01부터 월별, 단위 MW, 지역·회원·급전·사업 '합계'.
// EPSIS는 공표 전 달을 직전 값으로 채워 둔다(예: 2026-11-03 조회 시 9~11월이 8월과 동일) → 모든 열이 직전 달과 같은 꼬리 구간은 미공표로 보고 제외.
// 2026-11-18 KPX 정보공개 > 전력시장 정보 > 설비용량 게시판의 월간 「신재생에너지 설비용량」(PDF·XLSX, 익월 말 이전 게시)을 덧씌움.
//   '26년 1월부터 EPSIS 설비용량 기준으로 작성(같은 기준)이지만 EPSIS보다 1~2개월 빠름. 같은 달은 KPX 게시값 우선.
//   신재생 합계는 KPX 정의(연료전지·IGCC·태양·풍력·수력·해양·바이오, 폐기물·급전가능재생 제외)로 통일.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
export const CAP_URL='https://epsis.kpx.or.kr/epsisnew/selectEkpoBftChart.do?menuId=020100';
export const KPX_RE_URL='https://new.kpx.or.kr/menu.es?mid=a10109010700';
const AJAX='https://epsis.kpx.or.kr/epsisnew/selectEkpoBft.ajax';
const SRC='KPX EPSIS · 연료원별 설비용량(월)',KSRC='KPX · 신재생에너지 설비용량(월간 공표, 정보공개 게시판)',DSRC='자체 산출 · 설비용량(EPSIS·KPX 월간 공표) 전월 대비 순증';
// 그리드 열: c1 원자력, c2 유연탄, c3 무연탄, c4 유류, c5 LNG, c6 양수, c91 연료전지, c92 석탄가스화, c93 태양, c94 풍력, c95 수력, c96 해양, c97 바이오, c98 폐기물, c7 기타, c8 합계
const COLS=['c1','c2','c3','c4','c5','c6','c7','c8','c91','c92','c93','c94','c95','c96','c97','c98'];
export const CAP_SERIES=[['cap_solar','c93','태양'],['cap_wind','c94','풍력'],['cap_fcell','c91','연료전지'],['cap_total','c8','합계'],['cap_lng','c5','LNG'],['cap_nuc','c1','원자력']];
const RENEW=['c91','c92','c93','c94','c95','c96','c97'];// 신재생 합계(KPX 정의): 연료전지·IGCC(석탄가스화)·태양·풍력·수력·해양·바이오 — 폐기물 제외
const r3=x=>Math.round(x*10)/10;
function monthsBetween(a,b){const [y1,m1]=a.split('-').map(Number),[y2,m2]=b.split('-').map(Number);return (y2-y1)*12+(m2-m1);}
// EPSIS 응답 → 공표된 월 {date,v} 목록(미공표 꼬리 제외)
export function parseEpsisMonths(js){
 if(!js.includes('gridData.push'))throw Error('EPSIS 설비용량 응답에 데이터 없음');
 const rows=[];
 const re=/((?:\s*c\d+\s*=\s*textFormmat\("[^"]*",count\);)+)\s*nmArea="([^"]*)";[\s\S]*?year = "(\d{4})\/(\d{2})";/g;
 for(const m of js.matchAll(re)){if(m[2]!=='합계')continue;const v={};for(const x of m[1].matchAll(/(c\d+)\s*=\s*textFormmat\("([^"]*)"/g))v[x[1]]=Number(x[2]);
  if(!COLS.every(k=>Number.isFinite(v[k])))throw Error('EPSIS 설비용량 열 변경: '+m[3]+'/'+m[4]);rows.push({date:`${m[3]}-${m[4]}-01`,v});}
 if(rows.length<60)throw Error('EPSIS 설비용량 월 데이터 부족('+rows.length+')');
 rows.sort((a,b)=>a.date<b.date?-1:1);
 const monthly=rows.filter((r,i)=>i>0&&monthsBetween(rows[i-1].date,r.date)===1||rows[i+1]&&monthsBetween(r.date,rows[i+1].date)===1);
 let end=monthly.length;while(end>1&&COLS.every(k=>Math.abs(monthly[end-1].v[k]-monthly[end-2].v[k])<1e-6))end--;
 return {pub:monthly.slice(0,end),dropped:monthly.slice(end).map(r=>r.date)};}
// KPX 월간 XLSX(SheetJS 행 배열) → Map('YYYY-MM-01' → {c91..c97})
export function parseKpxRenewRows(rows){
 const hi=rows.findIndex(r=>r&&String(r[0]??'').replace(/\s/g,'')==='년월');if(hi<0)throw Error('KPX 신재생 설비용량: 년월 머리행 없음');
 const sub=(rows[hi+1]||[]).map(x=>String(x??'').replace(/\s/g,''));
 const col=n=>{const i=sub.indexOf(n);if(i<0)throw Error('KPX 신재생 설비용량 열 없음: '+n);return i;};
 const ix={c91:col('연료전지'),c92:col('IGCC'),c93:col('태양에너지'),c94:col('풍력'),c95:col('수력'),c96:col('해양에너지'),c97:col('바이오에너지')};
 const ti=(rows[hi]||[]).findIndex(x=>String(x??'').replace(/\s/g,'')==='합계');
 const out=new Map();
 for(const r of rows.slice(hi+2)){const k=r?.[0];let ym=null;
  if(typeof k==='number'&&k>40000&&k<60000){const d=new Date(Date.UTC(1899,11,30)+k*864e5);ym=d.toISOString().slice(0,7);}
  else if(typeof k==='string'){const m=k.match(/(20\d{2})\D{0,2}(\d{1,2})/);if(m)ym=`${m[1]}-${m[2].padStart(2,'0')}`;}
  if(!ym)continue;const v={};for(const [c,i] of Object.entries(ix)){const x=Number(r[i]);if(!Number.isFinite(x))throw Error('KPX 신재생 설비용량 값 오류 '+ym+' '+c);v[c]=x;}
  if(ti>=0&&Number.isFinite(Number(r[ti]))){const s=RENEW.reduce((a,c)=>a+v[c],0);if(Math.abs(s-Number(r[ti]))>1)throw Error('KPX 신재생 설비용량 합계 불일치 '+ym);}
  if(v.c93<10000||v.c93>200000)throw Error('KPX 태양 설비용량 범위 이상 '+ym);
  out.set(ym+'-01',v);}
 if(!out.size)throw Error('KPX 신재생 설비용량 월 행 없음');return out;}
// EPSIS 월 + KPX 덧씌움 → 출력 행
export function buildCapacity(pub,kpx=new Map(),dropped=[]){
 const by=new Map(pub.map(r=>[r.date,{v:{...r.v},src:SRC}]));
 for(const [d,v] of kpx){const cur=by.get(d);if(cur){Object.assign(cur.v,v);cur.src=KSRC;cur.kpx=true;}else by.set(d,{v:{...v},src:KSRC,kpx:true,renewOnly:true});}
 const months=[...by.keys()].sort();const out=[];
 for(const d of months){const {v,src,renewOnly}=by.get(d);v.renew=RENEW.reduce((s,c)=>s+v[c],0);
  for(const [id,c] of [['cap_solar','c93'],['cap_wind','c94'],['cap_fcell','c91'],['cap_renew','renew']])out.push({id,date:d,value:r3(v[c]),source:src,url:src===KSRC?KPX_RE_URL:CAP_URL});
  if(!renewOnly){v.coal=v.c2+v.c3;for(const [id,c] of [['cap_total','c8'],['cap_lng','c5'],['cap_nuc','c1'],['cap_coal','coal']])out.push({id,date:d,value:r3(v[c]),source:SRC,url:CAP_URL});}}
 for(let i=1;i<months.length;i++){const a=by.get(months[i-1]).v,b=by.get(months[i]).v;if(monthsBetween(months[i-1],months[i])!==1)continue;
  for(const [id,c] of [['add_solar','c93'],['add_wind','c94'],['add_fcell','c91'],['add_renew','renew']])out.push({id,date:months[i],value:r3(b[c]-a[c]),source:DSRC,url:by.get(months[i]).kpx?KPX_RE_URL:CAP_URL});}
 const add=out.filter(r=>r.id==='add_solar');for(let i=11;i<add.length;i++){const w=add.slice(i-11,i+1);if(monthsBetween(w[0].date,w[11].date)!==11)continue;out.push({id:'add_solar_12m',date:add[i].date,value:r3(w.reduce((s,r)=>s+r.value,0)),source:DSRC,url:CAP_URL});}
 return Object.assign(out,{latest:months.at(-1),epsisLatest:pub.at(-1)?.date,kpxMonths:[...kpx.keys()].sort(),dropped});}
// 기존 호환: EPSIS 응답만으로
export function parseEpsisCapacity(js,kpx){const {pub,dropped}=parseEpsisMonths(js);return buildCapacity(pub,kpx||new Map(),dropped);}
let XLSXlib=null;
function sheetjs(){if(XLSXlib)return XLSXlib;const p=path.join(path.dirname(fileURLToPath(import.meta.url)),'dist','xlsx.min.js');const ctx={};ctx.self=ctx;ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(p,'utf8'),ctx);return XLSXlib=ctx.XLSX;}
export function readKpxXlsx(buf){const X=sheetjs();const wb=X.read(buf,{type:'buffer'});return parseKpxRenewRows(X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:null}));}
// KPX 게시판 최근 n개 게시물의 XLSX → 월별 Map(최신 게시물 우선)
export async function fetchKpxRenew(ua='Mozilla/5.0',n=3){
 const get=async(u,bin)=>{const r=await fetch(u,{headers:{'User-Agent':ua},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('KPX HTTP '+r.status+' '+u);return bin?Buffer.from(await r.arrayBuffer()):r.text();};
 const list=await get(KPX_RE_URL);const ids=[...list.matchAll(/act=view&amp;list_no=(\d+)/g)].map(m=>m[1]).filter((x,i,a)=>a.indexOf(x)===i).slice(0,n);
 if(!ids.length)throw Error('KPX 신재생 설비용량 게시물 없음');const out=new Map();
 for(const id of ids.reverse()){const view=await get(`https://new.kpx.or.kr/board.es?mid=a10109010700&bid=0082&act=view&list_no=${id}`);
  const seqs=[...view.matchAll(/boardDownload\.es\?bid=0082&amp;list_no=\d+&amp;seq=(\d+)/g)].map(m=>m[1]).filter((x,i,a)=>a.indexOf(x)===i);
  for(const s of seqs){const b=await get(`https://new.kpx.or.kr/boardDownload.es?bid=0082&list_no=${id}&seq=${s}`,true);if(b[0]===0x50&&b[1]===0x4b){for(const [k,v] of readKpxXlsx(b))out.set(k,v);break;}}}
 if(!out.size)throw Error('KPX 신재생 설비용량 XLSX 없음');return out;}
export async function fetchCapacity(ua='Mozilla/5.0'){
 const r=await fetch(AJAX,{method:'POST',signal:AbortSignal.timeout(40000),headers:{'User-Agent':ua,'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','Referer':CAP_URL},body:'selYear=N&selRegion=1&selMemgubun=&selTelgramform=&selBusiType='});
 if(!r.ok)throw Error('EPSIS 설비용량 HTTP '+r.status);const {pub,dropped}=parseEpsisMonths(await r.text());
 // KPX 게시판 실패 시 작업 전체를 실패로 둬 기존 저장값(최근 월)을 유지
 const kpx=await fetchKpxRenew(ua);return buildCapacity(pub,kpx,dropped);}
