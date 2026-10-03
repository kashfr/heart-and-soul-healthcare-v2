import 'server-only';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { FieldValue } from 'firebase-admin/firestore';
import { adminBucket, adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import { formatDateUS, formatDateUSFile } from './dateFormat';
import { agencyTodayISO } from './verbalOrderServer';
import {
  addDaysISO,
  sanitizeServicePlanInput,
  SERVICE_PLAN_DOC_CATEGORY,
  SERVICE_PLAN_MAX_DAYS,
  type ServicePlanInput,
  type ServicePlanRecord,
  type ServicePlanReview,
  type ServicePlanReviewInput,
} from './servicePlanShared';
import ServicePlanPDF from './pdf/ServicePlanPDF';
import ServicePlanReviewPDF from './pdf/ServicePlanReviewPDF';

/**
 * Service plans live in the top-level `servicePlans` collection, one document
 * per signed plan, written only here (the collection is server-only in the
 * rules). Reads go through the API too, so a nurse only ever sees plans for
 * clients on her care team, checked against the client record at request time.
 */
const COL = 'servicePlans';
/** Reviews live under each plan: servicePlans/{planId}/reviews/{reviewId}.
 *  Server-only too (the default deny covers subcollections). */
const REVIEWS = 'reviews';

function toIso(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null;
}

export function serializeReview(id: string, d: FirebaseFirestore.DocumentData): ServicePlanReview {
  return {
    id,
    planId: String(d.planId || ''),
    patientId: String(d.patientId || ''),
    reviewedDate: String(d.reviewedDate || ''),
    reviewerUid: String(d.reviewerUid || ''),
    reviewerName: String(d.reviewerName || ''),
    reviewerCredentials: String(d.reviewerCredentials || ''),
    signature: String(d.signature || ''),
    note: String(d.note || ''),
    differencesAcknowledged: Array.isArray(d.differencesAcknowledged) ? d.differencesAcknowledged.map(String) : [],
    documentId: String(d.documentId || ''),
    createdAt: toIso(d.createdAt),
  };
}

async function reviewsFor(planId: string): Promise<ServicePlanReview[]> {
  const snap = await adminDb().collection(COL).doc(planId).collection(REVIEWS).get();
  return snap.docs
    .map((d) => serializeReview(d.id, d.data()))
    .sort((a, b) => (a.reviewedDate + (a.createdAt || '')).localeCompare(b.reviewedDate + (b.createdAt || '')));
}

export function serializeServicePlan(id: string, d: FirebaseFirestore.DocumentData, reviews: ServicePlanReview[] = []): ServicePlanRecord {
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
    reviews,
  };
}

/** Newest first. Sorted here, not in the query, so no composite index is needed. */
export async function listServicePlans(patientId: string): Promise<ServicePlanRecord[]> {
  const snap = await adminDb().collection(COL).where('patientId', '==', patientId).get();
  const plans = await Promise.all(snap.docs.map(async (d) => serializeServicePlan(d.id, d.data(), await reviewsFor(d.id))));
  return plans.sort((a, b) => (b.signedDate + (b.createdAt || '')).localeCompare(a.signedDate + (a.createdAt || '')));
}

