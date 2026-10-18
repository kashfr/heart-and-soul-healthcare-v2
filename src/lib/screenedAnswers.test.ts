import { describe, expect, it } from 'vitest';
import {
  buildFor, mergeScreenedRows, readScreened, refusalFor, screenedChanges, screenedValidation, serviceAfterEdit,
  visibleScreenedQuestions, writeScreened,
} from './screenedAnswers';
import { buildGappReferral, gappRefusal, hsRefusal, type GappAnswers, type HsAnswers } from './websiteIntake';
import { NO_AGENCY_STAFF_BLOCK, FOSTER_PAID_CAREGIVER_BLOCK } from './diagnosisCatalog';

// A 2-year-old with no skilled needs, parent submitting, not seeking pay.
const twoYearsAgo = (() => {
  const d = new Date();
  return `${d.getFullYear() - 2}-01-15`;
})();
const gapp: GappAnswers = {
  submitterName: 'Pat Parent', relationship: 'parent', fullName: 'Kid Example', phoneNumber: '(404) 555-1212',
  emailAddress: 'pat@example.com', county: 'Fulton', dob: twoYearsAgo, diagnosis: 'Asthma',
  diagnoses: [], equipment: ['help_hygiene'], careNeeds: 'personal', seekingPaidCaregiver: 'no', wantsAgencyStaff: 'yes',
  childsMedicaidID: '', provideLater: true,
};
const hs: HsAnswers = {
  client: { firstName: 'Kid', lastName: 'Example', phone: '(404) 555-1212', email: 'pat@example.com', county: 'Fulton', dob: twoYearsAgo },
  program: { interest: 'gapp', medicaidNumber: '' },
  referrer: { name: 'Pat Parent', source: 'family' },
  details: { relationship: 'parent', diagnoses: [], equipment: ['help_hygiene'], careNeeds: 'personal', seekingPaidCaregiver: 'no', wantsAgencyStaff: 'yes', serviceNeeds: '', additionalNotes: '' },
  physician: {},
};

describe('the website rules, shared', () => {
  it('accepts the starting answers on both sites', () => {
    expect(gappRefusal(gapp)).toBeNull();
    expect(hsRefusal(hs)).toBeNull();
  });
  it('refuses declining agency staff, a foster parent asking to be paid, and a young child with no skilled needs', () => {
    expect(gappRefusal({ ...gapp, wantsAgencyStaff: 'no' })?.reason).toBe(NO_AGENCY_STAFF_BLOCK);
    expect(gappRefusal({ ...gapp, seekingPaidCaregiver: 'yes', relationship: 'foster', equipment: ['trach'] })?.reason).toBe(FOSTER_PAID_CAREGIVER_BLOCK);
    expect(gappRefusal({ ...gapp, seekingPaidCaregiver: 'yes' })?.code).toBe('young-child-paid-caregiver');
    expect(hsRefusal({ ...hs, details: { ...hs.details, seekingPaidCaregiver: 'yes' } })?.code).toBe('young-child-paid-caregiver');
  });
});

describe('editing screened answers', () => {
  it('reads and writes where each website keeps them', () => {
    expect(readScreened('gapp-website', gapp)).toMatchObject({ seekingPaidCaregiver: 'no', relationship: 'parent', dob: twoYearsAgo });
    const next = writeScreened('hs-website', hs, { seekingPaidCaregiver: 'yes', dob: '2015-01-01' }) as HsAnswers;
    expect(next.details.seekingPaidCaregiver).toBe('yes');
    expect(next.client.dob).toBe('2015-01-01');
    expect(hs.details.seekingPaidCaregiver).toBe('no');
  });

  it('turning paid caregiver on for a young child is refused exactly as the website refuses it', () => {
    for (const [source, answers] of [['gapp-website', gapp], ['hs-website', hs]] as const) {
      const next = writeScreened(source, answers, { seekingPaidCaregiver: 'yes' });
      expect(refusalFor(source, next)?.code).toBe('young-child-paid-caregiver');
    }
  });

  it('asks the follow-ups the website asks', () => {
    expect(visibleScreenedQuestions('gapp-website', gapp)).not.toContain('hasGuardianship');
    const grand = writeScreened('gapp-website', { ...gapp, equipment: ['trach'] }, { seekingPaidCaregiver: 'yes', relationship: 'grandparent' });
    expect(visibleScreenedQuestions('gapp-website', grand)).toContain('hasGuardianship');
    expect(screenedValidation('gapp-website', grand).hasGuardianship).toBe('Choose an answer.');
    const mixed = writeScreened('gapp-website', { ...gapp, diagnoses: ['autism', 'seizures'], equipment: ['seizure_meds'] }, { seekingPaidCaregiver: 'yes' });
    expect(visibleScreenedQuestions('gapp-website', mixed)).toContain('paidCareBasis');
    expect(refusalFor('gapp-website', writeScreened('gapp-website', mixed, { paidCareBasis: 'behavioral' }))?.code).toBe('mixed-paid-caregiver');
    expect(refusalFor('gapp-website', writeScreened('gapp-website', mixed, { paidCareBasis: 'medical' }))).toBeNull();
  });

  it('only asks paid caregiver and date of birth outside GAPP', () => {
    expect(visibleScreenedQuestions('hs-website', { ...hs, program: { interest: 'now-comp' } })).toEqual(['seekingPaidCaregiver', 'dob']);
  });

  it('rebuilds the screened rows and keeps staff corrections to the rest', () => {
    const older = { ...gapp, dob: '2015-03-01', equipment: ['trach'] };
    const card = [
      ...buildGappReferral(older).details.map((d) => (d.label === "Member's Medicaid ID" ? { ...d, value: '222120339644' } : d)),
      { label: "Child's physician", value: 'Dr. Lin' },
    ];
    const next = writeScreened('gapp-website', older, { seekingPaidCaregiver: 'yes' });
    const merged = mergeScreenedRows(card, buildFor('gapp-website', next).details);
    const row = (l: string) => merged.find((d) => d.label === l)?.value;
    expect(row('Seeking paid caregiver')).toBe('Yes');
    expect(row("Member's Medicaid ID")).toBe('222120339644');
    expect(merged.at(-1)).toEqual({ label: "Child's physician", value: 'Dr. Lin' });
  });

  it('re-infers the service line unless staff had overridden it', () => {
    const before = buildFor('gapp-website', gapp);
    const after = { ...before, service: 'nursing' as const };
    expect(serviceAfterEdit(before.service, before, after)).toBe('nursing');
    expect(serviceAfterEdit('behavioral', before, after)).toBe('behavioral');
  });

  it('describes changes in the website’s words', () => {
    const b = readScreened('gapp-website', gapp);
    expect(screenedChanges(b, { ...b, seekingPaidCaregiver: 'yes', relationship: 'grandparent' })).toEqual([
      { label: 'Seeking paid caregiver', from: 'No', to: 'Yes' },
      { label: 'Relationship to child', from: 'Parent', to: 'Grandparent' },
    ]);
  });
});
