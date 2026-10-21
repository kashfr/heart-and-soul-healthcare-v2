/**
 * Editing the answers the GAPP screening reads (paid caregiver, agency staff,
 * relationship, guardianship, what the hands-on care is for, date of birth,
 * care need) on a website referral. Never goes around the website's blocks:
 * the edited answers run through the same refusal checks the website runs
 * (websiteIntake.ts), and an edit the website would have refused is refused
 * with the website's own message. When it passes, the card's screened rows
 * and ⚠ flags are rebuilt exactly as the website would have built them.
 * Only possible on referrals that kept their answers (from 10/2026 on).
 * Pure, so the same code shows the refusal live in the edit form.
 */
import { formatDateUS } from './dateFormat';
import {
  PAID_CARE_BASIS_OPTIONS,
  RELATIONSHIP_OPTIONS,
  screenCaregiverRelationship,
  screenMixedPaidCaregiver,
  type ServiceKey,
} from './diagnosisCatalog';
import {
  buildGappReferral, buildHsReferral, gappRefusal, hsRefusal,
  type BuiltReferral, type GappAnswers, type HsAnswers, type Refusal,
} from './websiteIntake';
import type { EditableSource } from './referralEditShared';

/** The care-need choices, labelled as both websites print them on the card. */
export const CARE_NEED_OPTIONS: { code: string; label: string }[] = [
  { code: 'personal', label: 'Hands-on personal care' },
  { code: 'nursing', label: 'Skilled medical / nursing care' },
  { code: 'behavioral', label: 'Behavioral / autism support' },
  { code: 'unsure', label: 'Not sure' },
];

export interface ScreenedAnswers {
  seekingPaidCaregiver: string;
  wantsAgencyStaff: string;
  relationship: string;
  hasGuardianship: string;
  paidCareBasis: string;
  /** YYYY-MM-DD */
  dob: string;
  careNeeds: string;
}

export type ScreenedKey = keyof ScreenedAnswers;

export const SCREENED_LABELS: Record<ScreenedKey, string> = {
  seekingPaidCaregiver: 'Seeking paid caregiver',
  wantsAgencyStaff: 'Wants agency staff in the home',
  relationship: 'Relationship to child',
  hasGuardianship: 'Legal guardianship',
  paidCareBasis: 'Hands-on care mainly due to',
  dob: 'Date of birth',
  careNeeds: 'Primary care need',
};

export const SCREENED_ORDER: readonly ScreenedKey[] = [
  'seekingPaidCaregiver', 'wantsAgencyStaff', 'relationship', 'hasGuardianship', 'paidCareBasis', 'dob', 'careNeeds',
];

const YES_NO = ['yes', 'no'];
const ALLOWED: Record<ScreenedKey, (v: string) => boolean> = {
  seekingPaidCaregiver: (v) => YES_NO.includes(v),
  wantsAgencyStaff: (v) => YES_NO.includes(v),
  hasGuardianship: (v) => v === '' || YES_NO.includes(v),
  relationship: (v) => RELATIONSHIP_OPTIONS.some((o) => o.code === v),
  paidCareBasis: (v) => v === '' || PAID_CARE_BASIS_OPTIONS.some((o) => o.code === v),
  dob: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
  careNeeds: (v) => v === '' || CARE_NEED_OPTIONS.some((o) => o.code === v),
};

// Where each answer lives in the answers each website sends.
const HS_PATH: Record<ScreenedKey, ['client' | 'details', string]> = {
  seekingPaidCaregiver: ['details', 'seekingPaidCaregiver'],
  wantsAgencyStaff: ['details', 'wantsAgencyStaff'],
  relationship: ['details', 'relationship'],
  hasGuardianship: ['details', 'hasGuardianship'],
  paidCareBasis: ['details', 'paidCareBasis'],
  dob: ['client', 'dob'],
  careNeeds: ['details', 'careNeeds'],
};

type Answers = GappAnswers | HsAnswers;

function isGappProgram(source: EditableSource, answers: Answers): boolean {
  return source === 'gapp-website' || (answers as HsAnswers)?.program?.interest === 'gapp';
}

export function readScreened(source: EditableSource, answers: Answers): ScreenedAnswers {
  const out = {} as ScreenedAnswers;
  for (const k of SCREENED_ORDER) {
    if (source === 'gapp-website') {
      out[k] = String((answers as Record<string, unknown>)?.[k] ?? '');
    } else {
      const [group, key] = HS_PATH[k];
      out[k] = String(((answers as HsAnswers)?.[group] ?? {})[key] ?? '');
    }
  }
  return out;
}

/** A copy of the answers with the edits written in where the website keeps them. */
export function writeScreened(source: EditableSource, answers: Answers, edits: Partial<ScreenedAnswers>): Answers {
  const next = JSON.parse(JSON.stringify(answers ?? {}));
  for (const k of SCREENED_ORDER) {
    if (edits[k] === undefined) continue;
    if (source === 'gapp-website') next[k] = edits[k];
    else {
      const [group, key] = HS_PATH[k];
      next[group] = { ...(next[group] ?? {}), [key]: edits[k] };
    }
  }
  return next;
}

