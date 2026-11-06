export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pad = (n, l) => String(n).padStart(l, '0');
export const money = n => '₹' + Number(n || 0).toLocaleString('en-IN');
export const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
export const timeStr = t => new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
export const dateStr = t => new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
export const normalizeDateValue = (value, fallback = null) => {
  if (value == null || value === '') return fallback;
  const txt = String(value).trim();
  if (!txt) return fallback;
  const date = new Date(txt);
  if (Number.isNaN(date.getTime())) return fallback;
  const normalized = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return `${normalized.getFullYear()}-${pad(normalized.getMonth() + 1, 2)}-${pad(normalized.getDate(), 2)}`;
};
export const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };

export function ageMonths(dob, at = new Date()) {
  if (!dob) return 0;
  const b = new Date(dob);
  let m = (at.getFullYear() - b.getFullYear()) * 12 + (at.getMonth() - b.getMonth());
  if (at.getDate() < b.getDate()) m--;
  return Math.max(0, m);
}
export function ageText(dob) {
  if (!dob) return '–';
  const b = new Date(dob), now = new Date();
  const days = Math.floor((now - b) / 86400000);
  if (days < 28) return days + (days === 1 ? ' day' : ' days');
  const m = ageMonths(dob);
  if (m < 24) return m + ' mo';
  const y = Math.floor(m / 12), r = m % 12;
  return y + ' yr' + (r ? ' ' + r + ' mo' : '');
}
export function dobFromAge(y, m) {
  const d = new Date(); d.setDate(1);
  d.setMonth(d.getMonth() - ((+y || 0) * 12 + (+m || 0))); d.setDate(15);
  return todayStr(d);
}
export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const waLink = (mobile, text) => `https://wa.me/91${String(mobile || '').replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(text)}`;

export function computeDue({ fee = 0, paid = 0, due } = {}) {
  const feeValue = Math.max(0, Number(fee || 0));
  let paidValue = Math.max(0, Number(paid || 0));
  let dueValue = due == null ? Math.max(feeValue - paidValue, 0) : Math.max(0, Number(due || 0));

  if (due != null) {
    paidValue = Math.max(0, feeValue - dueValue);
  } else {
    if (paidValue > feeValue) paidValue = feeValue;
    dueValue = Math.max(feeValue - paidValue, 0);
  }

  const status = dueValue > 0 ? (paidValue > 0 ? 'partial' : 'unpaid') : 'paid';
  return { fee: feeValue, paid: paidValue, due: dueValue, status };
}

export function growthSummaryText({ name, uhid, gender, ageMonths, weight, height, hc, z = {}, date = todayStr() } = {}) {
  const age = ageMonths == null ? 'Age: –' : `Age: ${Math.floor(ageMonths / 12)}y ${Math.floor(ageMonths % 12)}m`;
  const lines = [
    `*Growth summary*`,
    `Patient: ${name || '–'}`,
    `UHID: ${uhid || '–'}`,
    `Gender: ${gender || '–'}`,
    age,
    `Date: ${date}`,
    weight != null ? `Weight: ${Number(weight).toFixed(1).replace(/\.0$/, '')} kg` : 'Weight: –',
    height != null ? `Height: ${Number(height).toFixed(1).replace(/\.0$/, '')} cm` : 'Height: –',
    hc != null ? `Head circumference: ${Number(hc).toFixed(1).replace(/\.0$/, '')} cm` : 'Head circumference: –',
    `z-score: ${['weight', 'height', 'hc'].map(k => z[k] != null ? `${k === 'weight' ? 'Weight' : k === 'height' ? 'Height' : 'HC'} ${Number(z[k]).toFixed(1)}` : null).filter(Boolean).join(' · ') || '–'}`
  ];
  return lines.join('\n');
}

export function patientDueWaText({ patientName, uhid, fee, paid, due, date = todayStr(), clinicName = 'Dr. Chothe Children Hospital' } = {}) {
  const state = computeDue({ fee, paid, due });
  return [
    `*${clinicName}*`,
    `रुग्ण: ${patientName || '–'}${uhid ? ` (${uhid})` : ''}`,
    `भेट तारीख: ${date}`,
    `सल्लामसलत फी: ${money(state.fee)}`,
    `जमा: ${money(state.paid)}`,
    `बाकी रक्कम: ${money(state.due)}`,
    state.due > 0 ? 'कृपया बाकी रक्कम भरा.' : 'सर्व देणी मुरळीत आहेत. धन्यवाद!',
    '',
    `Patient: ${patientName || '–'}${uhid ? ` (${uhid})` : ''}`,
    `Visit date: ${date}`,
    `Consultation fee: ${money(state.fee)}`,
    `Paid: ${money(state.paid)}`,
    `Balance due: ${money(state.due)}`,
    state.due > 0 ? 'Please settle the pending amount' : 'All dues are cleared. Thank you!'
  ].join('\n');
}

export function isVaccinationWindow(dateValue, range = 'month', at = new Date()) {
  const raw = normalizeDateValue(dateValue, null);
  if (!raw) return false;
  const target = new Date(raw + 'T00:00:00');
  if (Number.isNaN(target.getTime())) return false;

  const today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  if (range === 'week') {
    const monday = new Date(today);
    const offset = (monday.getDay() + 6) % 7;
    monday.setDate(today.getDate() - offset);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return targetDay >= monday && targetDay <= sunday;
  }
  if (range === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return targetDay >= start && targetDay <= end;
  }
  if (range === 'overdue') return targetDay < today;
  if (range === 'upcoming') return targetDay >= today;
  if (range === 'all') return true;
  return false;
}

