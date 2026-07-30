import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import {
  moveReferral,
  assignReferral,
  setReferralService,
  getReferral,
  deleteReferral,
  stageFromStatus,
  REFERRAL_STAGES,
  type ReferralStage,
} from '@/lib/referrals';
// SERVICE_KEYS is the portal's canonical list; ServiceKey is the shared
// catalog's identical union, used because that's what the data layer takes.
import { SERVICE_KEYS } from '@/lib/georgia';
import type { ServiceKey } from '@/lib/diagnosisCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['new', 'contacted', 'archived'];

interface PatchBody {
  stage?: string;
  order?: number;
  /** Legacy three-value status; mapped onto a stage for back-compat callers. */
  status?: string;
  /** Present (possibly null) to (un)assign the referral. */
  assignee?: { uid?: string; name?: string } | null;
  /** Present (possibly null) to override or clear the GAPP service line. */
  service?: string | null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let caller;
  try {
    caller = await requireRole(request, ['admin', 'va']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

  // Validate each supplied field up front, rejecting malformed values rather
  // than silently dropping them (which would return a misleading 200).
  if (has('order') && (!Number.isFinite(body.order) || Math.abs(body.order as number) > 1e15)) {
    return NextResponse.json({ error: 'order must be a finite number.' }, { status: 400 });
  }

  let stage: ReferralStage | undefined;
  if (has('stage')) {
    if (typeof body.stage !== 'string' || !REFERRAL_STAGES.includes(body.stage as ReferralStage)) {
      return NextResponse.json({ error: 'Invalid stage.' }, { status: 400 });
    }
    stage = body.stage as ReferralStage;
  } else if (has('status')) {
    if (typeof body.status !== 'string' || !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
    }
    stage = stageFromStatus(body.status);
  }

  const hasAssignee = has('assignee');
  const hasOrder = has('order');
  const hasMove = stage !== undefined || hasOrder;

  // null is a meaningful value here (clear the override), so validate on
  // presence rather than truthiness.
  const hasService = has('service');
  let service: ServiceKey | null = null;
  if (hasService) {
    if (body.service !== null) {
      if (
        typeof body.service !== 'string' ||
        !SERVICE_KEYS.includes(body.service as ServiceKey)
      ) {
        return NextResponse.json({ error: 'Invalid service.' }, { status: 400 });
      }
      service = body.service as ServiceKey;
    }
  }

  if (!hasAssignee && !hasMove && !hasService) {
    return NextResponse.json({ error: 'No changes supplied.' }, { status: 400 });
  }

  // Assignment (assignee: {uid,name} to assign, or null to unassign).
  if (hasAssignee) {
    const a = body.assignee;
    let assignee: { uid: string; name: string } | null = null;
    if (a) {
      if (typeof a.uid !== 'string' || !a.uid || typeof a.name !== 'string' || !a.name.trim()) {
        return NextResponse.json({ error: 'Invalid assignee.' }, { status: 400 });
      }
      assignee = { uid: a.uid, name: a.name };
    }
    const ok = await assignReferral(id, assignee, caller);
    if (!ok) {
      return NextResponse.json({ error: 'Referral not found.' }, { status: 404 });
    }
  }

  // Service-line override (null clears it, restoring the intake fallback).
  if (hasService) {
    const ok = await setReferralService(id, service, caller);
    if (!ok) {
      return NextResponse.json({ error: 'Referral not found.' }, { status: 404 });
    }
  }

  // Stage and/or board-position move.
  if (hasMove) {
    const order = hasOrder ? (body.order as number) : undefined;
    let ok: boolean;
    try {
      ok = await moveReferral(id, { stage, order }, caller);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Invalid move.' },
        { status: 400 }
      );
    }
    if (!ok) {
      return NextResponse.json({ error: 'Referral not found.' }, { status: 404 });
    }
  }

  const referral = await getReferral(id);
  return NextResponse.json({ ok: true, referral });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let caller;
  try {
    caller = await requireRole(request, ['admin']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const ok = await deleteReferral(id, caller);
  if (!ok) {
    return NextResponse.json({ error: 'Referral not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