/** The questions the website would ask for these answers, in form order. */
export function visibleScreenedQuestions(source: EditableSource, answers: Answers): ScreenedKey[] {
  const s = readScreened(source, answers);
  if (!isGappProgram(source, answers)) return ['seekingPaidCaregiver', 'dob'];
  const base = {
    ...(source === 'gapp-website' ? answers : { ...(answers as HsAnswers).details, dob: (answers as HsAnswers).client?.dob }),
  } as Record<string, unknown>;
  const rel = screenCaregiverRelationship({ ...base, seekingPaidCaregiver: s.seekingPaidCaregiver, relationship: s.relationship, dob: s.dob });
  const freeText = source === 'gapp-website'
    ? String((answers as GappAnswers).diagnosis ?? '')
    : `${(answers as HsAnswers).details?.serviceNeeds ?? ''} ${(answers as HsAnswers).details?.additionalNotes ?? ''}`;
  const mixed = screenMixedPaidCaregiver({ ...base, freeText, seekingPaidCaregiver: s.seekingPaidCaregiver, paidCareBasis: s.paidCareBasis });
  return SCREENED_ORDER.filter((k) =>
    k === 'hasGuardianship' ? rel.asksGuardianship : k === 'paidCareBasis' ? mixed.asks : true,
  );
}

export function screenedValidation(source: EditableSource, answers: Answers): Partial<Record<ScreenedKey, string>> {
  const s = readScreened(source, answers);
  const e: Partial<Record<ScreenedKey, string>> = {};
  for (const k of visibleScreenedQuestions(source, answers)) {
    const v = s[k];
    const required = k === 'hasGuardianship' || k === 'paidCareBasis' || k === 'seekingPaidCaregiver' || k === 'wantsAgencyStaff' || k === 'relationship';
    if (!v) {
      if (required) e[k] = 'Choose an answer.';
      continue;
    }
    if (!ALLOWED[k](v)) e[k] = k === 'dob' ? 'Enter a valid date.' : 'Choose an answer from the list.';
  }
  return e;
}

/** What the website would say for these answers: null means it would accept them. */
export function refusalFor(source: EditableSource, answers: Answers): Refusal | null {
  return source === 'gapp-website' ? gappRefusal(answers as GappAnswers) : hsRefusal(answers as HsAnswers);
}

export function buildFor(source: EditableSource, answers: Answers): BuiltReferral {
  return source === 'gapp-website' ? buildGappReferral(answers as GappAnswers) : buildHsReferral(answers as HsAnswers);
}

/** Rows the screened answers decide; everything else on the card is kept. */
export function isScreenedRow(label: string): boolean {
  return label.startsWith('⚠') || ['Relationship to child', 'Date of birth', 'Age', 'Primary care need', 'Inferred service need',
    'Seeking paid caregiver', 'Wants agency staff in the home', 'Legal guardianship', 'Hands-on care mainly due to'].includes(label);
}

/**
 * The card's rows after a screened edit: rebuilt rows in the website's order,
 * screened ones from the rebuild, every other one as it is on the card now
 * (so a Medicaid ID or address staff already corrected is kept, and a row
 * staff cleared stays cleared), plus rows staff added that the website never
 * had, at the end.
 */
export function mergeScreenedRows(
  current: { label: string; value: string }[],
  rebuilt: { label: string; value: string }[],
): { label: string; value: string }[] {
  const byLabel = new Map(current.map((d) => [d.label, d]));
  const rebuiltLabels = new Set(rebuilt.map((d) => d.label));
  const out: { label: string; value: string }[] = [];
  for (const d of rebuilt) {
    if (isScreenedRow(d.label)) out.push(d);
    else if (byLabel.has(d.label)) out.push(byLabel.get(d.label)!);
  }
  for (const d of current) if (!rebuiltLabels.has(d.label) && !isScreenedRow(d.label)) out.push(d);
  return out;
}

/** The service line after the edit: re-inferred, unless staff had overridden it. */
export function serviceAfterEdit(current: ServiceKey | null, before: BuiltReferral, after: BuiltReferral): ServiceKey | null {
  return current === before.service ? after.service : current;
}

export function screenedValueLabel(k: ScreenedKey, v: string): string {
  if (!v) return '';
  if (k === 'seekingPaidCaregiver' || k === 'wantsAgencyStaff' || k === 'hasGuardianship') return v === 'yes' ? 'Yes' : v === 'no' ? 'No' : v;
  if (k === 'relationship') return RELATIONSHIP_OPTIONS.find((o) => o.code === v)?.label ?? v;
  if (k === 'paidCareBasis') return PAID_CARE_BASIS_OPTIONS.find((o) => o.code === v)?.label ?? v;
  if (k === 'careNeeds') return CARE_NEED_OPTIONS.find((o) => o.code === v)?.label ?? v;
  if (k === 'dob') return formatDateUS(v);
  return v;
}

/** Old → new for the timeline, for the answers that changed. */
export function screenedChanges(before: ScreenedAnswers, after: ScreenedAnswers): { label: string; from: string; to: string }[] {
  return SCREENED_ORDER.filter((k) => before[k] !== after[k]).map((k) => ({
    label: SCREENED_LABELS[k],
    from: screenedValueLabel(k, before[k]),
    to: screenedValueLabel(k, after[k]),
  }));
}
