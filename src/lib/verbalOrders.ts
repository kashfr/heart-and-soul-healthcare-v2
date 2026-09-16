import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { authedFetch } from './authedFetch';
import type { VerbalOrder, VerbalOrderInput, VerbalOrderType } from './verbalOrderShared';

export type { VerbalOrder } from './verbalOrderShared';

/**
 * Browser API for verbal orders. Reads go straight to Firestore under the
 * rules (staff, the taking nurse, the care team); every write is an API call.
 */

function toIso(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null;
}

function fromDoc(id: string, d: Record<string, unknown>): VerbalOrder {
  const fax = (d.fax as Record<string, unknown> | null) || null;
  const signed = (d.signed as Record<string, unknown> | null) || null;
  return {
    id,
    patientId: String(d.patientId || ''),
    patientName: String(d.patientName || ''),
    patientDob: String(d.patientDob || ''),
    orderType: (d.orderType === 'other' ? 'other' : 'medication') as VerbalOrderType,
    physicianName: String(d.physicianName || ''),
    physicianPhone: String(d.physicianPhone || ''),
    physicianFax: String(d.physicianFax || ''),
    physicianSpecialty: String(d.physicianSpecialty || ''),
    orderText: String(d.orderText || ''),
    readBackVerified: d.readBackVerified === true,
    nurseId: String(d.nurseId || ''),
    nurseName: String(d.nurseName || ''),
    nurseCredential: String(d.nurseCredential || ''),
    nurseSignature: String(d.nurseSignature || ''),
    takenAt: toIso(d.takenAt),
    takenDate: String(d.takenDate || ''),
    status: d.status === 'signed' ? 'signed' : d.status === 'faxed' ? 'faxed' : 'taken',
    marChangeRequestId: String(d.marChangeRequestId || ''),
    marOrderId: String(d.marOrderId || ''),
    marChangeType: (['add', 'change', 'discontinue'].includes(String(d.marChangeType)) ? d.marChangeType : '') as VerbalOrder['marChangeType'],
    marMedName: String(d.marMedName || ''),
    fax: fax
      ? {
          provider: fax.provider === 'manual' ? 'manual' : 'srfax',
          toNumber: String(fax.toNumber || ''),
          faxDetailsId: String(fax.faxDetailsId || ''),
          sentStatus: String(fax.sentStatus || ''),
          queuedAt: toIso(fax.queuedAt),
          sentAt: toIso(fax.sentAt),
          error: String(fax.error || ''),
          attempts: Number(fax.attempts || 0),
        }
      : null,
    signed: signed
      ? {
          method: (['fax', 'esign', 'manual'].includes(String(signed.method)) ? signed.method : 'manual') as 'fax' | 'esign' | 'manual',
          signedDate: String(signed.signedDate || ''),
          physicianPrintedName: String(signed.physicianPrintedName || ''),
          physicianSignature: String(signed.physicianSignature || ''),
          receivedAt: toIso(signed.receivedAt),
          receivedBy: String(signed.receivedBy || ''),
          receivedByName: String(signed.receivedByName || ''),
          documentId: String(signed.documentId || ''),
          inboundFaxFileName: String(signed.inboundFaxFileName || ''),
        }
      : null,
    reminderSentAt: toIso(d.reminderSentAt),
    escalatedAt: toIso(d.escalatedAt),
    createdAt: toIso(d.createdAt),
  };
}

export interface PostVerbalOrderResult {
  id: string;
  faxConfigured: boolean;
  faxQueued: boolean;
  faxError: string;
}

export async function postVerbalOrder(
  input: VerbalOrderInput & { mar?: { changeRequestId: string; type: string; medName: string } },
): Promise<PostVerbalOrderResult> {
  const res = await authedFetch('/api/verbal-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<PostVerbalOrderResult> & { error?: string; fields?: Record<string, string> };
  if (!res.ok) {
    const err = new Error(data.error || `Verbal order failed (${res.status}).`) as Error & { fields?: Record<string, string> };
    err.fields = data.fields;
    throw err;
  }
  return { id: String(data.id || ''), faxConfigured: !!data.faxConfigured, faxQueued: !!data.faxQueued, faxError: String(data.faxError || '') };
}

export async function resendVerbalOrderFax(id: string): Promise<{ ok: boolean; error?: string; configured?: boolean }> {
  const res = await authedFetch(`/api/verbal-orders/${encodeURIComponent(id)}/fax`, { method: 'POST' });
  const data = (await res.json().catch(() => ({}))) as { error?: string; configured?: boolean };
  return res.ok ? { ok: true } : { ok: false, error: data.error, configured: data.configured };
}

export async function recordVerbalOrderSignedByOffice(id: string, params: { signedDate: string; physicianPrintedName?: string; signedPdfBase64?: string; inboundFaxFileName?: string }): Promise<{ ok: boolean; error?: string }> {
  const res = await authedFetch(`/api/verbal-orders/${encodeURIComponent(id)}/signed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return res.ok ? { ok: true } : { ok: false, error: data.error };
}

/** Fetch the PDF as a blob URL (opens in a new tab / downloads). */
export async function fetchVerbalOrderPdf(id: string): Promise<Blob> {
  const res = await authedFetch(`/api/verbal-orders/${encodeURIComponent(id)}/pdf`);
  if (!res.ok) throw new Error('Could not load the PDF.');
  return res.blob();
}

export async function getVerbalOrdersForPatient(patientId: string, max = 50): Promise<VerbalOrder[]> {
  const q = query(collection(db, 'verbalOrders'), where('patientId', '==', patientId), orderBy('createdAt', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromDoc(d.id, d.data() as Record<string, unknown>));
}

export async function getMyVerbalOrders(uid: string, max = 100): Promise<VerbalOrder[]> {
  const q = query(collection(db, 'verbalOrders'), where('nurseId', '==', uid), orderBy('createdAt', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromDoc(d.id, d.data() as Record<string, unknown>));
}

/** Staff: every verbal order, newest first. */
export async function getAllVerbalOrders(max = 200): Promise<VerbalOrder[]> {
  const q = query(collection(db, 'verbalOrders'), orderBy('createdAt', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromDoc(d.id, d.data() as Record<string, unknown>));
}

export interface UnmatchedInboundFax {
  id: string;
  fileName: string;
  callerId: string;
  remoteId: string;
  pages: number;
  receivedAt: string;
  candidateOrderIds: string[];
}

/** Staff: inbound faxes the sweep could not tie to exactly one order. */
export async function getUnmatchedInboundFaxes(): Promise<UnmatchedInboundFax[]> {
  const q = query(collection(db, 'verbalOrderInbound'), where('status', 'in', ['unmatched', 'suggested']), orderBy('epochTime', 'desc'), limit(50));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      fileName: String(x.fileName || ''),
      callerId: String(x.callerId || ''),
      remoteId: String(x.remoteId || ''),
      pages: Number(x.pages || 0),
      receivedAt: String(x.receivedAt || ''),
      candidateOrderIds: Array.isArray(x.candidateOrderIds) ? (x.candidateOrderIds as string[]) : [],
    };
  });
}
