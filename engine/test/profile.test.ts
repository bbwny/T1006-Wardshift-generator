import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/index.ts';

test('รายชื่อ รพ.: รหัสไม่ซ้ำ ชื่อไม่ซ้ำ จังหวัดถูกต้อง', () => {
  assert.equal(new Set(E.HOSPITALS.map(h => h.code)).size, E.HOSPITALS.length);
  assert.equal(new Set(E.HOSPITALS.map(h => h.name)).size, E.HOSPITALS.length);
  assert.equal(E.PROVINCES.length, 77);
  for (const h of E.HOSPITALS) assert.ok(E.PROVINCES.includes(h.province), h.name);
});
test('ค้นหา: ไม่สนคำนำหน้า "รพ."/"โรงพยาบาล", ชื่อย่อ, ภาษาอังกฤษ, หลายคำ', () => {
  const first = (q: string) => E.searchHospitals(q)[0]?.name;
  assert.equal(first('รพ.ท่าศาลา'), 'โรงพยาบาลท่าศาลา');
  assert.equal(first('รามา'), 'โรงพยาบาลรามาธิบดี');
  assert.equal(first('Siriraj'), 'โรงพยาบาลศิริราช');
  assert.equal(first('กรุงเทพ ภูเก็ต'), 'โรงพยาบาลกรุงเทพภูเก็ต');
  assert.deepEqual(E.searchHospitals('ไม่มีแน่นอน xyz'), []);
});
test('validateProfile + buildPatternEvent (ไม่ยินยอม = ไม่ส่ง, ไม่มีชื่อบุคลากร)', () => {
  const base: E.HospitalProfile = { hospitalCode: null, hospitalName: 'โรงพยาบาลชุมชนทดสอบ', province: 'ตรัง', custom: true, wardType: 'อายุรกรรม', researchConsent: true, consentAt: 1 };
  assert.deepEqual(E.validateProfile(base), []);
  assert.ok(E.validateProfile({ ...base, province: 'ไม่มี' }).length);
  assert.ok(E.validateProfile({ ...base, custom: false, hospitalCode: 'TH9999' }).length);
  const nurses = [{ id: 'a', name: 'นาย ลับ', stroke: true, level: 'senior' as const, mentor: true }];
  const ev = E.buildPatternEvent({ event: 'roster_generated', at: 2, accountId: 'acc', profile: base, month: '2026-11', version: 1, settings: { nightMode: 'front' }, nurses });
  assert.equal(ev?.nightMode, 'front');
  assert.equal(ev?.staff.byLevel.senior, 1);
  assert.ok(!JSON.stringify(ev).includes('นาย ลับ'));
  assert.equal(E.buildPatternEvent({ event: 'roster_generated', at: 2, accountId: 'acc', profile: { ...base, researchConsent: false }, month: '2026-11', version: 1, settings: {}, nurses }), null);
});
