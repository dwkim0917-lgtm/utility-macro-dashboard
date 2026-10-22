// 원전 계획예방정비(OH) — 한수원 열린원전운영정보(npp.khnp.co.kr) 본부별 페이지 수집, 변경 이력 누적, 월별 이용률 상한 산출.
// 한수원 페이지는 호기당 최근/차기 1건만 보여주므로, 한 번 본 회차는 data/khnp-oh.json에 계속 보관한다.
import fs from 'node:fs/promises';
import path from 'node:path';

export const OH_URL = 'https://npp.khnp.co.kr/ON004004002005';
export const OH_HQ = {'001':'고리','002':'한빛','003':'월성','004':'한울','005':'새울'};
// 설비용량(MW, 명판). from = 상업운전·재가동 시작 월(그 전 달은 설비에서 제외). 새울3(시운전)은 상업운전 후 추가.
export const OH_UNITS = {
 '고리2':{mw:650,hq:'고리',from:'2026-04'},'고리3':{mw:950,hq:'고리'},'고리4':{mw:950,hq:'고리'},'신고리1':{mw:1000,hq:'고리'},'신고리2':{mw:1000,hq:'고리'},
 '한빛1':{mw:950,hq:'한빛'},'한빛2':{mw:950,hq:'한빛'},'한빛3':{mw:1000,hq:'한빛'},'한빛4':{mw:1000,hq:'한빛'},'한빛5':{mw:1000,hq:'한빛'},'한빛6':{mw:1000,hq:'한빛'},
 '월성2':{mw:700,hq:'월성'},'월성3':{mw:700,hq:'월성'},'월성4':{mw:700,hq:'월성'},'신월성1':{mw:1000,hq:'월성'},'신월성2':{mw:1000,hq:'월성'},
 '한울1':{mw:950,hq:'한울'},'한울2':{mw:950,hq:'한울'},'한울3':{mw:1000,hq:'한울'},'한울4':{mw:1000,hq:'한울'},'한울5':{mw:1000,hq:'한울'},'한울6':{mw:1000,hq:'한울'},
 '신한울1':{mw:1400,hq:'한울'},'신한울2':{mw:1400,hq:'한울'},'새울1':{mw:1400,hq:'새울'},'새울2':{mw:1400,hq:'새울'}};
// 장기 정비(계속운전 설비개선 등) — 표시용 성격 구분
export const OH_LONG = {'고리3':'계속운전 설비개선','고리4':'계속운전 설비개선','한빛1':'계속운전 설비개선','한빛2':'계속운전 설비개선','월성2':'설비 개선 장기화','월성4':'설비 개선 장기화'};
// 차기 회차 미공시 호기 가정: 직전 OH 종료 + 16개월(연료주기 18개월 − OH 약 2개월)에 50일
export const OH_EST = {gapMonths:16, days:50};

