// สร้าง prototype/hospitals-data.js จาก src/data/hospitals-th.ts (ให้รายชื่อตรงกันทั้งสองฝั่ง)
// ใช้: node scripts/build-prototype-data.mjs ../prototype/hospitals-data.js
import { writeFileSync } from 'node:fs';
const m = await import('../src/profile.ts');
const out = process.argv[2];
const body = `// สร้างอัตโนมัติจาก engine/src/data/hospitals-th.ts — อย่าแก้ไขเอง\nconst HOSPITALS=${JSON.stringify(m.HOSPITALS)};\nconst PROVINCES=${JSON.stringify(m.PROVINCES)};\nconst WARD_TYPES=${JSON.stringify(m.WARD_TYPES)};\nconst GUIDE_WORDS=${JSON.stringify(m.GUIDE_WORDS)};\n`;
writeFileSync(out, body);
console.log('wrote', out, m.HOSPITALS.length, 'hospitals');
