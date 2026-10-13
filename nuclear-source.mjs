import {tables} from './collector.mjs';
export function parseNuclear(html){let years=[],out=[];for(const r of tables(html)){if(r[0]==='구분')years=r.slice(1);if(r[0]==='이용률(%)')for(let i=1;i<r.length;i++){if(!/^\d{4}$/.test(years[i-1])||!/^\d+(\.\d+)?$/.test(r[i]))continue;const value=Number(r[i]);if(value<0||value>100)throw Error('원전 이용률 범위 오류');out.push({id:'nuclear',date:years[i-1]+'-07-01',value,source:'한수원 · 연간 원전 이용률',url:'https://npp.khnp.co.kr/ON004004002001003'});}}if(out.length<2)throw Error('원전 이용률 표 확인 필요');return out;}
// 한수원 열린원전운영정보 메인 '실시간 운영현황': 원자력 설비용량(MW)·현재 발전량(MWe)·운전 호기 수. 수집 시점 스냅숏(일평균 아님). 2026-10-12 추가.
export function parseNuclearLive(html,date){const t=html.replace(/<script[\s\S]*?<\/script>/g,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');
 const cap=t.match(/원자력 설비용량\s*([\d,]+)\s*MW/),gen=t.match(/원자력 발전량\s*([\d,]+)\s*MWe/),u=t.match(/(\d+)\s*기\s*중\s*(\d+)\s*기\s*운전중/);
 if(!cap||!gen)throw Error('한수원 실시간 운영현황 문구 변경');const c=Number(cap[1].replace(/,/g,'')),g=Number(gen[1].replace(/,/g,''));
 if(!(c>15000&&c<40000)||!(g>=0&&g<=c*1.08))throw Error('한수원 실시간 값 범위 이상: '+g+'/'+c);
 const note=u?` · ${u[1]}기 중 ${u[2]}기 운전`:'';
 const out=[{id:'nuclear_live',date,value:Math.round(g/c*1000)/10,source:'한수원 · 운영현황(수집 시점 발전량÷설비용량)',url:'https://npp.khnp.co.kr/'}];
 if(u)out.push({id:'nuclear_units',date,value:Number(u[2]),source:'한수원 · 운영현황(운전 호기 수, 총 '+u[1]+'기)',url:'https://npp.khnp.co.kr/'});return out;}
