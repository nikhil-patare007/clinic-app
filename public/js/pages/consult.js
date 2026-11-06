import { esc, $, $$, num, ageText, ageMonths, dateStr, todayStr, waLink, toast, audit, chip, icon } from '../util.js';
import { CLINIC, DRUGS } from '../clinic.js';

export async function render(view, params, ctx) {
  const { api, user } = ctx, vid = params[0];
  const visit = vid && await api.get('visits', vid);
  if (!visit) { view.innerHTML = '<div class="empty">Visit not found. Open it from the <a href="#/queue">OPD queue</a>.</div>'; return; }
  const pt = await api.get('patients', visit.patientId);
  const prior = (await api.query('visits', [['patientId', visit.patientId]])).filter(v => v.id !== vid && v.status === 'done').sort((a, b) => b.createdAt - a.createdAt);
  const S = { meds: visit.meds ? [...visit.meds] : [], dx: visit.dx || '', vit: visit.vitals || {}, advice: visit.advice || '', exam: visit.exam || '', hist: visit.history || '', fu: visit.followUp || '' };
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
      <div class="f12"><label for="hist">Complaints with duration / history</label><textarea id="hist" placeholder="Fever 2 days, dry cough 3 days…">${esc(S.hist)}</textarea></div>
      <div class="f12"><label for="exam">Examination (Chest, ENT, Abdomen, General)</label><textarea id="exam">${esc(S.exam)}</textarea></div>
      <div class="f12"><label for="dx">Provisional diagnosis</label><input id="dx" value="${esc(S.dx)}" placeholder="Acute URTI"></div>
    </div></div>
    <div class="card"><h2>Prescription</h2>
      <div class="form">
        <div class="f8"><label for="drug">Add medicine</label><select id="drug">${DRUGS.map((d, i) => `<option value="${i}">${esc(d.name)}</option>`).join('')}</select></div>
        <div class="f4" style="align-self:end"><button type="button" class="btn sec" id="addm" style="width:100%">${icon('plus', 18)} Add</button></div>
        <div class="f6"><label for="custom-med-name">Custom medicine name</label><input id="custom-med-name" placeholder="Example: Syp. Zinc + Vit. D"></div>
        <div class="f2"><label for="custom-med-dose">Dose</label><input id="custom-med-dose" placeholder="5 ml"></div>
        <div class="f2"><label for="custom-med-freq">Freq.</label><input id="custom-med-freq" placeholder="OD"></div>
        <div class="f2"><label for="custom-med-days">Days</label><input id="custom-med-days" placeholder="5"></div>
        <div class="f12"><label for="custom-med-note">Timing / note</label><input id="custom-med-note" placeholder="After food, 1 hour before sleep"></div>
      </div>
      <div id="medlist" class="list mt"></div></div>
    <div class="card"><h2>Advice & follow-up</h2><div class="form">
      <div class="f12"><label for="adv">Care instructions / diet</label><textarea id="adv" placeholder="Offer warm fluids, ORS…">${esc(S.advice)}</textarea></div>
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
  medUI(); rxUI();

  $('#addm', view).onclick = () => {
    const d = DRUGS[+$('#drug', view).value], w = weight();
    let dose = '', calc = '', freq = d.freq, days = '5', note = d.note;
    if (d.mgPerKg) {
      if (!w) return toast('Enter weight first', 'err');
      const mg = d.perDay ? d.mgPerKg * w / d.doses : d.mgPerKg * w;
      dose = (mg / d.conc).toFixed(1) + ' ml'; calc = `${d.mgPerKg} mg/kg${d.perDay ? '/day' : ''} × ${w} kg = ${mg.toFixed(0)} mg/dose${d.max ? ' · ' + d.max : ''}`;
    } else if (d.fixedMl) dose = d.fixedMl + ' ml'; else if (d.fixedText) dose = d.fixedText;
    let name = d.name;
    const customName = $('#custom-med-name', view).value.trim();
    const customDose = $('#custom-med-dose', view).value.trim();
    const customFreq = $('#custom-med-freq', view).value.trim();
    const customDays = $('#custom-med-days', view).value.trim();
    const customNote = $('#custom-med-note', view).value.trim();
    if (d.custom) {
      if (!customName) return toast('Enter a custom medicine name', 'err');
      name = customName;
      if (customDose) dose = customDose;
      if (customFreq) freq = customFreq;
      if (customDays) days = customDays;
      if (customNote) note = customNote;
    }
    S.meds.push({ name, dose, calc, freq, days, note });
    $('#custom-med-name', view).value = '';
    $('#custom-med-dose', view).value = '';
    $('#custom-med-freq', view).value = '';
    $('#custom-med-days', view).value = '';
    $('#custom-med-note', view).value = '';
    medUI(); rxUI();
  };
  view.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.m !== undefined) S.meds[+t.dataset.m][t.dataset.k] = t.value;
    else if (t.dataset.vit) { S.vit[t.dataset.vit] = t.value; }
    else if (t.id === 'dx') S.dx = t.value; else if (t.id === 'adv') S.advice = t.value; else if (t.id === 'fu') S.fu = t.value; else if (t.id === 'hist') S.hist = t.value; else if (t.id === 'exam') S.exam = t.value;
    rxUI();
  });
  view.addEventListener('click', e => { const r = e.target.closest('[data-rm]'); if (r) { S.meds.splice(+r.dataset.rm, 1); medUI(); rxUI(); } });
  $('#print', view).onclick = () => window.print();

  async function save(complete) {
    if (complete && !S.dx.trim()) return toast('Add a provisional diagnosis first', 'err');
    const vit = {}; Object.entries(S.vit).forEach(([k, v]) => { const n = num(v); if (n !== null) vit[k] = n; });
    await api.update('visits', vid, { vitals: vit, history: S.hist, exam: S.exam, dx: S.dx, meds: S.meds, advice: S.advice, followUp: S.fu, doctor: user.name, status: complete ? 'done' : 'inroom', ...(complete ? { completedAt: Date.now() } : {}) });
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
}
