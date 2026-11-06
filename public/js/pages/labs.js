import { esc, $, money, timeStr, dateStr, chip, modal, toast, audit, icon, debounce, waLink } from '../util.js';
import { LAB_TESTS, CLINIC } from '../clinic.js';

export async function render(view, _p, ctx) {
  const { api, user } = ctx; let labs = [], filter = 'all';
  view.innerHTML = `<div class="page-head"><div><h1>Investigations</h1><p>Lab orders, results and reports</p></div><div class="actions"><button class="btn" id="no">${icon('plus', 18)} New test</button></div></div><div class="tabs" id="tb"></div><div class="list" id="ls"></div>`;
  const draw = () => {
    $('#tb', view).innerHTML = [['all', 'All'], ['ordered', 'Ordered'], ['reported', 'Reported']].map(([k, l]) => `<button class="${filter === k ? 'on' : ''}" data-f="${k}">${l} (${labs.filter(x => k === 'all' || x.status === k).length})</button>`).join('');
    const rows = labs.filter(l => filter === 'all' || l.status === filter).sort((a, b) => b.createdAt - a.createdAt);
    $('#ls', view).innerHTML = rows.length ? rows.map(l => `<div class="row"><div class="info"><b>${esc(l.test)}</b> ${chip(l.status, l.status === 'reported' ? 'ok' : 'warn')}<div class="small muted"><a href="#/patient/${l.patientId}">${esc(l.patientName)}</a> · ${dateStr(l.createdAt)} ${timeStr(l.createdAt)}${l.price ? ' · ' + money(l.price) : ''}</div>
      ${l.status === 'reported' ? `<div class="mt"><b>${esc(l.result)}</b> ${l.flag ? chip(l.flag, l.flag === 'Normal' ? 'ok' : 'crit') : ''}</div>` : ''}</div>
      <div class="btns">${['lab', 'doctor', 'admin'].includes(user.role) ? `<button class="btn sm ${l.status === 'reported' ? 'ghost' : ''}" data-res="${l.id}">${l.status === 'reported' ? 'Edit' : 'Enter result'}</button>` : ''}
      ${l.status === 'reported' ? `<a class="btn sm wa" target="_blank" rel="noopener" href="${waLink(l.mobile, `${CLINIC.name}\nLab report – ${l.patientName}\n${l.test}: ${l.result}${l.flag ? ' (' + l.flag + ')' : ''}\nDate: ${dateStr(l.createdAt)}`)}">WhatsApp</a>` : ''}</div></div>`).join('') : '<div class="empty">No investigations.</div>';
  };
  view.addEventListener('click', e => {
    const f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; return draw(); }
    const r = e.target.closest('[data-res]');
    if (r) {
      const l = labs.find(x => x.id === r.dataset.res);
      const m = modal(`<h2>${esc(l.test)}</h2><p class="muted">${esc(l.patientName)}</p><div class="list"><div><label>Result</label><textarea id="rs" placeholder="e.g. Total 14.6, Direct 0.6 mg/dL">${esc(l.result || '')}</textarea></div><div><label>Flag</label><select id="fl"><option>Normal</option><option ${l.flag === 'Abnormal' ? 'selected' : ''}>Abnormal</option><option ${l.flag === 'Critical' ? 'selected' : ''}>Critical</option></select></div><div class="actions"><button class="btn" id="sv">Save & release</button><button class="btn ghost" data-close>Cancel</button></div></div>`);
      m.el.querySelector('#sv').onclick = async () => { const res = m.el.querySelector('#rs').value.trim(); if (!res) return toast('Enter a result', 'err'); await api.update('labs', l.id, { result: res, flag: m.el.querySelector('#fl').value, status: 'reported', reportedBy: user.name, reportedAt: Date.now() }); audit(api, user, 'lab_result', l.id); toast('Result saved'); m.close(); };
    }
  });
  $('#no', view).onclick = () => {
    const m = modal(`<h2>New investigation</h2><div class="list"><div><label>Child</label><input id="lp" placeholder="Search name / UHID"><div class="list mt" id="lr"></div><div id="lk"></div></div><div><label>Test</label><select id="lt">${LAB_TESTS.map(t => `<option value="${esc(t.name)}">${esc(t.name)} – ${money(t.price)}</option>`).join('')}</select></div><div class="actions"><button class="btn" id="lo" disabled>Order</button><button class="btn ghost" data-close>Cancel</button></div></div>`);
    let sel = null; const q = s => m.el.querySelector(s);
    q('#lp').oninput = debounce(async () => {
      const t = q('#lp').value.toLowerCase(); if (t.length < 2) return;
      const hits = (await api.query('patients')).filter(p => (p.name + p.uhid + p.mobile).toLowerCase().includes(t)).slice(0, 5);
      q('#lr').innerHTML = hits.map(p => `<button class="btn sm sec" data-p="${p.id}" style="justify-content:flex-start">${esc(p.name)} · ${esc(p.uhid)}</button>`).join('');
      q('#lr').querySelectorAll('[data-p]').forEach(b => b.onclick = () => { sel = hits.find(p => p.id === b.dataset.p); q('#lk').innerHTML = `<div class="row hl mt"><b>${esc(sel.name)}</b></div>`; q('#lr').innerHTML = ''; q('#lo').disabled = false; });
    }, 150);
    q('#lo').onclick = async () => { const t = LAB_TESTS.find(x => x.name === q('#lt').value); await api.add('labs', { patientId: sel.id, patientName: sel.name, mobile: sel.mobile, test: t.name, price: t.price, status: 'ordered', result: '', flag: '', orderedBy: user.name }); audit(api, user, 'lab_order', sel.id); toast('Test ordered'); m.close(); };
  };
  return api.watch('labs', [], l => { labs = l; draw(); });
}
