import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDue, growthSummaryText, vaccinationScheduleWaText, vaccineReminderText, patientDueWaText, isVaccinationWindow } from '../public/js/util.js';
import { getCustomVaccineEntries, toCustomVaccineKey } from '../public/js/clinic.js';

test('computeDue keeps fee, paid and due in sync', () => {
  assert.deepEqual(computeDue({ fee: 500, paid: 200 }), { fee: 500, paid: 200, due: 300, status: 'partial' });
  assert.deepEqual(computeDue({ fee: 500, paid: 500 }), { fee: 500, paid: 500, due: 0, status: 'paid' });
  assert.deepEqual(computeDue({ fee: 500, paid: 0, due: 250 }), { fee: 500, paid: 250, due: 250, status: 'partial' });
});

test('growthSummaryText includes key measurements and visit context', () => {
  const msg = growthSummaryText({
    name: 'Aarav',
    uhid: 'DVC-2025-0001',
    gender: 'Male',
    ageMonths: 12,
    weight: 8.6,
    height: 74,
    hc: 45,
    z: { weight: -1.2, height: -0.8, hc: 1.1 },
    date: '2025-01-15'
  });

  assert.match(msg, /Aarav/);
  assert.match(msg, /UHID: DVC-2025-0001/);
  assert.match(msg, /Weight: 8.6 kg/);
  assert.match(msg, /Height: 74 cm/);
  assert.match(msg, /Head circumference: 45 cm/);
  assert.match(msg, /z-score/);
});

test('vaccineReminderText includes due window and patient context', () => {
  const msg = vaccineReminderText({
    patientName: 'Aarav',
    uhid: 'DVC-2025-0001',
    vaccineName: 'DTwP/DTaP-1',
    dueDate: '2025-01-15',
    leadDays: 1,
    source: 'Government Provided',
    clinicName: 'Dr. Vivek Chothe Children Hospital'
  });

  assert.match(msg, /Reminder/);
  assert.match(msg, /Aarav/);
  assert.match(msg, /DTwP\/DTaP-1/);
  assert.match(msg, /1 day/);
  assert.match(msg, /2025-01-15/);
  assert.match(msg, /Government Provided/);
  assert.match(msg, /बालकास/);
  assert.match(msg, /यावे/);
});

test('vaccinationScheduleWaText labels each vaccine as government or private and includes patient name', () => {
  const msg = vaccinationScheduleWaText({
    patientName: 'Kabir',
    uhid: 'DVC-2025-0002',
    items: [
      { vaccineName: 'MMR-1', dueDate: '2025-08-15', source: 'Government Provided' },
      { vaccineName: 'Typhoid conjugate', dueDate: '2025-08-15', source: 'Private / Paid' }
    ],
    clinicName: 'Dr. Vivek Chothe Children Hospital'
  });

  assert.match(msg, /Kabir/);
  assert.match(msg, /Government Provided/);
  assert.match(msg, /Private \/ Paid/);
  assert.match(msg, /MMR-1/);
  assert.match(msg, /Typhoid conjugate/);
  assert.match(msg, /Reminder/);
  assert.match(msg, /लसीकरण:/);
});

test('custom vaccine entries normalize names and keys consistently', () => {
  const patient = {
    vaccines: {
      [toCustomVaccineKey('Hepatitis B Booster')]: {
        name: 'Hepatitis B Booster',
        source: 'Private / Paid',
        dueDate: '2026-11-20',
        status: 'pending',
        selected: true
      }
    }
  };

  const entries = getCustomVaccineEntries(patient);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].vaccineName, 'Hepatitis B Booster');
  assert.equal(entries[0].key, 'custom|hepatitis-b-booster');
  assert.equal(entries[0].source, 'Private / Paid');
});

test('patientDueWaText is bilingual and includes the due amount', () => {
  const msg = patientDueWaText({
    patientName: 'Prince Yadav',
    uhid: 'DVC-2026-0005',
    fee: 100,
    paid: 0,
    due: 100,
    date: '2026-11-05'
  });

  assert.match(msg, /रुग्ण: Prince Yadav/);
  assert.match(msg, /Balance due: ₹100/);
  assert.match(msg, /Please settle the pending amount/);
  assert.match(msg, /कृपया बाकी रक्कम भरा\./);
});

test('isVaccinationWindow uses Monday-Sunday ranges for this week and custom dates', () => {
  const at = new Date('2026-11-05T09:00:00');
  assert.equal(isVaccinationWindow('2026-11-04', 'week', at), true);
  assert.equal(isVaccinationWindow('2026-11-08', 'week', at), true);
  assert.equal(isVaccinationWindow('2026-11-09', 'week', at), false);
  assert.equal(isVaccinationWindow('26 Nov 2026', 'week', at), false);
  assert.equal(isVaccinationWindow('2026-11-20', 'month', at), true);
});

test('isVaccinationWindow overdue / upcoming ranges split on today', () => {
  const at = new Date('2026-11-06T10:00:00');
  assert.equal(isVaccinationWindow('2026-11-05', 'overdue', at), true);
  assert.equal(isVaccinationWindow('2026-11-06', 'overdue', at), false);
  assert.equal(isVaccinationWindow('2026-11-06', 'upcoming', at), true);
  assert.equal(isVaccinationWindow('2026-11-05', 'upcoming', at), false);
  assert.equal(isVaccinationWindow('', 'upcoming', at), false);
});
