import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Print the member's name and Medicaid ID on the identity line of the GAPP
 * Appendix T (public/forms/gapp-appendix-t.pdf):
 *
 *   Member Name:________________  Member Medicaid Number: ____________
 *
 * Only these two identity fields, never anything clinical: the physician
 * completes the rest (GAPP manual 913.3). Used only when an admin turns on
 * Settings > Fax Center > "Print name and Medicaid ID on the Appendix T".
 *
 * Positions were measured from the form's own text layer (Times 11 pt, line
 * baseline at y 875.2 on a page whose media box starts at y 162). If the form
 * PDF is ever replaced, re-measure them.
 */
export const APPENDIX_T_IDENTITY = {
  baselineY: 877.5,
  name: { x: 129, maxWidth: 169 },
  medicaid: { x: 433, maxWidth: 121 },
  fontSize: 10.5,
  minFontSize: 7,
} as const;

export async function stampAppendixTIdentity(pdf: Buffer, member: { name: string; medicaidId: string }): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf);
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const L = APPENDIX_T_IDENTITY;
  const draw = (text: string, at: { x: number; maxWidth: number }) => {
    const t = text.trim();
    if (!t) return;
    let size: number = L.fontSize;
    while (size > L.minFontSize && font.widthOfTextAtSize(t, size) > at.maxWidth) size -= 0.5;
    page.drawText(t, { x: at.x, y: L.baselineY, size, font, color: rgb(0, 0, 0) });
  };
  draw(member.name, L.name);
  draw(member.medicaidId, L.medicaid);
  return Buffer.from(await doc.save());
}
