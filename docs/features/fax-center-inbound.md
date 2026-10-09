# Fax Center: incoming faxes, referrals, and client records

Read this before changing how incoming faxes are recorded or filed, or how a
referral becomes a client.

## Where incoming faxes come from

Every incoming fax is a document in `verbalOrderInbound/{id}` (shared with the
Verbal Orders queue). Two sources:

- **The portal line (SRFax).** The 10-minute cron sweep records each unread
  fax by its SRFax `FaxDetailsID` (numeric). The PDF is not stored; it is
  fetched from SRFax by `fileName` when viewed or filed.
- **Added by hand** (`source: 'upload'`, ids start with `up_`). "Add a Received
  Fax" in the Fax Center stores the PDF under `faxes/inbound-uploads/{id}/`
  and records `storagePath`. Use this for faxes that reached another fax
  number (the old MetroFax line) or came on paper.

`readInboundFaxBytes()` in `src/lib/inboundFaxPdf.ts` reads either kind. Every
reader of an inbound fax (preview, File to Client, File as Signed PPOT, the
Verbal Orders signed-copy route) must go through it, and every id check must
use `INBOUND_FAX_ID_RE`.

Both kinds are matched the same way on arrival: the sender's number against
open PPOT requests (`ppotCandidateKeys`) and open verbal orders
(`candidateOrderIds`). Nothing is filed automatically.

## Filing

- **File to Client** files into a client's Documents (`patientDocuments`), or,
  when the person is still a referral, into `referralDocuments/{id}` (file
  under `referrals/{referralId}/documents/`). Referral documents show on the
  referral's card and are copied into the client's Documents when the client
  record is created.
- **File as Signed PPOT** files against the open PPOT request. A client's copy
  goes to Documents (ISP / Plan of Treatment); a referral's copy stays with
  the request under `ppot/signed/` until the record is created. The referral
  card's Documents list still shows it, first, with a Signed PPOT badge
  (`signedPpotRow` in `referralDocumentsServer.ts`, served at document id
  `signed-ppot`), so everything filed for a referral is visible in one place.

## Creating the client record from a referral

"Create Client Record" on the referral card (admin, supervisor) calls
`convertReferralToClient()` in `src/lib/referralConvertServer.ts`. It does what
the Clients page does by hand: the directory doc with the next record number
from `counters/patients`, the clinical profile (physician, Medicaid ID), then
copies the referral's documents and signed PPOT into Documents, carries the
PPOT request over under the client's key, logs the activity, sets
`referral.patientId`, and moves the referral to Active. The transaction that
creates the record also claims the referral, so it can only happen once.

What the intake answers become is decided in `referralConvertShared.ts`
(`planFromReferral`), which is where to add a new field mapping.

## PPOT follow-ups

Waiting on Physicians includes Send Follow-up Fax for authorized Fax Center
users. It confirms the saved physician and fax number, sends Appendix T with a
follow-up cover sheet, and records the staff sender and submission date. The
original request date stays unchanged. Delivery is checked in Sent Faxes.
Cancelled or received requests cannot be followed up. Each request allows one
follow-up attempt per Eastern calendar day, with a transactional claim shared
by manual and automatic sends. Failed submissions remain retryable in Sent
Faxes. Unknown provider outcomes retain the claim for investigation; never
clear it without checking the outbox/provider status first.

Settings > Fax Center accepts a list of increasing calendar-day offsets from
the original request, such as 3, 7, 10. The preset button fills these values;
an empty list disables automatic follow-up faxes. Staff escalation remains a
separate one-time notification and does not stop later scheduled faxes.
Existing settings without the list retain the old single follow-up interval.
The existing cron runs during weekday office hours in Eastern time.

A transaction selects only the latest outstanding milestone and records the
request age covered by the attempt. Earlier missed milestones are skipped,
not sent in a burst or on subsequent days. Manual attempts cover all milestones
through that day; later ones remain eligible. Known failed submissions consume
the milestone (retry through Sent Faxes); unknown outcomes keep the pending
claim, blocking further automatic or manual follow-ups until investigated.
Original request dates are never reset. Filing/cancellation blocks future claims.
Schedule edits apply to existing requests on the next scheduled check and never
send anything directly from the settings screen. No SMS is sent.
