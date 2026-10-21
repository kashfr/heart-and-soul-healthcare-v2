// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const store: { doc: Record<string, unknown> | null; updates: Record<string, unknown>[]; activity: Record<string, unknown>[] } = { doc: null, updates: [], activity: [] };
vi.mock('./firebaseAdmin', () => ({
  adminDb: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: !!store.doc, data: () => store.doc }),
        update: async (u: Record<string, unknown>) => { store.updates.push(u); },
        collection: () => ({ add: async (a: Record<string, unknown>) => { store.activity.push(a); } }),
      }),
    }),
  }),
}));

import { phoneReferralRecord, updatePhoneReferral } from './referrals';
import { emptyPhoneReferral, type PhoneReferralInput } from './phoneReferralShared';
import type { AuthedCaller } from './adminAuthGuard';

const caller = { uid: 'u1', role: 'va', profile: { displayName: 'Vera Assistant' } } as unknown as AuthedCaller;
const input = (over: Partial<PhoneReferralInput> = {}): PhoneReferralInput => ({
  ...emptyPhoneReferral(), callerName: 'Marcus Reed', callerPhone: '4045551212', clientName: 'Jayden Reed', county: 'Gwinnett', ...over,
});

beforeEach(() => {
  store.updates = [];
  store.activity = [];
  store.doc = { source: 'phone', takenByName: 'Kaheem Freeman', ...phoneReferralRecord(input(), '2026-10-17', 'Kaheem Freeman') };
});

describe('updatePhoneReferral', () => {
  it('rewrites the card and logs which fields changed', async () => {
    const r = await updatePhoneReferral('r1', input({ county: 'Fulton', callerPhone: '470-783-4812' }), '2026-10-17', caller);
    expect(r).toEqual({ ok: true, changed: ['callback number', 'county'] });
    expect(store.updates[0]).toMatchObject({ county: 'Fulton', clientPhone: '(470) 783-4812' });
    const details = store.updates[0].details as { label: string; value: string }[];
    expect(details.find((d) => d.label === 'Taken by phone')?.value).toBe('Call taken by Kaheem Freeman');
    expect(store.activity[0]).toMatchObject({ type: 'note', text: 'Phone referral edited: callback number, county.', byName: 'Vera Assistant' });
  });
  it('writes nothing when nothing changed', async () => {
    expect(await updatePhoneReferral('r1', input(), '2026-10-17', caller)).toEqual({ ok: true, changed: [] });
    expect(store.updates).toHaveLength(0);
  });
  it('refuses website referrals, converted referrals, and missing ones', async () => {
    store.doc = { ...store.doc, source: 'gapp-website' };
    expect(await updatePhoneReferral('r1', input(), '2026-10-17', caller)).toMatchObject({ ok: false, status: 400 });
    store.doc = { ...store.doc, source: 'phone', patientId: 'p1' };
    expect(await updatePhoneReferral('r1', input(), '2026-10-17', caller)).toMatchObject({ ok: false, status: 409 });
    store.doc = null;
    expect(await updatePhoneReferral('r1', input(), '2026-10-17', caller)).toMatchObject({ ok: false, status: 404 });
    expect(store.updates).toHaveLength(0);
  });
});

import { updateWebsiteReferralDetails } from './referrals';

