import { CLINIC, COMPLAINTS, CARE_SETTINGS, VISIT_TYPES } from '../clinic.js';
import { esc, $, $$, icon, toast, audit, todayStr, normalizeDateValue, ageText, debounce } from '../util.js';

export async function render(view, _p, ctx) {
  const { api, user } = ctx;
  const today = todayStr();
  const form = document.createElement('div');
  form.className = 'card';
  form.innerHTML = `
    <div class="page-head"><div><h1>Patient registration</h1><p>New child or follow-up · generates OPD token</p></div></div>
    <div class="split"><form id="rf" class="grid" autocomplete="off">
      <div class="card"><h2>Follow-up? Find existing child</h2>
        <input id="find" placeholder="Search name, mobile or UHID" aria-label="Find existing patient"><div class="list mt" id="finds"></div>
        <div id="picked" class="mt"></div>
      </div>
      <div class="card"><h2>1 · Child details</h2><div class="form">
        <div class="f8"><label for="name">Child full name *</label><input id="name" required></div>
        <div class="f4"><label>Gender *</label><div class="seg"><label><input type="radio" name="gender" value="Male" checked><span>Male</span></label><label><input type="radio" name="gender" value="Female"><span>Female</span></label><label><input type="radio" name="gender" value="Other"><span>Other</span></label></div></div>
        <div class="f3"><label for="dob">Date of birth *</label><input id="dob" type="date" required></div>
        <div class="f3"><label for="ageYears">Age – years</label><input id="ageYears" type="number" min="0" max="18" value="0" inputmode="numeric"></div>
        <div class="f3"><label for="ageMonths">Age – months</label><input id="ageMonths" type="number" min="0" max="11" value="0" inputmode="numeric"></div>
        <div class="f3"><label for="weight">Weight (kg) *</label><input id="weight" type="number" step="0.01" min="0.3" max="150" required inputmode="decimal"></div>
        <div class="f"><label for="birthWt">Birth weight (kg)</label><input id="birthWt" type="number" step="0.01" inputmode="decimal"></div>
        <div class="f"><label for="gestation">Gestation / birth history</label><select id="gestation"><option>Term (≥37w)</option><option>Preterm (&lt;37w)</option><option>Unknown</option></select></div>
        <div class="f"><label for="allergies">Known drug allergies</label><input id="allergies" placeholder="None / Penicillin, Sulfa…" value="None"></div>
      </div></div>
      <div class="card"><h2>2 · Guardian & contact</h2><div class="form">
        <div class="f"><label for="guardian">Guardian name & relation *</label><input id="guardian" required placeholder="Pooja Sharma (Mother)"></div>
        <div class="f"><label for="mobile">Mobile number *</label><input id="mobile" type="tel" inputmode="numeric" maxlength="10" pattern="[0-9]{10}" required placeholder="10-digit"></div>
        <div class="f12"><label for="address">Address / village</label><input id="address" placeholder="Taklimiya, Rahuri"></div>
      </div></div>
      <div class="card"><h2>3 · Visit & triage</h2><div class="form">
        <div class="f12"><label>Visit type</label><div class="seg" style="max-width:360px">${VISIT_TYPES.map(v => `<label><input type="radio" name="vtype" value="${v.value}" ${v.value === 'new' ? 'checked' : ''}><span>${v.label}</span></label>`).join('')}</div></div>
        <div class="f12"><label>Chief complaints</label><div class="chips">${COMPLAINTS.map(c => `<label class="tag"><input type="checkbox" name="cc" value="${esc(c)}">${esc(c)}</label>`).join('')}</div></div>
        <div class="f12"><label for="otherComplaint">Other complaint (optional)</label><input id="otherComplaint"></div>
        <div class="f"><label>Care setting</label><div class="opts">${CARE_SETTINGS.map(v => `<label class="opt"><input type="radio" name="route" value="${v.value}" ${v.value === 'opd' ? 'checked' : ''}><span><b>${v.label}</b>${v.note ? ` · ${v.note}` : ''}</span></label>`).join('')}</div></div>
        <div class="f"><label>Triage priority</label><div class="opts"><label class="opt"><input type="radio" name="prio" value="3" checked><span><b>Routine</b> · priority 3</span></label><label class="opt"><input type="radio" name="prio" value="2"><span><b>Urgent</b> · fever &gt;103°F / stridor · priority 2</span></label><label class="opt"><input type="radio" name="prio" value="1"><span><b>Emergency (STAT)</b> · seizure / cyanosis · priority 1</span></label></div></div>
      </div></div>
      <div class="card"><h2>4 · Consultation fee</h2><div class="form">
        <div class="f3"><label for="fee">Consultation fee (₹)</label><input id="fee" type="number" min="0" value="${CLINIC.defaultFee}" inputmode="numeric"></div>
        <div class="f3"><label for="paid">Paid amount (₹)</label><input id="paid" type="number" min="0" value="0" inputmode="numeric"></div>
        <div class="f3"><label for="due">Due amount (₹)</label><input id="due" type="number" min="0" value="${CLINIC.defaultFee}" inputmode="numeric"></div>
        <div class="f"><label>Payment mode</label><div class="seg"><label><input type="radio" name="mode" value="cash" checked><span>Cash</span></label><label><input type="radio" name="mode" value="upi"><span>UPI</span></label><label><input type="radio" name="mode" value="exempt"><span>Exempt</span></label></div></div>
        <div class="f12"><span class="muted">Payment status: </span><b id="status">Unpaid</b></div>
      </div></div>
      <div class="actions"><button class="btn" id="saveReg" type="submit">Register & generate token →</button><button type="button" class="btn ghost" id="clearReg">Clear</button></div>
    </form></div>
  `;
  view.appendChild(form);

  let existing = null;
  const formEl = form.querySelector('#rf');

  const pickPatient = (p) => {
    existing = p;
    $('#finds', form).innerHTML = '';
    $('#picked', form).innerHTML = `<div class="row hl"><div class="info"><b>${esc(p.name)}</b> <span class="muted small">${esc(p.uhid)}</span></div><button type="button" class="btn sm ghost" id="unpick">Clear</button></div>`;
    $('#unpick', form).onclick = () => { existing = null; $('#picked', form).innerHTML = ''; };
    $('#name', form).value = p.name;
    const gender = p.gender || 'Male';
    form.querySelector(`input[name="gender"][value="${gender}"]`).checked = true;
    $('#dob', form).value = p.dob || '';
    $('#guardian', form).value = p.guardian || '';
    $('#mobile', form).value = p.mobile || '';
    $('#address', form).value = p.address || '';
    $('#weight', form).value = p.weight || '';
    $('#birthWt', form).value = p.birthWt || '';
    $('#gestation', form).value = p.gestation || 'Term (≥37w)';
    $('#allergies', form).value = p.allergies || 'None';
    form.querySelector('input[name="vtype"][value="followup"]').checked = true;
    $('#fee', form).value = CLINIC.defaultFee;
    $('#paid', form).value = 0;
    $('#due', form).value = CLINIC.defaultFee;
  };

  const runSearch = async () => {
    const q = $('#find', form).value.trim().toLowerCase();
    if (q.length < 2) { $('#finds', form).innerHTML = ''; return; }
    const hits = (await api.query('patients')).filter(p => [p.name, p.mobile, p.uhid].some(v => String(v || '').toLowerCase().includes(q))).slice(0, 5);
    $('#finds', form).innerHTML = hits.length ? hits.map(p => `<div class="row" style="min-height:52px"><div class="info"><b>${esc(p.name)}</b><div class="small muted">${esc(p.uhid)} · ${ageText(p.dob)} · ${esc(p.mobile)}</div></div><button type="button" class="btn sm sec" data-pick="${p.id}">Select</button></div>`).join('') : '<div class="muted small">No match – fill the form to register a new child.</div>';
    $('#finds', form).querySelectorAll('[data-pick]').forEach(button => {
      button.onclick = () => pickPatient(hits.find(p => p.id === button.dataset.pick));
    });
  };

  $('#find', form).addEventListener('input', debounce(runSearch, 200));
  form.querySelector('#clearReg').onclick = () => { formEl.reset(); existing = null; $('#picked', form).innerHTML = ''; $('#find', form).value = ''; $('#finds', form).innerHTML = ''; };

  formEl.onsubmit = async (e) => {
    e.preventDefault();
    const name = $('#name', form).value.trim();
    if (!name) return toast('Enter the child name', 'err');
    const dob = normalizeDateValue($('#dob', form).value, null);
    if (!dob) return toast('Enter the date of birth to calculate vaccination schedule', 'err');
    const mob = $('#mobile', form).value.replace(/\D/g, '');
    if (mob.length !== 10) return toast('Enter a valid 10-digit mobile number', 'err');
    const weight = Number($('#weight', form).value);
    if (!weight || weight <= 0) return toast('Enter weight in kg', 'err');

    const patientData = {
      name,
      dob,
      gender: form.querySelector('input[name="gender"]:checked').value,
      guardian: $('#guardian', form).value.trim(),
      mobile: mob,
      address: $('#address', form).value.trim(),
      weight,
      birthWt: $('#birthWt', form).value ? Number($('#birthWt', form).value) : null,
      gestation: $('#gestation', form).value.trim(),
      allergies: $('#allergies', form).value.trim() || 'None',
      vaccines: {},
      updatedAt: Date.now()
    };

    let patientId = null;
    let patientUhId = null;
    if (existing) {
      await api.update('patients', existing.id, patientData);
      patientId = existing.id;
      patientUhId = existing.uhid;
    } else {
      patientUhId = `DVC-${today.replace(/-/g, '')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
      patientId = await api.add('patients', { ...patientData, uhid: patientUhId, createdAt: Date.now() });
    }

    const complaints = [...form.querySelectorAll('input[name="cc"]:checked')].map(el => el.value);
    const otherComplaint = $('#otherComplaint', form).value.trim();
    if (otherComplaint) complaints.push(otherComplaint);
    const route = form.querySelector('input[name="route"]:checked').value;
    const fee = Number($('#fee', form).value || CLINIC.defaultFee);
    const paid = Number($('#paid', form).value || 0);
    const due = Number($('#due', form).value || Math.max(fee - paid, 0));
    const token = Date.now() % 1000;
    const tokenLabel = `OPD-${String(Math.floor(Math.random() * 900) + 100)}`;
    await api.add('visits', {
      patientId,
      patientName: name,
      uhid: patientUhId,
      mobile: mob,
      date: today,
      token,
      tokenLabel,
      type: form.querySelector('input[name="vtype"]:checked').value,
      complaints: complaints.length ? complaints : ['Routine Checkup'],
      priority: Number(form.querySelector('input[name="prio"]:checked').value),
      route,
      status: 'waiting',
      fee,
      paidAmount: paid,
      dueAmount: due,
      mode: form.querySelector('input[name="mode"]:checked').value,
      createdAt: Date.now(),
      by: user.staffId || user.uid
    });

    await audit(api, user, 'register_patient', patientUhId);
    toast('Patient registered');
    location.hash = `#/patient/${patientId}`;
  };

  return () => {};
}
