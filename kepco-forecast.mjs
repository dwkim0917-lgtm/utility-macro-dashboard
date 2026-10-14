// 한전 마진 전망(E) v3 (2026-10-14): v2 산식 유지 + 시차별 백테스트 오차 범위(lo/hi)·입력 갱신 주기(updates) 추가.
//   SMP 범위 = E ± 시차별 평균 절대오차(앵커 월은 경과 일수별 오차), 판매단가 범위 = E ± 시차별 백테스트 오차(2023-01~),
//   스프레드 범위 = √(SMP 오차² + 판매단가 오차²), 분기 범위 = 해당 분기 E 월 범위의 판매량 가중 평균.
// 한전 마진 전망(E) v2 (2026-10-10). 서버/정적 빌드가 매번 최신 관측으로 다시 계산한다.
// SMP E  = 0.7 × [앵커 × 과거 5년 같은 달 계절 비율(중앙값, 연료 효과 제거) × 연료비 모델 변화율] + 0.3 × 앵커
//          앵커 = 공식 월평균 다음 달의 KPX 일간 누적평균(5일 이상) + 일간평균→공식치 편향 보정, 없으면 마지막 공식 월평균
//          연료비 모델: SMP = a + b·Brent(원화, 5개월 전) + c·JKM(원화, 2개월 전), 2015-01~ OLS
//          2023-01 이후 백테스트 평균 절대오차(원/kWh): v1 10.3/12.5/14.7/18.0/19.7 → v2 8.8/11.6/12.8/14.0/14.8 (1~5개월 앞)
// 판매단가 E = 전년 같은 달 × (1 + 최근 3개월 전년비 평균) + 요금 이벤트 조정(data/kepco-model.json)
//          동결기 백테스트 평균 절대오차 약 1.5원/kWh. 분기 평균은 판매량 가중(E 월 판매량 = 전년 같은 달 × 하우스 모델 분기 판매량 증가율)
const ym = d => d.slice(0, 7);
export const addM = (k, n) => { let [y, m] = k.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; };
import { seriesRows } from './store.mjs';
const latestSrc = (db, id) => seriesRows(db, id); // 출처 우선순위 규칙(store.seriesRows) 공유
const mavg = rows => { const g = {}; for (const r of rows) (g[ym(r.date)] ||= []).push(r.value); return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length])); };
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
function ols(X, y) { const k = X[0].length, M = Array.from({ length: k }, () => Array(k + 1).fill(0)); X.forEach((r, i) => { for (let a = 0; a < k; a++) { M[a][k] += r[a] * y[i]; for (let b = 0; b < k; b++) M[a][b] += r[a] * r[b]; } });
  for (let i = 0; i < k; i++) { let p = i; for (let j = i + 1; j < k; j++) if (Math.abs(M[j][i]) > Math.abs(M[p][i])) p = j; [M[i], M[p]] = [M[p], M[i]]; for (let j = 0; j < k; j++) if (j !== i) { const f = M[j][i] / M[i][i]; for (let c = i; c <= k; c++) M[j][c] -= f * M[i][c]; } } return M.map((r, i) => r[k] / r[i]); }
const r1 = v => Math.round(v * 10) / 10;
export const qOf = k => `${k.slice(0, 4)}Q${Math.floor((+k.slice(5) - 1) / 3) + 1}`;
const qMonths = q => { const y = q.slice(0, 4), s = (+q[5] - 1) * 3 + 1; return [0, 1, 2].map(i => `${y}-${String(s + i).padStart(2, '0')}`); };
const qPrev = (q, n) => { let y = +q.slice(0, 4), k = +q[5] - n; while (k < 1) { k += 4; y--; } return `${y}Q${k}`; };

