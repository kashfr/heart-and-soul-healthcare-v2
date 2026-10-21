# Document period covered

Client documents carry two dates. `docDate` is the date printed on the
document and drives currency tracking. `periodStart` / `periodEnd` (inclusive
ISO dates, both present or neither) record the period the document COVERS:
the month of an eligibility letter, the span of an authorization, a plan of
care's certification period. Helpers live in `src/lib/documentPeriod.ts`.

Every place a client document is labeled offers a "Period covered" picker
(`DocumentPeriodFields`): not tied to a period, one month (month + year
selects, since a native month input falls back to ISO text in Firefox), or a
date range in MM/DD/YYYY. The bulk upload has a default period that "Apply
defaults to pending files" copies onto every pending file. The Documents tab
Edit modal, the assistant workspace upload, and Fax Center "File to Client /
Referral" all carry it; a fax filed against a referral keeps the period when
the referral converts and its documents move to the client.

Document cards show "Covers Oct 2026" (one month), "2026" (a whole year),
"Oct 2026 to Dec 2026" (whole months) or the two US dates. The Documents tab
date filter matches the date on the document OR the period it covers, so
filtering October finds the eligibility letter dated in September.

Servers validate the pair (`parseDocumentPeriod`): a half or reversed period
is a 400. Clearing it in Edit deletes both fields. `firestore.rules` lists the
two fields among the staff-editable keys on `patientDocuments`; redeploy rules
with the app (no browser path writes them today, so nothing breaks before the
deploy). No index change.
