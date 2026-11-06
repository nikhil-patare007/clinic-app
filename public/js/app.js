import { initBackend, MODE } from './db.js';
import * as api0 from './db.js';
import { CLINIC } from './clinic.js';
import { $, $$, esc, icon, toast, debounce, ageText } from './util.js';

const ROLE_LABEL = { doctor: 'Chief Pediatrician', nurse: 'Nursing In-Charge', reception: 'Front Desk', lab: 'Lab / Pathology', admin: 'Administrator' };
// route -> { title, icon, roles, load }
const ROUTES = {
  dashboard: { title: 'Dashboard', icon: 'home', roles: ['doctor', 'nurse', 'reception', 'lab', 'admin'], load: () => import('./pages/dashboard.js') },
  register: { title: 'Registration', icon: 'userplus', roles: ['reception', 'doctor', 'admin'], load: () => import('./pages/register.js') },
  queue: { title: 'OPD Queue', icon: 'queue', roles: ['reception', 'doctor', 'nurse', 'admin'], load: () => import('./pages/queue.js') },
  patients: { title: 'Patients', icon: 'users', roles: ['reception', 'doctor', 'nurse', 'lab', 'admin'], load: () => import('./pages/patients.js') },
  vaccination: { title: 'Vaccination', icon: 'check', roles: ['doctor', 'nurse', 'admin', 'reception'], load: () => import('./pages/vaccination.js') },
  growth: { title: 'Growth Charts', icon: 'chart', roles: ['doctor', 'nurse', 'admin'], load: () => import('./pages/growth.js') },
  admissions: { title: 'Admissions / NICU', icon: 'bed', roles: ['doctor', 'nurse', 'admin', 'reception'], load: () => import('./pages/admissions.js') },
  nursing: { title: 'Nursing & MAR', icon: 'check', roles: ['nurse', 'doctor', 'admin'], load: () => import('./pages/nursing.js') },
  labs: { title: 'Investigations', icon: 'flask', roles: ['lab', 'doctor', 'nurse', 'admin'], load: () => import('./pages/labs.js') },
  ledger: { title: 'Daily Ledger', icon: 'wallet', roles: ['reception', 'admin', 'doctor'], load: () => import('./pages/ledger.js') },
  consult: { title: 'Consultation', icon: 'doc', roles: ['doctor', 'admin'], hidden: true, load: () => import('./pages/consult.js') },
  patient: { title: 'Patient', icon: 'users', roles: ['reception', 'doctor', 'nurse', 'lab', 'admin'], hidden: true, load: () => import('./pages/patients.js') }
};
const MOBILE_TABS = { doctor: ['dashboard', 'queue', 'patients', 'vaccination', 'nursing'], nurse: ['dashboard', 'nursing', 'vaccination', 'admissions', 'patients'], reception: ['dashboard', 'register', 'queue', 'patients', 'vaccination'], lab: ['dashboard', 'labs', 'patients', 'queue'], admin: ['dashboard', 'queue', 'patients', 'vaccination', 'ledger'] };

const ctx = { api: null, user: null, route: '', navigate: p => (location.hash = '#/' + p) };
let cleanup = null, authUnsub = null, alertUnsub = null, navToken = 0;
const root = $('#root');

function brandLogo(size = 56) {
  return `<img class="brand-logo" src="./screen.png" alt="Dr. Chothe Children Hospital logo" width="${size}" height="${size}" draggable="false">`;
}

(async function boot() {
  try {
    ctx.api = await initBackend();
  } catch (e) {
    root.innerHTML = `<div class="login"><div class="card"><h2>Could not start</h2><p class="err-msg">${esc(e.message || e)}</p><p class="muted">Check your internet connection and the Firebase config in <code>js/firebase-config.js</code>.</p></div></div>`;
    return;
  }
  authUnsub = ctx.api.onAuth(u => { ctx.user = u; u && u.role ? showShell() : showLogin(u); });
  window.addEventListener('hashchange', route);
})();

