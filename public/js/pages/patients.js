import { esc, $, ageText, ageMonths, dateStr, money, debounce, chip, toast, audit, icon, waLink, timeStr, todayStr, patientDueWaText, vaccineReminderText } from '../util.js';
import { VACCINES, getCustomVaccineEntries, vaxIsGiven, vaxGivenLabel } from '../clinic.js';

export async function render(view, _p, ctx) {
  const all = (await ctx.api.query('patients')).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  view.innerHTML = `<div class="page-head"><div><h1>Patients</h1><p>${all.length} registered</p></div></div>
    <div class="card"><label for="ps">Search by name, mobile, UHID or village</label><input id="ps" placeholder="Start typing…" autofocus><div class="list mt" id="pl"></div></div>`;
  const draw = () => {
    const q = $('#ps', view).value.trim().toLowerCase();
    const rows = (q ? all.filter(p => [p.name, p.mobile, p.uhid, p.address].some(v => String(v || '').toLowerCase().includes(q))) : all).slice(0, 50);
    $('#pl', view).innerHTML = rows.length ? rows.map(p => `<a class="row" href="#/patient/${p.id}" style="color:inherit"><div class="info"><b>${esc(p.name)}</b> ${p.allergies && p.allergies !== 'None' ? chip('Allergy: ' + p.allergies, 'crit') : ''}<div class="small muted">${esc(p.uhid)} · ${ageText(p.dob)} · ${esc(p.gender)} · ${esc(p.guardian || '')} · ${esc(p.mobile || '')}</div></div><span class="muted">›</span></a>`).join('') : '<div class="empty">No patients found.</div>';
  };
  $('#ps', view).addEventListener('input', debounce(draw, 120)); draw();
}

