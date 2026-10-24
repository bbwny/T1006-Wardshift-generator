'use strict';
/* ==========================================================================
 * ลงทะเบียนหน่วยงาน (ครั้งแรกหลัง Login) + ค้นหา รพ. + เก็บรูปแบบเวรเพื่อวิจัย
 * ตรรกะค้นหาเหมือน engine/src/profile.ts (searchHospitals) — แก้ให้ตรงกันทั้งสองที่
 * ========================================================================== */
const normalizeTh = s => String(s || '').normalize('NFC').toLowerCase().replace(/โรงพยาบาล|โรงพยาบาลฯ|ร\.?พ\.?|hospital/g, '').replace(/[\s.\-–·,()]/g, '');
function searchHospitals(query, limit = 8) {
  const terms = query.trim().split(/\s+/).map(normalizeTh).filter(Boolean);
  if (!terms.length) return [];
  const scored = [];
  for (const h of HOSPITALS) {
    const name = normalizeTh(h.name), al = h.aliases.map(normalizeTh), prov = normalizeTh(h.province), type = normalizeTh(h.type);
    let total = 0, ok = true;
    for (const t of terms) {
      const s = name.startsWith(t) ? 100 : name.includes(t) ? 60 : al.some(a => a.startsWith(t)) ? 50 : al.some(a => a.includes(t)) ? 35 : prov.startsWith(t) ? 30 : prov.includes(t) ? 20 : type.includes(t) ? 10 : 0;
      if (!s) { ok = false; break; }
      total += s;
    }
    if (ok) scored.push({ h, score: total - h.name.length / 100 });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.h);
}

const Profile = {
  chosen: null,      // Hospital | 'custom' | null
  results: [],
  active: -1,
  resolve: null,

  /** เปิดหน้าลงทะเบียน คืน Promise เมื่อบันทึกสำเร็จ (required=true ปิดไม่ได้) */
  open(current, required) {
    Profile.required = required;
    $('profileClose').classList.toggle('hidden', required);
    $('profileTitle').textContent = required ? 'ข้อมูลหน่วยงาน (ลงทะเบียนครั้งแรก)' : 'แก้ไขข้อมูลหน่วยงาน';
    $('provinceSelect').innerHTML = '<option value="">— เลือกจังหวัด —</option>' + PROVINCES.map(p => `<option>${esc(p)}</option>`).join('');
    $('wardTypeSelect').innerHTML = '<option value="">— ไม่ระบุ —</option>' + WARD_TYPES.map(p => `<option>${esc(p)}</option>`).join('');
    $('guideWords').innerHTML = GUIDE_WORDS.map(w => `<button type="button" class="ent-chip" data-guide="${esc(w)}">${esc(w)}</button>`).join('');
    $('profileError').textContent = '';
    Profile.chosen = null; $('hospSearch').value = ''; $('customName').value = ''; $('provinceSelect').value = '';
    if (current) {
      if (current.custom) { Profile.chosen = 'custom'; $('customName').value = current.hospitalName; $('provinceSelect').value = current.province; }
      else Profile.chosen = HOSPITALS.find(h => h.code === current.hospitalCode) || null;
      $('wardTypeSelect').value = current.wardType || ''; $('researchConsent').checked = !!current.researchConsent;
    } else { $('wardTypeSelect').value = ''; $('researchConsent').checked = false; }
    Profile.renderChoice(); Profile.renderList();
    if (!$('profileDialog').open) $('profileDialog').showModal();
    $('hospSearch').focus();
    return new Promise(r => { Profile.resolve = r; });
  },
  renderList() {
    const q = $('hospSearch').value;
    Profile.results = q.trim() ? searchHospitals(q) : [];
    Profile.active = Profile.results.length ? 0 : -1;
    const items = Profile.results.map((h, i) => `<li role="option" id="hosp-opt-${i}" data-hosp="${esc(h.code)}" aria-selected="${i === Profile.active}"><strong>${esc(h.name)}</strong><small>${esc(h.province)} · ${esc(h.type)}</small></li>`);
    if (q.trim()) items.push(`<li role="option" id="hosp-opt-custom" data-hosp="custom" class="custom-opt" aria-selected="${Profile.active === -1}">ไม่พบ รพ. ของฉัน — <strong>อื่นๆ (ระบุชื่อเอง)</strong>${Profile.results.length ? '' : '<small>ลองคำอื่น เช่น ชื่อย่อ ชื่อจังหวัด หรือชื่อภาษาอังกฤษ</small>'}</li>`);
    $('hospList').innerHTML = items.join('');
    $('hospList').classList.toggle('hidden', !q.trim());
    $('hospSearch').setAttribute('aria-expanded', q.trim() ? 'true' : 'false');
  },
  highlight() {
    $('hospList').querySelectorAll('[role=option]').forEach((li, i) => li.setAttribute('aria-selected', String(i === Profile.active)));
    const el = $('hospList').querySelectorAll('[role=option]')[Profile.active]; el?.scrollIntoView({ block: 'nearest' });
    $('hospSearch').setAttribute('aria-activedescendant', el?.id || '');
  },
  choose(code) {
    Profile.chosen = code === 'custom' ? 'custom' : HOSPITALS.find(h => h.code === code) || null;
    if (Profile.chosen === 'custom' && !$('customName').value) $('customName').value = $('hospSearch').value.trim();
    $('hospSearch').value = ''; Profile.renderList(); Profile.renderChoice();
    if (Profile.chosen === 'custom') $('customName').focus();
  },
  renderChoice() {
    const c = Profile.chosen;
    $('customBox').classList.toggle('hidden', c !== 'custom');
    $('customName').required = c === 'custom'; $('provinceSelect').required = c === 'custom';
    $('hospSelected').classList.toggle('hidden', !c);
    $('hospSelected').innerHTML = !c ? '' : c === 'custom'
      ? '<strong>อื่นๆ</strong> ระบุชื่อ รพ. และจังหวัดด้านล่าง · ทีมงานจะเพิ่มเข้ารายชื่อให้ภายหลัง <button type="button" class="subtle-button" data-clear-hosp>เปลี่ยน</button>'
      : `<strong>${esc(c.name)}</strong> · ${esc(c.province)} · ${esc(c.type)} <button type="button" class="subtle-button" data-clear-hosp>เปลี่ยน</button>`;
  },
  collect() {
    const c = Profile.chosen;
    if (!c) return { error: 'กรุณาค้นหาและเลือกโรงพยาบาล หรือเลือก "อื่นๆ"' };
    const custom = c === 'custom', name = custom ? $('customName').value.trim().replace(/\s+/g, ' ') : c.name, province = custom ? $('provinceSelect').value : c.province;
    if (custom && (name.length < 3 || name.length > 200)) return { error: 'กรุณาระบุชื่อ รพ. 3–200 ตัวอักษร' };
    if (!PROVINCES.includes(province)) return { error: 'กรุณาเลือกจังหวัด' };
    const consent = $('researchConsent').checked;
    return { profile: { hospitalCode: custom ? null : c.code, hospitalName: name, province, custom, wardType: $('wardTypeSelect').value || null, researchConsent: consent, consentAt: consent ? Date.now() : null } };
  },

  /* ---- เก็บรูปแบบเวรเพื่อวิจัย (เฉพาะผู้ที่ยินยอม · ไม่มีชื่อบุคลากร) ---- */
  event(type) {
    const pr = Ent.acct?.profile; if (!pr?.researchConsent) return;
    const s = state.settings, ns = people(), v = lastValidation, byLevel = {};
    for (const n of ns) byLevel[C.levelOf(n)] = (byLevel[C.levelOf(n)] || 0) + 1;
    const rows = plan().rows, doubles = ns.reduce((t, n) => t + (rows[n.id] || []).filter(c => C.W(C.MASK[c] || 0) === 2).length, 0);
    const blocks = v ? Object.values(v.sums).reduce((t, x) => t + x.blocks.length, 0) : 0;
    Api.logEvent({
      event: type, at: Date.now(), hospitalCode: pr.hospitalCode, hospitalName: pr.hospitalName, province: pr.province, wardType: pr.wardType,
      month: state.selected, version, nightMode: C.nightMode(s), demand: C.demand(s),
      toggles: { rolling: C.rollingEnabled(s), stroke: C.enabled(s, 'stroke'), senior: C.enabled(s, 'senior'), competent: C.enabled(s, 'competent'), novice: C.enabled(s, 'novice'), mentorMode: s.mentorMode || 'none' },
      staff: { total: ns.length, byLevel, stroke: ns.filter(n => n.stroke).length, mentors: ns.filter(n => n.mentor).length },
      result: v ? { valid: v.valid, issues: v.issues.length, partial: !v.valid, doubleShifts: doubles, offBlocks3plus: blocks } : undefined
    });
  }
};

