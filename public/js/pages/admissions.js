import { esc, $, money, ageText, timeStr, dateStr, chip, modal, toast, audit, icon, debounce } from '../util.js';
import { BEDS } from '../clinic.js';

const lim = (v, lo, hi, wlo, whi) => v == null ? '' : (v < lo || v > hi) ? 'crit' : (v < wlo || v > whi) ? 'warn' : 'ok';
export const vitalCls = { spo2: v => v == null ? '' : v < 90 ? 'crit' : v < 94 ? 'warn' : 'ok', hr: v => lim(v, 60, 200, 80, 170), rr: v => lim(v, 15, 70, 20, 60), temp: v => v == null ? '' : v >= 102 || v < 96 ? 'crit' : v >= 100.4 ? 'warn' : 'ok' };

export async function render(view, _p, ctx) {
  const { api, user } = ctx;
  let adms = [], vit = [];
  view.innerHTML = `<div class="page-head"><div><h1>Admissions · NICU / PICU / IPD</h1><p id="cen">Census</p></div>
    <div class="actions"><button class="btn" id="adm">${icon('plus', 18)} Admit patient</button></div></div><div class="beds" id="beds"></div>`;
  const draw = () => {
    const occ = Object.fromEntries(adms.map(a => [a.bed, a]));
    $('#cen', view).textContent = `${adms.length} / ${BEDS.length} beds occupied · NICU ${adms.filter(a => a.ward === 'NICU').length}/6 · PICU ${adms.filter(a => a.ward === 'PICU').length}/2 · IPD ${adms.filter(a => a.ward === 'IPD').length}/8`;
    $('#beds', view).innerHTML = BEDS.map(b => {
      const a = occ[b.id];
      if (!a) return `<div class="bed free"><b>${b.id}</b><span class="small">${b.label} · Vacant</span>${['doctor', 'nurse', 'admin'].includes(user.role) ? `<button class="btn sm ghost" data-admit="${b.id}">Admit here</button>` : ''}</div>`;
      const v = vit.filter(x => x.admissionId === a.id).sort((x, y) => y.createdAt - x.createdAt)[0];
      const ph = a.photo && a.photo.start && !a.photo.stop ? Math.floor((Date.now() - a.photo.start) / 60000) : null;
      const cell = (k, l, u) => `<div class="vital ${v ? vitalCls[k]?.(v[k]) : ''}"><small>${l}</small><b>${v && v[k] != null ? v[k] : '–'}</b>${u ? `<small>${u}</small>` : ''}</div>`;
      return `<div class="bed occ"><div style="display:flex;justify-content:space-between;align-items:center"><b>${b.id}</b>${chip(b.ward, b.ward === 'NICU' ? 'info' : '')}</div>
        <div><b><a href="#/patient/${a.patientId}">${esc(a.name)}</a></b><div class="small muted">${esc(a.ageText || '')} · ${a.weight || '–'} kg ${a.gestation ? '· ' + esc(a.gestation) : ''}</div><div class="small">${esc(a.dx || '')}</div></div>
        <div class="vit">${cell('hr', 'HR', '/min')}${cell('rr', 'RR', '/min')}${cell('spo2', 'SpO₂', '%')}</div>
        <div class="small muted">${v ? 'Temp ' + (v.temp ?? '–') + '°F · ' + (v.bili ? 'Bili ' + v.bili + ' mg/dL · ' : '') + timeStr(v.createdAt) : 'No vitals recorded'} · Day ${Math.max(1, Math.ceil((Date.now() - a.admittedAt) / 86400000))}</div>
        ${a.ward === 'NICU' ? `<div class="small">Phototherapy: ${ph != null ? `<b>ON ${Math.floor(ph / 60)}h ${ph % 60}m</b> <button class="btn sm ghost" data-ph="stop:${a.id}">Stop</button>` : `<button class="btn sm ghost" data-ph="start:${a.id}">Start</button>`}</div>` : ''}
        <div class="actions"><a class="btn sm" href="#/nursing/${a.id}">Vitals / MAR</a><button class="btn sm urgent" data-red="${a.id}">Code Red</button><button class="btn sm ghost" data-dis="${a.id}">Discharge</button></div></div>`;
    }).join('');
  };
  const openAdmit = bedId => {
    const free = BEDS.filter(b => !adms.some(a => a.bed === b.id));
    const m = modal(`<h2>Admit patient</h2><div class="list"><div><label for="ap">Search child</label><input id="ap" placeholder="Name / UHID / mobile"><div class="list mt" id="ar"></div><div id="apk"></div></div>
      <div><label for="ab">Bed</label><select id="ab">${free.map(b => `<option value="${b.id}" ${b.id === bedId ? 'selected' : ''}>${b.id} – ${b.label}</option>`).join('')}</select></div>
      <div><label for="ad">Diagnosis / reason</label><input id="ad"></div><div class="actions"><button class="btn" id="aok" disabled>Admit</button><button class="btn ghost" data-close>Cancel</button></div></div>`);
    let sel = null; const q = s => m.el.querySelector(s);
    q('#ap').oninput = debounce(async () => {
      const t = q('#ap').value.toLowerCase(); if (t.length < 2) return;
      const hits = (await api.query('patients')).filter(p => (p.name + p.uhid + p.mobile).toLowerCase().includes(t)).slice(0, 5);
      q('#ar').innerHTML = hits.map(p => `<button class="btn sm sec" data-p="${p.id}" style="justify-content:flex-start">${esc(p.name)} · ${esc(p.uhid)}</button>`).join('');
      q('#ar').querySelectorAll('[data-p]').forEach(b => b.onclick = () => { sel = hits.find(p => p.id === b.dataset.p); q('#apk').innerHTML = `<div class="row hl mt"><b>${esc(sel.name)}</b></div>`; q('#ar').innerHTML = ''; q('#aok').disabled = false; });
    }, 150);
    q('#aok').onclick = async () => {
      const bed = BEDS.find(b => b.id === q('#ab').value);
      const id = await api.add('admissions', { patientId: sel.id, name: sel.name, ageText: ageText(sel.dob), weight: sel.weight, gestation: sel.gestation || '', bed: bed.id, ward: bed.ward, dx: q('#ad').value.trim(), status: 'active', admittedAt: Date.now(), by: user.name });
      audit(api, user, 'admit', id); toast('Admitted to ' + bed.id); m.close();
    };
  };
  view.addEventListener('click', async e => {
    if (e.target.closest('#adm')) return openAdmit();
    const ad = e.target.closest('[data-admit]'); if (ad) return openAdmit(ad.dataset.admit);
    const ph = e.target.closest('[data-ph]');
    if (ph) { const [act, id] = ph.dataset.ph.split(':'); await api.update('admissions', id, { photo: act === 'start' ? { start: Date.now() } : { ...(adms.find(a => a.id === id).photo || {}), stop: Date.now() } }); audit(api, user, 'phototherapy_' + act, id); return; }
    const red = e.target.closest('[data-red]');
    if (red) { const a = adms.find(x => x.id === red.dataset.red); await api.add('alerts', { active: true, admissionId: a.id, bed: a.bed, name: a.name, msg: 'Crash call – doctor to bedside', by: user.name }); audit(api, user, 'code_red', a.id); return toast('Code Red broadcast', 'err'); }
    const dis = e.target.closest('[data-dis]');
    if (dis) { const a = adms.find(x => x.id === dis.dataset.dis); if (!confirm('Discharge ' + a.name + '?')) return; await api.update('admissions', a.id, { status: 'discharged', dischargedAt: Date.now() }); audit(api, user, 'discharge', a.id); toast('Discharged'); }
  });
  const u1 = api.watch('admissions', [['status', 'active']], l => { adms = l; draw(); });
  const u2 = api.watch('vitals', [], l => { vit = l; draw(); });
  const tick = setInterval(draw, 60000);
  return () => { u1(); u2(); clearInterval(tick); };
}