function showLogin(u) {
  cleanup && cleanup(); cleanup = null; alertUnsub && alertUnsub(); alertUnsub = null;
  root.innerHTML = `<div class="login"><div class="card">
    <div class="brand login-brand" style="padding:0 0 18px"><div class="logo-wrap logo-wrap-login">${brandLogo(88)}</div><div><b style="font-size:17px">${esc(CLINIC.name)}</b><span>${esc('Taklimiya, Rahuri · Staff Portal')}</span></div></div>
    <h2 style="margin-bottom:14px">Staff sign in</h2>
    ${u && !u.role ? `<p class="err-msg mb">Signed in, but this account has no staff profile/role yet. Ask the admin to add it (see README).</p>` : ''}
    ${MODE === 'demo' ? `<div class="demo-box mb"><b>DEMO MODE</b> (Firebase not configured – data stays in this browser).<br>Staff ID <code>DVC-PED-01</code> (doctor), <code>DVC-NUR-01</code> (nurse), <code>DVC-REC-01</code> (reception), <code>DVC-LAB-01</code> (lab), <code>DVC-ADM-01</code> (admin) · password <code>123456</code></div>` : ''}
    <form id="lf" class="list">
      <div><label for="sid">Employee ID</label><input id="sid" autocomplete="username" autocapitalize="characters" required placeholder="DVC-PED-01"></div>
      <div><label for="pw">Password / PIN</label><div class="pwwrap"><input id="pw" type="password" autocomplete="current-password" required><button type="button" id="tg">Show</button></div></div>
      <div id="lerr"></div>
      <button class="btn" id="lbtn">${icon('doc', 18)} Sign in</button>
    </form>
    <p class="small muted mt">Authorized clinical personnel only. Emergency: ${CLINIC.phones.join(' / ')}</p>
  </div></div>`;
  $('#tg').onclick = () => { const p = $('#pw'); p.type = p.type === 'password' ? 'text' : 'password'; $('#tg').textContent = p.type === 'password' ? 'Show' : 'Hide'; };
  $('#lf').onsubmit = async e => {
    e.preventDefault(); const b = $('#lbtn'); b.disabled = true; $('#lerr').innerHTML = '';
    try { await ctx.api.signIn($('#sid').value, $('#pw').value); }
    catch (err) { $('#lerr').innerHTML = `<div class="err-msg">Sign-in failed. Check Employee ID and password.</div>`; b.disabled = false; }
  };
}

function showShell() {
  const role = ctx.user.role;
  const nav = Object.entries(ROUTES).filter(([, r]) => !r.hidden && r.roles.includes(role));
  const tabs = (MOBILE_TABS[role] || []).filter(k => ROUTES[k].roles.includes(role));
  root.innerHTML = `<div class="app">
    <aside class="sidebar" id="sb">
      <div class="brand"><div class="logo-wrap">${brandLogo(52)}</div><div><b>${esc(CLINIC.short)}</b><span>Children Hospital</span></div></div>
      <div class="nav-label">Clinical modules</div>
      <nav class="nav">${nav.map(([k, r]) => `<a href="#/${k}" data-k="${k}">${icon(r.icon)} ${r.title}</a>`).join('')}</nav>
      <div class="side-foot"><b>${esc(CLINIC.qual)}</b><br>${esc(CLINIC.reg)}<br>SOS: ${CLINIC.phones.join(' / ')}</div>
    </aside>
    <div class="main">
      ${MODE === 'demo' ? `<div class="mode-banner">DEMO MODE – data is stored only in this browser. Add your Firebase config to go live. <a href="#" id="resetDemo">Reset demo data</a></div>` : ''}
      <div id="alertbar"></div>
      <header class="topbar">
        <button class="btn ghost burger" id="burger" aria-label="Menu">${icon('menu')}</button>
        <div class="gsearch">${icon('search')}<input id="gs" placeholder="Search patient by name, mobile, UHID…" autocomplete="off"><div class="gresults hidden" id="gr"></div></div>
        <div class="grow"></div>
        <div class="userchip"><div class="who"><b>${esc(ctx.user.name)}</b><div class="small muted">${esc(ROLE_LABEL[role] || role)}</div></div><div class="avatar">${esc((ctx.user.name || '?').replace(/^(Dr\.|Sister)\s*/, '')[0])}</div>
        <button class="btn ghost sm" id="logout" aria-label="Sign out">${icon('out', 18)}</button></div>
      </header>
      <main class="view" id="view"></main>
    </div>
    <nav class="bottomnav">${tabs.map(k => `<a href="#/${k}" data-k="${k}">${icon(ROUTES[k].icon, 22)}${ROUTES[k].title.split(' ')[0]}</a>`).join('')}<button id="more">${icon('menu', 22)}More</button></nav>
  </div>`;
  $('#burger').onclick = $('#more').onclick = () => $('#sb').classList.toggle('open');
  $('#sb').addEventListener('click', e => { if (e.target.closest('a')) $('#sb').classList.remove('open'); });
  $('#logout').onclick = () => ctx.api.signOut();
  const rd = $('#resetDemo'); if (rd) rd.onclick = e => { e.preventDefault(); ctx.api.resetDemo(); location.hash = '#/dashboard'; location.reload(); };
  wireSearch(); watchAlerts();
  if (!location.hash || location.hash === '#/' ) location.hash = '#/dashboard'; else route();
}

