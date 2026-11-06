import { esc, $, ageText, ageMonths, num, todayStr, toast, dateStr, chip, debounce, icon, waLink, growthSummaryText } from '../util.js';
import { GROWTH_REF } from '../clinic.js';

const METRICS = { weight: 'Weight-for-age', height: 'Height-for-age', hc: 'Head circumference' };

function interp(arr, m) {
  const ms = GROWTH_REF.months; if (m <= ms[0]) return arr[0]; if (m >= ms[ms.length - 1]) return arr[arr.length - 1];
  for (let i = 1; i < ms.length; i++) if (m <= ms[i]) { const t = (m - ms[i - 1]) / (ms[i] - ms[i - 1]); return arr[i - 1] + t * (arr[i] - arr[i - 1]); }
}
export function zScore(metric, sex, months, val) {
  const r = GROWTH_REF[metric], med = interp(r[sex === 'Female' ? 'F' : 'M'], months);
  return (val - med) / (med * r.sd);
}
const zBadge = (z, metric) => z < -3 ? chip('Severe (' + z.toFixed(1) + ' SD)', 'crit') : z < -2 ? chip((metric === 'height' ? 'Stunted' : metric === 'weight' ? 'Underweight' : 'Low') + ' (' + z.toFixed(1) + ' SD)', 'warn') : z > 2 ? chip('High (+' + z.toFixed(1) + ' SD)', 'warn') : chip('Normal (' + z.toFixed(1) + ' SD)', 'ok');

