import 'server-only';
import { randomUUID } from 'node:crypto';
import type { AuthedCaller } from './adminAuthGuard';
/** New nonce on every write prevents attributing later system work to a prior editor. */
export function clientAuditActor(caller: Pick<AuthedCaller, 'uid'>) {
  return { _auditActor: { uid: caller.uid, nonce: randomUUID() } };
}
