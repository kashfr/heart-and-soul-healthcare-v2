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

