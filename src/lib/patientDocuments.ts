import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getBlob, ref, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from './firebase';

/**
 * Client documents: uploaded files (plan of care, initial assessment,
 * supervisory visit forms, physician orders, scans) whose bytes live in Cloud
 * Storage and whose metadata lives in the `patientDocuments` collection.
 * Staff and assigned nurses upload and view; only staff archive; nothing is
 * ever hard-deleted (append-only compliance record, like the MAR).
 */

export const DOC_CATEGORIES = [
  'Plan of Care (485)',
  'Initial Assessment',
  'Supervisory Visit',
  'Physician Orders',
  'Progress Note (scanned)',
  'Other',
] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];

export const MAX_DOC_BYTES = 20 * 1024 * 1024; // keep in sync with storage.rules

/** contentType -> short label. Keep in sync with the storage.rules allowlist. */
export const ALLOWED_DOC_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/heic': 'HEIC',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
};

export interface PatientDocument {
  id?: string;
  patientId: string;
  category: string;
  title: string;
  fileName: string;
  storagePath: string;
  contentType: string;
  size: number;
  docDate: string; // YYYY-MM-DD — the date ON the document (drives currency tracking)
  uploadedBy: string;
  uploadedByName: string;
  uploadedByRole: string;
  uploadedAt?: unknown;
  archived: boolean;
  archivedBy?: string;
  archivedByName?: string;
  archivedAt?: unknown;
}

export interface DocUploader {
  uid: string;
  name: string;
  role: string;
}

function sanitizeFileName(name: string): string {
  const cleaned = (name || '').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);
  return cleaned || 'document';
}

// Extension fallback for browsers that report an empty File.type (Windows/
// Android commonly do for .heic). Only allowlisted types are inferable.
const EXT_CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function resolveContentType(file: File): string {
  if (file.type) return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return EXT_CONTENT_TYPES[ext] || '';
}

/**
 * Upload one file + write its metadata doc. The Storage path embeds the
 * pre-allocated metadata doc id (the create rule pins storagePath to it, so
 * metadata can never point at another client's file). File first, metadata
 * second: a failed metadata write leaves an orphaned, unreferenced file
 * (invisible, harmless); the reverse order could show metadata for bytes that
 * never arrived.
 */
export async function uploadPatientDocument(
  params: {
    patientId: string;
    file: File;
    category: DocCategory;
    title: string;
    docDate: string;
    uploader: DocUploader;
  },
  onProgress?: (pct: number) => void,
): Promise<string> {
  const { patientId, file, category, title, docDate, uploader } = params;
  const contentType = resolveContentType(file);
  if (!ALLOWED_DOC_TYPES[contentType]) {
    throw new Error(
      `That file type is not supported${file.name.includes('.') ? ` (.${file.name.split('.').pop()})` : ''}. Upload a PDF, image, or Word document.`,
    );
  }
  if (file.size >= MAX_DOC_BYTES) {
    throw new Error('That file is too large (20 MB max).');
  }

  const docRef = doc(collection(db, 'patientDocuments'));
  const fileName = sanitizeFileName(file.name);
  const storagePath = `patients/${patientId}/documents/${docRef.id}/${fileName}`;

  const task = uploadBytesResumable(ref(storage, storagePath), file, { contentType });
  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / Math.max(1, snap.totalBytes)) * 100)),
      reject,
      () => resolve(),
    );
  });

  await setDoc(docRef, {
    patientId,
    category,
    title: (title || '').trim() || fileName,
    fileName,
    storagePath,
    contentType,
    size: file.size,
    docDate,
    uploadedBy: uploader.uid,
    uploadedByName: uploader.name,
    uploadedByRole: uploader.role,
    uploadedAt: serverTimestamp(),
    archived: false,
  });
  return docRef.id;
}

/** All document metadata for a client (archived included — callers filter),
 *  newest document date first. Equality query: care-team read rule applies. */
export async function getPatientDocuments(patientId: string): Promise<PatientDocument[]> {
  try {
    const q = query(collection(db, 'patientDocuments'), where('patientId', '==', patientId));
    const snap = await getDocs(q);
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PatientDocument[];
    return docs.sort((a, b) => {
      const byDate = (b.docDate || '').localeCompare(a.docDate || '');
      if (byDate !== 0) return byDate;
      const ta = a.uploadedAt as { toMillis?: () => number } | undefined;
      const tb = b.uploadedAt as { toMillis?: () => number } | undefined;
      return (tb?.toMillis?.() || 0) - (ta?.toMillis?.() || 0);
    });
  } catch (error) {
    console.error('Error fetching patient documents:', error);
    return [];
  }
}

/**
 * Object URL for viewing a document in a new tab. Fetches the bytes UNDER the
 * storage security rules (getBlob) instead of getDownloadURL — the latter
 * mints a long-lived token URL that anyone holding the link could fetch, which
 * is the wrong default for PHI. The returned blob: URL lives only in this
 * browser session; callers may revoke it when done.
 *
 * SECURITY: the render type comes from the STORAGE object (blob.type — the
 * rules-enforced, immutable contentType set at upload) clamped to the
 * allowlist, NEVER from the Firestore metadata field. A blob: URL runs in the
 * app's origin, so rendering a forged metadata type like text/html would be
 * stored XSS; anything off the allowlist falls back to a non-executing
 * download (application/octet-stream).
 */
export async function getDocumentUrl(d: PatientDocument): Promise<string> {
  const blob = await getBlob(ref(storage, d.storagePath));
  const safeType = ALLOWED_DOC_TYPES[blob.type] ? blob.type : 'application/octet-stream';
  return URL.createObjectURL(new Blob([blob], { type: safeType }));
}

/** Archive or restore a document (staff-only per rules). The FILE is never
 *  deleted; an archived doc just drops out of the default list. */
export async function setDocumentArchived(
  id: string,
  archived: boolean,
  actor: { uid: string; name: string },
): Promise<void> {
  await updateDoc(doc(db, 'patientDocuments', id), {
    archived,
    archivedBy: archived ? actor.uid : '',
    archivedByName: archived ? actor.name : '',
    archivedAt: archived ? serverTimestamp() : null,
  });
}
