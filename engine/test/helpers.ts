import { createRequire } from 'node:module';
import type { Cell, Code, Nurse, RosterParams, Settings } from '../src/index.ts';

const require = createRequire(import.meta.url);
/** RNCore เดิมจากไฟล์ HTML (สร้างด้วย npm run legacy) */
export const Legacy = require('./fixtures/legacy-engine.cjs');

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
export const json = (v: unknown) => JSON.parse(JSON.stringify(v));

export function nurses(n: number, r: () => number = () => 0.5, roles = false): Nurse[] {
  const levels = ['rn', 'novice', 'competent', 'senior'] as const;
  return Array.from({ length: n }, (_, i) => ({
    id: 'rn' + (i + 1), name: 'นาย ' + String.fromCharCode(65 + i), stroke: roles ? r() < 0.4 : false,
    level: roles ? pick(r, levels) : 'rn', mentor: roles ? r() < 0.5 : false, mentorId: '', active: true
  }));
}

/** สร้างอินพุตสุ่มแบบกำหนด seed สำหรับทดสอบเทียบผล */
export function randomParams(seed: number): RosterParams {
  const r = rng(seed), D = pick(r, [28, 30, 31]), N = 4 + Math.floor(r() * 7), roles = r() < 0.6;
  const ns = nurses(N, r, roles);
  for (const n of ns) if (n.level === 'novice') { n.mentor = false; if (r() < 0.5) n.mentorId = pick(r, ns.filter(m => m.id !== n.id)).id; }
  const codes: Cell[] = ['OFF', 'ด', 'ช', 'บ', 'ด/บ', 'ช/บ', 'ช/ด', 'VA', ''];
  const rows = Object.fromEntries(ns.map(n => [n.id, Array.from({ length: D }, () => pick(r, codes))]));
  const requests: RosterParams['requests'] = {}, locks: RosterParams['locks'] = {}, prior: RosterParams['prior'] = {}, next: RosterParams['next'] = {};
  for (const n of ns) {
    for (let d = 0; d < D; d++) {
      if (r() < 0.05) (requests[n.id] ??= {})[d] = { type: pick(r, ['VA', 'OFF'] as const), status: pick(r, ['approved', 'approved', 'pending'] as const), work: r() < 0.7 };
      if (r() < 0.04) (locks[n.id] ??= {})[d] = pick(r, codes.filter(Boolean) as Code[]);
    }
    if (r() < 0.8) prior[n.id] = Array.from({ length: pick(r, [6, 7]) }, () => (r() < 0.2 ? null : pick(r, codes.filter(Boolean) as Code[])));
    if (r() < 0.6) next[n.id] = Array.from({ length: 6 }, () => (r() < 0.2 ? null : pick(r, codes.filter(Boolean) as Code[])));
  }
  const settings: Settings = {
    nightMode: pick(r, ['back', 'front'] as const), useRolling: r() < 0.7,
    useStroke: r() < 0.5, useSenior: r() < 0.4, useCompetent: r() < 0.3, useNovice: r() < 0.4,
    demand: { 'ช': 1 + Math.floor(r() * 3), 'บ': 1 + Math.floor(r() * 3), 'ด': 1 + Math.floor(r() * 3) },
    skill: { 'ช': 1, 'บ': 1, 'ด': Math.floor(r() * 2) }, seniorNeed: { 'ช': 1, 'บ': 0, 'ด': 1 }, competentNeed: { 'ช': 0, 'บ': 1, 'ด': 0 }, noviceNeed: { 'ช': 1, 'บ': 0, 'ด': 0 },
    mentorMode: pick(r, ['none', 'auto', 'fixed'] as const), mentorCapacity: 1 + Math.floor(r() * 2),
    minimum: pick(r, ['units', 'days'] as const), vaCredit: r() < 0.3, rate: r() < 0.5 ? null : 150
  };
  return { ...settings, nurses: ns, D, base: 18 + Math.floor(r() * 5), rows, requests, prior, next, locks, afterLeave: r() < 0.3 ? { [ns[0].id]: { status: 'approved', type: 'VA' } } : {} };
}
