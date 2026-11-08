import { esc, $, toast, modal, icon, debounce, audit } from '../util.js';
import { DRUGS } from '../clinic.js';

// Medicine master list. Whatever is added / edited here shows up in the "Medicine" dropdown while preparing a prescription (Consultation → Rx).
// Firestore collection: medicines/{id} = { name, dose, freq, days, note, createdAt, updatedAt }

const FIELDS = [['dose', 'Default dose', 'e.g. 2.5 ml'], ['freq', 'Frequency', 'e.g. BD'], ['days', 'Days', 'e.g. 5'], ['note', 'Timing / note', 'e.g. After food']];
const norm = s => String(s || '').trim().replace(/\s+/g, ' ');
const sameName = (a, b) => norm(a).toLowerCase() === norm(b).toLowerCase();

export async function render(view, _p, ctx) {
  const { api, user } = ctx;
  let meds = [], q = '';

  view.innerHTML = `<div class="page-head"><div><h1>Medicines</h1><p id="mcount">Loading…</p></div></div>
  <div class="split med-split">
    <div class="grid">
      <div class="card"><h2>Medicine list</h2>
        <label for="msearch">Search medicines</label>
        <input id="msearch" type="search" placeholder="Type a medicine name…" autocomplete="off">
        <div class="list mt" id="mlist"></div>
      </div>
    </div>
    <form class="card med-add" id="madd" autocomplete="off"><h2>Add medicine</h2>
      <div class="list">
        <div><label for="mname">Medicine name *</label><input id="mname" required placeholder="e.g. Syp. Paracetamol 250mg/5ml"></div>
        <details class="med-defaults"><summary>Default prescription details (optional)</summary>
          <div class="list mt">${FIELDS.map(([k, l, ph]) => `<div><label for="m_${k}">${l}</label><input id="m_${k}" placeholder="${ph}"></div>`).join('')}</div>
        </details>
        <button class="btn" id="msave" type="submit">${icon('plus', 18)} Add to list</button>
        <p class="small muted">Added medicines appear in the prescription dropdown straight away.</p>
      </div>
    </form></div>`;

  const draw = () => {
    const t = q.trim().toLowerCase();
    const rows = meds.filter(m => !t || String(m.name).toLowerCase().includes(t));
    $('#mcount', view).textContent = `${meds.length} medicine${meds.length === 1 ? '' : 's'} in your list`;
    if (!meds.length) {
      $('#mlist', view).innerHTML = `<div class="empty">No medicines yet. Add the first one using the form${DRUGS.length ? `, or <button class="btn sm sec" type="button" data-seed style="margin-left:6px">Add starter list</button>` : ''}</div>`;
      return;
    }
    $('#mlist', view).innerHTML = rows.length ? rows.map(m => `<div class="row med-row">
      <div class="info"><b>${esc(m.name)}</b>
        <div class="small muted">${[m.dose && 'Dose ' + esc(m.dose), m.freq && esc(m.freq), m.days && esc(m.days) + (/^\d+$/.test(m.days) ? ' days' : ''), m.note && esc(m.note)].filter(Boolean).join(' · ') || 'No default details'}</div></div>
      <div class="btns"><button class="btn sm sec" type="button" data-edit="${esc(m.id)}" aria-label="Edit ${esc(m.name)}">${icon('edit', 16)} Edit</button>
      <button class="btn sm ghost danger" type="button" data-del="${esc(m.id)}" aria-label="Delete ${esc(m.name)}">${icon('trash', 16)}</button></div></div>`).join('') : `<div class="empty">No medicine matches “${esc(q.trim())}”.</div>`;
  };

  const readForm = root => {
    const o = { name: norm($('#mname', root)?.value ?? $('#e_name', root)?.value) };
    for (const [k] of FIELDS) o[k] = norm(($(`#m_${k}`, root) || $(`#e_${k}`, root))?.value);
    return o;
  };
  const duplicate = (name, exceptId) => meds.some(m => m.id !== exceptId && sameName(m.name, name));

  $('#madd', view).onsubmit = async e => {
    e.preventDefault();
    const data = readForm(e.target);
    if (!data.name) return toast('Enter a medicine name', 'err');
    if (duplicate(data.name)) return toast(`“${data.name}” is already in the list`, 'err');
    const btn = $('#msave', view); btn.disabled = true;
    try {
      await api.add('medicines', { ...data, updatedAt: Date.now() });
      audit(api, user, 'medicine_add', data.name);
      toast('Medicine added'); e.target.reset(); $('#mname', view).focus();
    } catch (err) { toast('Could not save: ' + (err.message || err), 'err'); }
    btn.disabled = false;
  };

  $('#msearch', view).addEventListener('input', debounce(e => { q = e.target.value; draw(); }, 100));

  view.addEventListener('click', async e => {
    const seed = e.target.closest('[data-seed]');
    if (seed) {
      seed.disabled = true;
      try {
        for (const d of DRUGS.filter(x => !x.custom)) await api.add('medicines', { name: d.name, dose: '', freq: d.freq || '', days: '', note: d.note || '', updatedAt: Date.now() });
        audit(api, user, 'medicine_seed', String(DRUGS.length)); toast('Starter list added');
      } catch (err) { toast('Could not add: ' + (err.message || err), 'err'); seed.disabled = false; }
      return;
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) {
      const m = meds.find(x => x.id === ed.dataset.edit); if (!m) return;
      const md = modal(`<h2>Edit medicine</h2><form id="eform" class="list">
        <div><label for="e_name">Medicine name *</label><input id="e_name" required value="${esc(m.name)}"></div>
        ${FIELDS.map(([k, l, ph]) => `<div><label for="e_${k}">${l}</label><input id="e_${k}" placeholder="${ph}" value="${esc(m[k] || '')}"></div>`).join('')}
        <div class="actions"><button class="btn" type="submit">Save changes</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form>`);
      $('#e_name', md.el).focus();
      $('#eform', md.el).onsubmit = async ev => {
        ev.preventDefault();
        const data = readForm(md.el);
        if (!data.name) return toast('Enter a medicine name', 'err');
        if (duplicate(data.name, m.id)) return toast(`“${data.name}” is already in the list`, 'err');
        try { await api.update('medicines', m.id, { ...data, updatedAt: Date.now() }); audit(api, user, 'medicine_edit', m.id); toast('Medicine updated'); md.close(); }
        catch (err) { toast('Could not save: ' + (err.message || err), 'err'); }
      };
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const m = meds.find(x => x.id === del.dataset.del); if (!m) return;
      const md = modal(`<h2>Delete medicine?</h2><p><b>${esc(m.name)}</b> will be removed from the list and from the prescription dropdown. Prescriptions that already used it are not changed.</p>
        <div class="actions"><button class="btn danger-solid" id="cdel" type="button">Delete</button><button class="btn ghost" type="button" data-close>Cancel</button></div>`);
      $('#cdel', md.el).onclick = async () => {
        try { await api.delete('medicines', m.id); audit(api, user, 'medicine_delete', m.name); toast('Medicine deleted'); md.close(); }
        catch (err) { toast('Could not delete: ' + (err.message || err), 'err'); }
      };
    }
  });

  const un = api.watch('medicines', [], list => { meds = list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base' })); draw(); });
  return () => un();
}
