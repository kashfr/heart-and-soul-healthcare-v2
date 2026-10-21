/**
 * Sliding-scale dosing (insulin given according to a blood glucose reading).
 *
 * A sliding-scale order has no fixed dose: the physician writes a table of
 * blood glucose ranges and the units to give for each, usually checked before
 * meals and at bedtime. The order stores that table (MarOrder.slidingScale);
 * at charting time the nurse enters the reading and the app looks the dose up,
 * so nobody reads a table by eye at the bedside.
 *
 * Pure and Firebase-free: shared by the order forms, the charting surfaces,
 * the server-side med-change route, and the PDF route.
 */

export interface SlidingScaleRow {
  /** Lowest blood glucose (mg/dL) this row covers. The first row starts at 0. */
  min: number;
  /** Highest blood glucose this row covers; null on the last row ("and above"). */
  max: number | null;
  /** Units to give in this range. 0 = no insulin. */
  units: number;
  /** What else the order says to do in this range ("Call the physician"). */
  instruction: string;
}

/** The scale as the order forms hold it. Each row only asks for where it ENDS:
 *  it starts one above the row before it, so the ranges can never overlap or
 *  leave a gap, and the last row is always open-ended ("and above"). */
export interface SlidingScaleFormRow {
  upTo: string;
  units: string;
  instruction: string;
}

/** Stored as the order's dose so every surface that prints "dose units" reads
 *  sensibly for an order whose dose is looked up at charting time. */
export const SLIDING_SCALE_DOSE_LABEL = 'Per sliding scale';
/** Insulin is dosed in units; the amount given is snapshotted with this. */
export const SLIDING_SCALE_UNITS = 'units';
export const GLUCOSE_UNIT = 'mg/dL';
/** Below this is hypoglycemia (ADA level 1). Used for the charting alert only;
 *  what to DO about it comes from the order's own instructions. */
export const HYPOGLYCEMIA_THRESHOLD = 70;
/** Plausibility window for a typed meter reading. Home meters read roughly
 *  20 to 600 and show LO / HI outside that, so anything beyond this window is
 *  a typo rather than a reading. */
export const GLUCOSE_MIN = 10;
export const GLUCOSE_MAX = 999;
const MAX_ROWS = 15;
const MAX_UNITS = 100;

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Coerce whatever is stored or posted into clean rows, sorted by range.
 *  Rows that are not numbers are dropped; validateSlidingScale judges the rest. */
export function parseSlidingScale(input: unknown): SlidingScaleRow[] {
  if (!Array.isArray(input)) return [];
  const rows: SlidingScaleRow[] = [];
  for (const raw of input.slice(0, MAX_ROWS * 2)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const min = toNumber(r.min);
    const units = toNumber(r.units);
    const openEnded = r.max === null || r.max === undefined || r.max === '';
    const max = openEnded ? null : toNumber(r.max);
    if (min === null || units === null) continue;
    if (max === null && !openEnded) continue;
    rows.push({ min, max, units, instruction: String(r.instruction ?? '').trim() });
  }
  return rows.sort((a, b) => a.min - b.min);
}

/** True when the order doses by a sliding scale. */
export function hasSlidingScale(order: { slidingScale?: unknown } | null | undefined): boolean {
  return parseSlidingScale(order?.slidingScale).length > 0;
}

/**
 * Why a scale cannot be saved, or null when it is sound. The rules make every
 * possible reading land on exactly one row: start at 0, no gaps, no overlaps,
 * and an open-ended last row.
 */
export function validateSlidingScale(rows: SlidingScaleRow[]): string | null {
  if (rows.length < 2) return 'A sliding scale needs at least two blood glucose ranges.';
  if (rows.length > MAX_ROWS) return `A sliding scale can have at most ${MAX_ROWS} ranges.`;
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const last = i === rows.length - 1;
    if (!Number.isInteger(r.min) || (r.max !== null && !Number.isInteger(r.max))) {
      return 'Sliding scale blood glucose values must be whole numbers.';
    }
    if (i === 0 && r.min !== 0) return 'The first sliding scale range must start at 0.';
    if (i > 0) {
      const prev = rows[i - 1];
      if (prev.max === null || r.min !== prev.max + 1) {
        return 'Sliding scale ranges must run in order with no gaps or overlaps.';
      }
    }
    if (last && r.max !== null) return 'The last sliding scale range must be open-ended ("and above").';
    if (!last && (r.max === null || r.max < r.min)) {
      return 'Each sliding scale range must end at or above where it starts.';
    }
    if (r.max !== null && r.max > GLUCOSE_MAX) {
      return `Sliding scale blood glucose values must be ${GLUCOSE_MAX} or lower.`;
    }
    if (r.units < 0 || r.units > MAX_UNITS) {
      return `Sliding scale units must be between 0 and ${MAX_UNITS}.`;
    }
  }
  return null;
}

