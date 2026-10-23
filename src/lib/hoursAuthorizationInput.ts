import { monthsBetween, type HoursAuthorization } from './shiftHours';

/**
 * Server-side check for an hours authorization typed by someone who is not
 * the owner (the assistant workspace). Mirrors the form's own checks so a
 * forged request can never store a line the form would have refused.
 *
 * Pure module (no Firestore) so validation is unit-testable.
 */
export type HoursAuthorizationFields = Omit<HoursAuthorization, 'id' | 'patientId'>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_HOURS = 744;

function realDate(v: string): boolean {
  return ISO.test(v) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
}

function hours(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_HOURS ? v : undefined;
}

function shortText(v: unknown, max: number): string | undefined {
  if (v === undefined || v === null) return '';
  return typeof v === 'string' && v.length <= max ? v.trim() : undefined;
}

export function validateHoursAuthorizationInput(raw: unknown): { ok: true; fields: HoursAuthorizationFields } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Invalid authorization.' };
  const r = raw as Record<string, unknown>;
  const from = typeof r.from === 'string' ? r.from : '';
  const to = typeof r.to === 'string' ? r.to : '';
  if (!realDate(from)) return { ok: false, error: 'Enter the effective date.' };
  if (!realDate(to)) return { ok: false, error: 'Enter the end date.' };
  if (from > to) return { ok: false, error: 'The end date is before the effective date.' };
  if (monthsBetween(from, to).length > 60) return { ok: false, error: 'An authorization cannot span more than five years.' };
  const covers = r.covers === 'oversight' ? 'oversight' : r.covers === 'shift' ? 'shift' : null;
  const kind = r.kind === 'unskilled' ? 'unskilled' : r.kind === 'skilled' ? 'skilled' : null;
  const rateBasis = r.rateBasis === 'day' || r.rateBasis === 'week' || r.rateBasis === 'month' ? r.rateBasis : null;
  if (!covers || !kind || !rateBasis) return { ok: false, error: 'Choose what the authorization covers, its type, and its rate period.' };
  const rateHours = hours(r.rateHours);
  if (rateHours === undefined) return { ok: false, error: `Hours must be a number between 0 and ${MAX_HOURS}.` };
  let totalUnits: number | null = null;
  if (r.totalUnits !== null && r.totalUnits !== undefined && r.totalUnits !== '') {
    if (typeof r.totalUnits !== 'number' || !Number.isFinite(r.totalUnits) || r.totalUnits < 0 || r.totalUnits > 1_000_000) {
      return { ok: false, error: 'Total units must be a positive number.' };
    }
    totalUnits = r.totalUnits;
  }
  const allowedMonths = new Set(monthsBetween(from, to));
  const monthOverrides: Record<string, number> = {};
  const rawOverrides = r.monthOverrides ?? {};
  if (typeof rawOverrides !== 'object' || Array.isArray(rawOverrides)) return { ok: false, error: 'Invalid month hours.' };
  for (const [ym, v] of Object.entries(rawOverrides as Record<string, unknown>)) {
    const n = hours(v);
    if (!allowedMonths.has(ym) || n === undefined || n === null) return { ok: false, error: `Month hours must fall inside the window and be 0 to ${MAX_HOURS}.` };
    monthOverrides[ym] = n;
  }
  if (rateHours === null && Object.keys(monthOverrides).length === 0) {
    return { ok: false, error: 'Enter the hours rate from the authorization, or the block hours for at least one month.' };
  }
  const paNumber = shortText(r.paNumber, 60);
  const serviceCode = shortText(r.serviceCode, 60);
  const note = shortText(r.note, 500);
  if (paNumber === undefined || serviceCode === undefined || note === undefined) return { ok: false, error: 'Invalid authorization details.' };
  return { ok: true, fields: { paNumber, kind, covers, rateBasis, rateHours, from, to, monthOverrides, totalUnits, serviceCode, note } };
}
