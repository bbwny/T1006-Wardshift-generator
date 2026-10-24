# Ward Shift Planner

ระบบจัดตารางเวรพยาบาลวิชาชีพ (RN) สำหรับหอผู้ป่วยในประเทศไทย รองรับเวรเช้า–บ่าย–ดึก เวรคู่ ดึกโย้หน้า/โย้หลัง VA วันหยุดราชการ OT ระดับ Senior/Competent/Novice พี่เลี้ยง และ Stroke nurse พร้อมระบบสิทธิ์ใช้งานแบบทดลองฟรี / ซื้อรายครั้ง / เช่ารายเดือน

> สถานะ: **ต้นแบบ (prototype)** — ระบบสิทธิ์, Login และการชำระเงินในหน้าเว็บเป็นการจำลอง ต้องเชื่อมเซิร์ฟเวอร์จริงก่อนเปิดใช้งาน

## โครงสร้าง

```
ward-shift-planner/
├── README.md
├── docs/
│   └── SPEC.md                 ← สเปกธุรกิจ, API, ฐานข้อมูล, งานค้าง (อ่านก่อน)
├── prototype/
│   ├── index.html              ← ต้นแบบหน้าเว็บ เปิดในเบราว์เซอร์ได้ทันที (ไฟล์ที่สร้างแล้ว)
│   ├── entitlement.js          ← ชั้นสิทธิ์ใช้งาน + MockServer (ฝังอยู่ใน index.html แล้ว)
│   ├── profile.js              ← ลงทะเบียนหน่วยงาน + ค้นหา รพ. (ฝังแล้ว)
│   ├── hospitals-data.js       ← รายชื่อ รพ. (สร้างจาก engine)
│   ├── engine.bundle.js        ← engine ใหม่สำหรับเบราว์เซอร์ (สร้างจาก engine, ฝังแทน RNCore เดิม)
│   ├── build/                  ← original.html + build.py (แก้ไฟล์ .js แล้วสร้าง index.html ใหม่)
│   └── tests/                  ← ทดสอบในเบราว์เซอร์ (Playwright): flow หลัก + บั๊กที่เคยพบ
└── engine/                     ← TypeScript
    ├── src/
    │   ├── types.ts            ← type ของข้อมูลทั้งหมด
    │   ├── engine.ts           ← กฎเวร, validate, generate (แปลงจาก RNCore เดิม)
    │   ├── local.ts            ← ตัวจัดเวร local search สำหรับวอร์ด 12–25+ คน
    │   ├── entitlement.ts      ← กติกาสิทธิ์ (ใช้ฝั่งเซิร์ฟเวอร์)
    │   ├── profile.ts          ← ค้นหา รพ., ตรวจโปรไฟล์, event วิจัย
    │   └── data/hospitals-th.ts← รายชื่อ รพ. 186 แห่ง (ฉบับตั้งต้น)
    ├── test/                   ← ชุดทดสอบ 26 รายการ
    └── scripts/                ← ดึง engine เดิม / สร้างข้อมูลให้ต้นแบบ
```

## เริ่มต้น

### ต้นแบบหน้าเว็บ
เปิด `prototype/index.html` ด้วย Chrome หรือ Edge

1. เข้าสู่ระบบด้วยอีเมล (รหัส OTP แสดงบนหน้าจอ เพราะเป็นการจำลอง) หรือปุ่ม Google
2. ลงทะเบียนหน่วยงาน: ค้นหา รพ. (ลองพิมพ์ "รามา", "มหาราช", "รพ.ท่าศาลา") หรือเลือก "อื่นๆ"
3. กด "สร้างตารางเวร" → ระบบถามใช้สิทธิ์ทดลองฟรี (ผู้ใช้อีเมลต้องยืนยันเบอร์โทร)
4. ส่งออกได้ 3 ครั้ง แล้วหน้าซื้อ/เช่าจะเปิด (การชำระเงินจำลองสำเร็จทันที)

ล้างข้อมูลจำลอง: DevTools → Application → Local Storage → ลบคีย์ `wsp_*` และ `ward_rn_planner_*`

### Engine (TypeScript)
ต้องใช้ Node.js 22.18 ขึ้นไป (รันไฟล์ `.ts` ได้โดยตรง) และ TypeScript 5.7+

```bash
cd engine
npm install            # ติดตั้ง typescript
npm test               # รันชุดทดสอบทั้งหมด
npm run typecheck
npm run build          # ได้ dist/ (ESM + .d.ts)
npm run bench          # วัดผลตัวจัดเวรกับวอร์ด 12–25 คน
npm run browser-engine # สร้าง prototype/engine.bundle.js
npm run prototype-data # สร้าง prototype/hospitals-data.js
```

ใช้งาน:

