/** รหัสเวรที่ใส่ในช่องตาราง (ตามไฟล์ต้นฉบับ) */
export type Code = 'OFF' | 'ด' | 'ช' | 'บ' | 'ด/บ' | 'ช/บ' | 'ช/ด' | 'VA';
/** ช่องตาราง: รหัสเวร หรือ '' = ยังว่าง */
export type Cell = Code | '';
/** ช่องรอยต่อเดือน: null = ยังไม่ทราบ ("?") */
export type BoundaryCell = Code | null;
/** ชนิดเวรเดี่ยว: เช้า บ่าย ดึก */
export type ShiftLabel = 'ช' | 'บ' | 'ด';
export type PerShift = Record<ShiftLabel, number>;
/** bit mask: ด=1, ช=2, บ=4 (ช/ด=3, ด/บ=5, ช/บ=6) */
export type Mask = number;

export type Level = 'rn' | 'novice' | 'competent' | 'senior';
export type NightMode = 'back' | 'front';
export type MentorMode = 'none' | 'auto' | 'fixed';

export interface Nurse {
  id: string;
  name: string;
  stroke: boolean;
  level?: Level;
  mentor?: boolean;
  mentorId?: string;
  active?: boolean;
  /** ฟิลด์รุ่นเก่า (ยังอ่านได้) */
  novice?: boolean;
  senior?: boolean;
}

export interface LeaveDay {
  type: 'VA' | 'OFF';
  status: 'approved' | 'pending' | 'rejected';
  /** วันนั้นเป็นวันทำการหรือไม่ (ใช้หัก VA ออกจากเกณฑ์) */
  work?: boolean;
}

/** การตั้งค่าวอร์ด (state.settings ในไฟล์ต้นฉบับ) */
export interface Settings {
  nightMode?: NightMode;
  useRolling?: boolean;
  wardName?: string;
  useStroke?: boolean;
  useSenior?: boolean;
  useCompetent?: boolean;
  useNovice?: boolean;
  demand?: PerShift;
  skill?: PerShift;
  seniorNeed?: PerShift;
  competentNeed?: PerShift;
  noviceNeed?: PerShift;
  mentorMode?: MentorMode;
  mentorCapacity?: number;
  minimum?: 'units' | 'days';
  vaCredit?: boolean;
  rate?: number | null | '';
  blockLength?: 3 | 4;
  budget?: number;
}

/** อินพุตของ validate / generate สำหรับ 1 เดือน */
export interface RosterParams extends Settings {
  nurses: Nurse[];
  /** จำนวนวันในเดือน */
  D: number;
  /** จำนวนวันทำการ = เกณฑ์เวรประจำ */
  base: number;
  rows: Record<string, Cell[]>;
  /** วันลาที่อนุมัติ: requests[nurseId][dayIndex] */
  requests: Record<string, Record<number, LeaveDay>>;
  /** เวรก่อนเริ่มเดือน (โย้หลัง 6 ช่อง / โย้หน้า 7 ช่อง) */
  prior: Record<string, BoundaryCell[]>;
  /** เวร 6 วันถัดจากเดือนนี้ */
  next: Record<string, BoundaryCell[]>;
  locks: Record<string, Record<number, Code>>;
  /** วันลาของวันแรกเดือนถัดไป (ใช้ตรวจโย้หน้า) */
  afterLeave?: Record<string, { status: string; type?: string } | undefined>;
  version?: 1 | 2;
  seed?: number;
  allowPartial?: boolean;
  partialOnly?: boolean;
  failureReasons?: string[];
}

export type IssueType =
  | 'minimum' | 'empty' | 'leave' | 'va' | 'lock' | 'pair' | 'transition' | 'repeat' | 'rolling'
  | 'competent' | 'mentor' | 'mentorAvailability' | 'senior' | 'novice' | 'coverage' | 'stroke';

export interface Issue { type: IssueType; message: string; id: string | null; days: number[]; }

export interface Summary {
  shifts: PerShift;
  units: number;
  worked: number;
  va: number;
  off: number;
  ot: number;
  hours: number;
  otHours: number;
  money: number | null;
  maxoff: number;
  blocks: [number, number][];
}

export interface ShiftCoverage { count: number; stroke: number; senior: number; competent: number; novice: number; pairs: Pair[]; }
export type DayCoverage = Record<ShiftLabel, ShiftCoverage>;

export interface Validation {
  issues: Issue[];
  bad: Record<string, Record<number, true>>;
  badDays: Record<number, true>;
  sums: Record<string, Summary>;
  coverage: DayCoverage[];
  valid: boolean;
}

export interface Pair { noviceId: string; mentorId: string; }
export interface MatchResult { pairs: Pair[]; unmatched: { noviceId: string; reason: string }[]; }

export interface TemporalIssue { type: 'pair' | 'transition' | 'repeat' | 'rolling'; text: string; indices: number[]; }

export interface Holiday { date: string; name: string; status: string; enabled: boolean; }
export interface CalendarDay { day: number; date: string; weekday: number; holiday: string; work: boolean; }

export interface Progress { message: string; percent: number; }
export interface GenerateResult {
  ok: boolean;
  rows?: Record<string, Cell[]>;
  reasons?: string[];
  report?: { id: string; name: string; found: boolean }[];
  check?: Validation;
  partial?: boolean;
  needsConfirmation?: boolean;
}
