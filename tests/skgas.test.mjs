import test from 'node:test';import assert from 'node:assert/strict';
import {deriveSkgas,readSkgasIr,PROPANE_MMBTU_PER_T,FEI_BBL_PER_T} from '../collector.mjs';
const row=(date,value)=>({date,value,source:'t',url:'https://x.test',collectedAt:'2026-01-01T00:00:00Z'});
test('SK Gas IR indicators: FEI/Brent %, monthly JKM−FEI and FEI/Brent use IR factors 47.8 and 8.21',()=>{
 assert.equal(PROPANE_MMBTU_PER_T,47.8);assert.equal(FEI_BBL_PER_T,8.21);
 const db={series:{fei:[row('2026-10-29',951.7),row('2026-10-30',978.35)],brent_b1:[row('2026-10-29',108.34),row('2026-10-30',117.64)],jkm_futures:[row('2026-10-29',28.59),row('2026-10-30',32.84)]}};
 const out=deriveSkgas(db);const g=id=>out.filter(r=>r.id===id);
 assert.equal(g('fei_brent')[0].value,Math.round(951.7/8.21/108.34*1000)/10);
 const sp=[(28.59-951.7/47.8),(32.84-978.35/47.8)];assert.equal(g('jkm_fei_m')[0].value,Math.round((sp[0]+sp[1])/2*100)/100);
 assert.equal(g('fei_brent_m').length,1);assert.equal(g('fei_brent_m')[0].date,'2026-10-01');});
test('SK Gas IR published monthly values load from data file',async()=>{const r=await readSkgasIr();const oct=r.find(x=>x.id==='skgas_ir_jkm_fei'&&x.date==='2026-10-01');assert.equal(oct.value,8.8);assert.equal(r.find(x=>x.id==='skgas_ir_fei_brent'&&x.date==='2026-06-01').value,98);});
