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
