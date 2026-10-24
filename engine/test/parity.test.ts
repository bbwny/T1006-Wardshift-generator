/**
 * Parity: engine.ts ต้องให้ผลเหมือน RNCore เดิมทุกประการ
 * ถ้าตั้งใจเปลี่ยนกฎ ให้แก้ทั้งสองฝั่ง หรือบันทึกเป็น "ความต่างที่ตั้งใจ" ใน README
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.ts';
import { Legacy, json, randomParams, rng, pick, nurses } from './helpers.ts';

const CASES = 300;

test('validate(): ผลตรงกับ engine เดิม (สุ่ม ' + CASES + ' กรณี)', () => {
  for (let s = 1; s <= CASES; s++) {
    const p = randomParams(s);
    assert.deepEqual(json(E.validate(p)), json(Legacy.validate(json(p))), 'seed ' + s);
  }
});

test('temporalIssues(): โย้หน้า/โย้หลัง, เปิด/ปิดเพดาน 7 วัน', () => {
  const r = rng(99), codes = ['OFF', 'ด', 'ช', 'บ', 'ด/บ', 'ช/บ', 'ช/ด', 'VA', null];
  for (let s = 0; s < 2000; s++) {
    const seq = Array.from({ length: 5 + Math.floor(r() * 20) }, () => pick(r, codes));
    const p = { nightMode: pick(r, ['back', 'front']), useRolling: r() < 0.5 } as E.Settings;
    assert.deepEqual(json(E.temporalIssues(seq as E.BoundaryCell[], p)), json(Legacy.temporalIssues(seq, p)));
  }
});

test('summary(), calendar(), holidays(), preflight(), matchTeam()', () => {
  for (let s = 1; s <= 100; s++) {
    const p = randomParams(1000 + s);
    for (const n of p.nurses) assert.deepEqual(json(E.summary(p.rows[n.id], p.base, 2, 120)), json(Legacy.summary(p.rows[n.id], p.base, 2, 120)));
    assert.deepEqual(json(E.preflight(p)), json(Legacy.preflight(json(p))), 'preflight seed ' + s);
    assert.deepEqual(json(E.matchTeam(p, p.nurses)), json(Legacy.matchTeam(json(p), json(p.nurses))));
  }
  assert.deepEqual(json(E.holidays()), json(Legacy.holidays()));
  for (const [y, m] of [[2026, 1], [2026, 10], [2027, 2], [2027, 12]]) assert.deepEqual(json(E.calendar(y, m, E.holidays(), { [E.key(y, m, 5)]: false })), json(Legacy.calendar(y, m, Legacy.holidays(), { [E.key(y, m, 5)]: false })));
});

test('generate(): seed เดียวกันได้ตารางเดียวกัน (กรณีเล็ก ไม่ชนเวลาค้นหา)', () => {
  for (const nightMode of ['back', 'front'] as const) {
    const ns = nurses(6);
    const p: E.RosterParams = { nurses: ns, D: 30, base: 0, rows: {}, requests: {}, prior: {}, next: {}, locks: {}, nightMode, useStroke: false, demand: { 'ช': 1, 'บ': 1, 'ด': 1 }, seed: 42, budget: 20000 };
    const a = E.generate(p), b = Legacy.generate(json(p));
    assert.equal(a.ok, true); assert.equal(b.ok, true);
    assert.deepEqual(json(a.rows), json(b.rows), nightMode);
  }
});
