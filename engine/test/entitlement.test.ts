import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.ts';

const DAY = 86_400_000, T0 = Date.UTC(2026, 9, 24, 5);
const code = (fn: () => unknown) => { try { fn(); return 'OK'; } catch (e) { return (e as E.EntitlementError).code; } };

test('ทดลองฟรี: ผู้ใช้อีเมลต้องยืนยันเบอร์ · Google ใช้ได้ทันที · ใช้ได้ครั้งเดียว', () => {
  const email = E.newAccount('a1', 'Head@Ward.th', 'email');
  assert.equal(email.email, 'head@ward.th');
  assert.equal(code(() => E.activateMonth(email, '2026-11', T0)), 'PHONE_REQUIRED');
  assert.equal(code(() => E.activateMonth({ ...email, phoneVerified: true }, '2026-11', T0, { phoneAlreadyUsedForTrial: true })), 'PHONE_USED');
  const g = E.activateMonth(E.newAccount('a2', 'g@gmail.com', 'google'), '2026-11', T0);
  assert.equal(g.source, 'trial');
  assert.equal(g.account.months['2026-11'].exportLimit, 3);
  assert.equal(code(() => E.activateMonth(g.account, '2026-12', T0)), 'NO_CREDIT');
});

test('ส่งออกช่วงทดลองได้ 3 ครั้ง แล้วต้องซื้อ', () => {
  let a = E.activateMonth(E.newAccount('a', 'g@gmail.com', 'google'), '2026-11', T0).account;
  for (let i = 0; i < 3; i++) { const r = E.authorizeExport(a, '2026-11', 'C7', T0 + i); a = r.account; assert.equal(r.remaining, 2 - i); }
  assert.equal(code(() => E.authorizeExport(a, '2026-11', 'C7', T0)), 'TRIAL_EXPORT_LIMIT');
});

test('แก้ไข/ส่งออกได้ 7 วัน · ดูได้ถึงวันที่ 30 · ลบวันที่ 31 (+ เตือนล่วงหน้า 3 วัน)', () => {
  let a = E.applyPurchase(E.newAccount('a', 'x@y.z', 'email'), 'credit1', T0);
  a = E.activateMonth({ ...a, trialUsed: true }, '2026-11', T0).account;
  assert.equal(a.credits, 0);
  assert.equal(E.canEdit(a, '2026-11', T0 + 7 * DAY - 1), true);
  assert.equal(E.canEdit(a, '2026-11', T0 + 7 * DAY), false);
  assert.equal(code(() => E.authorizeExport(a, '2026-11', 'C7', T0 + 8 * DAY)), 'EDIT_EXPIRED');
  assert.equal(E.canView(a, '2026-11', T0 + 29 * DAY), true);
  assert.deepEqual(E.purgeDue(a, T0 + 28 * DAY).warn, ['2026-11']);
  const p = E.purgeDue(a, T0 + 30 * DAY);
  assert.deepEqual(p.purge, ['2026-11']);
  assert.equal(p.wipeAll, true);
  assert.equal(E.canView(p.account, '2026-11', T0 + 30 * DAY), false);
});

test('เดือนเดียวกัน วอร์ดอื่น ต้องใช้ 1 สิทธิ์ (ชื่อวอร์ดเทียบแบบไม่สนช่องว่าง/ตัวพิมพ์)', () => {
  let a = E.applyPurchase(E.newAccount('a', 'x@y.z', 'google'), 'credit3', T0);
  a = { ...a, trialUsed: true };
  a = E.activateMonth(a, '2026-11', T0).account;               // เหลือ 2
  a = E.authorizeExport(a, '2026-11', 'C7  หน้า', T0).account;  // ผูก C7 หน้า
  a = E.authorizeExport(a, '2026-11', 'c7 หน้า', T0).account;   // วอร์ดเดิม ไม่เสียสิทธิ์
  assert.equal(a.credits, 2);
  assert.equal(code(() => E.authorizeExport(a, '2026-11', 'ICU', T0)), 'WARD_MISMATCH');
  const r = E.authorizeExport(a, '2026-11', 'ICU', T0, true);
  assert.equal(r.consumedCredit, true);
  assert.equal(r.account.credits, 1);
  assert.deepEqual(r.account.months['2026-11'].wards, ['C7  หน้า', 'ICU']);
});

test('เช่ารายเดือน: แก้ไขได้ตลอด ไม่ลบข้อมูล · ต่ออายุซ้อนจากวันหมดเดิม', () => {
  let a = E.applyPurchase(E.newAccount('a', 'x@y.z', 'email'), 'monthly', T0);
  const until1 = a.subscription!.until;
  a = E.applyPurchase(a, 'monthly', T0 + DAY);
  assert.ok(a.subscription!.until > until1);
  a = E.activateMonth(a, '2026-11', T0).account;
  assert.equal(a.months['2026-11'].source, 'subscription');
  assert.equal(E.canEdit(a, '2027-03', T0 + 40 * DAY), true);
  assert.deepEqual(E.purgeDue(a, T0 + 40 * DAY).purge, []);
  assert.equal(code(() => E.applyPurchase(a, 'lifetime' as E.PlanId, T0)), 'BAD_PACKAGE');
});

test('ทดลองฟรีแล้วเช่ารายเดือน: เดือนเดิมส่งออกไม่จำกัด แก้ไขได้ตลอด และไม่ถูกลบ (บั๊กที่รายงาน)', () => {
  let a = E.activateMonth(E.newAccount('a', 'g@gmail.com', 'google'), '2026-11', T0).account;
  for (let i = 0; i < 3; i++) a = E.authorizeExport(a, '2026-11', 'C7', T0).account;
  assert.equal(code(() => E.authorizeExport(a, '2026-11', 'C7', T0)), 'TRIAL_EXPORT_LIMIT');
  a = E.applyPurchase(a, 'monthly', T0);
  assert.equal(a.months['2026-11'].source, 'subscription');
  for (let i = 0; i < 5; i++) { const r = E.authorizeExport(a, '2026-11', 'C7', T0 + 20 * DAY); a = r.account; assert.equal(r.remaining, null); }
  assert.deepEqual(E.purgeDue(a, T0 + 40 * DAY).purge, []);
});
