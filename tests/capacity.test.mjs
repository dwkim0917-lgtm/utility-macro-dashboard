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
import {parseKpxRenewRows,buildCapacity} from '../capacity-source.mjs';
test('KPX monthly renewable capacity overlays EPSIS: newer months added, same month replaced, adds recomputed',()=>{
 const rows=[['1. 신∙재생에너지 설비용량'],['년월','신에너지',null,'재생에너지',null,null,null,null,'합계'],[null,'연료전지','IGCC','태양에너지','풍력','수력','해양에너지','바이오에너지',null],
  [46295,10,1,20500,5,1,1,2,20520],[46265,10,1,20400,5,1,1,2,20420],['* 주석']];
 const k=parseKpxRenewRows(rows);assert.deepEqual([...k.keys()],['2026-09-01','2026-08-01']);
 const base={c1:1,c2:1,c3:1,c4:1,c5:1,c6:1,c7:1,c8:100,c91:10,c92:1,c93:20000,c94:5,c95:1,c96:1,c97:2,c98:50};
 const pub=[{date:'2026-07-01',v:{...base}},{date:'2026-08-01',v:{...base,c93:20010}}];
 const out=buildCapacity(pub,k);const g=(id,d)=>out.find(r=>r.id===id&&r.date===d);
 assert.equal(g('cap_solar','2026-08-01').value,20400);assert.match(g('cap_solar','2026-08-01').source,/KPX · 신재생/);
 assert.equal(g('add_solar','2026-08-01').value,400);assert.equal(g('add_solar','2026-09-01').value,100);
 assert.equal(g('cap_renew','2026-07-01').value,20020,'renew excludes waste (c98)');assert.ok(!g('cap_total','2026-09-01'),'non-renewable totals only from EPSIS');assert.equal(out.latest,'2026-09-01');});
