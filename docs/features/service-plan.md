# Service Plan

The agency's paper "Service Plan" form (2 pages, revised): the services a
client receives, how often and for how long, diet and personal-care answers,
goals and objectives, medications, and discharge plans, signed by the
supervisor. Built 09/28/2026 at the owner's request.

## Who and where

- Tab "Service plan" on the client dashboard (`?tab=serviceplan`), visible
  to everyone who can open the client page. It shows the current (newest)
  plan in full, chips for every earlier plan, "View PDF", and the author
  button.
- Form: `/admin/clients/{patientId}/service-plan/new`
  (`?from=<planId>` starts from a specific earlier plan). Authors: role
  `supervisor` or `admin`, never during view-as.
- Every submission is a new, signed, immutable plan. The newest plan is the
  current one; earlier plans stay on record and are marked superseded.
- Review, no changes: `/admin/clients/{patientId}/service-plan/review`.
  Same authors. See "Reviews" below.

## How often (the rule)

Ga. Comp. R. and Regs. 111-8-65-.11(2): the plan is completed within 7
working days of starting services; nursing service plans are reviewed and
updated at least every 62 days; parts are revised whenever an item on the
plan changes. GAPP manual section 916 adds a minimum of once per renewal
period and asks for the RN's and the caregiver's signatures. The 62-day rule
is the stricter one and drives the readiness clock (`SERVICE_PLAN_MAX_DAYS`).

## Reviews ("reviewed, no changes")

Decided with the owner on 09/28/2026: a routine 62-day review with nothing to
change does not write a new plan and does not re-file the full plan PDF.

- Only the current (newest) plan can be reviewed; the server refuses an
  older one.
- The review page compares the plan to today's record (`planDifferences`):
  diagnosis, allergies and diet on the client record, active MAR orders not
  named in the plan's medications, plan medications whose orders are no
  longer active, and approved care-plan tasks not named in the description
  of services. Case and punctuation are ignored; blank record fields are
  skipped. Any difference shows a "Revise the plan instead" button; the
  reviewer may still sign, but must explain in the note why the plan stands,
  and the listed differences are saved with the review.
- Stored at `servicePlans/{planId}/reviews/{reviewId}` (server-only).
- Files a one-page "Service Plan Review" PDF under the "Service Plan"
  document category, dated the review, which restarts the readiness clock.
  The plan PDF gains a "Reviews Since Signing" log.
- The tab shows the reviews, "last reviewed", and "next review due by" (red
  once overdue).

## Storage

- Top-level collection `servicePlans`, one doc per signed plan. Server-only
  in `firestore.rules` (explicit deny); every read and write goes through
  `/api/service-plans` (GET list by client, POST sign) and
  `/api/service-plans/{id}/pdf`. A nurse is checked against the client's
  `assignedNurseIds` on every request (`canReadServicePlans`).
- `clientName` and `dob` are snapshotted from the client record by the
  server; the form never sends them. `signedDate` is the agency-local date
  at signing. `revisesPlanId` links a revision to the plan it started from.
- Listing sorts in memory, so no composite index is needed.
- Signing renders the PDF (`src/lib/pdf/ServicePlanPDF.tsx`, letterhead
  style) and files it under the client's Documents in the new category
  "Service Plan" (`patientDocuments` doc carries `servicePlanId` and
  `autoFiled`). Filing is non-fatal: the plan exists even if the PDF step
  fails, and the PDF can always be opened from the tab.

## Form rules (`src/lib/servicePlanShared.ts`)

- Same lines and order as the paper form. Types of services and special
  diets are chip toggles; Regular diet, Tub bath, Bed bath and Applying
  lotion to back are Yes/No.
- Required: address, diagnosis, functional limitations, at least one type
  of service, nutritional needs, allergies, times and frequency, expected
  duration, description of services, regular diet, the three personal-care
  answers, at least one goal with its objective (a used row needs both
  halves; blank spare rows are ignored), medications, discharge plans,
  supervisor name and credentials, signature. Optional: special diet boxes
  and "other", special treatments, special equipment, behaviors.
- Prefill for a first plan: address and diagnosis from the client record,
  allergies and diet from the clinical profile, medications from the active
  MAR orders, description of services from the approved active care-plan
  tasks. A revision starts from the earlier plan; "Refresh from the MAR" and
  "Use the approved care-plan tasks" buttons re-pull those two fields.
  Signer name and credentials come from the profile; the signature is
  always fresh.
- "Plan developed with" (optional): client, responsible party / caregiver,
  personal physician, plus names. Cleared on a revision.
- Caregiver signature (optional, for GAPP section 916): printed name,
  relationship, signature. A name needs a signature and vice versa. Cleared
  on a revision.
- Blocked submits outline and escort to the first field, with the list of
  issues at the top (`applyFieldErrors` pattern, ids `sp-field-*`).

## Elsewhere in the app

- Survey readiness: "Service plan" card and an Overview alert from the
  newest "Service Plan" document (a signed plan or a review), 62 days.
- Documents tab: the filed PDFs show a "From service plan" or "From plan
  review" chip. Like the
  other auto-filed PDFs, Replace and Move are hidden (Edit, Archive and
  Delete remain); the admin delete confirmation explains the signed plan
  stays on the tab.

## PDF gotchas

- react-pdf resolves a unitless `lineHeight` against its default 18 pt font
  size when the style inherits its size from the page, so 1.3 came out as
  23.4 pt. Every style with a `lineHeight` sets `fontSize` explicitly.
- Multi-line values render one `Text` per line (`Lines`), and
  `hyphenationCallback` keeps whole words (the default split "in-juries").
- The PDF is rebuilt from the record on every "View PDF"; the copy filed
  under Documents is the one rendered at signing.

## Tests

`src/lib/servicePlanShared.test.ts`, `src/lib/pdf/servicePlanPdfRender.test.tsx`,
`src/app/(app)/admin/clients/[patientId]/ServicePlanSection.test.tsx`.
