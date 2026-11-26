import { authedFetch } from './authedFetch';
import { renderDocumentInWindow } from './patientDocuments';
import type { HealthcarePlanReader, HealthcarePlanStatus } from './healthcarePlanReview';

/**
 * Browser calls for healthcare plan review. Everything goes through
 * /api/healthcare-plans (see healthcarePlanReviewServer.ts for why the
 * browser never touches the receipts or the plan files directly).
 */

export interface HealthcarePlanListing {
  plans: HealthcarePlanStatus[];
  readers?: HealthcarePlanReader[];
}

async function errorOf(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error || fallback);
}

export async function fetchHealthcarePlans(patientId: string): Promise<HealthcarePlanListing> {
  const res = await authedFetch(`/api/healthcare-plans?patientId=${encodeURIComponent(patientId)}`);
  if (!res.ok) throw await errorOf(res, 'Could not load the healthcare plans.');
  return (await res.json()) as HealthcarePlanListing;
}

/**
 * Open a plan in a new tab. MUST be called straight from a click: the tab is
 * opened synchronously, before the fetch, or the browser blocks it as an
 * unsolicited popup (same approach as the Documents tab).
 */
export async function openHealthcarePlan(plan: Pick<HealthcarePlanStatus, 'documentId' | 'title'>): Promise<void> {
  const w = window.open('', '_blank');
  if (!w) throw new Error('Your browser blocked the plan from opening. Allow popups for this site, then try again.');
  w.opener = null;
  try {
    const res = await authedFetch(`/api/healthcare-plans/${encodeURIComponent(plan.documentId)}/file`);
    if (!res.ok) throw await errorOf(res, 'Could not open the plan. Please try again.');
    const blob = await res.blob();
    renderDocumentInWindow(w, { blob, type: blob.type || 'application/octet-stream' }, { title: plan.title, fileName: `${plan.title}.pdf` });
  } catch (err) {
    w.close();
    throw err;
  }
}

export async function acknowledgeHealthcarePlan(documentId: string): Promise<string> {
  const res = await authedFetch(`/api/healthcare-plans/${encodeURIComponent(documentId)}/review`, { method: 'POST' });
  if (!res.ok) throw await errorOf(res, 'Could not save your review. Please try again.');
  return ((await res.json()) as { reviewedAt: string }).reviewedAt;
}
