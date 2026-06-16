/**
 * Common medication dosing frequencies for the order-form dropdown.
 *
 * Each entry is spelled out in plain English with the widely-accepted
 * abbreviation in parentheses where one exists. Error-prone abbreviations on
 * the Joint Commission "Do Not Use" list (QD / Q.D. and QOD / Q.O.D., which get
 * confused with each other and with QID) are deliberately written out as
 * "Once daily" and "Every other day" rather than abbreviated.
 *
 * The stored value is the full label string (e.g. "Twice daily (BID)"), the
 * same pattern the Route dropdown uses. The field stays optional. Existing
 * free-text values that predate this list are preserved by the form (it injects
 * the current value as a selectable option if it isn't one of these).
 */
export const MED_FREQUENCIES = [
  'Once daily',
  'Twice daily (BID)',
  'Three times daily (TID)',
  'Four times daily (QID)',
  'Every morning',
  'Every evening',
  'At bedtime',
  'Every other day',
  'Every 4 hours (Q4H)',
  'Every 6 hours (Q6H)',
  'Every 8 hours (Q8H)',
  'Every 12 hours (Q12H)',
  'Weekly',
  'Monthly',
  'As needed (PRN)',
  'Continuous',
] as const;
