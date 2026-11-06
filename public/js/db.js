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
      const fresh = seed();
      if (!saved) return fresh;
      localStorage.setItem(KEY, JSON.stringify(fresh));
      return fresh;
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
    return {
      patients: {},
      visits: {},
      growth: {},
      admissions: {},
      mar: {},
      vitals: {},
      labs: {},
      ledger: {},
      counters: { uhid: { n: 0 } },
      alerts: {},
      audit: {}
    };
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
