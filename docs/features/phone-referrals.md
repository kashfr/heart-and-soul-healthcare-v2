# Phone referrals

Read this before changing "Log Phone Referral" on the Referrals page.

## What it is

A quick-capture form for a referral that comes in by phone, so staff never
retype notepad notes into a website form. Admins and VAs (the people who work
the board) can open it. Only the caller's name, a callback number, and the
client's name are required; everything else is optional because a call rarely
covers it all.

## How it is stored

`POST /api/admin/referrals` creates an ordinary referral with
`source: 'phone'` (board label "Phone Call") in New:

- caller name, phone, email go in `referrerName`, `clientPhone`,
  `clientEmail`, the same as the GAPP site (the parent is the contact);
- the program is stored as the website forms store it
  ("GAPP - Georgia Pediatric Program"), and the chosen service sets `service`
  so the fit and partner badges work;
- everything else becomes detail rows from `phoneReferralDetails()` in
  `src/lib/phoneReferralShared.ts`, labelled like the website intake
  (Date of birth, Address, Member's Medicaid ID, Diagnosis, Child's physician,
  Physician phone) so "Create Client Record" reads them. A test pins that.
  Hospital, expected discharge, and call notes are rows of their own.

The timeline's first entry says who logged the call. Assigning on save
assigns the card and, when it goes to someone else, rings their bell with a
link to the card. No email goes to the family or the office.

## Not done (on purpose, for now)

The website forms' GAPP screening (paid-caregiver hard stops, relationship
and behavior flags) does not run here: staff are taking notes, not the family
applying. Screening still happens when the family fills out the real
application.
