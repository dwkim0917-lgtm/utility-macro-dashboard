import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {parseWestmetall,readNickelForecast,nickelSummary} from '../nickel-source.mjs';
const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('Westmetall LME nickel table → cash, 3M, stock rows',()=>{const h='<table><tr><th>date</th><th>Cash</th><th>3-month</th><th>stock</th></tr><tr><td>17. November 2026</td><td>15,790.00</td><td>15,990.00</td><td>274,140</td></tr><tr><td>02. January 2024</td><td>16,600.00</td><td>16,800.00</td><td>64,158</td></tr></table>';
 const r=parseWestmetall(h);assert.deepEqual(r.filter(x=>x.date==='2026-11-17').map(x=>[x.id,x.value]),[['lme_ni_cash',15790],['lme_ni_3m',15990],['lme_ni_stock',274140]]);});
test('nickel forecast summary: vs last price and required rest-of-year average',async()=>{const fc=await readNickelForecast(ROOT);
 const cash=[];for(let i=0;i<200;i++)cash.push({date:`2026-${String(1+Math.floor(i/21)).padStart(2,'0')}-${String(1+i%21).padStart(2,'0')}`,value:17000});
 const N=nickelSummary(fc,cash,'2026-11-18');const wb=N.table.find(t=>t.src==='WB2610'&&t.year===2026);
 assert.equal(Math.round(N.ytdAvg),17000);assert.equal(Math.round(wb.needRest),Math.round((17200*252-17000*200)/52));assert.ok(N.series.niWB.length===3);});
