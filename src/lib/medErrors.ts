import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { authedFetch } from './authedFetch';
import type { MedErrorInput, MedErrorReport } from './medErrorShared';

export type { MedErrorReport } from './medErrorShared';

/** Browser API for medication error reports. Reads under the rules; writes via API. */

function toIso(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null;
}
function notif(d: unknown) {
  const n = (d || {}) as Record<string, unknown>;
  return { notified: n.notified === true, name: String(n.name || ''), at: String(n.at || '') };
}

function fromDoc(id: string, d: Record<string, unknown>): MedErrorReport {
  const rv = d.review as Record<string, unknown> | null | undefined;
  return {
    id,
    patientId: String(d.patientId || ''),
    patientName: String(d.patientName || ''),
    patientDob: String(d.patientDob || ''),
    reporterId: String(d.reporterId || ''),
    reporterName: String(d.reporterName || ''),
    reporterCredential: String(d.reporterCredential || ''),
    reporterRole: String(d.reporterRole || ''),
    reporterSignature: String(d.reporterSignature || ''),
    discoveredAt: String(d.discoveredAt || ''),
    occurredAt: String(d.occurredAt || ''),
    occurredApprox: d.occurredApprox === true,
    medName: String(d.medName || ''),
    doseOrdered: String(d.doseOrdered || ''),
    doseGiven: String(d.doseGiven || ''),
    route: String(d.route || ''),
    marOrderId: String(d.marOrderId || ''),
    marAdministrationId: String(d.marAdministrationId || ''),
    errorType: (d.errorType || 'other') as MedErrorReport['errorType'],
    doseOutcome: (d.doseOutcome || 'unknown') as MedErrorReport['doseOutcome'],
    description: String(d.description || ''),
    responsibleType: (d.responsibleType || 'unknown') as MedErrorReport['responsibleType'],
    responsibleName: String(d.responsibleName || ''),
    harm: (d.harm || 'none') as MedErrorReport['harm'],
    clientCondition: String(d.clientCondition || ''),
    physician: notif(d.physician),
    guardian: notif(d.guardian),
    supervisor: notif(d.supervisor),
    actionsTaken: String(d.actionsTaken || ''),
    status: d.status === 'reviewed' ? 'reviewed' : 'submitted',
    incidentReportRequired: d.incidentReportRequired === true,
    review: rv
      ? {
          reviewerId: String(rv.reviewerId || ''),
          reviewerName: String(rv.reviewerName || ''),
          reviewerCredential: String(rv.reviewerCredential || ''),
          findings: String(rv.findings || ''),
          rootCause: String(rv.rootCause || ''),
          correctiveAction: String(rv.correctiveAction || ''),
          incidentReportRequired: rv.incidentReportRequired === true,
          incidentReportFiledDate: String(rv.incidentReportFiledDate || ''),
          reviewedAt: toIso(rv.reviewedAt),
        }
      : null,
    createdAt: toIso(d.createdAt),
  };
}

export async function postMedError(input: MedErrorInput): Promise<{ id: string; incident: boolean }> {
  const res = await authedFetch('/api/med-errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const data = (await res.json().catch(() => ({}))) as { id?: string; incident?: boolean; error?: string; fields?: Record<string, string> };
  if (!res.ok) {
    const err = new Error(data.error || `Report failed (${res.status}).`) as Error & { fields?: Record<string, string> };
    err.fields = data.fields;
    throw err;
  }
  return { id: String(data.id || ''), incident: !!data.incident };
}

export async function reviewMedErrorReport(id: string, review: { findings: string; rootCause: string; correctiveAction: string; incidentReportRequired: boolean; incidentReportFiledDate: string }): Promise<{ ok: boolean; error?: string }> {
  const res = await authedFetch(`/api/med-errors/${encodeURIComponent(id)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(review) });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return res.ok ? { ok: true } : { ok: false, error: data.error };
}

export async function markIncidentReportFiled(id: string, filedDate: string): Promise<{ ok: boolean; error?: string }> {
  const res = await authedFetch(`/api/med-errors/${encodeURIComponent(id)}/incident-filed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filedDate }) });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return res.ok ? { ok: true } : { ok: false, error: data.error };
}

export async function fetchMedErrorPdf(id: string): Promise<Blob> {
  const res = await authedFetch(`/api/med-errors/${encodeURIComponent(id)}/pdf`);
  if (!res.ok) throw new Error('Could not load the PDF.');
  return res.blob();
}

export async function getMedErrorsForPatient(patientId: string, max = 50): Promise<MedErrorReport[]> {
  const q = query(collection(db, 'medErrorReports'), where('patientId', '==', patientId), orderBy('createdAt', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromDoc(d.id, d.data() as Record<string, unknown>));
}

export async function getMyMedErrors(uid: string, max = 100): Promise<MedErrorReport[]> {
  const q = query(collection(db, 'medErrorReports'), where('reporterId', '==', uid), orderBy('createdAt', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromDoc(d.id, d.data() as Record<string, unknown>));
}

export async function getAllMedErrors(max = 200): Promise<MedErrorReport[]> {
  const q = query(collection(db, 'medErrorReports'), orderBy('createdAt', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromDoc(d.id, d.data() as Record<string, unknown>));
}
