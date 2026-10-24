// วัดผลตัวจัดเวรกับวอร์ดขนาดจริง: node scripts/bench.ts
import * as E from '../src/index.ts';

type Case = { name: string; n: number; demand: [number, number, number]; base: number; extra?: (p: E.RosterParams) => void };
const mk = (n: number): E.Nurse[] => Array.from({ length: n }, (_, i) => ({ id: 'rn' + (i + 1), name: 'RN ' + (i + 1), stroke: i % 3 === 0, level: i % 4 === 0 ? 'senior' : i % 4 === 1 ? 'competent' : 'rn', mentor: i % 4 === 0, active: true }));
const leave = (p: E.RosterParams, k: number) => { for (let i = 0; i < k; i++) { const id = 'rn' + (1 + (i * 3) % p.nurses.length); for (let d = 0; d < 3; d++) (p.requests[id] ??= {})[(i * 5 + d) % p.D] = { type: 'VA', status: 'approved', work: true }; } };

const cases: Case[] = [
  { name: '12 RN · 3/3/3', n: 12, demand: [3, 3, 3], base: 21 },
  { name: '14 RN · 4/3/3 · Stroke+Senior · VA', n: 14, demand: [4, 3, 3], base: 21, extra: p => { p.useStroke = true; p.skill = { 'ช': 1, 'บ': 1, 'ด': 1 }; p.useSenior = true; p.seniorNeed = { 'ช': 1, 'บ': 1, 'ด': 1 }; leave(p, 4); } },
  { name: '15 RN · 4/4/3 · โย้หน้า', n: 15, demand: [4, 4, 3], base: 22, extra: p => { p.nightMode = 'front'; } },
  { name: '18 RN · 5/4/4 · VA 6 คน', n: 18, demand: [5, 4, 4], base: 21, extra: p => leave(p, 6) },
  { name: '20 RN · 5/5/4 · หน้า 2 หยุดต่อเนื่อง', n: 20, demand: [5, 5, 4], base: 21, extra: p => { p.version = 2; } },
  { name: '25 RN · 6/6/5', n: 25, demand: [6, 6, 5], base: 21 },
  { name: '16 คน · Novice 4 + พี่เลี้ยงอัตโนมัติ', n: 16, demand: [3, 3, 3], base: 0, extra: p => { p.useNovice = true; p.noviceNeed = { 'ช': 1, 'บ': 1, 'ด': 0 }; p.mentorMode = 'auto'; p.mentorCapacity = 1; p.nurses.slice(12).forEach(n => { n.level = 'novice'; n.mentor = false; }); } },
  { name: '13 RN · 4/4/4 (กำลังคนตึงมาก)', n: 13, demand: [4, 4, 4], base: 21 },
  { name: '10 RN · 5/5/5 (เป็นไปไม่ได้)', n: 10, demand: [5, 5, 5], base: 21 }
];

for (const c of cases) {
  const p: E.RosterParams = { nurses: mk(c.n), D: 31, base: c.base, rows: {}, requests: {}, prior: {}, next: {}, locks: {}, useStroke: false, demand: { 'ช': c.demand[0], 'บ': c.demand[1], 'ด': c.demand[2] }, seed: 11 };
  c.extra?.(p);
  const pre = E.preflight(p);
  const t = Date.now(), r = E.generate(p), ms = Date.now() - t;
  const v = r.rows ? E.validate({ ...p, rows: r.rows }) : null;
  const units = r.rows ? p.nurses.map(n => E.summary(r.rows![n.id], p.base).units) : [];
  const off3 = r.report?.length ? r.report.filter(x => x.found).length + '/' + r.report.length : '-';
  console.log(`${c.name.padEnd(40)} ${r.ok ? 'ผ่าน' : 'ไม่ผ่าน'}  ${(ms / 1000).toFixed(1)} วิ  ข้อผิด ${v ? v.issues.length : '-'}  เวร/คน ${units.length ? Math.min(...units) + '–' + Math.max(...units) : '-'}  OFF≥3: ${off3}${pre.length ? '  preflight: ' + pre[0] : ''}${r.ok ? '' : '  ' + (r.reasons || [])[0]}`);
}
