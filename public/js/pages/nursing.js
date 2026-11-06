import { esc, $, num, timeStr, chip, modal, toast, audit, icon } from '../util.js';
import { DRUGS } from '../clinic.js';

export async function render(view, params, ctx) {
  const { api, user } = ctx; let adms = [], mar = [], filter = params[0] ? 'pt' : 'all', onlyAdm = params[0] || null;
  view.innerHTML = `<div class="page-head"><div><h1>Nursing & MAR</h1><p id="sub">Medication administration record</p></div><div class="actions"><button class="btn" id="lv">${icon('pulse', 18)} Log vitals</button><button class="btn sec" id="nm">${icon('plus', 18)} Add medication</button></div></div>
    <div class="tabs" id="tb"></div><div class="grid g2" id="mr"></div><div class="card mt"><h3>Shift progress</h3><div class="bar mt"><i id="pb" style="width:0"></i></div><p class="small muted" id="pt"></p></div>`;
  const now = () => Date.now();
  const status = m => m.status !== 'pending' ? m.status : m.kind === 'sos' ? 'sos' : m.dueAt <= now() + 5 * 60000 ? 'due' : 'sched';
  const draw = () => {
    const live = new Set(adms.map(a => a.id));
    let items = mar.filter(m => live.has(m.admissionId) && (!onlyAdm || m.admissionId === onlyAdm));
    const c = k => items.filter(m => k === 'all' || k === 'pt' || status(m) === k).length;
    $('#tb', view).innerHTML = [['all', 'All'], ['due', 'Due now'], ['sos', 'STAT / SOS'], ['sched', 'Scheduled'], ['given', 'Completed']].map(([k, l]) => `<button class="${filter === k || (filter === 'pt' && k === 'all') ? 'on' : ''}" data-f="${k}">${l} (${c(k)})</button>`).join('') + (onlyAdm ? `<button data-f="clear">Show all patients ✕</button>` : '');
    const rows = items.filter(m => filter === 'all' || filter === 'pt' || status(m) === filter).sort((a, b) => (a.status !== 'pending') - (b.status !== 'pending') || a.dueAt - b.dueAt);
    $('#mr', view).innerHTML = rows.length ? rows.map(m => {
      const s = status(m);
      return `<div class="mar-item ${s}"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><span class="chip ${s === 'due' ? 'crit' : 'info'}">${esc(m.bed)}</span> <b>${esc(m.patientName)}</b></div>
        ${m.status === 'given' ? chip('Given ' + timeStr(m.givenAt) + ' · ' + m.givenBy, 'ok') : m.status === 'held' ? chip('Held: ' + m.reason, 'warn') : s === 'sos' ? chip('SOS / PRN', 'vax') : chip((s === 'due' ? 'Due ' : '') + timeStr(m.dueAt), s === 'due' ? 'crit' : '')}</div>
        <div><b>${esc(m.drug)}</b><div class="small muted">${esc(m.detail || '')}</div></div>
        ${m.status === 'pending' ? `<div class="actions"><button class="btn grow ${s === 'sos' ? 'urgent' : ''}" data-give="${m.id}">${icon('check', 18)} ${s === 'sos' ? 'Administer SOS dose' : 'Mark given'}</button><button class="btn ghost" data-hold="${m.id}">Hold / skip</button></div>` : ''}</div>`;
    }).join('') : '<div class="empty" style="grid-column:1/-1">Nothing here.</div>';
    const total = items.length, done = items.filter(m => m.status !== 'pending').length;
    $('#pb', view).style.width = (total ? done / total * 100 : 0) + '%'; $('#pt', view).textContent = `${done} / ${total} tasks done`;
  };
  const pickAdm = (title, body, ok) => {
    const m = modal(`<h2>${title}</h2><div class="list"><div><label for="pa">Patient / bed</label><select id="pa">${adms.map(a => `<option value="${a.id}" ${a.id === onlyAdm ? 'selected' : ''}>${esc(a.bed)} – ${esc(a.name)}</option>`).join('')}</select></div>${body}<div class="actions"><button class="btn" id="ok">Save</button><button class="btn ghost" data-close>Cancel</button></div></div>`);
    m.el.querySelector('#ok').onclick = async () => { const a = adms.find(x => x.id === m.el.querySelector('#pa').value); if (!a) return toast('No admitted patient', 'err'); if (await ok(m.el, a) !== false) m.close(); };
  };
  view.addEventListener('click', async e => {
    const f = e.target.closest('[data-f]'); if (f) { if (f.dataset.f === 'clear') { onlyAdm = null; filter = 'all'; } else filter = f.dataset.f; return draw(); }
    const g = e.target.closest('[data-give]');
    if (g) { await api.update('mar', g.dataset.give, { status: 'given', givenAt: now(), givenBy: user.name }); audit(api, user, 'mar_given', g.dataset.give); return toast('Marked as given'); }
    const h = e.target.closest('[data-hold]');
    if (h) { const r = prompt('Reason for hold / skip?'); if (!r) return; await api.update('mar', h.dataset.hold, { status: 'held', reason: r, givenBy: user.name }); audit(api, user, 'mar_held', h.dataset.hold + ':' + r); }
  });
  $('#lv', view).onclick = () => pickAdm('Log bedside vitals', `<div class="form">${[['hr', 'Heart rate (/min)'], ['rr', 'Resp. rate (/min)'], ['spo2', 'SpO₂ (%)'], ['temp', 'Temp (°F)'], ['crt', 'Cap. refill (sec)'], ['urine', 'Urine (ml/kg/hr)'], ['bp', 'BP (mmHg)'], ['bili', 'Bilirubin (mg/dL)']].map(([k, l]) => `<div class="f"><label>${l}</label><input data-k="${k}" ${k === 'bp' ? '' : 'type="number" step="0.1"'} inputmode="decimal"></div>`).join('')}</div>`, async (el, a) => {
    const v = { admissionId: a.id, by: user.name }; let any = false;
    el.querySelectorAll('[data-k]').forEach(i => { if (i.value === '') return; v[i.dataset.k] = i.dataset.k === 'bp' ? i.value : num(i.value); any = true; });
    if (!any) { toast('Enter at least one value', 'err'); return false; }
    await api.add('vitals', v); audit(api, user, 'vitals', a.id); toast('Vitals saved');
  });
  $('#nm', view).onclick = () => pickAdm('Add medication order', `<div><label>Drug</label><input data-d placeholder="Inj. Ampicillin 75mg" list="dl"><datalist id="dl">${DRUGS.filter(d => !d.custom).map(d => `<option value="${esc(d.name)}">`).join('')}</datalist></div><div><label>Dose / route / instructions</label><input data-i></div><div><label>First due (time)</label><input data-t type="time"></div><label class="opt"><input type="checkbox" data-s><span>SOS / PRN (as needed)</span></label>`, async (el, a) => {
    const drug = el.querySelector('[data-d]').value.trim(); if (!drug) { toast('Enter drug', 'err'); return false; }
    const t = el.querySelector('[data-t]').value, d = new Date(); if (t) d.setHours(+t.slice(0, 2), +t.slice(3), 0, 0);
    await api.add('mar', { admissionId: a.id, patientName: a.name, bed: a.bed, drug, detail: el.querySelector('[data-i]').value, dueAt: d.getTime(), kind: el.querySelector('[data-s]').checked ? 'sos' : 'scheduled', status: 'pending', orderedBy: user.name });
    audit(api, user, 'mar_order', a.id); toast('Medication added');
  });
  const u1 = api.watch('admissions', [['status', 'active']], l => { adms = l; draw(); });
  const u2 = api.watch('mar', [], l => { mar = l; draw(); });
  const tick = setInterval(draw, 30000);
  return () => { u1(); u2(); clearInterval(tick); };
}
