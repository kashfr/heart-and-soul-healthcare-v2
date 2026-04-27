/**
 * Shared form-validation helpers for the progress-note form.
 *
 * Each `validate` rule on an RHF `register()` call should return `true` when
 * the value is acceptable, or a string error message when it isn't. We use
 * these for typo-guards on numeric fields — bounds wide enough that real
 * abnormal-but-valid values pass (the abnormal-vitals helper catches those
 * separately as warnings) but narrow enough that obvious data-entry typos
 * (e.g. 250% meal consumed, 970°F temperature) get rejected at submit time.
 */

/**
 * Returns an RHF `validate` function that accepts:
 * - empty string (required-ness is enforced separately by `required`)
 * - any number in `[min, max]`
 *
 * Rejects everything else with the given message (or "Must be a number"
 * for non-numeric input).
 */
export function rangeValidator(min: number, max: number, message: string) {
  return (raw: string) => {
    if (!raw) return true;
    const n = Number(raw);
    if (Number.isNaN(n)) return 'Must be a number';
    return (n >= min && n <= max) || message;
  };
}

/**
 * Hard typo-guard ranges for vitals on page 2. See the docstring at the
 * top of this file for the rationale; the specific bounds are documented
 * in commit b54b5ae (or whatever ships this).
 */
export const VITAL_RANGE = {
  temperature: { min: 80, max: 115, label: 'Must be 80–115 °F' },
  systolic: { min: 50, max: 280, label: 'Must be 50–280 mmHg' },
  diastolic: { min: 30, max: 180, label: 'Must be 30–180 mmHg' },
  pulse: { min: 20, max: 250, label: 'Must be 20–250 bpm' },
  respiration: { min: 4, max: 80, label: 'Must be 4–80 breaths/min' },
  o2: { min: 50, max: 100, label: 'Must be 50–100 %' },
  glucose: { min: 20, max: 800, label: 'Must be 20–800 mg/dL' },
} as const;