describe('updateWebsiteReferralDetails', () => {
  const website = () => ({
    source: 'gapp-website', clientName: 'Jazz King', referrerName: 'Ariel King', clientPhone: '(828) 508-8228', clientEmail: '', county: 'Gwinnett',
    details: [{ label: 'Seeking paid caregiver', value: 'No' }, { label: "Member's Medicaid ID", value: 'Will provide later' }],
  });
  it('saves an allowed field, ignores a locked one, and logs old and new', async () => {
    store.doc = website();
    const r = await updateWebsiteReferralDetails('r1', { "row:Member's Medicaid ID": '222120339644', 'row:Seeking paid caregiver': 'Yes' }, caller);
    expect(r).toEqual({ ok: true, changed: 1 });
    expect(store.updates[0].details).toEqual([{ label: 'Seeking paid caregiver', value: 'No' }, { label: "Member's Medicaid ID", value: '222120339644' }]);
    expect(store.activity[0].text).toBe('Details edited: Medicaid ID "Will provide later" → "222120339644".');
  });
  it('rejects bad input and phone or converted referrals', async () => {
    store.doc = website();
    expect(await updateWebsiteReferralDetails('r1', { 'top:clientPhone': '555' }, caller)).toMatchObject({ ok: false, status: 400, fieldErrors: { 'top:clientPhone': 'Enter a 10-digit phone number.' } });
    store.doc = { ...website(), source: 'phone' };
    expect(await updateWebsiteReferralDetails('r1', {}, caller)).toMatchObject({ ok: false, status: 400 });
    store.doc = { ...website(), patientId: 'p1' };
    expect(await updateWebsiteReferralDetails('r1', {}, caller)).toMatchObject({ ok: false, status: 409 });
    expect(store.updates).toHaveLength(0);
  });
});

describe('updateWebsiteReferralDetails: screened answers', () => {
  const kid = (over: Record<string, unknown> = {}) => ({
    relationship: 'parent', fullName: 'Kid Example', phoneNumber: '(404) 555-1212', emailAddress: 'p@example.com', county: 'Fulton',
    dob: '2015-03-01', diagnosis: 'Asthma', diagnoses: [], equipment: ['trach'], careNeeds: 'nursing', seekingPaidCaregiver: 'no', wantsAgencyStaff: 'yes',
    ...over,
  });
  const doc = (answers: Record<string, unknown> | null) => ({
    source: 'gapp-website', clientName: 'Kid Example', referrerName: '', clientPhone: '(404) 555-1212', clientEmail: 'p@example.com', county: 'Fulton',
    service: 'nursing',
    details: [{ label: 'Seeking paid caregiver', value: 'No' }, { label: "Member's Medicaid ID", value: '222120339644' }],
    ...(answers ? { intakeAnswers: answers } : {}),
  });

  it('refuses an answer the website would refuse, and writes nothing', async () => {
    store.doc = doc(kid());
    const r = await updateWebsiteReferralDetails('r1', {}, caller, { wantsAgencyStaff: 'no' });
    expect(r).toMatchObject({ ok: false, status: 422, refused: 'no-agency-staff' });
    expect(store.updates).toHaveLength(0);
  });

  it('saves an accepted change, rebuilds the rows, keeps corrections, and logs old and new', async () => {
    store.doc = doc(kid());
    const r = await updateWebsiteReferralDetails('r1', {}, caller, { seekingPaidCaregiver: 'yes' });
    expect(r).toEqual({ ok: true, changed: 1 });
    const u = store.updates[0] as { details: { label: string; value: string }[]; intakeAnswers: Record<string, unknown> };
    expect(u.details.find((d) => d.label === 'Seeking paid caregiver')?.value).toBe('Yes');
    expect(u.details.find((d) => d.label === "Member's Medicaid ID")?.value).toBe('222120339644');
    expect(u.intakeAnswers.seekingPaidCaregiver).toBe('yes');
    expect(store.activity[0].text).toBe('Details edited: Seeking paid caregiver "No" → "Yes".');
  });

  it('needs the saved answers, and a complete set of follow-ups', async () => {
    store.doc = doc(null);
    expect(await updateWebsiteReferralDetails('r1', {}, caller, { seekingPaidCaregiver: 'yes' })).toMatchObject({ ok: false, status: 409 });
    store.doc = doc(kid());
    expect(await updateWebsiteReferralDetails('r1', {}, caller, { seekingPaidCaregiver: 'yes', relationship: 'grandparent' }))
      .toMatchObject({ ok: false, status: 400, fieldErrors: { 'screened:hasGuardianship': 'Choose an answer.' } });
    expect(store.updates).toHaveLength(0);
  });
});
