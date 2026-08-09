import React from 'react';
import { NextResponse } from 'next/server';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { adminDb } from '@/lib/firebaseAdmin';
import { getServerSettings } from '@/lib/settingsServer';
import TarPDF, {
  type TarPdfCell,
  type TarPdfRow,
  type TarPdfLogEntry,
  type TarCellStatus,
} from '@/lib/pdf/TarPDF';

/**
 * Monthly Treatment Administration Record export. Mirrors /api/mar/pdf: same
 * auth, same month contract, same assemble-then-render shape, so the two
 * printable records stay in step.
 */

const MONTH_RE = /^\d{4}-\d{2}$/;

const PERFORMER_LABELS: Record<string, string> = {
  nurse: 'Nurse',
  family: 'Parent / guardian',
  responsibleParty: 'Responsible party',
  dsp: 'DSP',
  proxy: 'Proxy',
};

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function dayISO(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, '0')}`;
}
function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function shortDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function truncate(s: string, max: number): string | undefined {
  if (!s) return undefined;
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}
/** Firestore Timestamp (or anything with toDate) to a 'YYYY-MM-DD' string. */
function tsToISO(v: unknown): string {
  const d = (v as { toDate?: () => Date })?.toDate?.();
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function statusLabel(s: string): string {
  return s === 'done' ? 'Carried out' : s === 'not-done' ? 'Not carried out' : s === 'na' ? 'Not applicable' : s;
}

interface TaskDoc {
  id: string;
  name: string;
  categoryLabel: string;
  frequency: string;
  instructions: string;
  level: string;
  timesPerDay: number;
  status: string;
  createdAtISO: string;
  discontinuedAtISO: string;
}

interface EntryDoc {
  id: string;
  amends: string;
  amendReason: string;
  taskId: string;
  date: string;
  slotIndex: number;
  status: string;
  performedByType: string;
  performerName: string;
  time: string;
  initials: string;
  reason: string;
  note: string;
  taskNameSnapshot: string;
  documentedBy: string;
  documentedByName: string;
  documentedByCredential: string;
}

export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const patientId = String(body?.patientId || '').trim();
  const month = String(body?.month || '').trim();
  if (!patientId || !MONTH_RE.test(month)) {
    return NextResponse.json({ error: 'patientId and month (YYYY-MM) are required.' }, { status: 400 });
  }

  try {
    const days = daysInMonth(month);
    const start = dayISO(month, 1);
    const end = dayISO(month, days);
    const db = adminDb();

    const [patientSnap, clinicalSnap, tasksSnap, entriesSnap, settings] = await Promise.all([
      db.collection('patients').doc(patientId).get(),
      db.collection('patients').doc(patientId).collection('clinical').doc('profile').get(),
      db.collection('careTasks').where('patientId', '==', patientId).get(),
      db
        .collection('careTaskAdministrations')
        .where('patientId', '==', patientId)
        .where('date', '>=', start)
        .where('date', '<=', end)
        .get(),
      getServerSettings(),
    ]);

    if (!patientSnap.exists) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }
    const p = patientSnap.data() || {};
    const c = clinicalSnap.exists ? clinicalSnap.data() || {} : {};

    const tasks: TaskDoc[] = tasksSnap.docs
      .map((d) => {
        const t = d.data() || {};
        const n = Math.min(Math.max(Math.floor(Number(t.timesPerDay)) || 1, 1), 12);
        return {
          id: d.id,
          name: String(t.name || ''),
          categoryLabel: String(t.categoryLabel || ''),
          frequency: String(t.frequency || ''),
          instructions: String(t.instructions || ''),
          level: String(t.level || ''),
          timesPerDay: n,
          status: String(t.status || 'active'),
          createdAtISO: tsToISO(t.createdAt),
          discontinuedAtISO: tsToISO(t.discontinuedAt),
        };
      })
      .sort((a, b) =>
        a.categoryLabel === b.categoryLabel
          ? a.name.localeCompare(b.name)
          : a.categoryLabel.localeCompare(b.categoryLabel),
      );

    const rawEntries: EntryDoc[] = entriesSnap.docs.map((d) => {
      const e = d.data() || {};
      return {
        id: d.id,
        amends: String(e.amends || ''),
        amendReason: String(e.amendReason || ''),
        taskId: String(e.taskId || ''),
        date: String(e.date || ''),
        slotIndex: Number(e.slotIndex) || 0,
        status: String(e.status || ''),
        performedByType: String(e.performedByType || ''),
        performerName: String(e.performerName || ''),
        time: String(e.time || ''),
        initials: String(e.initials || ''),
        reason: String(e.reason || ''),
        note: String(e.note || ''),
        taskNameSnapshot: String(e.taskNameSnapshot || ''),
        documentedBy: String(e.documentedBy || ''),
        documentedByName: String(e.documentedByName || ''),
        documentedByCredential: String(e.documentedByCredential || ''),
      };
    });

    // A correction supersedes what it amends, so the grid shows current truth.
    const supersededIds = new Set(rawEntries.map((e) => e.amends).filter(Boolean));
    const entries = rawEntries.filter((e) => !supersededIds.has(e.id));

    const rows: TarPdfRow[] = [];
    for (const t of tasks) {
      // A task discontinued before this month, or created after it, has nothing
      // to show; skip it rather than printing an empty row.
      if (t.createdAtISO && t.createdAtISO > end) continue;
      if (t.status === 'discontinued' && t.discontinuedAtISO && t.discontinuedAtISO < start) continue;

      for (let slot = 0; slot < t.timesPerDay; slot += 1) {
        const cells: TarPdfCell[] = [];
        for (let day = 1; day <= days; day += 1) {
          const iso = dayISO(month, day);
          const inactive =
            (t.createdAtISO && iso < t.createdAtISO) ||
            (t.status === 'discontinued' && t.discontinuedAtISO && iso > t.discontinuedAtISO);
          if (inactive) {
            cells.push({ label: '', status: 'inactive' as TarCellStatus, star: false });
            continue;
          }
          const hit = entries.find((e) => e.taskId === t.id && e.date === iso && e.slotIndex === slot);
          if (!hit) {
            cells.push({ label: '', status: 'none' as TarCellStatus, star: false });
            continue;
          }
          cells.push({
            label: hit.status === 'done' ? hit.initials || '✓' : hit.status === 'na' ? 'N/A' : 'R',
            status: hit.status as TarCellStatus,
            star: !!hit.performedByType && hit.performedByType !== 'nurse',
          });
        }
        rows.push({
          treatmentLine1: slot === 0 ? t.name : `${t.name} (box ${slot + 1})`,
          treatmentLine2: [
            t.categoryLabel,
            t.frequency,
            t.level === 'skilled' ? 'Skilled' : '',
            t.status === 'discontinued' ? `D/C ${shortDate(t.discontinuedAtISO)}`.trim() : '',
          ]
            .filter(Boolean)
            .join(' · '),
          // Capped: rows render wrap={false}, so an unbounded note would clip.
          treatmentLine3: slot === 0 ? truncate(t.instructions, 200) : undefined,
          slot: t.timesPerDay > 1 ? String(slot + 1) : '-',
          cells,
        });
      }
    }

    // The log carries everything a grid box can't: why a treatment was missed,
    // who performed it when that wasn't the nurse, and any correction.
    const log: TarPdfLogEntry[] = rawEntries
      .filter(
        (e) =>
          e.status !== 'done' ||
          (!!e.performedByType && e.performedByType !== 'nurse') ||
          !!e.note ||
          !!e.amends,
      )
      .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))
      .map((e) => ({
        date: shortDate(e.date),
        time: e.time || '-',
        treatment: e.taskNameSnapshot || '-',
        status: statusLabel(e.status),
        by: e.performerName
          ? `${PERFORMER_LABELS[e.performedByType] || e.performedByType}: ${e.performerName}`
          : PERFORMER_LABELS[e.performedByType] || '-',
        reason: e.reason || '-',
        note: e.note || '-',
        initials: e.initials || '-',
        amendment: e.amends ? `[Correction: ${e.amendReason || 'no reason given'}]` : undefined,
      }));

    // Legend keyed by the documenting USER, not the initials string, so one
    // clinician prints as one row even where historical entries carry
    // differently-formed initials (they were once free-typed; derived now).
    const byUid = new Map<string, { name: string; tokens: string[] }>();
    for (const e of rawEntries) {
      if (!e.documentedBy || !e.documentedByName || !e.initials) continue;
      const entry = byUid.get(e.documentedBy) || {
        name: `${e.documentedByName}${e.documentedByCredential ? `, ${e.documentedByCredential}` : ''}`,
        tokens: [],
      };
      if (!entry.tokens.includes(e.initials)) entry.tokens.push(e.initials);
      byUid.set(e.documentedBy, entry);
    }
    // Array, not a map keyed by the token: two clinicians can derive the same
    // initials, and a token-keyed map would drop one signer from the legend.
    const legendEntries = Array.from(byUid.values()).map((e) => ({
      initials: e.tokens.join(' / '),
      name: e.name,
    }));

    const element = React.createElement(TarPDF, {
      orgName: settings.branding.orgName || 'Heart and Soul Healthcare',
      monthLabel: monthLabel(month),
      days,
      patient: {
        name: String(p.name || ''),
        dob: String(p.dob || ''),
        sex: String(c.sex || ''),
        recordNumber: String(p.mrn || ''),
        diagnosis: String(p.diagnosis || ''),
        allergies: String(c.allergies || ''),
        physician: [String(c.physicianName || ''), String(c.physicianPhone || '')].filter(Boolean).join(' · '),
        diet: String(c.diet || ''),
      },
      rows,
      legend: legendEntries,
      log,
      generatedAt: new Date().toLocaleString('en-US'),
      generatedBy: caller.profile.displayName || caller.email || '',
    });

    const buffer = await renderToBuffer(element as unknown as React.ReactElement<DocumentProps>);
    const safeName = String(p.name || 'client').replace(/[^a-zA-Z0-9-]+/g, '_');

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="TAR_${safeName}_${month}.pdf"`,
      },
    });
  } catch (err) {
    console.error('TAR PDF export failed:', err);
    return NextResponse.json({ error: 'Failed to generate the TAR PDF.' }, { status: 500 });
  }
}
