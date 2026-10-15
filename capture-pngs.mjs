// 대시보드 주요 지표 묶음을 슬라이드용 PNG로 저장(1년·3년). 사용: node capture-pngs.mjs [출력폴더]. 로컬 서버(127.0.0.1:8765)와 Edge 필요.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const ymd=new Date(Date.now()+9*3600e3).toISOString().slice(2,10).replace(/-/g,"");
const OUT=process.argv[2]||path.join(path.dirname(fileURLToPath(import.meta.url)),'..','대시보드_캡처',ymd);
const EDGE=String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`;
const PROF=path.join(process.env.TEMP||".","utility-capture-edge");
fs.mkdirSync(OUT,{recursive:true});
const sets=[
 ['01_전력_SMP·한전단가','전력 · SMP · 한전 단가','SMP 일간·월평균, 한전 구입·판매단가, 최대전력·예비율','smp_daily,smp,purchase,tariff,peak,reserve'],
 ['02_연료_유가·가스·석탄','연료 · 유가 · 가스 · 석탄','WTI·Brent 최근월, JKM·Henry Hub·TTF, 뉴캐슬 석탄','wti_cl1,brent_b1,jkm_futures,hh_ng1,ttf,coal'],
 ['03_스프레드·요금·환경','LNG 스프레드 · 요금 · 환경상품','JKM−FEI·JKM−HH 스프레드, 프로판 FEI, 발전용 가스요금, 배출권·REC','jkm_fei,jkm_hh,fei,gas_power,kau,rec'],
 ['04_금리환율·수요','금리 · 환율 · 수요','원/달러, 국고 3년, 미 10년, 원전 이용률, 가스공사 판매량, 전력 판매량','usdkrw,kr3y,us10y,nuclear,gas_sales,consumption'],
 ['05_상사_팜·운임·석탄','종합상사 · 팜유 · 운임 · 인니 석탄','CME CPO, 인니 CPO 기준가·수출비용, SCFI·WCI, ICI GAR 4200','cpo,cpo_hr,cpo_duty,scfi,wci,ici4'],
];
for(const [name,title,sub,ids] of sets)for(const [p,lab] of [[366,'1년'],[1096,'3년']]){
 const url=`http://127.0.0.1:8765/?capture=1&cols=3&period=${p}&title=${encodeURIComponent(title)}&sub=${encodeURIComponent(sub)}&ids=${ids}`;
 const file=path.join(OUT,`${name}_${lab}.png`);
 try{execFileSync(EDGE,['--headless=new','--disable-gpu','--hide-scrollbars','--force-device-scale-factor=2','--window-size=1600,860','--virtual-time-budget=20000','--run-all-compositor-stages-before-draw',`--user-data-dir=${PROF}`,`--screenshot=${file}`,url],{stdio:'ignore',timeout:90000});}catch(e){console.log('ERR',name,lab,e.message.slice(0,100));}
 console.log(fs.existsSync(file)?`${path.basename(file)} ${fs.statSync(file).size}`:`MISSING ${file}`);
}
