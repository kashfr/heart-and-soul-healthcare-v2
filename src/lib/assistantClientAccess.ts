import type { Role } from './auth';

export interface AssistantClientGrant {
  uid: string;
  scope: 'gapp' | 'all';
  editInfo: boolean;
  uploadDocuments: boolean;
}

export interface AssistantClientsSettings {
  grants: AssistantClientGrant[];
}

export function isAssistantClientGrant(value: unknown): value is AssistantClientGrant {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.uid === 'string' && v.uid.trim().length > 0 && v.uid.length <= 128
    && !v.uid.includes('/') && (v.scope === 'gapp' || v.scope === 'all')
    && typeof v.editInfo === 'boolean' && typeof v.uploadDocuments === 'boolean';
}

/** Invalid/duplicate grants are denied, never broadened by a default scope. */
export function mergeAssistantClients(value: unknown): AssistantClientsSettings {
  const raw = (value as Partial<AssistantClientsSettings> | null)?.grants;
  if (!Array.isArray(raw)) return { grants: [] };
  const grants = raw.filter(isAssistantClientGrant).map((g) => ({
    uid: g.uid.trim(), scope: g.scope, editInfo: g.editInfo, uploadDocuments: g.uploadDocuments,
  }));
  return { grants: grants.filter((g) => grants.filter((other) => other.uid === g.uid).length === 1) };
}

export function getAssistantClientGrant(
  settings: AssistantClientsSettings | undefined,
  uid: string | null | undefined,
  role: Role | null | undefined,
): AssistantClientGrant | null {
  if (!uid || role !== 'va') return null;
  return mergeAssistantClients(settings).grants.find((g) => g.uid === uid) ?? null;
}

export function canAccessAssistantClient(grant: AssistantClientGrant | null, program: unknown): boolean {
  return !!grant && (grant.scope === 'all' || program === 'gapp');
}
