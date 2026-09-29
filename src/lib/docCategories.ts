/**
 * Document categories, grouped for the pickers. The original seven names are
 * load-bearing (survey-readiness currency checks, verbal-order filing, and
 * oversight-note auto-filing match on them) and must not be renamed; add new
 * ones freely.
 */
export const DOC_CATEGORY_GROUPS = [
  {
    label: 'Care planning & orders',
    categories: ['Plan of Care (485)', 'Service Plan', 'Initial Assessment', 'Nursing Assessment / 60-Day Summary', 'Physician Orders', 'Medication List'],
  },
  {
    label: 'Visits & notes',
    categories: ['Supervisory Visit', 'RN Oversight', 'Progress Note (scanned)'],
  },
  {
    label: 'Medical events',
    categories: ['Hospital Discharge', 'ER / Urgent Care Visit', 'Specialist / Physician Visit', 'Lab & Diagnostic Results', 'Incident Report'],
  },
  {
    label: 'Program & payer',
    categories: ['Authorization / Letter of Notification', 'ISP / Plan of Treatment', 'Consent / Release (ROI)', 'Eligibility / Medicaid'],
  },
  {
    label: 'Other',
    categories: ['Other'],
  },
] as const;

export const DOC_CATEGORIES = DOC_CATEGORY_GROUPS.flatMap((g) => g.categories) as readonly DocCategory[];
export type DocCategory = (typeof DOC_CATEGORY_GROUPS)[number]['categories'][number];

/** True when the value is one of the client document categories. */
export function isDocCategory(v: string): v is DocCategory {
  return (DOC_CATEGORIES as readonly string[]).includes(v);
}

export interface FileFaxToClientInput {
  patientId: string;
  category: string;
  title: string;
  docDate: string; // YYYY-MM-DD
}

export type FileFaxToClientField = keyof FileFaxToClientInput;

/** Field errors for filing an incoming fax into a client's Documents. */
export function validateFileFaxToClient(input: Partial<FileFaxToClientInput>, todayISO: string): Partial<Record<FileFaxToClientField, string>> {
  const e: Partial<Record<FileFaxToClientField, string>> = {};
  if (!/^[A-Za-z0-9]{1,64}$/.test(String(input.patientId || ''))) e.patientId = 'Choose the client this fax belongs to.';
  if (!isDocCategory(String(input.category || ''))) e.category = 'Choose a category.';
  const title = String(input.title || '').trim();
  if (!title) e.title = 'Give the document a title.';
  else if (title.length > 200) e.title = 'Keep the title under 200 characters.';
  const d = String(input.docDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) e.docDate = 'Enter the document date.';
  else if (d > todayISO) e.docDate = 'The document date cannot be in the future.';
  return e;
}
