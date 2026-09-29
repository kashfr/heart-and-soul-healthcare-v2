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
