import test from 'node:test';import assert from 'node:assert/strict';
import {parseEpsisCapacity} from '../capacity-source.mjs';
const C=['c1','c2','c3','c4','c5','c6','c7','c8','c91','c92','c93','c94','c95','c96','c97','c98'];
const blk=(ym,sol,wind,fc,tot)=>{const v={c8:tot,c91:fc,c93:sol,c94:wind};return '\n'+C.map(k=>`c${k.slice(1)} = textFormmat("${v[k]??10}",count);`).join('\n')+`\nnmArea="합계";\nif("N"=="Y"){ year = "${ym.slice(0,4)}"; }else{ year = "${ym}"; }\ngridData.push({"Period":year});`;};
test('EPSIS capacity: monthly net adds, 12m sum, unpublished flat tail dropped',()=>{
 let js='';const months=[];for(let i=0;i<64;i++){const y=2021+Math.floor(i/12),m=i%12+1;months.push(`${y}/${String(m).padStart(2,'0')}`);}
 months.forEach((ym,i)=>{js+=blk(ym,1000+i*10,500,100+i,9000+i*11);});
 // 미공표 꼬리: 마지막 두 달이 직전 달과 완전히 같음
 const last=months.length-1;js+=blk('2026/05',1000+last*10,500,100+last,9000+last*11)+blk('2026/06',1000+last*10,500,100+last,9000+last*11);
 const out=parseEpsisCapacity(js);
 assert.equal(out.latest,'2026-04-01');assert.deepEqual(out.dropped,['2026-05-01','2026-06-01']);
 const add=out.filter(r=>r.id==='add_solar');assert.equal(add.length,63);assert.ok(add.every(r=>r.value===10));
 assert.equal(out.filter(r=>r.id==='add_solar_12m').at(-1).value,120);
 assert.equal(out.filter(r=>r.id==='add_fcell').at(-1).value,1);
 assert.equal(out.filter(r=>r.id==='cap_solar').at(-1).value,1000+last*10);});
