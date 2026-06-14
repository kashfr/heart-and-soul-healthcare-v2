import 'server-only';
import type { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';

/**
 * One entry from a progress note's append-only `editHistory` subcollection,
 * read with the admin SDK for server-side rendering (the PDF audit trail).
 * Mirrors the client `EditHistoryEntry` but also surfaces `action`
 * (archive/restore markers) which the PDF trail includes.
 */
export interface ServerEditHistoryEntry {
  id: string;
  editedByName: string;
  editedByRole: string;
  editedAt: Date | null;
  changes: Record<string, { from: unknown; to: unknown }>;
  reason?: string;
  correctionNote?: string;
  action?: string;
}

/**
 * Fetch a note's edit history in chronological order (oldest first) so it reads
 * as a top-to-bottom timeline in the exported PDF. Returns [] on any error —
 * the audit trail is additive context and must never block the export.
 */
export async function getEditHistoryServer(noteId: string): Promise<ServerEditHistoryEntry[]> {
  try {
    const snap = await adminDb()
      .collection('progressNotes')
      .doc(noteId)
      .collection('editHistory')
      .orderBy('editedAt', 'asc')
      .get();
    return snap.docs.map((d) => {
      const data = d.data();
      const editedAt = data.editedAt as Timestamp | undefined;
      return {
        id: d.id,
        editedByName: data.editedByName || data.editedBy || '',
        editedByRole: data.editedByRole || '',
        editedAt: editedAt ? editedAt.toDate() : null,
        changes: (data.changes || {}) as Record<string, { from: unknown; to: unknown }>,
        ...(data.reason ? { reason: String(data.reason) } : {}),
        ...(data.correctionNote ? { correctionNote: String(data.correctionNote) } : {}),
        ...(data.action ? { action: String(data.action) } : {}),
      };
    });
  } catch (error) {
    console.error('Error fetching edit history (server):', error);
    return [];
  }
}
