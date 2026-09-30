import fs from 'node:fs/promises';
const html=await fs.readFile('data/research-0.html','utf8');
const links=[...html.matchAll(/value="([^"\n]*REAL_NAME=[^"]+)"/g)].map(m=>new URL(m[1].replaceAll('&amp;','&'),'https://www.kogas.or.kr').href);
await fs.mkdir('data/kogas-originals',{recursive:true});
const manifest=[];for(const url of links){const name=new URL(url).searchParams.get('REAL_NAME');const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(r.status);const buf=Buffer.from(await r.arrayBuffer());if(buf.subarray(0,2).toString()!=='PK')throw Error('Not xlsx: '+name);await fs.writeFile('data/kogas-originals/'+name,buf);manifest.push({name,url});}await fs.writeFile('data/kogas-originals/manifest.json',JSON.stringify(manifest));console.log(manifest.map(x=>x.name));
