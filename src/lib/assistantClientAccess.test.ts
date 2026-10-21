import { describe, expect, it } from 'vitest';
import { canAccessAssistantClient, getAssistantClientGrant, mergeAssistantClients } from './assistantClientAccess';
import { mergeWithDefaults, validateSettings, SettingsValidationError } from './settings';

const grant = { uid: 'va1', scope: 'gapp' as const, editInfo: true, uploadDocuments: true };
describe('assistant client grants', () => {
  it('defaults to no access and only applies to the named VA', () => {
    expect(mergeWithDefaults(null).assistantClients.grants).toEqual([]);
    expect(getAssistantClientGrant(undefined, 'va1', 'va')).toBeNull();
    expect(getAssistantClientGrant({ grants: [grant] }, 'other', 'va')).toBeNull();
    expect(getAssistantClientGrant({ grants: [grant] }, 'va1', 'nurse')).toBeNull();
    expect(getAssistantClientGrant({ grants: [grant] }, 'va1', 'va')).toEqual(grant);
  });
  it('limits GAPP grants and supports explicit all-client access', () => {
    expect(canAccessAssistantClient(grant, 'gapp')).toBe(true);
    expect(canAccessAssistantClient(grant, 'now-comp')).toBe(false);
    expect(canAccessAssistantClient(grant, undefined)).toBe(false);
    expect(canAccessAssistantClient({ ...grant, scope: 'all' }, 'now-comp')).toBe(true);
    expect(canAccessAssistantClient(null, 'gapp')).toBe(false);
  });
  it('does not turn malformed or duplicate grants into permissions', () => {
    expect(mergeAssistantClients({ grants: [{ ...grant, scope: 'bogus' }] }).grants).toEqual([]);
    expect(mergeAssistantClients({ grants: [{ ...grant, editInfo: 'true' }] }).grants).toEqual([]);
    expect(mergeAssistantClients({ grants: [grant, grant] }).grants).toEqual([]);
    expect(() => validateSettings({ assistantClients: { grants: [grant, grant] } })).toThrow(SettingsValidationError);
    expect(() => validateSettings({ assistantClients: { grants: [{ ...grant, scope: 'bogus' }] } })).toThrow(SettingsValidationError);
  });
  it('preserves separate read, edit, and upload permissions through settings validation', () => {
    const readOnly = { ...grant, editInfo: false, uploadDocuments: false };
    expect(validateSettings({ assistantClients: { grants: [readOnly] } }).assistantClients.grants).toEqual([readOnly]);
  });
});
