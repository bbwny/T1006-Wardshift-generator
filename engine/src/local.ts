/**
 * ตัวจัดเวรแบบ local search (simulated annealing) สำหรับวอร์ดขนาดจริง (12–25+ คน)
 *
 * แนวคิด: วางเวรทั้งเดือนให้ครบจำนวนคนต่อเวรก่อน แล้ว "สลับแก้" ทีละจุด
 *   - ย้ายเวรของ 1 คนใน 1 วัน (เปลี่ยนช่อง)
 *   - สลับเวรของ 2 คนในวันเดียวกัน (จำนวนคนต่อเวรไม่เปลี่ยน)
 * รับการเปลี่ยนที่ทำให้ข้อผิดลดลง (และบางครั้งรับที่แย่ลงเล็กน้อยเพื่อไม่ติดหล่ม)
 * จนข้อผิดตามกฎบังคับเป็น 0 แล้วจึงตรวจซ้ำด้วย validate() ก่อนคืนผล
 *
 * ต่างจาก DFS เดิมที่จัดทีละวันและย้อนแก้ได้ทีละวัน — วิธีนี้แก้ต้นเหตุได้ไม่ว่าจะอยู่วันไหนของเดือน
 */
import type { Cell, Code, Mask, RosterParams, ShiftLabel } from './types.ts';
import {
  FROM, MASK, W, allowedMasks, competentNeed, demand, enabled, isNovice, levelOf, matchTeam, nightMode,
  noviceNeed, rand, rollingEnabled, seniorNeed, skill, summary, validate
} from './engine.ts';

export interface LocalResult {
  ok: boolean;
  rows: Record<string, Cell[]> | null;
  /** ข้อผิดตามกฎบังคับที่เหลือ (0 = ผ่าน) */
  hard: number;
  iterations: number;
  ms: number;
  report: { id: string; name: string; found: boolean }[];
}

const SHIFT_BITS: [ShiftLabel, number][] = [['ด', 1], ['ช', 2], ['บ', 4]];
// น้ำหนัก: กฎบังคับหนักกว่าเป้าหมายเสริมมาก เพื่อให้แก้กฎก่อนเสมอ
const H_COVER = 10, H_SKILL = 8, H_TEMPORAL = 10, H_MIN = 6, H_LEAVE = 10, H_MENTOR = 8;