/** The form's rows as stored rows. Null when any row is incomplete or not a
 *  number (validateSlidingScaleForm says which). */
export function slidingScaleFromForm(form: SlidingScaleFormRow[]): SlidingScaleRow[] | null {
  const rows: SlidingScaleRow[] = [];
  let min = 0;
  for (let i = 0; i < form.length; i += 1) {
    const f = form[i];
    const last = i === form.length - 1;
    const units = toNumber(f.units);
    if (units === null) return null;
    let max: number | null = null;
    if (!last) {
      max = toNumber(f.upTo);
      if (max === null || !Number.isInteger(max)) return null;
    }
    rows.push({ min, max, units, instruction: f.instruction.trim() });
    if (max !== null) min = max + 1;
  }
  return rows;
}

/** Stored rows back into the form's shape, for editing an existing order. */
export function slidingScaleToForm(rows: SlidingScaleRow[]): SlidingScaleFormRow[] {
  return rows.map((r) => ({
    upTo: r.max === null ? '' : String(r.max),
    units: String(r.units),
    instruction: r.instruction || '',
  }));
}

/** The message to show under the scale on an order form, or null when it is
 *  ready to save. Worded for the person typing it in from the order. */
export function validateSlidingScaleForm(form: SlidingScaleFormRow[]): string | null {
  if (form.length < 2) return 'Add at least two blood glucose ranges from the order.';
  for (let i = 0; i < form.length; i += 1) {
    const f = form[i];
    const last = i === form.length - 1;
    if (!last) {
      const upTo = toNumber(f.upTo);
      if (upTo === null || !Number.isInteger(upTo)) {
        return `Sliding scale range ${i + 1}: enter the blood glucose this range goes up to (a whole number).`;
      }
    }
    if (toNumber(f.units) === null) {
      return `Sliding scale range ${i + 1}: enter the units to give (enter 0 when no insulin is given).`;
    }
  }
  const rows = slidingScaleFromForm(form);
  if (!rows) return 'Check the sliding scale: every range needs a number.';
  for (let i = 0; i < rows.length - 1; i += 1) {
    if ((rows[i].max as number) < rows[i].min) {
      return `Sliding scale range ${i + 1}: it must end at or above ${rows[i].min}, where it starts.`;
    }
  }
  return validateSlidingScale(rows);
}

/** A blank scale laid out on the ranges most orders use, with the units left
 *  EMPTY on purpose: the amounts must come from the physician's order, never
 *  from a default. */
export function starterSlidingScaleForm(): SlidingScaleFormRow[] {
  return [
    { upTo: '69', units: '', instruction: '' },
    { upTo: '150', units: '', instruction: '' },
    { upTo: '200', units: '', instruction: '' },
    { upTo: '250', units: '', instruction: '' },
    { upTo: '300', units: '', instruction: '' },
    { upTo: '350', units: '', instruction: '' },
    { upTo: '400', units: '', instruction: '' },
    { upTo: '', units: '', instruction: '' },
  ];
}

/** Parse a typed meter reading. Null when it is not a plausible whole number. */
export function parseGlucoseReading(value: string | undefined | null): number | null {
  const s = String(value ?? '').trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n >= GLUCOSE_MIN && n <= GLUCOSE_MAX ? n : null;
}

/** The row a reading falls on, or null when the scale does not cover it (only
 *  possible on a malformed legacy scale; a validated one covers everything). */
export function findSlidingScaleRow(rows: SlidingScaleRow[], reading: number): SlidingScaleRow | null {
  for (const r of rows) {
    if (reading >= r.min && (r.max === null || reading <= r.max)) return r;
  }
  return null;
}

