import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { RoiDuration, RoiParty } from '../roiShared';
import { roiPhoneFaxLine } from '../roiShared';

/**
 * Fill the DBHDD Authorization for Release of Information (Policy 23-110
 * Attachment A, IDD version 6/22/2023; public/forms/dbhdd-roi-attachment-a.pdf)
 * with what the agency may prepare: the member's name and date of birth, the
 * From and To parties, what may be shared, why, and the duration box. The
 * initials, signature, printed name, date, and "Guardian" box are left for
 * the signer. The Social Security number is never printed.
 *
 * One copy (all three pages) per From/To pair, so "both ways" is one PDF the
 * guardian signs twice.
 *
 * Positions were measured from the form's own text layer and rules (US
 * Letter, origin bottom left). If the form PDF is ever replaced, re-measure.
 */
export const ROI_LAYOUT = {
  font: 10,
  small: 9,
  /** Address rows sit between a rule and the next field's caption. */
  addr: 8,
  /** The To address row has less headroom under its caption. */
  toAddr: 7.5,
  min: 6.5,
  name: { x: 306, y: 765, w: 262 },
  dob: { x: 306, y: 733.5, w: 262 },
  fromName: { x: 84, y: 651.5, w: 420 },
  fromAddress: { x: 84, y: 629.8, w: 284 },
  fromPhone: { x: 372, y: 629.8, w: 136 },
  toName: { x: 84, y: 611, w: 420 },
  toAddress: { x: 84, y: 590.2, w: 284 },
  toPhone: { x: 372, y: 590.2, w: 136 },
  /** "I authorize the following information…:" then three full lines. */
  information: [
    { x: 435, y: 556.5, w: 148 },
    { x: 82, y: 543.5, w: 498 },
    { x: 82, y: 532, w: 498 },
    { x: 82, y: 520.5, w: 498 },
  ],
  /** "…for the purpose of:" then three full lines. */
  purpose: [
    { x: 276, y: 408, w: 310 },
    { x: 41, y: 396.5, w: 543 },
    { x: 41, y: 385, w: 543 },
    { x: 41, y: 373.5, w: 543 },
  ],
  /** Centers of the two duration boxes. */
  durationBox: { year: { x: 93.5, y: 223 }, transactions: { x: 177.3, y: 223 } },
} as const;

export interface RoiFormFill {
  memberName: string;
  /** MM/DD/YYYY. */
  dob: string;
  copies: Array<{ from: RoiParty; to: RoiParty }>;
  information: string;
  purpose: string;
  duration: RoiDuration;
}

type Box = { x: number; y: number; w: number };

function fitOne(page: PDFPage, font: PDFFont, text: string, at: Box, size: number) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return;
  let s = size;
  while (s > ROI_LAYOUT.min && font.widthOfTextAtSize(t, s) > at.w) s -= 0.5;
  page.drawText(t, { x: at.x, y: at.y, size: s, font, color: rgb(0, 0, 0) });
}

/** Break words onto the given lines at one size; null if they don't fit. */
export function wrapToLines(words: string[], widths: number[], measure: (s: string) => number): string[] | null {
  const out: string[] = [];
  let i = 0;
  for (const w of widths) {
    let line = '';
    while (i < words.length) {
      const next = line ? `${line} ${words[i]}` : words[i];
      if (measure(next) <= w) {
        line = next;
        i++;
      } else break;
    }
    out.push(line);
    if (i >= words.length) break;
  }
  return i >= words.length ? out : null;
}

function fitLines(page: PDFPage, font: PDFFont, text: string, lines: readonly Box[], size: number) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return;
  let s = size;
  let wrapped: string[] | null = null;
  for (; s >= ROI_LAYOUT.min; s -= 0.5) {
    wrapped = wrapToLines(words, lines.map((l) => l.w), (x) => font.widthOfTextAtSize(x, s));
    if (wrapped) break;
  }
  if (!wrapped) {
    // Validation caps the length, so this is a last resort: squeeze it all in.
    s = ROI_LAYOUT.min;
    wrapped = wrapToLines(words, lines.map((l) => l.w), (x) => font.widthOfTextAtSize(x, s)) ?? [];
  }
  wrapped.forEach((line, i) => {
    if (line) page.drawText(line, { x: lines[i].x, y: lines[i].y, size: s, font, color: rgb(0, 0, 0) });
  });
}

function drawCheck(page: PDFPage, at: { x: number; y: number }) {
  const k = rgb(0, 0, 0);
  page.drawLine({ start: { x: at.x - 3.5, y: at.y + 3.5 }, end: { x: at.x + 3.5, y: at.y - 3.5 }, thickness: 1.2, color: k });
  page.drawLine({ start: { x: at.x - 3.5, y: at.y - 3.5 }, end: { x: at.x + 3.5, y: at.y + 3.5 }, thickness: 1.2, color: k });
}

export async function fillRoiForm(blank: Buffer, fill: RoiFormFill): Promise<Buffer> {
  const src = await PDFDocument.load(blank);
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const L = ROI_LAYOUT;
  for (const copy of fill.copies) {
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    const page = pages[0];
    fitOne(page, font, fill.memberName, L.name, L.font);
    fitOne(page, font, fill.dob, L.dob, L.font);
    fitOne(page, font, copy.from.name, L.fromName, L.font);
    fitOne(page, font, copy.from.address, L.fromAddress, L.addr);
    fitOne(page, font, roiPhoneFaxLine(copy.from), L.fromPhone, L.addr);
    fitOne(page, font, copy.to.name, L.toName, L.font);
    fitOne(page, font, copy.to.address, L.toAddress, L.toAddr);
    fitOne(page, font, roiPhoneFaxLine(copy.to), L.toPhone, L.toAddr);
    fitLines(page, font, fill.information, L.information, L.small);
    fitLines(page, font, fill.purpose, L.purpose, L.small);
    drawCheck(page, L.durationBox[fill.duration]);
  }
  return Buffer.from(await out.save());
}
