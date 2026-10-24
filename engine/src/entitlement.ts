/**
 * กติกาสิทธิ์การใช้งาน (ฝั่งเซิร์ฟเวอร์) — ฟังก์ชันบริสุทธิ์ ไม่ผูกฐานข้อมูล
 * ทีม backend เรียกใช้ภายใน transaction: โหลด Account → เรียกฟังก์ชัน → บันทึก Account ที่ได้คืน
 *
 * ข้อตกลงทางธุรกิจ (ดู SPEC.md §2):
 *  - ทดลองฟรี 1 ครั้งต่อบัญชี (ต้อง Google หรือยืนยันเบอร์โทร, 1 เบอร์ = 1 ครั้ง)
 *  - 1 สิทธิ์ = ตาราง 1 เดือนของ 1 วอร์ด · แก้ไข/ส่งออก 7 วัน · ดูอย่างเดียวถึงวันที่ 30 · ลบวันที่ 31
 *  - ทดลองฟรีส่งออกได้ 3 ครั้ง · ซื้อสิทธิ์/เช่า ส่งออกไม่จำกัด (วอร์ดเดิม)
 *  - เช่ารายเดือน/รายปี = แก้ไขได้ตลอด 1 วอร์ดต่อเดือน
 *  - เดือนเดียวกันส่งออกวอร์ดอื่น ต้องใช้ 1 สิทธิ์ต่อวอร์ด (นับตอนส่งออกครั้งแรกของวอร์ดนั้น)
 */
export const RULES = {
  EDIT_DAYS: 7,
  RETAIN_DAYS: 30,
  TRIAL_EXPORTS: 3,
  DELETE_WARNING_DAYS: 3
} as const;
const DAY = 86_400_000;

export type MonthSource = 'trial' | 'credit' | 'subscription';
export type PlanId = 'credit1' | 'credit3' | 'credit5' | 'monthly' | 'yearly';

export interface PricingPackage { id: PlanId; label: string; priceTHB: number; credits?: number; months?: number; }
export const PRICING: readonly PricingPackage[] = [
  { id: 'credit1', label: '1 สิทธิ์', priceTHB: 99, credits: 1 },
  { id: 'credit3', label: '3 สิทธิ์', priceTHB: 249, credits: 3 },
  { id: 'credit5', label: '5 สิทธิ์', priceTHB: 399, credits: 5 },
  { id: 'monthly', label: 'รายเดือน (1 วอร์ด)', priceTHB: 249, months: 1 },
  { id: 'yearly', label: 'รายปี (1 วอร์ด)', priceTHB: 2490, months: 12 }
];

export interface MonthEntitlement {
  /** YYYY-MM ของตาราง */
  month: string;
  source: MonthSource;
  activatedAt: number;
  /** null = ไม่หมด (เช่าระบบ) */
  editUntil: number | null;
  deleteAt: number | null;
  exportsUsed: number;
  /** null = ไม่จำกัด */
  exportLimit: number | null;
  /** ชื่อวอร์ดที่ผูกกับเดือนนี้ (ชื่อแสดงผล เทียบด้วย normalizeWard) */
  wards: string[];
  purged: boolean;
}

export interface Account {
  id: string;
  email: string;
  provider: 'google' | 'email';
  phoneVerified: boolean;
  phoneHash: string | null;
  trialUsed: boolean;
  credits: number;
  subscription: { plan: 'monthly' | 'yearly'; until: number } | null;
  months: Record<string, MonthEntitlement>;
}

export type EntitlementErrorCode =
  | 'PHONE_REQUIRED' | 'PHONE_USED' | 'NO_CREDIT' | 'NOT_ACTIVATED' | 'EDIT_EXPIRED'
  | 'TRIAL_EXPORT_LIMIT' | 'WARD_MISMATCH' | 'BAD_PACKAGE' | 'BAD_MONTH';

export class EntitlementError extends Error {
  readonly code: EntitlementErrorCode;
  constructor(code: EntitlementErrorCode, message: string) { super(message); this.code = code; this.name = 'EntitlementError'; }
}

