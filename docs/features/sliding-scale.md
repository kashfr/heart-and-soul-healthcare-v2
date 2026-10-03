# Sliding scale insulin and meal-anchored times

Two additions to MAR orders, built together on 09/30/2026 because diabetic
clients need both: a dose that depends on a blood glucose reading, and
scheduled times tied to meals.

## Meal-anchored scheduled times

A scheduled time can be tied to a meal: Before Breakfast, Before Lunch,
Before Dinner, At Bedtime (`TIME_ANCHORS` in `src/lib/marShared.ts`).

- The slot is STILL a clock time. `scheduledTimes` stays `'HH:MM'[]`; the
  anchor lives beside it in `MarOrder.timeLabels` (`{ '07:30': 'Before
  Breakfast' }`). The clock time is the client's usual time for that meal.
- Why: a dose's slot key, the due / late colors, the shift-window gates, the
  requires-MAR dose check, and row order all run on the clock time. A slot
  named "Before Breakfast" with no time would be owed by every nurse on
  every shift and could never be late.
- Display: `describeSlot(order, slot)` gives "Before Breakfast (07:30)";
  `slotAnchor` gives just the label. Every surface that shows a slot uses
  one of them (grid Time column, dose form, note dose card, medication
  chart, order lists, printed MAR).
- Every write path runs labels through `cleanTimeLabels` (known anchors
  only, only for times on the schedule, none for PRN).
- Tying a time to a meal, or untying it, counts as a schedule change
  (`regimenFieldsChanged` compares time and label together).
- Frequencies "Before meals (AC)", "Before meals and at bedtime", and "At
  bedtime" pre-fill the schedule (`suggestedScheduleFor`), but only while
  the schedule is still the untouched default. Typed times are never
  overwritten.
- All three order forms share `src/components/mar/ScheduledTimesEditor.tsx`.

## Sliding scale

`MarOrder.slidingScale` is a list of rows `{ min, max, units, instruction }`
in mg/dL. Logic is in `src/lib/slidingScale.ts` (pure, no Firebase).

### The order

- A sliding-scale order has no fixed dose. Every write path stores `dose =
  "Per sliding scale"` and blank units, whatever was typed.
- The scale must cover every reading exactly once: first range starts at 0,
  no gaps, no overlaps, last range open-ended (`validateSlidingScale`). The
  form makes this true by construction: each row only asks where it ENDS
  (`SlidingScaleEditor`), and the server re-validates.
- The starter layout pre-fills common RANGES and leaves every unit amount
  blank. Amounts must come from the physician's order. Do not add default
  doses.
- The scale is a regimen field: editing it discontinues the order and
  starts a replacement, so each charted dose stays tied to the scale it was
  given under.
- A different bedtime scale is a second order with its own bedtime time.
  A fixed mealtime dose plus a correction scale is two orders.
- A sliding-scale order cannot also be a check-style (measurement) order.

### Charting a dose

Both charting surfaces (the grid's `AdministerDoseModal` and the progress
note's dose card) render `SlidingScaleCharting` and judge the entry with
`resolveScaleCharting`:

- The blood glucose reading is the first field, above the scale (RN
  supervisor's request, 10/02/2026). The nurse types the meter reading; the
  scale below highlights the matching row and the app shows the dose. She
  never reads the table by eye.
- A GIVEN entry requires the reading (10 to 999, whole number). Held and
  refused may carry one but do not need it.
- A reading that calls for 0 units is recorded as status `given` with
  `doseSnapshot = "0"`: the check was done and the order was followed. It
  reads "No Insulin Due" everywhere (`isNoInsulinEntry`). It is not a held
  dose, so it does not enter the prescriber-notification follow-up.
- An amount that differs from the scale can be recorded, but needs the
  amount and the reason (`scaleDeviationReason`).
- Below 70 mg/dL shows a low blood sugar alert. What to do about it comes
  from the order's own row instruction, not from the app.

Each administration stores `glucoseReading`, `scaleDose` (what the scale
called for), `scaleRangeSnapshot` (the matched range in words), and
`scaleDeviationReason`. On a given dose `doseSnapshot` is the units
actually given and `unitsSnapshot` is "units".

### Progress note specifics

The note's dose marks (`marAdminStore`) keep the looked-up `scaleDose` and
`scaleRange` on the mark itself, because the submit gate and the write read
only the mark: the card may be collapsed or never mounted by then. The gate
uses `scaleMarkProblems`; the write uses `scaleMarkDoseGiven`.

The add-a-medication modal on the note does not offer "I administered a
dose during this shift" for a sliding-scale order, since that dose needs a
reading. The nurse charts it on the MAR after submitting.

### Corrections

Amending an entry carries the reading and scale snapshot forward unchanged.
A wrong reading or wrong units is fixed by removing the entry as entered in
error and charting it again.

### Where it shows

Grid row (scale summary), grid cell (reading over units over initials), a
"Blood Glucose & Sliding Scale Log" under the grid and on the printed MAR,
the medication chart, and the order detail view. The printed MAR prints the
whole scale on the row, never truncated.

## Rules and indexes

None changed. The MAR collections do not constrain keys.
