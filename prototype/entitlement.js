'use strict';
/* ==========================================================================
 * Entitlement layer (ต้นแบบ) — Login อีเมล, สิทธิ์รายเดือน, ล็อกการแก้ไข,
 * จำกัดการส่งออก และผูกเดือนกับวอร์ด
 *
 * !! สำคัญสำหรับทีม dev !!
 * `MockServer` ด้านล่างจำลองเซิร์ฟเวอร์ใน localStorage เพื่อให้ทดลองกดดูได้เท่านั้น
 * ระบบจริงต้องย้ายทุกเมธอดใน `Api` ไปเรียก HTTP endpoint (ดู SPEC.md §5)
 * และให้เซิร์ฟเวอร์เป็นผู้ตัดสินสิทธิ์ทุกครั้ง โค้ดฝั่งเบราว์เซอร์แก้ได้เสมอ
 * ========================================================================== */
const ENT = {
  EDIT_DAYS: 7,          // แก้ไข/ส่งออกได้ 7 วันหลังเริ่มใช้สิทธิ์
  RETAIN_DAYS: 30,       // ลบข้อมูลวันที่ 31
  TRIAL_EXPORTS: 3,      // ทดลองฟรีส่งออกได้ 3 ครั้ง
  DAY: 86400000
};
const PRICING = [
  { id: 'credit1', group: 'credits', label: '1 สิทธิ์', price: 99, credits: 1, note: 'ตาราง 1 เดือน' },
  { id: 'credit3', group: 'credits', label: '3 สิทธิ์', price: 249, credits: 3, note: 'เฉลี่ย 83 บาท/สิทธิ์' },
  { id: 'credit5', group: 'credits', label: '5 สิทธิ์', price: 399, credits: 5, note: 'เฉลี่ย 80 บาท/สิทธิ์', best: true },
  { id: 'monthly', group: 'subscription', label: 'รายเดือน', price: 249, unit: '/ เดือน', months: 1, note: '1 วอร์ด · แก้ไขได้ตลอด · จำรายชื่อ' },
  { id: 'yearly', group: 'subscription', label: 'รายปี', price: 2490, unit: '/ ปี', months: 12, note: 'ฟรี 2 เดือน · 1 วอร์ด', best: true }
];
const normWard = w => String(w || '').trim().replace(/\s+/g, ' ').toLowerCase();
const thDate = t => new Date(t).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const monthLabel = k => { const [y, m] = k.split('-').map(Number); return MONTHS[m - 1] + ' ' + (y + 543); };

