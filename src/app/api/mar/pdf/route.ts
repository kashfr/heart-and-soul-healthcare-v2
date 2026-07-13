import React from 'react';
import { NextResponse } from 'next/server';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { adminDb } from '@/lib/firebaseAdmin';
import { getServerSettings } from '@/lib/settingsServer';
import { compareMarOrders, resolveCurrentAdministrations } from '@/lib/marShared';
import MarPDF, {
  type MarPdfCell,
  type MarPdfRow,
  type MarPdfLogEntry,
  type MarCellStatus,
} from '@/lib/pdf/MarPDF';

const MONTH_RE = /^\d{4}-\d{2}$/;

const ADMIN_BY_LABELS: Record<string, string> = {
  nurse: 'Nurse',
  family: 'Family member',
  responsibleParty: 'Responsible party',
  self: 'Client (self)',
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

interface OrderDoc {
  id: string;
  medName: string;
  dose: string;
  units: string;
  route: string;
  frequencyLabel: string;
  scheduledTimes: string[];
  isPRN: boolean;
  indication: string; // standing purpose — printed on PRN rows (manual D.6.b.ii.d)
  notes: string; // special instructions — printed on the MAR row (manual D.6.a.ii.e)
  startDate: string;
  endDate: string | null;
  status: string;
}

interface AdminDoc {
  id: string;
  amends: string;
  amendmentReason: string;
  orderId: string;
  medNameSnapshot: string;
  doseSnapshot: string;
  unitsSnapshot: string;
  date: string;
  scheduledTime: string;
  status: string;
  administeredByType: string;
  administratorName: string;
  actualTime: string;
  initials: string;
  reason: string;
  outcome: string;
  documentedByName: string;
  documentedByCredential: string;
}

function windowOverlaps(o: OrderDoc, start: string, end: string): boolean {
  if (o.startDate && o.startDate > end) return false;
  if (o.endDate && o.endDate < start) return false;
  return true;
}

function windowIncludes(o: OrderDoc, date: string): boolean {
  if (o.startDate && date < o.startDate) return false;
  if (o.endDate && date > o.endDate) return false;
  return true;
}

function adminBy(a: AdminDoc): string {
  if (a.administeredByType && a.administeredByType !== 'nurse') {
    const label = ADMIN_BY_LABELS[a.administeredByType] || 'Other';
    return a.administratorName ? `${label} · ${a.administratorName}` : label;
  }
  return a.documentedByName || 'Nurse';
}

function statusWord(s: string): string {
  return s === 'given' ? 'Given' : s === 'held' ? 'Held' : s === 'refused' ? 'Refused' : s;
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

    const [patientSnap, clinicalSnap, ordersSnap, adminsSnap, settings] = await Promise.all([
      db.collection('patients').doc(patientId).get(),
      db.collection('patients').doc(patientId).collection('clinical').doc('profile').get(),
      db.collection('marOrders').where('patientId', '==', patientId).get(),
      db
        .collection('marAdministrations')
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

    const orders: OrderDoc[] = ordersSnap.docs.map((d) => {
      const o = d.data() || {};
      return {
        id: d.id,
        medName: String(o.medName || ''),
        dose: String(o.dose || ''),
        units: String(o.units || ''),
        route: String(o.route || ''),
        frequencyLabel: String(o.frequencyLabel || ''),
        scheduledTimes: Array.isArray(o.scheduledTimes) ? o.scheduledTimes.map(String) : [],
        isPRN: !!o.isPRN,
        indication: String(o.indication || ''),
        notes: String(o.notes || ''),
        startDate: String(o.startDate || ''),
        endDate: o.endDate ? String(o.endDate) : null,
        status: String(o.status || 'active'),
      };
    });

    const admins: AdminDoc[] = adminsSnap.docs.map((d) => {
      const a = d.data() || {};
      return {
        id: d.id,
        amends: String(a.amends || ''),
        amendmentReason: String(a.amendmentReason || ''),
        orderId: String(a.orderId || ''),
        medNameSnapshot: String(a.medNameSnapshot || ''),
        doseSnapshot: String(a.doseSnapshot || ''),
        unitsSnapshot: String(a.unitsSnapshot || ''),
        date: String(a.date || ''),
        scheduledTime: String(a.scheduledTime || ''),
        status: String(a.status || ''),
        administeredByType: String(a.administeredByType || 'nurse'),
        administratorName: String(a.administratorName || ''),
        actualTime: String(a.actualTime || ''),
        initials: String(a.initials || ''),
        reason: String(a.reason || ''),
        outcome: String(a.outcome || ''),
        documentedByName: String(a.documentedByName || ''),
        documentedByCredential: String(a.documentedByCredential || ''),
      };
    });

    // Collapse amendment chains: a correction supersedes the original, so the
    // grid + log show the CURRENT value once. Originals stay in adminsById so an
    // amended entry can report what it was corrected FROM.
    const adminsById = new Map(admins.map((a) => [a.id, a]));
    const adminsCurrent = resolveCurrentAdministrations(admins);

    // Cell lookup, mirroring the web grid: orderId|date|slot.
    const cellMap = new Map<string, AdminDoc[]>();
    for (const a of adminsCurrent) {
      const k = `${a.orderId}|${a.date}|${a.scheduledTime}`;
      const arr = cellMap.get(k) || [];
      arr.push(a);
      cellMap.set(k, arr);
    }

    // Routine meds are one discrete portion of the MAR; PRN / as-needed meds
    // follow in their own labeled portion (DBHDD FY27 manual D.6.a / D.6.b) —
    // so sort non-PRN before PRN, alphabetical within each.
    const monthOrders = orders
      .filter((o) => windowOverlaps(o, start, end))
      .sort((a, b) => Number(a.isPRN) - Number(b.isPRN) || compareMarOrders(a, b));

    const rows: MarPdfRow[] = [];
    for (const o of monthOrders) {
      const slots = o.isPRN ? ['PRN'] : o.scheduledTimes;
      for (const slot of slots) {
        const cells: MarPdfCell[] = [];
        for (let d = 1; d <= days; d += 1) {
          const iso = dayISO(month, d);
          if (!windowIncludes(o, iso)) {
            cells.push({ label: '', status: 'inactive' as MarCellStatus, star: false });
            continue;
          }
          const hits = cellMap.get(`${o.id}|${iso}|${slot}`) || [];
          if (hits.length === 0) {
            cells.push({ label: '', status: 'none' as MarCellStatus, star: false });
            continue;
          }
          const first = hits[0];
          cells.push({
            label:
              hits.length > 1
                ? hits.map((h) => h.initials || '·').join('/')
                : first.initials || '✓',
            status: (first.status as MarCellStatus) || 'given',
            star: hits.some((h) => h.administeredByType && h.administeredByType !== 'nurse'),
          });
        }
        rows.push({
          medLine1: o.medName,
          medLine2: [
            [o.dose, o.units].filter(Boolean).join(' '),
            o.route,
            o.frequencyLabel,
            o.status === 'discontinued' ? `D/C ${o.endDate ? shortDate(o.endDate) : ''}`.trim() : '',
          ]
            .filter(Boolean)
            .join(' · '),
          // Special instructions + (for PRN) the standing purpose, replicated
          // from the order onto the MAR (manual D.6.a.ii.e / D.6.b.ii.d).
          // Capped: rows render wrap={false}, so an unbounded free-text note
          // would silently clip on the printed record. The full text always
          // lives on the order itself.
          medLine3: truncate(
            [o.isPRN && o.indication ? `For: ${o.indication}` : '', o.notes]
              .filter(Boolean)
              .join(' · '),
            220,
          ),
          slot,
          isPRN: o.isPRN,
          cells,
        });
      }
    }

    const rowOrderIds = new Set(monthOrders.map((o) => o.id));
    const log: MarPdfLogEntry[] = adminsCurrent
      .filter(
        (a) =>
          a.scheduledTime === 'PRN' ||
          a.scheduledTime === 'unscheduled' ||
          a.status !== 'given' ||
          (a.administeredByType && a.administeredByType !== 'nurse') ||
          !rowOrderIds.has(a.orderId) ||
          !!a.amends, // corrections always appear in the audit log
      )
      .sort((a, b) => (a.date + a.actualTime).localeCompare(b.date + b.actualTime))
      .map((a) => {
        const prev = a.amends ? adminsById.get(a.amends) : undefined;
        const amendment = a.amends
          ? `Correction${prev ? ` of the "${statusWord(prev.status)}" entry` : ''}: ${a.amendmentReason || 'no reason given'}`
          : undefined;
        return {
          date: shortDate(a.date),
          time: a.actualTime || '-',
          med: [a.medNameSnapshot, [a.doseSnapshot, a.unitsSnapshot].filter(Boolean).join(' ')]
            .filter(Boolean)
            .join(' '),
          status: a.status,
          by: adminBy(a),
          reason: a.reason || '-',
          // A given PRN dose is complete only once its result is recorded; the
          // export says so explicitly rather than printing a silent blank.
          result: a.outcome.trim()
            ? a.outcome
            : a.status === 'given' && a.scheduledTime === 'PRN'
              ? 'Result pending'
              : '-',
          initials: a.initials || '-',
          amendment,
        };
      });

    const legendMap = new Map<string, string>();
    for (const a of admins) {
      if (a.initials && a.documentedByName && !legendMap.has(a.initials)) {
        legendMap.set(
          a.initials,
          `${a.documentedByName}${a.documentedByCredential ? `, ${a.documentedByCredential}` : ''}`,
        );
      }
    }

    const element = React.createElement(MarPDF, {
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
      legend: Array.from(legendMap.entries()).map(([initials, name]) => ({ initials, name })),
      log,
      generatedAt: new Date().toLocaleString('en-US'),
      generatedBy: caller.profile.displayName || caller.email || '',
    });

    const buffer = await renderToBuffer(element as unknown as React.ReactElement<DocumentProps>);
    const safeName = String(p.name || 'client').replace(/[^a-zA-Z0-9-]+/g, '_');

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="MAR_${safeName}_${month}.pdf"`,
      },
    });
  } catch (err) {
    console.error('MAR PDF export failed:', err);
    return NextResponse.json({ error: 'Failed to generate the MAR PDF.' }, { status: 500 });
  }
}
