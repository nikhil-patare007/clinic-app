import { esc, $, $$, num, ageText, ageMonths, dateStr, todayStr, waLink, toast, audit, chip, icon } from '../util.js';
import { CLINIC } from '../clinic.js';

const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base' });

export async function render(view, params, ctx) {
  const { api, user } = ctx, vid = params[0];
  const visit = vid && await api.get('visits', vid);
  if (!visit) { view.innerHTML = '<div class="empty">Visit not found. Open it from the <a href="#/queue">OPD queue</a>.</div>'; return; }
  const pt = await api.get('patients', visit.patientId);
  if (!pt) { view.innerHTML = '<div class="empty">This patient has been deleted. <a href="#/queue">Back to OPD queue</a></div>'; return; }
  const prior = (await api.query('visits', [['patientId', visit.patientId]])).filter(v => v.id !== vid && v.status === 'done').sort((a, b) => b.createdAt - a.createdAt);
  const S = {
    meds: visit.meds ? [...visit.meds] : [],
    dx: visit.dx || '',
    vit: visit.vitals || {},
    advice: visit.advice || '',
    exam: visit.exam || '',
    hist: visit.history || '',
    fu: visit.followUp || '',
    fee: Number(visit.fee ?? 100),
    paidAmount: Number(visit.paidAmount ?? 0),
    dueAmount: Number(visit.dueAmount ?? Math.max(Number(visit.fee ?? 100) - Number(visit.paidAmount ?? 0), 0))
  };
  let master = (await api.query('medicines').catch(() => [])).sort(byName); // shared list managed in the Medicines module
  const weight = () => num(S.vit.weight) || pt.weight || 0;
  const locked = visit.status === 'done';

  view.innerHTML = `<div class="no-print">
  <div class="card mb"><div class="pt-head"><div class="grow"><div class="name">${esc(pt.name)} ${visit.priority == 1 ? chip('STAT', 'crit') : ''}</div>
    <div class="muted">${ageText(pt.dob)} · ${esc(pt.gender)} · ${esc(pt.uhid)} · Token ${esc(visit.tokenLabel)} · Parent: ${esc(pt.guardian)} (${esc(pt.mobile)})</div>
    <div class="mt">${chip('Allergies: ' + (pt.allergies || 'None'), pt.allergies && pt.allergies !== 'None' ? 'crit' : 'ok')} ${(visit.complaints || []).map(c => chip(c, 'vax')).join(' ')}</div></div>
    <a class="btn sec sm" href="#/growth/${pt.id}">${icon('chart', 16)} Growth</a><a class="btn ghost sm" href="#/patient/${pt.id}">History</a></div></div>
  <div class="split"><div class="grid">
    <div class="card"><h2>Vitals</h2><div class="form">
      ${[['weight', 'Weight (kg)', '0.1'], ['temp', 'Temp (°F)', '0.1'], ['spo2', 'SpO₂ (%)', '1'], ['hr', 'Pulse (/min)', '1'], ['rr', 'Resp. rate (/min)', '1'], ['height', 'Height (cm)', '0.1']].map(([k, l, s]) => `<div class="f4"><label for="v_${k}">${l}</label><input id="v_${k}" data-vit="${k}" type="number" step="${s}" inputmode="decimal" value="${esc(S.vit[k] ?? (k === 'weight' ? pt.weight : ''))}"></div>`).join('')}
    </div></div>
    <div class="card"><h2>History & examination</h2><div class="form">
      <div class="f12"><label for="hist">Complaints with duration / history</label>
        <div class="chips mt mb" id="hist-chips">${['Fever','Cold','Cough','Loose motions','Vomiting','Ear pain','Rash','Breathing difficulty','Poor feeding','Weight loss','Constipation','Abdominal pain','Runny nose'].map(text => `<button type="button" class="chip" data-hist-chip="${esc(text)}">${esc(text)}</button>`).join('')}</div>
        <textarea id="hist" placeholder="Fever, cold, cough…">${esc(S.hist)}</textarea>
      </div>
      <div class="f12"><label for="exam">Examination (Chest, ENT, Abdomen, General)</label><textarea id="exam">${esc(S.exam)}</textarea></div>
      <div class="f12"><label for="dx">Provisional diagnosis</label><input id="dx" value="${esc(S.dx)}" placeholder="Acute URTI"></div>
    </div></div>
    <div class="card"><h2>Medicines</h2>
      <div class="medicine-master mt">
        <div class="medicine-input-wrap">
          <label for="med-pick">Medicine list</label>
          <select id="med-pick" aria-label="Choose a medicine from the saved list"></select>
          <label for="custom-med-name" style="margin-top:6px">Medicine name</label>
          <div class="medicine-input-row">
            <input id="custom-med-name" list="medicine-datalist" placeholder="Pick from the list or type a name" autocomplete="off">
            <button type="button" class="btn sec sm" id="save-med-name" title="Save this medicine to the shared list">Save to list</button>
          </div>
          <datalist id="medicine-datalist"></datalist>
          <div class="small muted">Add, edit or delete medicines in the <a href="#/medicines">Medicines</a> module.</div>
        </div>
      </div>
      <div class="form mt medicine-form">
        <div class="f4"><label for="custom-med-dose">Dose</label><input id="custom-med-dose" placeholder="As advised"></div>
        <div class="f4"><label for="custom-med-freq">Frequency</label><input id="custom-med-freq" placeholder="OD"></div>
        <div class="f4"><label for="custom-med-days">Days</label><input id="custom-med-days" placeholder="5"></div>
        <div class="f12"><label for="custom-med-note">Timing / note</label><input id="custom-med-note" placeholder="After food, 1 hour before sleep"></div>
        <div class="f12"><button type="button" class="btn sec" id="addm" style="width:100%">${icon('plus', 18)} Add to prescription</button></div>
      </div>
      <div id="medlist" class="list mt"></div></div>
    <div class="card"><h2>Advice & follow-up</h2><div class="form">
      <div class="f12"><label for="adv">Care instructions / diet</label><textarea id="adv" placeholder="Offer warm fluids, ORS…">${esc(S.advice)}</textarea></div>
      <div class="f4"><label for="fee">Consultation fee</label><input id="fee" type="number" min="0" step="1" value="${esc(S.fee || 100)}"></div>
      <div class="f4"><label for="paid">Paid amount</label><input id="paid" type="number" min="0" step="1" value="${esc(S.paidAmount || 0)}"></div>
      <div class="f4"><label for="due">Unpaid / due amount</label><input id="due" type="number" min="0" step="1" value="${esc(S.dueAmount || 0)}"></div>
      <div class="f"><label for="fu">Review on</label><input id="fu" type="date" value="${esc(S.fu)}"></div>
    </div></div>
  </div>
  <div class="grid"><div class="card"><h2>Previous visits</h2>${prior.length ? `<div class="timeline">${prior.slice(0, 5).map(v => `<div><b>${dateStr(v.createdAt)}</b><div>${esc(v.dx || '–')}</div><div class="small muted">${(v.meds || []).map(m => esc(m.name.replace(/^Syp\. /, ''))).join(', ')}</div></div>`).join('')}</div>` : '<div class="muted">First visit.</div>'}</div>
    <div class="card"><h2>Actions</h2><div class="list">
      <button class="btn" id="done">Save & complete</button>
      <button class="btn ghost" id="draft">Save draft</button>
      <button class="btn sec" id="print">${icon('print', 18)} Print Rx (A4)</button>
      <a class="btn wa" id="wa" target="_blank" rel="noopener">${icon('send', 18)} Send Rx via WhatsApp</a></div>
      <p class="small muted mt">Doses are calculated from weight as a starting point – always verify before prescribing.</p></div></div></div></div>
  <div class="mt rx-wrap"><div class="rx" id="rx"></div></div>`;

  const medMasterUI = () => {
    const sel = $('#med-pick', view), keep = sel.value;
    sel.innerHTML = `<option value="">${master.length ? 'Select from medicine list…' : 'No saved medicines yet – type a name below'}</option>` + master.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
    if (keep && master.some(m => m.id === keep)) sel.value = keep;
    $('#medicine-datalist', view).innerHTML = master.map(m => `<option value="${esc(m.name)}"></option>`).join('');
  };
  const medUI = () => {
    $('#medlist', view).innerHTML = S.meds.length ? S.meds.map((m, i) => `<div class="row" style="align-items:flex-start;flex-wrap:wrap"><div class="info" style="min-width:200px"><b>${esc(m.name)}</b><div class="small muted">${esc(m.calc || '')}</div></div>
      <div style="width:110px"><label>Dose</label><input data-m="${i}" data-k="dose" value="${esc(m.dose)}"></div>
      <div style="width:140px"><label>Frequency</label><input data-m="${i}" data-k="freq" value="${esc(m.freq)}"></div>
      <div style="width:90px"><label>Days</label><input data-m="${i}" data-k="days" value="${esc(m.days)}"></div>
      <div style="width:170px"><label>Timing / note</label><input data-m="${i}" data-k="note" value="${esc(m.note)}"></div>
      <button class="btn sm ghost" data-rm="${i}" aria-label="Remove">${icon('x', 16)}</button></div>`).join('') : '<div class="empty">No medicines added.</div>';
  };
  const rxUI = () => {
    const w = weight(), ex = S.vit;
    $('#rx', view).innerHTML = `<div class="rx-head">
      <div class="rx-branding">
        <div class="rx-brand"><img src="./screen.png" alt="${esc(CLINIC.name)} logo"></div>
        <div class="rx-clinic">
          <div class="rx-hospital">${esc(CLINIC.name)}</div>
          <div class="rx-doc">${esc(CLINIC.doctor)}</div>
          <div class="small">${esc(CLINIC.qual)}<br>${esc(CLINIC.reg)}</div>
        </div>
      </div>
      <div class="small right rx-contact">${esc(CLINIC.address)}<br>☎ ${CLINIC.phones.join(' / ')}<br>${esc(CLINIC.timings)}</div>
    </div>
    <div class="meta"><span><b>${esc(pt.name)}</b></span><span>${ageText(pt.dob)} / ${esc(pt.gender)}</span><span>Wt: ${w || '–'} kg</span><span>${esc(pt.uhid)}</span><span>${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>${S.dx ? `<span>Dx: <b>${esc(S.dx)}</b></span>` : ''}</div>
    ${[ex.temp && 'Temp ' + ex.temp + '°F', ex.spo2 && 'SpO₂ ' + ex.spo2 + '%', ex.hr && 'HR ' + ex.hr, ex.rr && 'RR ' + ex.rr].filter(Boolean).length ? `<div class="small mb">Vitals: ${[ex.temp && 'Temp ' + ex.temp + '°F', ex.spo2 && 'SpO₂ ' + ex.spo2 + '%', ex.hr && 'HR ' + ex.hr + '/min', ex.rr && 'RR ' + ex.rr + '/min'].filter(Boolean).join(' · ')}</div>` : ''}
    ${pt.allergies && pt.allergies !== 'None' ? `<div class="small mb" style="color:var(--crit-t)"><b>Allergy:</b> ${esc(pt.allergies)}</div>` : ''}
    <table><thead><tr><th>#</th><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Duration</th></tr></thead><tbody>
    ${S.meds.map((m, i) => `<tr><td>${i + 1}</td><td><b>${esc(m.name)}</b>${m.note ? `<div class="small muted">${esc(m.note)}</div>` : ''}</td><td class="dose">${esc(m.dose)}</td><td>${esc(m.freq)}</td><td>${esc(m.days)}${m.days && /^\d+$/.test(m.days) ? ' days' : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">–</td></tr>'}</tbody></table>
    ${S.advice ? `<div class="mt small"><b>Advice:</b><br>${esc(S.advice).replace(/\n/g, '<br>')}</div>` : ''}
    <div class="redflags"><b>Danger signs – come immediately / तातडीने या:</b> difficulty in breathing, refusal to feed, repeated vomiting, lethargy or drowsiness, convulsions. Emergency: ${CLINIC.phones.join(' / ')}</div>
    <div class="mt small rx-signoff"><span>${S.fu ? 'Review on: <b>' + dateStr(S.fu) + '</b> or earlier if worse' : ''}</span><span class="right">${esc(CLINIC.doctor)}<br>${esc(CLINIC.reg)}</span></div>`;
    const text = `*${CLINIC.name}*\nPatient: ${pt.name} (${pt.uhid})\nDx: ${S.dx || '-'}\n\n` + S.meds.map((m, i) => `${i + 1}. ${m.name} – ${m.dose} – ${m.freq}${m.days ? ' x ' + m.days + (/^\d+$/.test(m.days) ? ' days' : '') : ''}${m.note ? ' (' + m.note + ')' : ''}`).join('\n') + (S.advice ? `\n\nAdvice: ${S.advice}` : '') + (S.fu ? `\nReview: ${dateStr(S.fu)}` : '') + `\n\nEmergency: ${CLINIC.phones.join(' / ')}`;
    $('#wa', view).href = waLink(pt.mobile, text);
  };
  medMasterUI(); medUI(); rxUI();

  const medInputs = { dose: '#custom-med-dose', freq: '#custom-med-freq', days: '#custom-med-days', note: '#custom-med-note' };
  const fillDefaults = m => { for (const [k, sel] of Object.entries(medInputs)) $(sel, view).value = m[k] || ''; };
  const findMaster = name => master.find(m => String(m.name).trim().toLowerCase() === String(name || '').trim().toLowerCase());

  // choosing from the dropdown fills the name and the default dose / frequency / days / note
  $('#med-pick', view).onchange = e => {
    const m = master.find(x => x.id === e.target.value); if (!m) return;
    $('#custom-med-name', view).value = m.name; fillDefaults(m);
  };
  // typing / picking an exact saved name from the suggestion list does the same (only if the detail boxes are still empty)
  $('#custom-med-name', view).addEventListener('change', e => {
    const m = findMaster(e.target.value);
    if (m && Object.values(medInputs).every(sel => !$(sel, view).value.trim())) fillDefaults(m);
    $('#med-pick', view).value = m ? m.id : '';
  });
  $('#save-med-name', view).onclick = async () => {
    const name = $('#custom-med-name', view).value.trim().replace(/\s+/g, ' ');
    if (!name) return toast('Enter a medicine name', 'err');
    if (findMaster(name)) return toast('Already in the medicine list');
    const d = { name }; for (const [k, sel] of Object.entries(medInputs)) d[k] = $(sel, view).value.trim();
    try { await api.add('medicines', { ...d, updatedAt: Date.now() }); audit(api, user, 'medicine_add', name); toast('Saved to medicine list'); }
    catch (err) { toast('Could not save: ' + (err.message || err), 'err'); }
  };

  $('#addm', view).onclick = () => {
    const customName = $('#custom-med-name', view).value.trim();
    const customDose = $('#custom-med-dose', view).value.trim();
    const customFreq = $('#custom-med-freq', view).value.trim();
    const customDays = $('#custom-med-days', view).value.trim();
    const customNote = $('#custom-med-note', view).value.trim();
    if (!customName) return toast('Enter a medicine name', 'err');
    S.meds.push({
      name: customName,
      dose: customDose || 'As advised',
      calc: '',
      freq: customFreq || 'As advised',
      days: customDays || '',
      note: customNote || ''
    });
    $('#custom-med-name', view).value = '';
    $('#custom-med-dose', view).value = '';
    $('#custom-med-freq', view).value = '';
    $('#custom-med-days', view).value = '';
    $('#custom-med-note', view).value = '';
    $('#med-pick', view).value = '';
    medUI(); rxUI();
  };
  view.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.m !== undefined) S.meds[+t.dataset.m][t.dataset.k] = t.value;
    else if (t.dataset.vit) { S.vit[t.dataset.vit] = t.value; }
    else if (t.id === 'dx') S.dx = t.value;
    else if (t.id === 'adv') S.advice = t.value;
    else if (t.id === 'fu') S.fu = t.value;
    else if (t.id === 'hist') S.hist = t.value;
    else if (t.id === 'exam') S.exam = t.value;
    else if (t.id === 'fee') { S.fee = Number(t.value || 0); }
    else if (t.id === 'paid') { S.paidAmount = Number(t.value || 0); }
    else if (t.id === 'due') { S.dueAmount = Number(t.value || 0); }
    rxUI();
  });
  view.addEventListener('click', e => {
    const histChip = e.target.closest('[data-hist-chip]');
    if (histChip) {
      const text = histChip.dataset.histChip;
      const hist = $('#hist', view);
      const before = hist.value.trim();
      const next = before ? (before.endsWith(',') || before.endsWith(';') ? before + ' ' + text : before + ', ' + text) : text;
      hist.value = next;
      S.hist = next;
      rxUI();
      hist.focus();
      return;
    }
    const r = e.target.closest('[data-rm]');
    if (r) { S.meds.splice(+r.dataset.rm, 1); medUI(); rxUI(); }
  });
  $('#print', view).onclick = () => window.print();

  async function save(complete) {
    if (complete && !S.dx.trim()) return toast('Add a provisional diagnosis first', 'err');
    const vit = {}; Object.entries(S.vit).forEach(([k, v]) => { const n = num(v); if (n !== null) vit[k] = n; });
    const fee = Number(S.fee || 0);
    const paid = Number(S.paidAmount || 0);
    const due = Number(S.dueAmount || Math.max(fee - paid, 0));
    await api.update('visits', vid, {
      vitals: vit,
      history: S.hist,
      exam: S.exam,
      dx: S.dx,
      meds: S.meds,
      advice: S.advice,
      followUp: S.fu,
      fee,
      paidAmount: paid,
      dueAmount: due,
      doctor: user.name,
      status: complete ? 'done' : 'inroom',
      ...(complete ? { completedAt: Date.now() } : {})
    });
    if (vit.weight && vit.weight !== pt.weight || vit.height) {
      await api.update('patients', pt.id, { weight: vit.weight || pt.weight });
      await api.add('growth', { patientId: pt.id, date: todayStr(), ageMonths: ageMonths(pt.dob), weight: vit.weight || null, height: vit.height || null });
    }
    audit(api, user, complete ? 'rx_complete' : 'rx_draft', vid);
    toast(complete ? 'Prescription saved' : 'Draft saved'); if (complete) ctx.navigate('queue');
  }
  $('#done', view).onclick = () => save(true);
  $('#draft', view).onclick = () => save(false);
  if (locked) $('#done', view).textContent = 'Update & complete';
  // medicines added / edited / deleted in the Medicines module show up here immediately
  const unMeds = api.watch('medicines', [], list => { master = list.sort(byName); if ($('#med-pick', view)) medMasterUI(); });
  return () => unMeds();
}
