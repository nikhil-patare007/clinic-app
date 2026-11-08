import { esc, $, $$, todayStr, ageText, dateStr, money, toast, audit, icon } from '../util.js';
import { CLINIC } from '../clinic.js';

/* ---------- pure helpers (unit-tested) ---------- */
const localDate = iso => new Date(iso + 'T00:00:00');
function shiftMonths(d, n) {
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return new Date(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), last));
}

// Rolling ranges that always END today, so "last 7 days" is today and the 6 days before it.
export function resolveRange(kind, custom = {}, now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (kind === 'custom') {
    const from = custom.from || '', to = custom.to || '';
    return { from, to, valid: !!from && !!to && from <= to };
  }
  let start;
  if (kind === 'week') { start = new Date(end); start.setDate(end.getDate() - 6); }
  else if (kind === 'year') start = shiftMonths(end, -12);
  else start = shiftMonths(end, -1);
  return { from: todayStr(start), to: todayStr(end), valid: true };
}

export const EXPORT_COLUMNS = [
  ['UHID', r => r.uhid], ['Patient name', r => r.name], ['Gender', r => r.gender], ['Date of birth', r => r.dob], ['Age', r => r.age],
  ['Weight (kg)', r => r.weight], ['Birth weight (kg)', r => r.birthWt], ['Gestation', r => r.gestation], ['Allergies', r => r.allergies],
  ['Guardian', r => r.guardian], ['Mobile', r => r.mobile], ['Address / village', r => r.address], ['Registered on', r => r.registeredOn],
  ['Visits in period', r => r.visits], ['Last visit', r => r.lastVisit], ['Diagnosis / complaints', r => r.dx],
  ['Fees billed (INR)', r => r.fee], ['Paid (INR)', r => r.paid], ['Due (INR)', r => r.due]
];

// mode: 'visited' (had a visit in the period) | 'registered' (first registered in the period)
export function buildExportRows({ patients = [], visits = [] }, { from, to, mode = 'visited' }) {
  const byPatient = new Map();
  for (const v of visits) {
    if (!v.patientId || !v.date || v.date < from || v.date > to) continue;
    (byPatient.get(v.patientId) || byPatient.set(v.patientId, []).get(v.patientId)).push(v);
  }
  const rows = [];
  for (const p of patients) {
    const registeredOn = p.createdAt ? todayStr(new Date(p.createdAt)) : '';
    const vs = (byPatient.get(p.id) || []).sort((a, b) => (a.date + (a.token || 0)).localeCompare(b.date + (b.token || 0)));
    const include = mode === 'registered' ? (registeredOn && registeredOn >= from && registeredOn <= to) : vs.length > 0;
    if (!include) continue;
    const fee = vs.reduce((s, v) => s + (v.fee || 0), 0), paid = vs.reduce((s, v) => s + (v.paidAmount || 0), 0);
    const due = vs.reduce((s, v) => s + (v.mode === 'exempt' ? 0 : Math.max(0, (v.fee || 0) - (v.paidAmount || 0))), 0);
    const dx = [...new Set(vs.map(v => (v.dx || (v.complaints || []).join(', ') || '').trim()).filter(Boolean))].join('; ');
    rows.push({
      id: p.id, uhid: p.uhid || '', name: p.name || '', gender: p.gender || '', dob: p.dob || '', age: p.dob ? ageText(p.dob) : '',
      weight: p.weight ?? '', birthWt: p.birthWt ?? '', gestation: p.gestation || '', allergies: p.allergies || '',
      guardian: p.guardian || '', mobile: p.mobile || '', address: p.address || '', registeredOn,
      visits: vs.length, lastVisit: vs.length ? vs[vs.length - 1].date : '', dx, fee, paid, due
    });
  }
  rows.sort((a, b) => String(b.lastVisit || b.registeredOn).localeCompare(String(a.lastVisit || a.registeredOn)) || a.name.localeCompare(b.name));
  const totals = rows.reduce((t, r) => ({ patients: t.patients + 1, visits: t.visits + r.visits, fee: t.fee + r.fee, paid: t.paid + r.paid, due: t.due + r.due }), { patients: 0, visits: 0, fee: 0, paid: 0, due: 0 });
  return { rows, totals };
}

// RFC-4180 CSV. Cells that start with = + - @ are prefixed with ' so Excel never runs patient-typed text as a formula.
export function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCsv(rows) {
  return [EXPORT_COLUMNS.map(c => csvCell(c[0])).join(','), ...rows.map(r => EXPORT_COLUMNS.map(c => csvCell(c[1](r))).join(','))].join('\r\n');
}

/* ---------- page ---------- */
const RANGES = [['week', 'Last 7 days'], ['month', 'Last month'], ['year', 'Last year'], ['custom', 'Custom range']];
const MODES = [['visited', 'Visited in this period'], ['registered', 'Registered in this period']];

