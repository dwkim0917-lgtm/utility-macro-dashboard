import {tables} from './collector.mjs';import fs from 'node:fs/promises';
const {failures}=JSON.parse(await fs.readFile('data/demand-backfill-progress.json','utf8'));
for(const {page} of failures){const h=await(await fetch('https://new.kpx.or.kr/powerDemandPerform.es?mid=a10404060000&nPage='+page)).text();console.log({page,rows:tables(h).filter(r=>r.some(x=>/^20\d\d[.]\d\d[.]\d\d$/.test(x)))});await fs.writeFile('data/demand-page-'+page+'.html',h);}
