# Communications log

What the portal told staff about clients' care, word for word, with delivery
status, plus messages people log by hand. Built 09/28/2026 at the owner's
request, after he could not see what a scheduling notice to a supervisor had
said.

## Who and where

- Sidebar "Communications" (`/admin/communications`): every entry, newest
  first, filterable by staff member and client. Admins and supervisors.
- Client page tab "Communications" (`?tab=communications`): that client's
  entries. Hidden from nurses like the Care plan tab; VAs cannot open the
  client page at all.
- "Log a message" on both: direction (sent / received), how (email, text,
  phone call, in person, fax, other), a staff member or a named outsider,
  optional client, when, optional subject, the message itself. Hidden in
  view-as.

## What is logged automatically

- `/api/visits/notify` (visit assigned, cancelled, back on the schedule) and
  `/api/cron/visit-reminders` (day before, day of): one entry per notice with
  each channel's exact text (email subject and body, SMS body, portal bell
  text), the address or number used, and ok / failed / not sent with the
  reason (for example "Quo SMS is not configured.").
- Email and SMS bodies are PHI-free by design; the bell text names the client
  (it lives behind the login). The log itself is staff-only.

## Storage

- Top-level `communications`, server-only (default deny, no rules change).
  `recordCommunication` in `src/lib/communicationsServer.ts` never throws: a
  logging failure must not fail a send. Reads and manual writes go through
  `/api/communications` (GET list + pickers, POST manual entry).
- Lists filter by `patientId` or `staffUid` with a single equality and sort
  in memory; the unfiltered list is `createdAt desc` limit 300. No composite
  index.
- Entries are append-only; there is no edit or delete.

## Not logged yet

Other outbound traffic (flag SMS alerts, handoff and announcement bells,
faxes, referral emails, med error notices) is not in the log. Each can be
added by calling `recordCommunication` next to its send.

## Tests

`src/lib/communicationsShared.test.ts`, `src/components/CommunicationsLog.test.tsx`.
