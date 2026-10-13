// Yahoo 일봉에서 '확정된' 거래일 막대만 꺼낸다 (2026-10-13).
// Yahoo는 진행 중인 세션을 마지막 막대(timestamp = regularMarketTime)로 붙여 주는데, 선물은 전일 18:00 ET에 다음 거래일 세션이 열리므로
// 이 막대를 그대로 쓰면 장중가가 '오늘' 또는 '일요일' 날짜로 저장된다. → 진행 중 막대와 주말 날짜를 버린다.
// 날짜 = 거래소 현지 날짜(gmtoffset 반영). 확정 일봉은 현지 자정 또는 장 시작 시각에 찍혀 같은 날짜가 된다.
export function settledBars(j,{now=Date.now()}={}){const r=j?.chart?.result?.[0];if(!r||!Array.isArray(r.timestamp))throw Error('Yahoo 차트 형식 변경');
 const m=r.meta||{},off=m.gmtoffset??0,close=r.indicators?.quote?.[0]?.close||[],adj=r.indicators?.adjclose?.[0]?.adjclose,end=m.currentTradingPeriod?.regular?.end,n=r.timestamp.length;const by=new Map();
 for(let i=0;i<n;i++){const t=r.timestamp[i],v=close[i];if(v==null||!Number.isFinite(v)||v<=0)continue;
  if(i===n-1&&m.regularMarketTime&&t===m.regularMarketTime&&!(end&&now/1000>=end))continue;// 진행 중 세션
  const date=new Date((t+off)*1000).toISOString().slice(0,10),wd=new Date(date+'T00:00:00Z').getUTCDay();if(wd===0||wd===6)continue;
  by.set(date,{date,close:v,adj:adj?.[i]??null,t});}
 return [...by.values()];}