/** "Below 70", "151-200", "Above 400": the range as an order reads. */
export function formatScaleRange(row: SlidingScaleRow): string {
  if (row.max === null) return row.min === 0 ? 'Any reading' : `Above ${row.min - 1}`;
  if (row.min === 0) return `Below ${row.max + 1}`;
  return `${row.min}-${row.max}`;
}

/** "4 units", "1 unit", "0 units (no insulin)". */
export function formatScaleUnits(units: number): string {
  if (units === 0) return '0 units (no insulin)';
  return `${units} ${units === 1 ? 'unit' : 'units'}`;
}

/** One row as a sentence, snapshotted onto each administration so the record
 *  shows what the scale said at the time even if the order is later changed. */
export function describeScaleRow(row: SlidingScaleRow): string {
  const base = `${formatScaleRange(row)} ${GLUCOSE_UNIT}: ${formatScaleUnits(row.units)}`;
  return row.instruction ? `${base}. ${row.instruction}` : base;
}

/** The whole scale on one line, for the MAR row and the printed record. */
export function summarizeSlidingScale(rows: SlidingScaleRow[]): string {
  return rows
    .map((r) => `${formatScaleRange(r)}: ${r.units}${r.instruction ? ` (${r.instruction})` : ''}`)
    .join(' | ');
}

/** Canonical form of a scale, for deciding whether an edit changed it. */
export function slidingScaleKey(input: unknown): string {
  return parseSlidingScale(input)
    .map((r) => `${r.min}-${r.max === null ? '' : r.max}:${r.units}:${r.instruction}`)
    .join('|');
}

export interface ScaleLookup {
  /** The parsed reading, or null when what was typed is not a plausible one. */
  reading: number | null;
  row: SlidingScaleRow | null;
  /** Units the scale calls for, as the stored string ('' when no row matched). */
  scaleDose: string;
  /** The matched row in words, for the record. */
  scaleRange: string;
  /** Reading is below the hypoglycemia threshold. */
  low: boolean;
}

/** Everything the charting surfaces need from one typed reading. */
export function lookupScaleDose(rows: SlidingScaleRow[], typed: string | undefined | null): ScaleLookup {
  const reading = parseGlucoseReading(typed);
  const row = reading === null ? null : findSlidingScaleRow(rows, reading);
  return {
    reading,
    row,
    scaleDose: row ? String(row.units) : '',
    scaleRange: row ? describeScaleRow(row) : '',
    low: reading !== null && reading < HYPOGLYCEMIA_THRESHOLD,
  };
}

/** Whether a typed "units given" amount is a usable number (decimals allowed:
 *  some pens dose in half units). */
export function parseUnitsGiven(value: string | undefined | null): number | null {
  const n = toNumber(value);
  return n !== null && n >= 0 && n <= MAX_UNITS ? n : null;
}

// ---------------------------------------------------------------------------
// Charting a sliding-scale dose.
// ---------------------------------------------------------------------------

/** What the nurse enters when charting one sliding-scale dose. */
export interface ScaleChartingEntry {
  glucoseReading: string;
  /** She is recording an amount that differs from what the scale calls for. */
  customDose: boolean;
  /** The amount actually given, when customDose is on. */
  unitsGiven: string;
  /** Why it differs, when customDose is on. */
  deviationReason: string;
}

export const EMPTY_SCALE_ENTRY: ScaleChartingEntry = {
  glucoseReading: '',
  customDose: false,
  unitsGiven: '',
  deviationReason: '',
};

export type ScaleChartingField = 'glucoseReading' | 'unitsGiven' | 'deviationReason';

export interface ScaleChartingResult {
  errors: Partial<Record<ScaleChartingField, string>>;
  /** The meter reading as stored ('' when none was entered). */
  glucoseReading: string;
  /** Units the scale called for at that reading ('' when no reading). */
  scaleDose: string;
  /** The matched range in words ('' when no reading). */
  scaleRange: string;
  /** Units actually given, as stored ('' unless this is a GIVEN dose). */
  doseGiven: string;
  /** Kept only when the given amount differs from the scale. */
  deviationReason: string;
}

/**
 * Judge one sliding-scale entry and work out what goes on the record. Shared
 * by the MAR grid's dose form, the progress note's dose card, and the note's
 * submit gate, so all three enforce the same rules:
 *  - a GIVEN entry needs a plausible meter reading (the dose comes from it);
 *  - a held or refused entry may carry a reading but does not need one;
 *  - an amount that differs from the scale needs the amount and the reason.
 */
