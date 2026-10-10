// 한전 마진 전망(E): SMP·판매단가·스프레드 월별 추정. 서버/정적 빌드가 매번 최신 관측으로 다시 계산한다.
// SMP E  = 앵커(공식 월평균 다음 달의 KPX 일간 누적평균, 없으면 마지막 공식 월평균)
//          × 과거 10년 같은 달 기준 계절 비율(중앙값, 연료 효과 제거) × 연료비 모델 변화율
//          연료비 모델: SMP = a + b·Brent(원화, 5개월 전) + c·JKM(원화, 2개월 전), 2015-01~최근 OLS
// 판매단가 E = 전년 같은 달 판매단가 × (1 + 최근 3개월 전년동월 대비 평균). 요금 동결 가정.
const ym = d => d.slice(0, 7);
export const addM = (k, n) => { let [y, m] = k.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; };
const latestSrc = (db, id) => { const s = db.series[id] || []; if (!s.length) return []; const src = s.at(-1).source; return s.filter(r => r.source === src); };
const mavg = rows => { const g = {}; for (const r of rows) (g[ym(r.date)] ||= []).push(r.value); return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length])); };
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
function ols(X, y) { const k = X[0].length, M = Array.from({ length: k }, () => Array(k + 1).fill(0)); X.forEach((r, i) => { for (let a = 0; a < k; a++) { M[a][k] += r[a] * y[i]; for (let b = 0; b < k; b++) M[a][b] += r[a] * r[b]; } });
  for (let i = 0; i < k; i++) { let p = i; for (let j = i + 1; j < k; j++) if (Math.abs(M[j][i]) > Math.abs(M[p][i])) p = j; [M[i], M[p]] = [M[p], M[i]]; for (let j = 0; j < k; j++) if (j !== i) { const f = M[j][i] / M[i][i]; for (let c = i; c <= k; c++) M[j][c] -= f * M[i][c]; } } return M.map((r, i) => r[k] / r[i]); }
const r1 = v => Math.round(v * 10) / 10;

