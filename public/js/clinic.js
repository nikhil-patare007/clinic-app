// Clinic-level constants (letterhead, fees, beds, drug list). Edit freely.
export const CLINIC = {
  name: 'Dr. Chothe Children Hospital',
  short: 'Dr. Vivek G. Chothe',
  doctor: 'Dr. Vivek G. Chothe',
  qual: 'M.D. (Pediatrics) – Pune',
  reg: 'Reg. No. 103619-A (MMC Mumbai)',
  address: 'Opposite Grampanchayat, Near Miyasaheb Patsanstha, Taklimiya, Tal. Rahuri, Dist. Ahilyanagar',
  phones: ['9359768707', '8380833458'],
  timings: 'OPD: 09:00 AM – 9:00 PM',
  uhidPrefix: 'DVC',
  defaultFee: 600,
  followUpFee: 300
};

export const BEDS = [
  ...[1, 2, 3, 4, 5, 6].map(n => ({ id: 'NICU-' + n, ward: 'NICU', label: 'Radiant Warmer ' + n })),
  ...[1, 2].map(n => ({ id: 'PICU-' + n, ward: 'PICU', label: 'PICU Bed ' + n })),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ id: 'WARD-' + n, ward: 'IPD', label: 'IPD Cot ' + n }))
];

// Weight-based pediatric dosing. mgPerKg = per dose (perDay:true => mg/kg/day split by `doses`).
// conc = mg per ml. THESE ARE STARTING DEFAULTS: the doctor must verify every dose.
export const DRUGS = [
  { name: 'Syp. Paracetamol 250mg/5ml', mgPerKg: 15, conc: 50, freq: 'SOS (4-6 hrly)', note: 'Only if Temp > 100°F, min 4-6 hrs gap', max: 'max 60 mg/kg/day' },
  { name: 'Syp. Paracetamol 120mg/5ml', mgPerKg: 15, conc: 24, freq: 'SOS (4-6 hrly)', note: 'Only if Temp > 100°F, min 4-6 hrs gap', max: 'max 60 mg/kg/day' },
  { name: 'Syp. Ibuprofen 100mg/5ml', mgPerKg: 10, conc: 20, freq: 'TDS', note: 'After feeds', max: 'max 40 mg/kg/day' },
  { name: 'Syp. Amoxiclav 228.5mg/5ml', mgPerKg: 40, perDay: true, doses: 2, conc: 45.7, freq: 'BD', note: 'After feeds', max: '' },
  { name: 'Syp. Azithromycin 200mg/5ml', mgPerKg: 10, conc: 40, freq: 'OD', note: 'Before feeds', max: '' },
  { name: 'Syp. Cetirizine 5mg/5ml', mgPerKg: 0.25, conc: 1, freq: 'OD (night)', note: 'At bedtime', max: '' },
  { name: 'Syp. Ondansetron 2mg/5ml', mgPerKg: 0.15, conc: 0.4, freq: 'SOS / BD', note: 'Before feeds', max: '' },
  { name: 'Syp. Zinc 20mg/5ml', fixedMl: 5, freq: 'OD', note: '14 days in diarrhea (age >6 mo)', max: '' },
  { name: 'ORS Sachet', fixedText: '1 sachet in 1 L water', freq: 'After each loose stool', note: '', max: '' },
  { name: 'Nasal drops (Saline)', fixedText: '2 drops each nostril', freq: 'TDS', note: 'Before feeding / sleep', max: '' },
  { name: 'Custom…', custom: true, freq: 'BD', note: '', max: '' }
];

export const COMPLAINTS = ['High Fever', 'Cold / Cough', 'Vomiting', 'Loose Motions', 'Ear Pain', 'Rash', 'Vaccination Only', 'Routine Checkup'];

export const LAB_TESTS = [
  { name: 'Micro-Bilirubin (Total & Direct)', price: 200 },
  { name: 'CBC + CRP', price: 400 },
  { name: 'Dengue NS1 / Antibody Card', price: 600 },
  { name: 'Malaria Antigen Card', price: 250 },
  { name: 'Urine Routine', price: 100 },
  { name: 'Random Blood Sugar', price: 60 }
];

