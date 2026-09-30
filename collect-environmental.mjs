import {environmentalJobs} from './environmental-source.mjs';import {mutate,mergeRows} from './store.mjs';
const results=await Promise.all(environmentalJobs.map(async j=>{try{return {name:j.name,ids:j.ids,ok:true,rows:await j.run()};}catch(e){return {name:j.name,ids:j.ids,ok:false,error:e.message};}}));
await mutate(db=>{for(const r of results)if(r.ok)mergeRows(db,r.rows);db.runs.push({at:new Date().toISOString(),results:results.map(({rows,...r})=>({...r,count:rows?.length}))});});
console.log(results.map(({rows,...r})=>({...r,count:rows?.length,first:rows?.map(r=>r.date).sort()[0],last:rows?.map(r=>r.date).sort().at(-1)})));
