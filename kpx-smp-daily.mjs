// KPX 육지 SMP 일간 가중평균. 페이지는 기준일 포함 7일 표를 주며 날짜 지정은 CSRF 세션 POST로 한다.
const URL_SMP='https://new.kpx.or.kr/smpInland.es';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const strip=s=>s.replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').trim();
export function parseKpxSmpWeek(html,issueDate){
 const rows=[...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m=>[...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c=>strip(c[1])));
 const head=rows.find(r=>r[0]==='구분'&&r.slice(1).every(c=>/^\d{2}\.\d{2}\(/.test(c)));const avg=rows.find(r=>r[0]==='가중평균');
 if(!head||!avg||avg.length!==head.length)throw Error('KPX SMP 표 형식 변경');
 const iy=Number(issueDate.slice(0,4)),im=Number(issueDate.slice(5,7)),out=[];
 head.slice(1).forEach((h,i)=>{const [mm,dd]=h.slice(0,5).split('.').map(Number);const y=mm>im?iy-1:iy;const v=Number(avg[i+1].replace(/,/g,''));if(!Number.isFinite(v)||v<=0)return;if(v>1000)throw Error('KPX SMP 값 범위 이상: '+v);out.push({id:'smp_daily',date:`${y}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`,value:v,source:'KPX · 육지 SMP 일간 가중평균',url:'https://new.kpx.or.kr/smpInland.es?mid=a10606080100'});});
 if(!out.length)throw Error('KPX SMP 가중평균 없음');return out;}
export async function kpxSession(){const r=await fetch(URL_SMP+'?mid=a10606080100&device=pc',{signal:AbortSignal.timeout(30000),headers:{'User-Agent':UA}});if(!r.ok)throw Error('KPX HTTP '+r.status);const html=await r.text();const csrf=(html.match(/name="_csrf" value="([^"]+)"/)||[])[1];const cookie=(r.headers.getSetCookie?.()||[]).map(c=>c.split(';')[0]).join('; ');if(!csrf)throw Error('KPX CSRF 없음');return {csrf,cookie,html};}
export async function fetchKpxSmpWeek(session,issueDate){const body=new URLSearchParams({mid:'a10606080100',device:'pc',issue_date:issueDate,_csrf:session.csrf});const r=await fetch(URL_SMP,{method:'POST',body,signal:AbortSignal.timeout(30000),headers:{'User-Agent':UA,'Content-Type':'application/x-www-form-urlencoded',Cookie:session.cookie,Referer:URL_SMP+'?mid=a10606080100'}});if(!r.ok)throw Error('KPX HTTP '+r.status);return parseKpxSmpWeek(await r.text(),issueDate);}
const kst=(d=new Date())=>new Date(d.getTime()+9*3600e3).toISOString().slice(0,10);
// 일간 잡: 이번 주 + 지난주(누락 보정)
export async function fetchSmpDaily(){const s=await kpxSession();const t=kst();const rows=parseKpxSmpWeek(s.html,t);const prev=kst(new Date(Date.now()-7*864e5));try{rows.push(...await fetchKpxSmpWeek(s,prev));}catch{}const seen=new Set();return rows.filter(r=>!seen.has(r.date)&&seen.add(r.date));}
// 일간 SMP → 월별 단순평균(당월은 누적). 공식 월평균(smp)과 교차 확인용 파생 계열.
export function deriveSmpMonthly(db){const s=(db.series.smp_daily||[]).filter(r=>r.source==='KPX · 육지 SMP 일간 가중평균');const by=new Map();for(const r of s){const k=r.date.slice(0,7);const a=by.get(k)||[];a.push(r.value);by.set(k,a);}
 return [...by].filter(([,a])=>a.length>=5).map(([k,a])=>({id:'smp_mtd',date:k+'-01',value:Math.round(a.reduce((x,y)=>x+y,0)/a.length*100)/100,source:'자체 산출 · KPX 일간 SMP 평균(당월 누적)',url:'https://new.kpx.or.kr/smpInland.es?mid=a10606080100'}));}
