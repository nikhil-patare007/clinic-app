import { esc, $, ageText, ageMonths, num, todayStr, toast, dateStr, chip, debounce, icon, waLink, growthSummaryText, modal, audit } from '../util.js';
import { GROWTH_REF } from '../clinic.js';

const METRICS = { weight: 'Weight-for-age', height: 'Height-for-age', hc: 'Head circumference' };
const SHORT = { weight: 'Weight', height: 'Height', hc: 'Head circ.' };
const MAX_REF = GROWTH_REF.months[GROWTH_REF.months.length - 1]; // 60 months
const DAY_MS = 86400000, MONTH_DAYS = 30.4375;

function interp(arr, m) {
  const ms = GROWTH_REF.months; if (m <= ms[0]) return arr[0]; if (m >= ms[ms.length - 1]) return arr[arr.length - 1];
  for (let i = 1; i < ms.length; i++) if (m <= ms[i]) { const t = (m - ms[i - 1]) / (ms[i] - ms[i - 1]); return arr[i - 1] + t * (arr[i] - arr[i - 1]); }
}
export function zScore(metric, sex, months, val) {
  const r = GROWTH_REF[metric], med = interp(r[sex === 'Female' || sex === 'F' ? 'F' : 'M'], months);
  return (val - med) / (med * r.sd);
}
// z-scores are only meaningful inside the reference range (0–5 years)
const zOrNull = (metric, sex, months, val) => (val == null || months > MAX_REF + 0.5) ? null : zScore(metric, sex, months, val);
const fz = z => (Math.abs(z) < 0.05 ? 0 : z).toFixed(1); // never show "-0.0"
const zBadge = (z, metric) => z == null ? chip('No reference after 5 y', '') : z < -3 ? chip('Severe (' + fz(z) + ' SD)', 'crit') : z < -2 ? chip((metric === 'height' ? 'Stunted' : metric === 'weight' ? 'Underweight' : 'Low') + ' (' + fz(z) + ' SD)', 'warn') : z > 2 ? chip('High (+' + fz(z) + ' SD)', 'warn') : chip('Normal (' + fz(z) + ' SD)', 'ok');

// "nice" axis ticks (1, 2, 5 × 10^n)
function niceTicks(lo, hi, want = 6) {
  const raw = (hi - lo) / want, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, out = [];
  for (let v = a; v <= b + step / 2; v += step) out.push(+v.toFixed(6));
  return out;
}
const fmtAge = m => m < 1 ? Math.max(0, Math.round(m * MONTH_DAYS)) + ' d' : m < 24 ? (Math.round(m * 10) / 10).toString() + ' mo' : Math.floor(m / 12) + 'y ' + Math.round(m % 12) + 'm';
const fmtNum = (v, d = 1) => Number(v).toFixed(d).replace(/\.0+$/, '');

