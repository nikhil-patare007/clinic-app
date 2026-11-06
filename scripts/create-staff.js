// Create a staff login + role profile.
//   npm i firebase-admin   (once)
//   GOOGLE_APPLICATION_CREDENTIALS=serviceAccount.json node scripts/create-staff.js DVC-PED-01 "Dr. Vivek Chothe" doctor 'StrongPass123'
// roles: doctor | nurse | reception | lab | admin
const admin = require('firebase-admin');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const [staffId, name, role, password] = process.argv.slice(2);
if (!staffId || !name || !role || !password) { console.error('usage: node create-staff.js <STAFF-ID> "<Name>" <role> <password>'); process.exit(1); }
if (!['doctor', 'nurse', 'reception', 'lab', 'admin'].includes(role)) { console.error('invalid role'); process.exit(1); }

if (!admin.getApps().length) {
  admin.initializeApp({ credential: admin.applicationDefault() });
}

(async () => {
  const auth = getAuth();
  const db = getFirestore();
  const email = `${staffId.trim().toLowerCase()}@dvc-clinic.app`;
  let user;
  try { user = await auth.getUserByEmail(email); await auth.updateUser(user.uid, { password }); }
  catch (e) { user = await auth.createUser({ email, password, displayName: name }); }
  await db.doc(`users/${user.uid}`).set({ staffId: staffId.toUpperCase(), name, role });
  console.log(`OK  ${staffId.toUpperCase()}  (${role})  uid=${user.uid}`);
})().catch(e => { console.error(e); process.exit(1); });
