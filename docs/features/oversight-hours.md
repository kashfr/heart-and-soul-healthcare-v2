# RN oversight: documented time and billable time

How an RN oversight visit's hours are recorded and billed. Replaces the
"locked Time out" of #211 (09/23/2026). Decided with the owner on
09/30/2026.

## The rule

- **The note records what happened.** Time in and Time out on the RN
  oversight form are always the nurse's own entries. The portal never fills,
  locks, or adjusts them. A visit note's times are the nurse's signed record,
  and the hours are billed to Medicaid in 15-minute units, so a time that was
  not worked is never written to make the month come out even.
- **The month bills at the authorization.** Owner's decision (09/30/2026,
  PR after #249): the RN oversight service covers the other oversight duties
  done during the month (DBHDD assumes them), so once an RN visit is
  documented the month bills its full authorized hours
  (`oversightVisitBilling` in `src/lib/shiftHours.ts`):
  - the month's first visit, in date order, bills the authorization, whether
    it ran shorter ("topped up") or longer ("trimmed");
  - every later visit that month is documented and not billed
    ("non-billable"), for example a short follow-up after a concern;
  - a month with no documented visit bills nothing.
- The visit's own times are never changed to match. Views show both: "2.72 h
  documented, 3 h billed".
- Owner decisions, do not revisit: off-site RN work is not logged in the
  portal, and overlapping visits across clients are legitimate (never block
  or flag them).

## The form (`/oversight-note`)

- A notice under the visit times, from `GET /api/oversight/allotment`
  (numbers and visit dates only; `hoursAuthorizations` stays owner-only):
  - first visit, before times: "September: this visit bills the month's 3
    authorized RN hours. Enter the actual times.";
  - first visit, with times: "September's 3 authorized RN hours bill with
    this visit. The visit itself is documented as 2.72 h.";
  - a later visit: "Non-billable visit: September's 3 RN hours already bill
    with the 09/22/2026 visit. Enter the actual times."
- NOW/COMP client with no RN authorization covering the visit date: a new
  visit cannot be submitted until the office enters the line (amendments are
  never blocked by this). Other programs: the visit is filed as documented.
- Submit stamps `ov_billableHours` and `ov_nonBillable` ('Yes' | '') as the
  form showed them, for the PDF and for people who cannot read the
  authorizations. The owner's hours views do not rely on the stamp.

## Where billing is capped

All three recompute from the authorizations:

- Client Hours tab (`HoursSection.tsx`): oversight rows count what they
  bill; a row whose time differs says "2.72 h documented, 3 h billed"; a
  non-billable row carries a Non-Billable badge.
- Shift Notes list (`admin/submissions/page.tsx`): the blue RN chip, totals,
  pivots and CSV use billable hours; a NON-BILLABLE badge sits beside
  OVERSIGHT (from the recomputation for the owner, from the stamp for
  everyone else). Archived notes are not billed and use no hours.
- Roster badges (`admin/clients/page.tsx`): `capOversightDayHours`.

Months with no RN line are not capped: their visits count as documented, as
before.

## Notes

- Visits documented before 09/30/2026 keep their nurses' times; each month's
  first visit now bills the authorization without any amendment.
- A visit filed with an earlier date than the month's existing visit becomes
  the billed one, and the other turns non-billable (date order decides).

## Tests

`src/lib/shiftHours.test.ts` (first visit bills the month, later visits
non-billable, day map, preview), `src/app/(marketing)/oversight-note/page.test.tsx`.
