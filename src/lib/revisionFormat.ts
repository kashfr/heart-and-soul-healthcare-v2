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

// ---------------------------------------------------------------------------
// Inline amendments. Turns a note's edit history into (a) per-field version
// chains for the in-place "old value struck through -> corrected value below"
// rendering the body uses, and (b) a deduped per-edit "why" log (one line per
// edit event that carried a reason). Both the on-screen view and the PDF build
// from these so the surfaces stay identical. Pure — no React/platform APIs.
// ---------------------------------------------------------------------------

/** Minimal shape shared by the client EditHistoryEntry and the server
 *  ServerEditHistoryEntry, so this helper works on both surfaces. */
export interface AmendmentSourceEntry {
  changes: Record<string, { from: unknown; to: unknown }>;
  editedByName: string;
  editedByRole?: string;
  editedAt: Date | null;
  reason?: string;
}

/** One superseded value of a field, tagged with when it was corrected and by
 *  whom. Render each `oldValue` struck through (with correctedAt/by) ABOVE the
 *  field's current value. Ordered oldest-first. */
export interface FieldVersion {
  oldValue: unknown;
  correctedAt: Date | null;
  correctedBy: string;
}

function editedMillis(d: Date | null): number {
  return d ? d.getTime() : 0;
}

/**
 * Map of field key -> ordered (oldest-first) list of its prior values. A field
 * edited N times yields N entries (each edit's `from`), so the full chain is
 * "original (struck) -> ... -> current (the live field value)". The current
 * value is NOT included here — callers render it from the live note data.
 */
export function buildFieldAmendments(
  entries: AmendmentSourceEntry[],
): Record<string, FieldVersion[]> {
  const ordered = [...entries].sort((a, b) => editedMillis(a.editedAt) - editedMillis(b.editedAt));
  const out: Record<string, FieldVersion[]> = {};
  for (const e of ordered) {
    for (const key of Object.keys(e.changes || {})) {
      (out[key] = out[key] || []).push({
        oldValue: e.changes[key].from,
        correctedAt: e.editedAt,
        correctedBy: e.editedByName,
      });
    }
  }
  return out;
}

/** One line per edit EVENT that carries a reason (oldest-first) — the compact
 *  "why" log that replaces the field-by-field from/to table. The "what" renders
 *  inline; this captures the "why" once per amendment, never repeated per field. */
export interface AmendmentWhy {
  editedAt: Date | null;
  editedByName: string;
  editedByRole?: string;
  reason: string;
}

export function buildAmendmentWhyLog(entries: AmendmentSourceEntry[]): AmendmentWhy[] {
  return [...entries]
    .sort((a, b) => editedMillis(a.editedAt) - editedMillis(b.editedAt))
    .filter((e) => (e.reason || '').trim())
    .map((e) => ({
      editedAt: e.editedAt,
      editedByName: e.editedByName,
      editedByRole: e.editedByRole,
      reason: (e.reason as string).trim(),
    }));
}