export async function render(view, _p, ctx) {
  const { api, user } = ctx;
  let kind = 'week', mode = 'visited', custom = { from: todayStr(), to: todayStr() }, data = { patients: [], visits: [] }, current = { rows: [], totals: null }, range = resolveRange('week');

  view.innerHTML = `<div class="page-head"><div><h1>Export patient data</h1><p>Download patient details for a time period</p></div></div>
  <div class="card mb"><div class="grid" style="gap:16px">
    <div><label>Time period</label><div class="tabs" id="xr" style="margin:0" role="group" aria-label="Time period">${RANGES.map(([k, l]) => `<button type="button" data-r="${k}">${l}</button>`).join('')}</div></div>
    <div class="form hidden" id="xc"><div class="f"><label for="xf">From</label><input id="xf" type="date" value="${custom.from}"></div><div class="f"><label for="xt">To</label><input id="xt" type="date" value="${custom.to}"></div></div>
    <div><label>Include patients who</label><div class="seg" style="max-width:460px" id="xm">${MODES.map(([k, l]) => `<label><input type="radio" name="xmode" value="${k}" ${k === mode ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
    <div class="muted" id="xrange"></div>
  </div></div>
  <div class="grid g4 stats-row mb" id="xstats"></div>
  <div class="card"><div class="page-head" style="margin-bottom:12px"><h2 style="border:0;padding:0;margin:0">Preview <span class="muted small" id="xn"></span></h2>
    <div class="actions"><button class="btn sec" type="button" id="xprint">${icon('print', 18)} Print</button><button class="btn" type="button" id="xcsv">${icon('download', 18)} Download CSV</button></div></div>
    <div class="tablewrap"><table><thead><tr><th>UHID</th><th>Patient</th><th>Guardian / mobile</th><th>Visits</th><th>Last visit</th><th>Diagnosis</th><th class="right">Due</th></tr></thead><tbody id="xb"></tbody></table></div>
    <p class="small muted mt">The CSV opens directly in Excel / Google Sheets and has every column (age, weight, allergies, address, fees…). The preview shows the first 100 patients.</p></div>`;

  const fmt = iso => iso ? dateStr(localDate(iso)) : '–';
  const draw = () => {
    $$('#xr button', view).forEach(b => b.classList.toggle('on', b.dataset.r === kind));
    $('#xc', view).classList.toggle('hidden', kind !== 'custom');
    range = resolveRange(kind, custom);
    const ok = range.valid;
    $('#xrange', view).textContent = ok ? `${fmt(range.from)} – ${fmt(range.to)}` : (kind === 'custom' ? 'Pick a start and end date (start must not be after end).' : '');
    current = ok ? buildExportRows(data, { from: range.from, to: range.to, mode }) : { rows: [], totals: null };
    const t = current.totals || { patients: 0, visits: 0, fee: 0, paid: 0, due: 0 };
    const stat = (k, v, s = '') => `<div class="card stat"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    $('#xstats', view).innerHTML = stat('Patients', t.patients) + stat('Visits', t.visits) + stat('Billed', money(t.fee), `${money(t.paid)} collected`) + stat('Dues', money(t.due));
    $('#xn', view).textContent = ok ? `· ${t.patients} patient${t.patients === 1 ? '' : 's'}` : '';
    $('#xb', view).innerHTML = current.rows.length ? current.rows.slice(0, 100).map(r => `<tr><td>${esc(r.uhid)}</td><td><a href="#/patient/${esc(r.id)}"><b>${esc(r.name)}</b></a><div class="small muted">${esc(r.age)} · ${esc(r.gender)}</div></td><td>${esc(r.guardian)}<div class="small muted">${esc(r.mobile)}</div></td><td>${r.visits}</td><td>${esc(fmt(r.lastVisit))}</td><td>${esc(r.dx || '–')}</td><td class="right">${r.due ? money(r.due) : '–'}</td></tr>`).join('') : `<tr><td colspan="7" class="muted">${ok ? 'No patients in this period.' : 'Choose a valid period.'}</td></tr>`;
    $('#xcsv', view).disabled = $('#xprint', view).disabled = !current.rows.length;
  };

  view.addEventListener('click', async e => {
    const r = e.target.closest('[data-r]'); if (r) { kind = r.dataset.r; return draw(); }
    if (e.target.closest('#xcsv')) {
      const csv = '\ufeff' + toCsv(current.rows);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `dvc-patients_${range.from}_to_${range.to}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      audit(api, user, 'export_patients', `${range.from}..${range.to} ${mode} n=${current.rows.length}`);
      toast(`Exported ${current.rows.length} patient${current.rows.length === 1 ? '' : 's'}`);
    }
    if (e.target.closest('#xprint')) {
      const w = window.open('', '_blank', 'width=1000,height=800'); if (!w) return toast('Allow pop-ups to print', 'err');
      w.document.write(`<!doctype html><html><head><title>Patients ${esc(range.from)} to ${esc(range.to)}</title><style>body{font:12px Arial,sans-serif;padding:20px;color:#111}h2{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f1f5f9}</style></head><body><h2>${esc(CLINIC.name)} – patient list</h2><div>${esc(fmt(range.from))} – ${esc(fmt(range.to))} · ${current.rows.length} patients · ${esc(MODES.find(m => m[0] === mode)[1])}</div>
        <table><thead><tr><th>UHID</th><th>Patient</th><th>Age / sex</th><th>Guardian</th><th>Mobile</th><th>Village</th><th>Visits</th><th>Last visit</th><th>Diagnosis</th><th>Due</th></tr></thead><tbody>${current.rows.map(r => `<tr><td>${esc(r.uhid)}</td><td>${esc(r.name)}</td><td>${esc(r.age)} / ${esc(r.gender)}</td><td>${esc(r.guardian)}</td><td>${esc(r.mobile)}</td><td>${esc(r.address)}</td><td>${r.visits}</td><td>${esc(fmt(r.lastVisit))}</td><td>${esc(r.dx)}</td><td>${r.due || ''}</td></tr>`).join('')}</tbody></table></body></html>`);
      w.document.close(); w.focus(); w.print();
    }
  });
  view.addEventListener('change', e => {
    if (e.target.name === 'xmode') { mode = e.target.value; draw(); }
    if (e.target.id === 'xf') { custom.from = e.target.value; draw(); }
    if (e.target.id === 'xt') { custom.to = e.target.value; draw(); }
  });

  draw();
  try {
    const [patients, visits] = await Promise.all([api.query('patients'), api.query('visits')]);
    data = { patients, visits }; draw();
  } catch (err) { toast('Could not load data: ' + (err.message || err), 'err'); }
}
