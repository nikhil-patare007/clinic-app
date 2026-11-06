import { esc, $, $$, money, todayStr, pad, dobFromAge, ageText, num, waLink, modal, toast, debounce, audit, chip, computeDue, patientDueWaText } from '../util.js';
import { CLINIC, COMPLAINTS } from '../clinic.js';

export async function render(view, _p, ctx) {
  const { api, user } = ctx;
  let existing = null;
  view.innerHTML = `
  <div class="page-head"><div><h1>Patient registration</h1><p>New child or follow-up · generates OPD token</p></div></div>
  <div class="split"><form id="rf" class="grid" autocomplete="off">
    <div class="card"><h2>Follow-up? Find existing child</h2>
      <input id="find" placeholder="Search name, mobile or UHID" aria-label="Find existing patient"><div class="list mt" id="finds"></div>
      <div id="picked" class="mt"></div></div>
    <div class="card"><h2>1 · Child details</h2><div class="form">
      <div class="f8"><label for="name">Child full name *</label><input id="name" required></div>
      <div class="f4"><label>Gender *</label><div class="seg"><label><input type="radio" name="gender" value="Male" checked><span>Male</span></label><label><input type="radio" name="gender" value="Female"><span>Female</span></label><label><input type="radio" name="gender" value="Other"><span>Other</span></label></div></div>
      <div class="f3"><label for="ay">Age – years</label><input id="ay" type="number" min="0" max="18" value="0" inputmode="numeric"></div>
      <div class="f3"><label for="am">Age – months</label><input id="am" type="number" min="0" max="11" value="0" inputmode="numeric"></div>
      <div class="f3"><label for="wt">Weight (kg) *</label><input id="wt" type="number" step="0.01" min="0.3" max="150" required inputmode="decimal"></div>
      <div class="f3"><label for="bw">Birth weight (kg)</label><input id="bw" type="number" step="0.01" inputmode="decimal"></div>
      <div class="f"><label for="gest">Gestation / birth history</label><select id="gest"><option>Term (≥37w)</option><option>Preterm (&lt;37w)</option><option>Unknown</option></select></div>
      <div class="f"><label for="allg">Known drug allergies</label><input id="allg" placeholder="None / Penicillin, Sulfa…"></div>
    </div></div>
    <div class="card"><h2>2 · Guardian & contact</h2><div class="form">
      <div class="f"><label for="gd">Guardian name & relation *</label><input id="gd" required placeholder="Pooja Sharma (Mother)"></div>
      <div class="f"><label for="mob">Mobile number *</label><input id="mob" type="tel" inputmode="numeric" maxlength="10" pattern="[0-9]{10}" required placeholder="10-digit"></div>
      <div class="f12"><label for="addr">Address / village</label><input id="addr" placeholder="Taklimiya, Rahuri"></div>
    </div></div>
    <div class="card"><h2>3 · Visit & triage</h2><div class="form">
      <div class="f12"><label>Visit type</label><div class="seg" style="max-width:360px"><label><input type="radio" name="vtype" value="new" checked><span>New patient</span></label><label><input type="radio" name="vtype" value="followup"><span>Follow-up</span></label></div></div>
      <div class="f12"><label>Chief complaints</label><div class="chips">${COMPLAINTS.map(c => `<label class="tag"><input type="checkbox" name="cc" value="${esc(c)}">${esc(c)}</label>`).join('')}</div></div>
      <div class="f12"><label for="cco">Other complaint (optional)</label><input id="cco"></div>
      <div class="f"><label>Care setting</label><div class="opts">
        <label class="opt"><input type="radio" name="route" value="opd" checked><span><b>OPD consultation</b></span></label>
        <label class="opt"><input type="radio" name="route" value="daycare"><span><b>Day care</b> · IV / nebulization slot</span></label>
        <label class="opt"><input type="radio" name="route" value="ipd"><span><b>IPD admission</b> · bed booking</span></label></div></div>
      <div class="f"><label>Triage priority</label><div class="opts">
        <label class="opt"><input type="radio" name="prio" value="3" checked><span><b>Routine</b> · priority 3</span></label>
        <label class="opt"><input type="radio" name="prio" value="2"><span><b>Urgent</b> · fever &gt;103°F / stridor · priority 2</span></label>
        <label class="opt"><input type="radio" name="prio" value="1"><span><b>Emergency (STAT)</b> · seizure / cyanosis · priority 1</span></label></div></div>
    </div></div>
    <div class="card"><h2>4 · Consultation fee</h2><div class="form">
      <div class="f3"><label for="fee">Consultation fee (₹)</label><input id="fee" type="number" min="0" value="${CLINIC.defaultFee}" inputmode="numeric"></div>
      <div class="f3"><label for="paid">Paid amount (₹)</label><input id="paid" type="number" min="0" value="0" inputmode="numeric"></div>
      <div class="f3"><label for="due">Due amount (₹)</label><input id="due" type="number" min="0" value="${CLINIC.defaultFee}" inputmode="numeric"></div>
      <div class="f"><label>Payment mode</label><div class="seg"><label><input type="radio" name="mode" value="cash" checked><span>Cash</span></label><label><input type="radio" name="mode" value="upi"><span>UPI</span></label><label><input type="radio" name="mode" value="exempt"><span>Exempt</span></label></div></div>
      <div class="f12"><span class="muted">Payment status: </span><b id="status">Unpaid</b></div>
    </div></div>
    <div class="actions"><button class="btn" id="sub" type="submit">Register & generate token →</button><button type="button" class="btn ghost" id="clr">Clear</button></div>
  </form>
  <aside class="card" style="position:sticky;top:80px"><h2>Live token preview</h2>
    <div class="tokenbig" id="tk">OPD-—</div><div class="muted small">${esc(CLINIC.doctor)} · Room 1</div>
    <table class="mt"><tbody id="sum"></tbody></table></aside></div>`;

  const g = id => $('#' + id, view), val = n => ($(`input[name=${n}]:checked`, view) || {}).value;
  const fee = () => num(g('fee').value) || 0;
  const paid = () => num(g('paid').value) || 0;
  const dueAmt = () => num(g('due').value) || 0;
  const refresh = () => {
    const state = computeDue({ fee: fee(), paid: paid(), due: dueAmt() });
    g('fee').value = state.fee;
    g('paid').value = state.paid;
    g('due').value = state.due;
    g('status').textContent = state.status === 'paid' ? 'Paid' : state.status === 'partial' ? 'Partial' : 'Unpaid';
    const age = `${g('ay').value || 0}y ${g('am').value || 0}m`;
    g('sum').innerHTML = [['Name', g('name').value || '–'], ['Age / sex', `${age} · ${val('gender')}`], ['Weight', (g('wt').value || '–') + ' kg'], ['Guardian', g('gd').value || '–'], ['Complaints', $$('input[name=cc]:checked', view).map(x => x.value).join(', ') || '–'], ['Fee', `${money(state.fee)} · ${state.status === 'paid' ? 'Paid' : state.status === 'partial' ? 'Part paid' : 'Due'} ${money(state.due)}`]]
      .map(([k, v]) => `<tr><td class="muted small">${k}</td><td class="right"><b>${esc(v)}</b></td></tr>`).join('');
  };
  view.addEventListener('input', refresh); view.addEventListener('change', refresh);
  $$('input[name=vtype]', view).forEach(r => r.addEventListener('change', () => { g('fee').value = val('vtype') === 'new' ? CLINIC.defaultFee : CLINIC.followUpFee; g('paid').value = 0; g('due').value = g('fee').value; refresh(); }));
  refresh();
  api.counter; // (token number is allocated on submit)

  const finds = g('finds');
  g('find').addEventListener('input', debounce(async () => {
    const q = g('find').value.trim().toLowerCase(); if (q.length < 2) { finds.innerHTML = ''; return; }
    const hits = (await api.query('patients')).filter(p => [p.name, p.mobile, p.uhid].some(v => String(v || '').toLowerCase().includes(q))).slice(0, 5);
    finds.innerHTML = hits.map(p => `<div class="row" style="min-height:52px"><div class="info"><b>${esc(p.name)}</b><div class="small muted">${esc(p.uhid)} · ${ageText(p.dob)} · ${esc(p.mobile)}</div></div><button type="button" class="btn sm sec" data-pick="${p.id}">Select</button></div>`).join('') || '<div class="muted small">No match – fill the form to register a new child.</div>';
    finds.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => pick(hits.find(p => p.id === b.dataset.pick)));
  }));
  function pick(p) {
    existing = p; finds.innerHTML = '';
    g('picked').innerHTML = `<div class="row hl"><div class="info"><b>${esc(p.name)}</b> <span class="muted small">${esc(p.uhid)}</span></div><button type="button" class="btn sm ghost" id="unpick">Clear</button></div>`;
    g('unpick').onclick = () => { existing = null; g('picked').innerHTML = ''; };
    g('name').value = p.name; $(`input[name=gender][value=${p.gender}]`, view).checked = true;
    const m = Math.max(0, Math.round((Date.now() - new Date(p.dob)) / 2629800000)); g('ay').value = Math.floor(m / 12); g('am').value = m % 12;
    g('wt').value = p.weight || ''; g('bw').value = p.birthWt || ''; g('allg').value = p.allergies || ''; g('gd').value = p.guardian || ''; g('mob').value = p.mobile || ''; g('addr').value = p.address || '';
    $('input[name=vtype][value=followup]', view).checked = true; g('fee').value = CLINIC.followUpFee; refresh();
  }
  g('clr').onclick = () => { view.querySelector('#rf').reset(); existing = null; g('picked').innerHTML = ''; refresh(); };

  g('rf').onsubmit = async e => {
    e.preventDefault();
    const mob = g('mob').value.replace(/\D/g, '');
    if (mob.length !== 10) return toast('Enter a valid 10-digit mobile number', 'err');
    const wt = num(g('wt').value); if (!wt) return toast('Enter weight', 'err');
    const btn = g('sub'); btn.disabled = true;
    try {
      const today = todayStr();
      let pid, uhid, p = existing;
      const pdata = { name: g('name').value.trim(), gender: val('gender'), weight: wt, guardian: g('gd').value.trim(), mobile: mob, address: g('addr').value.trim(), birthWt: num(g('bw').value), gestation: g('gest').value, allergies: g('allg').value.trim() || 'None' };
      if (p) { pid = p.id; uhid = p.uhid; await api.update('patients', pid, pdata); }
      else {
        const n = await api.counter('uhid'); uhid = `${CLINIC.uhidPrefix}-${new Date().getFullYear()}-${pad(n, 4)}`;
        pid = await api.add('patients', { ...pdata, uhid, dob: dobFromAge(g('ay').value, g('am').value), vaccines: {} });
      }
      const tn = await api.counter('token-' + today), label = 'OPD-' + pad(tn, 3);
      const state = computeDue({ fee: fee(), paid: paid(), due: dueAmt() });
      const complaints = [...$$('input[name=cc]:checked', view).map(x => x.value), ...(g('cco').value.trim() ? [g('cco').value.trim()] : [])];
      const vid = await api.add('visits', { patientId: pid, patientName: pdata.name, uhid, token: tn, tokenLabel: label, date: today, type: val('vtype'), complaints, priority: +val('prio'), route: val('route'), status: 'waiting', fee: state.fee, paidAmount: state.paid, dueAmount: state.due, mode: val('mode'), regBy: user.name });
      await api.add('growth', { patientId: pid, date: today, ageMonths: Math.round((+g('ay').value || 0) * 12 + (+g('am').value || 0)), weight: wt });
      audit(api, user, 'register', vid);
      const waText = `${CLINIC.name}\nToken: ${label}\nUHID: ${uhid}\nPatient: ${pdata.name}\nConsultation fee: ${money(state.fee)}\nPaid: ${money(state.paid)}\nDue: ${money(state.due)}\nEmergency: ${CLINIC.phones.join(' / ')}`;
      const m = modal(`<h2>Registered ✔</h2><div class="tokenbig">${label}</div><p><b>${esc(pdata.name)}</b><br><span class="muted">${esc(uhid)} · ${money(state.fee)} · ${state.due > 0 ? 'Due ' + money(state.due) : 'Payment cleared'}${val('route') !== 'opd' ? ' · ' + val('route').toUpperCase() : ''}</span></p>
        <div class="actions"><a class="btn wa" target="_blank" rel="noopener" href="${waLink(mob, waText)}">Send token on WhatsApp</a><button class="btn sec" id="pr">Print slip</button><button class="btn" id="nx" data-close>New registration</button><a class="btn ghost" href="#/queue" data-close>View queue</a></div>`);
      m.el.querySelector('#pr').onclick = () => printSlip(label, pdata.name, uhid);
      m.el.querySelector('#nx').onclick = () => { view.querySelector('#rf').reset(); existing = null; g('picked').innerHTML = ''; refresh(); };
    } catch (err) { console.error(err); toast('Could not save: ' + (err.message || err), 'err'); }
    btn.disabled = false;
  };
}

function printSlip(label, name, uhid) {
  const w = window.open('', '_blank', 'width=360,height=420'); if (!w) return;
  w.document.write(`<body style="font-family:sans-serif;text-align:center"><h3>${esc(CLINIC.name)}</h3><div style="font-size:48px;font-weight:800">${esc(label)}</div><p>${esc(name)}<br>${esc(uhid)}<br>${new Date().toLocaleString('en-IN')}</p></body>`);
  w.document.close(); w.print();
}
