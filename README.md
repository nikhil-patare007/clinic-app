# Dr. Chothe Children Hospital – Clinic Management App

This project is a lightweight pediatric clinic management app for OPD registration, queue handling, patient records, vaccination reminders, admissions, nursing work, growth tracking, and billing workflows.

It runs as a static HTML/CSS/JavaScript web app, with optional Firebase integration for real-time cloud storage and hosted deployment.

## Features
- OPD registration and patient UHID tracking
- Live queue and consultation workflow
- Customized prescription printing and WhatsApp sharing
- Vaccination due tracking and reminder messaging
- Growth monitoring with chart display
- Admission and nursing management
- Ledger / bills / dues tracking
- Demo mode using browser storage when Firebase is not configured

## Local demo
```bash
cd /Users/nikhilpatare/Documents/clinic-app
python3 -m http.server 8080
```
Then open:
```text
http://localhost:8080
```

The app supports local demo access without Firebase. Demo accounts:
- `DVC-PED-01` / `123456`
- `DVC-NUR-01` / `123456`
- `DVC-REC-01` / `123456`
- `DVC-LAB-01` / `123456`
- `DVC-ADM-01` / `123456`

## Firebase setup
1. Create a Firebase project in the Firebase Console.
2. Enable Email/Password authentication.
3. Create a Firestore database in `asia-south1`.
4. Update `public/js/firebase-config.js` with your project web config.
5. Configure `.firebaserc` with your Firebase project ID.
6. Deploy with:

```bash
npm install
npx firebase login
npx firebase deploy --only hosting,firestore
```

## Staff creation
Use a Firebase service account to create staff users:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=serviceAccount.json
node scripts/create-staff.js DVC-PED-01 "Dr. Chothe" doctor 'ChangeMe123'
node scripts/create-staff.js DVC-NUR-01 "Nurse" nurse 'ChangeMe123'
node scripts/create-staff.js DVC-REC-01 "Reception" reception 'ChangeMe123'
node scripts/create-staff.js DVC-LAB-01 "Lab Technician" lab 'ChangeMe123'
node scripts/create-staff.js DVC-ADM-01 "Admin" admin 'ChangeMe123'
```

Keep the service account JSON private and do not commit it to the repository.

## Project structure
```text
README.md
firebase.json
firestore.rules
firestore.indexes.json
package.json
public/
  css/
  js/
  index.html
scripts/
  create-staff.js
tests/
```

## Notes
- Clinical medication doses and vaccine lists are configurable from the app data files and should be reviewed before live clinical use.
- Growth curve references are approximate and should be validated against the relevant clinical standard used by the hospital.
- The app is designed for rapid local demo use and can be connected to Firebase when production deployment is ready.
