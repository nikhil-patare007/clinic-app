import { esc, money, todayStr, ageText, chip, priorityChip, modal, toast, timeStr, audit, icon, patientDueWaText, waLink } from '../util.js';

export async function render(view, _p, ctx) {
  const { api, user } = ctx, today = todayStr();
  let filter = 'all', visits = [];
  view.innerHTML = `<div class="page-head"><div><h1>OPD queue</h1><p>Live · ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
    <div class="actions">${['reception', 'doctor', 'admin'].includes(user.role) ? `<a class="btn" href="#/register">${icon('plus', 18)} New registration</a>` : ''}</div></div>
    <div class="tabs" id="tabs"></div><div class="list" id="list"></div>`;
  const draw = () => {
    const c = k => visits.filter(v => k === 'all' ? true : v.status === k).length;
    view.querySelector('#tabs').innerHTML = [['all', 'All'], ['waiting', 'Waiting'], ['inroom', 'In consultation'], ['done', 'Done']].map(([k, l]) => `<button class="${filter === k ? 'on' : ''}" data-f="${k}">${l} (${c(k)})</button>`).join('');
    const rows = visits.filter(v => filter === 'all' || v.status === filter).sort((a, b) => (a.status === 'done') - (b.status === 'done') || a.priority - b.priority || a.token - b.token);
    view.querySelector('#list').innerHTML = rows.length ? rows.map(v => {
      const due = (v.fee || 0) - (v.paidAmount || 0);
      return `<div class="row ${v.priority == 1 ? 'crit' : v.status === 'inroom' ? 'hl' : ''}" style="${v.status === 'done' ? 'opacity:.65' : ''}">
        <div class="token">${esc(v.tokenLabel)}</div>
        <div class="info"><b><a href="#/patient/${v.patientId}">${esc(v.patientName)}</a></b> ${priorityChip(v.priority)} ${v.type !== 'new' ? chip('Follow-up', 'info') : ''} ${v.route && v.route !== 'opd' ? chip(v.route.toUpperCase(), 'vax') : ''}
          <div class="small muted">${esc(v.uhid)} · ${esc((v.complaints || []).join(', ') || '–')} · ${timeStr(v.createdAt)}</div></div>
        ${due > 0 ? chip('Due ' + money(due), 'warn') : chip('Paid', 'ok')}
        <div class="btns">
          ${v.patientId ? `<a class="btn sm wa" target="_blank" rel="noopener" href="${waLink(v.mobile || '', patientDueWaText({ patientName: v.patientName, uhid: v.uhid, fee: v.fee || 0, paid: v.paidAmount || 0, due: due, date: v.date || today }))}">WhatsApp</a>` : ''}
          ${due > 0 && user.role !== 'nurse' ? `<button class="btn sm sec" data-pay="${v.id}">Collect fee</button>` : ''}
          ${v.status === 'waiting' && ['doctor', 'admin'].includes(user.role) ? `<button class="btn sm" data-call="${v.id}">Call in</button>` : ''}
          ${v.status === 'inroom' && ['doctor', 'admin'].includes(user.role) ? `<a class="btn sm" href="#/consult/${v.id}">Resume Rx</a>` : ''}
          ${v.status === 'done' && ['doctor', 'admin'].includes(user.role) ? `<a class="btn sm ghost" href="#/consult/${v.id}">View Rx</a>` : ''}
        </div></div>`;
    }).join('') : '<div class="empty">No patients in this list.</div>';
  };
  view.addEventListener('click', async e => {
    const f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; return draw(); }
    const call = e.target.closest('[data-call]');
    if (call) { await api.update('visits', call.dataset.call, { status: 'inroom', calledAt: Date.now() }); ctx.navigate('consult/' + call.dataset.call); return; }
    const pay = e.target.closest('[data-pay]');
    if (pay) {
      const v = visits.find(x => x.id === pay.dataset.pay), due = v.fee - (v.paidAmount || 0);
      const m = modal(`<h2>Collect ${money(due)}</h2><p class="muted">${esc(v.patientName)} · ${esc(v.tokenLabel)}</p><div class="actions"><button class="btn" data-m="cash">Cash</button><button class="btn sec" data-m="upi">UPI</button><button class="btn ghost" data-close>Cancel</button></div>`);
      m.el.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => {
        await api.update('visits', v.id, { paidAmount: v.fee, mode: b.dataset.m }); audit(api, user, 'collect_fee', v.id); toast('Fee collected'); m.close();
      });
    }
  });
  const un = api.watch('visits', [['date', today]], list => { visits = list; draw(); });
  return un;
}
