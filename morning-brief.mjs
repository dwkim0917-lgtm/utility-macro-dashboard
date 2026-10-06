import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {catalog,stocks} from './catalog.mjs';
import {ROOT,readStore,today} from './store.mjs';
import {briefLine} from './sensitivity-engine.mjs';
const day=86400000;
export function morningDue(date=today()){return Date.parse(date+'T08:30:00+09:00');}
const fmt=n=>Number(n.toFixed(2)).toLocaleString('ko-KR');
export function change(a,b,unit){if(!a||!b)return null;const absolute=unit==='%'||unit==='°C';if(!absolute&&b.value===0)return null;const value=absolute?a.value-b.value:(a.value/b.value-1)*100;return {value,text:(value>0?'+':'')+fmt(value)+(unit==='%'?'%p':unit==='°C'?'°C':'%')};}
export function summarize(db,previous={},date=today()){
 return catalog.map(c=>{const all=(db.series[c.id]||[]).filter(r=>r.date<=date);const latest=all.at(-1);if(!latest)return {id:c.id,name:c.name,missing:true};const rows=all.filter(r=>r.source===latest.source),prior=rows.at(-2),age=(Date.parse(date)-Date.parse(latest.date))/day;const stale=age>(c.staleDays??(c.frequency==='월간'?75:c.frequency==='연간'?450:7));const seen=previous[c.id];const changed=!!seen&&(seen.date!==latest.date||seen.value!==latest.value||seen.source!==latest.source);const delta=change(latest,prior,c.unit);const target=Date.parse(latest.date)-7*day;const base=rows.findLast(r=>Date.parse(r.date)<=target&&Date.parse(r.date)>=target-4*day);return {...c,latest,prior,delta,week:c.frequency==='일간'?change(latest,base,c.unit):null,stale,age,changed,revised:!!seen&&seen.date===latest.date&&seen.value!==latest.value,score:(changed?100:0)+(stale?-100:0)+(c.priority==='핵심'?10:0)+Math.min(Math.abs(delta?.value||0),20)};});
}
export function buildBrief(db,audit,previous={},date=today()){
 const rows=summarize(db,previous,date),available=rows.filter(r=>!r.missing),changes=available.filter(r=>r.changed),snapshot=Object.fromEntries(available.map(r=>[r.id,{date:r.latest.date,value:r.latest.value,source:r.latest.source}]));
 const rank=r=>r.score+(r.frequency==='일간'?25:0)+(r.unit!=='%'&&r.unit!=='°C'&&Math.abs(r.week?.value||0)>=5?120:0);// 7일 ±5% 이상은 보완 지표도 승격
 const core=['wti_cl1','brent_b1','jkm_futures','coal','usdkrw','kr3y','kau','rec'];
 const chosen=core.map(id=>available.find(r=>r.id===id)).filter(Boolean);
 chosen.push(...available.filter(r=>!core.includes(r.id)).sort((a,b)=>rank(b)-rank(a)).slice(0,8-chosen.length));
 const title=`유틸리티 아침 브리핑 | ${date} KST`;
 const lines=[title,Object.keys(previous).length?`직전 발송 이후 신규·수정 ${changes.length}개 / 확보 ${available.length}개`:'첫 브리핑: 확보한 최신 관측 현황 (당일 변동 아님)', '변동률은 직전 관측 대비. 관측일·발표 주기는 지표마다 다릅니다.'];
 const alerts=[];for(const id of ['wti_cl1','brent_b1']){const r=available.find(x=>x.id===id);if(!r)continue;if(Math.abs(r.delta?.value||0)>=4)alerts.push(`${r.name} 하루 ${r.delta.text}`);else if(Math.abs(r.week?.value||0)>=8)alerts.push(`${r.name} 7일 ${r.week.text}`);if(r.stale)alerts.push(`${r.name} 수집 지연(${r.latest.date})`);}
 {const f=available.find(x=>x.id==='wti_cl1'),m=available.find(x=>x.id==='wti_m12');if(f&&m&&f.latest.date===m.latest.date)lines.push(`\n유가 커브(WTI): 최근월 ${fmt(f.latest.value)} → 12개월 뒤 ${fmt(m.latest.value)} (${(m.latest.value/f.latest.value-1>0?'+':'')+fmt((m.latest.value/f.latest.value-1)*100)}%, ${m.latest.value<f.latest.value?'백워데이션':'콘탱고'}) · 시장이 반영한 경로, 예측 아님`);}
 {const s=available.find(x=>x.id==='jkm_fei');if(s&&!s.stale){if(s.latest.value<0)alerts.push(`JKM−FEI ${fmt(s.latest.value)}: LNG가 LPG보다 저렴(GPS LPG 전환 유인 소멸)`);else if(s.latest.value>=5)alerts.push(`JKM−FEI +${fmt(s.latest.value)}: LPG 우위 지속(울산GPS 연료전환 유리)`);}}
 if(alerts.length)lines.push('\n⚠ 유가 알림: '+alerts.join(' / ')+(alerts.some(x=>/WTI|Brent/.test(x))?' — 한전 −3,140억/$1(B), 포스코인터 +47억/$1(C) 환산 확인':''));
 for(const r of chosen){let l=`\n${r.revised?'[수정] ':r.changed?'[신규] ':''}${r.name}: ${fmt(r.latest.value)} ${r.unit}\n${r.latest.date} | 직전 ${r.delta?.text??'비교 없음'}${r.week?' | 7일 '+r.week.text:''}${r.stale?' | 갱신 지연':''}`;
 const codes=[...new Set(r.effects.flatMap(e=>e.codes))];l+='\n관련: '+codes.map(c=>stocks[c]||c).slice(0,4).join(' · ');
 const p=audit?.byPair?.[r.id+':'+codes[0]];if(p){const d=p.direction;const sign=r.delta?.value;const rating=d&&sign?(sign>0?d.up:d.down):null;const explanation=d?'상승 시 '+d.operating:(p.text||'');l+='\n'+(stocks[codes[0]]||codes[0])+' '+(rating?`이번 방향 ${rating}(조건부). `:'실적 경로: ')+explanation.split(/(?<=다\.)\s/)[0].slice(0,90);}
 const q=briefLine(db,r.id,date);if(q)l+='\n'+q;
 if(r.id==='jkm_futures')l+='\n최근월 교체 효과 가능: 현물 LNG 충격과 구분';
 l+='\n출처 '+r.latest.url;lines.push(l);}
 const run=db.runs?.at(-1);const latestJobs=new Map();for(const rr of db.runs||[])for(const job of rr.results||[])latestJobs.set(job.name,job);const failed=[...latestJobs.values()].filter(r=>!r.ok).map(r=>r.name);
 lines.push('\n수집 상태: '+(run?run.at.slice(0,16)+' UTC':'확인 이력 없음')+(failed.length?' / 실패 '+failed.join(', '):''));
 if(!run||Date.parse(date)-Date.parse(run.at)>day)lines.push('주의: 최근 수집 확인이 24시간 이상 지났거나 없습니다.');
 if(db.monitor?.status==='partial')lines.push('보완 수집: 일부 미완료 ('+(db.monitor.checkedAt||'확인시각 미상').slice(0,10)+'). '+(/BigFinance.*재로그인/.test(db.monitor.note||'')?'BigFinance 재로그인 필요. ':'')+'상세 상태는 대시보드 확인.');
 const missing=rows.filter(r=>r.missing);lines.push('미연결: '+missing.map(r=>r.name).join(', '));
 const stale=available.filter(r=>r.stale);if(stale.length)lines.push('갱신 확인 필요: '+stale.map(r=>r.name).join(', '));
 lines.push('환산=변동이 1년 지속·타 변수 일정 가정의 연간 이익(억원), 괄호는 FY25 영업이익 대비. A공시/B증권사/C자체산식. 상세 /sensitivity');
 lines.push('가격 방향 ≠ 주가 예측. 종목 영향·시차는 계약/요금/헤지에 따라 다름.','전체 차트: 이 PC의 http://127.0.0.1:8765/ (휴대폰에서는 열리지 않음)','스탁이지 참고: https://stockeasy.intellio.kr/ (자동 수치 수집 미연결)');
 let text=lines.join('\n');if(text.length>3950)text=text.slice(0,3820)+'\n… 전체 지표와 근거는 로컬 대시보드에서 확인하세요.';
 return {date,text,rows,snapshot};
}
export function sendExisting(deliveryScript,messagePath,powershell){
 return new Promise((resolve,reject)=>{const p=spawn(powershell,['-NoProfile','-NonInteractive','-File',deliveryScript,'-Mode','Send','-MessagePath',messagePath],{windowsHide:true});let out='';p.stdout.on('data',c=>out+=c);p.stderr.resume();p.on('error',()=>reject(Error('기존 Telegram 전달 스크립트 실행 실패')));p.on('close',code=>{try{const j=JSON.parse(out.replace(/^\uFEFF/,''));if(code!==0||!j.ok||!j.message_id)throw Error();resolve(j.message_id);}catch{reject(Error('Telegram 결과 확인 필요. 자동 재전송하지 않습니다.'));}});});
}
async function json(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function save(file,data){await fs.writeFile(file+'.tmp',JSON.stringify(data,null,2));await fs.rename(file+'.tmp',file);}
async function main(){const statePath=path.join(ROOT,'data','telegram-state.json'),lockPath=path.join(ROOT,'data','telegram-send.lock');let lock;
 if(process.argv.includes('--send')&&Date.now()<morningDue()){console.log('아직 한국시간 08:30 전입니다. 정시 대기 실행 필요.');return;}
 try{lock=await fs.open(lockPath,'wx');}catch{throw Error('알림 작업이 실행 중이거나 이전 잠금 확인 필요');}
 try{const state=await json(statePath,{days:{},snapshot:{}}),db=await readStore();db.monitor=await json(path.join(ROOT,'data','monitor-status.json'),{});const audit=await json(path.join(ROOT,'data','impact-evidence.json'),{}),brief=buildBrief(db,audit,state.snapshot);await save(path.join(ROOT,'data','morning-brief.json'),brief);await fs.writeFile(path.join(ROOT,'data','morning-brief.txt'),brief.text);
 if(!process.argv.includes('--send')){console.log(brief.text);return;}
 if(state.days[brief.date]){console.log('오늘 전송 기록 존재: '+state.days[brief.date].status+' / 자동 중복 발송 없음');return;}
 const config=await json(path.join(ROOT,'data','telegram-config.json'),{});if(!config.deliveryScript)throw Error('텔레그램 연결 설정 필요');await fs.access(config.deliveryScript);
 const messagePath=path.join(ROOT,'data',`telegram-brief-${brief.date}.txt`);await fs.writeFile(messagePath,brief.text);
 state.days[brief.date]={status:'sending',at:new Date().toISOString()};await save(statePath,state);
 try{const id=await sendExisting(config.deliveryScript,messagePath,config.powershell);state.days[brief.date]={status:'sent',messageId:id,at:new Date().toISOString(),messagePath};state.snapshot=brief.snapshot;await save(statePath,state);console.log('Telegram 아침 브리핑 전송 완료 · message_id='+id);}catch(e){state.days[brief.date]={status:'needs-review',at:new Date().toISOString(),error:e.message};await save(statePath,state);throw e;}
 }finally{await lock.close();await fs.unlink(lockPath);}}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)main().catch(e=>{console.error(e.message);process.exitCode=1;});
