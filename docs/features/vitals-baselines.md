# Per-client vitals baselines

A client's own normal range for a vital, set by a supervisor from the care
plan or a physician's order. Shipped 09/28/2026 as the follow-up to the
abnormal-vitals recheck rule: some clients live at a pulse of 100 or an SpO2
of 92, and without a baseline every shift note on them demanded a recheck.

## When there is no baseline

Nothing changes. The age-based screening ranges in `src/lib/vitalRanges.ts`
(with any admin overrides from Settings) apply exactly as before. A baseline
is an optional override for one vital on one client, never a requirement:

- A client with no baselines behaves as if the feature did not exist.
- A client with a pulse baseline only: pulse is judged by it; temperature,
  BP, respirations and SpO2 keep the age range.
- Blank in the editor means "use the age range". A half range (one bound)
  is rejected at save, never stored.

## Where it lives

- Client record: `patients/{id}/clinical/profile` (the care-team-gated
  clinical sub-record), fields `vitalsBaselines` (`{ pulse: { low, high },
  ... }` keyed by `VitalKey`), `vitalsBaselinesNote` (where it is
  documented), `vitalsBaselinesSetBy`, `vitalsBaselinesSetAt`. Written by
  staff from the Clients page editor ("Vitals baselines" block under MAR &
  clinical details), validated by `parseBaselineDraft` in
  `src/lib/vitalsBaselines.ts` (both bounds, numbers, low <= high, inside
  the physiologic limits). No Firestore rules change: the clinical doc's
  existing staff-write rule covers it.
- Client page header shows them ("Vitals baselines: Pulse 95 to 110 bpm"
  or "None set; age-based ranges apply"), and the vitals trend chart shades
  its band by them.

## How a note uses them

Each note carries a **snapshot** of the baselines in effect when it was
written: flat fields `q16b_<vital>_low` / `q16b_<vital>_high` and
`q16b_note` (`BASELINE_NOTE_KEYS`). The shift note writes them when the
client is selected (new notes only; an amendment keeps the snapshot it was
submitted with), and the supervisory visit does the same. A nurse without
clinical read access (not on the care team, not RN/LPN) simply gets no
snapshot, which is the age-range behaviour she had before.

Every consumer judges a note by `noteVitalRanges(values, overrides)` in
`vitalRanges.ts`: age range, admin overrides, then the note's snapshot on
top. That is the form (`VitalSignsFields`, `VitalsRecheckSection`), the
submit gate and `noteValidation` (`vitalsFollowUp.ts`), the admin detail
view, the PDF, and `hasAnyAbnormalVital` (the Submissions flag). A later
change to the client's baseline never rewrites how an old note reads.

Consequences:

- A reading inside the baseline is not abnormal: no red highlight, no
  recheck required, no follow-up box.
- The form says which bounds applied: "Pulse is high for this client's
  baseline (95 to 110)" versus "for Adult (18-64 years)", and the age-group
  line lists the client's baselines.
- The follow-up action "Within this client's known baseline per care plan"
  stays available. If a nurse picks it for a vital that has no baseline on
  the record, the form tells her to say where it is documented, and the
  admin detail view shows a notice with a link to the client so the
  supervisor can add the baseline (after which it never comes up again).

## Not covered

- Critical (escalation) thresholds in `criticalVitals.ts` are not adjusted
  by baselines; a critical value still prompts escalation.
- The admin range overrides from Settings are applied in the admin view,
  PDF and Submissions flag but not yet on the note form itself; this
  predates baselines.

## Tests

`src/lib/vitalRanges.test.ts` (client baselines), `src/lib/vitalsBaselines.test.ts`,
`src/lib/vitalsFollowUp.test.ts` (client baselines).
