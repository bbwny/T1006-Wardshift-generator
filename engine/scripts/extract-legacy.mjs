// ดึง RNCore เดิมจากไฟล์ HTML มาเป็นโมดูล CommonJS เพื่อใช้ทดสอบเทียบผล (parity)
// ใช้: node scripts/extract-legacy.mjs <input.html> <output.cjs>
import { readFileSync, writeFileSync } from 'node:fs';
const [, , input, output] = process.argv;
const html = readFileSync(input, 'utf8');
const m = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if (!m) { console.error('ไม่พบ <script id="engine"> ในไฟล์'); process.exit(1); }
writeFileSync(output, '// สร้างอัตโนมัติจาก ' + input + ' — อย่าแก้ไขเอง\n' + m[1]);
console.log('wrote', output);