export const normalizeWard = (w: string): string => w.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
const isMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const clone = <T>(v: T): T => structuredClone(v);

function upgradeToSubscription(m: MonthEntitlement): void { m.source = 'subscription'; m.editUntil = null; m.deleteAt = null; m.exportLimit = null; }

export function subscriptionActive(a: Account, now: number): boolean { return !!a.subscription && a.subscription.until > now; }

/** เดือนนี้แก้ไขได้หรือไม่ (ใช้ตรวจทุก API ที่เขียนข้อมูลตาราง) */
export function canEdit(a: Account, month: string, now: number): boolean {
  if (subscriptionActive(a, now)) return true;
  const m = a.months[month];
  return !!m && !m.purged && m.editUntil !== null && m.editUntil > now;
}
/** เดือนนี้ยังอ่านได้หรือไม่ (ก่อนถูกลบ) */
export function canView(a: Account, month: string, now: number): boolean {
  const m = a.months[month];
  if (!m) return true; // ยังไม่ใช้สิทธิ์ = ดูหน้าเปล่าได้
  return !m.purged && (m.deleteAt === null || m.deleteAt > now || subscriptionActive(a, now));
}

/** เปิดใช้สิทธิ์กับเดือน: เช่าระบบ → ทดลองฟรี → หักสิทธิ์ */
export function activateMonth(acct: Account, month: string, now: number, opts: { phoneAlreadyUsedForTrial?: boolean } = {}): { account: Account; source: MonthSource; consumedCredit: boolean } {
  if (!isMonth(month)) throw new EntitlementError('BAD_MONTH', 'รูปแบบเดือนไม่ถูกต้อง');
  const a = clone(acct), cur = a.months[month];
  if (subscriptionActive(a, now)) {
    a.months[month] = { month, source: 'subscription', activatedAt: cur?.activatedAt ?? now, editUntil: null, deleteAt: null, exportsUsed: cur?.exportsUsed ?? 0, exportLimit: null, wards: cur && !cur.purged ? cur.wards : [], purged: false };
    return { account: a, source: 'subscription', consumedCredit: false };
  }
  if (cur && !cur.purged && cur.editUntil !== null && cur.editUntil > now) return { account: a, source: cur.source, consumedCredit: false };
  let source: MonthSource;
  if (!a.trialUsed && !cur) {
    if (a.provider !== 'google' && !a.phoneVerified) throw new EntitlementError('PHONE_REQUIRED', 'ยืนยันเบอร์โทรก่อนใช้สิทธิ์ทดลอง');
    if (opts.phoneAlreadyUsedForTrial) throw new EntitlementError('PHONE_USED', 'เบอร์นี้ใช้สิทธิ์ทดลองไปแล้ว');
    a.trialUsed = true; source = 'trial';
  } else if (a.credits > 0) { a.credits -= 1; source = 'credit'; }
  else throw new EntitlementError('NO_CREDIT', 'สิทธิ์ไม่พอ');
  a.months[month] = {
    month, source, activatedAt: now, editUntil: now + RULES.EDIT_DAYS * DAY, deleteAt: now + RULES.RETAIN_DAYS * DAY,
    exportsUsed: 0, exportLimit: source === 'trial' ? RULES.TRIAL_EXPORTS : null, wards: cur && !cur.purged ? cur.wards : [], purged: false
  };
  return { account: a, source, consumedCredit: source === 'credit' };
}

/**
 * อนุญาตส่งออก 1 ครั้ง: ตรวจช่วงแก้ไข, โควตาทดลอง, ผูกวอร์ด
 * payForNewWard=true เมื่อผู้ใช้ยืนยันใช้ 1 สิทธิ์สำหรับวอร์ดใหม่ในเดือนเดียวกัน
 */