export function solveLocal(p: RosterParams, timeMs: number, seed: number, onProgress?: (percent: number) => void): LocalResult {
  const t0 = Date.now(), rnd = rand(seed), ns = p.nurses, N = ns.length, D = p.D;
  const front = nightMode(p) === 'front', rolling = rollingEnabled(p), byDays = p.minimum === 'days';
  const dem = demand(p), sk = skill(p), sen = seniorNeed(p), com = competentNeed(p), nov = noviceNeed(p), useNovice = enabled(p, 'novice');
  const mentorOn = (p.mentorMode || 'none') !== 'none', v2 = p.version === 2, blockWanted = p.blockLength || 4;
  const maskOf = (c: unknown): Mask => (c === null || c === undefined ? 0 : MASK[c as string] || 0);

  // ---------- ข้อมูลคงที่ต่อคน ----------
  const isNov = ns.map(n => isNovice(p, n)), lvl = ns.map(levelOf);
  const fixedCode: (Code | null)[][] = ns.map(n => Array.from({ length: D }, (_, d) => {
    const r = p.requests[n.id]?.[d];
    if (r?.status === 'approved') return r.type;
    return p.locks[n.id]?.[d] ?? null;
  }));
  const allowed: Mask[][][] = ns.map((n, i) => Array.from({ length: D }, (_, d) => {
    const r = p.requests[n.id]?.[d], lock = p.locks[n.id]?.[d];
    let v = allowedMasks(p);
    if (r?.status === 'approved') v = [0];
    if (lock !== undefined) v = v.filter(m => m === (MASK[lock] || 0));
    return v.length ? v : [fixedCode[i][d] ? maskOf(fixedCode[i][d]) : 0];
  }));
  const free = allowed.map(row => row.map(a => a.length > 1));
  const before = ns.map(n => (p.prior[n.id] || Array(6).fill(null)).slice(-7).map(maskOf));
  const afterRaw = ns.map(n => (p.next[n.id] || []).slice(0, 6));
  const after = afterRaw.map(a => a.map(maskOf));
  const mins = ns.map(n => Math.max(0, p.base - (p.vaCredit ? Object.values(p.requests[n.id] || {}).filter(r => r.status === 'approved' && r.type === 'VA' && r.work).length : 0)));
  const totalShifts = D * (dem['ช'] + dem['บ'] + dem['ด']);
  // เป้าหมายภาระงานรายคน: แบ่งเวรทั้งหมดตามสัดส่วนวันที่ว่าง (คนลาเยอะได้เวรน้อยลงตามสัดส่วน)
  const availDays = ns.map((_, i) => allowed[i].filter(a => a.some(m => m)).length);
  const availCore = availDays.reduce((s, a, i) => s + (isNov[i] ? 0 : a), 0) || 1;
  const fairTarget = ns.map((_, i) => Math.max(mins[i], totalShifts * availDays[i] / availCore));

  // ---------- สถานะ ----------
  const X: Mask[][] = ns.map((_, i) => Array.from({ length: D }, (_, d) => (free[i][d] ? 0 : allowed[i][d][0])));

  // ---------- ค่าข้อผิดรายคน (เหมือน temporalIssues + กฎลาของโย้หน้า + เกณฑ์ขั้นต่ำ) ----------
  function rowCost(i: number): [number, number] {
    const b = before[i], off = b.length, seq = [...b, ...X[i], ...after[i]], L = seq.length;
    const A = front ? Array.from({ length: L + 1 }, (_, j) => ((seq[j] || 0) & 6) | ((seq[j - 1] || 0) & 1)) : seq;
    const src = (j: number, bit: number) => (front && bit === 1 ? j - 1 : j);
    const hits = (idx: number[]) => idx.some(k => k >= off && k < off + D && k < L);
    let hard = 0;
    for (let j = 0; j < A.length; j++) {
      const a = A[j];
      if ((a & 3) === 3 && hits([src(j, 1), src(j, 2)])) hard += H_TEMPORAL;
      if (j > 0 && (A[j - 1] & 4) && (a & 1) && hits([src(j - 1, 4), src(j, 1)])) hard += H_TEMPORAL;
      if (j >= 2) for (const [, bit] of SHIFT_BITS) if ((A[j - 2] & bit) && (A[j - 1] & bit) && (a & bit) && hits([src(j - 2, bit), src(j - 1, bit), src(j, bit)])) hard += H_TEMPORAL;
      if (rolling && j >= 6) {
        let tot = 0; for (let k = j - 6; k <= j; k++) tot += W(A[k]);
        if (tot > 8) { const idx: number[] = []; for (let k = j - 6; k <= j; k++) for (const bit of [1, 2, 4]) if (A[k] & bit) idx.push(src(k, bit)); if (hits(idx)) hard += H_TEMPORAL * (tot - 8); }
      }
    }
    if (front) {
      const id = ns[i].id;
      for (let d = 0; d <= D; d++) {
        const leave = d === D ? p.afterLeave?.[id] : p.requests[id]?.[d];
        const prev = d === 0 ? (b.at(-1) ?? 0) : X[i][d - 1];
        const va = (d < D && fixedCode[i][d] === 'VA') || (d === D && afterRaw[i][0] === 'VA');
        if ((leave?.status === 'approved' || va) && (prev & 1)) hard += H_LEAVE;
      }
    }
    let units = 0, days = 0; const cnt = [0, 0, 0]; let doubles = 0;
    for (const m of X[i]) { const w = W(m); units += w; if (w) days++; if (w === 2) doubles++; for (let k = 0; k < 3; k++) if (m & (1 << k)) cnt[k]++; }
    hard += H_MIN * Math.max(0, mins[i] - (byDays ? days : units));
    // เป้าหมายเสริม: เฉลี่ยภาระงาน, เฉลี่ยชนิดเวร, ลดเวรคู่, (หน้า 2) หยุดต่อเนื่อง
    let soft = isNov[i] ? 0 : 0.25 * (units - fairTarget[i]) ** 2;
    for (let k = 0; k < 3; k++) soft += 0.03 * (cnt[k] - units / 3) ** 2;
    soft += 0.15 * doubles;
    if (v2) {
      let run = 0, maxoff = 0;
      for (let d = 0; d < D; d++) { if (X[i][d] === 0 && fixedCode[i][d] !== 'VA') { run++; if (run > maxoff) maxoff = run; } else run = 0; }
      soft += maxoff >= blockWanted ? 0 : maxoff >= 3 ? 1 : 4;
    }
    return [hard, soft];
  }

  // ---------- ค่าข้อผิดรายวัน (จำนวนคน/ทักษะ/พี่เลี้ยง) ----------
  function dayCost(d: number): number {
    let c = 0;
    for (const [label, bit] of SHIFT_BITS) {
      let count = 0, st = 0, sr = 0, cp = 0, nv = 0;
      for (let i = 0; i < N; i++) if (X[i][d] & bit) {
        if (isNov[i]) nv++; else { count++; if (ns[i].stroke) st++; if (lvl[i] === 'senior') sr++; else if (lvl[i] === 'competent') cp++; }
      }
      c += H_COVER * Math.abs(count - dem[label]);
      c += H_SKILL * (Math.max(0, sk[label] - st) + Math.max(0, sen[label] - sr) + Math.max(0, com[label] - cp));
      if (useNovice) c += H_SKILL * Math.abs(nv - nov[label]);
      if (mentorOn) { const team = ns.filter((_, i) => X[i][d] & bit); if (team.some(n => levelOf(n) === 'novice')) c += H_MENTOR * matchTeam(p, team).unmatched.length; }
    }
    return c;
  }

  // ---------- เริ่มต้น: วางเวรให้ครบจำนวนคนทีละวัน (greedy) ----------
  const unitsSoFar = ns.map(() => 0);
  for (let d = 0; d < D; d++) {
    for (const [label, bit] of [...SHIFT_BITS].sort(() => rnd() - 0.5)) {
      const pickFrom = (wantNov: boolean, need: number, prefer?: (i: number) => boolean) => {
        let have = ns.filter((_, i) => isNov[i] === wantNov && (X[i][d] & bit) && (!prefer || prefer(i))).length;
        const cands = ns.map((_, i) => i).filter(i => isNov[i] === wantNov && free[i][d] && !(X[i][d] & bit) && allowed[i][d].includes(X[i][d] | bit) && (!prefer || prefer(i)));
        const prevBad = (i: number) => { const pm = d > 0 ? X[i][d - 1] : (before[i].at(-1) ?? 0); return (!front && bit === 1 && (pm & 4)) || (front && bit === 2 && (pm & 1)) ? 50 : 0; };
        cands.sort((a, b) => (unitsSoFar[a] + prevBad(a) + (X[a][d] ? 3 : 0) + rnd()) - (unitsSoFar[b] + prevBad(b) + (X[b][d] ? 3 : 0) + rnd()));
        for (const i of cands) { if (have >= need) break; X[i][d] |= bit; unitsSoFar[i]++; have++; }
      };
      pickFrom(false, sk[label], i => !!ns[i].stroke);
      pickFrom(false, sen[label], i => lvl[i] === 'senior');
      pickFrom(false, com[label], i => lvl[i] === 'competent');
      pickFrom(false, dem[label]);
      if (useNovice) pickFrom(true, nov[label]);
    }
  }

  const rowH = ns.map(() => 0), rowS = ns.map(() => 0), dayC = Array.from({ length: D }, () => 0);
  for (let i = 0; i < N; i++) [rowH[i], rowS[i]] = rowCost(i);
  for (let d = 0; d < D; d++) dayC[d] = dayCost(d);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  let hard = sum(rowH) + sum(dayC), soft = sum(rowS);
  let best = { hard, soft, X: X.map(r => r.slice()) };

  // ---------- ค้นหา ----------
  const freeCells = ns.map((_, i) => Array.from({ length: D }, (_, d) => d).filter(d => free[i][d]));
  let iter = 0, hard0At = -1, T = 3;
  const deadline = t0 + timeMs;
  while (true) {
    iter++;
    if ((iter & 1023) === 0) {
      const now = Date.now();
      if (now > deadline) break;
      const frac = (now - t0) / timeMs;
      T = Math.max(0.05, 3 * (1 - frac) ** 2);
      onProgress?.(Math.min(99, Math.round(frac * 100)));
      if (best.hard === 0 && hard0At >= 0 && ((now - t0 > Math.min(timeMs * 0.35, 2500) && iter - hard0At > 150_000) || frac > 0.6)) break;
    }
    // เลือกจุดที่จะแก้: เน้นวัน/คนที่ยังผิดกฎ
    let i: number, d: number;
    const r = rnd();
    if (hard > 0 && r < 0.45) {
      const badDays = []; for (let k = 0; k < D; k++) if (dayC[k] > 0) badDays.push(k);
      if (badDays.length) { d = badDays[Math.floor(rnd() * badDays.length)]; i = Math.floor(rnd() * N); }
      else { const badRows = []; for (let k = 0; k < N; k++) if (rowH[k] > 0) badRows.push(k); i = badRows.length ? badRows[Math.floor(rnd() * badRows.length)] : Math.floor(rnd() * N); d = Math.floor(rnd() * D); }
    } else if (hard > 0 && r < 0.75) {
      const badRows = []; for (let k = 0; k < N; k++) if (rowH[k] > 0) badRows.push(k);
      i = badRows.length ? badRows[Math.floor(rnd() * badRows.length)] : Math.floor(rnd() * N); d = Math.floor(rnd() * D);
    } else { i = Math.floor(rnd() * N); d = Math.floor(rnd() * D); }
    if (!free[i][d]) { const fc = freeCells[i]; if (!fc.length) continue; d = fc[Math.floor(rnd() * fc.length)]; }

    const mv = rnd();
    if (mv < 0.25) {
      // โอน 1 เวรจากคนนี้ให้อีกคนในวันเดียวกัน (จำนวนคนต่อเวรเท่าเดิม ใช้เกลี่ยภาระงาน)
      const j = Math.floor(rnd() * N);
      if (j === i || !free[j][d] || isNov[i] !== isNov[j] || !X[i][d]) continue;
      const bits = [1, 2, 4].filter(b => (X[i][d] & b) && !(X[j][d] & b)); if (!bits.length) continue;
      const bit = bits[Math.floor(rnd() * bits.length)], mi = X[i][d], mj = X[j][d], ni = mi & ~bit, nj = mj | bit;
      if (!allowed[i][d].includes(ni) || !allowed[j][d].includes(nj)) continue;
      const oH = rowH[i] + rowH[j], oS = rowS[i] + rowS[j], oD = dayC[d];
      X[i][d] = ni; X[j][d] = nj;
      const [hi, si] = rowCost(i), [hj, sj] = rowCost(j), nd = dayCost(d);
      const dH = hi + hj + nd - oH - oD, dS = si + sj - oS, delta = dH + dS;
      if (delta <= 0 || rnd() < Math.exp(-delta / T)) { rowH[i] = hi; rowH[j] = hj; rowS[i] = si; rowS[j] = sj; dayC[d] = nd; hard += dH; soft += dS; }
      else { X[i][d] = mi; X[j][d] = mj; continue; }
    } else if (mv < 0.6) {
      // สลับเวรกับอีกคนในวันเดียวกัน
      const j = Math.floor(rnd() * N);
      if (j === i || !free[j][d] || X[i][d] === X[j][d] || isNov[i] !== isNov[j]) continue;
      const mi = X[i][d], mj = X[j][d];
      if (!allowed[i][d].includes(mj) || !allowed[j][d].includes(mi)) continue;
      const oH = rowH[i] + rowH[j], oS = rowS[i] + rowS[j], oD = dayC[d];
      X[i][d] = mj; X[j][d] = mi;
      const [hi, si] = rowCost(i), [hj, sj] = rowCost(j), nd = dayCost(d);
      const dH = hi + hj + nd - oH - oD, dS = si + sj - oS, delta = dH + dS;
      if (delta <= 0 || rnd() < Math.exp(-delta / T)) { rowH[i] = hi; rowH[j] = hj; rowS[i] = si; rowS[j] = sj; dayC[d] = nd; hard += dH; soft += dS; }
      else { X[i][d] = mi; X[j][d] = mj; continue; }
    } else {
      // เปลี่ยนเวรของคนเดียว
      const opts = allowed[i][d], old = X[i][d];
      const m = opts[Math.floor(rnd() * opts.length)]; if (m === old) continue;
      const oH = rowH[i], oS = rowS[i], oD = dayC[d];
      X[i][d] = m;
      const [h, s] = rowCost(i), nd = dayCost(d);
      const dH = h + nd - oH - oD, dS = s - oS, delta = dH + dS;
      if (delta <= 0 || rnd() < Math.exp(-delta / T)) { rowH[i] = h; rowS[i] = s; dayC[d] = nd; hard += dH; soft += dS; }
      else { X[i][d] = old; continue; }
    }
    if (hard < best.hard || (hard === best.hard && soft < best.soft - 1e-9)) {
      best = { hard, soft, X: X.map(r => r.slice()) };
      if (hard === 0 && hard0At < 0) hard0At = iter;
    }
  }

  const toRows = (M: Mask[][]): Record<string, Cell[]> => Object.fromEntries(ns.map((n, i) => [n.id, M[i].map((m, d) => fixedCode[i][d] ?? FROM[m])]));
  const rows = toRows(best.X);
  const report = v2 ? ns.map(n => ({ id: n.id, name: n.name, found: summary(rows[n.id], p.base).maxoff >= 3 })) : [];
  const ms = Date.now() - t0;
  if (best.hard > 0) return { ok: false, rows, hard: best.hard, iterations: iter, ms, report };
  // ตรวจซ้ำด้วยตัวตรวจหลัก — ถ้าไม่ตรงกัน ถือว่าไม่ผ่าน (กันตัวนับข้อผิดคลาดเคลื่อน)
  const check = validate({ ...p, rows });
  return { ok: check.valid, rows, hard: check.issues.length, iterations: iter, ms, report };
}