export async function getServicePlan(id: string): Promise<ServicePlanRecord | null> {
  const snap = await adminDb().collection(COL).doc(id).get();
  return snap.exists ? serializeServicePlan(snap.id, snap.data() || {}, await reviewsFor(id)) : null;
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

export async function renderServicePlanReviewPdf(plan: ServicePlanRecord, review: ServicePlanReview): Promise<Buffer> {
  const el = React.createElement(ServicePlanReviewPDF, {
    clientName: plan.clientName,
    dob: formatDateUS(plan.dob),
    planSignedDate: formatDateUS(plan.signedDate),
    planSignedBy: [plan.supervisorName, plan.supervisorCredentials].filter(Boolean).join(', '),
    reviewedDate: formatDateUS(review.reviewedDate),
    reviewerName: review.reviewerName,
    reviewerCredentials: review.reviewerCredentials,
    signature: review.signature,
    note: review.note,
    differencesAcknowledged: review.differencesAcknowledged,
    nextDueDate: formatDateUS(addDaysISO(review.reviewedDate, SERVICE_PLAN_MAX_DAYS)),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pdf's renderToBuffer wants its own element type
  }) as any;
  return Buffer.from(await renderToBuffer(el));
}

export function servicePlanReviewPdfFileName(plan: ServicePlanRecord, review: ServicePlanReview): string {
  return `Service_Plan_Review_${fileStem(plan.clientName)}_${formatDateUSFile(review.reviewedDate)}.pdf`;
}

/**
 * Record a "reviewed, no changes" attestation on the client's CURRENT plan and
 * file its one-page PDF under Documents (same category as the plan, dated the
 * review, so the 62-day readiness clock restarts). Filing is non-fatal.
 */
export async function createServicePlanReview(planId: string, input: ServicePlanReviewInput, caller: AuthedCaller): Promise<{ ok: true; review: ServicePlanReview; filed: boolean } | { ok: false; status: number; error: string }> {
  const db = adminDb();
  const plan = await getServicePlan(planId);
  if (!plan) return { ok: false, status: 404, error: 'Service plan not found.' };
  const newest = (await listServicePlans(plan.patientId))[0];
  if (!newest || newest.id !== plan.id) return { ok: false, status: 409, error: 'Only the current service plan can be reviewed. A newer plan has been signed since.' };

  const reviewedDate = agencyTodayISO();
  const ref = db.collection(COL).doc(planId).collection(REVIEWS).doc();
  await ref.set({
    planId,
    patientId: plan.patientId,
    reviewedDate,
    reviewerUid: caller.uid,
    reviewerName: input.reviewerName.trim(),
    reviewerCredentials: input.reviewerCredentials.trim(),
    signature: input.signature,
    note: input.note.trim(),
    differencesAcknowledged: input.differencesAcknowledged,
    documentId: '',
    createdAt: FieldValue.serverTimestamp(),
  });
  let review = serializeReview(ref.id, (await ref.get()).data() || {});

  let filed = false;
  try {
    const pdf = await renderServicePlanReviewPdf(plan, review);
    const docRef = db.collection('patientDocuments').doc();
    const fileName = servicePlanReviewPdfFileName(plan, review);
    const storagePath = `patients/${plan.patientId}/documents/${docRef.id}/${fileName}`;
    await adminBucket().file(storagePath).save(pdf, { contentType: 'application/pdf', resumable: false });
    const byName = caller.profile.displayName || caller.email || '';
    await docRef.set({
      patientId: plan.patientId,
      category: SERVICE_PLAN_DOC_CATEGORY,
      title: `Service Plan Review, ${formatDateUS(reviewedDate)} (plan signed ${formatDateUS(plan.signedDate)}), no changes`,
      fileName,
      storagePath,
      contentType: 'application/pdf',
      size: pdf.length,
      docDate: reviewedDate,
      uploadedBy: caller.uid,
      uploadedByName: byName,
      uploadedByRole: caller.role,
      uploadedAt: FieldValue.serverTimestamp(),
      archived: false,
      autoFiled: true,
      servicePlanId: plan.id,
      servicePlanReviewId: ref.id,
    });
    await ref.update({ documentId: docRef.id });
    review = { ...review, documentId: docRef.id };
    filed = true;
  } catch (err) {
    console.error('Service plan review: filing the PDF failed:', err);
  }
  return { ok: true, review, filed };
}

export async function getServicePlanReview(planId: string, reviewId: string): Promise<{ plan: ServicePlanRecord; review: ServicePlanReview } | null> {
  const plan = await getServicePlan(planId);
  const review = plan?.reviews.find((r) => r.id === reviewId);
  return plan && review ? { plan, review } : null;
}

/**
 * Re-render a service plan or service plan review PDF filed under Documents,
 * in place (same file, same document entry), with the current layout. The
 * filed copy is a snapshot taken at signing; this changes only how it is
 * laid out, never what it says: a plan is rendered as signed (without the
 * reviews that came after it), a review as recorded.
 */
export async function refreshServicePlanDocument(documentId: string): Promise<{ ok: true; title: string } | { ok: false; status: number; error: string }> {
  const ref = adminDb().collection('patientDocuments').doc(documentId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, status: 404, error: 'Document not found.' };
  const d = snap.data() || {};
  const planId = String(d.servicePlanId || '');
  if (!planId) return { ok: false, status: 400, error: 'This document was not filed from a service plan.' };
  const plan = await getServicePlan(planId);
  if (!plan) return { ok: false, status: 404, error: 'The service plan behind this document was not found.' };
  const reviewId = String(d.servicePlanReviewId || '');
  let pdf: Buffer;
  if (reviewId) {
    const review = plan.reviews.find((r) => r.id === reviewId);
    if (!review) return { ok: false, status: 404, error: 'The review behind this document was not found.' };
    pdf = await renderServicePlanReviewPdf(plan, review);
  } else {
    pdf = await renderServicePlanPdf({ ...plan, reviews: [] });
  }
  const storagePath = String(d.storagePath || '');
  if (!storagePath.startsWith(`patients/${plan.patientId}/documents/${documentId}/`)) {
    return { ok: false, status: 409, error: 'The stored file is not where it should be; nothing was changed.' };
  }
  await adminBucket().file(storagePath).save(pdf, { contentType: 'application/pdf', resumable: false });
  await ref.update({ size: pdf.length, refreshedAt: FieldValue.serverTimestamp() });
  return { ok: true, title: String(d.title || '') };
}
