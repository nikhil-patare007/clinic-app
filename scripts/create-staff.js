// Create a staff login + role profile.
//   GOOGLE_APPLICATION_CREDENTIALS=serviceAccount.json node scripts/create-staff.js DVC-PED-01 "Dr. Vivek Chothe" doctor 'StrongPass123'
// roles: doctor | nurse | reception | lab | admin
import { createRequire } from 'node:module';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const [staffId, name, role, password] = process.argv.slice(2);
if (!staffId || !name || !role || !password) { console.error('usage: node create-staff.js <STAFF-ID> "<Name>" <role> <password>'); process.exit(1); }
if (!['doctor', 'nurse', 'reception', 'lab', 'admin'].includes(role)) { console.error('invalid role'); process.exit(1); }

const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
const serviceAccountPath = path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
const serviceAccount = require(serviceAccountPath);
if (!serviceAccount.project_id) { console.error('Missing service account JSON'); process.exit(1); }

initializeApp({ credential: cert(serviceAccount) });

(async () => {
  const auth = getAuth();
  const db = getFirestore();
  const email = `${staffId.trim().toLowerCase()}@dvc-clinic.app`;
  let user;
  try { user = await auth.getUserByEmail(email); await auth.updateUser(user.uid, { password }); }
  catch (e) { user = await auth.createUser({ email, password, displayName: name }); }
  await db.doc(`users/${user.uid}`).set({ staffId: staffId.toUpperCase(), name, role }, { merge: true });
  console.log(`OK  ${staffId.toUpperCase()}  (${role})  uid=${user.uid}`);
})().catch(e => { console.error(e); process.exit(1); });
