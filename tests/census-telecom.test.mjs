import test from 'node:test';import assert from 'node:assert/strict';
import {parseAcesRows} from '../census-telecom-source.mjs';
test('ACES 4a: wired/wireless split → share, structures, equipment (≤2019)',()=>{const r=parseAcesRows([['NAICS code','Industry'],['5171','Wired',47142,47109,9240,9239,1,37901,37870,31],['5172','Wireless',40347,40338,7254,7254,0,33094,33084,10]],2019);const g=id=>r.find(x=>x.id===id)?.value;
 assert.equal(g('aces_tel_capex'),87489);assert.equal(g('aces_wired_share'),53.9);assert.equal(g('aces_tel_struct'),16494);assert.equal(g('aces_tel_equip'),70995);assert.ok(r.every(x=>x.date==='2019-12-31'));});
test('ACES 4a: merged 5173 (2020~) → total only',()=>{const r=parseAcesRows([['5173','Wired and wireless',101091,89809,23938,'D','D',77153,'D','D']],2022);assert.deepEqual(r.map(x=>[x.id,x.value]),[['aces_tel_capex',101091],['aces_tel_struct',23938],['aces_tel_equip',77153]]);});
test('ACES 4a: no telecom row → throws',()=>{assert.throws(()=>parseAcesRows([['2211','Power',1,1]],2022));});
