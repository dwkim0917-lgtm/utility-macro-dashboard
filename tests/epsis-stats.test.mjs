import test from 'node:test';import assert from 'node:assert/strict';
import {parseEpsisMix,parseEpsisSolarEst,parseEpsisAnnualContract} from '../epsis-stats-source.mjs';
test('EPSIS traded mix: national subtotal rows → GWh and shares of market+PPA',()=>{let js='';
 for(let i=0;i<120;i++){const y=2016+Math.floor(i/12),m=String(i%12+1).padStart(2,'0');
  js+=`c1 = textFormmat("10000",count); c23 = textFormmat("12000",count); c4 = textFormmat("100",count); c5 = textFormmat("9000",count); c6 = textFormmat("300",count); c91 = textFormmat("50",count); c93 = textFormmat("1000",count); c94 = textFormmat("200",count); c97 = textFormmat("400",count); c912 = textFormmat("1800",count); c7 = textFormmat("100",count); c8 = textFormmat("33300",count); c9 = textFormmat("2700",count); c10 = textFormmat("36000",count); localnm="소계"; year = "${y}/${m}"; gridData.push({});`;
  js+=`c1 = textFormmat("1",count); localnm="서울"; year = "${y}/${m}"; gridData.push({});`;}
 const r=parseEpsisMix(js);const g=(id,d)=>r.find(x=>x.id===id&&x.date===d)?.value;
 assert.equal(g('gen_lng','2025-12-01'),9000);assert.equal(g('gen_ppa','2025-12-01'),2700);assert.equal(g('sh_nuc','2025-12-01'),30.03);assert.equal(g('sh_lng','2016-01-01'),27.03);assert.equal(r.filter(x=>x.id==='gen_total').length,120);});
test('EPSIS solar estimate: three channels in MWh → GWh, total = sum, duplicate blocks deduped',()=>{let h='';
 for(let i=0;i<30;i++){const y=2024+Math.floor(i/12),m=String(i%12+1).padStart(2,'0');const b=`period = "${y}.${m}"; year = "${y}"; month = "${m}"; c1 = "1000000"; c2 = "2000000"; c3 = "500000"; gridData.push({});`;h+=b+b;}
 const r=parseEpsisSolarEst(h);assert.equal(r.filter(x=>x.id==='solar_total').length,30);assert.equal(r.find(x=>x.id==='solar_total').value,3500);assert.equal(r.find(x=>x.id==='solar_self').value,500);});
test('EPSIS annual contract table: year blocks → series, first occurrence wins',()=>{let h='';
 for(let y=2000;y<=2025;y++){const b=`if("${y}" >= beginDate){ c1 = textFormmat("${100+y-2000}",count); c2 = textFormmat("150",count); c4 = textFormmat("120",count); c8 = textFormmat("130",count);\n gridData.push({"year":"${y}",`;h+=b+b;}
 const r=parseEpsisAnnualContract(h,[['kp_price_res','c1'],['kp_price_avg','c8']],1,'t','https://x.test');
 assert.equal(r.filter(x=>x.id==='kp_price_res').length,26);assert.equal(r.find(x=>x.id==='kp_price_res'&&x.date==='2025-01-01').value,125);});
