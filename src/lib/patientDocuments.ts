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
 * Fetch a document's bytes for viewing. Fetches UNDER the storage security
 * rules (getBlob) instead of getDownloadURL — the latter mints a long-lived
 * token URL that anyone holding the link could fetch, which is the wrong
 * default for PHI.
 *
 * SECURITY: the render type comes from the STORAGE object (blob.type — the
 * rules-enforced, immutable contentType set at upload) clamped to the
 * allowlist, NEVER from the Firestore metadata field. A blob: URL runs in the
 * app's origin, so rendering a forged metadata type like text/html would be
 * stored XSS; anything off the allowlist falls back to a non-executing
 * download (application/octet-stream).
 */
export async function getDocumentBlob(
  d: PatientDocument,
): Promise<{ blob: Blob; type: string }> {
  const raw = await getBlob(ref(storage, d.storagePath));
  const safeType = ALLOWED_DOC_TYPES[raw.type] ? raw.type : 'application/octet-stream';
  return { blob: new Blob([raw], { type: safeType }), type: safeType };
}

/** iPhone/iPad WebKit (every iOS browser is a WebKit shell). iPadOS reports a
 *  desktop-Mac UA, so a touch-capable "Mac" counts too. */
function isIOSWebKit(w: Window): boolean {
  const nav = w.navigator;
  return /iPad|iPhone|iPod/.test(nav.userAgent)
    || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
}

/**
 * Render a fetched document INSIDE an already-open popup window.
 *
 * Why not just `w.location.href = blobUrl`: Safari/WebKit silently refuses to
 * navigate an about:blank popup to a blob: URL — the tab stays blank with no
 * error (Chrome allows it). Building the viewer into the popup's own document
 * works in every engine. Everything is constructed with DOM APIs (no HTML
 * string interpolation), so file names/titles stay inert text — no XSS
 * surface on top of the blob: URL, which we minted ourselves.
 *
 * The object URL is minted in the POPUP's realm (w.URL), so its lifetime is
 * tied to the popup document: closing the tab auto-revokes it (no per-view
 * memory pinned in the long-lived portal tab), and the URL keeps working even
 * if the portal tab later reloads (download links would otherwise go dead).
 *
 * Known tradeoff: reloading the popup re-creates a blank about:blank document
 * — the viewer doesn't survive a refresh; re-click View instead.
 */
export function renderDocumentInWindow(
  w: Window,
  content: { blob: Blob; type: string },
  d: Pick<PatientDocument, 'title' | 'fileName'>,
): void {
  if (w.closed) return; // user closed the tab while the bytes were in flight
  const doc = w.document;
  const name = d.fileName || 'document';
  const url = ((w as Window & { URL?: typeof URL }).URL ?? URL).createObjectURL(content.blob);
  doc.title = d.title || name;

  // Without a viewport meta, iOS lays the popup out at the legacy 980px
  // viewport — the fallback links would render microscopically small.
  const meta = doc.createElement('meta');
  meta.name = 'viewport';
  meta.content = 'width=device-width, initial-scale=1';
  doc.head.appendChild(meta);

  doc.documentElement.style.height = '100%';
  doc.body.style.cssText =
    'margin:0;height:100%;background:#3a3f44;font:15px system-ui,sans-serif';

  const link = (text: string, opts: { download?: boolean } = {}) => {
    const a = doc.createElement('a');
    a.href = url;
    if (opts.download) a.download = name;
    a.textContent = text;
    a.style.cssText = 'color:#fff;display:inline-block;padding:10px 14px';
    return a;
  };

  // Centered launcher used whenever inline rendering isn't trustworthy.
  const launcher = (...links: HTMLAnchorElement[]) => {
    const wrap = doc.createElement('div');
    wrap.style.cssText = 'padding:48px 16px;text-align:center';
    const label = doc.createElement('div');
    label.textContent = doc.title;
    label.style.cssText = 'color:#c8cdd2;margin-bottom:16px;word-break:break-word';
    wrap.appendChild(label);
    for (const a of links) {
      a.style.cssText += ';font-size:17px;font-weight:600';
      wrap.appendChild(a);
      wrap.appendChild(doc.createElement('br'));
    }
    doc.body.appendChild(wrap);
  };

  if (content.type === 'application/pdf') {
    if (isIOSWebKit(w)) {
      // iOS WebKit renders an iframe-embedded PDF as a static image of page 1
      // ONLY — silent truncation of multi-page clinical documents. Top-level
      // navigation via a real link tap paginates correctly, so iOS gets a
      // launcher instead of an inline frame.
      launcher(link(`Open ${name}`), link('Download a copy', { download: true }));
      return;
    }
    // Desktop: slim header with an always-available escape hatch — "Open"
    // shows the raw PDF top-level (also the path that restores Cmd+P
    // printing, which the wrapper page breaks), "Download" saves it.
    const bar = doc.createElement('div');
    bar.style.cssText =
      'position:fixed;top:0;left:0;right:0;height:38px;display:flex;align-items:center;background:#22262a;color:#fff;z-index:1';
    const ttl = doc.createElement('span');
    ttl.textContent = doc.title;
    ttl.style.cssText =
      'flex:1;padding:0 12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    bar.appendChild(ttl);
    bar.appendChild(link('Open'));
    bar.appendChild(link('Download', { download: true }));
    const frame = doc.createElement('iframe');
    frame.src = url;
    frame.title = doc.title;
    frame.style.cssText =
      'border:0;position:fixed;top:38px;left:0;right:0;bottom:0;width:100%;height:calc(100% - 38px)';
    doc.body.appendChild(bar);
    doc.body.appendChild(frame);
  } else if (content.type.startsWith('image/')) {
    const img = doc.createElement('img');
    img.src = url;
    img.alt = name;
    img.style.cssText = 'display:block;margin:0 auto;max-width:100%';
    // HEIC renders natively in Safari but not Chrome — if the image can't
    // decode, fall back to offering the file instead of a broken glyph.
    img.onerror = () => {
      img.remove();
      launcher(link(`Download ${name}`, { download: true }));
    };
    doc.body.appendChild(img);
  } else {
    // Word docs and anything else browsers can't render inline.
    launcher(link(`Download ${name}`, { download: true }));
  }
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
