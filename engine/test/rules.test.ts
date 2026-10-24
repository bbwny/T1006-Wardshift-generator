/** กฎสำคัญเขียนเป็นตัวอย่างอ่านง่าย — ใช้เป็นเอกสารพฤติกรรมด้วย */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.ts';
import { nurses } from './helpers.ts';

const types = (seq: E.BoundaryCell[], s: E.Settings) => E.temporalIssues(seq, s).map(x => x.type);

test('โย้หลัง: บ วันที่ 1 ต่อ ด วันที่ 2 = ผิด (บ่ายต่อดึก)', () => {
  assert.deepEqual(types(['บ', 'ด'], { nightMode: 'back' }), ['transition']);
  assert.deepEqual(types(['ด', 'บ'], { nightMode: 'back' }), []);
});
test('โย้หลัง: ช/ด ในช่องเดียว = ดึกต่อเช้า ผิด · ด/บ ทำได้', () => {
  assert.deepEqual(types(['ช/ด'], { nightMode: 'back' }), ['pair']);
  assert.deepEqual(types(['ด/บ'], { nightMode: 'back' }), []);
  assert.ok(!E.allowedMasks({ nightMode: 'back' }).includes(3));
});
test('โย้หน้า: ด ช่องวันที่ 1 ทำงานเช้าวันที่ 2 จึงห้าม ช วันที่ 2 และห้าม บ+ด ช่องเดียวกัน', () => {
  assert.deepEqual(types(['ด', 'ช'], { nightMode: 'front' }), ['pair']);
  assert.deepEqual(types(['ด/บ'], { nightMode: 'front' }), ['transition']);
  assert.deepEqual(types(['ช/ด'], { nightMode: 'front' }), []);
  assert.deepEqual(E.activeCodes({ nightMode: 'front' }), ['OFF', 'ด', 'ช', 'ช/ด', 'บ', 'ช/บ', 'VA']);
});
test('เวรชนิดเดิมติดกันได้ไม่เกิน 2 วัน', () => {
  assert.deepEqual(types(['ช', 'ช'], {}), []);
  assert.deepEqual(types(['ช', 'ช/บ', 'ช'], {}), ['repeat']);
});
test('เพดาน 8 เวรใน 7 วัน เปิด/ปิดได้', () => {
  const seq: E.BoundaryCell[] = ['ช/บ', 'ช', 'บ', 'ด', 'ช/บ', 'ช', 'บ'];
  assert.ok(types(seq, { useRolling: true }).includes('rolling'));
  assert.ok(!types(seq, { useRolling: false }).includes('rolling'));
});
test('generate(): ได้ตารางที่ผ่าน validate ครบ (9 คน 2/2/2)', () => {
  const p: E.RosterParams = { nurses: nurses(9), D: 31, base: 18, rows: {}, requests: { rn1: { 4: { type: 'VA', status: 'approved', work: true } } }, prior: {}, next: {}, locks: { rn2: { 0: 'OFF' } }, useStroke: false, demand: { 'ช': 2, 'บ': 2, 'ด': 2 }, seed: 7, budget: 8000 };
  const r = E.generate(p);
  assert.equal(r.ok, true, (r.reasons || []).join(' | '));
  const v = E.validate({ ...p, rows: r.rows! });
  assert.equal(v.valid, true, v.issues.slice(0, 3).map(x => x.message).join(' | '));
  assert.equal(r.rows!.rn1[4], 'VA');
  assert.equal(r.rows!.rn2[0], 'OFF');
});
test('preflight(): กำลังคนไม่พอตามเพดานถูกแจ้งก่อนค้นหา', () => {
  const p: E.RosterParams = { nurses: nurses(5), D: 30, base: 20, rows: {}, requests: {}, prior: {}, next: {}, locks: {}, useStroke: false };
  assert.match(E.preflight(p)[0], /กำลังคนไม่พอตามเพดาน/);
});
test('capacityCheck(): เกณฑ์ขั้นต่ำรวมเกินเวรทั้งเดือน → แจ้งพร้อมวิธีแก้ ไม่ค้นหาให้เสียเวลา', () => {
  const p: E.RosterParams = { nurses: nurses(15), D: 31, base: 21, rows: {}, requests: {}, prior: {}, next: {}, locks: {}, useStroke: false, demand: { 'ช': 3, 'บ': 3, 'ด': 3 } };
  const msg = E.capacityCheck(p);
  assert.match(msg[0], /315 เวร.*279 เวร.*11 คน\/วัน/);
  const r = E.generate(p); assert.equal(r.ok, false); assert.equal(r.needsConfirmation, true);
  assert.deepEqual(E.capacityCheck({ ...p, demand: { 'ช': 4, 'บ': 4, 'ด': 3 } }), []);
});
