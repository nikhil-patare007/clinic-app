import { esc, $, money, todayStr, timeStr, chip, modal, toast, audit, icon, num, waLink, patientDueWaText } from '../util.js';

export async function render(view, _p, ctx) {
  const { api, user } = ctx; let date = todayStr(), visits = [], extra = [], unsubs = [], duesUn = null, patients = await api.query('patients');
  view.innerHTML = `<div class="page-head"><div><h1>Daily ledger</h1><p>OPD fees, other collections and dues</p></div><div class="actions"><input id="dt" type="date" value="${date}" style="width:auto" aria-label="Date"><button class="btn" id="ae">${icon('plus', 18)} Other collection</button></div></div>
  <div class="grid g4 stats-row mb" id="st"></div><div class="card"><h2>Entries</h2><div class="tablewrap"><table><thead><tr><th>Time</th><th>Description</th><th>Mode</th><th class="right">Amount</th></tr></thead><tbody id="tb"></tbody></table></div></div>
  <div class="card mt"><h2>Pending dues (all dates)</h2><div class="list" id="du"></div></div>`;
  const draw = () => {
    const paid = visits.filter(v => (v.paidAmount || 0) > 0).map(v => ({ t: v.createdAt, d: `Consultation – ${v.patientName} (${v.tokenLabel})`, mode: v.mode, amt: v.paidAmount }));
    const ex = extra.map(e => ({ t: e.createdAt, d: e.desc, mode: e.mode, amt: e.amount }));
    const all = [...paid, ...ex].sort((a, b) => a.t - b.t), sum = m => all.filter(x => x.mode === m).reduce((s, x) => s + x.amt, 0);
    const k = (a, b, c) => `<div class="card stat"><div class="k">${a}</div><div class="v">${b}</div><div class="s">${c}</div></div>`;
    $('#st', view).innerHTML = k('Total collected', money(all.reduce((s, x) => s + x.amt, 0)), `${all.length} entries`) + k('Cash', money(sum('cash')), 'in drawer') + k('UPI', money(sum('upi')), 'online') + k('Day dues', money(visits.reduce((s, v) => s + Math.max(0, v.fee - (v.paidAmount || 0)), 0)), 'unpaid today');
    $('#tb', view).innerHTML = all.map(x => `<tr><td>${timeStr(x.t)}</td><td>${esc(x.d)}</td><td>${chip((x.mode || '').toUpperCase())}</td><td class="right"><b>${money(x.amt)}</b></td></tr>`).join('') || '<tr><td colspan="4" class="muted">No entries.</td></tr>';
  };
  const load = () => { unsubs.forEach(u => u()); unsubs = [api.watch('visits', [['date', date]], l => { visits = l; draw(); }), api.watch('ledger', [['date', date]], l => { extra = l; draw(); })]; };
  load();
  duesUn = api.watch('visits', [], all => {
    const d = all.filter(v => (v.fee || 0) - (v.paidAmount || 0) > 0 && v.mode !== 'exempt');
    $('#du', view).innerHTML = d.length ? d.map(v => {
      const patient = patients.find(p => p.id === v.patientId);
      const mobile = patient?.mobile || v.mobile || '';
      const due = (v.fee || 0) - (v.paidAmount || 0);
      const waHref = mobile ? waLink(mobile, patientDueWaText({ patientName: v.patientName, uhid: v.uhid, fee: v.fee || 0, paid: v.paidAmount || 0, due, date: v.date || todayStr() })) : '#';
      return `<div class="row"><div class="info"><b>${esc(v.patientName)}</b><div class="small muted">${esc(v.date)} · ${esc(v.tokenLabel)}</div></div><b>${money(due)}</b><div class="btns">${mobile ? `<a class="btn sm wa" target="_blank" rel="noopener" href="${waHref}">WhatsApp</a>` : ''}${['reception', 'admin'].includes(user.role) ? `<button class="btn sm sec" data-pay="${v.id}">Collect</button>` : ''}</div></div>`;
    }).join('') : '<div class="empty">No dues 🎉</div>';
    view._dues = d;
  });
  $('#dt', view).onchange = e => { date = e.target.value || todayStr(); load(); };
  view.addEventListener('click', e => {
    const p = e.target.closest('[data-pay]');
    if (p) { const v = view._dues.find(x => x.id === p.dataset.pay); const m = modal(`<h2>Collect ${money(v.fee - v.paidAmount)}</h2><div class="actions"><button class="btn" data-m="cash">Cash</button><button class="btn sec" data-m="upi">UPI</button><button class="btn ghost" data-close>Cancel</button></div>`); m.el.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => { await api.update('visits', v.id, { paidAmount: v.fee, mode: b.dataset.m }); audit(api, user, 'collect_fee', v.id); toast('Collected'); m.close(); }); }
    if (e.target.closest('#ae')) {
      const m = modal(`<h2>Other collection</h2><div class="list"><div><label>Description</label><input id="ed" placeholder="Nebulization, vaccine, IPD advance…"></div><div><label>Amount (₹)</label><input id="ea" type="number" inputmode="numeric"></div><div class="seg"><label><input type="radio" name="em" value="cash" checked><span>Cash</span></label><label><input type="radio" name="em" value="upi"><span>UPI</span></label></div><div class="actions"><button class="btn" id="es">Save</button><button class="btn ghost" data-close>Cancel</button></div></div>`);
      m.el.querySelector('#es').onclick = async () => { const a = num(m.el.querySelector('#ea').value), d = m.el.querySelector('#ed').value.trim(); if (!a || !d) return toast('Enter description and amount', 'err'); await api.add('ledger', { date, desc: d, amount: a, mode: m.el.querySelector('input[name=em]:checked').value, by: user.name }); audit(api, user, 'ledger_add', d); m.close(); };
    }
  });
  return () => { unsubs.forEach(u => u()); duesUn && duesUn(); };
}
