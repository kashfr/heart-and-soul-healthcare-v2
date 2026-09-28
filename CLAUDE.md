# Heart and Soul Healthcare portal

Next.js + Firebase staff portal and marketing site. Merging to `main` deploys
the app to Cloud Run; Firestore rules and indexes deploy separately (see
DEPLOY-CHECKLIST.md). Run `npx tsc --noEmit`, `npm test`, and `npm run build`
before pushing; CI runs the same three.

## Feature notes

Read the matching note before changing one of these features.

- Home Supervisory Visit form, shared vitals component, abnormal-vitals
  follow-up: docs/features/supervisory-visit.md
- Declared test account and test client: TEST-ACCOUNT.md
