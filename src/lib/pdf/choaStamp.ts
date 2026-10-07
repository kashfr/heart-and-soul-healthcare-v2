import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { AGENCY, roiPhoneFaxLine } from '../roiShared';
import { CHOA_RECORD_TYPES, type ChoaRequest } from '../choaRoi';
import { formatDateUS } from '../dateFormat';

export class ChoaFormError extends Error {}

/** Fill the official CHOA form; leave the signature and representative choices blank. */
export async function fillChoaForm(blank: Uint8Array, input: {
  memberName: string;
  dob: string;
  request: ChoaRequest;
  returnFax: string;
}): Promise<Buffer> {
  const pdf = await PDFDocument.load(blank);
  const form = pdf.getForm();
  const page = pdf.getPages()[1];
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const text = (name: string, value: string) => {
    const field = form.getTextField(name);
    // Accommodate names such as O’Connor without relying on a system font.
    const safe = value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-');
    try { font.encodeText(safe); } catch {
      throw new ChoaFormError('This form cannot print one of the characters in the patient name or location. Download the blank CHOA form and complete it manually without changing the patient record.');
    }
    field.setText(safe);
    const box = field.acroField.getWidgets()[0].getRectangle();
    const width = Math.max(font.widthOfTextAtSize(safe || ' ', 10), 1);
    const size = Math.min(10, 10 * (box.width - 6) / width);
    if (size < 7) throw new ChoaFormError('The patient name or location is too long to print legibly. Download the blank CHOA form and complete it manually.');
    field.setFontSize(size);
  };

  // The source reuses each organization checkbox field in BOTH sections.
  // Split them so checking CHOA as sender never checks CHOA as recipient.
  for (const name of ["Children's Healthcare of Atlanta", 'Other facility']) {
    const field = form.getField(name);
    // These widgets have no /P entry. Detach them explicitly before removing
    // their shared field, otherwise the source page retains dangling refs.
    for (const widget of field.acroField.getWidgets()) {
      const ref = pdf.context.getObjectRef(widget.dict);
      if (ref) for (const targetPage of pdf.getPages()) targetPage.node.removeAnnot(ref);
    }
    form.removeField(field);
  }
  const organizations = [
    { name: 'CHOA sender', x: 131.307, y: 680.613, checked: true },
    { name: 'Other sender', x: 131.526, y: 658.504, checked: false },
    { name: 'CHOA recipient', x: 128.907, y: 600.904, checked: false },
    { name: 'Other recipient', x: 329.853, y: 601.122, checked: true },
  ];
  for (const item of organizations) {
    const box = form.createCheckBox(item.name);
    box.addToPage(page, { x: item.x, y: item.y, width: 13.6, height: 10.4, borderWidth: 0.7, borderColor: rgb(0, 0, 0) });
    if (item.checked) box.check();
    else box.uncheck();
  }

  text('Name  First Middle Last', input.memberName);
  text('Date of Birth', input.dob);
  text("Children's location", input.request.location || 'All CHOA locations');
  text('Name of Facility or Person', AGENCY.name);
  text('Address_2', AGENCY.street);
  text('City_2', 'Atlanta');
  text('State_2', 'GA');
  text('Zip_2', '30309');
  text('Day Phone_2', roiPhoneFaxLine({ phone: AGENCY.phone, fax: '' }));
  text('Indicate Applicable Dates of Service', `${formatDateUS(input.request.dateFrom)} through ${formatDateUS(input.request.dateTo)}`);
  for (const type of input.request.recordTypes) form.getCheckBox(CHOA_RECORD_TYPES[type].field).check();
  form.getCheckBox('Continuing care').check();
  const fax = input.returnFax.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (fax.length === 10) {
    form.getCheckBox('Fax2').check();
    text('Fax', `(${fax.slice(0, 3)}) ${fax.slice(3, 6)}-${fax.slice(6)}`);
  } else {
    form.getCheckBox('Paper').check();
    form.getCheckBox('Mail').check();
  }
  form.updateFieldAppearances(font);
  return Buffer.from(await pdf.save());
}
