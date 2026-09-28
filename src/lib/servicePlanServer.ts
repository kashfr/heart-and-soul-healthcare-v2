import 'server-only';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { FieldValue } from 'firebase-admin/firestore';
import { adminBucket, adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import { formatDateUS, formatDateUSFile } from './dateFormat';
import { agencyTodayISO } from './verbalOrderServer';
import { sanitizeServicePlanInput, SERVICE_PLAN_DOC_CATEGORY, type ServicePlanInput, type ServicePlanRecord } from './servicePlanShared';
import ServicePlanPDF from './pdf/ServicePlanPDF';

/**
 * Service plans live in the top-level `servicePlans` collection, one document
 * per signed plan, written only here (the collection is server-only in the
 * rules). Reads go through the API too, so a nurse only ever sees plans for
 * clients on her care team, checked against the client record at request time.
 */
const COL = 'servicePlans';

function toIso(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null;
}

export function serializeServicePlan(id: string, d: FirebaseFirestore.DocumentData): ServicePlanRecord {
  return {
    ...sanitizeServicePlanInput(d),
    id,
    clientName: String(d.clientName || ''),
    dob: String(d.dob || ''),
    signedDate: String(d.signedDate || ''),
    createdAt: toIso(d.createdAt),
    createdBy: String(d.createdBy || ''),
    createdByName: String(d.createdByName || ''),
    documentId: String(d.documentId || ''),
  };
}

/** Newest first. Sorted here, not in the query, so no composite index is needed. */
export async function listServicePlans(patientId: string): Promise<ServicePlanRecord[]> {
  const snap = await adminDb().collection(COL).where('patientId', '==', patientId).get();
  return snap.docs
    .map((d) => serializeServicePlan(d.id, d.data()))
    .sort((a, b) => (b.signedDate + (b.createdAt || '')).localeCompare(a.signedDate + (a.createdAt || '')));
}

export async function getServicePlan(id: string): Promise<ServicePlanRecord | null> {
  const snap = await adminDb().collection(COL).doc(id).get();
  return snap.exists ? serializeServicePlan(snap.id, snap.data() || {}) : null;
}

/** True when the caller may read plans for this client: staff always, a nurse
 *  only on her care team. */
export async function canReadServicePlans(caller: AuthedCaller, patientId: string): Promise<boolean> {
  if (caller.role === 'admin' || caller.role === 'supervisor') return true;
  if (caller.role !== 'nurse') return false;
  const pat = await adminDb().collection('patients').doc(patientId).get();
  const assigned = Array.isArray(pat.data()?.assignedNurseIds) ? (pat.data()?.assignedNurseIds as string[]) : [];
  return assigned.includes(caller.uid);
}

export async function renderServicePlanPdf(plan: ServicePlanRecord): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pdf's renderToBuffer wants its own element type
  const el = React.createElement(ServicePlanPDF, { plan, dob: formatDateUS(plan.dob), signedDate: formatDateUS(plan.signedDate) }) as any;
  return Buffer.from(await renderToBuffer(el));
}

function fileStem(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'client';
}

export function servicePlanPdfFileName(plan: ServicePlanRecord): string {
  return `Service_Plan_${fileStem(plan.clientName)}_${formatDateUSFile(plan.signedDate)}.pdf`;
}

/**
 * Sign and file a plan: the record is written first (the plan exists even if
 * the PDF step fails), then the PDF is rendered and filed under the client's
 * Documents in the "Service Plan" category, which feeds the readiness tile.
 * The input has already been validated by the route.
 */
export async function createServicePlan(input: ServicePlanInput, caller: AuthedCaller): Promise<{ ok: true; plan: ServicePlanRecord; filed: boolean } | { ok: false; status: number; error: string }> {
  const db = adminDb();
  const patSnap = await db.collection('patients').doc(input.patientId).get();
  if (!patSnap.exists) return { ok: false, status: 404, error: 'That client was not found.' };
  const p = patSnap.data() || {};
  if (input.revisesPlanId) {
    const prev = await db.collection(COL).doc(input.revisesPlanId).get();
    if (!prev.exists || String(prev.data()?.patientId || '') !== input.patientId) return { ok: false, status: 400, error: 'The plan being revised belongs to a different client.' };
  }
  const byName = caller.profile.displayName || caller.email || '';
  const signedDate = agencyTodayISO();
  const ref = db.collection(COL).doc();
  await ref.set({
    ...input,
    clientName: String(p.name || ''),
    dob: String(p.dob || ''),
    signedDate,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: caller.uid,
    createdByName: byName,
    documentId: '',
  });
  let plan = serializeServicePlan(ref.id, (await ref.get()).data() || {});

  let filed = false;
  try {
    const pdf = await renderServicePlanPdf(plan);
    const docRef = db.collection('patientDocuments').doc();
    const fileName = servicePlanPdfFileName(plan);
    const storagePath = `patients/${plan.patientId}/documents/${docRef.id}/${fileName}`;
    await adminBucket().file(storagePath).save(pdf, { contentType: 'application/pdf', resumable: false });
    await docRef.set({
      patientId: plan.patientId,
      category: SERVICE_PLAN_DOC_CATEGORY,
      title: `Service Plan, signed ${formatDateUS(signedDate)} by ${byName}`,
      fileName,
      storagePath,
      contentType: 'application/pdf',
      size: pdf.length,
      docDate: signedDate,
      uploadedBy: caller.uid,
      uploadedByName: byName,
      uploadedByRole: caller.role,
      uploadedAt: FieldValue.serverTimestamp(),
      archived: false,
      autoFiled: true,
      servicePlanId: plan.id,
    });
    await ref.update({ documentId: docRef.id });
    plan = { ...plan, documentId: docRef.id };
    filed = true;
  } catch (err) {
    console.error('Service plan: filing the PDF failed:', err);
  }
  return { ok: true, plan, filed };
}
