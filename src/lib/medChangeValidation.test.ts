import { describe, expect, it } from 'vitest';
import { medChangeServerErrorField, validateMedChangeForm, type MedChangeFormValues } from './medChangeValidation';

const TODAY = '2026-09-17';

function base(over: Partial<MedChangeFormValues> = {}): MedChangeFormValues {
  return {
    mode: 'add',
    reason: 'New physician order',
    targetOrderId: '',
    medName: 'Acetaminophen',
    dose: '500',
    units: 'mg',
    route: 'PO (by mouth)',
    isPRN: false,
    times: ['08:00'],
    indication: '',
    orderingPhysician: 'Dr. Smith',
    orderSignedDate: '',
    physicianUnknown: false,
    today: TODAY,
    ...over,
  };
}

describe('validateMedChangeForm', () => {
  it('passes a complete add', () => {
    expect(validateMedChangeForm(base())).toEqual({});
  });

  it('requires a reason on every mode', () => {
    for (const mode of ['add', 'change', 'discontinue'] as const) {
      const e = validateMedChangeForm(base({ mode, reason: '   ', targetOrderId: 'o1' }));
      expect(e.reason).toBe('A reason is required.');
    }
  });

  it('discontinue needs only a target and a reason', () => {
    expect(validateMedChangeForm(base({ mode: 'discontinue', targetOrderId: 'o1', medName: '', route: '' }))).toEqual({});
    const e = validateMedChangeForm(base({ mode: 'discontinue', targetOrderId: '' }));
    expect(e).toEqual({ targetOrderId: 'Choose the medication to discontinue.' });
  });

  it('change needs the target order', () => {
    expect(validateMedChangeForm(base({ mode: 'change' })).targetOrderId).toBe('Choose the medication to change.');
    expect(validateMedChangeForm(base({ mode: 'change', targetOrderId: 'o1' }))).toEqual({});
  });

  it('flags each missing med field with the shared message', () => {
    const e = validateMedChangeForm(base({ medName: '', dose: ' ', units: '', route: '' }));
    const msg = 'Medication, dose, units, and route are required.';
    expect(e.medName).toBe(msg);
    expect(e.dose).toBe(msg);
    expect(e.units).toBe(msg);
    expect(e.route).toBe(msg);
  });

  it('a check-style order drops dose/units but needs at least two readings', () => {
    const noOpts = validateMedChangeForm(base({ dose: '', units: '', valueLabel: 'Gastric residual', valueOptions: '10' }));
    expect(noOpts.dose).toBeUndefined();
    expect(noOpts.units).toBeUndefined();
    expect(noOpts.valueOptions).toBe('Add at least two allowed readings so the nurse picks from a list instead of typing.');
    expect(validateMedChangeForm(base({ dose: '', units: '', valueLabel: 'Gastric residual', valueOptions: '0, 10, 20' }))).toEqual({});
    const named = validateMedChangeForm(base({ medName: '', valueLabel: 'Gastric residual', valueOptions: '0, 10' }));
    expect(named.medName).toBe('Name and route are required.');
  });

  it('rejects a future signed date', () => {
    expect(validateMedChangeForm(base({ orderSignedDate: '2026-09-18' })).orderSignedDate).toBe('"Physician order signed on" cannot be a future date.');
    expect(validateMedChangeForm(base({ orderSignedDate: TODAY }))).toEqual({});
  });

  it('requires a real ordering physician unless flagged unknown', () => {
    expect(validateMedChangeForm(base({ orderingPhysician: '' })).orderingPhysician).toMatch(/^Ordering physician is required/);
    expect(validateMedChangeForm(base({ orderingPhysician: 'N/A' })).orderingPhysician).toMatch(/actual name/);
    expect(validateMedChangeForm(base({ orderingPhysician: 'N/A', physicianUnknown: true }))).toEqual({});
  });

  it('scheduled orders need a time; PRN orders need an indication', () => {
    expect(validateMedChangeForm(base({ times: ['', ''] })).times).toBe('Add at least one scheduled time, or choose the "As needed (PRN)" frequency.');
    expect(validateMedChangeForm(base({ isPRN: true, times: [] })).indication).toBe('Add an indication: PRN doses are documented against what the med is for.');
    expect(validateMedChangeForm(base({ isPRN: true, times: [], indication: 'Pain' }))).toEqual({});
  });

  it('a dose given during the shift needs a time and, for non-nurses, a name', () => {
    const e = validateMedChangeForm(base({ doseGiven: true, doseByType: 'family', doseByName: '', doseTime: '' }));
    expect(e.doseByName).toBe('Enter who administered the dose.');
    expect(e.doseTime).toBe('Enter the time the dose was given.');
    expect(validateMedChangeForm(base({ doseGiven: true, doseByType: 'nurse', doseTime: '09:15' }))).toEqual({});
    // Only Add carries the dose block.
    expect(validateMedChangeForm(base({ mode: 'change', targetOrderId: 'o1', doseGiven: true, doseByType: 'family' }))).toEqual({});
  });

  it('reports every problem at once rather than the first one', () => {
    const e = validateMedChangeForm(base({ reason: '', medName: '', orderingPhysician: '', times: [] }));
    expect(Object.keys(e).sort()).toEqual(['medName', 'orderingPhysician', 'reason', 'times']);
  });
});

describe('medChangeServerErrorField', () => {
  it('lands the server messages that name a field on that field', () => {
    expect(medChangeServerErrorField('A reason is required.')).toBe('reason');
    expect(medChangeServerErrorField('Choose the medication to change or discontinue.')).toBe('targetOrderId');
    expect(medChangeServerErrorField('Medication, dose, units, and route are required.')).toBe('medName');
    expect(medChangeServerErrorField('A check-style order needs at least two allowed readings.')).toBe('valueOptions');
    expect(medChangeServerErrorField('Ordering physician is required (a real name, not a placeholder); this change reflects a physician order.')).toBe('orderingPhysician');
    expect(medChangeServerErrorField('Add at least one scheduled time, or choose the "As needed (PRN)" frequency.')).toBe('times');
    expect(medChangeServerErrorField('An indication is required for PRN medications.')).toBe('indication');
  });

  it('leaves messages that name no field for the banner', () => {
    expect(medChangeServerErrorField('You can only manage medications for clients on your care team.')).toBeNull();
    expect(medChangeServerErrorField('Client not found.')).toBeNull();
    expect(medChangeServerErrorField('')).toBeNull();
  });
});