const iso = d => d.toISOString().slice(0, 10);
const D = s => new Date(s + 'T00:00:00Z');
const addDays = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
const days = (a, b) => Math.round((D(b) - D(a)) / 864e5);
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export function parseOhPage(html, hqCode) {
  const out = [];
  for (const t of html.split('<table').slice(1)) {
    if (!/계획예방정비 표/.test(t)) continue;
    const body = t.split('<tbody')[1]; if (!body) continue;
    for (const tr of body.split('<tr').slice(1)) {
      const td = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
      if (td.length < 4) continue;
      const unit = strip(td[0]).replace(/호기$/, '');
      const m = strip(td[1]).match(/(\d{4})\.(\d{1,2})\.(\d{1,2})\.?\s*~\s*(\d{4})\.(\d{1,2})\.(\d{1,2})/);
      if (!m) continue;
      const p = (y, mo, d) => `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
      const work = [...(td[4] || '').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(x => strip(x[1])).filter(Boolean);
      out.push({unit, hq: OH_HQ[hqCode] || '', no: strip(td[2]), start: p(m[1], m[2], m[3]), end: p(m[4], m[5], m[6]), days: Number(strip(td[3])) || null, work: work.join(' / ') || strip(td[4] || '')});
    }
  }
  return out;
}

export async function fetchOhPages() {
  const all = [];
  for (const code of Object.keys(OH_HQ)) {
    const r = await fetch(OH_URL + code, {signal: AbortSignal.timeout(25000), headers: {'User-Agent': 'Mozilla/5.0 (UtilityMacro)'}});
    if (!r.ok) throw Error(`한수원 ${OH_HQ[code]} HTTP ${r.status}`);
    const rows = parseOhPage(await r.text(), code);
    if (!rows.length) throw Error(`한수원 ${OH_HQ[code]} 정비표 형식 변경`);
    all.push(...rows);
  }
  if (all.length < 20) throw Error('한수원 정비표 호기 수 부족: ' + all.length);
  return all;
}

const statePath = root => path.join(root, 'data', 'khnp-oh.json');
export async function readOhState(root) { try { return JSON.parse(await fs.readFile(statePath(root), 'utf8')); } catch { return {events: [], changes: [], unplanned: []}; } }

// 같은 호기·차수면 같은 회차. 일정이 바뀌면 changes에 남기고 갱신, 새 회차는 추가. 이미 본 회차는 지우지 않는다.
export function mergeOh(state, posted, asOf) {
  const s = {...state, events: [...(state.events || [])], changes: [...(state.changes || [])]};
  for (const p of posted) {
    const i = s.events.findIndex(e => e.unit === p.unit && e.no === p.no);
    if (i < 0) { s.events.push({...p, firstSeen: asOf, lastSeen: asOf, src: '한수원 열린원전운영정보'}); if ((state.events || []).some(e => e.unit === p.unit)) s.changes.push({date: asOf, unit: p.unit, no: p.no, what: '신규 회차 게시', to: `${p.start}~${p.end}`}); continue; }
    const e = s.events[i];
    if (e.start !== p.start || e.end !== p.end) {
      const ds = days(e.start, p.start), de = days(e.end, p.end);
      s.changes.push({date: asOf, unit: p.unit, no: p.no, what: `시작 ${ds >= 0 ? '+' : ''}${ds}일 · 종료 ${de >= 0 ? '+' : ''}${de}일`, from: `${e.start}~${e.end}`, to: `${p.start}~${p.end}`});
    }
    s.events[i] = {...e, ...p, lastSeen: asOf};
  }
  s.events.sort((a, b) => a.unit.localeCompare(b.unit) || a.start.localeCompare(b.start));
  s.updatedAt = asOf;
  return s;
}

export async function refreshOh(root, asOf) {
  const posted = await fetchOhPages();
  const next = mergeOh(await readOhState(root), posted, asOf);
  await fs.writeFile(statePath(root), JSON.stringify(next, null, 1));
  return next;
}

// 정지 이벤트 = 공시 OH + 불시정지(수기) + 미공시 차기 OH 추정
export function ohEvents(state, asOf, horizonEnd) {
  const ev = [...(state.events || []).map(e => ({...e, kind: 'OH'})), ...(state.unplanned || []).map(e => ({...e, kind: '불시정지'}))].filter(e => OH_UNITS[e.unit]);
  const est = [];
  for (const u of Object.keys(OH_UNITS)) {
    let last = ev.filter(e => e.unit === u && e.kind === 'OH').map(e => e.end).sort().at(-1);
    if (!last) continue;
    for (let k = 0; k < 3; k++) {
      const d = D(last); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() + OH_EST.gapMonths);
      let start = iso(d); if (start < asOf) start = addDays(asOf, 30);
      if (start > horizonEnd) break;
      const end = addDays(start, OH_EST.days);
      est.push({unit: u, no: '(추정)', start, end, days: OH_EST.days, kind: '추정', work: `차기 OH 미공시 — 직전 종료 + ${OH_EST.gapMonths}개월, ${OH_EST.days}일 가정`});
      last = end;
    }
  }
  return [...ev, ...est];
}

const monthKeys = (from, to) => { const out = []; let [y, m] = from.split('-').map(Number); for (;;) { const k = `${y}-${String(m).padStart(2, '0')}`; if (k > to) break; out.push(k); if (++m > 12) { m = 1; y++; } } return out; };
const mNext = k => { let [y, m] = k.split('-').map(Number); if (++m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, '0')}`; };
const overlap = (e, a, b) => Math.max(0, days(e.start > a ? e.start : a, e.end < b ? e.end : b));

// 월별 이용률 상한(명판 기준) = 1 − 정지 MW·일 ÷ (가동 설비 MW × 일수)
export function ohCeiling(state, asOf, {from = '2025-07', ahead = 15} = {}) {
  const to = (() => { let k = asOf.slice(0, 7); for (let i = 0; i < ahead; i++) k = mNext(k); return k; })();
  const ev = ohEvents(state, asOf, to + '-28');
  const rows = [];
  for (const k of monthKeys(from, to)) {
    const a = k + '-01', b = mNext(k) + '-01', nd = days(a, b);
    const live = Object.entries(OH_UNITS).filter(([, u]) => !u.from || u.from <= k);
    const cap = live.reduce((s, [, u]) => s + u.mw, 0);
    const off = {OH: 0, '불시정지': 0, '추정': 0};
    for (const e of ev) if (live.some(([n]) => n === e.unit)) off[e.kind] += OH_UNITS[e.unit].mw * overlap(e, a, b);
    const tot = off.OH + off['불시정지'] + off['추정'];
    rows.push({month: k, capMW: cap, offMWd: Math.round(tot), ohMWd: Math.round(off.OH), unplannedMWd: Math.round(off['불시정지']), estMWd: Math.round(off['추정']), value: Math.round((1 - tot / (cap * nd)) * 1000) / 10});
  }
  return rows;
}

// 일별 정비·정지 용량(GW) — 과거·오늘까지만 관측치로 저장
export function deriveOhDaily(state, asOf, from = '2026-01-01') {
  const ev = ohEvents(state, asOf, asOf).filter(e => e.kind !== '추정');
  const out = [];
  for (let d = from; d <= asOf; d = addDays(d, 1)) {
    const mw = ev.filter(e => e.start <= d && d < e.end && (!OH_UNITS[e.unit].from || OH_UNITS[e.unit].from <= d.slice(0, 7))).reduce((s, e) => s + OH_UNITS[e.unit].mw, 0);
    out.push({id: 'nuclear_oh_gw', date: d, value: Math.round(mw / 10) / 100, source: '자체 산출 · 한수원 계획예방정비 공시(정비+불시정지)', url: OH_URL + '001'});
  }
  return out;
}

// 화면용 요약: 호기별 현재/차기 회차, 최근 변경, 향후 이벤트
export function ohSummary(state, asOf) {
  const horizon = addDays(asOf, 400);
  const ev = ohEvents(state, asOf, horizon);
  const units = Object.entries(OH_UNITS).map(([u, info]) => {
    const mine = ev.filter(e => e.unit === u).sort((a, b) => a.start.localeCompare(b.start));
    const cur = mine.find(e => e.start <= asOf && asOf < e.end);
    const next = mine.find(e => e.start > asOf);
    const lastDone = mine.filter(e => e.end <= asOf && e.kind !== '추정').at(-1);
    const status = cur ? (cur.kind === '불시정지' ? '불시정지' : '정비중') : (info.from && info.from > asOf.slice(0, 7) ? '재가동 전' : '운전');
    return {unit: u, hq: info.hq, mw: info.mw, status, long: OH_LONG[u] || '', cur: cur || null, next: next || null, lastDone: lastDone || null,
      remain: cur ? days(asOf, cur.end) : null, toNext: next ? days(asOf, next.start) : null};
  });
  const upcoming = [];
  for (const e of ev) {
    if (e.start >= asOf && e.start <= addDays(asOf, 120)) upcoming.push({date: e.start, what: e.kind === '추정' ? '착수(추정)' : '정비 착수', unit: e.unit, mw: OH_UNITS[e.unit].mw, days: e.days, kind: e.kind});
    if (e.end >= asOf && e.end <= addDays(asOf, 120) && e.kind !== '추정') upcoming.push({date: e.end, what: '발전 재개(예정)', unit: e.unit, mw: OH_UNITS[e.unit].mw, days: e.days, kind: e.kind});
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  const offNow = units.filter(u => u.cur).reduce((s, u) => s + u.mw, 0);
  const capNow = Object.values(OH_UNITS).filter(u => !u.from || u.from <= asOf.slice(0, 7)).reduce((s, u) => s + u.mw, 0);
  return {asOf, updatedAt: state.updatedAt || null, units, upcoming, changes: (state.changes || []).slice(-15).reverse(), events: ev.filter(e => e.end >= addDays(asOf, -120)),
    offNowMW: offNow, capNowMW: capNow, est: OH_EST, source: OH_URL + '001~005'};
}
