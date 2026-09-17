import 'server-only';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import { getServerSettings } from './settingsServer';
import { formatDateUSFile } from './dateFormat';
import MedErrorPDF from './pdf/MedErrorPDF';
import {
  incidentReportRequired,
  medErrorBellText,
  type MedErrorInput,
  type MedErrorReport,
  type MedErrorReview,
} from './medErrorShared';

/**
 * Firestore side of medication error reports. All writes through the Admin
 * SDK; firestore.rules denies client writes and scopes reads to staff, the
 * reporter, and the client's care team.
 *
 *   medErrorReports/{id}  the report (immutable) + the RN review on top
 */
const COL = 'medErrorReports';

function toIso(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null;
}

function notif(d: unknown) {
  const n = (d || {}) as Record<string, unknown>;
  return { notified: n.notified === true, name: String(n.name || ''), at: String(n.at || '') };
}

export function serializeMedError(id: string, d: FirebaseFirestore.DocumentData): MedErrorReport {
  const rv = d.review as Record<string, unknown> | null | undefined;
  const review: MedErrorReview | null = rv
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
    : null;
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
    review,
    createdAt: toIso(d.createdAt),
  };
}

export async function getMedError(id: string): Promise<MedErrorReport | null> {
  const snap = await adminDb().collection(COL).doc(id).get();
  return snap.exists ? serializeMedError(snap.id, snap.data() || {}) : null;
}

export async function createMedError(p: {
  input: MedErrorInput;
  caller: AuthedCaller;
  patient: { id: string; name: string; dob: string };
}): Promise<{ id: string; incident: boolean }> {
  const db = adminDb();
  const ref = db.collection(COL).doc();
  const incident = incidentReportRequired({ harm: p.input.harm, errorType: p.input.errorType });
  const i = p.input;
  await ref.set({
    patientId: p.patient.id,
    patientName: p.patient.name,
    patientDob: p.patient.dob,
    reporterId: p.caller.uid,
    reporterName: p.caller.profile.displayName || p.caller.email || '',
    reporterCredential: p.caller.profile.credential || '',
    reporterRole: p.caller.role,
    reporterSignature: i.reporterSignature,
    discoveredAt: i.discoveredAt,
    occurredAt: i.occurredAt,
    occurredApprox: i.occurredApprox === true,
    medName: i.medName.trim(),
    doseOrdered: i.doseOrdered.trim(),
    doseGiven: i.doseGiven.trim(),
    route: i.route.trim(),
    marOrderId: i.marOrderId,
    marAdministrationId: i.marAdministrationId,
    errorType: i.errorType,
    doseOutcome: i.doseOutcome,
    description: i.description.trim(),
    responsibleType: i.responsibleType,
    responsibleName: i.responsibleName.trim(),
    harm: i.harm,
    clientCondition: i.clientCondition.trim(),
    physician: { notified: i.physician.notified, name: i.physician.name.trim(), at: i.physician.notified ? i.physician.at : '' },
    guardian: { notified: i.guardian.notified, name: i.guardian.name.trim(), at: i.guardian.notified ? i.guardian.at : '' },
    supervisor: { notified: i.supervisor.notified, name: i.supervisor.name.trim(), at: i.supervisor.notified ? i.supervisor.at : '' },
    actionsTaken: i.actionsTaken.trim(),
    status: 'submitted',
    incidentReportRequired: incident,
    review: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id, incident };
}

/** The RN review. Write-once: a second review on a reviewed report is refused. */
export async function reviewMedError(p: {
  id: string;
  caller: AuthedCaller;
  findings: string;
  rootCause: string;
  correctiveAction: string;
  incidentReportRequired: boolean;
  incidentReportFiledDate: string;
}): Promise<{ ok: boolean; error?: string }> {
  const db = adminDb();
  const ref = db.collection(COL).doc(p.id);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 'missing';
    if ((snap.data() || {}).status === 'reviewed') return 'reviewed';
    tx.update(ref, {
      status: 'reviewed',
      review: {
        reviewerId: p.caller.uid,
        reviewerName: p.caller.profile.displayName || p.caller.email || '',
        reviewerCredential: p.caller.profile.credential || '',
        findings: p.findings.trim(),
        rootCause: p.rootCause.trim(),
        correctiveAction: p.correctiveAction.trim(),
        incidentReportRequired: p.incidentReportRequired,
        incidentReportFiledDate: p.incidentReportFiledDate,
        reviewedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return 'ok';
  });
  if (claimed === 'missing') return { ok: false, error: 'Report not found.' };
  if (claimed === 'reviewed') return { ok: false, error: 'This report has already been reviewed.' };
  return { ok: true };
}

/** Office records the DBHDD incident report's filing date after the review. Write-once. */
export async function markMedErrorIncidentFiled(id: string, filedDate: string, actor: { uid: string; name: string }): Promise<{ ok: boolean; error?: string }> {
  const db = adminDb();
  const ref = db.collection(COL).doc(id);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 'missing';
    const d = snap.data() || {};
    const rv = (d.review || null) as Record<string, unknown> | null;
    if (!rv) return 'unreviewed';
    if (!rv.incidentReportRequired) return 'not-required';
    if (String(rv.incidentReportFiledDate || '')) return 'already';
    tx.update(ref, { 'review.incidentReportFiledDate': filedDate, 'review.incidentReportFiledBy': actor.uid, 'review.incidentReportFiledByName': actor.name, updatedAt: FieldValue.serverTimestamp() });
    return 'ok';
  });
  if (result === 'missing') return { ok: false, error: 'Report not found.' };
  if (result === 'unreviewed') return { ok: false, error: 'Record the nursing review first.' };
  if (result === 'not-required') return { ok: false, error: 'The review says no incident report is required.' };
  if (result === 'already') return { ok: false, error: 'A filing date is already recorded.' };
  return { ok: true };
}

