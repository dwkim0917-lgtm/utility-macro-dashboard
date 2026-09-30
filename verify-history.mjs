import assert from 'node:assert/strict';
const p=await(await fetch('http://127.0.0.1:8765/api/data')).json();const s=p.db.series;
for(const id of ['purchase','gas_sales','smp','tariff','consumption','dubai']){const r=s[id].filter(x=>x.source===s[id].at(-1).source);const dates=new Set(r.map(x=>x.date)),d=new Date(r[0].date),last=r.at(-1).date,missing=[];while(d.toISOString().slice(0,10)<=last){const key=d.toISOString().slice(0,10);if(!dates.has(key))missing.push(key);d.setUTCMonth(d.getUTCMonth()+1);}assert.deepEqual(missing,[],id+' monthly gaps');}
for(const id of ['jkm_futures','ttf','coal','kr3y','peak','reserve'])assert(s[id][0].date<'2016-09-17',id+' ten-year start');
const csv=await(await fetch('http://127.0.0.1:8765/api/export')).text();const total=Object.values(s).reduce((a,b)=>a+b.length,0);assert.equal(csv.trim().split('\n').length,total+1);console.log({total,monthlySeries:'6 / no missing months',longHistory:'6 / at least ten years',csv:'all rows exported'});