export function vaccinationScheduleWaText({ patientName, uhid, items = [], clinicName = 'Dr. Chothe Children Hospital' } = {}) {
  const list = (items || []).map(({ vaccineName, dueDate, source }) => `${vaccineName || 'Vaccination'} – ${dueDate || 'Date to confirm'} (${source || 'Government Provided'})`).join('\n');
  const marathiList = (items || []).map(({ vaccineName, dueDate, source }) => `${vaccineName || 'टीका'} – ${dueDate || 'तारीख निश्चित करा'} (${source || 'सरकारी'} )`).join('\n');
  const nameLine = `${patientName || 'child'}${uhid ? ` (${uhid})` : ''}`;
  return [
    `*${clinicName}*`,
    `*Reminder*`,
    `लसीकरण: ${nameLine}`,
    'कृपया बालकास पुढील लसीसाठी तयार ठेवा:',
    marathiList || 'कोणतीही लस निश्चित नाही.',
    'कृपया वेळेवर यावे आणि बालकाची लसींची नोंदणी कार्ड सोबत आणाव्यात.',
    '',
    `*Reminder*`,
    `Patient: ${nameLine}`,
    'Please keep the child ready for the following vaccine visit:',
    list || 'No vaccine scheduled.',
    'Kindly arrive on time and bring the child’s immunization card if available.'
  ].join('\n');
}

export function vaccineReminderText({ patientName, uhid, vaccineName, dueDate, leadDays = 1, source = 'Government Provided', clinicName = 'Dr. Chothe Children Hospital' } = {}) {
  const leadLabel = leadDays === 1 ? '1 day before' : leadDays === 2 ? '2 days before' : leadDays === 0 ? 'today' : 'before the scheduled vaccine day';
  const marathiLeadLabel = leadDays === 1 ? '१ दिवस अगोदर' : leadDays === 2 ? '२ दिवस अगोदर' : leadDays === 0 ? 'आज' : 'नियोजित लसीच्या तारखेपूर्वी';
  return [
    `*${clinicName}*`,
    `स्मरणपत्र: ${patientName || 'रुग्ण'}${uhid ? ` (${uhid})` : ''} च्या लसीसाठी`,
    `लस: ${vaccineName || 'लस'}`,
    `मूल: ${source || 'सरकारी'}`,
    `तारीख: ${dueDate || 'कृपया क्लिनिकमध्ये तपासा'}`,
    `हा पालकांसाठी ${marathiLeadLabel} स्मरणपत्र आहे.`,
    'कृपया बालकास तयार ठेवा आणि लसीसाठी वेळेवर यावे.',
    '',
    `Reminder: Vaccination for ${patientName || 'patient'}${uhid ? ` (${uhid})` : ''}`,
    `Vaccine: ${vaccineName || 'Vaccination'}`,
    `Source: ${source || 'Government Provided'}`,
    `Scheduled date: ${dueDate || 'Please confirm at the clinic'}`,
    `This is a ${leadLabel} reminder for the guardian.`,
    'Please ensure the child is ready and arrives on time for the vaccination.'
  ].join('\n');
}

const ICONS = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  userplus: 'M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M8.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19 8v6M22 11h-6',
  queue: 'M4 6h16M4 12h16M4 18h10',
  users: 'M17 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  chart: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  bed: 'M3 18v-8M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-.01',
  pulse: 'M3 12h4l3 8 4-16 3 8h4',
  check: 'M9 12l2 2 4-4M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
  flask: 'M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3',
  wallet: 'M3 7a2 2 0 0 1 2-2h14v4M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2zM16 14h2',
  menu: 'M4 6h16M4 12h16M4 18h16',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  out: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  plus: 'M12 5v14M5 12h14',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  x: 'M18 6L6 18M6 6l12 12',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2'
};
export const icon = (n, s = 20) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[n] || ICONS.doc}"/></svg>`;

export function toast(msg, type = 'ok') {
  let c = $('#toasts'); if (!c) { c = document.createElement('div'); c.id = 'toasts'; document.body.appendChild(c); }
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg; c.appendChild(t);
  setTimeout(() => t.remove(), 3800);
}

export function modal(html, { wide = false } = {}) {
  const o = document.createElement('div'); o.className = 'overlay';
  o.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(o);
  const close = () => o.remove();
  o.addEventListener('mousedown', e => { if (e.target === o) close(); });
  o.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  return { el: o.firstElementChild, close };
}

export const chip = (txt, cls = '') => `<span class="chip ${cls}">${esc(txt)}</span>`;
export const priorityChip = p => p == 1 ? chip('STAT', 'crit') : p == 2 ? chip('Urgent', 'warn') : chip('Routine', 'info');

export async function audit(api, user, action, ref) {
  try { await api.add('audit', { by: user?.staffId || user?.uid || '?', name: user?.name || '', action, ref: ref || '' }); } catch (e) { /* non-blocking */ }
}
