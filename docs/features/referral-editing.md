# Editing referrals

Read this before changing Edit Details on a referral card.

Admins and VAs see **Edit Details** on a referral's card until a client
record has been created from it (after that, correct the client record).

## Phone referrals

Staff's own notes, so every field is editable. See phone-referrals.md.

## Website referrals (GAPP site and Heart & Soul site)

Only the fields the GAPP screening never reads are editable, listed per
source in `src/lib/referralEditShared.ts`: contact name, phone, email,
county, address, Medicaid ID, physician (name, office, phone, fax),
insurance, referrer details, and (GAPP site) comments. The Heart & Soul
form's service needs and additional notes are not editable: that form screens
their text for an autism or behavioral picture. A detail row that was
blank is added at the end of the card; one that is cleared is removed. Every
other row, including the family's screened answers and every ⚠ flag, is kept
exactly as submitted, so an edit can never turn the card into one the website
would have refused. The timeline records old and new values
(`describeEdits`), because the old value was the family's own words.

`PUT /api/admin/referrals/[id]/details` with `{ values: { [fieldKey]: string } }`
(`updateWebsiteReferralDetails` in `src/lib/referrals.ts`) ignores any key
not on the source's list and validates only the fields being changed, so an
old value the website let through never blocks fixing something else.

## Screened answers (website referrals from 10/2026 on)

Both websites now keep the family's answers on the referral (`intakeAnswers`).
The card builders and the refusal checks live in `src/lib/websiteIntake.ts`,
shared by the GAPP intake route, the Heart & Soul form's server action, and
staff edits, so all three run identical code.

On a referral with `intakeAnswers`, Edit Details shows **Screened Answers**:
paid caregiver, agency staff in the home, relationship, guardianship and what
the hands-on care is for (only when the website would ask them), date of
birth, and care need (`src/lib/screenedAnswers.ts`). The form runs the
website's refusal checks as staff change an answer and shows the website's
own message; the server runs them again on save and refuses (422) with
nothing written. When accepted, the screened rows and every ⚠ flag are
rebuilt as the website would build them (`mergeScreenedRows`), every other
row keeps its current value (so earlier corrections survive), the service
line is re-inferred unless staff had overridden it, and the timeline records
old and new answers.

Never goes around the blocks (owner's decision, 10/18/2026). Diagnosis,
equipment, behavior, and current services stay locked even here (large
checklists; a later step if needed). Referrals from before the answers were
saved can't change screened answers at all: the family resubmits the form.

## Locked on referrals without saved answers

Paid caregiver, agency staff in the home, date of birth,
relationship, diagnosis, equipment, behavior, current services, guardianship,
and what the hands-on care is for. Changing those has to re-run the website's
screening (see the owner's decision, 10/18/2026: never go around the blocks).