export async function render(view, params, ctx) {
  const { api } = ctx, id = params[0];
  if (!id) {
    const all = await api.query('patients');
    view.innerHTML = `<div class="page-head"><div><h1>Growth charts</h1><p>Select a child</p></div></div><div class="card"><input id="gs2" placeholder="Search patient"><div class="list mt" id="gl"></div></div>`;
    const draw = () => { const q = $('#gs2', view).value.toLowerCase(); $('#gl', view).innerHTML = all.filter(p => !q || (p.name + p.uhid + p.mobile).toLowerCase().includes(q)).slice(0, 20).map(p => `<a class="row" href="#/growth/${p.id}" style="color:inherit"><div class="info"><b>${esc(p.name)}</b><div class="small muted">${esc(p.uhid)} · ${ageText(p.dob)}</div></div></a>`).join(''); };
    $('#gs2', view).oninput = debounce(draw, 100); draw(); return;
  }
  const pt = await api.get('patients', id);
  if (!pt) { view.innerHTML = '<div class="empty">Patient not found</div>'; return; }
  let recs = (await api.query('growth', [['patientId', id]])).sort((a, b) => a.ageMonths - b.ageMonths || a.createdAt - b.createdAt);
  let metric = 'weight', sex = pt.gender === 'Female' ? 'F' : 'M';
  const refresh = async () => { recs = (await api.query('growth', [['patientId', id]])).sort((a, b) => a.ageMonths - b.ageMonths || a.createdAt - b.createdAt); draw(); };

  view.innerHTML = `<div class="page-head"><div><h1>Growth · ${esc(pt.name)}</h1><p>${ageText(pt.dob)} · ${esc(pt.uhid)} · <a href="#/patient/${id}">Profile</a></p></div>
    <div class="actions"><button class="btn sec" type="button" id="print-growth">${icon('print', 18)} Print</button>${pt.mobile ? `<a class="btn wa" target="_blank" rel="noopener" id="wa-growth">${icon('send', 18)} WhatsApp</a>` : ''}</div></div>
  <div class="split"><div class="card"><div class="tabs" id="mt">${Object.entries(METRICS).map(([k, l]) => `<button data-m="${k}">${l}</button>`).join('')}<button data-sex="x" id="sx"></button></div><div id="ch"></div>
    <p class="small muted mt">Reference bands (±2 SD) are <b>approximate</b> WHO values interpolated from key ages (0–60 months). Swap in the full WHO LMS tables in <code>js/clinic.js</code> for clinical-grade percentiles.</p></div>
  <div class="grid"><div class="card"><h2>Latest status</h2><div id="st" class="list"></div></div>
  <form class="card" id="gf"><h2>Add measurement</h2><div class="form"><div class="f"><label for="gw">Weight (kg)</label><input id="gw" type="number" step="0.01" inputmode="decimal"></div><div class="f"><label for="gh">Height (cm)</label><input id="gh" type="number" step="0.1" inputmode="decimal"></div><div class="f"><label for="gc">Head circ. (cm)</label><input id="gc" type="number" step="0.1" inputmode="decimal"></div></div><button class="btn mt" style="width:100%">Save measurement</button></form></div></div>`;

  function draw() {
    view.querySelectorAll('#mt [data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === metric));
    $('#sx', view).textContent = sex === 'M' ? 'Boy ⇄ Girl' : 'Girl ⇄ Boy';
    const r = GROWTH_REF[metric], ms = GROWTH_REF.months, med = ms.map((_, i) => r[sex][i]);
    const pts = recs.filter(x => x[metric] != null);
    const W = 640, H = 360, L = 48, B = 36, T = 16, R = 16, xmax = 60;
    const allv = [...med.map(v => v * (1 + 2 * r.sd)), ...med.map(v => v * (1 - 2 * r.sd)), ...pts.map(p => p[metric])];
    const ymin = Math.floor(Math.min(...allv) * 0.95), ymax = Math.ceil(Math.max(...allv) * 1.03);
    const X = m => L + (Math.min(m, xmax) / xmax) * (W - L - R), Y = v => H - B - ((v - ymin) / (ymax - ymin)) * (H - B - T);
    const line = a => a.map((v, i) => `${i ? 'L' : 'M'}${X(ms[i]).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const hi = med.map(v => v * (1 + 2 * r.sd)), lo = med.map(v => v * (1 - 2 * r.sd));
    const band = `${line(hi)} L${[...lo].reverse().map((v, i) => `${X(ms[ms.length - 1 - i]).toFixed(1)},${Y(v).toFixed(1)}`).join(' L')} Z`;
    let grid = ''; for (let i = 0; i <= 5; i++) { const v = ymin + (ymax - ymin) * i / 5; grid += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e2e8f0"/><text x="${L - 6}" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="#64748b">${v.toFixed(0)}</text>`; }
    for (let m = 0; m <= 60; m += 12) grid += `<text x="${X(m)}" y="${H - 12}" font-size="11" text-anchor="middle" fill="#64748b">${m / 12}y</text>`;
    $('#ch', view).innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${METRICS[metric]} chart">${grid}<path d="${band}" fill="rgba(13,148,136,.10)"/><path d="${line(med)}" fill="none" stroke="#0d9488" stroke-width="2" stroke-dasharray="5 4"/>
      ${pts.length > 1 ? `<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.ageMonths)},${Y(p[metric])}`).join(' ')}" fill="none" stroke="#0ea5e9" stroke-width="2.5"/>` : ''}
      ${pts.map(p => `<circle cx="${X(p.ageMonths)}" cy="${Y(p[metric])}" r="5" fill="#0ea5e9" stroke="#fff" stroke-width="2"><title>${p[metric]} ${r.unit} at ${p.ageMonths} mo</title></circle>`).join('')}
      <text x="${W - R}" y="${T + 10}" font-size="11" text-anchor="end" fill="#0f766e">- - median · shaded ±2 SD · ${r.unit}</text></svg>`;
    const last = [...recs].reverse(); const items = Object.keys(METRICS).map(k => { const x = last.find(p => p[k] != null); return x ? `<div class="row"><div class="info"><b>${METRICS[k]}</b><div class="small muted">${x[k]} ${GROWTH_REF[k].unit} · ${dateStr(x.date)}</div></div>${zBadge(zScore(k, pt.gender, x.ageMonths, x[k]), k)}</div>` : ''; });
    $('#st', view).innerHTML = items.join('') || '<div class="empty">No measurements yet.</div>';

    const latest = [...recs].reverse().find(x => x.weight != null || x.height != null || x.hc != null) || {};
    const summaryText = growthSummaryText({
      name: pt.name,
      uhid: pt.uhid,
      gender: pt.gender,
      ageMonths: latest.ageMonths ?? ageMonths(pt.dob),
      weight: latest.weight ?? pt.weight,
      height: latest.height ?? null,
      hc: latest.hc ?? null,
      z: {
        weight: latest.weight != null ? zScore('weight', pt.gender, latest.ageMonths, latest.weight) : null,
        height: latest.height != null ? zScore('height', pt.gender, latest.ageMonths, latest.height) : null,
        hc: latest.hc != null ? zScore('hc', pt.gender, latest.ageMonths, latest.hc) : null
      },
      date: latest.date || todayStr()
    });
    const wa = $('#wa-growth', view); if (wa) wa.href = waLink(pt.mobile, summaryText);
  }
  view.addEventListener('click', e => {
    const m = e.target.closest('[data-m]'); if (m) { metric = m.dataset.m; draw(); }
    if (e.target.closest('#sx')) { sex = sex === 'M' ? 'F' : 'M'; draw(); }
    if (e.target.closest('#print-growth')) {
      const chart = $('#ch svg', view)?.outerHTML || '';
      const latest = [...recs].reverse().find(x => x.weight != null || x.height != null || x.hc != null) || {};
      const summaryText = growthSummaryText({ name: pt.name, uhid: pt.uhid, gender: pt.gender, ageMonths: latest.ageMonths ?? ageMonths(pt.dob), weight: latest.weight ?? pt.weight, height: latest.height ?? null, hc: latest.hc ?? null, z: { weight: latest.weight != null ? zScore('weight', pt.gender, latest.ageMonths, latest.weight) : null, height: latest.height != null ? zScore('height', pt.gender, latest.ageMonths, latest.height) : null, hc: latest.hc != null ? zScore('hc', pt.gender, latest.ageMonths, latest.hc) : null }, date: latest.date || todayStr() });
      const w = window.open('', '_blank', 'width=720,height=900');
      if (!w) return;
      w.document.write(`<!doctype html><html><head><title>Growth chart – ${esc(pt.name)}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111} .box{border:1px solid #dfe7ef;padding:16px;border-radius:12px;margin-top:18px}.label{color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:.06em}.stat{margin:4px 0} pre{white-space:pre-wrap;font-family:inherit}</style></head><body><h2>${esc(pt.name)} · ${esc(pt.uhid)}</h2><div class="box"><div class="label">Growth summary</div><pre>${esc(summaryText)}</pre></div>${chart ? `<div class="box">${chart}</div>` : ''}</body></html>`);
      w.document.close(); w.focus(); w.print();
    }
  });
  $('#gf', view).onsubmit = async e => {
    e.preventDefault(); const w = num($('#gw', view).value), h = num($('#gh', view).value), c = num($('#gc', view).value);
    if (w === null && h === null && c === null) return toast('Enter at least one value', 'err');
    await api.add('growth', { patientId: id, date: todayStr(), ageMonths: ageMonths(pt.dob), weight: w, height: h, hc: c });
    if (w) await api.update('patients', id, { weight: w });
    toast('Measurement saved'); e.target.reset(); refresh();
  };
  draw();
}
