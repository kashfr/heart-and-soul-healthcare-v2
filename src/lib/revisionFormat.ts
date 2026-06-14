// Shared formatting for revision / audit-trail field names and values.
// Used by the RevisionHistory UI (browser) and the progress-note PDF audit
// trail (server). Pure functions only — no React or platform APIs — so the
// two surfaces stay consistent.

// Field names whose camelCase doesn't decompose cleanly via the regex splitter
// below ("dateofBirth" would otherwise read as "Dateof Birth" because the
// splitter only breaks on capital letters). Add a mapping here for any new
// offenders that show up in revision history.
const FIELD_LABEL_OVERRIDES: Record<string, string> = {
  q4_dateofBirth: 'Date of Birth',
  q6_dateofService: 'Date of Service',
  q200_addr_line1: 'Address Line 1',
  q200_postal: 'Postal Code',
};

export function prettyFieldName(key: string): string {
  if (FIELD_LABEL_OVERRIDES[key]) return FIELD_LABEL_OVERRIDES[key];
  const cleaned = key.replace(/^q\d+_/, '').replace(/_/g, ' ');
  return cleaned
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
    .replace(/\s+/g, ' ');
}

export function prettyValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') {
    if (v.startsWith('data:image/')) return '(signature image)';
    return v.length > 200 ? v.slice(0, 200) + '…' : v;
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