export function authorizeExport(acct: Account, month: string, ward: string, now: number, payForNewWard = false): { account: Account; remaining: number | null; consumedCredit: boolean } {
  const a = clone(acct), m = a.months[month], w = normalizeWard(ward);
  if (!m || m.purged) throw new EntitlementError('NOT_ACTIVATED', 'เดือนนี้ยังไม่ได้ใช้สิทธิ์');
  if (subscriptionActive(a, now) && m.source !== 'subscription') upgradeToSubscription(m);
  if (!canEdit(a, month, now)) throw new EntitlementError('EDIT_EXPIRED', 'พ้นช่วงแก้ไขและส่งออกแล้ว');
  if (m.exportLimit !== null && m.exportsUsed >= m.exportLimit) throw new EntitlementError('TRIAL_EXPORT_LIMIT', 'ใช้สิทธิ์ส่งออกช่วงทดลองครบแล้ว');
  const known = m.wards.some(x => normalizeWard(x) === w);
  let consumedCredit = false;
  if (m.wards.length && !known) {
    if (!payForNewWard) throw new EntitlementError('WARD_MISMATCH', 'เดือนนี้ผูกกับวอร์ดอื่นแล้ว');
    if (a.credits < 1) throw new EntitlementError('NO_CREDIT', 'สิทธิ์ไม่พอ');
    a.credits -= 1; consumedCredit = true;
  }
  if (!known) m.wards.push(ward.trim());
  m.exportsUsed += 1;
  return { account: a, remaining: m.exportLimit === null ? null : m.exportLimit - m.exportsUsed, consumedCredit };
}

/** เรียกหลังได้รับ webhook ชำระเงินสำเร็จเท่านั้น (idempotent ด้วย paymentId ที่ชั้นฐานข้อมูล) */
export function applyPurchase(acct: Account, plan: PlanId, now: number): Account {
  const a = clone(acct), p = PRICING.find(x => x.id === plan);
  if (!p) throw new EntitlementError('BAD_PACKAGE', 'ไม่พบแพ็กเกจ');
  if (p.credits) a.credits += p.credits;
  else {
    const from = subscriptionActive(a, now) ? a.subscription!.until : now, d = new Date(from);
    d.setUTCMonth(d.getUTCMonth() + (p.months ?? 1));
    a.subscription = { plan: plan as 'monthly' | 'yearly', until: d.getTime() };
    // เดือนที่ยังมีข้อมูล (ทดลอง/รายครั้ง) กลายเป็นแบบเช่า: แก้ไขได้ตลอด ส่งออกไม่จำกัด ไม่ลบ
    for (const m of Object.values(a.months)) if (!m.purged) upgradeToSubscription(m);
  }
  return a;
}

/**
 * งานลบข้อมูลประจำวัน (cron): คืนรายการเดือนที่ต้องลบตาราง และเดือนที่ต้องส่งอีเมลเตือน
 * wipeAll=true → ผู้ใช้ไม่เช่าและทุกเดือนถูกลบแล้ว ให้ลบรายชื่อ/การตั้งค่าด้วย
 */
export function purgeDue(acct: Account, now: number): { account: Account; purge: string[]; warn: string[]; wipeAll: boolean } {
  const a = clone(acct), purge: string[] = [], warn: string[] = [];
  const sub = subscriptionActive(a, now);
  for (const m of Object.values(a.months)) {
    if (m.purged || m.source === 'subscription' || m.deleteAt === null || sub) continue;
    if (m.deleteAt <= now) { m.purged = true; purge.push(m.month); }
    else if (m.deleteAt - now <= RULES.DELETE_WARNING_DAYS * DAY) warn.push(m.month);
  }
  const months = Object.values(a.months);
  const wipeAll = !sub && months.length > 0 && months.every(m => m.purged);
  return { account: a, purge, warn, wipeAll };
}

export function newAccount(id: string, email: string, provider: Account['provider']): Account {
  return { id, email: email.trim().toLowerCase(), provider, phoneVerified: false, phoneHash: null, trialUsed: false, credits: 0, subscription: null, months: {} };
}