/* ---- Events ---- */
$('hospSearch').addEventListener('input', Profile.renderList);
$('hospSearch').addEventListener('keydown', e => {
  const n = $('hospList').querySelectorAll('[role=option]').length;
  if (e.key === 'ArrowDown' && n) { e.preventDefault(); Profile.active = (Profile.active + 1) % n; Profile.highlight(); }
  else if (e.key === 'ArrowUp' && n) { e.preventDefault(); Profile.active = (Profile.active - 1 + n) % n; Profile.highlight(); }
  else if (e.key === 'Enter') { e.preventDefault(); const el = $('hospList').querySelectorAll('[role=option]')[Profile.active < 0 ? n - 1 : Profile.active]; if (el) Profile.choose(el.dataset.hosp); }
  else if (e.key === 'Escape') { $('hospSearch').value = ''; Profile.renderList(); }
});
$('hospList').addEventListener('click', e => { const li = e.target.closest('[data-hosp]'); if (li) Profile.choose(li.dataset.hosp); });
$('guideWords').addEventListener('click', e => { const b = e.target.closest('[data-guide]'); if (b) { $('hospSearch').value = b.dataset.guide; Profile.renderList(); $('hospSearch').focus(); } });
$('hospSelected').addEventListener('click', e => { if (e.target.closest('[data-clear-hosp]')) { Profile.chosen = null; Profile.renderChoice(); $('hospSearch').focus(); } });
$('profileDialog').addEventListener('cancel', e => { if (Profile.required) e.preventDefault(); });
$('profileClose').onclick = () => $('profileDialog').close();
$('profileForm').onsubmit = async e => {
  e.preventDefault();
  const r = Profile.collect(); if (r.error) { $('profileError').textContent = r.error; return; }
  try { Ent.acct = await Api.setProfile(r.profile); $('profileDialog').close(); render(); toast('บันทึกข้อมูลหน่วยงานแล้ว'); Profile.resolve?.(r.profile); }
  catch (err) { $('profileError').textContent = err.message; }
};
