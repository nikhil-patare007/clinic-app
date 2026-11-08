import { withoutOrphans } from '../cascade.js';
import { esc, money, todayStr, ageText, chip, priorityChip, icon } from '../util.js';
import { DRUGS } from '../clinic.js';

export async function render(view, _p, ctx) {
  const { api, user } = ctx, today = todayStr();
  view.innerHTML = `
  <div class="page-head"><div><h1>Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${esc(user.name)}</h1><p>${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
  <div class="actions">${['reception', 'doctor', 'admin'].includes(user.role) ? `<a class="btn" href="#/register">${icon('userplus', 18)} Register child</a>` : ''}<a class="btn sec" href="#/admissions">${icon('bed', 18)} Admissions</a></div></div>
  <div class="grid g4 stats-row mb" id="stats"></div>
  <div class="split"><div class="grid">
    <div class="card"><h2>OPD queue <span class="muted small">live</span></h2><div class="list" id="q"></div><div class="mt"><a href="#/queue">Open full queue →</a></div></div>
    <div class="card"><h2>Pending dues</h2><div class="list" id="dues"></div></div>
  </div><div class="grid">
    <div class="card"><h2>Pediatric rapid dosing</h2>
      <label for="rw">Child weight (kg)</label><input id="rw" type="number" step="0.1" min="0" placeholder="e.g. 12" inputmode="decimal">
      <div id="rd" class="list mt"></div><p class="small muted mt">Reference only. Verify every dose clinically.</p></div>
    <div class="card"><h2>Inpatients</h2><div class="list" id="adm"></div></div>
  </div></div>`;

  const unsubs = [];
  let rawVisits = [], ids = null;
  const paint = () => {
    const vs = withoutOrphans(rawVisits, ids); // visits of deleted patients are ignored
    const waiting = vs.filter(v => v.status === 'waiting'), collected = vs.reduce((s, v) => s + (v.paidAmount || 0), 0);
    const dues = vs.filter(v => (v.fee || 0) - (v.paidAmount || 0) > 0);
    const stat = (k, v, s, cls = '') => `<div class="card stat ${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    view.querySelector('#stats').innerHTML =
      stat("Today's footfall", vs.length, `${vs.filter(v => v.type === 'new').length} new · ${vs.filter(v => v.type !== 'new').length} follow-up`) +
      stat('Waiting', waiting.length, `${vs.filter(v => v.status === 'inroom').length} in consultation`) +
      stat('Collected', money(collected), 'cash + UPI') +
      stat('Dues', money(dues.reduce((s, v) => s + v.fee - (v.paidAmount || 0), 0)), `${dues.length} patient(s)`, dues.length ? 'crit' : '');
    const q = view.querySelector('#q');
    const open = vs.filter(v => v.status !== 'done').sort((a, b) => a.priority - b.priority || a.token - b.token).slice(0, 5);
    q.innerHTML = open.length ? open.map(v => `<div class="row ${v.priority == 1 ? 'crit' : v.status === 'inroom' ? 'hl' : ''}"><div class="token">${esc(v.tokenLabel)}</div><div class="info"><b>${esc(v.patientName)}</b><div class="small muted">${esc((v.complaints || []).join(', ') || '–')}</div></div>${priorityChip(v.priority)}</div>`).join('') : '<div class="empty">No one waiting 🎉</div>';
    view.querySelector('#dues').innerHTML = dues.length ? dues.slice(0, 5).map(v => `<div class="row"><div class="info"><b>${esc(v.patientName)}</b><div class="small muted">${esc(v.tokenLabel)}</div></div><b>${money(v.fee - (v.paidAmount || 0))}</b></div>`).join('') : '<div class="empty">No pending dues</div>';
  };
  unsubs.push(api.watch('visits', [['date', today]], list => { rawVisits = list; paint(); }));
  unsubs.push(api.watch('patients', [], list => { ids = new Set(list.map(p => p.id)); paint(); }));
  unsubs.push(api.watch('admissions', [['status', 'active']], as => {
    view.querySelector('#adm').innerHTML = as.length ? as.map(a => `<div class="row"><div class="token">${esc(a.bed)}</div><div class="info"><b>${esc(a.name)}</b><div class="small muted">${esc(a.dx || '')}</div></div></div>`).join('') : '<div class="empty">No active admissions</div>';
  }));
  const rd = view.querySelector('#rd'), rw = view.querySelector('#rw');
  const calc = () => {
    const w = parseFloat(rw.value); if (!(w > 0)) { rd.innerHTML = '<div class="muted small">Enter weight to see doses.</div>'; return; }
    rd.innerHTML = DRUGS.filter(d => d.mgPerKg).slice(0, 5).map(d => {
      const mg = d.perDay ? d.mgPerKg * w / d.doses : d.mgPerKg * w;
      return `<div class="row" style="min-height:52px"><div class="info"><b>${esc(d.name.replace(/^Syp\. /, ''))}</b><div class="small muted">${d.mgPerKg} mg/kg${d.perDay ? '/day' : ''} · ${esc(d.freq)}</div></div><span class="dose">${(mg / d.conc).toFixed(1)} ml</span></div>`;
    }).join('');
  };
  rw.oninput = calc; calc();
  return () => unsubs.forEach(u => u());
}
