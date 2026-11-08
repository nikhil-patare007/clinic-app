# DVC Clinic App – fix pack

Instructions for Copilot / developer: copy every file in this folder over the same path in the `clinic-app` project
(files are complete, drop-in replacements – no manual merging). Then run:

```bash
npm test                                   # 16 tests should pass
npx firebase deploy --only firestore:rules # REQUIRED: adds the medicines collection + delete permissions
npx firebase deploy --only hosting
```

## New files
- `public/js/pages/medicines.js` – Medicines module (search, add, edit, delete, optional starter list)
- `public/js/pages/export.js` – Export module (last 7 days / last month / last year / custom range, CSV + print)
- `public/js/cascade.js` – delete patient everywhere (+ orphan clean-up helpers)
- `public/studi0z.svg` – studi0z logo (clean vector, transparent background)
- `tests/features.test.js` – tests for the new logic

## Changed files
- `public/js/app.js` – routes `medicines`, `export` (doctor + admin); studi0z credit on login + sidebar footer
- `public/js/util.js` – icons (pill, download, trash, edit) and `studioBrand()`
- `public/js/clinic.js` – new IAP schedule from the PDF (`VACCINES`, `vaccineDueDate`, `getVaxEntry`…), finer growth reference table
- `public/js/pages/consult.js` – Rx "Medicine list" dropdown + datalist fed from the `medicines` collection (live), autofills dose/frequency/days/note, "Save to list"
- `public/js/pages/patients.js` – Delete button on each patient row; delete uses full cascade; new vaccination tab (same help text kept) with optional dose/route details
- `public/js/pages/vaccination.js` – vaccination page uses the new schedule and per-vaccine Govt/Private defaults
- `public/js/pages/queue.js`, `dashboard.js`, `ledger.js` – ignore (and for doctor/admin, purge) visits whose patient no longer exists
- `public/js/pages/growth.js` – improved growth chart (see below)
- `public/css/style.css` – styles for all of the above
- `firestore.rules` – `medicines` rules; doctor/admin may delete patients and linked records; growth delete for doctor/nurse/admin
- `package.json` – `npm test` script

## Behaviour notes
- Deleting a patient removes: patient, visits (OPD queue), growth, labs, admissions (+ their MAR, vitals, code-red alerts).
  Children are deleted first and the patient last, so a failed delete can simply be retried.
- Visits left behind by OLDER deletes disappear from queue/dashboard/ledger immediately and are purged when a doctor/admin opens the OPD queue.
  Each patient is re-checked in the database before anything is purged.
- Vaccines already marked as given under the old schedule names keep showing as given (legacy key mapping in `clinic.js`).
- Chart reference values are still APPROXIMATE WHO values – replace with the official WHO LMS tables for clinical-grade z-scores.