function wireSearch() {
  const gs = $('#gs'), gr = $('#gr');
  const run = debounce(async () => {
    const q = gs.value.trim().toLowerCase();
    if (q.length < 2) return gr.classList.add('hidden');
    const all = await ctx.api.query('patients');
    const hits = all.filter(p => [p.name, p.mobile, p.uhid, p.address].some(v => String(v || '').toLowerCase().includes(q))).slice(0, 8);
    gr.innerHTML = hits.length ? hits.map(p => `<a href="#/patient/${p.id}"><b>${esc(p.name)}</b> <span class="muted small">${esc(p.uhid)} · ${ageText(p.dob)} · ${esc(p.mobile || '')}</span></a>`).join('') : `<div class="empty" style="border:0">No match</div>`;
    gr.classList.remove('hidden');
  }, 200);
  gs.addEventListener('input', run);
  gr.addEventListener('click', () => { gr.classList.add('hidden'); gs.value = ''; });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); gs.focus(); } });
}

function watchAlerts() {
  alertUnsub && alertUnsub();
  alertUnsub = ctx.api.watch('alerts', [['active', true]], list => {
    const bar = $('#alertbar'); if (!bar) return;
    const a = list.sort((x, y) => y.createdAt - x.createdAt)[0];
    bar.innerHTML = a ? `<div class="alert-banner">${icon('alert')}<span>CODE RED · ${esc(a.bed || '')} ${esc(a.name || '')} – ${esc(a.msg || 'Crash call')} (by ${esc(a.by)})</span><button class="btn ghost sm" style="background:#fff" id="ackAlert">Acknowledge</button></div>` : '';
    const b = $('#ackAlert'); if (b) b.onclick = () => ctx.api.update('alerts', a.id, { active: false });
  });
}

async function route() {
  if (!ctx.user || !ctx.user.role) return;
  const [key, ...params] = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
  const def = ROUTES[key] || ROUTES.dashboard;
  const myToken = ++navToken;
  cleanup && cleanup(); cleanup = null;
  $$('.nav a, .bottomnav a').forEach(a => a.classList.toggle('on', a.dataset.k === key || (key === 'consult' && a.dataset.k === 'queue') || (key === 'patient' && a.dataset.k === 'patients')));
  const old = $('#view'); if (!old) return;
  const view = old.cloneNode(false); old.replaceWith(view); // fresh node => page listeners never leak between routes
  if (!def.roles.includes(ctx.user.role)) { view.innerHTML = `<div class="empty">Your role (${esc(ctx.user.role)}) doesn't have access to this module.</div>`; return; }
  view.innerHTML = `<div class="muted">Loading…</div>`;
  document.title = def.title + ' · ' + CLINIC.short;
  try {
    const mod = await def.load();
    if (myToken !== navToken) return;
    view.innerHTML = '';
    ctx.route = key;
    const fn = key === 'patient' ? mod.renderProfile : mod.render;
    const c = await fn(view, params, ctx);
    if (myToken !== navToken) { c && c(); return; }
    cleanup = c || null;
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="err-msg">Something went wrong loading this page: ${esc(e.message || e)}</div>`;
  }
}
void api0; void toast;
