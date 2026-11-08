import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VACCINES, vaxKey, getVaxEntry, legacyKeys, vaccineDueDate, itemSource, GROWTH_REF, CARE_SETTINGS, VISIT_TYPES } from '../public/js/clinic.js';
import { resolveRange, buildExportRows, toCsv, csvCell } from '../public/js/pages/export.js';
import { zScore } from '../public/js/pages/growth.js';
import { pendingVaccines } from '../public/js/pages/vaccination.js';
import { isOrphan, withoutOrphans, deletePatientEverywhere } from '../public/js/cascade.js';

test('vaccine schedule follows the PDF and has unique keys', () => {
  const names = VACCINES.flatMap(g => g.items.map(i => i.name)).join('|');
  for (const n of ['BCG', 'HBV-0', 'Rotavirus-1', 'PCV booster', 'Typhoid conjugate vaccine', 'JE-1 (JEEV 3)', 'Varicella-1', 'Tdap / Boostrix', 'HPV-1 (Cervavac, 9–14 y)']) assert.ok(names.includes(n), n);
  const keys = VACCINES.flatMap(g => g.items.map(i => vaxKey(g, i)));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(VACCINES[0].label, 'Birth');
  assert.equal(VACCINES.at(-1).label, '15 years');
});

test('due dates: weeks from birth and calendar months with end-of-month clamping', () => {
  assert.equal(vaccineDueDate('2026-01-15', { weeks: 6 }).toDateString(), new Date(2026, 1, 26).toDateString());
  assert.equal(vaccineDueDate('2026-01-31', { months: 1 }).toDateString(), new Date(2026, 1, 28).toDateString());
  assert.equal(vaccineDueDate('2025-11-15', { months: 30 }).toDateString(), new Date(2028, 4, 15).toDateString());
});

test('records saved under the previous schedule are still found', () => {
  const g = VACCINES.find(x => x.label === '6 weeks'), it = g.items[0];
  assert.deepEqual(legacyKeys(vaxKey(g, it)), ['6 weeks|DTwP/DTaP-1']);
  assert.equal(getVaxEntry({ '6 weeks|DTwP/DTaP-1': '05 Nov 2026' }, vaxKey(g, it)), '05 Nov 2026');
  assert.equal(itemSource(VACCINES.find(x => x.label === '10 weeks').items[2 - 1]), 'Private / Paid'); // IPV-2 is not in the Govt schedule
});

test('newly registered patients with a DOB show vaccine reminders', () => {
  const pt = { dob: '2025-08-01', vaccines: {} };
  const items = pendingVaccines(pt);
  assert.ok(items.length > 0);
  assert.ok(items.some(i => i.name.includes('Vitamin A') || i.name.includes('MR-1')));
});

test('registration flow keeps the expected visit types and care settings', () => {
  assert.deepEqual(VISIT_TYPES.map(v => v.value), ['new', 'followup']);
  assert.deepEqual(CARE_SETTINGS.map(v => v.value), ['opd', 'daycare', 'ipd']);
  assert.ok(CARE_SETTINGS.some(v => v.label.includes('Day care')));
  assert.ok(VISIT_TYPES.some(v => v.label.includes('Follow-up')));
});

test('growth reference tables are aligned and z-score is 0 at the median', () => {
  for (const k of ['weight', 'height', 'hc']) for (const s of ['M', 'F']) assert.equal(GROWTH_REF[k][s].length, GROWTH_REF.months.length);
  assert.ok(Math.abs(zScore('weight', 'Male', 12, 9.6)) < 1e-9);
  assert.ok(zScore('weight', 'Female', 6, 5.0) < -2);
});

test('export ranges end today and custom ranges are validated', () => {
  const now = new Date(2026, 10, 7);
  assert.deepEqual(resolveRange('week', {}, now), { from: '2026-11-01', to: '2026-11-07', valid: true });
  assert.deepEqual(resolveRange('month', {}, now), { from: '2026-10-07', to: '2026-11-07', valid: true });
  assert.deepEqual(resolveRange('year', {}, now), { from: '2025-11-07', to: '2026-11-07', valid: true });
  assert.equal(resolveRange('month', {}, new Date(2026, 2, 31)).from, '2026-02-28');
  assert.equal(resolveRange('custom', { from: '2026-05-02', to: '2026-05-01' }).valid, false);
  assert.equal(resolveRange('custom', { from: '2026-05-01', to: '2026-05-01' }).valid, true);
});

