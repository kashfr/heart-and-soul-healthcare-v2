import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { normalizeName } from '@/lib/levenshtein';

/**
 * GET /api/admin/maintenance/duplicate-notes
 *
 * Read-only audit: finds sets of ALREADY-SUBMITTED notes that duplicate each
 * other — same nurse + same date of service + same patient — using the same
 * matching the submit-time hard stop uses (roster link when present, else
 * normalized name). Archived notes are excluded (archiving is how you resolve
 * a duplicate). Changes nothing; the admin decides which note in each set to
 * archive from the note's own detail page.
 *
 * Admin-only.
 */
interface NoteLite {
  id: string;
  clientName: string;
  patientId: string;
  q3: string; // normalized name cache
}

export async function GET(request: Request) {
  try {
    await requireRole(request, ['admin']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const db = adminDb();
  const snap = await db.collection('progressNotes').get();

  // Two notes are the same patient if both carry the same roster link;
  // otherwise compare normalized typed names.
  const samePatient = (a: { patientId: string; q3: string }, b: { patientId: string; q3: string }) => {
    if (a.patientId && b.patientId) return a.patientId === b.patientId;
    return a.q3 !== '' && a.q3 === b.q3;
  };

  // Bucket active notes by nurse + date of service.
  interface Row {
    id: string;
    clientName: string;
    nurseName: string;
    dateOfService: string;
    submittedAt: number | null;
    patientId: string;
    q3: string;
  }
  const buckets = new Map<string, Row[]>();

  for (const d of snap.docs) {
    const data = d.data();
    if (data.status === 'archived' || data.archivedAt) continue; // resolved
    const nurseId = String(data.nurseId || '');
    const dateOfService = String(data.q6_dateofService || '').trim();
    if (!nurseId || !dateOfService) continue; // can't pair without both
    const row: Row = {
      id: d.id,
      clientName: String(data.q3_clientName || ''),
      nurseName: String(data.q11_nurseName || ''),
      dateOfService,
      submittedAt: data.submittedAt?.toMillis?.() ?? null,
      patientId: String(data.patientId || ''),
      q3: normalizeName(String(data.q3_clientName || '')),
    };
    const key = `${nurseId}|${dateOfService}`;
    const arr = buckets.get(key);
    if (arr) arr.push(row);
    else buckets.set(key, [row]);
  }

  // Within each bucket, cluster notes that refer to the same patient.
  interface DuplicateGroup {
    clientName: string;
    nurseName: string;
    dateOfService: string;
    notes: { id: string; submittedAt: number | null; patientId: string | null }[];
  }
  const groups: DuplicateGroup[] = [];

  for (const rows of buckets.values()) {
    if (rows.length < 2) continue;
    const clusters: Row[][] = [];
    for (const row of rows) {
      const target: NoteLite = { id: row.id, clientName: row.clientName, patientId: row.patientId, q3: row.q3 };
      const cluster = clusters.find((c) => c.some((n) => samePatient(n, target)));
      if (cluster) cluster.push(row);
      else clusters.push([row]);
    }
    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      // Newest submission first within the set.
      cluster.sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
      groups.push({
        clientName: cluster[0].clientName,
        nurseName: cluster[0].nurseName,
        dateOfService: cluster[0].dateOfService,
        notes: cluster.map((n) => ({ id: n.id, submittedAt: n.submittedAt, patientId: n.patientId || null })),
      });
    }
  }

  // Most recent shift first.
  groups.sort((a, b) => b.dateOfService.localeCompare(a.dateOfService));

  const duplicateNotes = groups.reduce((sum, g) => sum + g.notes.length, 0);

  return NextResponse.json({
    notesScanned: snap.size,
    duplicateSets: groups.length,
    duplicateNotes,
    groups,
  });
}
