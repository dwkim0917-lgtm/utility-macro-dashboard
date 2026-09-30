import fs from 'node:fs/promises';import {mutate,mergeRows} from './store.mjs';
// KPX 2025 Electricity Market Statistics, PDF page 67, printed p.132, table 3-3.
// 2018-07 is genuinely blank in the table layout; do not shift subsequent columns.
const annual={
2016:[null,null,99995,105856,122320,119088,128028,139908,149907,169074,147567,167272],
2017:[159698,145963,130800,124766,131175,130234,127113,127046,127175,127726,123483,102386],
2018:[112166,110081,101015,108580,109599,107917,null,96327,91329,80482,75067,78378],
2019:[74231,73641,74395,69034,69749,68920,63309,58264,57043,50608,47816,48409],
2020:[43554,41061,42490,44324,44460,44264,44545,46235,45659,40669,34121,34814],
2021:[39031,40195,36017,33843,31526,31584,29542,29913,31512,35215,38846,38779],
2022:[46211,56036,47520,52852,52971,54492,55606,62161,63293,63614,63801,64292],
2023:[61081,62514,67866,72130,72131,72938,73218,75300,80732,80424,78900,75625],
2024:[77939,79323,79058,75584,74466,74923,75817,78745,79282,76866,75010,67159],
2025:[69760,72160,72145,72405,72385,71958,71649,71859,71972,72312,72144,72294]};
const rows=Object.entries(annual).flatMap(([year,vs])=>vs.flatMap((value,i)=>value===null?[]:[{id:'rec_monthly',date:year+'-'+String(i+1).padStart(2,'0')+'-01',value,source:'KPX · REC 월평균 · 2025 전력시장 통계',url:'https://kpx.or.kr/boardDownload.es?bid=0045&list_no=77084&seq=4'}]));
if(rows.length!==117)throw Error('REC historical row count');await fs.writeFile('data/rec-monthly-verified.json',JSON.stringify(rows,null,2));await mutate(db=>mergeRows(db,rows));console.log({count:rows.length,first:rows[0].date,last:rows.at(-1).date});
