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

"Create Client Record" on the referral card (permitted admins, supervisors, and individually authorized VAs) calls
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

## Correcting a referral PDF before conversion

The referral drawer offers Replace PDF on ordinary documents and the signed
PPOT. Admin, supervisor, and VA staff can preview and upload a corrected,
unencrypted PDF (up to 20 MB). This replaces the file only: signed date,
receipt status, category, and original inbound fax link remain unchanged.
It does not undo an erroneous PPOT receipt classification.

Replacement files have unique storage paths. The old metadata and path are
retained in the document/request's `revisions` subcollection and a referral
activity entry records the staff member. A version token rejects concurrent
replacement. The transaction reads and writes the referral alongside the
document, serializing against conversion's patientId claim; after conversion,
corrections must use the client's Documents. Conversion copies the latest
replacement. The original inbound fax is never modified.

## Undoing mistaken PPOT filing on a referral

Before client conversion, Undo PPOT filing on the signed-PPOT document row
refiles the current PDF as an ordinary referral document with a staff-selected
title, category, and date. This keeps any cleaned-up/replaced copy. The inbound
fax stays filed and points to the ordinary document, preventing double filing.
The PPOT receipt is cleared and the request returns to sent/Waiting on Physicians.
Its original date and follow-up/escalation history remain; scheduled follow-ups
may resume. The confirmation explicitly states this, and undo sends no fax.

The correction is one transaction across the referral, request, inbound fax,
new document, activity, and request filingCorrections history. It checks the
PDF version and inbound filing link, rejects duplicate/concurrent corrections,
and serializes against client conversion. Old receipt metadata/files are kept.
This action is limited to referrals without a client record; it does not undo
clinical order dates on existing clients.

## Correcting document details

Edit details on an unconverted referral corrects the physician signed date
for signed PPOTs, or the title/category/document date for ordinary documents.
It leaves PDF bytes, PPOT receipt status, original filing attribution, and
follow-up history unchanged. Dates must be real calendar dates, no later than
today in Eastern time. A transaction stores the previous metadata in revisions,
logs the correction to referral activity, and blocks edits after conversion.

The opaque revision token includes both the file path and the latest revision
id. Detail edits and PDF replacements advance that id; replace, edit, and undo
all reject stale versions. Existing records without a revision id remain valid.

Admins grant individual VAs access under Settings > Create Client Records from Referrals.
`referralConversion.userUids` defaults to an empty list; both preview and conversion
endpoints check the current server settings on every request. Revocation takes
effect server-side immediately. This grant does not expand Firestore clinical
read permissions or general client-edit permissions.

The referral creation picker lists active admins, supervisors, and VAs together.
Admins and supervisors start checked with a default-access note. Unchecking any
individual stores their UID in `referralConversion.excludedUserUids`, which overrides
role-based access and VA grants on both preview and conversion. Checking them again
removes that exclusion (and grants VA access where needed). Missing exclusions
preserve existing permissions. Only admins can edit these settings; an admin whose
conversion access is removed can still manage settings and restore that access.

## Uploading to a referral (no fax involved)

"Upload Document" in a referral card's Documents section takes any PDF,
however it arrived (PandaDoc, email, the family, a scan), with a category,
date, and title, and files it like a fax filed to the referral
(`uploadReferralDocument` in `src/lib/referralUploadServer.ts`). When the
referral has a PPOT request still waiting, the upload can instead be filed as
the signed Appendix T (`uploadSignedPpotForReferral`): it marks the request
received exactly as File as Signed PPOT does, with `received.source: 'upload'`
and no inbound fax. Undo PPOT filing handles that case (no fax to unlink).
Once the referral has a client record, uploads go on the client's Documents.

## Releases signed elsewhere

Release of Information has two more form types besides DBHDD and CHOA:
"Georgia HIPAA authorization (signed elsewhere)" (`ga-hipaa`, good two years
from signing, as the form states) and "Other release (signed elsewhere)"
(`outside`, with the expiration written on it, or none). Nothing is prepared:
`POST /api/fax/roi` with `{ signedDate, pdfBase64 }` records the release and
files its signed copy in one step (`recordOutsideRoi`), so it is tracked,
expires, can be faxed with the introduction letter, and feeds File to Client
suggestions like any other release.
