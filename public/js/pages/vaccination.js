import { esc, $, $$, ageText, dateStr, chip, toast, audit, icon, waLink, todayStr, modal, vaccinationScheduleWaText, isVaccinationWindow, normalizeDateValue } from '../util.js';
import { VACCINES, getVaccineSource, getCustomVaccineEntries, toCustomVaccineKey } from '../clinic.js';

const GOV = 'Government Provided', PVT = 'Private / Paid';

// Filter tabs. Each uses isVaccinationWindow() from util.js so the logic lives (and is tested) in one place.
const RANGES = [
  { key: 'overdue', label: 'Overdue', empty: 'No overdue vaccines.' },
  { key: 'week', label: 'This week', empty: 'No vaccines due this week (Mon–Sun).' },
  { key: 'month', label: 'This month', empty: 'No vaccines due this month.' },
  { key: 'upcoming', label: 'Upcoming', empty: 'No upcoming vaccines.' }
];

const fmt = iso => iso ? dateStr(new Date(iso + 'T00:00:00')) : 'No date';
const diffFromToday = iso => {
  if (!iso) return null;
  const t = new Date(iso + 'T00:00:00'), n = new Date();
  return Math.round((t - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000);
};
const inRange = (item, range) => item.dueISO ? isVaccinationWindow(item.dueISO, range) : range === 'upcoming'; // undated custom vaccines only show under Upcoming

// legacy string (= given on that date) or object entry
function normalizeVaxEntry(value, vaccineName) {
  if (typeof value === 'string') return { givenOn: value, source: getVaccineSource(vaccineName), status: 'given', selected: true };
  if (value && typeof value === 'object') return { ...value, givenOn: value.givenOn || '', source: value.source || getVaccineSource(vaccineName), status: value.status || (value.givenOn ? 'given' : 'pending'), selected: value.selected !== false };
  return { givenOn: '', source: getVaccineSource(vaccineName), status: 'pending', selected: true };
}

// All pending (not given) vaccines of one patient
function pendingVaccines(pt) {
  const out = [], map = pt.vaccines || {};
  const dobISO = normalizeDateValue(pt.dob);
  if (dobISO) {
    const dob = new Date(dobISO + 'T00:00:00');
    for (const g of VACCINES) {
      const due = new Date(dob.getTime() + g.age * 7 * 86400000);
      const dueISO = todayStr(due);
      for (const name of g.items) {
        const key = g.label + '|' + name, e = normalizeVaxEntry(map[key], name);
        if (e.status === 'given' || e.givenOn) continue;
        out.push({ key, name, group: g.label, dueISO, source: e.source, selected: e.selected, custom: false });
      }
    }
  }
  for (const c of getCustomVaccineEntries(pt)) {
    if (c.given) continue;
    out.push({ key: c.key, name: c.vaccineName, group: 'Custom', dueISO: normalizeDateValue(c.dueDate), source: c.source, selected: c.selected, custom: true });
  }
  return out.sort((a, b) => (a.dueISO || '9999').localeCompare(b.dueISO || '9999') || a.name.localeCompare(b.name));
}

export async function render(view, _p, ctx) {
  const { api, user } = ctx;
  let patients = await api.query('patients');
  let filter = 'week', query = '';
  const drafts = new Map();      // ptId -> { name, date }  (kept while the list re-renders)
  const openAdd = new Set();     // ptId whose "Add custom" panel is open
  let redrawLater = false;

  view.innerHTML = `
    <div class="page-head"><div><h1>Vaccination reminders</h1><p>Guardian alerts and upcoming schedule</p></div></div>
    <div class="card">
      <div class="vx-tools">
        <div class="tabs" id="vx-tabs" role="group" aria-label="Filter by due date"></div>
        <input id="vx-search" class="vx-search" type="search" placeholder="Search name, UHID, mobile or guardian" aria-label="Search patients">
      </div>
      <p class="small muted vx-hint">Tick the vaccines to include in the WhatsApp message. Tap <b>Reminder sent</b> after you send it.</p>
      <div class="list" id="vx-list"></div>
    </div>`;

  const rowsFor = range => {
    const q = query.trim().toLowerCase();
    return patients
      .filter(pt => !q || [pt.name, pt.uhid, pt.mobile, pt.guardian].some(v => String(v || '').toLowerCase().includes(q)))
      .map(pt => ({ pt, items: pendingVaccines(pt).filter(i => inRange(i, range)) }))
      .filter(r => r.items.length)
      .sort((a, b) => (a.items[0].dueISO || '9999').localeCompare(b.items[0].dueISO || '9999') || String(a.pt.name).localeCompare(String(b.pt.name)));
  };

  const dueChip = d => d == null ? chip('No date', '') : d < 0 ? chip(`Overdue ${-d}d`, 'crit') : d === 0 ? chip('Due today', 'warn') : chip(`In ${d}d`, d <= 7 ? 'warn' : 'info');

  const itemHtml = (pt, i) => `
    <li class="vx-item ${i.selected ? '' : 'off'}">
      <label class="vx-check">
        <input type="checkbox" data-vx="select" data-pt="${esc(pt.id)}" data-key="${esc(i.key)}" ${i.selected ? 'checked' : ''} aria-label="Include ${esc(i.name)} in reminder">
        <span class="vx-name">${esc(i.name)}<small>${esc(i.group)} · ${esc(fmt(i.dueISO))}</small></span>
      </label>
      <span class="vx-due">${dueChip(diffFromToday(i.dueISO))}</span>
      <div class="vx-src" role="group" aria-label="Vaccine source">
        <button type="button" class="gov" data-vx="source" data-pt="${esc(pt.id)}" data-key="${esc(i.key)}" data-source="${GOV}" aria-pressed="${i.source === GOV}">Govt</button>
        <button type="button" class="pvt" data-vx="source" data-pt="${esc(pt.id)}" data-key="${esc(i.key)}" data-source="${PVT}" aria-pressed="${i.source === PVT}">Private</button>
      </div>
    </li>`;

  const cardHtml = ({ pt, items }) => {
    const chosen = items.filter(i => i.selected);
    const text = vaccinationScheduleWaText({ patientName: pt.name, uhid: pt.uhid, items: chosen.map(i => ({ vaccineName: i.name, dueDate: fmt(i.dueISO), source: i.source })) });
    const canSend = chosen.length > 0 && String(pt.mobile || '').replace(/\D/g, '').length >= 10;
    const sent = pt.vaccReminder && pt.vaccReminder.at;
    const d = drafts.get(pt.id) || {};
    return `
    <article class="vx-card">
      <header class="vx-head">
        <div class="vx-who"><b>${esc(pt.name)}</b><div class="small muted">${esc(pt.uhid)} · ${esc(ageText(pt.dob))} · ${esc(pt.guardian || '–')} · ${esc(pt.mobile || '–')}</div></div>
        <div class="vx-side">
          <button type="button" class="chip chip-btn ${sent ? 'sent' : ''}" data-vx="sent" data-pt="${esc(pt.id)}" title="${sent ? 'Marked ' + esc(dateStr(sent)) : 'Click after sending the reminder'}">${sent ? '✓ ' : ''}Reminder sent${sent ? ' · ' + esc(dateStr(sent).slice(0, 6)) : ''}</button>
          ${canSend ? `<a class="btn sm wa" target="_blank" rel="noopener" href="${waLink(pt.mobile, text)}">${icon('send', 16)} WhatsApp (${chosen.length})</a>` : `<button type="button" class="btn sm wa" disabled title="${chosen.length ? 'No valid mobile number' : 'Tick at least one vaccine'}">${icon('send', 16)} WhatsApp (${chosen.length})</button>`}
        </div>
      </header>
      <ul class="vx-list">${items.map(i => itemHtml(pt, i)).join('')}</ul>
      <details class="vx-add" data-pt="${esc(pt.id)}" ${openAdd.has(pt.id) ? 'open' : ''}>
        <summary>${icon('plus', 16)} Add custom vaccine</summary>
        <div class="vx-add-row">
          <input data-vx="cname" data-pt="${esc(pt.id)}" placeholder="Custom vaccine name" value="${esc(d.name || '')}" aria-label="Custom vaccine name">
          <input data-vx="cdate" data-pt="${esc(pt.id)}" type="date" value="${esc(d.date || '')}" aria-label="Due date">
          <button type="button" class="btn sm" data-vx="cadd" data-pt="${esc(pt.id)}">Add</button>
        </div>
      </details>
    </article>`;
  };

  function drawTabs() {
    const q = query;
    $('#vx-tabs', view).innerHTML = RANGES.map(r => `<button type="button" class="${filter === r.key ? 'on' : ''}" data-vx="range" data-range="${r.key}" aria-pressed="${filter === r.key}">${r.label} (${rowsFor(r.key).length})</button>`).join('');
    void q;
  }
  function drawList() {
    const rows = rowsFor(filter), r = RANGES.find(x => x.key === filter);
    $('#vx-list', view).innerHTML = rows.length ? rows.map(cardHtml).join('') : `<div class="empty">${query.trim() ? 'No matching patients in this filter.' : r.empty}</div>`;
    drawTabs();
  }
  // don't wipe a text box while somebody is typing in it
  function draw() {
    const a = document.activeElement;
    if (a && a.matches && a.matches('#vx-list input[type=text], #vx-list input[type=date], #vx-list input:not([type])') && view.contains(a)) { redrawLater = true; return; }
    redrawLater = false; drawList();
  }
  view.addEventListener('focusout', () => { if (redrawLater) setTimeout(() => { if (redrawLater) draw(); }, 0); });

  async function savePatient(ptId, patch) {
    const idx = patients.findIndex(p => p.id === ptId); if (idx < 0) return false;
    const before = patients[idx];
    patients[idx] = { ...before, ...patch }; draw();            // optimistic
    try { await api.update('patients', ptId, patch); return true; }
    catch (e) { patients[idx] = before; draw(); toast('Could not save: ' + (e.message || e), 'err'); return false; }
  }
  const setVax = (pt, key, patch) => {
    const map = { ...(pt.vaccines || {}) }, name = key.split('|').slice(1).join('|');
    const cur = normalizeVaxEntry(map[key], name);
    map[key] = { ...cur, ...patch, status: cur.status === 'given' ? 'given' : 'pending' };
    return map;
  };

  view.addEventListener('click', async e => {
    const el = e.target.closest('[data-vx]'); if (!el) return;
    const act = el.dataset.vx, pt = patients.find(p => p.id === el.dataset.pt);
    if (act === 'range') { filter = el.dataset.range; return draw(); }
    if (!pt) return;
    if (act === 'source') return void savePatient(pt.id, { vaccines: setVax(pt, el.dataset.key, { source: el.dataset.source }) });
    if (act === 'sent') {
      const items = pendingVaccines(pt).filter(i => inRange(i, filter) && i.selected);
      const rec = { at: Date.now(), by: user.name || '', keys: items.map(i => i.key) };
      if (await savePatient(pt.id, { vaccReminder: rec })) audit(api, user, 'vaccine_reminder_sent', pt.id);
      const m = modal(`<h2>Reminder sent</h2><p class="muted">${esc(pt.name)} · ${esc(new Date(rec.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}</p>
        <div class="actions"><button class="btn" data-close>OK</button><button class="btn ghost" id="vx-undo">Undo</button></div>`);
      m.el.querySelector('#vx-undo').onclick = async () => { await savePatient(pt.id, { vaccReminder: null }); m.close(); };
      return;
    }
    if (act === 'cadd') {
      const name = (drafts.get(pt.id)?.name || '').trim(), date = drafts.get(pt.id)?.date || '';
      if (!name) return toast('Enter a custom vaccine name', 'err');
      if (!date) return toast('Pick a due date', 'err');
      const key = toCustomVaccineKey(name), map = { ...(pt.vaccines || {}) };
      map[key] = { name, source: getVaccineSource(name), status: 'pending', selected: true, dueDate: date, givenOn: '' };
      drafts.delete(pt.id);
      if (await savePatient(pt.id, { vaccines: map })) toast('Custom vaccine added');
    }
  });
  view.addEventListener('change', e => {
    const el = e.target.closest('[data-vx="select"]'); if (!el) return;
    const pt = patients.find(p => p.id === el.dataset.pt); if (!pt) return;
    savePatient(pt.id, { vaccines: setVax(pt, el.dataset.key, { selected: el.checked }) });
  });
  view.addEventListener('input', e => {
    const el = e.target;
    if (el.id === 'vx-search') { query = el.value; return draw(); }
    if (el.dataset.vx === 'cname' || el.dataset.vx === 'cdate') {
      const d = drafts.get(el.dataset.pt) || {}; d[el.dataset.vx === 'cname' ? 'name' : 'date'] = el.value; drafts.set(el.dataset.pt, d);
    }
  });
  view.addEventListener('toggle', e => { const d = e.target; if (d.matches && d.matches('details.vx-add')) { d.open ? openAdd.add(d.dataset.pt) : openAdd.delete(d.dataset.pt); } }, true);

  const unsub = api.watch('patients', [], list => { patients = list; draw(); });
  draw();
  return () => unsub();
}