export async function renderProfile(view, params, ctx) {
  const { api, user } = ctx, id = params[0];
  const pt = await api.get('patients', id);
  if (!pt) { view.innerHTML = '<div class="empty">Patient not found.</div>'; return; }
  const [visits, labs, adms] = await Promise.all([api.query('visits', [['patientId', id]]), api.query('labs', [['patientId', id]]), api.query('admissions', [['patientId', id]])]);
  visits.sort((a, b) => b.createdAt - a.createdAt);
  const vax = { ...(pt.vaccines || {}) };
  const canEdit = ['doctor', 'nurse', 'admin'].includes(user.role);
  let tab = 'visits';
  const due = visits.reduce((s, v) => s + Math.max(0, (v.fee || 0) - (v.paidAmount || 0)), 0);

  view.innerHTML = `<div class="card mb"><div class="pt-head"><div class="grow"><div class="name">${esc(pt.name)}</div>
    <div class="muted">${esc(pt.uhid)} · ${ageText(pt.dob)} · ${esc(pt.gender)} · Wt ${pt.weight || '–'} kg · DOB approx ${dateStr(pt.dob)}</div>
    <div class="muted">Guardian: ${esc(pt.guardian)} · ☎ ${esc(pt.mobile)} · ${esc(pt.address || '')}</div>
    <div class="mt">${chip('Allergies: ' + (pt.allergies || 'None'), pt.allergies && pt.allergies !== 'None' ? 'crit' : 'ok')} ${pt.gestation ? chip(pt.gestation) : ''} ${pt.birthWt ? chip('Birth wt ' + pt.birthWt + ' kg') : ''} ${due ? chip('Dues ' + money(due), 'warn') : ''}</div></div>
    <div class="actions"><a class="btn sec" href="#/growth/${id}">${icon('chart', 18)} Growth</a><a class="btn wa" target="_blank" rel="noopener" href="${waLink(pt.mobile, patientDueWaText({ patientName: pt.name, uhid: pt.uhid, fee: visits[0]?.fee || 0, paid: visits[0]?.paidAmount || 0, due: Math.max((visits[0]?.fee || 0) - (visits[0]?.paidAmount || 0), 0), date: todayStr() }))}">WhatsApp</a>${['admin', 'doctor'].includes(user.role) ? `<button class="btn ghost danger" id="delete-patient">Delete patient</button>` : ''}</div></div></div>
    <div class="tabs" id="tb">${[['visits', 'Visits'], ['vax', 'Vaccinations'], ['labs', 'Investigations'], ['adm', 'Admissions']].map(([k, l]) => `<button data-t="${k}">${l}</button>`).join('')}</div><div id="tc"></div>`;

  const draw = () => {
    view.querySelectorAll('#tb button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    const tc = $('#tc', view);
    if (tab === 'visits') tc.innerHTML = `<div class="card">${visits.length ? `<div class="timeline">${visits.map(v => `<div><b>${dateStr(v.createdAt)}</b> ${chip(v.tokenLabel)} ${v.status !== 'done' ? chip(v.status, 'warn') : ''}<div>${esc(v.dx || (v.complaints || []).join(', ') || '–')}</div>
      ${(v.meds || []).length ? `<div class="small muted">Rx: ${v.meds.map(m => esc(m.name.replace(/^Syp\. /, '') + ' ' + m.dose)).join(' · ')}</div>` : ''}
      ${v.vitals ? `<div class="small muted">${Object.entries(v.vitals).map(([k, x]) => k + ' ' + x).join(' · ')}</div>` : ''}
      ${['doctor', 'admin'].includes(user.role) ? `<a class="small" href="#/consult/${v.id}">Open</a>` : ''}</div>`).join('')}</div>` : '<div class="empty">No visits yet.</div>'}</div>`;
    if (tab === 'vax') {
      const dob = new Date(pt.dob), m = ageMonths(pt.dob), today = new Date(); const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const customRows = getCustomVaccineEntries(pt).map(item => {
        const key = item.key;
        const given = item.given;
        const reminderHref = !given ? waLink(pt.mobile, vaccineReminderText({ patientName: pt.name, uhid: pt.uhid, vaccineName: item.vaccineName, dueDate: item.dueDate || dateStr(Date.now()), leadDays: 1, source: item.source, clinicName: 'Dr. Chothe Children Hospital' })) : '';
        return `<div class="row" style="padding:0;margin:0;border:0;background:transparent;display:flex;align-items:center;gap:8px;flex-wrap:wrap"><button ${canEdit ? '' : 'disabled'} class="chip ${given ? 'ok' : 'vax'}" style="border:0;cursor:pointer;min-height:32px" data-v="${esc(key)}">${given ? '✔ ' : ''}${esc(item.vaccineName)}${given ? ' · ' + esc(item.givenOn || 'Given') : ''}</button>${reminderHref ? `<a class="btn sm wa" target="_blank" rel="noopener" href="${reminderHref}">WhatsApp reminder</a>` : ''}</div>`;
      }).join('');
      tc.innerHTML = `<div class="card"><p class="small muted">Indicative IAP schedule – verify against the current IAP chart. Tap to mark given today. Guardians receive a WhatsApp reminder only when a vaccine is due within 1–2 days${canEdit ? '' : ' (read-only for your role)'}.</p>` + VACCINES.map(g => {
        const dueDate = new Date(dob.getTime() + g.age * 7 * 86400000);
        const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
        const diffDays = Math.round((dueDateOnly - dayStart) / 86400000);
        const dueSoon = diffDays >= 1 && diffDays <= 2;
        return `<div class="mt"><b>${g.label}</b> <span class="small muted">due ${dateStr(dueDate)}</span><div class="chips mt">${g.items.map(it => {
          const k = g.label + '|' + it, given = vaxIsGiven(vax[k]) ? vaxGivenLabel(vax[k]) : '', over = !given && dueDate < new Date();
          const reminderHref = !given && dueSoon ? waLink(pt.mobile, vaccineReminderText({ patientName: pt.name, uhid: pt.uhid, vaccineName: it, dueDate: dateStr(dueDate), leadDays: diffDays, clinicName: 'Dr. Chothe Children Hospital' })) : '';
          return `<div class="row" style="padding:0;margin:0;border:0;background:transparent;display:flex;align-items:center;gap:8px;flex-wrap:wrap"><button ${canEdit ? '' : 'disabled'} class="chip ${given ? 'ok' : over ? 'crit' : 'vax'}" style="border:0;cursor:pointer;min-height:32px" data-v="${esc(k)}">${given ? '✔ ' : ''}${esc(it)}${given ? ' · ' + esc(given) : ''}</button>${reminderHref ? `<a class="btn sm wa" target="_blank" rel="noopener" href="${reminderHref}">WhatsApp reminder</a>` : ''}</div>`;
        }).join('')}</div></div>`;
      }).join('') + (customRows ? `<div class="mt"><b>Custom vaccines</b><div class="chips mt">${customRows}</div></div>` : '') + `</div>`;
      void m;
    }
    if (tab === 'labs') tc.innerHTML = `<div class="card">${labs.length ? labs.sort((a, b) => b.createdAt - a.createdAt).map(l => `<div class="row mb"><div class="info"><b>${esc(l.test)}</b><div class="small muted">${dateStr(l.createdAt)} · ${esc(l.status)}</div></div><div>${esc(l.result || '–')} ${l.flag ? chip(l.flag, l.flag === 'Normal' ? 'ok' : 'crit') : ''}</div></div>`).join('') : '<div class="empty">No investigations.</div>'}</div>`;
    if (tab === 'adm') tc.innerHTML = `<div class="card">${adms.length ? adms.map(a => `<div class="row mb"><div class="token">${esc(a.bed)}</div><div class="info"><b>${esc(a.dx || '')}</b><div class="small muted">Admitted ${dateStr(a.admittedAt)} ${timeStr(a.admittedAt)} · ${esc(a.status)}</div></div></div>`).join('') : '<div class="empty">No admissions.</div>'}</div>`;
  };
  view.addEventListener('click', async e => {
    const deleteBtn = e.target.closest('#delete-patient');
    if (deleteBtn) {
      const ok = window.confirm(`Delete patient ${pt.name} (${pt.uhid})? This cannot be undone.`);
      if (!ok) return;
      await api.delete('patients', id);
      audit(api, user, 'patient_delete', id);
      toast('Patient deleted');
      window.location.hash = '#/patients';
      return;
    }
    const t = e.target.closest('[data-t]'); if (t) { tab = t.dataset.t; return draw(); }
    const v = e.target.closest('[data-v]');
    if (v && canEdit) {
      const k = v.dataset.v, cur = vax[k], isObj = cur && typeof cur === 'object';
      if (vaxIsGiven(cur)) { if (isObj) vax[k] = { ...cur, status: 'pending', givenOn: '' }; else delete vax[k]; }
      else vax[k] = isObj ? { ...cur, status: 'given', givenOn: dateStr(Date.now()) } : dateStr(Date.now());
      await api.update('patients', id, { vaccines: vax }); audit(api, user, 'vaccine', id + ':' + k); draw();
    }
  });
  draw(); void toast;
}