export function buildKepcoForecast(db, { horizon = 5, fitFrom = '2015-01' } = {}) {
  const smp = Object.fromEntries(latestSrc(db, 'smp').map(r => [ym(r.date), r.value]));
  const tar = Object.fromEntries(latestSrc(db, 'tariff').map(r => [ym(r.date), r.value]));
  const smpMonths = Object.keys(smp).sort(), tarMonths = Object.keys(tar).sort();
  if (smpMonths.length < 36 || tarMonths.length < 15) return null;
  const brent = { ...mavg(latestSrc(db, 'brent_b1')), ...mavg(latestSrc(db, 'brent')) };
  const fx = mavg(latestSrc(db, 'usdkrw')), jkm = mavg(latestSrc(db, 'jkm_futures'));
  const lastKey = o => Object.keys(o).sort().at(-1);
  const fxAt = k => fx[k] ?? fx[lastKey(fx)], lastJkm = lastKey(jkm), lastBrent = lastKey(brent);
  const assumed = new Set();
  const feat = k => { const b = addM(k, -5), j = addM(k, -2); const jv = jkm[j] ?? (j > lastJkm ? (assumed.add(j), jkm[lastJkm]) : undefined); return [brent[b] * fxAt(b) / 1000, jv * fxAt(j <= lastJkm ? j : lastJkm) / 1000]; };
  const fitRows = smpMonths.filter(k => k >= fitFrom).map(k => ({ k, x: feat(k), y: smp[k] })).filter(r => r.x.every(Number.isFinite));
  assumed.clear();
  const coef = ols(fitRows.map(r => [1, ...r.x]), fitRows.map(r => r.y));
  const fm = k => { const x = feat(k); return coef[0] + coef[1] * x[0] + coef[2] * x[1]; };
  const seasonal = (a, h) => { const out = []; const am = a.slice(5); for (let y = +a.slice(0, 4) - 10; y < +a.slice(0, 4); y++) { const a2 = `${y}-${am}`, t = addM(a2, h); if (smp[a2] && smp[t]) { const f = fm(t) / fm(a2); if (Number.isFinite(f) && f > 0) out.push(smp[t] / smp[a2] / f); } } return median(out); };
  // 앵커
  const lastSmp = smpMonths.at(-1); let anchor = { month: lastSmp, value: smp[lastSmp], kind: '월평균' };
  const mtd = latestSrc(db, 'smp_mtd').at(-1);
  if (mtd && ym(mtd.date) > lastSmp) { const days = latestSrc(db, 'smp_daily').filter(r => ym(r.date) === ym(mtd.date)); if (days.length >= 5) anchor = { month: ym(mtd.date), value: mtd.value, kind: '당월 누적', days: days.length, from: days[0].date, to: days.at(-1).date }; }
  // SMP E
  const smpE = []; if (anchor.kind === '당월 누적') smpE.push({ month: anchor.month, value: r1(anchor.value), note: `${anchor.from.slice(5)}~${anchor.to.slice(5)} ${anchor.days}일 실측 평균` });
  for (let h = 1; h <= horizon; h++) { const t = addM(anchor.month, h); if (addM(t, -5) > lastBrent) break; const v = anchor.value * seasonal(anchor.month, h) * (fm(t) / fm(anchor.month)); if (Number.isFinite(v)) smpE.push({ month: t, value: r1(v) }); }
  // 판매단가 E
  const lastTar = tarMonths.at(-1); const g = [0, 1, 2].map(i => addM(lastTar, -i)).map(k => tar[k] / tar[addM(k, -12)] - 1).filter(Number.isFinite); const growth = g.reduce((a, b) => a + b, 0) / g.length;
  const endE = smpE.at(-1)?.month || lastSmp; const tariffE = [];
  for (let k = addM(lastTar, 1); k <= endE; k = addM(k, 1)) { const base = tar[addM(k, -12)] ?? tariffE.find(e => e.month === addM(k, -12))?.value; if (base) tariffE.push({ month: k, value: r1(base * (1 + growth)) }); }
  // 스프레드
  const smpAt = k => smp[k] != null ? { v: smp[k], e: false } : (smpE.find(e => e.month === k) ? { v: smpE.find(e => e.month === k).value, e: true } : null);
  const tarAt = k => tar[k] != null ? { v: tar[k], e: false } : (tariffE.find(e => e.month === k) ? { v: tariffE.find(e => e.month === k).value, e: true } : null);
  const spreadE = []; for (let k = addM(lastTar, 1); k <= endE; k = addM(k, 1)) { const a = tarAt(k), b = smpAt(k); if (a && b) spreadE.push({ month: k, value: r1(a.v - b.v), tariff: a.e ? 'E' : '실적', smp: b.e ? 'E' : '실적' }); }
  // 분기 평균(실적+E)
  const qOf = k => `${k.slice(0, 4)}Q${Math.floor((+k.slice(5) - 1) / 3) + 1}`; const qs = {};
  for (const k of tarMonths) if (smp[k] != null) (qs[qOf(k)] ||= []).push({ v: tar[k] - smp[k], e: false });
  for (const s of spreadE) (qs[qOf(s.month)] ||= []).push({ v: s.value, e: true });
  const quarters = Object.entries(qs).filter(([, v]) => v.length === 3).map(([q, v]) => ({ q, value: r1(v.reduce((a, b) => a + b.v, 0) / 3), estimated: v.some(x => x.e) })).slice(-8);
  // 백테스트(2023-01 이후 앵커, 공식 월평균 기준)
  const mae = {}; for (const h of [1, 2, 3]) { const errs = []; for (const A of smpMonths.filter(k => k >= '2023-01')) { const t = addM(A, h); if (smp[t] == null) continue; const e = smp[A] * seasonal(A, h) * (fm(t) / fm(A)); if (Number.isFinite(e)) errs.push(Math.abs(e - smp[t])); } mae[h] = errs.length ? r1(errs.reduce((a, b) => a + b, 0) / errs.length) : null; }
  return { asOf: new Date().toISOString(), anchor, smpE, tariffE, spreadE, quarters,
    model: { coef: coef.map(v => Math.round(v * 1000) / 1000), fitFrom, n: fitRows.length, mae, tariffGrowth: Math.round(growth * 10000) / 100, jkmAssumedFlat: [...assumed].sort() },
    note: 'SMP E: 앵커 × 과거 10년 계절 비율 × 연료비 모델(Brent 5개월·JKM 2개월 시차) 변화율. 판매단가 E: 전년 같은 달 × (1+최근 3개월 전년비), 요금 동결 가정. 2023년 이후 백테스트 SMP 평균 절대오차는 표의 수치.' };
}