// IAP-style schedule (age in weeks from birth). Verify against current IAP chart before clinical use.
export function getVaccineSource(vaccineName = '') {
  const value = String(vaccineName).toLowerCase();
  const govt = ['bcg', 'opv', 'hepatitis b', 'dtwp', 'dtap', 'ipv', 'hib', 'rotavirus', 'pcv', 'mmr', 'varicella', 'dpt'];
  const privatePaid = ['influenza', 'typhoid', 'hepatitis a'];
  if (privatePaid.some(token => value.includes(token))) return 'Private / Paid';
  if (govt.some(token => value.includes(token))) return 'Government Provided';
  return 'Government Provided';
}

// A vaccine entry may be a legacy string (given-on date) or an object {status, givenOn, source, selected...}.
export function vaxIsGiven(entry) {
  if (!entry) return false;
  if (typeof entry === 'string') return true;
  return entry.status === 'given' || !!entry.givenOn;
}
export function vaxGivenLabel(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  return entry.givenOn || 'Given';
}

export function toCustomVaccineKey(name = '') {
  const base = String(name || '').trim();
  if (!base) return 'custom|custom-vaccine';
  return `custom|${base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'custom-vaccine'}`;
}

export function getCustomVaccineEntries(patient = {}) {
  const map = patient.vaccines || {};
  return Object.entries(map)
    .filter(([key]) => String(key).startsWith('custom|'))
    .map(([key, value]) => {
      const info = value && typeof value === 'object' ? value : { givenOn: value || '', status: typeof value === 'string' ? 'given' : 'pending', selected: true };
      const vaccineName = info.name || key.replace(/^custom\|/, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim() || 'Custom vaccine';
      const source = info.source || getVaccineSource(vaccineName);
      const status = info.status || (info.givenOn ? 'given' : 'pending');
      return {
        key,
        vaccineName,
        dueDate: info.dueDate || 'Custom date',
        source,
        status,
        selected: info.selected !== false,
        givenOn: info.givenOn || '',
        given: status === 'given' || !!info.givenOn
      };
    });
}

export const VACCINES = [
  { age: 0, label: 'Birth', items: ['BCG', 'OPV-0', 'Hepatitis B-1'] },
  { age: 6, label: '6 weeks', items: ['DTwP/DTaP-1', 'IPV-1', 'Hep B-2', 'Hib-1', 'Rotavirus-1', 'PCV-1'] },
  { age: 10, label: '10 weeks', items: ['DTwP/DTaP-2', 'IPV-2', 'Hib-2', 'Rotavirus-2', 'PCV-2'] },
  { age: 14, label: '14 weeks', items: ['DTwP/DTaP-3', 'IPV-3', 'Hib-3', 'Rotavirus-3', 'PCV-3'] },
  { age: 26, label: '6 months', items: ['Influenza-1', 'OPV-1'] },
  { age: 39, label: '9 months', items: ['MMR-1', 'OPV-2', 'Typhoid conjugate'] },
  { age: 52, label: '12 months', items: ['Hepatitis A-1'] },
  { age: 65, label: '15 months', items: ['MMR-2', 'Varicella-1', 'PCV booster'] },
  { age: 72, label: '18 months', items: ['DTwP-B1', 'IPV-B1', 'Hib-B1', 'Hep A-2'] },
  { age: 104, label: '24 months', items: ['Typhoid booster'] },
  { age: 208, label: '4-6 years', items: ['DTwP-B2', 'OPV-3', 'MMR-3 / Varicella-2'] }
];

// APPROXIMATE WHO medians at months 0,3,6,12,24,36,48,60 (+ rough SD as fraction of median).
// Replace with full WHO LMS tables for clinical-grade percentiles/Z-scores.
export const GROWTH_REF = {
  months: [0, 3, 6, 12, 24, 36, 48, 60],
  weight: { sd: 0.12, unit: 'kg', M: [3.3, 6.4, 7.9, 9.6, 12.2, 14.3, 16.3, 18.3], F: [3.2, 5.8, 7.3, 8.9, 11.5, 13.9, 16.1, 18.2] },
  height: { sd: 0.04, unit: 'cm', M: [49.9, 61.4, 67.6, 75.7, 87.8, 96.1, 103.3, 110.0], F: [49.1, 59.8, 65.7, 74.0, 86.4, 95.1, 102.7, 109.4] },
  hc: { sd: 0.035, unit: 'cm', M: [34.5, 40.5, 43.3, 46.1, 48.3, 49.5, 50.2, 50.7], F: [33.9, 39.5, 42.2, 44.9, 47.2, 48.5, 49.3, 49.8] }
};
