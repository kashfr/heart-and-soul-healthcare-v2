# CHOA medical records requests

Fax Center > Release of Information > CHOA medical records request prepares
Children's Healthcare of Atlanta's own authorization. Existing requests
without `formType` continue to use the DBHDD template.

The office selects a client, dates of service, record types, and optionally a
CHOA hospital, clinic, or doctor. The server fixes the facility contact details,
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
