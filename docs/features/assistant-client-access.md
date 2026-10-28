# Assistant client access

Settings > Assistant Client Access grants individual active virtual assistants
(role `va`) the client roster and the client dashboard: the same screens staff
use. Each grant has a `gapp` or `all` scope and separate `editInfo` and
`uploadDocuments` permissions. Missing settings grant no access, and an
assistant without a grant sees a notice on the client pages instead
(`AssistantAccessGate`). Referral conversion permission remains a separate
setting.

## How the grant reaches the rules (October 2026)

Saving settings mirrors every grant onto the assistant's own profile as
`users/{uid}.clientAccess` (`mirrorAssistantClientAccess`), and clears it from
any VA no longer granted. `firestore.rules` and `storage.rules` read that field
from the profile document they already load for the role:

- `isStaffReader()` (core staff or any granted assistant) gates staff-level
  reads: client records, clinical sub-records, documents, visits, notes,
  MAR, care tasks, handoffs, verbal orders, medication error reports.
- `isStaff()` (core staff or an assistant with `editInfo`) gates creates and
  updates on the records staff maintain: the client directory, clinical
  sub-records (physicians, guardian, support coordinator, day program,
  profile), care tasks, visits, quick notes, document metadata, counters.
- `isCoreStaff()` (admin and supervisor only) gates every delete, plus
  clinical documentation and the clinical regimen: MAR orders, dose and
  treatment charting, medication change requests, seizure events, progress
  note edits, drafts, export audits.
- `hoursAuthorizations`: owner plus a granted assistant (create and update
  with `editInfo`); delete stays owner-only. `billingRates` and the
  `administrativeAudit` stay owner-only.
- The `patients` read rule applies the program scope: a `gapp` grant proves a
  single read or a list query filtered to `program == 'gapp'`
  (`getPatientsForProgram`); `all` proves the unfiltered roster. Sub-records
  and per-client collections are not program-scoped at the rules level; the
  scope is enforced where the roster is listed.
- Storage: a granted assistant reads client files; `uploadDocuments` allows
  uploads. Files stay immutable for everyone.

Server routes the dashboard calls use `requireStaffOrAssistant` from
`adminAuthGuard`: core staff pass; an assistant needs a live grant, `write`
needs `editInfo`, and a DELETE is refused regardless. Opened this way:
communications (read/log), document metadata edit and replace cleanup,
service plan PDF refresh, and visit notifications. Document delete and
move-to-client, service plan authoring, handoff posting, verbal orders, and
medication error reports keep their staff or clinician gates.

## What the assistant sees

The real dashboard: Overview (every card editable with `editInfo`),
Schedule, Trends, Survey Readiness, Documents (upload with
`uploadDocuments`; edit, replace, archive and restore with `editInfo`; no
permanent delete or move), Service Plan (view), Communications, Care Plan,
and Hours. The Hours tab hides the dollar toggle, the billing line amounts,
and the delete button (`canSeeDollars`/`canDelete` props on `HoursSection`),
and never loads billing rates. The Activity Log tab is admin-only. On the
roster she adds and edits clients and sees the hours badges, but has no
Remove button. The records tree (`/admin/records/...`) opens for viewing;
medication management and charting stay with clinicians and admin.

Her edits are ordinary browser writes, so the Activity Log attributes them
through the capture function's auth context (actor role `va`), review-only.

## Admin preview through View As

View As an assistant renders her roster and dashboard with the admin's own
token (reads succeed as the admin) and the usual View As write block, with
`useAssistantGrant` reading the previewed assistant's grant so the gate and
the roster scope match what she sees.

## Validation and deployment

Run TypeScript, Vitest, and the production build. Run
`scripts/test-patient-roster-rules.mjs` against a local Firestore emulator
(the script refuses non-local hosts and non-demo projects). It checks the
staff and nurse roster tiers, the assistant grant (program scope, edit versus
view-only, uploads, hours lines, no deletes, no billing rates, no MAR
writes), and the owner-only audit.

Deploy BOTH `firestore.rules` and `storage.rules` separately after the
application, as documented in `DEPLOY-CHECKLIST.md`. No index change. After
the first deploy, re-save Settings > Assistant Client Access once (or run
`mirrorAssistantClientAccess`) so existing grants are mirrored onto the
profiles; until then a granted assistant is denied by the rules. Use a
synthetic client for any write smoke test.

## Admin activity log and undo

The admin-only Activity Log tab on each client lists assistant changes and
uploads, newest first (50 per page). It shows actor, Eastern US date/time, and
before/after values. Existing assistant audit records are included. This is not
a full historical log of every staff edit predating this feature.

Admin undo runs in one transaction. It checks the administrator is still active,
that the original event has not been reversed, and that each affected document
still has the original commit timestamp and expected values. Later writes to a
related document block undo, even when its current values happen to match again.
Only changed administrative fields are restored; protected clinical values and
guardian contact notes are preserved. Undoing an upload archives its metadata
and keeps its bytes. The existing Documents archive controls can restore it.
Every undo marks the original entry and appends a reversal event with the admin
identity. A reversal cannot itself be undone through this log.

Routes: GET /api/admin/clients/[id]/activity and POST
/api/admin/clients/[id]/activity/[activityId]/undo. No new rules or indexes.

