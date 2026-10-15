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

Editable information is explicitly limited to name, birth date, address, Medicaid
ID, physician contact information, and parent/guardian contact details. Clinical
instructions, diagnoses, vital baselines, care teams, program classification,
billing authorizations, and client deletion are unavailable. Guardianship decisions
and existing contact records cannot be removed through this workspace.

Updates use a revision of the directory, clinical profile, and guardian records
to reject stale forms. Every write rechecks role, grant, and program inside its
transaction, and records the actor and before/after administrative values under
`patients/{id}/administrativeAudit`. Only active admins can read this audit;
browser writes are always denied, so the history remains server-managed.
Document uploads always create new files and
metadata; the assistant cannot replace, archive, move, or delete existing files.
Downloads are authenticated byte responses with no shared token URL.

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
