// รวม engine.ts + local.ts เป็นสคริปต์เบราว์เซอร์ที่ประกาศ RNCore (API เดียวกับไฟล์ต้นฉบับ)
// ใช้: node scripts/build-browser-engine.mjs ../prototype/engine.bundle.js
// ระบบจริง: ใช้ bundler (esbuild/vite) แทนสคริปต์นี้
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const out = process.argv[2];
const dir = mkdtempSync(join(tmpdir(), 'wsp-'));
try {
  execFileSync('tsc', ['-p', 'tsconfig.json', '--outDir', dir, '--declaration', 'false'], { stdio: 'inherit' });
  const strip = f => readFileSync(join(dir, f), 'utf8').replace(/^import[^;]*;\s*$/gm, '').replace(/^export \{[^}]*\};?\s*$/gm, '').replace(/^export (const|function|let)/gm, '$1');
  const names = ['nightMode', 'activeCodes', 'allowedMasks', 'temporalIssues', 'rollingEnabled', 'levelOf', 'mentorEligible', 'matchTeam', 'competentNeed', 'enabled', 'isNovice', 'seniorNeed', 'noviceNeed', 'demand', 'skill', 'CODES', 'MASK', 'W', 'FROM', 'days', 'key', 'weekday', 'holidays', 'calendar', 'summary', 'validate', 'generate', 'preflight', 'solveGroup', 'solveLocal'];
  const body = `/* สร้างอัตโนมัติจาก engine/src (engine.ts + local.ts) — อย่าแก้ไขเอง */\n(function(root){\n'use strict';\n${strip('engine.js')}\n${strip('local.js')}\nroot.RNCore={${names.join(',')}};\nif(typeof module!=='undefined')module.exports=root.RNCore;\n})(typeof self!=='undefined'?self:globalThis);\n`;
  writeFileSync(out, body);
  console.log('wrote', out, body.length, 'chars');
} finally { rmSync(dir, { recursive: true, force: true }); }
