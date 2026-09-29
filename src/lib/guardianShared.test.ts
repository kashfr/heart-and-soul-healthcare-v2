import { describe, expect, it } from 'vitest';
import { hasGuardianErrors, normalizeGuardian, validateGuardian } from './guardianShared';

const welch = { id: 'g', role: 'Legal guardian', name: 'Jordan Welch', relationship: 'State (DHS representative)', phone: '404-683-2947', email: 'jordan.welch@dhs.ga.gov' };

describe('validateGuardian', () => {
  it('requires a decision-maker answer', () => {
    expect(validateGuardian({ contacts: [] }).decisionMaker).toBeTruthy();
  });

  it('accepts a self-deciding client with no contacts', () => {
    expect(hasGuardianErrors(validateGuardian({ decisionMaker: 'self', contacts: [] }))).toBe(false);
  });

  it('requires the legal guardian on the list when the client has one', () => {
    const payeeOnly = { id: 'p', role: 'Representative payee', name: 'Dr. Martin', phone: '470-979-9292' };
    expect(validateGuardian({ decisionMaker: 'guardian', contacts: [payeeOnly] }).contacts).toBeTruthy();
    expect(hasGuardianErrors(validateGuardian({ decisionMaker: 'guardian', contacts: [welch, payeeOnly] }))).toBe(false);
  });

  it('lets a legal guardian stand in for a minor\'s parent', () => {
    expect(validateGuardian({ decisionMaker: 'parent', contacts: [welch] }).contacts).toBeUndefined();
  });

  it('flags a row with no name, role, or way to reach them', () => {
    const e = validateGuardian({ decisionMaker: 'self', contacts: [{ id: 'x', role: '', name: '' }] });
    expect(Object.keys(e.rows.x).sort()).toEqual(['name', 'reach', 'role']);
  });

  it('flags a malformed email', () => {
    expect(validateGuardian({ decisionMaker: 'self', contacts: [{ ...welch, id: 'y', phone: '', email: 'nope' }] }).rows.y.reach).toBeTruthy();
  });
});

describe('normalizeGuardian', () => {
  it('puts the legal guardian before other roles and trims', () => {
    const out = normalizeGuardian({ decisionMaker: 'guardian', contacts: [{ id: 'p', role: 'Representative payee', name: ' Dr. Martin ' }, welch] });
    expect(out.contacts.map((c) => c.id)).toEqual(['g', 'p']);
    expect(out.contacts[1].name).toBe('Dr. Martin');
  });
});