```ts
import { generate, validate, activateMonth, authorizeExport, searchHospitals } from '@ward-shift-planner/engine';

const result = generate({ nurses, D: 30, base: 21, rows: {}, requests, prior, next, locks, nightMode: 'back', demand: { 'ช': 3, 'บ': 3, 'ด': 3 } });
const check = validate({ ...params, rows: result.rows! });   // ใช้ตรวจซ้ำฝั่งเซิร์ฟเวอร์ก่อนอนุญาตส่งออก
```

## ชุดทดสอบ

| ไฟล์ | ตรวจอะไร |
|---|---|
| `parity.test.ts` | ผลของ engine.ts ตรงกับ RNCore เดิมใน HTML (สุ่ม 300 ตาราง, 2,000 ลำดับเวร, generate ด้วย seed เดียวกัน) |
| `local.test.ts` | วอร์ด 12–20 คน, โย้หน้า + Stroke + Senior + VA + ล็อก, เวรรอยต่อเดือน, หน้า 2, Novice + พี่เลี้ยง |
| `rules.test.ts` | โย้หน้า/โย้หลัง, บ่ายต่อดึก, ดึกต่อเช้า, เวรซ้ำ, 8 เวร/7 วัน, generate ได้ตารางที่ผ่าน |
| `entitlement.test.ts` | ทดลองฟรี, โควตาส่งออก 3 ครั้ง, ล็อก 7 วัน, ลบวันที่ 31, ผูกวอร์ด, รายเดือน |
| `profile.test.ts` | รายชื่อ รพ. ไม่ซ้ำ, การค้นหา, ตรวจโปรไฟล์, event วิจัยไม่มีชื่อบุคลากร |

ทดสอบต้นแบบในเบราว์เซอร์ (ต้องมี Python + Playwright):

```bash
cd prototype
python3 tests/e2e_flow.py "$PWD/index.html" /tmp        # Login → ลงทะเบียน → ทดลอง → ส่งออก 3 ครั้ง → ซื้อ → ผูกวอร์ด → หมดสิทธิ์
python3 tests/e2e_regressions.py "$PWD/index.html"      # บั๊ก 5 ข้อที่เคยพบ (24 ต.ค. 2569)
python3 tests/e2e_large_boundary.py "$PWD/index.html"   # วอร์ด 15 คน + เวรรอยต่อ ต.ค. → พ.ย.
```

ถ้าแก้ engine เดิมใน HTML ให้รัน `npm run legacy` เพื่อดึง engine ใหม่มาเทียบ

## เวรรอยต่อเดือน

เมื่อเปิดเดือนถัดไป ระบบดึงเวร 6 วันสุดท้ายของเดือนก่อน (หน้าเดียวกัน) มาเป็นรอยต่ออัตโนมัติ แสดงในช่อง "เวรรอยต่อ" หลังชื่อ (ที่มา: จากเดือนก่อน) และใช้ตรวจบ่ายต่อดึก ดึกต่อเช้า เวรซ้ำ และ 8 เวร/7 วันข้ามเดือน แก้ทับรายคนได้ และในทางกลับกันจะดึงเวร 6 วันแรกของเดือนถัดไป (ถ้ามี) มาตรวจปลายเดือน

## กฎเวรดึก

| | ดึกวันที่ 6 หมายถึง | เวรคู่ที่อนุญาต |
|---|---|---|
| โย้หลัง (ค่าเริ่มต้น) | ไปคืนวันที่ 5 ทำงาน 00:01–08:00 วันที่ 6 | ช/บ, ด/บ |
| โย้หน้า | ไปคืนวันที่ 6 ทำงาน 00:01–08:00 วันที่ 7 | ช/บ, ช/ด |

engine แปลงช่องตารางเป็นวันทำงานจริงก่อนตรวจกฎทุกข้อ (`temporalIssues`)

## สิ่งที่ต้องทำก่อนเปิดใช้จริง

ดูรายละเอียดใน `docs/SPEC.md` §5 และ §7 โดยสรุป:

1. แทน `MockServer`/`Api` ใน `prototype/entitlement.js` ด้วย API จริง ให้เซิร์ฟเวอร์ตัดสินสิทธิ์ทุกครั้ง
2. ย้ายปฏิทินวันหยุดและรายชื่อ รพ. ลงฐานข้อมูล ตรวจรายชื่อกับรหัสสถานพยาบาลของ สธ.
3. สร้างไฟล์ส่งออกฝั่งเซิร์ฟเวอร์ และตรวจตารางซ้ำก่อนนับสิทธิ์
4. Payment Gateway + webhook, PDPA, consent log

## ที่มา

พัฒนาต่อจาก `RN_Shift_Planner_Mentor.html` (ตารางเวร RN อายุรกรรมชาย C7) ฟอนต์ที่ฝังในหน้าเว็บคือ Noto Sans Thai (SIL Open Font License 1.1)
