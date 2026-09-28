import { authedFetch } from './authedFetch';
import type { ServicePlanInput, ServicePlanRecord } from './servicePlanShared';

export type { ServicePlanRecord } from './servicePlanShared';

/** Browser API for service plans. Everything goes through the API routes:
 *  the collection is server-only, so a nurse's care-team scope is checked
 *  against the client record on every request. */

export async function getServicePlans(patientId: string): Promise<ServicePlanRecord[]> {
  const res = await authedFetch(`/api/service-plans?patientId=${encodeURIComponent(patientId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return (data.plans || []) as ServicePlanRecord[];
}

export function servicePlanPdfUrl(id: string): string {
  return `/api/service-plans/${encodeURIComponent(id)}/pdf`;
}

/** Sign and file. On a 400 with field errors the thrown Error carries `fields`. */
export async function postServicePlan(input: ServicePlanInput): Promise<{ id: string; filed: boolean }> {
  const res = await authedFetch('/api/service-plans', { method: 'POST', body: JSON.stringify(input) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status}).`) as Error & { fields?: Record<string, string> };
    if (data.fields) err.fields = data.fields;
    throw err;
  }
  return { id: String(data.id), filed: data.filed === true };
}
