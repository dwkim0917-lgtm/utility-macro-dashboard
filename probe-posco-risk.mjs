import fs from 'node:fs/promises';
const u='https://kind.krx.co.kr/external/2026/03/18/002126/20260318009943/11011.htm',h=await(await fetch(u)).text();await fs.writeFile('data/impact-sources/posco2025.html',h);const t=h.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');for(const term of ['환율변동','이자율변동','외화위험']){let p=t.indexOf(term);console.log(term,t.slice(p-150,p+1500));}
