// Data layer. Same API for real Firebase and the offline DEMO mode.
import { FIREBASE_CONFIG } from './firebase-config.js';

const configured = !!(FIREBASE_CONFIG.apiKey && !String(FIREBASE_CONFIG.apiKey).startsWith('YOUR_'));
export const MODE = configured ? 'firebase' : 'demo';
export let api = null;

export async function initBackend() {
  api = configured ? await makeFirebase() : makeLocal();
  return api;
}

const emailFor = id => `${String(id).trim().toLowerCase()}@dvc-clinic.app`;

/* ---------------- Firebase ---------------- */
async function makeFirebase() {
  const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const [{ initializeApp }, A, F] = await Promise.all([
    import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')
  ]);
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = A.getAuth(app);
  let db;
  try {
    db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch (e) { db = F.getFirestore(app); }

  const mk = (col, where) => F.query(F.collection(db, col), ...(where || []).map(w => F.where(w[0], '==', w[1])));
  const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const clean = o => JSON.parse(JSON.stringify(o));

  return {
    mode: 'firebase',
    async signIn(staffId, password) { await A.signInWithEmailAndPassword(auth, emailFor(staffId), password); },
    signOut: () => A.signOut(auth),
    onAuth(cb) {
      return A.onAuthStateChanged(auth, async u => {
        if (!u) return cb(null);
        try {
          const s = await F.getDoc(F.doc(db, 'users', u.uid));
          cb(s.exists() ? { uid: u.uid, ...s.data() } : { uid: u.uid, name: u.email, role: null });
        } catch (e) { cb({ uid: u.uid, name: u.email, role: null }); }
      });
    },
    async add(col, data) { const r = await F.addDoc(F.collection(db, col), clean({ ...data, createdAt: Date.now() })); return r.id; },
    async set(col, id, data) { await F.setDoc(F.doc(db, col, id), clean(data), { merge: true }); },
    async update(col, id, data) { await F.updateDoc(F.doc(db, col, id), clean(data)); },
    async delete(col, id) { await F.deleteDoc(F.doc(db, col, id)); },
    async get(col, id) { const s = await F.getDoc(F.doc(db, col, id)); return s.exists() ? { id: s.id, ...s.data() } : null; },
    async query(col, where) { return rows(await F.getDocs(mk(col, where))); },
    watch(col, where, cb) { return F.onSnapshot(mk(col, where), s => cb(rows(s)), e => console.error('watch', col, e)); },
    async counter(name) {
      const ref = F.doc(db, 'counters', name);
      return F.runTransaction(db, async tx => {
        const s = await tx.get(ref); const n = (s.exists() ? s.data().n : 0) + 1;
        tx.set(ref, { n }); return n;
      });
    }
  };
}

/* ---------------- Demo (localStorage) ---------------- */
function makeLocal() {
  const KEY = 'dvc_demo_db_v1', SESSION = 'dvc_demo_session';
  const USERS = {
    'DVC-PED-01': { name: 'Dr. Vivek G. Chothe', role: 'doctor' },
    'DVC-NUR-01': { name: 'Sister Anita Roy', role: 'nurse' },
    'DVC-REC-01': { name: 'Reception Desk', role: 'reception' },
    'DVC-LAB-01': { name: 'Lab Technician', role: 'lab' },
    'DVC-ADM-01': { name: 'Admin', role: 'admin' }
  };
  let data = load();
  const subs = new Set(), authCbs = new Set();
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (!saved) return seed();
      const cleaned = { ...saved, labs: {} };
      localStorage.setItem(KEY, JSON.stringify(cleaned));
      return cleaned;
    } catch (e) { return seed(); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const col = c => (data[c] = data[c] || {});
  const match = (d, where) => (where || []).every(w => d[w[0]] === w[1]);
  const list = (c, where) => Object.entries(col(c)).map(([id, d]) => ({ id, ...d })).filter(d => match(d, where));
  const notify = () => subs.forEach(s => s());
  const clone = x => JSON.parse(JSON.stringify(x));

  function seed() {
    const now = Date.now(), d = new Date(), today = d.toISOString().slice(0, 10);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const ago = (y, m) => { const x = new Date(); x.setFullYear(x.getFullYear() - y); x.setMonth(x.getMonth() - m); return x.toISOString().slice(0, 10); };
    const s = { patients: {}, visits: {}, growth: {}, admissions: {}, mar: {}, vitals: {}, labs: {}, ledger: {}, counters: { uhid: { n: 3 }, ['token-' + local]: { n: 3 } }, alerts: {}, audit: {} };
    s.patients.p1 = { uhid: 'DVC-2026-0001', name: 'Aarav Sachin Patil', dob: ago(0, 2), gender: 'Male', weight: 8.6, guardian: 'Sachin Patil (Father)', mobile: '9890422109', address: 'Rahuri Factory', birthWt: 3.1, gestation: 'Term (39w)', allergies: 'None', vaccines: {}, createdAt: now };
    s.patients.p2 = { uhid: 'DVC-2026-0002', name: 'Kabir Vishal Shinde', dob: ago(0, 9), gender: 'Male', weight: 8.1, guardian: 'Vishal Shinde (Father)', mobile: '9421500000', address: 'Taklimiya', birthWt: 2.9, gestation: 'Term (38w)', allergies: 'Penicillin', vaccines: {}, createdAt: now };
    s.patients.p3 = { uhid: 'DVC-2026-0003', name: 'Baby of Pooja Shinde', dob: ago(0, 0), gender: 'Female', weight: 2.8, guardian: 'Pooja Shinde (Mother)', mobile: '9922184910', address: 'Rahuri', birthWt: 2.8, gestation: 'Term (37w)', allergies: 'None', vaccines: {}, createdAt: now };
    const v = (id, p, tok, st, cc, pr, fee, paid, mode) => s.visits[id] = { patientId: p, patientName: s.patients[p].name, uhid: s.patients[p].uhid, token: tok, tokenLabel: 'OPD-' + String(tok).padStart(3, '0'), date: local, type: 'new', complaints: cc, priority: pr, route: 'opd', status: st, fee, paidAmount: paid, mode, createdAt: now - tok * 600000 };
    v('v1', 'p1', 1, 'waiting', ['Cold / Cough', 'High Fever'], 3, 600, 600, 'cash');
    v('v2', 'p2', 2, 'waiting', ['Vomiting', 'Loose Motions'], 2, 600, 0, 'cash');
    v('v3', 'p3', 3, 'waiting', ['Routine Checkup'], 3, 600, 600, 'upi');
    s.growth.g1 = { patientId: 'p1', date: ago(2, 0), ageMonths: 16, weight: 10.6, height: 79, hc: 47, createdAt: now };
    s.growth.g2 = { patientId: 'p1', date: ago(1, 0), ageMonths: 28, weight: 12.6, height: 88, hc: 48.4, createdAt: now };
    s.growth.g3 = { patientId: 'p1', date: ago(0, 0), ageMonths: 40, weight: 14.2, height: 96, hc: 49.5, createdAt: now };
    s.admissions.a1 = { patientId: 'p3', name: 'Baby of Pooja Shinde', ageText: 'Day 3', weight: 2.8, gestation: 'Term', bed: 'NICU-2', ward: 'NICU', dx: 'Neonatal jaundice', status: 'active', admittedAt: now - 2 * 86400000, photo: { start: now - 5 * 3600000 }, createdAt: now };
    s.admissions.a2 = { patientId: 'p2', name: 'Kabir Vishal Shinde', ageText: '1y 8m', weight: 10.5, gestation: '', bed: 'WARD-3', ward: 'IPD', dx: 'Acute gastroenteritis, mild dehydration', status: 'active', admittedAt: now - 86400000, createdAt: now };
    const t = h => { const x = new Date(); x.setHours(h, 0, 0, 0); return x.getTime(); };
    s.mar.m1 = { admissionId: 'a1', patientName: 'Baby of Pooja Shinde', bed: 'NICU-2', drug: 'Inj. Ampicillin 75mg', detail: 'IV slow infusion in 5ml NS over 15 min', dueAt: now - 600000, kind: 'scheduled', status: 'pending', createdAt: now };
    s.mar.m2 = { admissionId: 'a1', patientName: 'Baby of Pooja Shinde', bed: 'NICU-2', drug: 'Eye shield & phototherapy check', detail: 'q2h round, lamp distance 45 cm', dueAt: now + 3600000, kind: 'scheduled', status: 'pending', createdAt: now };
    s.mar.m3 = { admissionId: 'a2', patientName: 'Kabir Vishal Shinde', bed: 'WARD-3', drug: 'Syp. Ondansetron 2mg (5 ml of 2mg/5ml → 2.5 ml)', detail: '15 min before feeds', dueAt: now + 1800000, kind: 'scheduled', status: 'pending', createdAt: now };
    s.mar.m4 = { admissionId: 'a2', patientName: 'Kabir Vishal Shinde', bed: 'WARD-3', drug: 'Syp. Paracetamol 250mg/5ml – 2.1 ml', detail: 'If Temp > 100°F, min 4h gap', dueAt: t(0), kind: 'sos', status: 'pending', createdAt: now };
    s.vitals.vt1 = { admissionId: 'a1', hr: 148, rr: 44, spo2: 97, temp: 98.4, crt: 2, urine: 2.1, bili: 14.6, by: 'Sister Anita Roy', createdAt: now - 3600000 };
    s.vitals.vt2 = { admissionId: 'a2', hr: 122, rr: 32, spo2: 98, temp: 99.1, crt: 2, urine: 1.2, by: 'Sister Anita Roy', createdAt: now - 7200000 };
    void today; return s;
  }

  return {
    mode: 'demo',
    async signIn(staffId, pass) {
      const u = USERS[String(staffId).trim().toUpperCase()];
      if (!u || pass !== '123456') throw { code: 'auth/invalid-credential' };
      localStorage.setItem(SESSION, String(staffId).trim().toUpperCase());
      authCbs.forEach(cb => cb({ uid: staffId, staffId, ...u }));
    },
    async signOut() { localStorage.removeItem(SESSION); authCbs.forEach(cb => cb(null)); },
    onAuth(cb) {
      authCbs.add(cb);
      const id = localStorage.getItem(SESSION);
      setTimeout(() => cb(id && USERS[id] ? { uid: id, staffId: id, ...USERS[id] } : null), 0);
      return () => authCbs.delete(cb);
    },
    async add(c, d) { const id = uid(); col(c)[id] = clone({ ...d, createdAt: Date.now() }); save(); notify(); return id; },
    async set(c, id, d) { col(c)[id] = { ...(col(c)[id] || {}), ...clone(d) }; save(); notify(); },
    async update(c, id, d) { if (!col(c)[id]) throw new Error('not found'); col(c)[id] = { ...col(c)[id], ...clone(d) }; save(); notify(); },
    async delete(c, id) { if (!col(c)[id]) throw new Error('not found'); delete col(c)[id]; save(); notify(); },
    async get(c, id) { return col(c)[id] ? { id, ...clone(col(c)[id]) } : null; },
    async query(c, w) { return clone(list(c, w)); },
    watch(c, w, cb) {
      const fire = () => cb(clone(list(c, w)));
      subs.add(fire); setTimeout(() => { if (subs.has(fire)) fire(); }, 0);
      return () => subs.delete(fire);
    },
    async counter(name) { const c = col('counters'); c[name] = { n: (c[name]?.n || 0) + 1 }; save(); return c[name].n; },
    resetDemo() { localStorage.removeItem(KEY); data = seed(); save(); notify(); }
  };
}
