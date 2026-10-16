# RN Oversight Visit Note: vitals and location

The form is `/oversight-note` (amend: `?edit=<noteId>`), stored in
`progressNotes` with `noteType: 'rn-oversight-visit'`; rules in
`src/lib/oversightNote.ts`. Billing and visit times: see oversight-hours.md.

## Vitals (form rev 3, 10/13/2026)

- Origin: an RN recorded vitals inside General Condition because the form
  had no vitals block (10/06/2026 visit). DBHDD policy 02-808 A.1.a.ii
  requires a monthly face-to-face physical assessment with "subjective and
  objective data"; no manual names vitals as a line item, but the owner
  chose to require them.
- The shift note's block, unchanged (the owner's rule, see
  supervisory-visit.md): `VitalSignsFields` with `notObtainedReason`,
  `bpNotObtainedReason` / `bpOptional` by age, `details`, plus
  `VitalsRecheckSection`. Same keys (`q16_*` to `q21_*`, `q16r_*`), same
  rules as the supervisory visit, same baseline snapshot (`q16b_*`) on
  client select. It sits in section 1, after General Condition.
- Required only on rev 3 notes. An amendment keeps the note's stored
  `q1_formRev`, so a rev 2 visit is never made to add readings that were
  never taken (the block shows, optional).
- The PDF and admin view print the shared Vital Signs block (it renders for
  any note type with vitals), after the oversight sections.

## Location (rev 3)

- DBHDD 02-808 A.9.b.iii, COMP Part III 2903.1.3 and Part II 1105.2.2.3 ask
  for the "location where the service was delivered", not an address; QEPR
  billing validation fails "Location missing or not allowable". So no
  street address on the note.
- Dropdown `ov_locationChoice`: Client's Home, Day Program, Other (Other
  requires `ov_locationOther`). The printed value stays `ov_location` (the
  choice, or the typed place), so PDFs, the admin view and exports did not
  change.
- Older free-text notes map onto the dropdown when amended
  (`locationChoiceFor`: any "home" wording to Client's Home, "day program"
  to Day Program, anything else to Other with the text kept).

## Orders and MAR answers (rev 3)

- "Orders verified for every medication" and "MAR reviewed against each
  order" no longer offer a bare "No". The choices are Yes, "Reviewed,
  discrepancies found (list in notes)", "Not reviewed (explain in notes)",
  and N/A. Either of the middle two makes the medication notes required.
- Origin (10/13/2026): an RN's notes showed she did the reviews and found
  real gaps, but answered "No", which reads as "did not review" to a QEPR
  reviewer. Six of her seven October visits answered "No" on orders.
- A stored "No" (pre-rev-3 note) still shows as a selected option when the
  note is amended, and the notes requirement does not apply to rev 2. No
  other code reads these values; the PDF and admin view print them as text.

## Time labels (10/16/2026)

RN oversight uses “Start time” and “End time” in the form, validation,
submission details, and generated PDF. These labels describe the work period
without implying arrival at or departure from a home. Stored `ov_timeIn` and
`ov_timeOut` keys, time validation, and billing calculations are unchanged.