export async function renderMedErrorPdf(report: MedErrorReport): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(MedErrorPDF, { report }) as any;
  return Buffer.from(await renderToBuffer(element));
}

export function medErrorPdfFileName(report: MedErrorReport): string {
  const name = (report.patientName || 'client').replace(/[^a-zA-Z0-9-]+/g, '_').replace(/^_+|_+$/g, '');
  return `Medication_Error_Report_${name}_${formatDateUSFile(report.discoveredAt.slice(0, 10))}.pdf`;
}

/**
 * Who hears about a new report: every active admin and supervisor, plus the
 * corrections reviewer (the RN supervisor) if she isn't already one of them.
 * The reporter is never told about her own report. Returns the recipients.
 */
export async function medErrorRecipients(excludeUid: string): Promise<string[]> {
  const db = adminDb();
  const uids = new Set<string>();
  const staff = await db.collection('users').where('role', 'in', ['admin', 'supervisor']).get();
  for (const u of staff.docs) {
    if ((u.data() as { active?: boolean }).active === false) continue;
    uids.add(u.id);
  }
  try {
    const settings = await getServerSettings();
    if (settings.corrections.reviewerUid) uids.add(settings.corrections.reviewerUid);
  } catch (err) {
    console.error('Med error: settings fetch failed; reviewer not added.', err);
  }
  uids.delete(excludeUid);
  return Array.from(uids);
}

export async function notifyMedError(kind: 'filed' | 'incident' | 'reviewed', report: MedErrorReport, recipients: string[]): Promise<number> {
  const db = adminDb();
  const text = medErrorBellText(kind, report);
  let n = 0;
  for (const uid of recipients) {
    try {
      await db.collection('notifications').add({ userId: uid, kind: `med-error-${kind}`, text, href: `/admin/med-errors?r=${report.id}`, createdAt: FieldValue.serverTimestamp(), readAt: null });
      n++;
    } catch (err) {
      console.error('Med error bell failed:', err);
    }
  }
  return n;
}
