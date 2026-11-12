import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {readKdhcOh,deriveKdhcOhDaily,kdhcOhSummary} from '../kdhc-oh-source.mjs';
const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('KDHC O/H: daily offline MW and quarterly MW-days from company schedule',async()=>{const s=await readKdhcOh(ROOT);
 const d=deriveKdhcOhDaily(s,'2026-11-11');const at=x=>d.find(r=>r.date===x).value;
 assert.equal(at('2026-11-11'),378+146);            // 동탄 #1BL + 판교
 assert.equal(at('2026-09-15'),378+146+270+270+100); // 동탄 #2 + 판교 + 대구 + 청주 + 삼송
 assert.equal(at('2025-12-01'),0);assert.equal(d.at(-1).date,'2026-11-11');
 const S=kdhcOhSummary(s,'2026-11-11');const q=k=>S.quarters.find(r=>r.q===k);
 assert.equal(q('2026Q4').mwd,63176);assert.equal(q('2025Q4').mwd,0);assert.equal(q('2026Q3').mwd,31008);
 assert.equal(S.offNow,524);assert.equal(S.plants.find(p=>p.plant==='판교').remain,19);assert.equal(S.stale,false);
 assert.equal(kdhcOhSummary(s,'2027-03-01').stale,true);});
test('KDHC O/H: data file validation rejects reversed dates and unknown plants',async()=>{const fs=await import('node:fs/promises');const os=await import('node:os');const s=await readKdhcOh(ROOT);
 for(const ev of [{...s.events[0],start:'2026-05-02',end:'2026-05-01'},{...s.events[0],plant:'없는발전소'}]){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kdhc-'));await fs.mkdir(path.join(dir,'data'));await fs.writeFile(path.join(dir,'data','kdhc-oh.json'),JSON.stringify({...s,events:[ev]}));await assert.rejects(readKdhcOh(dir));await fs.rm(dir,{recursive:true});}});