export function buildKepcoForecast(db, { horizon = 5, fitFrom = '2015-01', seasonYears = 5, blend = 0.3, model = null } = {}) {
  const smp = Object.fromEntries(latestSrc(db, 'smp').map(r => [ym(r.date), r.value]));
  const tar = Object.fromEntries(latestSrc(db, 'tariff').map(r => [ym(r.date), r.value]));
  const vol = Object.fromEntries(latestSrc(db, 'consumption').map(r => [ym(r.date), r.value]));
  const smpMonths = Object.keys(smp).sort(), tarMonths = Object.keys(tar).sort();
  if (smpMonths.length < 36 || tarMonths.length < 15) return null;
  const brent = { ...mavg(latestSrc(db, 'brent_b1')), ...mavg(latestSrc(db, 'brent')) };
  const fx = mavg(latestSrc(db, 'usdkrw')), jkm = mavg(latestSrc(db, 'jkm_futures'));
  const lastKey = o => Object.keys(o).sort().at(-1);
  const fxAt = k => fx[k] ?? fx[lastKey(fx)], lastJkm = lastKey(jkm), lastBrent = lastKey(brent);
  const assumed = new Set();
  const feat = k => { const b = addM(k, -5), j = addM(k, -2); const jv = jkm[j] ?? (j > lastJkm ? (assumed.add(j), jkm[lastJkm]) : undefined); return [brent[b] * fxAt(b) / 1000, jv * fxAt(j <= lastJkm ? j : lastJkm) / 1000]; };
  const fitRows = smpMonths.filter(k => k >= fitFrom).map(k => ({ x: feat(k), y: smp[k] })).filter(r => r.x.every(Number.isFinite));
  assumed.clear();
  const coef = ols(fitRows.map(r => [1, ...r.x]), fitRows.map(r => r.y));
  const fm = k => { const x = feat(k); return coef[0] + coef[1] * x[0] + coef[2] * x[1]; };
  const seasonal = (a, h) => { const out = []; const am = a.slice(5); for (let y = +a.slice(0, 4) - seasonYears; y < +a.slice(0, 4); y++) { const a2 = `${y}-${am}`, t = addM(a2, h); if (smp[a2] && smp[t]) { const f = fm(t) / fm(a2); if (Number.isFinite(f) && f > 0) out.push(smp[t] / smp[a2] / f); } } return median(out); };
  const smpEst = (A, av, h) => { const t = addM(A, h); const e = av * seasonal(A, h) * (fm(t) / fm(A)); return (1 - blend) * e + blend * av; };
  // 앵커 + 일간평균 편향 보정
  const daily = latestSrc(db, 'smp_daily'); const byM = {}; for (const r of daily) (byM[ym(r.date)] ||= []).push(r.value);
  const biasArr = Object.entries(byM).filter(([m, v]) => smp[m] != null && v.length >= 25).map(([m, v]) => smp[m] - v.reduce((a, b) => a + b, 0) / v.length);
  const bias = biasArr.length ? biasArr.reduce((a, b) => a + b, 0) / biasArr.length : 0;
  const lastSmp = smpMonths.at(-1); let anchor = { month: lastSmp, value: smp[lastSmp], kind: '월평균' };
  const mtd = latestSrc(db, 'smp_mtd').at(-1);
  if (mtd && ym(mtd.date) > lastSmp) { const days = daily.filter(r => ym(r.date) === ym(mtd.date)); if (days.length >= 5) anchor = { month: ym(mtd.date), value: mtd.value + bias, raw: mtd.value, bias: r1(bias), kind: '당월 누적', days: days.length, from: days[0].date, to: days.at(-1).date, mae: days.length >= 20 ? 2.0 : days.length >= 15 ? 2.6 : days.length >= 10 ? 3.6 : 5.4 }; }
  const smpE = []; if (anchor.kind === '당월 누적') smpE.push({ month: anchor.month, value: r1(anchor.value), note: `${anchor.from.slice(5)}~${anchor.to.slice(5)} ${anchor.days}일 실측 평균 ${r1(anchor.raw)} + 편향 보정 ${r1(bias)}` });
  for (let h = 1; h <= horizon; h++) { const t = addM(anchor.month, h); if (addM(t, -5) > lastBrent) break; const v = smpEst(anchor.month, anchor.value, h); if (Number.isFinite(v)) smpE.push({ month: t, value: r1(v) }); }
  // 판매단가 E
  const lastTar = tarMonths.at(-1); const g = [0, 1, 2].map(i => addM(lastTar, -i)).map(k => tar[k] / tar[addM(k, -12)] - 1).filter(Number.isFinite); const growth = g.reduce((a, b) => a + b, 0) / g.length;
  const events = model?.tariffEvents || []; const evAt = k => events.filter(e => k >= e.from && k <= e.to).reduce((a, e) => a + (+e.change_won_kwh || 0), 0);
  const endE = smpE.at(-1)?.month || lastSmp; const tariffE = [];
  for (let k = addM(lastTar, 1); k <= endE; k = addM(k, 1)) { const base = tar[addM(k, -12)] ?? tariffE.find(e => e.month === addM(k, -12))?.value; if (base) tariffE.push({ month: k, value: r1(base * (1 + growth) + evAt(k)) }); }
  // 판매량(가중치): 실적, 없으면 전년 같은 달 × 모델 분기 판매량 증가율
  const mq = model?.quarters || {}; const volAt = k => { if (vol[k] != null) return { v: vol[k], e: false }; const ly = vol[addM(k, -12)]; if (ly == null) return null; const q = qOf(k), pq = qPrev(q, 4); const gr = mq[q]?.volume && mq[pq]?.volume ? mq[q].volume / mq[pq].volume : 1; return { v: ly * gr, e: true }; };
  const smpAt = k => smp[k] != null ? { v: smp[k], e: false } : (smpE.find(e => e.month === k) ? { v: smpE.find(e => e.month === k).value, e: true } : null);
  const tarAt = k => tar[k] != null ? { v: tar[k], e: false } : (tariffE.find(e => e.month === k) ? { v: tariffE.find(e => e.month === k).value, e: true } : null);
  const spreadE = []; for (let k = addM(lastTar, 1); k <= endE; k = addM(k, 1)) { const a = tarAt(k), b = smpAt(k); if (a && b) spreadE.push({ month: k, value: r1(a.v - b.v), tariff: a.e ? 'E' : '실적', smp: b.e ? 'E' : '실적' }); }
  // 분기: 판매량 가중 판매단가·SMP·스프레드, 마진 풀(조원), 하우스 모델 판매단가 대조
  const allQ = [...new Set([...tarMonths, ...tariffE.map(e => e.month)].map(qOf))].sort();
  const quarters = allQ.map(q => { const ms = qMonths(q); const parts = ms.map(m => ({ t: tarAt(m), s: smpAt(m), v: volAt(m) })); if (!parts.every(p => p.t && p.s && p.v)) return null; const V = parts.reduce((a, p) => a + p.v.v, 0);
    const tw = parts.reduce((a, p) => a + p.t.v * p.v.v, 0) / V, sw = parts.reduce((a, p) => a + p.s.v * p.v.v, 0) / V; const pool = parts.reduce((a, p) => a + (p.t.v - p.s.v) * p.v.v, 0) / 1e6;
    const mt = mq[q]?.tariff; return { q, value: r1(tw - sw), tariff: r1(tw), smp: r1(sw), volume: Math.round(V), pool: Math.round(pool * 100) / 100, estimated: parts.some(p => p.t.e || p.s.e || p.v.e), model: mt ? { tariff: mt, kind: mq[q].kind, gap: r1(tw - mt) } : null }; }).filter(Boolean).slice(-8);
  // 백테스트(2023-01 이후, 공식 월평균 앵커)
  const mae = {}; for (const h of [1, 2, 3, 4, 5]) { const errs = []; for (const A of smpMonths.filter(k => k >= '2023-01')) { const t = addM(A, h); if (smp[t] == null) continue; const e = smpEst(A, smp[A], h); if (Number.isFinite(e)) errs.push(Math.abs(e - smp[t])); } mae[h] = errs.length ? r1(errs.reduce((a, b) => a + b, 0) / errs.length) : null; }
  // ── v3: 판매단가 E 백테스트(2023-01~, 마지막 실적월 A 기준 h개월 뒤). 요금 인상 월이 포함돼 동결기보다 오차가 크다.
  const tarMae = {}; for (const h of [1, 2, 3, 4, 5, 6, 7, 8]) { const errs = []; for (const A of tarMonths.filter(k => k >= '2023-01')) { const t = addM(A, h); if (tar[t] == null || tar[addM(t, -12)] == null) continue; const gg = [0, 1, 2].map(i => addM(A, -i)).map(k => tar[k] / tar[addM(k, -12)] - 1).filter(Number.isFinite); if (!gg.length) continue; const gr = gg.reduce((a, b) => a + b, 0) / gg.length; errs.push(Math.abs(tar[addM(t, -12)] * (1 + gr) - tar[t])); } tarMae[h] = errs.length ? r1(errs.reduce((a, b) => a + b, 0) / errs.length) : null; }
  const hOf = (from, k) => { const [a, b] = [from, k].map(x => +x.slice(0, 4) * 12 + +x.slice(5)); return b - a; };
  const smpErr = k => k === anchor.month && anchor.kind === '당월 누적' ? anchor.mae : (mae[Math.min(5, Math.max(1, hOf(anchor.month, k)))] ?? 15);
  const tarErr = k => tarMae[Math.min(8, Math.max(1, hOf(lastTar, k)))] ?? 3;
  for (const e of smpE) { const d = smpErr(e.month); Object.assign(e, { lo: r1(e.value - d), hi: r1(e.value + d), err: r1(d) }); }
  for (const e of tariffE) { const d = tarErr(e.month); Object.assign(e, { lo: r1(e.value - d), hi: r1(e.value + d), err: r1(d) }); }
  for (const e of spreadE) { const d = Math.hypot(e.smp === 'E' ? smpErr(e.month) : 0, e.tariff === 'E' ? tarErr(e.month) : 0); Object.assign(e, { lo: r1(e.value - d), hi: r1(e.value + d), err: r1(d) }); }
  for (const q of quarters) { if (!q.estimated) continue; const ms = qMonths(q.q).map(m => ({ s: spreadE.find(x => x.month === m), v: volAt(m)?.v || 1 })); const V = ms.reduce((a, x) => a + x.v, 0); const d = ms.reduce((a, x) => a + (x.s?.err || 0) * x.v, 0) / V; Object.assign(q, { lo: r1(q.value - d), hi: r1(q.value + d), err: r1(d) }); }
  // ── v3.1 공시값 vs E 대조(사후 1개월 전 기준): 실적 월 k를 k-1까지의 정보로 다시 추정해 공시값과 비교
  const gAt = A => { const gg = [0, 1, 2].map(i => addM(A, -i)).map(k => tar[k] / tar[addM(k, -12)] - 1).filter(Number.isFinite); return gg.length ? gg.reduce((x, y) => x + y, 0) / gg.length : null; };
  const track = tarMonths.filter(k => smp[k] != null).slice(-6).map(k => { const A = addM(k, -1), g = gAt(A); const tH = tar[addM(k, -12)] != null && g != null ? r1(tar[addM(k, -12)] * (1 + g)) : null; const sH = smp[A] != null ? r1(smpEst(A, smp[A], 1)) : null;
    return { month: k, tariff: tar[k], tariffE: tH, smp: smp[k], smpE: sH, spread: r1(tar[k] - smp[k]), spreadE: tH != null && sH != null ? r1(tH - sH) : null }; });
  // SMP만 공시된 월(판매단가 미공시): SMP 공시 vs SMP E(1개월 전 기준)
  const smpOnly = smpMonths.filter(k => k > lastTar).map(k => ({ month: k, smp: smp[k], smpE: smp[addM(k, -1)] != null ? r1(smpEst(addM(k, -1), smp[addM(k, -1)], 1)) : null }));
  // 입력별 최신 관측·갱신 주기·다음 반영 예상(화면 표 '업데이트 주기')
  const lastOf = id => latestSrc(db, id).at(-1)?.date || null, nextMonth = (k, add) => addM(k, add);
  const updates = [
    { item: 'SMP 일간(육지 가중평균)', last: lastOf('smp_daily'), cadence: '매일 · KPX 하루전시장 결정가(익일분 전일 확정)', next: '매일', use: 'E 앵커: 당월 누적평균 + 편향 보정' },
    { item: 'SMP 월평균(공식)', last: lastSmp, cadence: '월 1회 · KPX 익월 1~3영업일 공표', next: `${nextMonth(lastSmp, 1)}분 → ${nextMonth(lastSmp, 2)} 초`, use: '실적선·연료비 모델 적합' },
    { item: '한전 평균 판매단가', last: lastTar, cadence: '월 1회 · 한전 전력통계속보(약 2.5~3개월 뒤) · BigFinance 수기 반영(로그인 필요)', next: `${nextMonth(lastTar, 1)}분 → 약 ${nextMonth(lastTar, 3)}~${nextMonth(lastTar, 4)}`, use: '실적선·판매단가 E 기준(전년 동월)' },
    { item: '판매전력량', last: Object.keys(vol).sort().at(-1) || null, cadence: '판매단가와 동일', next: '판매단가와 동일', use: '분기 판매량 가중치' },
    { item: 'Brent·JKM·원/달러', last: [lastOf('brent_b1'), lastOf('jkm_futures'), lastOf('usdkrw')].filter(Boolean).sort().at(-1), cadence: '매 거래일(평일 08:10 자동 수집)', next: '매일', use: 'SMP 연료비 모델(Brent 5개월·JKM 2개월 선행)' },
    { item: '요금 이벤트(연료비조정단가 등)', last: model?.tariffEvents?.length ? '~' + model.tariffEvents.at(-1).to + ' 반영' : null, cadence: '분기 · 한전 발표(분기 시작 전월 하순)', next: '다음 분기 발표 시 data/kepco-model.json 수정', use: '판매단가 E 가감' },
    { item: '하우스 모델(분기 판매량·판매단가)', last: model?.updated || null, cadence: '실적 리뷰 시', next: '분기 실적 후', use: '판매량 E·판매단가 대조' },
    { item: 'E 재계산', last: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()), cadence: '데이터 수집 때마다(평일 아침·화면 갱신 시)', next: '매일', use: '모든 E·범위' }];
  return { asOf: new Date().toISOString(), version: 3, anchor, smpE, tariffE, spreadE, quarters, updates, tariffMae: tarMae, track, smpOnly,
    model: { coef: coef.map(v => Math.round(v * 1000) / 1000), fitFrom, n: fitRows.length, seasonYears, blend, mae, tariffGrowth: Math.round(growth * 10000) / 100, tariffMaeFlat: 1.5, jkmAssumedFlat: [...assumed].sort(), house: model ? { source: model.source, updated: model.updated } : null },
    note: 'SMP E: 0.7×(앵커×5년 계절 비율×연료비 모델 변화율)+0.3×앵커, 앵커는 당월 일간 누적평균+편향 보정. 판매단가 E: 전년 같은 달×(1+최근 3개월 전년비)+요금 이벤트. 분기 값은 판매량 가중, 판매량 E는 하우스 모델 분기 증가율 적용. 범위 = 시차별 백테스트 평균 절대오차.' };
}
