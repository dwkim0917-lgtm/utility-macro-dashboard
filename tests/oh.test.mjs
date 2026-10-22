import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOhPage,mergeOh,ohCeiling} from '../oh-source.mjs';

const page = `<table><caption><strong>고리2호기 계획예방정비 표</strong></caption><tbody><tr><td>고리2호기</td><td>2027.05.22. ~ 2027.08.31.</td><td>33</td><td>101.3</td><td class="tal"><ul><li> 원자로내부육안검사 </li><li> 저압터빈 분해점검 </li></ul></td></tr></tbody></table>
<table><caption><strong>한빛6호기 계획예방정비 표</strong></caption><tbody><tr><td>한빛6호기</td><td colspan="4">계획된 계획예방정비 일정이 없습니다.</td></tr></tbody></table>`;

test('KHNP OH page: parses period/round/days/work, skips "no schedule" rows', () => {
  const r = parseOhPage(page, '001');
  assert.equal(r.length, 1);
  assert.deepEqual({unit: r[0].unit, hq: r[0].hq, no: r[0].no, start: r[0].start, end: r[0].end, days: r[0].days}, {unit: '고리2', hq: '고리', no: '33', start: '2027-05-22', end: '2027-08-31', days: 101.3});
  assert.match(r[0].work, /저압터빈/);
});

test('OH merge keeps history, logs schedule changes; ceiling counts outage MW-days', () => {
  const s0 = {events: [{unit: '한울1', no: '27', start: '2026-10-20', end: '2026-12-19'}], changes: []};
  const s1 = mergeOh(s0, [{unit: '한울1', no: '27', start: '2026-10-20', end: '2026-12-18'}, {unit: '한울2', no: '27', start: '2027-10-06', end: '2028-01-11'}], '2026-10-22');
  assert.equal(s1.events.length, 2);
  assert.equal(s1.changes.length, 1);
  assert.match(s1.changes[0].what, /종료 -1일/);
  const c = ohCeiling({events: [{unit: '신한울1', no: '1', start: '2026-11-01', end: '2026-12-01'}]}, '2026-10-22', {from: '2026-11', ahead: 1});
  const nov = c.find(r => r.month === '2026-11');
  assert.equal(nov.ohMWd, 1400 * 30);
  assert.ok(Math.abs(nov.value - (1 - 1400 / 26050) * 100) < 0.11);
});
