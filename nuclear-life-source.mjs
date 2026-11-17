// 2026-11-17 원전 계속운전(수명연장) 심사 현황 — data/nuclear-life-ext.json(원안위·한수원 발표 때 갱신)
// ① 설계수명 만료 후 재가동 전까지의 정지 기간 중, 한수원 정비 공시(OH·불시정지)가 덮지 않는 구간 → '계속운전' 정지로 이용률 상한에 반영
// ② 일별 '계속운전 사유 정지 용량'(MW) 계열 ③ 화면용 현황표
import fs from 'node:fs/promises';
import path from 'node:path';
const DAY = 864e5, OPEN = '2099-12-31';
const d0 = s => Date.parse(s.slice(0, 10) + 'T00:00:00Z'), iso = t => new Date(t).toISOString().slice(0, 10);
const dd = (a, b) => Math.round((d0(b) - d0(a)) / DAY);
export const LIFE_STALE_DAYS = 120;
export async function readLifeExt(root) {
  const j = JSON.parse(await fs.readFile(path.join(root, 'data', 'nuclear-life-ext.json'), 'utf8'));
  for (const u of j.units) {
    for (const k of ['expiry', 'stop', 'approved', 'extendedTo', 'restart']) if (u[k] != null && !/^\d{4}-\d{2}-\d{2}$/.test(u[k])) throw Error(`계속운전 ${u.unit}: ${k} 날짜 형식 오류`);
    if (u.restart && (!u.stop || u.restart < u.stop)) throw Error(`계속운전 ${u.unit}: 재가동일이 정지일보다 빠름`);
    for (const s of u.src || []) if (!j.sources[s]) throw Error(`계속운전 ${u.unit}: 출처 키 없음 ${s}`);
  }
  return j;
}
// 정지 창 [stop, restart) 에서 한수원 OH·불시정지 구간을 뺀 나머지 → {unit,start,end,days,work}
export function lifeExtOutages(life, ohState) {
  const cover = u => [...(ohState?.events || []), ...(ohState?.unplanned || [])].filter(e => e.unit === u).map(e => [e.start, e.end]).sort((a, b) => a[0] < b[0] ? -1 : 1);
  const out = [];
  for (const u of life.units) {
    if (!u.stop) continue;
    let segs = [[u.stop, u.restart || OPEN]];
    const cv = cover(u.unit).filter(([a, b]) => b > u.stop && a < (u.restart || OPEN));
    for (const [a, b] of cv) segs = segs.flatMap(([s, e]) => b <= s || a >= e ? [[s, e]] : [...(a > s ? [[s, a]] : []), ...(b < e ? [[b, e]] : [])]);
    // 원안위 허가 호기: 한수원 설비개선 정비 종료일(게시 계획)을 재가동 예정으로 따름. 허가 전 호기: 재가동 입력 전까지 정지(보수적)
    const planEnd = cv.map(([, b]) => b).sort().at(-1);
    if (u.approved && !u.restart && planEnd) segs = segs.filter(([s]) => s < planEnd);
    for (const [s, e] of segs) if (dd(s, e) > 0) out.push({ unit: u.unit, no: '계속운전', start: s, end: e, days: e === OPEN ? null : dd(s, e), open: e === OPEN,
      work: `계속운전 심사·재가동 대기(설계수명 ${u.expiry} 만료)${u.approved ? ' · 원안위 허가 ' + u.approved : ''}` });
  }
  return out;
}
// 일별 계속운전 사유 정지 용량(MW): 설계수명 만료(정지) ~ 재가동 전 — 한수원 정비 공시 기간 포함 전체
export function deriveLifeDaily(life, asOf, from = '2023-01-01') {
  const out = [], src = '자체 산출 · 계속운전 심사 현황(원안위·한수원) 정지일~재가동일', url = 'https://www.nssc.go.kr';
  for (let t = d0(from); t <= d0(asOf); t += DAY) {
    const d = iso(t);
    const v = life.units.filter(u => u.stop && u.stop <= d && (!u.restart || d < u.restart)).reduce((s, u) => s + u.mw, 0);
    out.push({ id: 'nuclear_life_off_mw', date: d, value: v, source: src, url });
  }
  return out;
}
export function lifeSummary(life, asOf, ohUnits = []) {
  const st = Object.fromEntries(ohUnits.map(u => [u.unit, u]));
  const rows = life.units.map(u => {
    const k = st[u.unit];
    const stopped = !!(u.stop && u.stop <= asOf && (!u.restart || asOf < u.restart));
    return { ...u, srcs: (u.src || []).map(s => life.sources[s]), toExpiry: dd(asOf, u.expiry), stoppedDays: stopped ? dd(u.stop, asOf) : null, stopped,
      khnp: k ? { status: k.status, cur: k.cur ? { start: k.cur.start, end: k.cur.end, kind: k.cur.kind } : null } : null };
  }).sort((a, b) => a.expiry < b.expiry ? -1 : 1);
  const sum = f => rows.filter(f).reduce((s, r) => s + r.mw, 0);
  const age = dd(life.updatedAt, asOf);
  return { asOf, updatedAt: life.updatedAt, rows, checkAt: life.checkAt, note: life.note,
    stoppedMW: sum(r => r.stopped), approvedWaitingMW: sum(r => r.stopped && r.approved), reviewStoppedMW: sum(r => r.stopped && !r.approved),
    expiring24mMW: sum(r => !r.stop && r.toExpiry <= 730), stale: age > LIFE_STALE_DAYS, ageDays: age };
}