/* ---------------- MOCK SERVER — แทนที่ด้วย backend จริง ---------------- */
const MockServer = (() => {
  const DB_KEY = 'wsp_mock_server_v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(DB_KEY)) || { accounts: {}, trialPhones: [], otp: {} }; } catch { return { accounts: {}, trialPhones: [], otp: {} }; } };
  const db = load();
  const persist = () => localStorage.setItem(DB_KEY, JSON.stringify(db));
  const err = (code, message) => Object.assign(new Error(message), { code });
  const now = () => Date.now();
  function account(email) {
    if (!db.accounts[email]) db.accounts[email] = { email, provider: 'email', phoneVerified: false, phone: null, trialUsed: false, credits: 0, subscription: null, months: {}, createdAt: now() };
    return db.accounts[email];
  }
  const subActive = a => !!a.subscription && a.subscription.until > now();
  const upgrade = m => Object.assign(m, { source: 'subscription', editUntil: null, deleteAt: null, exportLimit: null });
  function purge(a) { // ระบบจริง: cron job ฝั่งเซิร์ฟเวอร์ ลบข้อมูลตาราง + แจ้งเตือนล่วงหน้า 3 วัน
    for (const m of Object.values(a.months)) if (m.source !== 'subscription' && !m.purged && m.deleteAt < now()) m.purged = true;
  }
  function publicAccount(a) { purge(a); persist(); return JSON.parse(JSON.stringify({ ...a, subscriptionActive: subActive(a), serverTime: now() })); }
  return {
    requestOtp(email) { const code = String(Math.floor(100000 + Math.random() * 900000)); db.otp[email] = { code, exp: now() + 10 * 60000 }; persist(); return { mockCode: code }; },
    verifyOtp(email, code) { const o = db.otp[email]; if (!o || o.exp < now() || o.code !== code) throw err('OTP_INVALID', 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ'); delete db.otp[email]; const a = account(email); persist(); return publicAccount(a); },
    google(email) { const a = account(email); a.provider = 'google'; persist(); return publicAccount(a); },
    get(email) { return publicAccount(account(email)); },
    requestPhoneOtp(email, phone) { const code = String(Math.floor(100000 + Math.random() * 900000)); db.otp['phone:' + email] = { code, phone, exp: now() + 10 * 60000 }; persist(); return { mockCode: code }; },
    verifyPhone(email, code) {
      const o = db.otp['phone:' + email]; if (!o || o.exp < now() || o.code !== code) throw err('OTP_INVALID', 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ');
      if (db.trialPhones.includes(o.phone)) throw err('PHONE_USED', 'เบอร์นี้ใช้สิทธิ์ทดลองไปแล้ว');
      const a = account(email); a.phone = o.phone; a.phoneVerified = true; delete db.otp['phone:' + email]; persist(); return publicAccount(a);
    },
    activateMonth(email, month) {
      const a = account(email), t = now(), cur = a.months[month];
      if (subActive(a)) { a.months[month] = { ...(cur || {}), source: 'subscription', activatedAt: t, editUntil: null, deleteAt: null, exportsUsed: cur?.exportsUsed || 0, exportLimit: null, wards: cur?.wards || [], purged: false }; persist(); return publicAccount(a); }
      if (cur && !cur.purged && cur.editUntil > t) return publicAccount(a); // ยังอยู่ในช่วงสิทธิ์
      let source;
      if (!a.trialUsed && !cur) {
        if (a.provider !== 'google' && !a.phoneVerified) throw err('PHONE_REQUIRED', 'ยืนยันเบอร์โทรก่อนใช้สิทธิ์ทดลอง');
        a.trialUsed = true; if (a.phone) db.trialPhones.push(a.phone); source = 'trial';
      } else if (a.credits > 0) { a.credits--; source = 'credit'; }
      else throw err('NO_CREDIT', 'สิทธิ์ไม่พอ');
      a.months[month] = { source, activatedAt: t, editUntil: t + ENT.EDIT_DAYS * ENT.DAY, deleteAt: t + ENT.RETAIN_DAYS * ENT.DAY, exportsUsed: 0, exportLimit: source === 'trial' ? ENT.TRIAL_EXPORTS : null, wards: cur && !cur.purged ? cur.wards : [], purged: false };
      persist(); return publicAccount(a);
    },
    authorizeExport(email, month, ward, payForNewWard) {
      const a = account(email), m = a.months[month], t = now(), w = normWard(ward);
      if (!m || m.purged) throw err('NOT_ACTIVATED', 'เดือนนี้ยังไม่ได้ใช้สิทธิ์');
      if (subActive(a) && m.source !== 'subscription') upgrade(m);
      const editable = m.source === 'subscription' ? subActive(a) : m.editUntil > t;
      if (!editable) throw err('EDIT_EXPIRED', 'พ้นช่วงแก้ไขและส่งออกแล้ว');
      if (m.exportLimit !== null && m.exportsUsed >= m.exportLimit) throw err('TRIAL_EXPORT_LIMIT', 'ใช้สิทธิ์ส่งออกช่วงทดลองครบแล้ว');
      const known = m.wards.some(x => normWard(x) === w);
      if (m.wards.length && !known) {
        if (!payForNewWard) throw err('WARD_MISMATCH', 'เดือนนี้ผูกกับวอร์ดอื่นแล้ว');
        if (a.credits < 1) throw err('NO_CREDIT', 'สิทธิ์ไม่พอ');
        a.credits--;
      }
      if (!known) m.wards.push(String(ward).trim()); // เก็บชื่อที่แสดง เทียบด้วย normWard
      m.exportsUsed++; persist(); return publicAccount(a);
    },
    setProfile(email, profile) {
      // ระบบจริง: ตรวจด้วย validateProfile() ฝั่งเซิร์ฟเวอร์ และเก็บประวัติความยินยอม (consent log)
      if (!profile || !profile.hospitalName || !profile.province) throw err('BAD_PROFILE', 'ข้อมูลหน่วยงานไม่ครบ');
      const a = account(email); a.profile = profile; persist(); return publicAccount(a);
    },
    logEvent(email, evt) {
      const a = account(email); if (!a.profile?.researchConsent) return { ok: false };
      const key = 'wsp_mock_analytics', list = JSON.parse(localStorage.getItem(key) || '[]');
      list.push({ ...evt, accountId: email }); localStorage.setItem(key, JSON.stringify(list.slice(-500))); return { ok: true };
    },
    purchase(email, pkgId) {
      const a = account(email), p = PRICING.find(x => x.id === pkgId); if (!p) throw err('BAD_PACKAGE', 'ไม่พบแพ็กเกจ');
      if (p.credits) a.credits += p.credits;
      else {
        const from = subActive(a) ? a.subscription.until : now(), d = new Date(from); d.setMonth(d.getMonth() + p.months); a.subscription = { plan: p.id, until: d.getTime() };
        for (const m of Object.values(a.months)) if (!m.purged) upgrade(m); // เดือนที่ใช้สิทธิ์ทดลอง/รายครั้งอยู่ กลายเป็นแบบเช่า
      }
      persist(); return publicAccount(a);
    }
  };
})();

/* ---------------- API client — ระบบจริงเปลี่ยนเป็น fetch('/api/...') ---------------- */
const Api = {
  session: null,
  async call(fn) { await new Promise(r => setTimeout(r, 120)); return fn(); },
  requestOtp: email => Api.call(() => MockServer.requestOtp(email)),
  verifyOtp: (email, code) => Api.call(() => MockServer.verifyOtp(email, code)),
  google: email => Api.call(() => MockServer.google(email)),
  account: () => Api.call(() => MockServer.get(Api.session)),
  requestPhoneOtp: phone => Api.call(() => MockServer.requestPhoneOtp(Api.session, phone)),
  verifyPhone: code => Api.call(() => MockServer.verifyPhone(Api.session, code)),
  activateMonth: month => Api.call(() => MockServer.activateMonth(Api.session, month)),
  authorizeExport: (month, ward, pay) => Api.call(() => MockServer.authorizeExport(Api.session, month, ward, pay)),
  purchase: pkg => Api.call(() => MockServer.purchase(Api.session, pkg)),
  setProfile: profile => Api.call(() => MockServer.setProfile(Api.session, profile)),
  logEvent: evt => Api.call(() => MockServer.logEvent(Api.session, evt))
};

/* ---------------- Client state & rules (แสดงผลเท่านั้น เซิร์ฟเวอร์ต้องตรวจซ้ำ) ---------------- */
const Ent = {
  acct: null,
  month() { return state.selected; },
  info(month = Ent.month()) { const m = Ent.acct?.months?.[month]; return m && !m.purged ? m : null; },
  subActive() { return !!Ent.acct?.subscriptionActive && Ent.acct.subscription.until > Date.now(); },
  canEdit(month = Ent.month()) {
    if (!Ent.acct) return false;
    const m = Ent.info(month);
    if (Ent.subActive()) return true; // รายเดือน: แก้ไขได้ตลอด (บันทึกเดือนอัตโนมัติตอนส่งออก)
    return !!m && m.editUntil > Date.now();
  },
  needsActivation(month = Ent.month()) { return !Ent.info(month) || (!Ent.subActive() && Ent.info(month).editUntil <= Date.now()); },
  isTrial(month = Ent.month()) { return Ent.info(month)?.source === 'trial'; },

  async boot() {
    let session = null; try { session = JSON.parse(localStorage.getItem('wsp_session') || 'null'); } catch {}
    if (session?.email) await Ent.enter(session.email, null); else Ent.showLogin();
  },
  showLogin() {
    $('loginEmail').value = ''; $('loginOtp').value = ''; $('loginOtp').required = false; $('otpStep').classList.add('hidden'); $('loginError').textContent = ''; $('loginSubmit').textContent = 'ขอรหัส OTP';
    Ent.acct = null; render(); if (!$('loginDialog').open) $('loginDialog').showModal();
  },
  async enter(email, acct) {
    Api.session = email; localStorage.setItem('wsp_session', JSON.stringify({ email }));
    Ent.acct = acct || await Api.account();
    // ข้อมูลแยกตามบัญชี (ระบบจริง: โหลดจากเซิร์ฟเวอร์)
    KEY = KEY_BASE + '::' + email; undo = []; loadError = '';
    const raw = localStorage.getItem(KEY);
    try { state = raw ? JSON.parse(raw) : clone(DEFAULT_STATE); if (raw) validateBackup(state); }
    catch (e) {
      // ไม่เขียนทับข้อมูลที่อ่านไม่ได้: เก็บสำเนาดิบแยกคีย์ + ดาวน์โหลดให้ผู้ใช้ ก่อนเริ่มข้อมูลใหม่
      const backupKey = KEY + '::unreadable::' + Date.now();
      try { localStorage.setItem(backupKey, raw); } catch {}
      try { download(exportBase() + '_unreadable_backup_' + today() + '.json', raw, 'application/json'); } catch {}
      state = clone(DEFAULT_STATE);
      message('อ่านข้อมูลบัญชีไม่ได้ (' + e.message + ') — ระบบเก็บสำเนาเดิมไว้และดาวน์โหลดไฟล์ให้แล้ว ยังไม่ถูกลบ · ส่งไฟล์นี้ให้ทีมงานช่วยกู้คืน หรือกู้คืนจากไฟล์สำรอง', 'warn');
    }
    Ent.applyPurge();
    if ($('loginDialog').open) $('loginDialog').close();
    save(); render();
    if (!Ent.acct.profile) await Profile.open(null, true); // ลงทะเบียนหน่วยงานครั้งแรก
  },
  applyPurge() {
    const months = Object.entries(Ent.acct.months || {});
    for (const [k, m] of months) if (m.purged) for (const v of [1, 2]) delete state.plans[`${v}_${k}`];
    if (!Ent.subActive() && months.length && months.every(([, m]) => m.purged)) {
      // ผู้ใช้ไม่เช่า: ครบ 30 วันลบทุกอย่างรวมรายชื่อ (จุดขายของรายเดือนคือจำรายชื่อไว้)
      const keepSelected = state.selected; state = clone(DEFAULT_STATE); state.selected = keepSelected;
    }
  },
  logout() { if (worker) { worker.terminate(); worker = null; } localStorage.removeItem('wsp_session'); Api.session = null; Ent.showLogin(); },
  async refresh() { Ent.acct = await Api.account(); render(); },

  /* ---- ใช้สิทธิ์กับเดือนปัจจุบัน ---- */
  async promptActivate() {
    const month = Ent.month(), a = Ent.acct, cur = Ent.info(month);
    try {
      if (Ent.subActive()) { Ent.acct = await Api.activateMonth(month); render(); return true; }
      if (!a.trialUsed && !cur) {
        if (!confirm(`ใช้สิทธิ์ทดลองฟรีกับตาราง ${monthLabel(month)}?\n\n• แก้ไขและสร้างตารางใหม่ได้ไม่จำกัด ${ENT.EDIT_DAYS} วัน\n• ส่งออก PDF / Excel / พิมพ์ ได้ ${ENT.TRIAL_EXPORTS} ครั้ง\n• หลังจากนั้นดูได้อย่างเดียว และลบข้อมูลเมื่อครบ ${ENT.RETAIN_DAYS} วัน\n\nสิทธิ์ทดลองมีครั้งเดียวต่อบัญชี`)) return false;
      } else if (a.credits > 0) {
        if (!confirm(`ใช้ 1 สิทธิ์กับตาราง ${monthLabel(month)}? (เหลือ ${a.credits} สิทธิ์)\n\nแก้ไขและส่งออกได้ไม่จำกัด ${ENT.EDIT_DAYS} วัน`)) return false;
      } else { Ent.openPricing(cur ? 'ช่วงแก้ไขของเดือนนี้หมดแล้ว ซื้อสิทธิ์เพื่อแก้ไขต่อ' : 'ใช้สิทธิ์ทดลองแล้ว เลือกแพ็กเกจเพื่อจัดตารางเดือนนี้'); return false; }
      Ent.acct = await Api.activateMonth(month); render(); toast('เปิดใช้สิทธิ์สำหรับ ' + monthLabel(month) + ' แล้ว'); return true;
    } catch (e) {
      if (e.code === 'PHONE_REQUIRED') { if (await Ent.verifyPhoneFlow()) return Ent.promptActivate(); return false; }
      if (e.code === 'NO_CREDIT') { Ent.openPricing('สิทธิ์ไม่พอ'); return false; }
      toast(e.message); return false;
    }
  },
  async verifyPhoneFlow() {
    const phone = prompt('ยืนยันเบอร์โทรเพื่อใช้สิทธิ์ทดลองฟรี (1 เบอร์ใช้ได้ 1 ครั้ง)\nกรอกเบอร์มือถือ 10 หลัก', '');
    if (!phone) return false;
    if (!/^0\d{9}$/.test(phone.trim())) { toast('รูปแบบเบอร์ไม่ถูกต้อง'); return false; }
    const { mockCode } = await Api.requestPhoneOtp(phone.trim());
    const code = prompt(`กรอกรหัส OTP ที่ส่งทาง SMS\n(ต้นแบบ: รหัสคือ ${mockCode})`, '');
    if (!code) return false;
    try { Ent.acct = await Api.verifyPhone(code.trim()); return true; } catch (e) { toast(e.message); return false; }
  },

  /* ---- ส่งออก ---- */
  async authorizeExport() {
    const month = Ent.month();
    if (Ent.needsActivation(month) && !(await Ent.promptActivate())) return false;
    const m = Ent.info(month);
    if (m?.exportLimit !== null && m?.exportLimit !== undefined && m.exportLimit - m.exportsUsed === 1 && !confirm('นี่คือการส่งออกครั้งสุดท้ายของช่วงทดลอง (เหลือ 1/' + m.exportLimit + ') ตรวจตารางเรียบร้อยแล้วใช่ไหม?')) return false;
    try { Ent.acct = await Api.authorizeExport(month, wardName(), false); render(); return true; }
    catch (e) {
      if (e.code === 'WARD_MISMATCH') {
        if (!confirm(`ตาราง ${monthLabel(month)} ผูกกับวอร์ด "${Ent.info(month).wards[0]}" แล้ว\nการส่งออกวอร์ด "${wardName()}" ในเดือนเดียวกันต้องใช้ 1 สิทธิ์ (เหลือ ${Ent.acct.credits})\n\nใช้สิทธิ์?`)) return false;
        try { Ent.acct = await Api.authorizeExport(month, wardName(), true); render(); return true; }
        catch (e2) { if (e2.code === 'NO_CREDIT') Ent.openPricing('ต้องมีอย่างน้อย 1 สิทธิ์สำหรับวอร์ดที่ 2'); else toast(e2.message); return false; }
      }
      if (e.code === 'TRIAL_EXPORT_LIMIT' || e.code === 'EDIT_EXPIRED' || e.code === 'NO_CREDIT') { Ent.openPricing(e.message); return false; }
      toast(e.message); return false;
    }
  },

  /* ---- ราคา ---- */
  openPricing(reason = '') {
    const a = Ent.acct;
    $('pricingAccount').textContent = (reason ? reason + ' · ' : '') + (a ? `${a.email} · สิทธิ์คงเหลือ ${a.credits}` + (Ent.subActive() ? ` · เช่าถึง ${thDate(a.subscription.until)}` : '') : '');
    const card = p => `<div class="price-card ${p.best ? 'best' : ''}"><span>${esc(p.label)}</span><strong>${p.price.toLocaleString('th-TH')} ฿ <small>${esc(p.unit || '')}</small></strong><small>${esc(p.note)}</small><button class="${p.best ? 'primary' : ''}" data-buy="${p.id}">${p.group === 'credits' ? 'ซื้อ' : 'เช่า'}</button></div>`;
    $('pricingBody').innerHTML = `<h3 class="price-group">ซื้อรายครั้ง</h3><div class="price-grid">${PRICING.filter(p => p.group === 'credits').map(card).join('')}</div><h3 class="price-group section-gap">เช่าระบบ</h3><div class="price-grid">${PRICING.filter(p => p.group === 'subscription').map(card).join('')}</div>`;
    if (!$('pricingDialog').open) $('pricingDialog').showModal();
  },
  async buy(id) {
    const p = PRICING.find(x => x.id === id); if (!p) return;
    if (!confirm(`ชำระ ${p.price.toLocaleString('th-TH')} บาท สำหรับ "${p.label}"?\n\n(ต้นแบบ: จำลองการชำระเงินสำเร็จทันที)`)) return;
    try { Ent.acct = await Api.purchase(id); $('pricingDialog').close(); render(); toast(p.credits ? `เพิ่ม ${p.credits} สิทธิ์แล้ว` : `เช่าระบบถึง ${thDate(Ent.acct.subscription.until)}`); }
    catch (e) { toast(e.message); }
  },

  /* ---- UI ---- */
  decorate() {
    const bar = $('entBar'); if (!bar) return;
    const a = Ent.acct; $('accountLabel').textContent = a ? a.email : '—';
    if (!a) { bar.innerHTML = ''; bar.className = 'ent-bar hidden'; return; }
    const month = Ent.month(), m = Ent.info(month), editable = Ent.canEdit(month), now = Date.now();
    const plan = Ent.subActive() ? `<span class="ent-chip">เช่า${a.subscription.plan === 'yearly' ? 'รายปี' : 'รายเดือน'} ถึง ${thDate(a.subscription.until)}</span>` : `<span class="ent-chip">สิทธิ์คงเหลือ ${a.credits}</span><span class="ent-chip">${a.trialUsed ? 'ใช้สิทธิ์ทดลองแล้ว' : 'มีสิทธิ์ทดลองฟรี 1 ครั้ง'}</span>`;
    let status, cls = 'ent-bar', action = '';
    if (Ent.subActive()) status = `<strong>${monthLabel(month)}</strong> · แก้ไขได้ตลอด (เช่าระบบ)` + (m?.wards?.length ? ` · ผูกวอร์ด: ${esc(m.wards.join(', '))}` : '');
    else if (!m) { status = `<strong>${monthLabel(month)}</strong> · ยังไม่ได้ใช้สิทธิ์ — ดูได้อย่างเดียว`; cls += ' locked'; action = `<button class="primary" data-ent="activate">${a.trialUsed ? 'ใช้ 1 สิทธิ์กับเดือนนี้' : 'เริ่มทดลองฟรี'}</button>`; }
    else if (editable) {
      const left = m.exportLimit === null ? 'ส่งออกไม่จำกัด' : `ส่งออกเหลือ ${m.exportLimit - m.exportsUsed}/${m.exportLimit}`;
      status = `<strong>${monthLabel(month)}</strong> · ${m.source === 'trial' ? 'ทดลองฟรี' : 'ใช้ 1 สิทธิ์'} · แก้ไขได้ถึง ${thDate(m.editUntil)} · ${left}` + (m.wards.length ? ` · ผูกวอร์ด: ${esc(m.wards.join(', '))}` : '');
    } else {
      const days = Math.max(0, Math.ceil((m.deleteAt - now) / ENT.DAY));
      status = `<strong>${monthLabel(month)}</strong> · พ้นช่วงแก้ไขแล้ว ดูได้อย่างเดียว · ระบบจะลบข้อมูลในอีก ${days} วัน (${thDate(m.deleteAt)})`; cls += ' expired';
      action = `<button class="primary" data-ent="activate">${a.credits > 0 ? 'ใช้ 1 สิทธิ์เพื่อแก้ไขต่อ' : 'ซื้อสิทธิ์ / เช่าระบบ'}</button>`;
    }
    const pr = a.profile, hosp = pr ? `<button class="subtle-button" data-ent="profile" title="แก้ไขข้อมูลหน่วยงาน">${esc(pr.hospitalName)}${pr.custom ? ' (รอตรวจ)' : ''} · แก้ไข</button>` : '';
    bar.className = cls; bar.innerHTML = `${status}<span class="grow"></span>${hosp}${plan}${action}`;
    // ป้ายจำนวนการส่งออกที่เหลือ (ทดลองฟรี)
    const left = m && m.exportLimit !== null && editable ? ` (เหลือ ${m.exportLimit - m.exportsUsed}/${m.exportLimit})` : '';
    for (const [id, label] of [['excelBtn', 'ส่งออก Excel (.xlsx)'], ['csvBtn', 'ส่งออก CSV'], ['pdfBtn', 'ดาวน์โหลด PDF'], ['printBtn', 'พิมพ์']]) $(id).textContent = label + left;
    Ent.lock(!editable);
    if (!editable) for (const id of ['cellDialog', 'boundaryDialog', 'clearAllDialog']) if ($(id).open) { $(id).close(); toast('พ้นช่วงแก้ไขแล้ว หน้าต่างแก้ไขถูกปิด'); }
  },
  ALLOW: '#month,#year,[data-tab],#generateBtn,#excelBtn,#csvBtn,#pdfBtn,#printBtn,[data-issue],summary,.versions a,#settingsQuick,#backupBtn',
  lock(on) {
    document.querySelectorAll('[data-locked]').forEach(el => { el.disabled = false; el.removeAttribute('data-locked'); });
    if (!on) return;
    document.querySelectorAll('main.page button, main.page input, main.page select, main.page textarea').forEach(el => {
      if (el.matches(Ent.ALLOW) || el.disabled) return;
      el.disabled = true; el.setAttribute('data-locked', ''); el.title = 'ดูได้อย่างเดียว — ใช้สิทธิ์เพื่อแก้ไข';
    });
  }
};

/* ---------------- เชื่อมเข้ากับแอปเดิม ---------------- */
// render: ปลดล็อกก่อนวาด แล้วตกแต่ง/ล็อกตามสิทธิ์หลังวาด
const _render = render;
const seenGenerated = {};
render = function () {
  Ent.lock(false); _render(); Ent.decorate();
  // บันทึก event วิจัยเมื่อมีการสร้างตารางใหม่ (generatedAt เปลี่ยน)
  if (Ent.acct) { const k = Ent.acct.email + ':' + planKey(), g = plan().generatedAt; if (g && seenGenerated[k] !== undefined && seenGenerated[k] !== g) Profile.event('roster_generated'); seenGenerated[k] = g; }
};
// สร้างตาราง: ต้องมีสิทธิ์กับเดือนนี้ก่อน
const _startGeneration = startGeneration;
startGeneration = async function () { if (!Ent.canEdit() && !(await Ent.promptActivate())) return; _startGeneration(); };
$('generateBtn').onclick = () => startGeneration();
// ทุกการแก้ข้อมูลเรียก snapshot() ก่อน → กันที่จุดเดียว (เช่นหน้าต่างแก้ช่องที่เปิดค้างตอนสิทธิ์หมด)
const _snapshot = snapshot;
snapshot = function () {
  if (Ent.acct && !Ent.canEdit()) { toast('พ้นช่วงแก้ไขแล้ว — ใช้สิทธิ์เพื่อแก้ไขต่อ'); Ent.decorate(); throw Object.assign(new Error('READ_ONLY'), { code: 'READ_ONLY' }); }
  _snapshot();
};
window.addEventListener('error', e => { if (e.error?.code === 'READ_ONLY') e.preventDefault(); });
// ส่งออก: เซิร์ฟเวอร์นับครั้ง + ผูกวอร์ด ก่อนสร้างไฟล์
const _performExport = performExport;
performExport = async function (kind, receipt) { if (!(await Ent.authorizeExport())) return; _performExport(kind, receipt); Profile.event('roster_exported'); };
// ข้อความท้ายไฟล์ช่วงทดลอง
const _rosterRemarks = rosterRemarks;
rosterRemarks = function () { const t = _rosterRemarks(); return Ent.isTrial() ? t + '\nจัดทำด้วย Ward Shift Planner (ทดลองใช้)' : t; };
const _exportRows = exportRows;
exportRows = function (receipt) { const rows = _exportRows(receipt); if (Ent.isTrial()) rows.push(['จัดทำด้วย Ward Shift Planner (ทดลองใช้)']); return rows; };
// ปิด VA แบบรออนุมัติ: เจ้าของบัญชีเลือก VA ในตาราง = บันทึกวันลาทันที (role='admin')

/* ---------------- Events ---------------- */
$('accountBtn').onclick = () => { if (confirm('ออกจากระบบ? ข้อมูลถูกบันทึกในบัญชีแล้ว')) Ent.logout(); };
$('pricingBtn').onclick = () => Ent.openPricing();
$('closePricing').onclick = () => $('pricingDialog').close();
$('pricingBody').onclick = e => { const b = e.target.closest('[data-buy]'); if (b) Ent.buy(b.dataset.buy); };
$('entBar').onclick = e => { if (e.target.closest('[data-ent="activate"]')) Ent.promptActivate(); if (e.target.closest('[data-ent="profile"]')) Profile.open(Ent.acct.profile, false); };
$('loginDialog').addEventListener('cancel', e => e.preventDefault());
$('googleBtn').onclick = async () => {
  // ระบบจริง: Google Identity Services → ส่ง ID token ให้เซิร์ฟเวอร์ตรวจ
  const email = prompt('ต้นแบบ: จำลอง Google Sign-In\nกรอกอีเมล Google', '');
  if (!email) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { $('loginError').textContent = 'อีเมลไม่ถูกต้อง'; return; }
  const em = email.trim().toLowerCase(); await Ent.enter(em, await Api.google(em));
};
$('loginForm').onsubmit = async e => {
  e.preventDefault(); $('loginError').textContent = '';
  const email = $('loginEmail').value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('loginError').textContent = 'อีเมลไม่ถูกต้อง'; return; }
  if ($('otpStep').classList.contains('hidden')) {
    const { mockCode } = await Api.requestOtp(email);
    $('otpStep').classList.remove('hidden'); $('loginOtp').required = true; $('loginOtp').focus();
    $('otpMock').textContent = 'ต้นแบบ: ระบบจริงจะส่งรหัสทางอีเมล · รหัสทดลองคือ ' + mockCode;
    $('loginSubmit').textContent = 'เข้าสู่ระบบ'; return;
  }
  try { await Ent.enter(email, await Api.verifyOtp(email, $('loginOtp').value.trim())); }
  catch (err) { $('loginError').textContent = err.message; }
};
$('loginEmail').addEventListener('input', () => { if (!$('otpStep').classList.contains('hidden')) { $('otpStep').classList.add('hidden'); $('loginOtp').required = false; $('loginSubmit').textContent = 'ขอรหัส OTP'; } });
// ตรวจวันหมดช่วงแก้ไขทุกนาที (ไม่ต้องรีเฟรชหน้า)
setInterval(() => { if (Ent.acct) Ent.decorate(); }, 60000);

Ent.boot();
