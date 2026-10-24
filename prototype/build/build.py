# สร้าง prototype/index.html จากไฟล์ต้นฉบับ + entitlement.js + hospitals-data.js + profile.js
# ใช้ (จากโฟลเดอร์ prototype): python3 build/build.py build/original.html entitlement.js hospitals-data.js profile.js engine.bundle.js -o index.html
# engine.bundle.js สร้างด้วย: (ใน engine/) npm run browser-engine
import sys, re, pathlib
args = [a for a in sys.argv[1:] if a != '-o']
out = pathlib.Path(sys.argv[sys.argv.index('-o') + 1]) if '-o' in sys.argv else pathlib.Path(args[0])
if '-o' in sys.argv: args.remove(str(out))
sys.argv = [sys.argv[0]] + args
path = pathlib.Path(sys.argv[1]); ent = pathlib.Path(sys.argv[2]).read_text(encoding='utf-8')
s = path.read_text(encoding='utf-8')

def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'expected {count} got {n}: {old[:80]}'
    s = s.replace(old, new)

# --- Top bar: account label = email, logout; pricing button instead of mock-data buttons
rep('<span id="accountLabel">Guest</span><button id="accountBtn">Login</button>',
    '<span id="accountLabel">—</span><button id="accountBtn">ออกจากระบบ</button>')
rep('<button id="mockDownloadBtn">ดาวน์โหลด mock data</button><button id="mockRestoreBtn">โหลด mock data</button>',
    '<button id="mockDownloadBtn" class="hidden">mock</button><button id="mockRestoreBtn" class="hidden">mock</button><button id="pricingBtn" class="primary">ซื้อ / เช่าระบบ</button>')
# --- Entitlement bar under the header
rep('</header>\n<main class="page">', '</header>\n<div id="entBar" class="ent-bar" aria-live="polite"></div>\n<main class="page">')

rep('data-tab="leave">ขอ VA / วันหยุด<','data-tab="leave">วันลา VA / OFF<')
# --- Leave: single-owner account, no approval workflow
rep('<h2>ขอวันหยุดล่วงหน้า</h2>', '<h2>บันทึกวันลา / วันขอหยุด</h2>')
s = re.sub(r'(<section id="panel-leave" class="panel hidden"><h2>บันทึกวันลา / วันขอหยุด</h2><p class="help">)[^<]*(</p>)',
           r'\1วันลาที่บันทึกมีผลทันที ระบบจะไม่จัดเวรในวันนั้น (ไม่มีขั้นตอนอนุมัติ เพราะผู้จัดเวรคือเจ้าของบัญชี) · เลือก VA ในช่องตารางก็บันทึกวันลาให้อัตโนมัติ\2', s, count=1)
rep('<label>สถานะ<select id="leaveStatus">', '<label class="hidden">สถานะ<select id="leaveStatus">')
rep('<label>วันที่ยื่นคำขอ<input type="date" id="leaveRequested" required></label>', '<label>วันที่บันทึก<input type="date" id="leaveRequested" required></label>')
rep('<button class="primary">บันทึกคำขอ</button>', '<button class="primary">บันทึกวันลา</button>')
rep("$('leaveStatus').disabled=!isAdmin();if(!isAdmin())$('leaveStatus').value='pending';", "$('leaveStatus').value='approved';")
rep("status:isAdmin()?$('leaveStatus').value:'pending'", "status:'approved'")
rep("if(r.requested>=r.start)return toast('ต้องยื่นคำขอก่อนวันหยุดอย่างน้อย 1 วัน');", '')
rep("if(r.requested>today())return toast('วันที่ยื่นคำขอต้องไม่เป็นวันในอนาคต');", "if(r.requested>today())return toast('วันที่บันทึกต้องไม่เป็นวันในอนาคต');")
rep("toast('บันทึกคำขอแล้ว — ตารางเดิมจะถูกตรวจใหม่')", "toast('บันทึกวันลาแล้ว — ตารางเดิมจะถูกตรวจใหม่')")
rep("<h3>คำขอที่ครอบคลุมเดือนนี้</h3>", "<h3>วันลาที่ครอบคลุมเดือนนี้</h3>")
rep('<th>ยื่นเมื่อ</th><th>สถานะ</th>', '<th>บันทึกเมื่อ</th>')
s, n = re.subn(r'<td><select data-request="\$\{r\.uid\}".*?</select></td>', '', s, count=1); assert n == 1
rep("${!isAdmin()&&r.status!=='pending'?'disabled':''}", '')
rep("<p class=\"muted\">ยังไม่มีคำขอในเดือนนี้</p>", "<p class=\"muted\">ยังไม่มีวันลาในเดือนนี้</p>")
# Backups may now hold leave recorded on/after its start date.
rep("||(r.requested>=r.start&&!(r.source==='table'&&r.approvedBy==='C7'&&r.status==='approved'))", '')

