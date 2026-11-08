// Deleting a patient must remove them from the WHOLE system (OPD queue, visits, growth, labs, admissions, MAR, vitals, alerts).
// Children are deleted first and the patient record last, so if anything fails the patient is still listed and the delete can be retried.
import { audit, esc, modal, toast } from './util.js';

const batches = (arr, n = 20) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
async function removeAll(api, col, rows) {
  for (const part of batches(rows)) await Promise.all(part.map(r => api.delete(col, r.id).catch(e => { if (!/not.?found/i.test(String(e && e.message))) throw e; })));
}

export async function deletePatientEverywhere(api, user, patient) {
  const id = patient.id;
  const [visits, growth, labs, adms] = await Promise.all(['visits', 'growth', 'labs', 'admissions'].map(c => api.query(c, [['patientId', id]])));
  for (const a of adms) {
    const [mar, vitals, alerts] = await Promise.all(['mar', 'vitals', 'alerts'].map(c => api.query(c, [['admissionId', a.id]])));
    await removeAll(api, 'mar', mar); await removeAll(api, 'vitals', vitals); await removeAll(api, 'alerts', alerts);
  }
  await removeAll(api, 'admissions', adms);
  await removeAll(api, 'visits', visits);
  await removeAll(api, 'growth', growth);
  await removeAll(api, 'labs', labs);
  await api.delete('patients', id);
  audit(api, user, 'patient_delete', `${id} (${patient.uhid || ''} ${patient.name || ''}) · ${visits.length} visits, ${growth.length} growth, ${labs.length} labs, ${adms.length} admissions`);
}

// Visits that still point to a patient who no longer exists (left behind by older deletes).
export const isOrphan = (row, patientIds) => !!row.patientId && !!patientIds && !patientIds.has(row.patientId);
export const withoutOrphans = (rows, patientIds) => patientIds ? rows.filter(r => !isOrphan(r, patientIds)) : [];

// Removes orphan visits for good. Each patient is re-checked directly in the database first, so a patient snapshot that is
// merely incomplete (offline cache, slow load) can never cause a real visit to be deleted. Returns the number removed.
export async function purgeOrphanVisits(api, orphanVisits) {
  let n = 0;
  for (const pid of [...new Set(orphanVisits.map(v => v.patientId))]) {
    let exists = true;
    try { exists = !!(await api.get('patients', pid)); } catch (e) { continue; } // can't verify -> leave it alone
    if (exists) continue;
    const mine = orphanVisits.filter(v => v.patientId === pid);
    await removeAll(api, 'visits', mine); n += mine.length;
  }
  return n;
}

// Confirmation dialog + delete. `onDone` runs after the patient (and everything linked to them) is gone.
export function confirmDeletePatient(api, user, patient, onDone) {
  const m = modal(`<h2>Delete this patient?</h2>
    <p><b>${esc(patient.name)}</b> · ${esc(patient.uhid || '')}</p>
    <p class="muted">This permanently removes the patient from the whole system: patient list, OPD queue, visits and prescriptions, growth records, investigations and admissions. It cannot be undone.</p>
    <div class="actions"><button class="btn danger-solid" type="button" id="pt-del-go">Delete patient</button><button class="btn ghost" type="button" data-close>Cancel</button></div>`);
  const go = m.el.querySelector('#pt-del-go');
  go.onclick = async () => {
    go.disabled = true; go.textContent = 'Deleting…';
    try { await deletePatientEverywhere(api, user, patient); m.close(); toast('Patient deleted'); onDone && onDone(); }
    catch (err) { console.error(err); toast('Could not delete: ' + (err.message || err), 'err'); go.disabled = false; go.textContent = 'Delete patient'; }
  };
}
