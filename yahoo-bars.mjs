// Yahoo 일봉에서 '확정된' 거래일 막대만 꺼낸다 (2026-10-13).
// Yahoo는 진행 중인 세션을 마지막 막대(timestamp = regularMarketTime)로 붙여 주는데, 선물은 전일 18:00 ET에 다음 거래일 세션이 열리므로
// 이 막대를 그대로 쓰면 장중가가 '오늘' 또는 '일요일' 날짜로 저장된다. → 진행 중 막대와 주말 날짜를 버린다.
// 날짜 = 거래소 현지 날짜(gmtoffset 반영). 확정 일봉은 현지 자정 또는 장 시작 시각에 찍혀 같은 날짜가 된다.
export function settledBars(j,{now=Date.now()}={}){const r=j?.chart?.result?.[0];if(!r||!Array.isArray(r.timestamp))throw Error('Yahoo 차트 형식 변경');
 const m=r.meta||{},off=m.gmtoffset??0,close=r.indicators?.quote?.[0]?.close||[],adj=r.indicators?.adjclose?.[0]?.adjclose,start=m.currentTradingPeriod?.regular?.start,end=m.currentTradingPeriod?.regular?.end,n=r.timestamp.length;const by=new Map();
 // 2026-11-03 수정: gmtoffset은 '현재' 오프셋 하나뿐이라 서머타임 종료(11/1) 뒤 EDT·BST 기간 막대(현지 자정=04:00Z/23:00Z)가 하루 앞 날짜로 찍혔다(CL 10/30 정산가 104.12가 10/29로 저장).
 // → 거래소 시간대(exchangeTimezoneName)로 막대마다 현지 날짜를 구한다. 시간대가 없을 때만 gmtoffset.
 let fmt=null;try{if(m.exchangeTimezoneName)fmt=new Intl.DateTimeFormat('en-CA',{timeZone:m.exchangeTimezoneName,year:'numeric',month:'2-digit',day:'2-digit'});}catch{fmt=null;}
 for(let i=0;i<n;i++){const t=r.timestamp[i],v=close[i];if(v==null||!Number.isFinite(v)||v<=0)continue;
  // 진행 중 세션: 예전 형식(막대 시각=regularMarketTime) + 2026-11 형식(막대 시각=당일 거래기간 시작, 세션 종료 전) 모두 제외
  if(i===n-1&&((m.regularMarketTime&&t===m.regularMarketTime)||(start!=null&&t>=start))&&!(end&&now/1000>=end))continue;
  const date=fmt?fmt.format(new Date(t*1000)):new Date((t+off)*1000).toISOString().slice(0,10),wd=new Date(date+'T00:00:00Z').getUTCDay();if(wd===0||wd===6)continue;
  by.set(date,{date,close:v,adj:adj?.[i]??null,t});}
 return [...by.values()];}
