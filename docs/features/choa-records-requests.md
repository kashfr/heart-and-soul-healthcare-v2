# CHOA medical records requests

Fax Center > Release of Information > CHOA medical records request prepares
Children's Healthcare of Atlanta's own authorization. Existing requests
without `formType` continue to use the DBHDD template.

The office selects a client, dates of service, record types, and optionally a
CHOA hospital, clinic, or doctor. The Past 90 days shortcut fills an inclusive
90-day range ending today in Eastern time; staff can adjust it. The PDF prints
the exact dates so the range does not shift while awaiting signature or processing.
The server fixes the facility contact details,
records direction (CHOA to Heart and Soul), purpose (continuing care), and
standard 12-month term. The client must have a name and DOB. The official
fillable PDF includes CHOA's instructions and leaves signatures, signing date,
and representative authority for the signer. The source's shared organization
checkboxes are split so the sender and recipient can be selected independently.

Download and review the prepared form, send it from PandaDoc, and upload the
signed PDF back to the release. Include authority documentation when required
and confirm the standard 12-month term is unchanged. The existing signed-copy
filing and fax workflow stores the PDF in client Documents and sends the cover
sheet, introduction letter, and signed authorization. Delivery remains visible
in Sent Faxes. Incoming records use the existing File to Client action.

This does not add PandaDoc API sending or signed-document downloads. The
existing integration tracks webhook events; the source code documents that its
current production plan does not allow those API operations. No external
signature requests or faxes are sent by preparing a form.

If a return fax is configured, it is placed in the patient-care fax delivery
field. Otherwise the form requests paper records at the agency mailing address.
Radiology reports are supported; imaging/CD requests use CHOA's separate
radiology process. This workflow does not confirm that CHOA accepted a request
or that records have been received.

## Referral drawer

Referrals > open a referral > Release of Information uses the same preparation,
signed-copy upload, preview, and fax workflow. A client record is not required.
The referral is preselected; its name and DOB are resolved on the server. If
DOB is missing, staff must supply it for the release (the referral itself is
not edited). Closed or referred-out referrals must be reopened to prepare a
new release.

Signed copies are filed in referral Documents as Consent / Release. Existing
client conversion copies these documents into the client record; uploading
after conversion also copies them. Preparation, signed filing, and fax
submission appear in referral activity. Fax submission is not proof of delivery.
The introduction letter describes evaluating the referral rather than claiming
that nursing care has already started.

The button uses the same Fax Center access as Request PPOT. VAs and supervisors
need their existing explicit fax-access grant; API authorization remains in
place for every operation. The local preview can prepare and file releases
while outbound fax is disabled.

`ROI_FORMS` supplies the available form choices. CHOA and the existing DBHDD
form are available now. The user's additional Georgia and Emory forms still
need their source PDFs, field mappings, validation, and tests before being added.

## Source and maintenance

Verified 2026-10-06:
- Instructions: https://www.choa.org/patients/medical-records
- Original PDF: https://www.choa.org/-/media/Files/Childrens/patients/medical-records/medical-records-authorization-form.pdf
- Bundled source: `public/forms/choa-medical-records-authorization.pdf`
- Source revision printed on form: 08/2022, two pages.
- Medical Records fax: 404-785-9060; phone: 404-785-2431.

CHOA allows healthcare providers to request records directly for continuing
care without authorization. This feature supports the signed-authorization
route when the office chooses to use it; it does not assert authorization is
always required.

When replacing the blank PDF, review all field names and organization checkbox
positions in `choaStamp.ts`. Run the PDF tests, inspect both rendered pages, and
check canonical form values and widget appearances. Never fill in a signature
or choose a representative's authority automatically.

## Validation

- `choaRoi.test.ts`: date ranges, record types, trusted facility data, direction,
  duration, and introduction-letter wording.
- `choaStamp.test.ts`: filled fields, independent parties, blank signature and
  authority, return-fax/mail behavior, and valid annotation references.
- `RoiSection.test.tsx`: prepare a CHOA request through the office form.
- Existing DBHDD, fax, and PDF tests remain in the full suite.
