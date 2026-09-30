import fs from 'node:fs/promises';
let c=await fs.readFile('crosscheck-stock-history.mjs','utf8');
c=c.replace("p.historyChecks=[];", "p.historyChecks=[];const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'}),first=today.slice(0,7)+'-01',end=new Date(Date.parse(first+'T00:00:00Z')-86400000).toISOString().slice(0,10).replaceAll('-','');");
c=c.replace('endTime=20260831','endTime=${end}').replace("r.date<'2026-09-01'","r.date<first");
c=c.replace("await fs.writeFile('data/stock-prices.json'", "if(p.historyChecks.some(v=>v.error||v.months<100))throw Error('주가 원천 대조 실패: 분석 갱신 중단');\nawait fs.writeFile('data/stock-prices.json'");await fs.writeFile('crosscheck-stock-history.mjs',c);
let p=await fs.readFile('collect-stock-history.mjs','utf8');p=p.replace("await fs.writeFile('data/stock-prices.json'", "if(out.failures.length||Object.keys(out.series).length!==12)throw Error('주가 수집 불완전: 기존 파일 유지');\nawait fs.writeFile('data/stock-prices.json'");await fs.writeFile('collect-stock-history.mjs',p);
