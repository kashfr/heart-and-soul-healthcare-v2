import type { Role } from './auth';
import type { ReferralConversionSettings } from './settings';

/** Grant only referral conversion; this does not grant general clinical access. */
export function canCreateClientFromReferral(
  settings: ReferralConversionSettings | undefined,
  uid: string | null | undefined,
  role: Role | null | undefined,
): boolean {
  if (!uid || settings?.excludedUserUids?.includes(uid)) return false;
  if (role === 'admin' || role === 'supervisor') return true;
  return role === 'va' && (settings?.userUids.includes(uid) ?? false);
}
