# วอร์ด 15 คนในเบราว์เซอร์ + เวรรอยต่อเดือน (Playwright)
# ใช้: python3 tests/e2e_large_boundary.py "$PWD/index.html"
import sys, re, time
from playwright.sync_api import sync_playwright
url = 'file://' + sys.argv[1]
errors, ok = [], True
def check(name, cond, detail=''):
    global ok
    ok = ok and bool(cond); print(('PASS ' if cond else 'FAIL ') + name, detail)

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 900})
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    pg.on('dialog', lambda d: d.accept('head@hospital.go.th' if d.type == 'prompt' else None))
    pg.goto(url); pg.wait_for_timeout(500)
    pg.click('#googleBtn'); pg.wait_for_timeout(600)
    pg.fill('#hospSearch', 'มหาราชนครศรี'); pg.keyboard.press('Enter'); pg.click('#profileForm button[type=submit]'); pg.wait_for_timeout(400)
    pg.click('[data-ent="activate"]'); pg.wait_for_timeout(500)  # ใช้สิทธิ์ทดลองกับ ต.ค.
    pg.click('[data-tab="people"]')
    for k in range(10):
        pg.fill('#personName', f'พยาบาล {k + 1:02d}'); pg.click('#personForm button.primary'); pg.wait_for_timeout(80)
    pg.click('[data-tab="roster"]')
    for code, v in (('ช', 4), ('บ', 4), ('ด', 3)): pg.fill(f'#need{code}', str(v))
    pg.click('#staffingForm button.primary'); pg.wait_for_timeout(300)
    n = pg.evaluate('people().length')
    t = time.time(); pg.click('#generateBtn')
    pg.wait_for_function('plan().generatedAt', timeout=60000); secs = time.time() - t
    v = pg.evaluate('({valid: lastValidation.valid, issues: lastValidation.issues.length, units: people().map(n=>lastValidation.sums[n.id].units)})')
    check(f'ตุลาคม: วอร์ด {n} คน จัดครบผ่านทุกกฎ', v['valid'], f"{secs:.1f} วิ · ข้อผิด {v['issues']} · เวร/คน {min(v['units'])}–{max(v['units'])}")
    oct_last = pg.evaluate("Object.fromEntries(people().map(n=>[n.id, plan().rows[n.id].at(-1)]))")
    oct_last6 = pg.evaluate("Object.fromEntries(people().map(n=>[n.id, plan().rows[n.id].slice(-6)]))")

    # เช่ารายเดือน แล้วไป พ.ย.
    pg.click('#pricingBtn'); pg.click('[data-buy="monthly"]'); pg.wait_for_timeout(500)
    pg.select_option('#month', '11'); pg.wait_for_timeout(400)
    prior = pg.evaluate("boundary('prior')")
    check('พ.ย.: เวรรอยต่อดึงวันสุดท้ายของ ต.ค. อัตโนมัติ', all(prior[i][5] == oct_last[i] for i in oct_last), str(list(oct_last.values())[:6]))
    check('พ.ย.: ดึงย้อนหลังครบ 6 วันสำหรับกฎ 7 วัน', all(prior[i] == oct_last6[i] for i in oct_last6))
    labels = pg.eval_on_selector_all('[data-prior-person] strong', 'e=>e.map(x=>x.textContent)')
    sources = set(pg.eval_on_selector_all('.boundary-source', 'e=>e.map(x=>x.textContent)'))
    check('ช่อง "เวรรอยต่อ" แสดงเวรวันที่ 31 ต.ค. และที่มา', labels == [oct_last[i] for i in pg.evaluate('people().map(n=>n.id)')] and sources == {'จากเดือนก่อน'}, f'ที่มา={sources}')
    pg.click('#generateBtn'); pg.wait_for_timeout(300)
    pg.wait_for_function("plan().generatedAt", timeout=60000)
    v2 = pg.evaluate('({valid: lastValidation.valid, issues: lastValidation.issues.map(x=>x.message).slice(0,3)})')
    nov1 = pg.evaluate("Object.fromEntries(people().map(n=>[n.id, plan().rows[n.id][0]]))")
    bad = [i for i, c in oct_last.items() if 'บ' in c and 'ด' in nov1[i]]
    check('พ.ย.: จัดผ่านทุกกฎ รวมรอยต่อจาก ต.ค.', v2['valid'], str(v2['issues']))
    check('คนที่ 31 ต.ค. มี บ ไม่ได้ ด วันที่ 1 พ.ย.', not bad, f'บ วันที่ 31: {sum("บ" in c for c in oct_last.values())} คน')
    pg.screenshot(path='/tmp/claude-0/-home-claude/56f5b8af-90b8-5e89-ab42-847bd6ccbc30/scratchpad/large_nov.png')
    b.close()
print('page errors:', errors)
sys.exit(0 if ok and not errors else 1)
