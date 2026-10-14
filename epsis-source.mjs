export function parseEpsisSmp(html){if(!html.includes('dataField="c1" headerText="육지"'))throw Error('EPSIS 육지 열 확인 실패');const out=[];const re=/c1\s*=\s*"([\d.]+)";\s*c2\s*=\s*"([\d.]+)";\s*c3\s*=\s*"([\d.]+)";\s*c4\s*=\s*"([\d.]+)";[\s\S]*?if\("(\d{2})" == "13"\)[\s\S]*?gridData\.push\(\{"year":"(\d{4})"/g;for(const m of html.matchAll(re)){if(Number(m[5])<1||Number(m[5])>12||Number(m[6])<2010)continue;out.push({id:'smp',date:m[6]+'-'+m[5]+'-01',value:Number(m[2]),source:'KPX · 육지 월평균',url:'https://epsis.kpx.or.kr/epsisnew/selectEkmaSmpSmpChart.do?menuId=040201'});}if(out.length<12)throw Error('EPSIS SMP 데이터 형식 변경');return out;}
// EPSIS 연료비용(2026-10-13): 연료원별 연료비단가(원/kWh)·LNG 열량단가(원/Gcal) 월별, 2001년~.
const FUC_URL='https://epsis.kpx.or.kr/epsisnew/selectEkmaFucUpfChart.do?menuId=040100';
export function parseEpsisFuel(html){if(!html.includes('headerText="연료비단가"'))throw Error('EPSIS 연료비단가 열 확인 실패');const out=[];
 const re=/c1\s*=\s*"([^"]*)";[\s\S]*?c10\s*=\s*"([^"]*)";[\s\S]*?c11\s*=\s*"([^"]*)";\s*c12\s*=\s*"([^"]*)";\s*c13\s*=\s*"([^"]*)";\s*c14\s*=\s*"([^"]*)";\s*c15\s*=\s*"([^"]*)";[\s\S]*?if\("(\d{2})" == "13"\)[\s\S]*?gridData\.push\(\{"year":"(\d{4})"/g;
 for(const m of html.matchAll(re)){const mon=Number(m[8]),yr=m[9];if(mon<1||mon>12)continue;const date=`${yr}-${m[8]}-01`;
  for(const [id,v,label] of [['fuel_nuc',m[3],'원자력'],['fuel_coal',m[4],'유연탄'],['fuel_lng',m[7],'LNG']]){const x=Number(v);if(v!==''&&Number.isFinite(x)&&x>0)out.push({id,date,value:Math.round(x*100)/100,source:'KPX EPSIS · 연료원별 연료비단가',url:FUC_URL});}
  const h=Number(m[2]);if(m[2]!==''&&Number.isFinite(h)&&h>0)out.push({id:'lng_heat',date,value:Math.round(h*10)/10,source:'KPX EPSIS · LNG 열량단가',url:FUC_URL});}
 if(out.filter(r=>r.id==='fuel_lng').length<24)throw Error('EPSIS 연료비단가 형식 변경');return out;}
// EPSIS 정산단가(연료원별, 원/kWh) 월별, 2002년~. chartData Value 순서: 원자력/유연탄/무연탄/유류/LNG/양수/신재생/기타.
const UPS_URL='https://epsis.kpx.or.kr/epsisnew/selectEkmaUpsBftChart.do?menuId=040701';
export function parseEpsisSettle(html){if(!html.includes('원자력/유연탄/무연탄/유류/LNG/양수/신재생/기타'))throw Error('EPSIS 정산단가 범례 변경');const out=[];
 const re=/chartData\.push\(\{"Date":"(\d{4})\/(\d{2})\/01",\s*"Value":Number\("([^"]*)"\),\s*"Value2":Number\("([^"]*)"\),\s*"Value3":Number\("([^"]*)"\),\s*"Value4":Number\("([^"]*)"\),\s*"Value5":Number\("([^"]*)"\)/g;
 const seen=new Set();for(const m of html.matchAll(re)){const date=`${m[1]}-${m[2]}-01`;if(seen.has(date))continue;seen.add(date);
  for(const [id,v] of [['settle_nuc',m[3]],['settle_coal',m[4]],['settle_lng',m[7]]]){const x=Number(v);if(v!==''&&Number.isFinite(x)&&x>0)out.push({id,date,value:Math.round(x*100)/100,source:'KPX EPSIS · 연료원별 정산단가',url:UPS_URL});}}
 if(out.filter(r=>r.id==='settle_lng').length<24)throw Error('EPSIS 정산단가 형식 변경');return out;}
// EPSIS 연료원별 SMP 결정(2026-10-14): 월별로 각 연료원이 SMP를 결정한 시간 수 → 비율(%). LNG가 한계발전기인 시간 비중.
const NSM_URL='https://epsis.kpx.or.kr/epsisnew/selectEkmaSmpNsmChart.do?menuId=040203';
export function parseEpsisSmpSetter(html){if(!html.includes('dataField="c1" headerText="LNG"'))throw Error('EPSIS SMP 결정 열 확인 실패');const out=[];
 const re=/c1\s*=\s*"([^"]*)";\s*c2\s*=\s*"([^"]*)";\s*c3\s*=\s*"([^"]*)";\s*c4\s*=\s*"([^"]*)";\s*c5\s*=\s*"([^"]*)";\s*c6\s*=\s*"([^"]*)";\s*c7\s*=\s*"([^"]*)";[\s\S]*?if\("(\d{2})" == "13"\)[\s\S]*?gridData\.push\(\{"year":"(\d{4})"/g;
 for(const m of html.matchAll(re)){const mon=Number(m[8]);if(mon<1||mon>12)continue;const tot=Number(m[7]);if(!(tot>0))continue;const date=`${m[9]}-${m[8]}-01`;
  out.push({id:'smp_set_lng',date,value:Math.round(Number(m[1])/tot*1000)/10,source:'KPX EPSIS · 연료원별 SMP 결정 시간 비율',url:NSM_URL});
  out.push({id:'smp_set_coal',date,value:Math.round((Number(m[4])+Number(m[3]))/tot*1000)/10,source:'KPX EPSIS · 연료원별 SMP 결정 시간 비율',url:NSM_URL});}
 if(out.length<48)throw Error('EPSIS SMP 결정 형식 변경');return out;}
