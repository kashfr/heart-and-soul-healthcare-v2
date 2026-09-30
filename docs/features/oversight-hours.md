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
- **The authorization caps the billing, not the clock.** Each client's RN
  line authorizes so many hours a month. A month's visits bill in the order
  they happened until the authorization is used
  (`oversightVisitBilling` in `src/lib/shiftHours.ts`):
  - a visit that fits is billed as documented;
  - a visit that runs past what is left is documented in full and billed only
    up to the authorization ("trimmed");
  - a visit after the hours are used is documented and not billed
    ("non-billable"), for example a short follow-up after a concern.
- A month that ends under the authorization shows as under. It is not topped
  up. Whether off-site RN work (MAR review, care plan updates, physician
  calls) may be logged and billed is an open question for the compliance
  specialist; nothing for it is built.

## The form (`/oversight-note`)

- A notice under the visit times, from `GET /api/oversight/allotment`
  (numbers and visit dates only; `hoursAuthorizations` stays owner-only):
  - before times are entered: "September: 0 of 3 RN hours documented so far";
  - with times: "Billable: 2.5 h. September will stand at 2.5 of 3 RN
    hours, 0.5 h still unused";
  - trimmed: "This visit is 3.37 h. 3 h are billable ...; the rest is
    documented but not billed";
  - hours already used: "Non-billable visit: September's 3 RN hours are
    already documented on the 09/22/2026 visit. Enter the actual times."
- NOW/COMP client with no RN authorization covering the visit date: a new
  visit cannot be submitted until the office enters the line (amendments are
  never blocked by this). Other programs: the visit is filed as documented.
- Submit stamps `ov_billableHours` and `ov_nonBillable` ('Yes' | '') as the
  form showed them, for the PDF and for people who cannot read the
  authorizations. The owner's hours views do not rely on the stamp.

## Where billing is capped

All three recompute from the authorizations:

- Client Hours tab (`HoursSection.tsx`): oversight rows count their billable
  hours; a trimmed row says "3.37 h documented, 3 h billable"; a non-billable
  row carries a Non-Billable badge.
- Shift Notes list (`admin/submissions/page.tsx`): the blue RN chip, totals,
  pivots and CSV use billable hours; a NON-BILLABLE badge sits beside
  OVERSIGHT (from the recomputation for the owner, from the stamp for
  everyone else). Archived notes are not billed and use no hours.
- Roster badges (`admin/clients/page.tsx`): `capOversightDayHours`.

Months with no RN line are not capped: their visits count as documented, as
before.

## Known gaps

- Visits documented before 09/30/2026 keep the times their nurses entered,
  including the 09/22 visits that ran over. They now bill at the
  authorization without any amendment.
- Nothing checks that one nurse's visits to different clients do not overlap
  in time (08/25, 09/07 and 09/22/2026 have overlaps).

## Tests

`src/lib/shiftHours.test.ts` (billing order, trim, non-billable, day cap,
preview), `src/app/(marketing)/oversight-note/page.test.tsx`.
