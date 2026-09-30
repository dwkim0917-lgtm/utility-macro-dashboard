import fs from 'node:fs/promises';
const host='https://ets.krx.co.kr';
const otp=await(await fetch(host+'/contents/COM/GenerateOTP.jspx?'+new URLSearchParams({name:'grid',bld:'ETS/03/03010000/ets03010000_05'}))).text();
const r=await fetch(host+'/contents/ETS/99/ETS99000001.jspx',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:otp,isu_cd:'KRD050042609',fromdate:'20250918',todate:'20260917'})});const t=await r.text();await fs.writeFile('data/kau26-raw.json',t);console.log(r.status,t.slice(0,2200));