# --- Replace the C7/admin1234 login with an email login dialog
s, n = re.subn(r'<dialog class="modal" id="loginDialog">.*?</dialog>', '''<dialog class="modal" id="loginDialog" aria-labelledby="loginTitle"><h2 id="loginTitle">เข้าสู่ระบบ</h2><p class="help">ใช้บัญชีเดียวต่อผู้จัดเวร 1 คน · ทดลองจัดตารางฟรี 1 เดือน</p><button type="button" id="googleBtn" class="google-btn">เข้าสู่ระบบด้วย Google</button><div class="or-line"><span>หรือใช้อีเมล</span></div><form id="loginForm"><label>อีเมล<input id="loginEmail" type="email" autocomplete="email" required maxlength="254" placeholder="name@example.com"></label><div id="otpStep" class="hidden"><label class="section-gap">รหัส OTP 6 หลักที่ส่งไปทางอีเมล<input id="loginOtp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"></label><p class="notice warn" id="otpMock"></p></div><p id="loginError" class="status-bad" role="alert"></p><footer><button type="submit" class="primary" id="loginSubmit">ขอรหัส OTP</button></footer></form><p class="footnote">การเข้าสู่ระบบถือว่ายอมรับ <a href="#terms">ข้อตกลงการใช้งาน</a> และ <a href="#privacy">นโยบายความเป็นส่วนตัว</a></p><input id="loginUsername" class="hidden"><input id="loginPassword" class="hidden"><button id="guestBtn" class="hidden" type="button"></button></dialog>''', s, count=1, flags=re.S); assert n == 1

# --- Clear-all: typed confirmation instead of the shared password
rep('ล้างตารางทุกเดือนทั้งสองเวอร์ชัน รวมสี หมายเหตุ ล็อก รอยต่อเดือน และคำขอ VA / OFF ทั้งหมด เก็บรายชื่อ การตั้งค่า และ mock data ล่าสุดไว้',
    'ล้างตารางทุกเดือนทั้งสองเวอร์ชัน รวมสี หมายเหตุ ล็อก รอยต่อเดือน และวันลา VA / OFF ทั้งหมด เก็บรายชื่อและการตั้งค่าไว้ (สิทธิ์ที่ใช้ไปแล้วจะไม่คืน)')
rep('<label>ยืนยันรหัส Login<input id="clearAllPassword" type="password" autocomplete="current-password" required></label>',
    '<label>พิมพ์คำว่า ลบทั้งหมด เพื่อยืนยัน<input id="clearAllPassword" autocomplete="off" required></label>')
rep("if($('clearAllPassword').value!=='admin1234'){$('clearAllError').textContent='รหัสไม่ถูกต้อง ยังไม่มีการลบข้อมูล';",
    "if($('clearAllPassword').value.trim()!=='ลบทั้งหมด'){$('clearAllError').textContent='ข้อความไม่ตรง ยังไม่มีการลบข้อมูล';")

