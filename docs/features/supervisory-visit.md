# Home Supervisory Visit

The agency's paper "Home Supervisory Visit" form (2 pages, revised), completed
by a nurse supervisor at the client's home. Shipped 09/28/2026 in #229, at the
request of the nurse supervisors.

## Who and where

- Route: `/supervisory-visit` (amend: `/supervisory-visit?edit=<noteId>`).
- Authors: role `supervisor` or `admin` only (`canAuthorSupervisoryVisit`).
  Field staff (role `nurse`) are blocked even with an RN credential.
- Entry points: dashboard card "Home supervisory visit", and the
  "New Supervisory Visit" button on Submissions.

## Storage

- Collection `progressNotes`, `noteType: 'home-supervisory-visit'`
  (`SUPERVISORY_NOTE_TYPE`). Form-specific fields use the `sv_` prefix.
- Shares the note identity keys: `q3_clientName`, `q4_dateofBirth`,
  `q6_dateofService`, `q11_nurseName` (the supervisor), `q12_credential`,
  `q61_signature`, `patientId`.
- Vitals are the shift note's block, unchanged (rev 2, 09/28/2026, after the
  supervisor asked for SpO2): all five vitals with the shift note's keys
  (`q16_temperature` + route, `q17_systolic` / `q17_diastolic` mirrored into
  `q17_bloodPressure`, `q18_pulse` + site, `q19_respiration`,
  `q20_oxygenSaturation` + `q21_oxygenSource`), the "unable to obtain" reasons
  (`q16_vitalsNotObtained*`, `q17_bpNotObtained*`), BP method and site, and
  later rechecks (`q16r_reading{n}_*`). They feed the abnormal-vitals banner,
  flags, trends, and PDF like the shift note's. Rev 1 visits (before
  09/28/2026) hold temperature, BP and pulse only.
- Owner's rule: vitals are captured the same way everywhere. Any new form
  that takes vitals renders `VitalSignsFields` with the shift note's props
  (`required`, `notObtainedReason`, `bpNotObtainedReason`, `bpOptional`,
  `details`) plus `VitalsRecheckSection`; never a subset.
- Draft: nested `supervisory` field on `noteDrafts/{uid}`, beside the shift
  draft and the `oversight` sub-draft (see `drafts.ts`, `saveSubDraft`).
- No Firestore rules or index changes were needed.

## Form rules (`src/lib/supervisoryVisit.ts`)

- Same questions and order as the paper form. Yes/No questions are radios.
- Required: client, date, time in/out, address, staff performing duties,
  supervisor, both client questions ("What would you do if you had a
  complaint?", "Is there anything else you would like to tell me?"), the
  vitals under the shift note's rules (each vital is a reading or the
  "unable to obtain vitals" reason; BP is routinely required from age 3 and
  also satisfied by its own reason; temperature route and oxygen source are
  required once their reading is present), general conditions, client
  progress, every Yes/No answer, interview method (phone / in person),
  signature.
- Explanation boxes required only when the answer calls for one: problems =
  Yes, not satisfied with services, level of care not appropriate, not
  satisfied with staff.
- "Staff performing duties" lists active role-`nurse` users
  (`getActiveFieldStaff`), the client's `assignedNurseIds` first.
- Choosing a client fills the address from the roster.

## Service plan check (rev 3, 09/30/2026)

- A "Service Plan" section before the signature shows the client's plan
  status as of the visit date (`servicePlanStatus` with a 30-day window:
  portal plan and filed "Service Plan" documents, due 62 days after the
  newest).
- Missing, overdue, or due within 30 days: `sv_servicePlanAction` is
  required ("Review the plan now (no changes)", "Revise the plan now", or
  "Write the plan now" when there is no plan in the portal, or "Not today"),
  and "Not today" requires `sv_servicePlanReason`. Current: information only.
- Stamped on the note: `sv_servicePlanStatus`, `sv_servicePlanDue`,
  `sv_servicePlanInPortal`. An amendment keeps the stamp. Rev 1 and 2 visits
  are never asked. The PDF prints a "Service Plan" section.
- After submit, review or revise goes straight to the plan page instead of
  the confirmation page. See docs/features/service-plan.md for the daily
  reminders.

## Credential and co-signature

- The supervisor's name (`q11_nurseName`), license (`q12_credential`, RN
  or LPN) and printed credentials (`sv_credentialsPrinted`, e.g. "DNP, RN")
  all come from the signed-in staff profile and are read-only on the form,
  the same as the progress note. Nothing about who signed is ever typed:
  the profile is the digital signature. A wrong name or credential is fixed
  on the profile under Staff & Roles, not on the form. The PDF and the admin
  view print the credentials as they appear on the profile.
