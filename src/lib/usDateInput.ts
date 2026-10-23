/**
 * Live formatting for a typed MM/DD/YYYY field: call it on every change and
 * store the result. Digits flow into month, day and year, and the slash is
 * inserted when the next part's first digit arrives ("10222026" becomes
 * "10/22/2026"). A slash is never added after the last digit, so Backspace
 * works without fighting the field. A slash the user types closes a short part
 * ("1/5/2026" stays as typed), and a pasted ISO date (2026-10-22) is
 * converted. Anything past the 4-digit year is dropped.
 */
export function formatUSDateInput(raw: string): string {
  const iso = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(raw);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const parts = ['', '', ''];
  let i = 0;
  let closed = false;
  for (const ch of raw) {
    if (/\d/.test(ch)) {
      if (i < 2 && parts[i].length === 2) i++;
      if (parts[i].length < (i === 2 ? 4 : 2)) parts[i] += ch;
      closed = false;
    } else if (ch === '/' || ch === '-' || ch === '.') {
      if (i < 2 && parts[i]) { i++; closed = true; }
    }
  }
  const shown = parts.slice(0, i + 1).filter((p, idx) => p || idx < i);
  return shown.join('/') + (closed && !parts[i] ? '/' : '');
}

/** Text dates have a fixed US display regardless of browser locale. */
export function parseUSDate(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, month, day, year] = match;
  if (+year < 1900 || +year > 9999) return null;
  const date = new Date(+year, +month - 1, +day);
  if (date.getFullYear() !== +year || date.getMonth() !== +month - 1 || date.getDate() !== +day) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