Run the undo transaction integration checks against the local demo emulator:
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8184 GCLOUD_PROJECT=demo-client-access npx vitest run --config scripts/activity-emulator.config.mjs`.
The harness refuses any other host/project and uses only synthetic records.

## Cross-client activity overview

Admins can open Activity Log in the sidebar (`/admin/activity`) to review the
same assistant audit history across clients, filter by staff member (including
inactive accounts), and undo eligible changes without opening a client first.
Each entry and undo confirmation identifies its client. Missing clients have no
undo control. Changing staff resets pagination and any pending confirmation.
This includes existing audit records and admin reversals, not unrelated clinical
or referral edits. The per-client Activity Log remains available.

GET `/api/admin/client-activity` requires an active admin and accepts `staff`
(actor UID) and an opaque `cursor`. It queries the administrativeAudit collection
group, resolves client names, and returns 50 events per page. Deploy the new
collection-group `at` and `actorUid/at` indexes separately and verify READY before
shipping. No permission/rule changes or audit migration are needed.

## All-staff capture (October 2026)

The overview now also displays database-captured creations, edits, and deletions
for admins, supervisors, nurses, and assistants. `functions/` contains the
second-generation Firestore auth-context trigger `captureClientActivity`.
Its allowlist covers patients and clinical subrecords, documents, hours,
progress notes, MAR orders/administrations/change requests, care tasks and their
administrations, visits, quick notes, handoffs, verbal orders, medication error
reports, seizures, service plans/reviews, PPOT, and ROI records with a patientId.
Unrelated organization data and the audit collection itself are excluded.
The event ID deterministically keys the entry, so delivery retries do not
produce duplicate history. Capture is asynchronous; refresh after a moment.

Browser identity comes from the database event's authentication context, never
editable document fields. Server writes carry a fresh `_auditActor` nonce and
verified caller UID through `clientAuditActor`. The trigger does not attribute
later automated writes to an old author. Unattributed/automated events are
explicitly labeled System / unidentified actor. Same-commit existing assistant
and undo events are recognized via auditEventId to avoid duplicate entries.
Hard-deletion identity is recovered from the same-operation deletion snapshot.

Captured clinical entries remain review-only. Basic admin/supervisor edits and
uploads can now be undone under the safeguards described below. Before/after values show changed fields, including nested structures.
Large values are bounded; credentials, signed URLs, binary/signature content are
omitted. Deleted clients retain their captured names in the global log.
No historic before/after values are invented or backfilled.

Deployment: app merge alone does NOT deploy the capture function. Run `npm ci
--prefix functions`, `npm test --prefix functions`, then `npx firebase-tools@latest
deploy --only functions:client-audit:captureClientActivity --project heart-and-soul-hc
--non-interactive --force`. The force flag acknowledges retry billing for this
idempotent function. Verify ACTIVE status and an event from a synthetic client;
never mutate an actual chart for a smoke test. Source tests also run in PR CI.

The runtime uses `client-activity-audit@heart-and-soul-hc.iam.gserviceaccount.com`
with custom role `clientActivityCapture`: datastore.databases.get,
datastore.entities.get, and datastore.entities.create. It cannot update or delete
records. The same identity has Eventarc Event Receiver permission and Run Invoker only
on the capture service. Service-account email principals reported as unknown
by auth-context events are recognized as server principals.

## Client and date filters

The cross-client Activity Log combines Staff, Client, From, and Through filters.
The client selector includes the full current directory, independent of loaded
activity pages. Deleted-client events remain visible under All clients.
Date input is MM/DD/YYYY; Apply dates validates and applies the range. Each
boundary uses midnight in America/New_York with daylight-saving transitions;
Through includes the entire selected day. Either bound may be omitted.

The API also accepts client, from, and through (ISO date-only) parameters.
Client filtering queries the original patient audit subcollection, so older
events without a stored patientId remain searchable. Date and actor predicates
run in Firestore before pagination. Cursors must belong to the selected client,
actor and date range. Filter changes reset pagination and pending undo.
Deploy the COLLECTION actorUid/at index in addition to the existing
COLLECTION_GROUP indexes; no rules changes or data migration are required.

## Undo for admin and supervisor activity

Captured admin/supervisor edits now allow undo of basic directory fields (name,
DOB, address), Medicaid ID, physician contact fields, and eligible guardian
contact-detail edits. Clinical changes, legal decision-maker changes, contact
notes, client creation/deletion, and document edits/replacements remain
review-only. A mixed save reverses only the basic fields listed in confirmation.

Captured patientDocuments creations offer Archive through Undo. Bytes remain
preserved. The transaction verifies patient ownership and exact source update
time against the captured event's at timestamp, not the later audit-write time.
Later edits, including changes reverted back to the same values, block undo.
Each reversal is admin-only, checked against the current active account, and
appends an admin-undo audit entry while marking the original reversed.

The capture function now records changed fields' before/after presence to
distinguish missing from null. Existing complete string-to-string captures and
document creations are eligible; older null/absent captures remain review-only
because their exact prior presence is unknown. Truncated information captures
remain review-only. Guardian reversals preserve notes and must satisfy the
current decision-maker requirements. Deploy both app and capture function.

## Activity change-type filter

The overview supports All changes, Document uploads, Client information updates,
and Undo actions. The type parameter combines with staff/client/date filters.
Uploads include assistant uploads and captured patientDocuments creations.
Information includes assistant updates and captured updates to the directory,
clinical profile, and guardian record; this category does not imply undo eligibility.
Undo actions include every admin-undo entry, including document archival reversals.

Legacy events are classified from their original action/sourcePath without a
migration. Action predicates run in Firestore; path matching runs server-side.
Pagination advances by scanned records, retaining up to 50 matches and scanning
at most 510 candidates per request. Sparse pages can offer Load older activity
to continue searching. Deploy action/at and actorUid/action/at composite indexes
for both COLLECTION and COLLECTION_GROUP scopes. No capture-function change.
