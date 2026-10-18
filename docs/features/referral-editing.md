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
insurance, referrer details, and comments or notes. A detail row that was
blank is added at the end of the card; one that is cleared is removed. Every
other row, including the family's screened answers and every ⚠ flag, is kept
exactly as submitted, so an edit can never turn the card into one the website
would have refused. The timeline records old and new values
(`describeEdits`), because the old value was the family's own words.

`PUT /api/admin/referrals/[id]/details` with `{ values: { [fieldKey]: string } }`
(`updateWebsiteReferralDetails` in `src/lib/referrals.ts`) ignores any key
not on the source's list and validates only the fields being changed, so an
old value the website let through never blocks fixing something else.

Locked on purpose: paid caregiver, agency staff in the home, date of birth,
relationship, diagnosis, equipment, behavior, current services, guardianship,
and what the hands-on care is for. Changing those has to re-run the website's
screening (see the owner's decision, 10/18/2026: never go around the blocks).
