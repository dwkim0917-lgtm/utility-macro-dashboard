// 전체 데이터 신뢰성 감사 (2026-10-13). 결과: DATA_AUDIT.md + data/audit-<날짜>.json
// 점검: ① 날짜 규칙(주기·주말·미래·중복) ② 화면 표시값 = 저장 최신값(출처 우선순위 반영) ③ 숨겨진 출처 혼재 ④ 최신성
//       ⑤ 이상치(일간 변화 MAD z>8) ⑥ 2차 출처 대조(같은 날짜/같은 월) ⑦ 파생 계열 재계산 일치
import fs from 'node:fs/promises';
import {catalog} from './catalog.mjs';
import {readStore,today} from './store.mjs';
import {settledBars} from './yahoo-bars.mjs';
import {DERIVED} from './collector.mjs';
const UA={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'};
const db=await readStore(),T=today(),day=864e5,byId=Object.fromEntries(catalog.map(c=>[c.id,c]));
// 화면(app.js points)과 같은 규칙: sourceFamily가 있으면 우선순위 병합, 없으면 최신 행의 출처만
export function shown(id){const raw=db.series[id]||[],fam=byId[id]?.sourceFamily;if(fam){const by=new Map();for(const r of raw){const k=fam.indexOf(r.source);if(k<0)continue;const p=by.get(r.date);if(!p||k<fam.indexOf(p.source))by.set(r.date,r);}return [...by.values()].sort((a,b)=>a.date.localeCompare(b.date));}const l=raw.at(-1);return l?raw.filter(r=>r.source===l.source):[];}
const CAL=new Set(['smp_daily','peak','reserve','temperature','jepx','nuclear_live','nuclear_units','pjm_west','pjm_spark','cpo_mpob']);// 달력일·인도일 계열(주말 정상)
const mmean=rows=>{const m=new Map();for(const r of rows){const k=r.date.slice(0,7);const a=m.get(k)||[];a.push(r.value);m.set(k,a);}return new Map([...m].map(([k,a])=>[k,{v:a.reduce((s,x)=>s+x,0)/a.length,n:a.length}]));};
const yahoo=async sym=>{try{const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3mo&interval=1d`,{headers:UA,signal:AbortSignal.timeout(25000)});return new Map(settledBars(await r.json()).map(b=>[b.date,b.close]));}catch{return new Map();}};
const fred=async (code,from='2025-01-01')=>{try{const r=await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${code}&cosd=${from}`,{headers:UA,signal:AbortSignal.timeout(30000)});const m=new Map();for(const l of (await r.text()).trim().split('\n').slice(1)){const [d,v]=l.split(',');if(v&&v!=='.')m.set(d,Number(v));}return m;}catch{return new Map();}};
const res={};const add=(id,k,ok,text)=>{(res[id]??={checks:[]}).checks.push({k,ok,text});};
// ①~⑤
for(const c of catalog){const raw=db.series[c.id]||[],s=shown(c.id);res[c.id]??={checks:[]};const R=res[c.id];R.name=c.name;R.freq=c.frequency;R.count=s.length;R.stored=raw.length;
 if(!s.length){R.verdict='미수집';continue;}const l=s.at(-1);Object.assign(R,{first:s[0].date,last:l.date,value:l.value,source:l.source});
 const monthly=['월간','분기'].includes(c.frequency);const badDay=monthly?s.filter(r=>r.date.slice(8)!=='01'):[];if(badDay.length)add(c.id,'날짜',false,`월간인데 1일이 아닌 날짜 ${badDay.length}개`);
 if(c.frequency==='일간'&&!CAL.has(c.id)){const we=s.filter(r=>{const d=new Date(r.date+'T00:00:00Z').getUTCDay();return (d===0||d===6)&&!(c.id==='kr3y'&&r.date<'2000-06-01');});if(we.length)add(c.id,'날짜',false,`주말 날짜 ${we.length}개 (${we.slice(-2).map(r=>r.date).join(', ')})`);}
 const fut=s.filter(r=>r.date>T);if(fut.length)add(c.id,'날짜',false,`미래 날짜 ${fut.length}개`);
 const dupe=s.length-new Set(s.map(r=>r.date)).size;if(dupe)add(c.id,'날짜',false,`같은 날짜 중복 ${dupe}개`);
 if(c.frequency==='일간'&&!CAL.has(c.id)&&l.date===T)add(c.id,'날짜',false,'최신 관측일이 오늘(장중·미확정 가능)');
 const hidden=raw.length-s.length-(raw.length-new Set(raw.map(r=>r.date+'|'+r.source)).size);if(hidden>0)add(c.id,'출처',c.sourceFamily?true:null,c.sourceFamily?`출처 우선순위 병합(${c.sourceFamily[0]} 우선) · 대체 출처 행 ${hidden}개`:`표시 출처 외 행 ${hidden}개(화면 미사용)`);
 if(raw.some(r=>r.source.includes('�')))add(c.id,'출처',false,'깨진 출처 문자열');
 const age=Math.round((Date.parse(T)-Date.parse(l.date))/day);R.age=age;if(age>c.staleDays)add(c.id,'최신성',null,`최종 ${l.date} · ${age}일 경과(기준 ${c.staleDays}일)`);
 if(c.frequency==='일간'&&s.length>300&&!/spread|_hh|_fei|spark|temperature/.test(c.id)){const xs=s.slice(-760),ch=[];for(let i=1;i<xs.length;i++){const a=xs[i-1].value,b=xs[i].value;ch.push({d:xs[i].date,v:a>0&&b>0?Math.log(b/a):b-a,a,b});}const v=ch.map(x=>x.v).sort((a,b)=>a-b),med=v[v.length>>1],mad=[...v.map(x=>Math.abs(x-med))].sort((a,b)=>a-b)[v.length>>1]||1e-9;const z=x=>Math.abs(x.v-med)/(1.4826*mad);const spikes=ch.filter((x,i)=>z(x)>8&&ch[i+1]&&Math.sign(ch[i+1].v)===-Math.sign(x.v)&&Math.abs(ch[i+1].v)>=.7*Math.abs(x.v));const jumps=ch.filter(x=>z(x)>8).length-spikes.length;
 if(spikes.length)add(c.id,'이상치',null,`하루 튀고 되돌아온 값 ${spikes.length}건(최근 3년, 오입력 후보): `+spikes.slice(-3).map(x=>`${x.d} ${+x.a.toFixed(4)}→${+x.b.toFixed(4)}`).join(' · '));else if(jumps)add(c.id,'이상치',true,`큰 변동 ${jumps}건은 유지된 변화(월물 교체·시장 급변)로 되돌림 없음`);}}