- An RN's supervisory visit needs no co-signature. An LPN's does, by an RN,
  through the same co-sign flow as shift notes (Submissions, Co-sign).
- The rule that decides this is `credentialRequiresCosign` in
  `src/lib/cosignClient.ts`: it reads the credential's tokens, so "DNP, RN"
  is an RN and "LPN, CPR" is an LPN. Every consumer (Submissions flags, the
  co-sign route, the PDF's "RN Co-Signature" block, the admin view) uses it.
  Origin: a supervisor's PDF showed "Pending RN review" because she had
  typed "DNP, RN" into what was then a free-text credential box (09/2026).

## What submit does

1. Saves the note (duplicate check per supervisor + client + date).
2. Files the PDF into the client's Documents under category
   "Supervisory Visit" (`NOTE_DOC_CATEGORY` in `patientDocumentsServer.ts`).
   That feeds the client page's 30-day supervisory currency tile.
3. Marks a `patientVisits` doc completed when it is type `supervisory`,
   status `scheduled`, same client, same date
   (`completeScheduledSupervisoryVisit`). Nothing scheduled is not an error.

Steps 2 and 3 are non-fatal: staff can "Sync Visit Notes" on the Documents tab
or mark the visit on the Schedule tab.

## The filed PDF on the Documents tab

The Documents entry is a snapshot of the note, rendered when it was filed
and re-rendered whenever the note is amended (`fileNoteAsDocument` upserts
by `sourceNoteId`, and stores `sourceNoteType` since 09/2026). Its buttons
(`DocumentsSection.tsx`, `src/lib/noteDocLinks.ts`):

- **Edit** (staff) changes how the entry is listed: title, category, date.
  It does not change the note. Owner's request (09/30/2026), after Edit had
  been removed in favor of Amend Note: both coexist. Edits go through
  `PATCH /api/documents/[id]`, which stamps `detailsEditedAt/By/ByName`, and
  a later re-file (an amendment, Refresh PDF, Refresh Visit PDFs) refreshes
  the PDF but keeps the hand-edited title, category and date
  (`noteDocDetails`). The row shows "details edited by ...".
- **Amend Note** (everyone who can see the tab) opens the note in amend mode
  (`/supervisory-visit?edit=<noteId>`, or `/oversight-note?edit=` for an RN
  oversight visit; entries filed before the type was stored are told apart
  by their category). The date, wording and signature live on the note;
  saving the amendment re-files the PDF.
- **Refresh PDF** (staff) re-renders that one stored PDF from the note as it
  stands, through `/api/documents/file-note`. For when the renderer changed
  after filing, e.g. a PDF still showing "Pending RN review" from before the
  co-sign rule fix.
- **Refresh Visit PDFs** (staff, toolbar, after a confirmation) re-renders
  every oversight and supervisory visit PDF on file for the client in one
  go: `/api/documents/sync-notes` with `refresh: true`
  (`syncNoteDocumentsForPatient`). Plain **Sync Visit Notes** still files
  only notes with no entry yet.

Origin: a supervisor changed the date on the Documents card expecting the
visit to move; the card saved but the note and PDF did not change (09/2026).
The Edit dialog on a note-filed entry now says so in words.

## Elsewhere in the app

- Never counts toward shift or oversight hours or billing (`readShiftWindow`
  returns an empty window; `HoursSection` excludes it).
- Shift-note validation skips it; the shift form refuses to edit it.
- Submissions: purple SUPERVISORY badge, CSV label "Home supervisory visit".
- PDF title "Home Supervisory Visit", filename `Supervisory_Visit_*.pdf`,
  batch export suffix `_supervisory`.

## Related work shipped in the same PR

- `VitalSignsFields` (`progress-note/components/VitalSignsFields.tsx`): the
  shared vitals component used by the supervisory visit and the shift note.
  Props turn on the shift note's extras (not-obtained reasons, BP method/site,
  pulse site, oxygen source, native required).
- Restyled form buttons in `progress-note/page.module.css` (all note forms).
- Abnormal-vitals follow-up on the shift note (`src/lib/vitalsFollowUp.ts`,
  form rev 4): an out-of-range first reading must be rechecked at least 15
  minutes after shift start; if still out of range, the nurse documents an
  action (notified RN supervisor / physician, called 911, or within known
  baseline with the baseline noted). Supervisory visits do not have this gate.

## Related notes

- Per-client vitals baselines: docs/features/vitals-baselines.md (the
  supervisory visit snapshots them like the shift note does).

## Open ideas, not built

- The supervisory visit offers vitals rechecks but does not require one for
  an abnormal first reading (the shift note's rev-4 follow-up gate).

## Tests

`src/lib/supervisoryVisit.test.ts`, `src/app/(marketing)/supervisory-visit/page.test.tsx`.
