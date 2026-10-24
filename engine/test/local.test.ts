/** ตัวจัดเวรแบบ local search: วอร์ดขนาดจริงต้องได้ตารางที่ผ่าน validate ครบ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.ts';

const mk = (n: number): E.Nurse[] => Array.from({ length: n }, (_, i) => ({ id: 'rn' + (i + 1), name: 'RN ' + (i + 1), stroke: i % 3 === 0, level: i % 4 === 0 ? 'senior' : 'rn', mentor: false, active: true }));
const base = (n: number, dem: [number, number, number]): E.RosterParams => ({ nurses: mk(n), D: 31, base: 21, rows: {}, requests: {}, prior: {}, next: {}, locks: {}, useStroke: false, demand: { 'ช': dem[0], 'บ': dem[1], 'ด': dem[2] }, seed: 3 });
const units = (p: E.RosterParams, rows: Record<string, E.Cell[]>) => p.nurses.map(n => E.summary(rows[n.id], p.base).units);

test('12 RN 3/3/3 (ตัวเดิมหาไม่ทัน) → ผ่าน และภาระงานต่างกันไม่เกิน 3 เวร', () => {
  const p = base(12, [3, 3, 3]), r = E.generate(p);
  assert.equal(r.ok, true, (r.reasons || []).join(' | '));
  assert.equal(E.validate({ ...p, rows: r.rows! }).valid, true);
  const u = units(p, r.rows!); assert.ok(Math.max(...u) - Math.min(...u) <= 3, u.join(','));
});

test('20 RN โย้หน้า + Stroke + Senior + VA + ช่องล็อก', () => {
  const p = base(20, [5, 5, 4]);
  Object.assign(p, { nightMode: 'front', useStroke: true, skill: { 'ช': 1, 'บ': 1, 'ด': 1 }, useSenior: true, seniorNeed: { 'ช': 1, 'บ': 1, 'ด': 1 } });
  p.requests = { rn2: { 9: { type: 'VA', status: 'approved', work: true }, 10: { type: 'VA', status: 'approved', work: true } } };
  p.locks = { rn3: { 0: 'ช', 1: 'OFF' } };
  const r = E.generate(p);
  assert.equal(r.ok, true, (r.reasons || []).join(' | '));
  assert.equal(E.validate({ ...p, rows: r.rows! }).valid, true);
  assert.deepEqual([r.rows!.rn2[9], r.rows!.rn2[10], r.rows!.rn3[0], r.rows!.rn3[1]], ['VA', 'VA', 'ช', 'OFF']);
});

test('เวรรอยต่อเดือน: คนที่จบเดือนก่อนด้วย บ ไม่ได้ ด วันที่ 1 (โย้หลัง)', () => {
  const p = base(14, [4, 3, 3]);
  for (const id of ['rn1', 'rn2', 'rn3', 'rn4']) p.prior[id] = ['OFF', 'ช', 'ช', 'OFF', 'บ', 'บ'];
  const r = E.generate(p);
  assert.equal(r.ok, true, (r.reasons || []).join(' | '));
  for (const id of ['rn1', 'rn2', 'rn3', 'rn4']) { assert.ok(!(E.MASK[r.rows![id][0]] & 1), id + ' ได้ ' + r.rows![id][0]); assert.ok(!(E.MASK[r.rows![id][0]] & 4), id + ' บ 3 วันติด'); }
});

test('หน้า 2: พยายามให้ทุกคนได้ OFF ต่อเนื่อง ≥ 3 วัน', () => {
  const p = { ...base(18, [5, 4, 4]), version: 2 as const, blockLength: 4 as const };
  const r = E.generate(p);
  assert.equal(r.ok, true);
  assert.ok(r.report!.filter(x => x.found).length >= 16, JSON.stringify(r.report));
});

test('Novice + พี่เลี้ยงอัตโนมัติ: Novice ทุกเวรมีพี่เลี้ยงร่วมเวร', () => {
  const p = base(16, [3, 3, 3]); p.base = 0;
  Object.assign(p, { useNovice: true, noviceNeed: { 'ช': 1, 'บ': 1, 'ด': 0 }, mentorMode: 'auto', mentorCapacity: 1 });
  p.nurses.forEach((n, i) => { if (i >= 12) { n.level = 'novice'; } else if (i % 2 === 0) n.mentor = true; });
  const r = E.generate(p);
  assert.equal(r.ok, true, (r.reasons || []).join(' | '));
  const v = E.validate({ ...p, rows: r.rows! });
  assert.equal(v.issues.filter(x => x.type === 'mentor').length, 0);
});
