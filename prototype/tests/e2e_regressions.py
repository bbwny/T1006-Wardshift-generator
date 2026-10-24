# ทดสอบบั๊ก 5 ข้อที่รายงาน (Playwright): python3 tests/e2e_regressions.py "$PWD/index.html"
import sys, re
from playwright.sync_api import sync_playwright
url = 'file://' + sys.argv[1]
errors, results = [], {}
phones = iter(['08123456%02d' % i for i in range(10, 99)])
def check(name, cond, detail=''):
    results[name] = bool(cond); print(('PASS ' if cond else 'FAIL ') + name, detail)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(accept_downloads=True)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    def on_dialog(d):
        if d.type == 'prompt':
            m = re.search(r'รหัสคือ (\d{6})', d.message)
            d.accept('nurse@gmail.com' if 'Google' in d.message else next(phones) if 'เบอร์' in d.message else (m.group(1) if m else ''))
        else: d.accept()
    pg.on('dialog', on_dialog)

    def login(email):
        pg.fill('#loginEmail', email); pg.click('#loginSubmit'); pg.wait_for_timeout(300)
        code = re.search(r'(\d{6})', pg.inner_text('#otpMock')).group(1)
        pg.fill('#loginOtp', code); pg.click('#loginSubmit'); pg.wait_for_timeout(600)
        if pg.is_visible('#profileDialog'):
            pg.fill('#hospSearch', 'รามา'); pg.keyboard.press('Enter'); pg.click('#profileForm button[type=submit]'); pg.wait_for_timeout(400)
    def logout():
        pg.click('#accountBtn'); pg.wait_for_timeout(400)
    def export_csv():
        with pg.expect_download(timeout=15000):
            pg.click('#csvBtn'); pg.wait_for_timeout(400)
            if pg.is_visible('#exportDialog'): pg.check('#exportAcknowledged'); pg.click('#exportConfirm')
        pg.wait_for_timeout(300)

    pg.goto(url); pg.wait_for_timeout(500)

    # --- Bug 3: logout then request OTP again
    login('a@ward.th')
    logout()
    pg.fill('#loginEmail', 'a@ward.th'); pg.click('#loginSubmit'); pg.wait_for_timeout(300)
    check('3 ขอ OTP ใหม่หลังออกจากระบบ', pg.is_visible('#otpStep') and re.search(r'\d{6}', pg.inner_text('#otpMock')))
    code = re.search(r'(\d{6})', pg.inner_text('#otpMock')).group(1)
    pg.fill('#loginOtp', code); pg.click('#loginSubmit'); pg.wait_for_timeout(500)

    # --- Bug 1: mock data must not leak across accounts
    pg.fill('#wardName', 'วอร์ดลับของ A') if not pg.is_disabled('#wardName') else None
    pg.click('#saveBtn'); pg.wait_for_timeout(300)
    keys = pg.evaluate("Object.keys(localStorage).filter(k=>k.includes('_mock')&&!k.startsWith('wsp_'))")
    logout(); login('b@ward.th')
    leaked = pg.evaluate("(()=>{try{return readMock().data.settings.wardName}catch(e){return 'ERR:'+e.message}})()")
    check('1 mock แยกตามบัญชี', all('::' in k for k in keys) and 'วอร์ดลับของ A' not in str(leaked), f'keys={keys} B reads={leaked}')

    # --- Bug 4: trial -> monthly subscription -> unlimited exports
    pg.click('#generateBtn'); pg.wait_for_timeout(7000)
    for _ in range(3): export_csv()
    pg.click('#csvBtn'); pg.wait_for_timeout(500)
    if pg.is_visible('#exportDialog'): pg.check('#exportAcknowledged'); pg.click('#exportConfirm'); pg.wait_for_timeout(500)
    pg.click('[data-buy="monthly"]'); pg.wait_for_timeout(500)
    ok4 = True
    try: export_csv(); export_csv()
    except Exception as e: ok4 = False
    check('4 เช่ารายเดือนหลังทดลอง ส่งออกเกิน 3 ครั้งได้', ok4 and not pg.is_visible('#pricingDialog'), pg.inner_text('#entBar').replace('\n', ' | ')[:120])
    check('4b ไม่มีข้อความทดลองใช้ท้ายตารางหลังเช่า', 'ทดลองใช้' not in pg.inner_text('#tableRemarks'))

    # --- Bug 5: open cell dialog, rights expire, saving must be blocked
    logout(); login('c@ward.th')
    pg.click('[data-ent="activate"]'); pg.wait_for_timeout(600)
    pg.click('[data-cell="rn1:0"]'); pg.wait_for_timeout(200)
    pg.evaluate("(()=>{const r=Date.now.bind(Date);Date.now=()=>r()+8*86400000;})()")  # เวลาผ่านไป 8 วัน
    pg.evaluate("Ent.decorate()"); pg.wait_for_timeout(300)
    closed = not pg.is_visible('#cellDialog')
    # even if a stale handler runs, the mutation guard must refuse
    before = pg.evaluate("plan().rows['rn1'][0]")
    pg.evaluate("""()=>{edit={id:'rn1',d:0,code:'ด',color:''};try{applyCellEdit()}catch(e){}}"""); pg.wait_for_timeout(200)
    after = pg.evaluate("plan().rows['rn1'][0]")
    check('5 หน้าต่างแก้ช่องปิดและบันทึกไม่ได้เมื่อสิทธิ์หมด', closed and before == after, f'closed={closed} before={before!r} after={after!r}')

    # --- Bug 2: unreadable account data is preserved, not overwritten
    logout()
    pg.evaluate("localStorage.setItem('ward_rn_planner_roles_v3::d@ward.th','{\"broken\":true')")
    with pg.expect_download(timeout=10000) as dl:
        login('d@ward.th')
    raw_kept = pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('ward_rn_planner_roles_v3::d@ward.th::unreadable::')).map(k=>localStorage.getItem(k))")
    check('2 ข้อมูลอ่านไม่ได้ถูกเก็บสำเนา + ดาวน์โหลด', raw_kept == ['{"broken":true'] and 'unreadable' in dl.value.suggested_filename, dl.value.suggested_filename)
    b.close()

print('page errors:', errors)
sys.exit(0 if all(results.values()) and not errors else 1)
