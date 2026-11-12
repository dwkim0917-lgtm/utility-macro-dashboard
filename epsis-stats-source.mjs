// 2026-11-12 전력통계월보(한전, 2025-04호 제558호 이후 미발간) 표를 이어 받는 KPX EPSIS 월·연간 통계
//  ① 전원별 전력거래량(월, 전력시장+PPA) → 발전 믹스·비중   [월보 7·12~16 대응]
//  ② 태양광 발전량 추계(월): 전력시장 / 한전PPA / 자가용(추계)  [월보 16-1 대응, KPX 공표]
//  ③ 한전 계약종별 판매량·판매단가(연)                         [월보 18·19 대응]
const PTD_URL='https://epsis.kpx.or.kr/epsisnew/selectEkmaPtdBftChart.do?menuId=040501';
const EST_URL='https://epsis.kpx.or.kr/epsisnew/selectEkgeEpsEstGrid.do?menuId=030400';
const SALE_URL='https://epsis.kpx.or.kr/epsisnew/selectEksaAscAscChart.do?menuId=060401';
const PRICE_URL='https://epsis.kpx.or.kr/epsisnew/selectEksaScfChart.do?menuId=060600';
const r1=x=>Math.round(x*10)/10,r2=x=>Math.round(x*100)/100;
// ① 전력거래량 '소계'(전국) 행: c1 원자력, c23 석탄계, c4 유류, c5 LNG, c6 양수, c91 연료전지, c93 태양, c94 풍력, c97 바이오, c912 신재생계, c7 기타, c8 전력시장계, c9 PPA계, c10 전력시장+PPA (GWh)
export const MIX_COLS=[['gen_coal','c23','석탄'],['gen_lng','c5','LNG'],['gen_renew','c912','신재생'],['gen_solar','c93','태양광(전력시장)'],['gen_wind','c94','풍력'],['gen_fcell','c91','연료전지'],['gen_bio','c97','바이오'],['gen_mkt','c8','전력시장 계'],['gen_ppa','c9','PPA 계'],['gen_total','c10','전력시장+PPA']];
export function parseEpsisMix(js){const parts=js.split('gridData.push');const cur={};const by=new Map();
 for(const p of parts.slice(0,-1)){for(const [,k,v] of p.matchAll(/(c\d+)\s*=\s*textFormmat\("([^"]*)"/g))cur[k]=v;const ln=[...p.matchAll(/localnm\s*=\s*"([^"]*)"/g)].at(-1);if(ln)cur.loc=ln[1];const yr=[...p.matchAll(/year = "(\d{4})\/(\d{2})"/g)].at(-1);if(yr)cur.per=`${yr[1]}-${yr[2]}`;
  if(cur.loc==='소계'&&cur.per)by.set(cur.per,{...cur});}
 if(by.size<100)throw Error('EPSIS 전력거래량 소계 행 부족: '+by.size);
 const out=[],src='KPX EPSIS · 연료원별 전력거래량(전국 소계)';
 for(const [m,c] of by){const num=k=>{const v=Number(c[k]);return c[k]!==''&&c[k]!=null&&Number.isFinite(v)?v:null;};const date=m+'-01';
  for(const [id,k] of MIX_COLS){const v=num(k);if(v!=null&&v>=0)out.push({id,date,value:r1(v),source:src,url:PTD_URL});}
  const tot=num('c8');/* 비중 분모 = 전력시장 거래량(PPA는 1개월 늦게 공표돼 최신 월 분모가 바뀌는 것을 피함) */if(tot>0)for(const [id,k] of [['sh_nuc','c1'],['sh_coal','c23'],['sh_lng','c5'],['sh_renew','c912']]){const v=num(k);if(v!=null)out.push({id,date,value:r2(v/tot*100),source:'자체 산출 · EPSIS 연료원별 거래량 ÷ 전력시장 거래량',url:PTD_URL});}}
 return out;}
// ② 태양광 발전량 추계: period = "YYYY.MM"; c1 전력시장 참여(실적), c2 한전PPA(실적), c3 자가용(추계) — MWh
export function parseEpsisSolarEst(html){const by=new Map();
 for(const m of html.matchAll(/period = "(\d{4})\.(\d{2})";[\s\S]{0,200}?c1 = "([\d.]*)";\s*c2 = "([\d.]*)";\s*c3 = "([\d.]*)";/g))by.set(`${m[1]}-${m[2]}`,[m[3],m[4],m[5]].map(Number));
 if(by.size<24)throw Error('EPSIS 태양광 추계 월 부족: '+by.size);
 const out=[],src='KPX EPSIS · 태양광 발전량 추계정보';
 for(const [m,[a,b,s]] of [...by].sort()){const date=m+'-01';const row=(id,v,sr=src)=>{if(Number.isFinite(v)&&v>0)out.push({id,date,value:r1(v/1000),source:sr,url:EST_URL});};
  row('solar_mkt',a);row('solar_ppa',b);row('solar_self',s);if(a>0&&b>0&&s>0)row('solar_total',a+b+s,'자체 산출 · EPSIS 태양광 추계 3개 합');}
 return out;}
// ③ 연간 계약종별: c1 주택용, c2 일반용, c3 교육용, c4 산업용, c5 농사용, c6 가로등, c7 심야, c8 합계
export function parseEpsisAnnualContract(html,ids,scale,src,url){const out=[];const seen=new Set();
 const re=/((?:\s*c\d+\s*=\s*textFormmat\("[^"]*",count\);)+)\s*gridData\.push\(\{"year":"(\d{4})"/g;
 for(const m of html.matchAll(re)){const y=m[2];if(seen.has(y))continue;seen.add(y);const c=Object.fromEntries([...m[1].matchAll(/(c\d+)\s*=\s*textFormmat\("([^"]*)"/g)].map(x=>[x[1],x[2]]));
  for(const [id,k] of ids){const v=Number(c[k]);if(c[k]!==''&&Number.isFinite(v)&&v>0)out.push({id,date:y+'-01-01',value:r2(v*scale),source:src,url});}}
 if(seen.size<20)throw Error('EPSIS 연간 계약종별 행 부족: '+seen.size);return out;}
const UA={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'};
async function text(url,ms=60000){const r=await fetch(url,{headers:UA,signal:AbortSignal.timeout(ms)});if(!r.ok)throw Error('EPSIS HTTP '+r.status);return r.text();}
export async function fetchSolarEst(){return parseEpsisSolarEst(await text(EST_URL));}
export async function fetchKepcoAnnual(){
 const ids=(k,t)=>[['kp_'+k+'_res','c1'],['kp_'+k+'_com','c2'],['kp_'+k+'_ind','c4'],['kp_'+k+'_'+t,'c8']];
 return [...parseEpsisAnnualContract(await text(PRICE_URL),ids('price','avg'),1,'KPX EPSIS · 한전 계약종별 판매단가(연)',PRICE_URL),
  ...parseEpsisAnnualContract(await text(SALE_URL),ids('sales','tot'),1e-6,'KPX EPSIS · 한전 계약종별 판매전력량(연, MWh→TWh)',SALE_URL)];}
