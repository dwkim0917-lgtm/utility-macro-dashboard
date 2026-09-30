import fs from 'node:fs/promises';
const h=await fs.readFile('data/impact-sources/posco2025.html','utf8'),t=h.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');for(const term of ['이자율위험','10% 상승','10%상승','100bp','1% 증가','민감도 분석']){let start=0;for(let n=0;n<2;n++){const p=t.indexOf(term,start);if(p<0)break;console.log(term,t.slice(p-100,p+1100));start=p+term.length;}}