test('export rows: visited vs registered, totals, CSV escaping and formula protection', () => {
  const patients = [
    { id: 'a', uhid: 'U1', name: 'Aarav, "Jr"', gender: 'Male', dob: '2026-01-01', guardian: '=cmd', mobile: '9000000000', createdAt: new Date(2026, 10, 3).getTime() },
    { id: 'b', uhid: 'U2', name: 'Bela', gender: 'Female', dob: '2025-01-01', createdAt: new Date(2026, 0, 3).getTime() }
  ];
  const visits = [
    { patientId: 'a', date: '2026-11-03', fee: 600, paidAmount: 300, dx: 'URTI', token: 1 },
    { patientId: 'a', date: '2026-11-05', fee: 300, paidAmount: 300, complaints: ['Fever'], token: 2 },
    { patientId: 'b', date: '2026-10-01', fee: 600, paidAmount: 0, token: 1 }
  ];
  const v = buildExportRows({ patients, visits }, { from: '2026-11-01', to: '2026-11-07', mode: 'visited' });
  assert.equal(v.rows.length, 1);
  assert.deepEqual(v.totals, { patients: 1, visits: 2, fee: 900, paid: 600, due: 300 });
  assert.equal(v.rows[0].dx, 'URTI; Fever');
  assert.equal(v.rows[0].lastVisit, '2026-11-05');
  assert.equal(buildExportRows({ patients, visits }, { from: '2026-01-01', to: '2026-01-31', mode: 'registered' }).rows[0].uhid, 'U2');
  const csv = toCsv(v.rows);
  assert.match(csv.split('\r\n')[0], /^UHID,Patient name,/);
  assert.ok(csv.includes('"Aarav, ""Jr"""'));
  assert.ok(csv.includes("'=cmd"));
  assert.equal(csvCell('-12.5'), '-12.5');
});

test('orphan helpers hide visits of deleted patients', () => {
  const ids = new Set(['p1']);
  assert.equal(isOrphan({ patientId: 'p2' }, ids), true);
  assert.equal(isOrphan({ patientId: 'p1' }, ids), false);
  assert.deepEqual(withoutOrphans([{ patientId: 'p1' }, { patientId: 'p2' }], ids), [{ patientId: 'p1' }]);
  assert.deepEqual(withoutOrphans([{ patientId: 'p1' }], null), []); // nothing is shown until the patient list has loaded
});

test('deletePatientEverywhere removes the patient and everything linked to them', async () => {
  const db = {
    patients: { p1: { name: 'A' }, p2: { name: 'B' } },
    visits: { v1: { patientId: 'p1' }, v2: { patientId: 'p2' } }, growth: { g1: { patientId: 'p1' } }, labs: { l1: { patientId: 'p1' } },
    admissions: { a1: { patientId: 'p1' } }, mar: { m1: { admissionId: 'a1' }, m2: { admissionId: 'zz' } }, vitals: { t1: { admissionId: 'a1' } }, alerts: { x1: { admissionId: 'a1' } }, audit: {}
  };
  const api = {
    async query(c, w) { return Object.entries(db[c] || {}).map(([id, d]) => ({ id, ...d })).filter(d => (w || []).every(x => d[x[0]] === x[1])); },
    async delete(c, id) { delete db[c][id]; }, async add(c, d) { db[c] = db[c] || {}; db[c]['n' + Math.random()] = d; }
  };
  await deletePatientEverywhere(api, { name: 'Dr' }, { id: 'p1', uhid: 'U', name: 'A' });
  assert.deepEqual(Object.keys(db.patients), ['p2']);
  assert.deepEqual(Object.keys(db.visits), ['v2']);
  for (const c of ['growth', 'labs', 'admissions', 'vitals', 'alerts']) assert.equal(Object.keys(db[c]).length, 0, c);
  assert.deepEqual(Object.keys(db.mar), ['m2']);
});

test('historical inpatient, nursing, and investigation flows are restored', () => {
  const admissions = fs.readFileSync(new URL('../public/js/pages/admissions.js', import.meta.url), 'utf8');
  const nursing = fs.readFileSync(new URL('../public/js/pages/nursing.js', import.meta.url), 'utf8');
  const labs = fs.readFileSync(new URL('../public/js/pages/labs.js', import.meta.url), 'utf8');

  assert.match(admissions, /Admissions · NICU \/ PICU \/ IPD|Admit patient|Phototherapy|Census/i);
  assert.match(nursing, /Log vitals|Add medication|Medication administration record|Shift progress/i);
  assert.match(labs, /New test|Enter result|Lab orders, results and reports|ordered|reported/i);
});
