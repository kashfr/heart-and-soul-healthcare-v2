/**
 * Who may use EDWP Consents. Pure, so the sidebar, the page and the API
 * routes share one rule (edwpAccess.test.ts).
 */
import type { Role } from './auth';
import type { EdwpSettings } from './settings';

/** Roles the Settings picker can grant. Admins always have access. */
export const EDWP_GRANTABLE_ROLES: readonly Role[] = ['supervisor', 'va'];

export function canUseEdwp(edwp: EdwpSettings | undefined, uid: string | null | undefined, role: Role | null | undefined): boolean {
  if (!uid || !role) return false;
  if (role === 'admin') return true;
  if (!EDWP_GRANTABLE_ROLES.includes(role)) return false;
  // Not set yet: the original rule, every virtual assistant.
  if (!edwp || edwp.userUids === null) return role === 'va';
  return edwp.userUids.includes(uid);
}