export function resolveScaleCharting(
  rows: SlidingScaleRow[],
  status: string,
  entry: ScaleChartingEntry,
): ScaleChartingResult {
  const errors: ScaleChartingResult['errors'] = {};
  const typed = (entry.glucoseReading || '').trim();
  const lookup = lookupScaleDose(rows, typed);
  if (status === 'given' && !typed) {
    errors.glucoseReading = 'Enter the blood glucose reading from the meter. The dose is looked up from it.';
  } else if (typed && lookup.reading === null) {
    errors.glucoseReading = `Enter the reading as a whole number between ${GLUCOSE_MIN} and ${GLUCOSE_MAX} ${GLUCOSE_UNIT}. If the meter shows HI or LO, call the prescriber.`;
  } else if (typed && !lookup.row) {
    errors.glucoseReading = 'This reading is not covered by the sliding scale on the order. Have the order corrected before charting.';
  }
  let doseGiven = '';
  let deviationReason = '';
  if (status === 'given' && lookup.row) {
    if (entry.customDose) {
      const given = parseUnitsGiven(entry.unitsGiven);
      if (given === null) {
        errors.unitsGiven = 'Enter the units that were actually given.';
      } else {
        doseGiven = String(given);
        if (given !== lookup.row.units) {
          deviationReason = (entry.deviationReason || '').trim();
          if (!deviationReason) {
            errors.deviationReason = 'Explain why the amount given differs from the sliding scale.';
          }
        }
      }
    } else {
      doseGiven = lookup.scaleDose;
    }
  }
  return {
    errors,
    glucoseReading: lookup.reading === null ? '' : String(lookup.reading),
    scaleDose: lookup.scaleDose,
    scaleRange: lookup.scaleRange,
    doseGiven,
    deviationReason,
  };
}

/** A sliding-scale check where the reading called for no insulin: recorded as
 *  done (status 'given') with 0 units, and worded that way wherever it shows. */
export function isNoInsulinEntry(a: {
  status?: string;
  glucoseReading?: string;
  doseSnapshot?: string;
}): boolean {
  return a.status === 'given' && !!(a.glucoseReading || '').trim() && Number(a.doseSnapshot) === 0;
}

/** The stored fields of a progress-note dose mark that belong to a sliding
 *  scale (see marAdminStore). scaleDose / scaleRange are looked up from the
 *  order's scale when the reading is typed, so the note's submit gate and
 *  write need only the mark, not the order. */
export interface ScaleMarkFields {
  status?: string;
  glucoseReading?: string;
  scaleDose?: string;
  scaleRange?: string;
  scaleCustomDose?: boolean;
  scaleUnitsGiven?: string;
  scaleDeviationReason?: string;
}

/**
 * What is still missing from a sliding-scale dose mark, as phrases for the
 * note's "please complete" list. Judged from the mark alone because the dose
 * card may be collapsed or never mounted by the time the note is submitted.
 */
export function scaleMarkProblems(m: ScaleMarkFields): string[] {
  const out: string[] = [];
  const typed = (m.glucoseReading || '').trim();
  const reading = parseGlucoseReading(typed);
  if (m.status === 'given' && !typed) {
    out.push('the blood glucose reading (the dose is looked up from it)');
  } else if (typed && reading === null) {
    out.push(`a blood glucose reading between ${GLUCOSE_MIN} and ${GLUCOSE_MAX}`);
  }
  if (m.status === 'given' && reading !== null) {
    const scaleDose = (m.scaleDose || '').trim();
    if (!scaleDose) {
      out.push('a reading the sliding scale covers (have the order corrected if it does not)');
    } else if (m.scaleCustomDose) {
      const given = parseUnitsGiven(m.scaleUnitsGiven);
      if (given === null) out.push('the units actually given');
      else if (given !== Number(scaleDose) && !(m.scaleDeviationReason || '').trim()) {
        out.push('why the amount given differs from the sliding scale');
      }
    }
  }
  return out;
}

/** The units actually given for a GIVEN sliding-scale mark, as stored. */
export function scaleMarkDoseGiven(m: ScaleMarkFields): string {
  if (m.scaleCustomDose) {
    const given = parseUnitsGiven(m.scaleUnitsGiven);
    return given === null ? '' : String(given);
  }
  return (m.scaleDose || '').trim();
}
