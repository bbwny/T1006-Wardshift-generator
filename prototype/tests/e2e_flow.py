# ทดสอบต้นแบบในเบราว์เซอร์ (Playwright): python3 tests/e2e_flow.py "$PWD/index.html" /tmp
import sys, re
from playwright.sync_api import sync_playwright
url = 'file://' + sys.argv[1]
shots = sys.argv[2]
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1400, 'height': 900})
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and errors.append('console: ' + m.text))
    dialogs = []
    def on_dialog(d):
        dialogs.append(d.message)
        if d.type == 'prompt':
            msg = d.message
            if 'อีเมล Google' in msg: d.accept('nurse@gmail.com')
            elif 'เบอร์' in msg: d.accept('0812345678')
            else:
                m = re.search(r'รหัสคือ (\d{6})', msg); d.accept(m.group(1) if m else '')
        else: d.accept()
    pg.on('dialog', on_dialog)
    pg.goto(url); pg.wait_for_timeout(600)
    assert pg.is_visible('#loginDialog'), 'login dialog not shown'
    pg.screenshot(path=shots + '/1_login.png')
    # email OTP login
    pg.fill('#loginEmail', 'head@ward.th'); pg.click('#loginSubmit'); pg.wait_for_timeout(300)
    code = re.search(r'(\d{6})', pg.inner_text('#otpMock')).group(1)
    pg.fill('#loginOtp', code); pg.click('#loginSubmit'); pg.wait_for_timeout(500)
    assert not pg.is_visible('#loginDialog'), 'still on login'
    assert pg.is_visible('#profileDialog'), 'profile registration should open'
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    assert pg.is_visible('#profileDialog'), 'first-time profile must not be dismissible'
    pg.click('[data-guide="มหาราช"]'); pg.wait_for_timeout(200)
    print('guide results:', pg.eval_on_selector_all('#hospList li strong', 'e=>e.map(x=>x.textContent)')[:4])
    pg.fill('#hospSearch', 'รพ.ท่าศา'); pg.wait_for_timeout(200)
    pg.screenshot(path=shots + '/1b_profile.png')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
    print('selected:', pg.inner_text('#hospSelected'))
    pg.select_option('#wardTypeSelect', 'อายุรกรรม'); pg.check('#researchConsent')
    pg.click('#profileForm button[type=submit]'); pg.wait_for_timeout(500)
    assert not pg.is_visible('#profileDialog')
    print('bar0:', pg.inner_text('#entBar'))
    assert pg.is_disabled('#needช'), 'inputs should be locked before activation'
    pg.screenshot(path=shots + '/2_locked.png')
    # activate trial (needs phone OTP for email login) via generate
    pg.click('#generateBtn'); pg.wait_for_timeout(8000)
    print('bar1:', pg.inner_text('#entBar'))
    assert 'ทดลองฟรี' in pg.inner_text('#entBar')
    assert not pg.is_disabled('#needช')
    filled = pg.eval_on_selector_all('[data-cell]', 'els=>els.filter(e=>e.textContent.trim()&&e.textContent.trim()!=="·").length')
    print('filled cells:', filled)
    # export 3 times (CSV), 4th must open pricing
    for i in range(3):
        with pg.expect_download(timeout=15000) as dl:
            pg.click('#csvBtn')
            pg.wait_for_timeout(400)
            if pg.is_visible('#exportDialog'):
                pg.check('#exportAcknowledged'); pg.click('#exportConfirm')
        print('download', i + 1, dl.value.suggested_filename)
        pg.wait_for_timeout(300)
    print('btn:', pg.inner_text('#csvBtn'))
    pg.click('#csvBtn'); pg.wait_for_timeout(400)
    if pg.is_visible('#exportDialog'):
        pg.check('#exportAcknowledged'); pg.click('#exportConfirm'); pg.wait_for_timeout(500)
    assert pg.is_visible('#pricingDialog'), 'pricing should open after 3 trial exports'
    pg.screenshot(path=shots + '/3_pricing.png')
    # buy 3 credits
    pg.click('[data-buy="credit3"]'); pg.wait_for_timeout(500)
    print('bar2:', pg.inner_text('#entBar'))
    # ward mismatch: next month, activate credit, export, rename ward, export again -> uses credit
    pg.select_option('#month', '11'); pg.wait_for_timeout(300)
    pg.click('[data-ent="activate"]'); pg.wait_for_timeout(500)
    with pg.expect_download(timeout=15000) as dl:
        pg.click('#csvBtn'); pg.wait_for_timeout(400)
        if pg.is_visible('#exportDialog'): pg.check('#exportAcknowledged'); pg.click('#exportConfirm')
    pg.fill('#wardName', 'วอร์ด B'); pg.click('#staffingForm button.primary'); pg.wait_for_timeout(300)
    with pg.expect_download(timeout=15000) as dl:
        pg.click('#csvBtn'); pg.wait_for_timeout(400)
        if pg.is_visible('#exportDialog'): pg.check('#exportAcknowledged'); pg.click('#exportConfirm')
    print('bar3:', pg.inner_text('#entBar'))
    assert 'สิทธิ์คงเหลือ 1' in pg.inner_text('#entBar'), 'ward B should consume a credit'
    # simulate expiry: push editUntil to the past in mock server
    pg.evaluate("""()=>{const db=JSON.parse(localStorage.getItem('wsp_mock_server_v1'));const m=db.accounts['head@ward.th'].months['2026-11'];m.editUntil=Date.now()-1000;localStorage.setItem('wsp_mock_server_v1',JSON.stringify(db));}""")
    pg.reload(); pg.wait_for_timeout(800)
    pg.select_option('#month', '11'); pg.wait_for_timeout(300)
    print('bar4:', pg.inner_text('#entBar'))
    assert pg.is_disabled('#needช')
    pg.screenshot(path=shots + '/4_expired.png')
    # leave tab: no approval select
    assert pg.locator('#leaveStatus').is_hidden()
    ev = pg.evaluate("JSON.parse(localStorage.getItem('wsp_mock_analytics')||'[]')")
    print('analytics events:', [(e['event'], e['month'], e['hospitalName'], e['wardType'], e['nightMode'], e['staff']['total']) for e in ev])
    assert any(e['event']=='roster_generated' for e in ev) and any(e['event']=='roster_exported' for e in ev)
    assert all('name' not in str(e.get('staff')) for e in ev)
    # edit profile -> custom hospital
    pg.click('[data-ent="profile"]'); pg.wait_for_timeout(300)
    pg.fill('#hospSearch', 'โรงพยาบาลไม่มีในลิสต์ xyz'); pg.wait_for_timeout(200)
    print('no-match list:', pg.inner_text('#hospList'))
    pg.click('[data-hosp="custom"]'); pg.wait_for_timeout(200)
    pg.fill('#customName', 'โรงพยาบาลทดสอบชุมชน'); pg.click('#profileForm button[type=submit]'); pg.wait_for_timeout(200)
    print('err without province:', pg.inner_text('#profileError'))
    pg.select_option('#provinceSelect', 'นครศรีธรรมราช'); pg.click('#profileForm button[type=submit]'); pg.wait_for_timeout(400)
    print('bar5:', pg.inner_text('#entBar').replace('\n',' | '))
    print('dialogs:', len(dialogs))
    b.close()
print('ERRORS:', errors)
sys.exit(1 if errors else 0)
