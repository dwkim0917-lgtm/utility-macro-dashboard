import fs from 'node:fs/promises';
import {parseCSV,mergeRows,mutate} from './store.mjs';
const file=process.argv[2];if(!file)throw Error('Usage: node import-observations.mjs <observations.json|csv>');
const text=await fs.readFile(file,'utf8');const rows=file.endsWith('.csv')?parseCSV(text):JSON.parse(text);
await mutate(db=>mergeRows(db,rows));console.log(`${rows.length} observations imported`);
