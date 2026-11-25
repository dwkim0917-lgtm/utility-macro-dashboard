// 2026-11-26 InfoLink 태양광 밸류체인 주간 스팟가(매주 수요일 발표, 직전 목~수 체결 기준)
// 공개 페이지에 표와 최근 3개월 추이(JSON)가 함께 실려 있어 매 수집 시 3개월치를 다시 받아 덮어쓴다(가격 정정 반영).
export const IL_URL='https://www.infolink-group.com/spot-price/en/';
// id, InfoLink 원문 항목명(정확히 일치), 한글명, 단위, 통화
export const IL_ITEMS=[
 ['il_poly_usd','Polysilicon Price - Mono-grade polysilicon (USD)','폴리실리콘 · 모노급 비중국산','USD/kg','USD'],
 ['il_poly_rmb','Polysilicon Price - Mono-grade polysilicon (RMB)','폴리실리콘 · 모노급(중국)','RMB/kg','RMB'],
 ['il_poly_gran_rmb','Polysilicon Price - Granular polysilicon (RMB)','폴리실리콘 · 그래뉼러(중국)','RMB/kg','RMB'],
 ['il_wafer182_usd','Mono N Type Wafer - 182-183.75mm / 130µm (USD)','웨이퍼 · N형 182-183.75mm','USD/pc','USD'],
 ['il_wafer182_rmb','Mono N Type Wafer - 182-183.75mm / 130µm (RMB)','웨이퍼 · N형 182-183.75mm(중국)','RMB/pc','RMB'],
 ['il_wafer210r_rmb','Mono N Type Wafer - 182*210mm / 130µm (RMB)','웨이퍼 · N형 182*210mm(중국)','RMB/pc','RMB'],
 ['il_wafer210_rmb','Mono N Type Wafer - 210mm / 130µm (RMB)','웨이퍼 · N형 210mm(중국)','RMB/pc','RMB'],
 ['il_cell182_exp_usd','TOPCon Cell - China export - 182-183.75mm / 25.4%+ (USD)','셀 · TOPCon 182-183.75mm 중국 수출','USD/W','USD'],
 ['il_cell182_rmb','TOPCon Cell - 182-183.75mm / 25.4%+ (RMB)','셀 · TOPCon 182-183.75mm(중국)','RMB/W','RMB'],
 ['il_cell210r_rmb','TOPCon Cell - 182*210mm / 25.4%+ (RMB)','셀 · TOPCon 182*210mm(중국)','RMB/W','RMB'],
 ['il_cell210_rmb','TOPCon Cell - 210mm / 25.4%+ (RMB)','셀 · TOPCon 210mm(중국)','RMB/W','RMB'],
 ['il_mod_topcon_usd','182*182-210mm/210mm Mono TOPCon Module (USD)','모듈 · TOPCon 182*182-210mm/210mm(비중국 시장)','USD/W','USD'],
 ['il_mod_topcon_rmb','182*182-210mm/210mm Mono TOPCon Module (RMB)','모듈 · TOPCon(중국 내수)','RMB/W','RMB'],
 ['il_mod_bc_rmb','182*182-210mm BC Module (RMB)','모듈 · BC 182*182-210mm(중국 내수)','RMB/W','RMB'],
 ['il_mod_hjt_usd','210mm Mono HJT Module (USD)','모듈 · HJT 210mm(비중국 시장)','USD/W','USD'],
 ['il_mod_hjt_rmb','210mm Mono HJT Module (RMB)','모듈 · HJT 210mm(중국 내수)','RMB/W','RMB'],
 ['il_mod_us_sea','TOPCon Module - US projects - SEA made (USD, FOB)','모듈 · TOPCon 미국向 동남아산(FOB)','USD/W','USD'],
 ['il_mod_us_ddp','TOPCon Module - US assembled (USD, DDP)','모듈 · TOPCon 미국 조립(DDP)','USD/W','USD'],
 ['il_mod_eu_fob','TOPCon Module - Europe projects - China made (USD, FOB)','모듈 · TOPCon 유럽向 중국산(FOB)','USD/W','USD'],
 ['il_mod_in_fob','TOPCon Module - India assembled (USD, FOB)','모듈 · TOPCon 인도 조립(FOB)','USD/W','USD'],
];
const RANGE={'USD/kg':[1,200],'RMB/kg':[5,500],'USD/pc':[0.02,3],'RMB/pc':[0.1,20],'USD/W':[0.01,2],'RMB/W':[0.05,10]};
const dec=s=>s.replace(/&amp;/g,'&').replace(/&#x20;/g,' ').replace(/\\\//g,'/');
export function parseInfolink(html){const byTitle=new Map();
 for(const m of html.matchAll(/<script type="application\/json" id="trend-\d+">([\s\S]*?)<\/script>/g)){let j;try{j=JSON.parse(m[1]);}catch{continue;}for(const it of j.items||[])if(it.points)byTitle.set(dec(it.title).trim(),it.points);}
 const out=[],missing=[];
 for(const [id,title,,unit] of IL_ITEMS){const pts=byTitle.get(title);if(!pts){missing.push(title);continue;}const [lo,hi]=RANGE[unit];
  for(const p of pts){const [date,,,avg]=p;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(avg))continue;if(avg<lo||avg>hi)throw Error(`InfoLink 값 범위 이상 ${id} ${date} ${avg}`);out.push({id,date,value:avg,source:'InfoLink 주간 스팟가(평균가)',url:IL_URL});}}
 // 핵심 항목이 절반 넘게 사라지면 페이지 형식 변경으로 보고 실패 처리(기존 데이터 보존)
 if(missing.length>IL_ITEMS.length/2||!out.length)throw Error('InfoLink 표 형식 변경: '+missing.slice(0,3).join(' / '));
 return out;}
export async function fetchInfolink(ua='Mozilla/5.0'){const r=await fetch(IL_URL,{headers:{'User-Agent':ua,'Accept-Language':'en'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('InfoLink HTTP '+r.status);return parseInfolink(await r.text());}
// 화면 표: 항목별 최신가, 전주 대비, 4주·13주 전 대비, RMB는 발표일 USD/CNY로 ≈USD 환산
export function infolinkSummary(series,fx){const fxr=[...(fx||[])].filter(r=>r.value>5&&r.value<10).sort((a,b)=>a.date<b.date?-1:1);
 const fxOn=d=>{let v=null,dd=null;for(const r of fxr){if(r.date<=d){v=r.value;dd=r.date;}else break;}return v?{value:v,date:dd}:null;};
 let asOf=null;const rows=IL_ITEMS.map(([id,title,name,unit,cur])=>{const a=[...(series[id]||[])].sort((x,y)=>x.date<y.date?-1:1);const L=a.at(-1);if(!L)return {id,name,unit,cur,missing:true};if(!asOf||L.date>asOf)asOf=L.date;
  const back=k=>a.length>k?a[a.length-1-k].value:null;const ch=k=>{const b=back(k);return b?(L.value/b-1)*100:null;};const f=cur==='RMB'?fxOn(L.date):null;
  return {id,title,name,unit,cur,date:L.date,value:L.value,prev:back(1),wow:ch(1),m1:ch(4),m3:ch(12),usd:cur==='RMB'&&f?L.value/f.value:L.value,fx:f};});
 return {asOf,fx:asOf?fxOn(asOf):null,rows};}
