// 2026-11-03 KPX EPSIS 연료원별 설비용량(월) → 신재생 월별 신규 설치량(순증)
// 원천: 발전설비 > 연료원별(menuId=020100) 그리드 ajax. 2018-01부터 월별, 단위 MW, 지역·회원·급전·사업 '합계'.
// EPSIS는 공표 전 달을 직전 값으로 채워 둔다(예: 2026-11-03 조회 시 9~11월이 8월과 동일) → 모든 열이 직전 달과 같은 꼬리 구간은 미공표로 보고 제외.
export const CAP_URL='https://epsis.kpx.or.kr/epsisnew/selectEkpoBftChart.do?menuId=020100';
const AJAX='https://epsis.kpx.or.kr/epsisnew/selectEkpoBft.ajax';
const SRC='KPX EPSIS · 연료원별 설비용량(월)',DSRC='자체 산출 · KPX EPSIS 설비용량 전월 대비 순증';
// 그리드 열: c1 원자력, c2 유연탄, c3 무연탄, c4 유류, c5 LNG, c6 양수, c91 연료전지, c92 석탄가스화, c93 태양, c94 풍력, c95 수력, c96 해양, c97 바이오, c98 폐기물, c7 기타, c8 합계
const COLS=['c1','c2','c3','c4','c5','c6','c7','c8','c91','c92','c93','c94','c95','c96','c97','c98'];
export const CAP_SERIES=[['cap_solar','c93','태양'],['cap_wind','c94','풍력'],['cap_fcell','c91','연료전지'],['cap_total','c8','합계']];
export function parseEpsisCapacity(js){
 if(!js.includes('gridData.push'))throw Error('EPSIS 설비용량 응답에 데이터 없음');
 const rows=[];
 const re=/((?:\s*c\d+\s*=\s*textFormmat\("[^"]*",count\);)+)\s*nmArea="([^"]*)";[\s\S]*?year = "(\d{4})\/(\d{2})";/g;
 for(const m of js.matchAll(re)){if(m[2]!=='합계')continue;const v={};for(const x of m[1].matchAll(/(c\d+)\s*=\s*textFormmat\("([^"]*)"/g))v[x[1]]=Number(x[2]);
  if(!COLS.every(k=>Number.isFinite(v[k])))throw Error('EPSIS 설비용량 열 변경: '+m[3]+'/'+m[4]);rows.push({date:`${m[3]}-${m[4]}-01`,v});}
 if(rows.length<60)throw Error('EPSIS 설비용량 월 데이터 부족('+rows.length+')');
 rows.sort((a,b)=>a.date<b.date?-1:1);
 // 월별 구간만(2017 이전 연말값 제외): 연속 월이 시작되는 지점부터
 const monthly=rows.filter((r,i)=>i>0&&monthsBetween(rows[i-1].date,r.date)===1||rows[i+1]&&monthsBetween(r.date,rows[i+1].date)===1);
 // 미공표 꼬리 제거
 let end=monthly.length;while(end>1&&COLS.every(k=>Math.abs(monthly[end-1].v[k]-monthly[end-2].v[k])<1e-6))end--;
 const pub=monthly.slice(0,end),dropped=monthly.slice(end).map(r=>r.date);
 const r3=x=>Math.round(x*10)/10;const out=[];
 for(const r of pub)for(const [id,c] of CAP_SERIES)out.push({id,date:r.date,value:r3(r.v[c]),source:SRC,url:CAP_URL});
 for(let i=1;i<pub.length;i++){if(monthsBetween(pub[i-1].date,pub[i].date)!==1)continue;
  for(const [id,c] of [['add_solar','c93'],['add_wind','c94'],['add_fcell','c91']])out.push({id,date:pub[i].date,value:r3(pub[i].v[c]-pub[i-1].v[c]),source:DSRC,url:CAP_URL});}
 const add=out.filter(r=>r.id==='add_solar');for(let i=11;i<add.length;i++){const w=add.slice(i-11,i+1);if(monthsBetween(w[0].date,w[11].date)!==11)continue;out.push({id:'add_solar_12m',date:add[i].date,value:r3(w.reduce((s,r)=>s+r.value,0)),source:DSRC,url:CAP_URL});}
 return Object.assign(out,{latest:pub.at(-1)?.date,dropped});}
function monthsBetween(a,b){const [y1,m1]=a.split('-').map(Number),[y2,m2]=b.split('-').map(Number);return (y2-y1)*12+(m2-m1);}
export async function fetchCapacity(ua='Mozilla/5.0'){
 const r=await fetch(AJAX,{method:'POST',signal:AbortSignal.timeout(40000),headers:{'User-Agent':ua,'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','Referer':CAP_URL},body:'selYear=N&selRegion=1&selMemgubun=&selTelgramform=&selBusiType='});
 if(!r.ok)throw Error('EPSIS 설비용량 HTTP '+r.status);return parseEpsisCapacity(await r.text());}
