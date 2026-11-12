// 2026-11-12 지역난방공사 열병합 O/H(정기점검 보수공사) 일정 → 일별 정지 용량·분기 MW·일·현황
// 원천: 회사 분기 실적발표 O/H 표(data/kdhc-oh.json, 분기마다 갱신). 일수는 시작·종료일 포함.
import fs from 'node:fs/promises';
import path from 'node:path';
const DAY = 864e5;
const d0 = s => Date.parse(s.slice(0, 10) + 'T00:00:00Z');
const iso = t => new Date(t).toISOString().slice(0, 10);
const days = (a, b) => Math.round((d0(b) - d0(a)) / DAY) + 1;
export const KDHC_OH_STALE_DAYS = 100; // 분기 실적발표 주기(약 92일) + 여유
export async function readKdhcOh(root) {
  const j = JSON.parse(await fs.readFile(path.join(root, 'data', 'kdhc-oh.json'), 'utf8'));
  const mw = Object.fromEntries(j.plants.map(p => [p.plant, p.mw]));
  for (const e of j.events) {
    if (!(e.plant in mw)) throw Error('KDHC O/H: 설비용량 없는 발전소 ' + e.plant);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.start) || !/^\d{4}-\d{2}-\d{2}$/.test(e.end) || e.end < e.start) throw Error('KDHC O/H: 날짜 오류 ' + e.plant + ' ' + e.start + '~' + e.end);
    if (!j.sources[e.src]) throw Error('KDHC O/H: 출처 키 없음 ' + e.src);
  }
  return j;
}
// 일별 정지 용량(MW): 2025-01-01부터 asOf까지 매일 1행(0 포함) — 일정이 바뀌면 같은 날짜 행을 덮어써 잔여 행이 남지 않음
export function deriveKdhcOhDaily(state, asOf, from = '2025-01-01') {
  const mw = Object.fromEntries(state.plants.map(p => [p.plant, p.mw]));
  const src = '지역난방공사 IR · O/H 일정 기반 일별 정지 용량', url = state.sources.IR3Q26?.url || Object.values(state.sources)[0].url;
  const out = [];
  for (let t = d0(from); t <= d0(asOf); t += DAY) {
    const d = iso(t); let v = 0;
    for (const e of state.events) if (e.start <= d && d <= e.end) v += mw[e.plant];
    out.push({ id: 'kdhc_oh_mw', date: d, value: v, source: src, url });
  }
  return out;
}
const qOf = d => `${d.slice(0, 4)}Q${Math.floor((+d.slice(5, 7) - 1) / 3) + 1}`;
export function kdhcOhSummary(state, asOf) {
  const mw = Object.fromEntries(state.plants.map(p => [p.plant, p.mw]));
  const fleet = state.plants.reduce((s, p) => s + p.mw, 0);
  const events = state.events.map(e => ({ ...e, mw: mw[e.plant], days: days(e.start, e.end), srcTitle: state.sources[e.src].title, srcDate: state.sources[e.src].date,
    status: e.end < asOf ? '완료' : e.start > asOf ? '예정' : '진행 중' })).sort((a, b) => a.start < b.start ? -1 : 1);
  // 분기별 MW·일, 정비 일수(설비·블록 합), 평균 정지 용량 비율
  const q = {};
  for (const e of events) for (let t = d0(e.start); t <= d0(e.end); t += DAY) { const k = qOf(iso(t)); (q[k] ??= { mwd: 0, days: 0 }); q[k].mwd += e.mw; q[k].days += 1; }
  const years = [...new Set(events.map(e => +e.start.slice(0, 4)))].sort();
  const quarters = years.flatMap(y => [1, 2, 3, 4].map(n => { const k = `${y}Q${n}`, len = days(`${y}-${String(n * 3 - 2).padStart(2, '0')}-01`, iso(Date.UTC(y, n * 3, 0))); const v = q[k] || { mwd: 0, days: 0 }; return { q: k, mwd: v.mwd, days: v.days, avgMw: v.mwd / len, pct: v.mwd / len / fleet * 100 }; }));
  const plants = state.plants.map(p => {
    const es = events.filter(e => e.plant === p.plant);
    const cur = es.find(e => e.status === '진행 중'), next = es.find(e => e.status === '예정'), last = [...es].reverse().find(e => e.status === '완료');
    return { plant: p.plant, mw: p.mw, status: cur ? '정비 중' : '운전', cur, next, last, remain: cur ? days(asOf, cur.end) - 1 : null, toNext: next ? days(asOf, next.start) - 1 : null };
  });
  const lastSrc = Object.values(state.sources).map(s => s.date).sort().at(-1);
  const age = Math.round((d0(asOf) - d0(lastSrc)) / DAY);
  const offNow = events.filter(e => e.status === '진행 중').reduce((s, e) => s + e.mw, 0);
  return { asOf, updatedAt: state.updatedAt, fleet, offNow, plants, events, quarters, sources: state.sources, lastSource: lastSrc, sourceAgeDays: age,
    stale: age > KDHC_OH_STALE_DAYS, nextSourceDue: iso(d0(lastSrc) + 92 * DAY), capacityUrl: state.capacityUrl, note: state.note };
}