# --- Pricing dialog
rep('<dialog class="modal" id="cellDialog">', '''<dialog class="modal pricing-modal" id="pricingDialog" aria-labelledby="pricingTitle"><header><div><h2 id="pricingTitle">ซื้อ / เช่าระบบ</h2><div class="muted" id="pricingAccount"></div></div><button id="closePricing" aria-label="ปิด">×</button></header><div id="pricingBody"></div><p class="help">1 สิทธิ์ = ตาราง 1 เดือนของ 1 วอร์ด แก้ไขและส่งออกได้ไม่จำกัดภายใน 7 วัน จากนั้นดูได้อย่างเดียวถึงวันที่ 30 แล้วระบบลบข้อมูล · รายเดือน/รายปี = 1 วอร์ดต่อเดือน แก้ไขได้ตลอด และจำรายชื่อไว้ให้ · วอร์ดที่ 2 ในเดือนเดียวกันใช้สิทธิ์รายครั้ง</p><p class="notice warn">ต้นแบบ: ปุ่มชำระเงินจำลองผลสำเร็จทันที ระบบจริงต้องส่งไปยัง Payment Gateway และให้เซิร์ฟเวอร์เพิ่มสิทธิ์หลังได้รับ webhook เท่านั้น</p></dialog>
<dialog class="modal" id="cellDialog">''')
rep('<dialog class="modal" id="cellDialog">', '''<dialog class="modal profile-modal" id="profileDialog" aria-labelledby="profileTitle"><header><div><h2 id="profileTitle">ข้อมูลหน่วยงาน</h2><div class="muted">ใช้ปรับระบบให้ตรงกับรูปแบบเวรของแต่ละโรงพยาบาล</div></div><button type="button" id="profileClose" aria-label="ปิด">×</button></header><form id="profileForm" novalidate><label for="hospSearch">โรงพยาบาล</label><input id="hospSearch" role="combobox" aria-autocomplete="list" aria-controls="hospList" aria-expanded="false" autocomplete="off" placeholder="พิมพ์ชื่อ รพ. ชื่อย่อ หรือจังหวัด"><div class="guide-row"><span class="muted">คำแนะนำ:</span><span id="guideWords" class="guide-words"></span></div><ul id="hospList" class="hosp-list hidden" role="listbox" aria-label="ผลค้นหาโรงพยาบาล"></ul><div id="hospSelected" class="notice hidden" aria-live="polite"></div><div id="customBox" class="form-grid hidden"><label class="full">ชื่อโรงพยาบาล (อื่นๆ)<input id="customName" maxlength="200" placeholder="เช่น โรงพยาบาลชุมชน…"></label><label class="full">จังหวัด<select id="provinceSelect"></select></label></div><label class="section-gap">ประเภทหอผู้ป่วยหลักที่จัดเวร (ไม่บังคับ)<select id="wardTypeSelect"></select></label><label class="check section-gap consent"><input type="checkbox" id="researchConsent"><span>ยินยอมให้ใช้ข้อมูล<b>รูปแบบ</b>การจัดเวร (เช่น โย้หน้า/โย้หลัง จำนวนคนต่อเวร เงื่อนไขที่เปิด) ของหน่วยงานนี้เพื่อวิจัยและพัฒนาระบบ โดยไม่รวมรายชื่อบุคลากร หมายเหตุ หรือวันลารายคน · ถอนความยินยอมได้ตลอดที่หน้านี้</span></label><p id="profileError" class="status-bad" role="alert"></p><footer><button class="primary" type="submit">บันทึก</button></footer></form></dialog>
<dialog class="modal" id="cellDialog">''')

