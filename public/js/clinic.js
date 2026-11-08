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
  defaultFee: 100,
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

export const VISIT_TYPES = [
  { value: 'new', label: 'New patient' },
  { value: 'followup', label: 'Follow-up' }
];

export const CARE_SETTINGS = [
  { value: 'opd', label: 'OPD consultation' },
  { value: 'daycare', label: 'Day care', note: 'IV / nebulization slot' },
  { value: 'ipd', label: 'IPD admission', note: 'bed booking' }
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

// Vaccine source (who pays). Each schedule item can carry its own default `source`; this is the fallback by name.
export function getVaccineSource(vaccineName = '') {
  const value = String(vaccineName).toLowerCase();
  const govt = ['bcg', 'opv', 'hepatitis b', 'hbv', 'dtwp', 'dtap', 'ipv', 'hib', 'pentavalent', 'rotavirus', 'pcv', 'mr-', 'mmr', 'varicella', 'dpt', 'vitamin a', 'je-'];
  const privatePaid = ['influenza', 'flu', 'typhoid', 'hepatitis a', 'hpv', 'cervavac', 'tdap', 'boostrix'];
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

const GOV = 'Government Provided', PVT = 'Private / Paid';
// item(name, "dose · route / notes", default source, [legacy keys from the previous schedule so already-given records keep showing])
const item = (name, info = '', source, legacy = []) => ({ name, info, source, legacy });

// Schedule transcribed from "Vaccination Schedule" (Balrog Department, SGAK, Hadapsar, Pune).
// A group is due at `weeks` (from birth) or at `months` (calendar months from birth).
// Indicative only – verify against the current IAP chart before clinical use.
export const VACCINES = [
  { label: 'Birth', weeks: 0, items: [
    item('BCG', '0.1 ml · Left shoulder – intradermal', GOV),
    item('HBV-0', '0.5 ml · Anterolateral thigh – IM', GOV, ['Birth|Hepatitis B-1']),
    item('OPV-0', '2 drops · Oral', GOV)] },
  { label: '6 weeks', weeks: 6, items: [
    item('Pentavalent-1 / Hexavalent-1', '0.5 ml · Anterolateral thigh – IM · Hexasiil PFS (with pain) / Infanrix Hexa (painless)', GOV, ['6 weeks|DTwP/DTaP-1']),
    item('IPV-1 / OPV-1', 'IPV 0.5 ml anterolateral thigh – IM (Govt schedule: 0.1 ml SC right deltoid) · OPV 2 drops oral', GOV, ['6 weeks|IPV-1']),
    item('Rotavirus-1', '2.5 ml · Oral · 1st dose within 15 weeks of age, last dose not after 8 months (2 doses RV1 / 3 doses RV5)', GOV, ['6 weeks|Rotavirus-1']),
    item('PCV-1', '0.5 ml · Anterolateral thigh – IM', GOV, ['6 weeks|PCV-1'])] },
  { label: '10 weeks', weeks: 10, items: [
    item('Pentavalent-2 / Hexavalent-2', '0.5 ml · Anterolateral thigh – IM', GOV, ['10 weeks|DTwP/DTaP-2']),
    item('IPV-2 / OPV-2', 'IPV 0.5 ml anterolateral thigh – IM · OPV 2 drops oral · IPV-2 is not in the Govt schedule', PVT, ['10 weeks|IPV-2']),
    item('Rotavirus-2', '2.5 ml · Oral (2 doses RV1 / 3 doses RV5)', GOV, ['10 weeks|Rotavirus-2']),
    item('PCV-2', '0.5 ml · Anterolateral thigh – IM · Not included in Govt schedule', PVT, ['10 weeks|PCV-2'])] },
  { label: '14 weeks', weeks: 14, items: [
    item('Pentavalent-3 / Hexavalent-3', '0.5 ml · Anterolateral thigh – IM', GOV, ['14 weeks|DTwP/DTaP-3']),
    item('IPV-3 / OPV-3', 'IPV 0.5 ml anterolateral thigh – IM (Govt schedule: 0.1 ml SC right deltoid) · OPV 2 drops oral', GOV, ['14 weeks|IPV-3']),
    item('Rotavirus-3 (RV5 only)', '2.5 ml · Oral · 3rd dose applies to the 3-dose RV5 schedule; RV1 is complete after 2 doses', GOV, ['14 weeks|Rotavirus-3']),
    item('PCV-3', '0.5 ml · Anterolateral thigh – IM', GOV, ['14 weeks|PCV-3'])] },
  { label: '7 months', months: 7, items: [
    item('Flu vaccine-1', '0.5 ml · Anterolateral thigh – IM · 2 doses 1 month apart (6 months–9 years), then yearly booster', PVT, ['6 months|Influenza-1'])] },
  { label: '8 months', months: 8, items: [
    item('Flu vaccine-2', '0.5 ml · Anterolateral thigh – IM · 1 month after dose 1, then yearly booster', PVT)] },
  { label: '9 months', months: 9, items: [
    item('MR-1 / MMR-1', '0.5 ml · Deltoid / anterolateral thigh – SC', GOV, ['9 months|MMR-1']),
    item('Vitamin A (1 ml)', '1 ml · Oral', GOV),
    item('PCV booster', '0.5 ml · Anterolateral right thigh – IM', GOV),
    item('IPV-3 (fractional)', '0.1 ml · Right deltoid – SC', GOV)] },
  { label: '10 months', months: 10, items: [
    item('Typhoid conjugate vaccine', '0.5 ml · IM – anterolateral thigh if under 12 months, deltoid if over 12 months', PVT, ['9 months|Typhoid conjugate'])] },
  { label: '12 months', months: 12, items: [
    item('Hepatitis A-1', '0.5 ml · SC – anterolateral thigh or deltoid · single dose for live attenuated vaccine', PVT)] },
  { label: '13 months', months: 13, items: [
    item('JE-1 (JEEV 3)', '0.25 ml · IM – anterolateral thigh (JEEV 3 for 1–3 years)', GOV)] },
  { label: '14 months', months: 14, items: [
    item('JE-2 (JEEV 3)', '0.25 ml · IM – anterolateral thigh', GOV)] },
  { label: '15 months', months: 15, items: [
    item('MR-2 / MMR-2', '0.5 ml · Deltoid / anterolateral thigh – SC', GOV, ['15 months|MMR-2']),
    item('Vitamin A (2 ml)', '2 ml · Oral', GOV),
    item('PCV booster', '0.5 ml · Anterolateral thigh – IM', GOV)] },
  { label: '16 months', months: 16, items: [
    item('Varicella-1', '0.5 ml · SC – anterolateral thigh or deltoid', GOV, ['15 months|Varicella-1'])] },
  { label: '18 months', months: 18, items: [
    item('DTwP-B1 / Pentaxim / Hexasiil booster', '0.5 ml · Anterolateral thigh – IM · Hexasiil → Hexasiil booster; Infanrix Hexa → Pentaxim; Pentavac → Quadrovax', GOV, ['18 months|DTwP-B1']),
    item('OPV-B1 / IPV-B1', 'OPV 2 drops oral · IPV 0.5 ml IM', GOV, ['18 months|IPV-B1']),
    item('Hepatitis A-2', '0.5 ml · SC – anterolateral thigh or deltoid', PVT, ['18 months|Hep A-2']),
    item('Vitamin A', '2 ml · Oral', GOV)] },
  { label: '19 months', months: 19, items: [
    item('Flu booster', '0.5 ml · Anterolateral thigh – IM', PVT)] },
  { label: '2 years', months: 24, items: [
    item('Typhoid conjugate booster (if previously given)', '0.5 ml · IM – anterolateral thigh', PVT, ['24 months|Typhoid booster']),
    item('Typhoid polysaccharide vaccine-1', '0.5 ml · IM – anterolateral thigh · revaccinate every 3 years', PVT),
    item('Vitamin A (2 ml)', '2 ml · Oral', GOV)] },
  { label: '2½ years', months: 30, items: [item('Vitamin A', '2 ml · Oral', GOV)] },
  { label: '3 years', months: 36, items: [
    item('Vitamin A (2 ml)', '2 ml · Oral', GOV),
    item('JE-1 & JE-2 (JEEV 6, if not given earlier)', '0.5 ml · IM deltoid · 2 doses 1 month apart (for over 3 years)', GOV)] },
  { label: '3½ years', months: 42, items: [item('Vitamin A', '2 ml · Oral', GOV)] },
  { label: '4 years', months: 48, items: [item('Vitamin A', '2 ml · Oral', GOV)] },
  { label: '4½ years', months: 54, items: [item('Vitamin A', '2 ml · Oral', GOV)] },
  { label: '5 years', months: 60, items: [
    item('DTwP-B2 / Infanrix booster', '0.5 ml · Anterolateral thigh – IM (Infanrix for 4–6 years)', GOV, ['4-6 years|DTwP-B2']),
    item('OPV-B2 / IPV', 'OPV 2 drops oral · IPV 0.5 ml IM', GOV, ['4-6 years|OPV-3']),
    item('MMR-3', '0.5 ml · Deltoid / anterolateral thigh – SC', GOV, ['4-6 years|MMR-3 / Varicella-2']),
    item('Typhoid polysaccharide vaccine B1', '0.5 ml · IM – anterolateral thigh', PVT),
    item('Varicella-2', '0.5 ml · SC – anterolateral thigh or deltoid', GOV)] },
  { label: '10 years', months: 120, items: [
    item('Tdap / Boostrix', '0.5 ml · Anterolateral thigh – IM (7 years and above)', PVT),
    item('HPV-1 (Cervavac, 9–14 y)', '0.5 ml · IM · 2 doses at 0 and 6 months', PVT)] },
  { label: '10½ years', months: 126, items: [
    item('HPV-2 (Cervavac, 9–14 y)', '0.5 ml · IM · 6 months after dose 1', PVT)] },
  { label: '15 years', months: 180, items: [
    item('HPV (Cervavac, 15–26 y, if not given earlier)', '0.5 ml · IM · 3 doses at 0, 2 and 6 months', PVT)] }
];

export const vaxKey = (group, it) => `${group.label}|${it.name}`;

// new key -> keys used by the previous schedule (so vaccines already marked as given are not lost)
const LEGACY = new Map(VACCINES.flatMap(g => g.items.filter(i => i.legacy.length).map(i => [vaxKey(g, i), i.legacy])));
export const legacyKeys = key => LEGACY.get(key) || [];
export function getVaxEntry(map = {}, key) {
  if (map[key] != null) return map[key];
  for (const k of legacyKeys(key)) if (map[k] != null) return map[k];
  return undefined;
}
export function itemSource(it) { return it.source || getVaccineSource(it.name); }

const parseLocal = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) ? new Date(v.slice(0, 10) + 'T00:00:00') : new Date(v);
// Date a schedule group falls due for a child born on `dob`
export function vaccineDueDate(dob, group) {
  const b = parseLocal(dob);
  if (group.weeks != null) return new Date(b.getFullYear(), b.getMonth(), b.getDate() + group.weeks * 7);
  const first = new Date(b.getFullYear(), b.getMonth() + group.months, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(b.getDate(), lastDay));
}

// APPROXIMATE WHO child growth medians (boys M / girls F) at the ages in `months`, plus a rough SD as a fraction of the median.
// Linear interpolation between points. For clinical-grade percentiles / Z-scores replace with the full WHO LMS tables.
export const GROWTH_REF = {
  months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24, 36, 48, 60],
  weight: { sd: 0.12, unit: 'kg',
    M: [3.3, 4.5, 5.6, 6.4, 7.0, 7.5, 7.9, 8.3, 8.6, 8.9, 9.2, 9.4, 9.6, 10.9, 12.2, 14.3, 16.3, 18.3],
    F: [3.2, 4.2, 5.1, 5.8, 6.4, 6.9, 7.3, 7.6, 7.9, 8.2, 8.5, 8.7, 8.9, 10.2, 11.5, 13.9, 16.1, 18.2] },
  height: { sd: 0.04, unit: 'cm',
    M: [49.9, 54.7, 58.4, 61.4, 63.9, 65.9, 67.6, 69.2, 70.6, 72.0, 73.3, 74.5, 75.7, 82.3, 87.8, 96.1, 103.3, 110.0],
    F: [49.1, 53.7, 57.1, 59.8, 62.1, 64.0, 65.7, 67.3, 68.7, 70.1, 71.5, 72.8, 74.0, 80.7, 86.4, 95.1, 102.7, 109.4] },
  hc: { sd: 0.035, unit: 'cm',
    M: [34.5, 37.3, 39.1, 40.5, 41.6, 42.6, 43.3, 44.0, 44.5, 45.0, 45.4, 45.8, 46.1, 47.4, 48.3, 49.5, 50.2, 50.7],
    F: [33.9, 36.5, 38.3, 39.5, 40.6, 41.5, 42.2, 42.8, 43.4, 43.8, 44.2, 44.6, 44.9, 46.2, 47.2, 48.5, 49.3, 49.8] }
};
