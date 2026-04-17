import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { User } from 'firebase/auth';

export interface ExportAuditEntry {
  userId: string;
  userEmail: string | null;
  submissionIds: string[];
  count: number;
  format: 'zip' | 'merged-pdf';
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
}

export async function logExport(
  user: User,
  entry: Omit<ExportAuditEntry, 'userId' | 'userEmail'>
): Promise<void> {
  try {
    await addDoc(collection(db, 'exportAudits'), {
      ...entry,
      userId: user.uid,
      userEmail: user.email,
      exportedAt: serverTimestamp(),
    });
  } catch (err) {
    // Audit failures shouldn't block the user's download; log and move on.
    console.error('Failed to write export audit:', err);
  }
}
