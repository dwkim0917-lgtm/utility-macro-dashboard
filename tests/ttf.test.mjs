import test from 'node:test';import assert from 'node:assert/strict';
import {deriveTtf} from '../collector.mjs';
const row=(date,value)=>({date,value,source:'t',url:'https://x.test',collectedAt:'2026-01-01T00:00:00Z'});
test('TTF converts EUR/MWh to USD/MMBtu with prior-day FX and JKM−TTF spread',()=>{
 const db={series:{ttf:[row('2026-10-27',100),row('2026-10-28',100.72),row('2026-11-20',90)],eurusd:[row('2026-10-24',1.1),row('2026-10-28',1.113)],jkm_futures:[row('2026-10-28',32.355)]}};
 const out=deriveTtf(db);const u=out.filter(r=>r.id==='ttf_usd'),s=out.filter(r=>r.id==='jkm_ttf');
 assert.equal(u.find(r=>r.date==='2026-10-27').value,Math.round(100*1.1/3.412*1000)/1000);
 assert.equal(u.find(r=>r.date==='2026-10-28').value,32.855);
 assert.ok(!u.some(r=>r.date==='2026-11-20'),'stale FX (>5 days) must not be used');
 assert.deepEqual(s.map(r=>[r.date,r.value]),[['2026-10-28',-0.5]]);});
