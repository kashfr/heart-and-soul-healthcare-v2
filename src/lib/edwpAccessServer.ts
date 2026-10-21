import 'server-only';
import { requireRole, AdminAuthError, type AuthedCaller } from './adminAuthGuard';
import { getServerSettings } from './settingsServer';
import { canUseEdwp } from './edwpAccess';

/** Role check plus the Settings grant; throws AdminAuthError like requireRole. */
export async function requireEdwpAccess(request: Request): Promise<AuthedCaller> {
  const caller = await requireRole(request, ['admin', 'supervisor', 'va']);
  const settings = await getServerSettings();
  if (!canUseEdwp(settings.edwp, caller.uid, caller.role)) {
    throw new AdminAuthError(403, 'You do not have EDWP Consents access. Ask an admin to add you in Settings.');
  }
  return caller;
}
