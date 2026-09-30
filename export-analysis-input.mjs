import fs from 'node:fs/promises';import {catalog,stocks,sources} from './catalog.mjs';
await fs.writeFile('data/analysis-catalog.json',JSON.stringify({catalog,stocks,sources}));
