/**
 * โปรไฟล์หน่วยงาน (ลงทะเบียนครั้งแรก) + ค้นหา รพ. + ข้อมูลรูปแบบเวรสำหรับวิจัย
 */
import { HOSPITALS, PROVINCES, WARD_TYPES, type Hospital } from './data/hospitals-th.ts';
import type { Nurse, Settings } from './types.ts';
import { levelOf } from './engine.ts';

export { HOSPITALS, PROVINCES, WARD_TYPES };
export type { Hospital };

export interface HospitalProfile {
  /** รหัสในรายการ หรือ null เมื่อเลือก "อื่นๆ" */
  hospitalCode: string | null;
  hospitalName: string;
  province: string;
  /** true = ผู้ใช้พิมพ์ชื่อเอง ต้องให้ทีมงานตรวจ/จับคู่ก่อนวิเคราะห์ */
  custom: boolean;
  wardType: string | null;
  /** ยินยอมให้ใช้ข้อมูลรูปแบบการจัดเวร (ไม่รวมรายชื่อ) เพื่อวิจัยและพัฒนา — PDPA */
  researchConsent: boolean;
  consentAt: number | null;
}

/** คำแนะนำสำหรับพิมพ์ค้นหา (guide word) */
export const GUIDE_WORDS = ['มหาราช', 'ประชานุเคราะห์', 'ศูนย์การแพทย์', 'มหาวิทยาลัย', 'กรุงเทพ', 'สมเด็จพระ', 'รามา', 'จุฬา', 'ศิริราช', 'เอกชน'];

/** ตัดคำนำหน้า/ช่องว่าง/ตัวพิมพ์ เพื่อให้พิมพ์ "รพ.ท่าศาลา" "โรงพยาบาลท่าศาลา" "ท่าศาลา" เจอเหมือนกัน */
export function normalizeTh(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/โรงพยาบาล|โรงพยาบาลฯ|ร\.?พ\.?|hospital/g, '').replace(/[\s.\-–·,()]/g, '');
}

/**
 * ค้นหาแบบให้คะแนน: ตรงต้นคำ > มีในชื่อ > ตรงคำค้นเพิ่มเติม > จังหวัด > ประเภท
 * คำค้นหลายคำ (เว้นวรรค) ต้องเจอทุกคำ เช่น "กรุงเทพ ภูเก็ต"
 */
export function searchHospitals(query: string, list: Hospital[] = HOSPITALS, limit = 8): Hospital[] {
  const terms = query.trim().split(/\s+/).map(normalizeTh).filter(Boolean);
  if (!terms.length) return [];
  const scored: { h: Hospital; score: number }[] = [];
  for (const h of list) {
    const name = normalizeTh(h.name), al = h.aliases.map(normalizeTh), prov = normalizeTh(h.province), type = normalizeTh(h.type);
    let total = 0, ok = true;
    for (const t of terms) {
      const s = name.startsWith(t) ? 100 : name.includes(t) ? 60 : al.some(a => a.startsWith(t)) ? 50 : al.some(a => a.includes(t)) ? 35 : prov.startsWith(t) ? 30 : prov.includes(t) ? 20 : type.includes(t) ? 10 : 0;
      if (!s) { ok = false; break; }
      total += s;
    }
    if (ok) scored.push({ h, score: total - h.name.length / 100 });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.h);
}

export function validateProfile(p: HospitalProfile): string[] {
  const errors: string[] = [];
  if (p.custom) {
    if (p.hospitalCode !== null) errors.push('เลือก "อื่นๆ" ต้องไม่มีรหัส รพ.');
    if (p.hospitalName.trim().length < 3 || p.hospitalName.length > 200) errors.push('กรุณาระบุชื่อ รพ. 3–200 ตัวอักษร');
  } else if (!HOSPITALS.some(h => h.code === p.hospitalCode)) errors.push('ไม่พบ รพ. ที่เลือก');
  if (!PROVINCES.includes(p.province)) errors.push('กรุณาเลือกจังหวัด');
  if (p.wardType !== null && !WARD_TYPES.includes(p.wardType)) errors.push('ประเภทหอผู้ป่วยไม่ถูกต้อง');
  if (p.researchConsent && !p.consentAt) errors.push('ต้องบันทึกเวลาให้ความยินยอม');
  return errors;
}

/**
 * Event สำหรับวิจัย: เก็บ "รูปแบบ" การจัดเวรเท่านั้น ไม่มีชื่อบุคลากร หมายเหตุ หรือวันลารายคน
 * ส่งเมื่อ researchConsent = true และเกิด event สร้างตาราง / ส่งออก
 */
export interface RosterPatternEvent {
  event: 'roster_generated' | 'roster_exported';
  at: number;
  accountId: string;
  hospitalCode: string | null;
  hospitalName: string;   // ใช้กับ custom เพื่อจับคู่ภายหลัง
  province: string;
  wardType: string | null;
  month: string;
  version: 1 | 2;
  nightMode: 'back' | 'front';
  demand: Settings['demand'];
  toggles: { rolling: boolean; stroke: boolean; senior: boolean; competent: boolean; novice: boolean; mentorMode: string };
  staff: { total: number; byLevel: Record<string, number>; stroke: number; mentors: number };
  result?: { valid: boolean; issues: number; partial: boolean; doubleShifts: number; offBlocks3plus: number };
}

export function buildPatternEvent(args: {
  event: RosterPatternEvent['event']; at: number; accountId: string; profile: HospitalProfile; month: string; version: 1 | 2;
  settings: Settings; nurses: Nurse[]; result?: RosterPatternEvent['result'];
}): RosterPatternEvent | null {
  const { profile: pr, settings: s, nurses } = args;
  if (!pr.researchConsent) return null;
  const byLevel: Record<string, number> = {};
  for (const n of nurses) byLevel[levelOf(n)] = (byLevel[levelOf(n)] || 0) + 1;
  return {
    event: args.event, at: args.at, accountId: args.accountId, hospitalCode: pr.hospitalCode, hospitalName: pr.hospitalName, province: pr.province, wardType: pr.wardType,
    month: args.month, version: args.version, nightMode: s.nightMode === 'front' ? 'front' : 'back', demand: s.demand || { 'ช': 3, 'บ': 3, 'ด': 3 },
    toggles: { rolling: s.useRolling !== false, stroke: s.useStroke !== false, senior: !!s.useSenior, competent: !!s.useCompetent, novice: !!s.useNovice, mentorMode: s.mentorMode || 'none' },
    staff: { total: nurses.length, byLevel, stroke: nurses.filter(n => n.stroke).length, mentors: nurses.filter(n => n.mentor).length },
    result: args.result
  };
}
