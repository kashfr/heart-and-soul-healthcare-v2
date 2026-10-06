import { describe, it, expect } from 'vitest';
import {
  BEHAVIORAL_TRIGGER_TEXT,
  behavioralBlockTriggers,
  behavioralTriggerLinks,
  blockedSubmitEscort,
  fieldId,
  type BehavioralTriggerInput,
} from './referralGuards';

const PANEL = 'ref-block-behavioral';

describe('blockedSubmitEscort', () => {
  it('goes to the first missing field while equipment is blank, even if that field comes first', () => {
    expect(
      blockedSubmitEscort({ referrerName: 'x', equipment: 'x', wantsAgencyStaff: 'x' }, PANEL),
    ).toEqual({ kind: 'field', key: 'referrerName' });
  });

  it('goes to the diagnosis question while it is blank', () => {
    expect(blockedSubmitEscort({ diagnoses: 'x' }, 'ref-block-youngChild')).toEqual({
      kind: 'field',
      key: 'diagnoses',
    });
  });

  it('goes to the stop panel when the stop-lifting answers are in, even with other fields missing', () => {
    expect(blockedSubmitEscort({ referrerName: 'x', careNeeds: 'x' }, PANEL)).toEqual({
      kind: 'panel',
      id: PANEL,
    });
  });

  it('goes to the stop panel when nothing is missing', () => {
    expect(blockedSubmitEscort({}, 'ref-block-staff')).toEqual({ kind: 'panel', id: 'ref-block-staff' });
  });

  it('falls back to the first missing field when no panel is named', () => {
    expect(blockedSubmitEscort({ careNeeds: 'x' }, null)).toEqual({ kind: 'field', key: 'careNeeds' });
    expect(blockedSubmitEscort({}, null)).toBeNull();
  });
});

const base: BehavioralTriggerInput = {
  diagnoses: [],
  diagnosisOther: '',
  equipment: [],
  behaviorRisk: 'none',
  currentServices: [],
  careNeeds: 'personal',
  serviceNeeds: '',
  additionalNotes: '',
  seekingPaidCaregiver: 'yes',
};

describe('behavioralBlockTriggers', () => {
  it('is empty when the request is not a paid one', () => {
    expect(
      behavioralBlockTriggers({ ...base, diagnoses: ['autism'], seekingPaidCaregiver: 'no' }),
    ).toEqual([]);
  });

  it('is empty when skilled equipment clears the stop', () => {
    expect(
      behavioralBlockTriggers({ ...base, diagnoses: ['autism'], equipment: ['trach'], behaviorRisk: 'high' }),
    ).toEqual([]);
  });

  it('names the notes when they are the only place autism is described', () => {
    expect(
      behavioralBlockTriggers({ ...base, equipment: ['help_hygiene'], additionalNotes: 'he has autism' }),
    ).toEqual(['additionalNotes']);
  });

  it('names the service needs box separately from the notes', () => {
    expect(
      behavioralBlockTriggers({ ...base, equipment: ['help_hygiene'], serviceNeeds: 'ADHD and a speech delay' }),
    ).toEqual(['serviceNeeds']);
  });

  it('names the behavior answer when a medical diagnosis is checked (the Seizures variant)', () => {
    expect(
      behavioralBlockTriggers({
        ...base,
        diagnoses: ['seizures'],
        equipment: ['help_feeding'],
        behaviorRisk: 'high',
      }),
    ).toEqual(['behaviorRisk']);
  });

  it('names a behavioral-only diagnosis even with daily-care boxes checked (the Kehlani case)', () => {
    expect(
      behavioralBlockTriggers({
        ...base,
        diagnoses: ['autism', 'dev_delay', 'speech'],
        equipment: ['help_feeding', 'help_hygiene'],
      }),
    ).toEqual(['diagnoses']);
  });

  it('names the Other box when it describes autism and nothing is checked', () => {
    expect(
      behavioralBlockTriggers({ ...base, diagnosisOther: 'autism', equipment: ['equip_none'] }),
    ).toEqual(['diagnosisOther']);
  });

  it('names every contributing answer, in page order', () => {
    expect(
      behavioralBlockTriggers({
        ...base,
        diagnoses: ['autism'],
        behaviorRisk: 'high',
        careNeeds: 'behavioral',
        additionalNotes: 'autistic',
      }),
    ).toEqual(['additionalNotes', 'diagnoses', 'behaviorRisk', 'careNeeds']);
  });

  it('names the care-need answer when it alone decides', () => {
    expect(behavioralBlockTriggers({ ...base, careNeeds: 'behavioral', equipment: ['equip_none'] })).toEqual([
      'careNeeds',
    ]);
  });

  it('does not blame the notes when they also name a medical condition', () => {
    // Autism alone checked still blocks (the structured picture is behavioral
    // and no daily care is reported), but the notes are mixed, not behavioral.
    expect(
      behavioralBlockTriggers({ ...base, diagnoses: ['autism'], additionalNotes: 'autism and seizures' }),
    ).toEqual(['diagnoses']);
  });
});

describe('behavioral trigger copy and links', () => {
  it('has no em or en dashes in the family-facing sentences', () => {
    for (const text of Object.values(BEHAVIORAL_TRIGGER_TEXT)) {
      expect(text).not.toMatch(/[–—]/);
    }
  });

  it('gives one link per control, Title Case, pointing at the field wrapper', () => {
    expect(behavioralTriggerLinks(['diagnoses', 'diagnosisOther', 'behaviorRisk'])).toEqual([
      { anchor: fieldId('diagnoses'), label: 'Review the Diagnoses' },
      { anchor: fieldId('behaviorRisk'), label: 'Review the Behavior Answer' },
    ]);
    expect(behavioralTriggerLinks(['additionalNotes'])).toEqual([
      { anchor: 'ref-field-additionalNotes', label: 'Review the Additional Notes' },
    ]);
  });
});