export async function render(view, params, ctx) {
  const { api, user } = ctx, id = params[0];
  if (!id) {
    const all = await api.query('patients');
    view.innerHTML = `<div class="page-head"><div><h1>Growth charts</h1><p>Select a child</p></div></div><div class="card"><input id="gs2" placeholder="Search patient"><div class="list mt" id="gl"></div></div>`;
    const draw = () => { const q = $('#gs2', view).value.toLowerCase(); $('#gl', view).innerHTML = all.filter(p => !q || (p.name + p.uhid + p.mobile).toLowerCase().includes(q)).slice(0, 20).map(p => `<a class="row" href="#/growth/${p.id}" style="color:inherit"><div class="info"><b>${esc(p.name)}</b><div class="small muted">${esc(p.uhid)} · ${ageText(p.dob)}</div></div></a>`).join(''); };
    $('#gs2', view).oninput = debounce(draw, 100); draw(); return;
  }
  const pt = await api.get('patients', id);
  if (!pt) { view.innerHTML = '<div class="empty">Patient not found</div>'; return; }
  const canDelete = ['doctor', 'nurse', 'admin'].includes(user.role);
  const dobISO = String(pt.dob || '').slice(0, 10);

  // exact age (in months) of a measurement, from its date and the child's date of birth
  const exactAge = r => {
    if (r.date && dobISO) { const a = (new Date(String(r.date).slice(0, 10) + 'T00:00:00') - new Date(dobISO + 'T00:00:00')) / (MONTH_DAYS * DAY_MS); if (a >= 0) return a; }
    return r.ageMonths ?? 0;
  };
  const load = async () => (await api.query('growth', [['patientId', id]])).map(r => ({ ...r, age: exactAge(r) })).sort((a, b) => a.age - b.age || (a.createdAt || 0) - (b.createdAt || 0));
  let recs = await load();
  let metric = 'weight', sex = pt.gender === 'Female' ? 'F' : 'M';
  const oldest = Math.max(ageMonths(pt.dob), ...recs.map(r => r.age));
  let span = oldest <= 24 ? 24 : 60; // visible age range in months

  view.innerHTML = `<div class="page-head"><div><h1>Growth · ${esc(pt.name)}</h1><p>${ageText(pt.dob)} · ${esc(pt.uhid)} · <a href="#/patient/${id}">Profile</a></p></div>
    <div class="actions"><button class="btn sec" type="button" id="print-growth">${icon('print', 18)} Print</button>${pt.mobile ? `<a class="btn wa" target="_blank" rel="noopener" id="wa-growth">${icon('send', 18)} WhatsApp</a>` : ''}</div></div>
  <div class="split"><div class="card"><div class="tabs" id="mt">${Object.entries(METRICS).map(([k, l]) => `<button type="button" data-m="${k}">${l}</button>`).join('')}</div>
    <div class="gc-tools"><div class="tabs" id="sp" style="margin:0"><button type="button" data-span="24">0–2 years</button><button type="button" data-span="60">0–5 years</button></div><button class="btn ghost sm" type="button" id="sx"></button></div>
    <div class="chart-wrap"><div id="ch"></div><div class="chart-tip hidden" id="tip" role="status"></div></div>
    <div class="gc-legend small muted" id="lg"></div>
    <p class="small muted mt" id="gnote"></p>
    <p class="small muted">Reference bands are <b>approximate</b> WHO values (0–5 years). Swap in the full WHO LMS tables in <code>js/clinic.js</code> for clinical-grade percentiles.</p></div>
  <div class="grid"><div class="card"><h2>Latest status</h2><div id="st" class="list"></div></div>
  <form class="card" id="gf"><h2>Add measurement</h2><div class="form"><div class="f12"><label for="gd">Measured on</label><input id="gd" type="date" value="${todayStr()}" max="${todayStr()}"></div><div class="f4"><label for="gw">Weight (kg)</label><input id="gw" type="number" step="0.01" inputmode="decimal"></div><div class="f4"><label for="gh">Height (cm)</label><input id="gh" type="number" step="0.1" inputmode="decimal"></div><div class="f4"><label for="gc">Head (cm)</label><input id="gc" type="number" step="0.1" inputmode="decimal"></div></div><button class="btn mt" style="width:100%">Save measurement</button></form></div></div>
  <div class="card mt"><h2>Measurement history</h2><div class="tablewrap"><table><thead><tr><th>Date</th><th>Age</th><th>Weight</th><th>Height</th><th>Head circ.</th>${canDelete ? '<th></th>' : ''}</tr></thead><tbody id="gh-body"></tbody></table></div></div>`;

  const summary = () => {
    const latest = [...recs].reverse().find(x => x.weight != null || x.height != null || x.hc != null) || {};
    const a = latest.age ?? ageMonths(pt.dob);
    return growthSummaryText({ name: pt.name, uhid: pt.uhid, gender: pt.gender, ageMonths: a, weight: latest.weight ?? pt.weight, height: latest.height ?? null, hc: latest.hc ?? null,
      z: { weight: zOrNull('weight', pt.gender, a, latest.weight), height: zOrNull('height', pt.gender, a, latest.height), hc: zOrNull('hc', pt.gender, a, latest.hc) }, date: latest.date || todayStr() });
  };

  let plotted = [];
  function chartSvg() {
    const r = GROWTH_REF[metric], arr = r[sex], sd = r.sd, unit = r.unit;
    const W = 720, H = 400, L = 52, T = 20, B = 44, R = 46, xmax = span;
    const sample = Array.from({ length: xmax + 1 }, (_, m) => ({ m, med: interp(arr, m) }));
    plotted = recs.filter(p => p[metric] != null && p.age <= xmax + 0.01);
    const lows = [...sample.map(s => s.med * (1 - 3 * sd)), ...plotted.map(p => p[metric])], highs = [...sample.map(s => s.med * (1 + 3 * sd)), ...plotted.map(p => p[metric])];
    const ticks = niceTicks(Math.min(...lows), Math.max(...highs), 6), ymin = ticks[0], ymax = ticks[ticks.length - 1];
    const X = m => L + (m / xmax) * (W - L - R), Y = v => H - B - ((v - ymin) / (ymax - ymin)) * (H - B - T);
    const path = k => sample.map((s, i) => `${i ? 'L' : 'M'}${X(s.m).toFixed(1)},${Y(s.med * (1 + k * sd)).toFixed(1)}`).join(' ');
    const band = (a, b) => `${path(a)} ${[...sample].reverse().map(s => `L${X(s.m).toFixed(1)},${Y(s.med * (1 + b * sd)).toFixed(1)}`).join(' ')} Z`;
    let grid = '';
    for (const v of ticks) grid += `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="#e2e8f0"/><text x="${L - 8}" y="${(Y(v) + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="#64748b">${fmtNum(v, v % 1 ? 1 : 0)}</text>`;
    const stepM = xmax <= 24 ? 3 : 6;
    for (let m = 0; m <= xmax; m += stepM) {
      const major = m % 12 === 0;
      grid += `<line x1="${X(m)}" x2="${X(m)}" y1="${T}" y2="${H - B}" stroke="${major ? '#cbd5e1' : '#eef2f6'}"/>`;
      if (xmax <= 24 || major) grid += `<text x="${X(m)}" y="${H - B + 17}" font-size="11" text-anchor="middle" fill="#64748b">${m === 0 ? '0' : major ? m / 12 + 'y' : m + 'm'}</text>`;
    }
    const endLabel = (k, text, color) => `<text x="${W - R + 5}" y="${(Y(interp(arr, xmax) * (1 + k * sd)) + 4).toFixed(1)}" font-size="10" fill="${color}">${text}</text>`;
    const trail = plotted.length > 1 ? `<path d="${plotted.map((p, i) => `${i ? 'L' : 'M'}${X(p.age).toFixed(1)},${Y(p[metric]).toFixed(1)}`).join(' ')}" fill="none" stroke="#0ea5e9" stroke-width="2.5" stroke-linejoin="round"/>` : '';
    const last = plotted[plotted.length - 1];
    const dots = plotted.map((p, i) => `<g class="gc-pt" data-pi="${i}" tabindex="0" role="button" aria-label="${esc(SHORT[metric])} ${p[metric]} ${unit} at ${esc(fmtAge(p.age))}"><circle cx="${X(p.age).toFixed(1)}" cy="${Y(p[metric]).toFixed(1)}" r="14" fill="transparent"/><circle cx="${X(p.age).toFixed(1)}" cy="${Y(p[metric]).toFixed(1)}" r="${p === last ? 6.5 : 4.5}" fill="#0ea5e9" stroke="#fff" stroke-width="2"/></g>`).join('');
    const lastLabel = last ? `<text x="${Math.min(X(last.age), W - R - 4).toFixed(1)}" y="${(Y(last[metric]) - 12).toFixed(1)}" font-size="12" font-weight="700" text-anchor="${X(last.age) > W - R - 50 ? 'end' : 'middle'}" fill="#0369a1">${fmtNum(last[metric], 1)} ${unit}</text>` : '';
    const nowM = ageMonths(pt.dob);
    const todayLine = nowM > 0 && nowM <= xmax ? `<line x1="${X(nowM)}" x2="${X(nowM)}" y1="${T}" y2="${H - B}" stroke="#94a3b8" stroke-dasharray="2 3"/>` : '';
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" font-family="Inter, Arial, sans-serif" role="img" aria-label="${esc(METRICS[metric])} chart for ${esc(pt.name)}, ${plotted.length} measurement(s)">
      <rect width="${W}" height="${H}" fill="#fff"/>${grid}
      <path d="${band(-3, 3)}" fill="rgba(13,148,136,.06)"/><path d="${band(-2, 2)}" fill="rgba(13,148,136,.13)"/>
      <path d="${path(3)}" fill="none" stroke="#5eead4" stroke-width="1" stroke-dasharray="3 3"/><path d="${path(-3)}" fill="none" stroke="#5eead4" stroke-width="1" stroke-dasharray="3 3"/>
      <path d="${path(2)}" fill="none" stroke="#14b8a6" stroke-width="1.2"/><path d="${path(-2)}" fill="none" stroke="#14b8a6" stroke-width="1.2"/>
      <path d="${path(0)}" fill="none" stroke="#0d9488" stroke-width="2" stroke-dasharray="6 4"/>
      ${endLabel(3, '+3', '#14b8a6')}${endLabel(2, '+2', '#0f766e')}${endLabel(0, 'Median', '#0f766e')}${endLabel(-2, '−2', '#0f766e')}${endLabel(-3, '−3', '#14b8a6')}
      ${todayLine}${trail}${dots}${lastLabel}
      <text x="${L}" y="13" font-size="11" fill="#475569">${esc(METRICS[metric])} (${unit}) · ${sex === 'F' ? 'Girls' : 'Boys'} reference</text>
      <text x="${(L + W - R) / 2}" y="${H - 5}" font-size="11" text-anchor="middle" fill="#64748b">Age</text></svg>`;
  }

  function draw() {
    view.querySelectorAll('#mt [data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === metric));
    view.querySelectorAll('#sp [data-span]').forEach(b => b.classList.toggle('on', +b.dataset.span === span));
    $('#sx', view).textContent = sex === 'M' ? 'Reference: Boys ⇄' : 'Reference: Girls ⇄';
    $('#ch', view).innerHTML = chartSvg(); hideTip();
    $('#lg', view).innerHTML = `<span><i style="background:#0ea5e9"></i>${esc(String(pt.name).split(' ')[0])}</span><span><i class="dash"></i>Median</span><span><i style="background:rgba(13,148,136,.3)"></i>±2 SD</span><span><i style="background:rgba(13,148,136,.12)"></i>±3 SD</span><span><i class="dot"></i>Current age</span>`;
    const beyond = recs.filter(p => p[metric] != null && p.age > span + 0.01).length;
    $('#gnote', view).textContent = !recs.some(p => p[metric] != null) ? `No ${SHORT[metric].toLowerCase()} measurements yet – add one using the form.`
      : beyond ? `${beyond} measurement${beyond > 1 ? 's' : ''} fall beyond ${span / 12} years – ${span === 24 ? 'switch to 0–5 years to see ' + (beyond > 1 ? 'them' : 'it') : 'the reference covers 0–5 years only, so ' + (beyond > 1 ? 'they are' : 'it is') + ' listed in the table but not plotted'}.` : '';

    // latest status, with the change since the previous reading
    $('#st', view).innerHTML = Object.keys(METRICS).map(k => {
      const arr = recs.filter(p => p[k] != null), x = arr[arr.length - 1]; if (!x) return '';
      const prev = arr[arr.length - 2], d = prev ? x[k] - prev[k] : null, dec = k === 'weight' ? 2 : 1;
      return `<div class="row"><div class="info"><b>${METRICS[k]}</b><div class="small muted">${fmtNum(x[k], dec)} ${GROWTH_REF[k].unit} · ${dateStr(x.date || x.createdAt)}${prev ? ` · <span class="${d < 0 ? 'gc-down' : 'gc-up'}">${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtNum(Math.abs(d), dec)} ${GROWTH_REF[k].unit}</span> since ${dateStr(prev.date || prev.createdAt)}` : ''}</div></div>${zBadge(zOrNull(k, pt.gender, x.age, x[k]), k)}</div>`;
    }).join('') || '<div class="empty">No measurements yet.</div>';

    // history table, newest first
    $('#gh-body', view).innerHTML = recs.length ? [...recs].reverse().map(p => `<tr><td>${dateStr(p.date || p.createdAt)}</td><td>${esc(fmtAge(p.age))}</td><td>${p.weight != null ? fmtNum(p.weight, 2) + ' kg' : '–'}</td><td>${p.height != null ? fmtNum(p.height, 1) + ' cm' : '–'}</td><td>${p.hc != null ? fmtNum(p.hc, 1) + ' cm' : '–'}</td>${canDelete ? `<td class="right"><button type="button" class="btn sm ghost danger" data-gdel="${esc(p.id)}" aria-label="Delete this measurement">${icon('trash', 16)}</button></td>` : ''}</tr>`).join('') : `<tr><td colspan="${canDelete ? 6 : 5}" class="muted">No measurements yet.</td></tr>`;
    const wa = $('#wa-growth', view); if (wa) wa.href = waLink(pt.mobile, summary());
  }

  // tooltip for a plotted point: hover on desktop, tap or keyboard focus on touch devices
  function showTip(i) {
    const p = plotted[i], tip = $('#tip', view), dot = view.querySelectorAll('.gc-pt')[i]?.querySelectorAll('circle')[1]; if (!p || !dot) return;
    const host = tip.parentElement.getBoundingClientRect(), c = dot.getBoundingClientRect(), z = zOrNull(metric, pt.gender, p.age, p[metric]);
    tip.innerHTML = `<b>${fmtNum(p[metric], metric === 'weight' ? 2 : 1)} ${GROWTH_REF[metric].unit}</b> · ${esc(fmtAge(p.age))}<br><span>${dateStr(p.date || p.createdAt)}${z == null ? '' : ` · ${z >= 0.05 ? '+' : ''}${fz(z)} SD`}</span>`;
    tip.style.left = Math.min(Math.max(c.left + c.width / 2 - host.left, 70), host.width - 70) + 'px';
    tip.style.top = (c.top - host.top) + 'px';
    tip.classList.remove('hidden');
  }
  function hideTip() { const t = $('#tip', view); t && t.classList.add('hidden'); }
  view.addEventListener('mouseover', e => { const g = e.target.closest('.gc-pt'); if (g) showTip(+g.dataset.pi); });
  view.addEventListener('mouseout', e => { if (e.target.closest('.gc-pt')) hideTip(); });
  view.addEventListener('focusin', e => { const g = e.target.closest('.gc-pt'); if (g) showTip(+g.dataset.pi); });
  view.addEventListener('focusout', e => { if (e.target.closest('.gc-pt')) hideTip(); });
  const onDocClick = e => { if (!e.target.closest || !e.target.closest('.gc-pt')) hideTip(); };
  document.addEventListener('click', onDocClick);

  view.addEventListener('click', async e => {
    const g = e.target.closest('.gc-pt'); if (g) return showTip(+g.dataset.pi);
    const m = e.target.closest('[data-m]'); if (m) { metric = m.dataset.m; return draw(); }
    const sp = e.target.closest('[data-span]'); if (sp) { span = +sp.dataset.span; return draw(); }
    if (e.target.closest('#sx')) { sex = sex === 'M' ? 'F' : 'M'; return draw(); }
    const del = e.target.closest('[data-gdel]');
    if (del) {
      const rec = recs.find(r => r.id === del.dataset.gdel); if (!rec) return;
      const md = modal(`<h2>Delete measurement?</h2><p>${esc(dateStr(rec.date || rec.createdAt))} · ${esc([rec.weight != null && fmtNum(rec.weight, 2) + ' kg', rec.height != null && fmtNum(rec.height, 1) + ' cm', rec.hc != null && 'HC ' + fmtNum(rec.hc, 1) + ' cm'].filter(Boolean).join(' · ') || 'no values')}</p><div class="actions"><button class="btn danger-solid" id="gdel-go" type="button">Delete</button><button class="btn ghost" type="button" data-close>Cancel</button></div>`);
      md.el.querySelector('#gdel-go').onclick = async () => {
        try { await api.delete('growth', rec.id); audit(api, user, 'growth_delete', rec.id); md.close(); toast('Measurement deleted'); recs = await load(); draw(); }
        catch (err) { toast('Could not delete: ' + (err.message || err), 'err'); }
      };
      return;
    }
    if (e.target.closest('#print-growth')) {
      const chart = $('#ch svg', view)?.outerHTML || '';
      const w = window.open('', '_blank', 'width=760,height=1000'); if (!w) return toast('Allow pop-ups to print', 'err');
      const tr = [...recs].reverse().map(p => `<tr><td>${esc(dateStr(p.date || p.createdAt))}</td><td>${esc(fmtAge(p.age))}</td><td>${p.weight != null ? fmtNum(p.weight, 2) : '–'}</td><td>${p.height != null ? fmtNum(p.height, 1) : '–'}</td><td>${p.hc != null ? fmtNum(p.hc, 1) : '–'}</td></tr>`).join('');
      w.document.write(`<!doctype html><html><head><title>Growth chart – ${esc(pt.name)}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}.box{border:1px solid #dfe7ef;padding:16px;border-radius:12px;margin-top:18px}.label{color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:.06em}pre{white-space:pre-wrap;font-family:inherit}svg{width:100%;height:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #cbd5e1;padding:5px 8px;text-align:left}th{background:#f1f5f9}</style></head><body><h2>${esc(pt.name)} · ${esc(pt.uhid)}</h2><div class="box"><div class="label">Growth summary</div><pre>${esc(summary())}</pre></div>${chart ? `<div class="box">${chart}</div>` : ''}<div class="box"><div class="label">Measurements</div><table><thead><tr><th>Date</th><th>Age</th><th>Weight (kg)</th><th>Height (cm)</th><th>Head (cm)</th></tr></thead><tbody>${tr}</tbody></table></div></body></html>`);
      w.document.close(); w.focus(); w.print();
    }
  });

  $('#gf', view).onsubmit = async e => {
    e.preventDefault();
    const w = num($('#gw', view).value), h = num($('#gh', view).value), c = num($('#gc', view).value), date = $('#gd', view).value || todayStr();
    if (w === null && h === null && c === null) return toast('Enter at least one value', 'err');
    if (date > todayStr()) return toast('Measurement date cannot be in the future', 'err');
    if (dobISO && date < dobISO) return toast('Measurement date is before the date of birth', 'err');
    const months = dobISO ? Math.max(0, Math.round((new Date(date + 'T00:00:00') - new Date(dobISO + 'T00:00:00')) / (MONTH_DAYS * DAY_MS))) : ageMonths(pt.dob);
    try {
      await api.add('growth', { patientId: id, date, ageMonths: months, weight: w, height: h, hc: c });
      if (w && date === todayStr()) await api.update('patients', id, { weight: w });
      toast('Measurement saved'); e.target.reset(); $('#gd', view).value = todayStr(); recs = await load(); draw();
    } catch (err) { toast('Could not save: ' + (err.message || err), 'err'); }
  };
  draw();
  return () => document.removeEventListener('click', onDocClick);
}
