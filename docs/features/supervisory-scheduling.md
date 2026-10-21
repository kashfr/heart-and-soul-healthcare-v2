# Supervisory visit scheduling

Every client gets a supervisory visit every 30 days (the owner's rule,
10/01/2026; the client page's currency tile uses the same 30). Before this,
every supervisory visit had to be put on the calendar by hand, and a client
with nothing scheduled got no reminder at all.

Rules: `src/lib/supervisoryScheduling.ts` (pure, tested). Writes and
notices: `src/lib/supervisorySchedulingServer.ts`. Client helpers:
`src/lib/patientVisits.ts`.

## 1. The next visit is scheduled when one is filed

When a supervisor files a Home Supervisory Visit, the portal puts the next
one on the client's calendar 30 days after the visit date, assigned to her
(`scheduleNextSupervisoryVisit`, called from `/supervisory-visit` after the
scheduled visit is marked completed). Skipped when the client already has a
supervisory visit pending (scheduled by hand, or by an earlier filing). The
visit doc carries `source: 'auto-next'` and a note saying where it came
from. She gets a bell and an email (`/api/visits/auto-next`, no text: it is
her own filing, once a month per client), and the confirmation page says the
date. From there it is an ordinary visit: the evening-before and day-of
reminders fire, and she can move it, cancel it, or hand it off.

## 2. Open visits offered to every supervisor

An OPEN supervisory visit has `offeredToAll: true` and no `nurseId`. Every
active supervisor is told by text, email and bell; the first to click Accept
takes it. Three ways a visit becomes open:

- The daily sweep (`sweepSupervisoryVisits`, run from the morning window of
  the visit-reminder cron, like the service plan reminders). For every
  started client (not the ZZ Test Client), when nothing supervisory is
  pending and the next visit is due within 7 days, overdue, or there has
  never been one, it creates an open visit dated the due date (today when
  that has passed) with `source: 'auto-offer'`. "Last visit" is the newest
  of completed supervisory visits on the schedule, filed supervisory visit
  notes, and documents filed under "Supervisory Visit", so a paper form
  uploaded to Documents counts. An open visit nobody accepted is offered
  again every 7 days (`lastOfferedISO`). A client never gets a second open
  visit while one is pending, even past its date.
- The schedule modal: a supervisory visit with no assignee can be offered to
  all supervisors (checkbox), via `/api/visits/offer`.
- A hand-off released to all (below).

Accepting (`/api/visits/accept`) is a transaction: the visit must still be
scheduled, open and unassigned, so two supervisors cannot both take it. The
other supervisors get a bell saying who took it.

## 3. Hand-off

The assignee (or an admin) clicks Hand Off on a scheduled supervisory visit
and gives a reason. Either a named supervisor gets it (notified like any
assignment, with the reason) or it is released to every other supervisor as
an open offer (`/api/visits/release`). The visit records
`handedOffFromName`, `releaseReason`, and who accepted.

## Who sees what

Accept and Hand Off show for staff (admin and supervisor) on the Schedule
tab's list and calendar; field nurses see the visit but no controls. The
server routes require role admin or supervisor; hand-off additionally
requires being the assignee or an admin.

## Messages

PHI-free by construction (`visitNotifyShared.ts` events `offered` and
`auto_next`): date, time and visit type only, with a portal link. The bell,
behind the login, names the client. Every send is in the Communications
log (`visit-offered`, `visit-accepted`, `visit-handoff`, `visit-auto-next`).

## First run

On the first morning after deploy, every client with no supervisory visit in
the last 30 days and nothing on the calendar gets one open visit, and every
supervisor gets one text, email and bell per such client. Expect a burst on
day one; after that, offers arrive one client at a time as visits come due.

## Rules and indexes

None changed. The offer, accept and hand-off fields are written only by the
Admin SDK; `patientVisits` client updates keep their existing key list.
