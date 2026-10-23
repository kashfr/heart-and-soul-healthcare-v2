# Assistant client access

Settings > Assistant Client Access grants individual active VAs access to a client
workspace at the existing `/admin/clients` URLs. Each grant has a `gapp` or `all`
scope and separate `editInfo` and `uploadDocuments` permissions. Viewing client
information and active documents is included. Missing settings grant no access.
New GAPP clients are automatically included in a GAPP grant. Referral conversion
permission remains a separate setting.

The VA branch mounts before the clinical dashboard or staff roster, so it never
loads the clinical chart, medication records, or staff management controls. All
assistant client operations go through `/api/assistant/clients`; these endpoints
verify the active VA, current grant, and actual client program server-side.
Direct Firestore patient reads are reserved for active care staff, so VAs cannot
bypass the program scope using the browser SDK. Existing referral APIs continue
to work independently. Clinical and Storage rules are not broadened.

Editable information is name, birth date, address, Medicaid ID, attending
physician contact information, diagnosis (on the roster record), and allergies
(on the clinical profile). Clinical instructions (diet), vital baselines, care
teams, program classification, billing rates, hours worked, and client deletion
are unavailable.

## Overview cards and hours authorizations (October 2026)

With `editInfo`, the assistant also sees and edits the staff Overview cards:
Physicians, Guardian (including the legal decision maker and removing
contacts), Support Coordinator, and Day Program. They are the same components
the staff dashboard uses, given a `store` prop that routes through
`/api/assistant/clients/[id]/records/[kind]` instead of Firestore. The server
validates with the same shared `validate*`/`normalize*` functions, full-replaces
the document as the staff card does, refuses a stale revision (document update
time), and audits before/after as `assistant-record-update`.

The Hours Authorizations list from the owner-only Hours tab is available too
(`/api/assistant/clients/[id]/authorizations`): add and edit lines transcribed
from a Letter of Notification or Therap line. No hours worked, units used,
billing rates, or dollars are ever returned, and there is no delete. A line id
belonging to another client is "not found". Audited as
`assistant-authorization-create` / `-update`.

In the admin Activity Log, card and authorization saves display every field and
are review-only (no Undo). Diagnosis and allergy edits undo like the other
information fields.

Updates use a revision of the directory and clinical profile records to reject
stale forms. Every write rechecks role, grant, and program inside its
transaction, and records the actor and before/after administrative values under
`patients/{id}/administrativeAudit`. Only active admins can read this audit;
browser writes are always denied, so the history remains server-managed.
Document uploads always create new files and
metadata; the assistant cannot replace, archive, move, or delete existing files.
Downloads are authenticated byte responses with no shared token URL.

## Admin preview through View As

An admin previewing an assistant through View As sees the assistant's own
Clients workspace: the roster, each client page, and documents, scoped by the
assistant's live grant. The admin's token can never be an assistant, so
`authedFetch` adds an `X-View-As` header naming the previewed uid on GET and
HEAD requests only, and `requireAssistant` honors it only from an active admin.
The server reloads the target's profile (must be an active `va`) and
re-derives the grant from current settings, exactly as it would for the
assistant herself. Every write path refuses while a preview context is
present, in addition to the browser-side View As refusal, and the Edit and
Upload controls render disabled with a read-only hint. Without a grant the
preview says so and points to Settings > Assistant Client Access.

## Validation and deployment

Run TypeScript, Vitest, and the production build. Run
`scripts/test-patient-roster-rules.mjs` against a local Firestore emulator (the
script refuses non-local hosts and non-demo projects). It checks nurse/staff
roster access and VA, inactive, anonymous, and missing-profile denials. It also
checks admin-only audit reads and rejects every browser audit mutation.

Deploy `firestore.rules` separately after the application, as documented in
`DEPLOY-CHECKLIST.md`. No index or Storage rule change is needed. Use a synthetic
client for any write/upload smoke tests; never alter a real clinical chart just
to test access. Enable real staff grants only for the user-requested scope.

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
