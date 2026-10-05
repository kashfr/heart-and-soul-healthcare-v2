# Heart and Soul Healthcare portal

Next.js + Firebase staff portal and marketing site. Merging to `main` deploys
the app to Cloud Run; Firestore rules and indexes deploy separately (see
DEPLOY-CHECKLIST.md). Run `npx tsc --noEmit`, `npm test`, and `npm run build`
before pushing; CI runs the same three. To see what is live, open
https://www.heartandsoulhc.org/api/version (deployed commit, build id, build
time).

## Feature notes

Read the matching note before changing one of these features.

- Home Supervisory Visit form, shared vitals component, abnormal-vitals
  follow-up: docs/features/supervisory-visit.md
- Supervisory visit scheduling (next visit on filing, open visits offered to
  all supervisors, accept, hand-off, daily sweep): docs/features/supervisory-scheduling.md
- Per-client vitals baselines (client record, note snapshot, how the
  ranges are judged): docs/features/vitals-baselines.md
- Service Plan (per-client signed plan, tab + form + PDF filing):
  docs/features/service-plan.md
- Communications log (visit notices word for word, manual log):
  docs/features/communications-log.md
- RN oversight hours (real visit times, billing capped at the monthly
  authorization, non-billable follow-up visits): docs/features/oversight-hours.md
- Sliding scale insulin and meal-anchored medication times (MAR orders,
  dose charting, printed MAR): docs/features/sliding-scale.md
- Fax Center incoming faxes (portal line and added by hand), filing to a
  referral, creating a client record from a referral: docs/features/fax-center-inbound.md
- Declared test account and test client: TEST-ACCOUNT.md