# --- Single owner account: always full rights; boot handled by the entitlement script
rep("const MOCK_KEY=KEY+'_mock';", '// MOCK_KEY แยกตามบัญชี: ใช้ mockKey() แทน')
s = s.replace('MOCK_KEY', 'mockKey()')
rep('function isAdmin()', "function mockKey(){return KEY+'_mock';}\nfunction isAdmin()")
rep('let role=null;', "let role='admin'; // บัญชีอีเมลเดียว = เจ้าของตาราง สิทธิ์แก้ไขเต็ม (สิทธิ์ใช้งานรายเดือนดูที่ Ent)")
rep(",KEY='ward_rn_planner_roles_v3';", ",KEY_BASE='ward_rn_planner_roles_v3';")
rep("const C=RNCore,", "let KEY='ward_rn_planner_roles_v3';\nconst C=RNCore,")
rep("let storageOK=true,loadError='';try{const old=localStorage.getItem(KEY);", "const DEFAULT_STATE=clone(state);\nlet storageOK=true,loadError='';try{const old=null;")
rep("$('accountBtn').onclick=()=>{if(isAdmin())enterAccount('guest');else $('loginDialog').showModal();};", '')
rep("$('guestBtn').onclick=()=>enterAccount('guest');", '')
rep("$('loginDialog').addEventListener('cancel',e=>{e.preventDefault();enterAccount('guest');});", '')
s, n = re.subn(r"\$\('loginForm'\)\.onsubmit=e=>\{e\.preventDefault\(\);if\(\$\('loginUsername'\).*?\};\n", '', s, count=1); assert n == 1
rep("render();$('loginDialog').showModal();if(loadError)", "if(loadError)")

# --- Entitlement layer + styles
rep('</style>', '''.ent-bar{background:#e8f4f2;border-bottom:1px solid #c5ddd9;padding:10px 28px;display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;font-size:14px}.ent-bar.locked{background:#fff6e5;border-color:#f0d79e}.ent-bar.expired{background:#fff2f3;border-color:#e8b9bf}.ent-bar strong{font-size:14px}.ent-bar .grow{flex:1}.ent-bar button{padding:6px 12px;font-size:13px}.ent-chip{background:white;border:1px solid var(--line);border-radius:20px;padding:2px 10px;font-size:12px;white-space:nowrap}.google-btn{width:100%;padding:11px;font-weight:bold}.or-line{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:13px;margin:14px 0}.or-line:before,.or-line:after{content:"";flex:1;border-top:1px solid var(--line)}.pricing-modal{max-width:860px}.price-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.price-card{border:1px solid var(--line);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:6px}.price-card.best{border:2px solid var(--teal);background:#f0faf8}.price-card strong{font-size:24px}.price-card small{color:var(--muted)}.price-card button{margin-top:auto}.price-group{margin:6px 0 4px;font-size:15px}.page [data-locked]{cursor:not-allowed}.profile-modal{max-width:680px}.guide-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0;font-size:13px}.guide-words{display:flex;flex-wrap:wrap;gap:6px}.guide-words .ent-chip{cursor:pointer;padding:3px 10px}.hosp-list{list-style:none;margin:4px 0 8px;padding:4px;border:1px solid var(--line);border-radius:8px;max-height:280px;overflow:auto}.hosp-list li{padding:8px 10px;border-radius:6px;cursor:pointer;display:flex;flex-direction:column}.hosp-list li small{color:var(--muted);font-size:12px}.hosp-list li[aria-selected=true],.hosp-list li:hover{background:#e6f2f0}.hosp-list .custom-opt{border-top:1px dashed var(--line);margin-top:4px;color:var(--teal)}.consent span{font-size:13px;line-height:1.5}.consent{align-items:flex-start}#profileForm>label:first-child{font-size:14px;color:#435c68}#hospSearch{width:100%;margin-top:5px}@media(max-width:900px){.ent-bar{padding:10px 16px}}@media print{.ent-bar{display:none!important}}
</style>''')
# engine ใหม่ (ถ้าส่งไฟล์ที่ 5): แทน <script id="engine"> ของต้นฉบับ
if len(sys.argv) > 5:
    bundle = pathlib.Path(sys.argv[5]).read_text(encoding='utf-8')
    s, n = re.subn(r'(<script id="engine">)[\s\S]*?(</script>)', lambda m: m.group(1) + bundle + m.group(2), s, count=1); assert n == 1
extra = pathlib.Path(sys.argv[3]).read_text(encoding='utf-8') + '\n' + pathlib.Path(sys.argv[4]).read_text(encoding='utf-8')
rep('</body></html>', '<script id="profile">' + extra + '</script><script id="entitlement">' + ent + '</script></body></html>')
out.write_text(s, encoding='utf-8')
print('patched', len(s))