// ⑥ 2차 출처 대조
const sameDay=async(id,sym,tol,label)=>{const m=await yahoo(sym),s=shown(id).filter(r=>m.has(r.date)).slice(-10);if(!s.length)return add(id,'2차대조',null,`${label}: 같은 날짜 없음`);const bad=s.filter(r=>Math.abs(r.value/m.get(r.date)-1)>tol);add(id,'2차대조',!bad.length,`${label} 최근 ${s.length}거래일 ${bad.length?'불일치 '+bad.map(r=>`${r.date} ${r.value}↔${m.get(r.date).toFixed(3)}`).join(', '):'일치(허용 '+(tol*100)+'%)'}`);};
for(const [id,sym,tol] of [['wti_cl1','CL=F',.003],['brent_b1','BZ=F',.003],['hh_ng1','NG=F',.005],['jkm_futures','JKM=F',.01],['ttf','TTF=F',.01],['cpo','CPO=F',.005],['fei','A7E=F',.005],['copper','HG=F',.003],['iron_ore','TIO=F',.005],['us10y','^TNX',.02]])await sameDay(id,sym,tol,'Yahoo '+sym);
const fredDay=async(id,code,tol,label)=>{const m=await fred(code),s=shown(id).filter(r=>m.has(r.date)).slice(-15);if(!s.length)return add(id,'2차대조',null,label+': 같은 날짜 없음');const bad=s.filter(r=>Math.abs(r.value/m.get(r.date)-1)>tol);add(id,'2차대조',bad.length?null:true,`${label} 최근 ${s.length}일 ${bad.length?'괴리(오류 아님·현물 프리미엄) '+bad.slice(-3).map(r=>`${r.date} ${r.value.toFixed(2)}↔${m.get(r.date)}`).join(', '):'범위 내(허용 '+(tol*100)+'%)'}`);};
// 현물(FRED) vs 최근월 선물: 정의 차이(현물 프리미엄·월물 교체)라 현물 카드에 참고로 표시
for(const [spot,fut,tol,label] of [['wti','wti_cl1',.03,'WTI'],['brent','brent_b1',.05,'Brent'],['hh','hh_ng1',.12,'Henry Hub']]){const F=new Map(shown(fut).map(r=>[r.date,r.value])),s=shown(spot).filter(r=>F.has(r.date)).slice(-15);if(!s.length){add(spot,'2차대조',null,label+' 선물과 같은 날짜 없음');continue;}const bad=s.filter(r=>Math.abs(r.value/F.get(r.date)-1)>tol);add(spot,'2차대조',bad.length?null:true,`${label} 현물 vs 최근월 선물 최근 ${s.length}일 ${bad.length?'괴리(정의 차이·현물 프리미엄, 판단은 선물 사용) '+bad.slice(-3).map(r=>`${r.date} ${r.value.toFixed(2)}↔${F.get(r.date).toFixed(2)}`).join(', '):'범위 내(허용 '+(tol*100)+'%)'}`);}
// 월간 정합
const monthCmp=(id,a,b,tol,label,fa=x=>x,fb=x=>x)=>{const keys=[...a.keys()].filter(k=>b.has(k)&&a.get(k).n!==0).slice(-6);if(!keys.length)return add(id,'2차대조',null,label+': 겹치는 월 없음');const bad=keys.filter(k=>Math.abs(fa(a.get(k).v)/fb(b.get(k).v)-1)>tol);add(id,'2차대조',!bad.length,`${label} 최근 ${keys.length}개월 ${bad.length?'괴리 '+bad.map(k=>`${k} ${fa(a.get(k).v).toFixed(2)}↔${fb(b.get(k).v).toFixed(2)}`).join(', '):'범위 내(허용 '+(tol*100)+'%)'}`);};
const M=id=>mmean(shown(id)),Mf=m=>new Map([...m].map(([d,v])=>[d.slice(0,7),{v,n:1}]));
monthCmp('smp',M('smp'),new Map([...M('smp_daily')].filter(([,x])=>x.n>=25)),.03,'KPX 공식 월평균(수요 가중) vs 일간 SMP 단순평균');
monthCmp('copper',M('copper'),Mf(await fred('PCOPPUSDM')),.04,'COMEX 월평균×2204.6 vs IMF 구리',v=>v*2204.62);
monthCmp('iron_ore',M('iron_ore'),Mf(await fred('PIORECRUSDM')),.08,'TIO 월평균 vs IMF 철광석');
monthCmp('lng_heat',M('lng_heat'),M('gas_power'),.15,'EPSIS LNG 열량단가÷4.1868 vs 가스공사 발전용 요금(직도입 포함 평균이라 낮음)',v=>v/4.1868);
monthCmp('coal',M('coal'),Mf(await fred('PCOALAUUSDM')),.12,'Newcastle 선물 월평균 vs IMF 호주 석탄(지수 정의 차이로 IMF가 3년 평균 약 6% 높음)');
monthCmp('dubai',M('dubai'),new Map([...M('dubai_d')].filter(([,x])=>x.n>=10)),.02,'Dubai 월평균 vs 페트로넷 일간 평균');
monthCmp('palm',M('palm'),M('cpo'),.08,'IMF 팜유 vs CME CPO 월평균');
monthCmp('jlng',M('jlng'),M('jkm_futures'),.6,'IMF 일본 LNG vs JKM(장기계약·현물 차이 큼, 방향 참고)');
{const y=await yahoo('JPY=X'),s=shown('usdjpy').slice(-10).filter(r=>y.has(r.date));const bad=s.filter(r=>Math.abs(r.value/y.get(r.date)-1)>.01);add('usdjpy','2차대조',bad.length?null:true,`Yahoo JPY=X 최근 ${s.length}일 ${bad.length?'괴리(측정 시각 차이: FRB 정오 vs Yahoo 종가) '+bad.map(r=>`${r.date} ${r.value}↔${y.get(r.date).toFixed(2)}`).join(','):'범위 내(1%, 뉴욕 정오 vs 종가)'}`);}
// ⑦ 파생 계열 재계산
for(const d of DERIVED){const A=new Map(shown(d.a).map(r=>[r.date,r.value])),B=new Map(shown(d.b).map(r=>[r.date,r.value])),s=shown(d.id).slice(-30);const bad=s.filter(r=>A.has(r.date)&&B.has(r.date)&&Math.abs(A.get(r.date)-B.get(r.date)*d.k-r.value)>0.011);const orphan=s.filter(r=>!A.has(r.date)||!B.has(r.date));add(d.id,'파생',!bad.length&&!orphan.length,`${d.a} − ${d.b}${d.k!==1?'×'+d.k.toFixed(4):''} 재계산 ${bad.length?'불일치 '+bad.length:'일치'}${orphan.length?` · 입력이 없는 날짜 ${orphan.length}개(${orphan.slice(-2).map(r=>r.date).join(',')})`:''}`);}
// 판정
for(const [id,R] of Object.entries(res)){if(R.verdict)continue;const f=R.checks.filter(c=>c.ok===false),w=R.checks.filter(c=>c.ok===null);R.verdict=f.length?'오류':w.length?'주의':'정상';}
const rows=catalog.map(c=>({id:c.id,...res[c.id]}));
const md=['# 데이터 신뢰성 감사 — '+T,'',`생성 ${new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})} · 지표 ${rows.length}개 · 정상 ${rows.filter(r=>r.verdict==='정상').length} · 주의 ${rows.filter(r=>r.verdict==='주의').length} · 오류 ${rows.filter(r=>r.verdict==='오류').length} · 미수집 ${rows.filter(r=>r.verdict==='미수집').length}`,'',
 '판정: **오류** = 날짜 규칙 위반·2차 출처 불일치·파생 재계산 불일치 / **주의** = 발표 지연·이상치 후보·출처 혼재(확인 필요, 값 자체 오류 아님) / **정상** = 점검 통과','',
 '| 판정 | 지표 | 주기 | 최종일 | 값 | 표시 관측 수 | 점검 내용 |','|---|---|---|---|---|---|---|',
 ...rows.sort((a,b)=>['오류','주의','미수집','정상'].indexOf(a.verdict)-['오류','주의','미수집','정상'].indexOf(b.verdict)).map(r=>`| ${r.verdict} | ${r.name} \`${r.id}\` | ${r.freq} | ${r.last||'-'} | ${r.value!=null?+Number(r.value).toFixed(4):'-'} | ${r.count??0} | ${r.checks.map(c=>(c.ok===false?'✗ ':c.ok===null?'△ ':'✓ ')+c.k+': '+c.text).join('<br>').replace(/\|/g,'/')||'—'} |`)];
await fs.writeFile('DATA_AUDIT.md',md.join('\n')+'\n');await fs.writeFile(`data/audit-${T}.json`,JSON.stringify(rows,null,1));
// 화면 표시용 요약(카드의 검증 표시)
await fs.writeFile('data/audit-latest.json',JSON.stringify({date:T,generatedAt:new Date().toISOString(),summary:{정상:rows.filter(r=>r.verdict==='정상').length,주의:rows.filter(r=>r.verdict==='주의').length,오류:rows.filter(r=>r.verdict==='오류').length,미수집:rows.filter(r=>r.verdict==='미수집').length},byId:Object.fromEntries(rows.map(r=>[r.id,{verdict:r.verdict,checks:r.checks.map(c=>(c.ok===false?'✗ ':c.ok===null?'△ ':'✓ ')+c.k+': '+c.text)}]))}));
console.log(md.slice(0,3).join('\n'));for(const r of rows.filter(r=>r.verdict==='오류'))console.log('오류',r.id,r.checks.filter(c=>c.ok===false).map(c=>c.k+':'+c.text).join(' / '));
