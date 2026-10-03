import React from 'react';
import { NextResponse } from 'next/server';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { adminDb } from '@/lib/firebaseAdmin';
import { getServerSettings } from '@/lib/settingsServer';
import { cleanTimeLabels, compareMarOrders, resolveCurrentAdministrations, describeFrequency } from '@/lib/marShared';
import { GLUCOSE_UNIT, parseSlidingScale, summarizeSlidingScale, type SlidingScaleRow } from '@/lib/slidingScale';
import { formatDateUS, formatMonthUSFile } from '@/lib/dateFormat';
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

/** Blank log rows on a printout that will be written on by hand. */
const LOG_WRITE_IN_ROWS = 20;

/** The agency's current month, 'YYYY-MM' (Georgia time, not the container's UTC). */
function agencyMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .slice(0, 7);
}

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
  timeLabels: Record<string, string>; // meal anchors, keyed by 'HH:MM'
  slidingScale: SlidingScaleRow[]; // dose looked up from a blood glucose reading
  isPRN: boolean;
  prnFrequencyLabel: string; // PRN only: how often it may be given
  indication: string; // standing purpose — printed on PRN rows (manual D.6.b.ii.d)
  parameters: string; // hold / check-before-giving criteria — printed first on the MAR row
  notes: string; // special instructions — printed on the MAR row (manual D.6.a.ii.e)
  startDate: string;
  endDate: string | null;
  status: string;
}

interface AdminDoc {
  id: string;
  voided: boolean;
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
  parametersReading: string; // the reading checked against the order's parameters
  prescriberNotified: boolean | null;
  outcome: string;
  /** Reading for a check-style order (gastric residual, etc.); '' for doses. */
  value: string;
  valueUnit: string;
  /** Sliding-scale dose: meter reading, the matched range, why it differs. */
  glucoseReading: string;
  scaleRange: string;
  scaleDeviationReason: string;
  documentedBy: string;
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

    // A voided order came from a change that was later reverted; it is audit
    // history and must not print on the record. Mirrors getMarOrdersStrict.
    const liveOrderDocs = ordersSnap.docs.filter(
      (d) => String((d.data() || {}).status || '') !== 'voided',
    );
    const orders: OrderDoc[] = liveOrderDocs.map((d) => {
      const o = d.data() || {};
      return {
        id: d.id,
        medName: String(o.medName || ''),
        dose: String(o.dose || ''),
        units: String(o.units || ''),
        route: String(o.route || ''),
        frequencyLabel: String(o.frequencyLabel || ''),
        scheduledTimes: Array.isArray(o.scheduledTimes) ? o.scheduledTimes.map(String) : [],
        timeLabels: cleanTimeLabels(o.timeLabels, o.scheduledTimes, !!o.isPRN),
        slidingScale: parseSlidingScale(o.slidingScale),
        isPRN: !!o.isPRN,
        prnFrequencyLabel: String(o.prnFrequencyLabel || ''),
        indication: String(o.indication || ''),
        parameters: String(o.parameters || ''),
        notes: String(o.notes || ''),
        startDate: String(o.startDate || ''),
        endDate: o.endDate ? String(o.endDate) : null,
        status: String(o.status || 'active'),
      };
    });

    // NOTE: voided (entered-in-error) docs are NOT pre-filtered here. The
    // voided-chain drop happens inside resolveCurrentAdministrations, which
    // needs the COMPLETE list: a voided correction's `amends` pointer is what
    // keeps its superseded original suppressed. Pre-filtering would resurrect
    // the original onto the printed record — the exact entry the void struck.
    const admins: AdminDoc[] = adminsSnap.docs.map((d) => {
      const a = d.data() || {};
      return {
        id: d.id,
        voided: a.voided === true,
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
        parametersReading: String(a.parametersReading || ''),
        // Tri-state: docs from before the attestation feature existed have no
        // field at all — printing "(prescriber not yet notified)" on them
        // would stamp a false negative assertion onto historical months.
        prescriberNotified:
          typeof a.prescriberNotified === 'boolean' ? a.prescriberNotified : null,
        outcome: String(a.outcome || ''),
        value: String(a.value || ''),
        valueUnit: String(a.valueUnitSnapshot || ''),
        glucoseReading: String(a.glucoseReading || '').trim(),
        scaleRange: String(a.scaleRangeSnapshot || ''),
        scaleDeviationReason: String(a.scaleDeviationReason || ''),
        documentedBy: String(a.documentedBy || ''),
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
          // A sliding-scale row prints three labeled lines per time: the
          // blood glucose reading, the units given, and the initials (RN
          // supervisor, 10/02/2026: a bare "232" in a box told a non-clinical
          // reader nothing). Keyed off the ORDER, so a held or refused dose
          // with no reading still lands on the right lines.
          const scaleUnits = (h: AdminDoc) =>
            h.status === 'given' ? `${h.doseSnapshot}u` : h.status === 'held' ? 'Held' : 'Ref';
          if (o.slidingScale.length > 0) {
            cells.push({
              label: hits.map((h) => h.glucoseReading).filter(Boolean).join('/'),
              sub: hits.map(scaleUnits).join('/'),
              initials: hits.map((h) => h.initials).filter(Boolean).join('/'),
              status: (first.status as MarCellStatus) || 'given',
              star: hits.some((h) => h.administeredByType && h.administeredByType !== 'nurse'),
            });
            continue;
          }
          cells.push({
            // A check-style order records a reading; the number is the record,
            // so print it in the box rather than the documenter's initials
            // (which stay in the legend and the exception log).
            label:
              hits.length > 1
                ? hits.map((h) => h.value || h.initials || '·').join('/')
                : first.value || first.initials || '✓',
            status: (first.status as MarCellStatus) || 'given',
            star: hits.some((h) => h.administeredByType && h.administeredByType !== 'nurse'),
          });
        }
        rows.push({
          medLine1: o.medName,
          medLine2: [
            [o.dose, o.units].filter(Boolean).join(' '),
            o.route,
            describeFrequency(o),
            o.status === 'discontinued' ? `D/C ${o.endDate ? shortDate(o.endDate) : ''}`.trim() : '',
          ]
            .filter(Boolean)
            .join(' · '),
          // Special instructions + (for PRN) the standing purpose, replicated
          // from the order onto the MAR (manual D.6.a.ii.e / D.6.b.ii.d).
          // Capped: rows render wrap={false}, so an unbounded free-text note
          // would silently clip on the printed record. The full text always
          // lives on the order itself.
          // Parameters lead (hold / check criteria are what a surveyor and
          // the next nurse need first), then the PRN purpose, then notes.
          // The whole sliding scale, uncapped: it IS the dose on this row, so
          // it must never print truncated. Bounded by the 15-range limit.
          medScale: o.slidingScale.length > 0 ? `Sliding scale (${GLUCOSE_UNIT}: units): ${summarizeSlidingScale(o.slidingScale)}` : undefined,
          medLine3: truncate(
            [
              o.parameters ? `Parameters: ${o.parameters}` : '',
              o.isPRN && o.indication ? `For: ${o.indication}` : '',
              o.notes,
            ]
              .filter(Boolean)
              .join(' · '),
            220,
          ),
          slot,
          slotLabel: o.timeLabels[slot] || undefined,
          isScale: o.slidingScale.length > 0,
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
          !!a.scaleDeviationReason || // an amount that differs from the sliding scale
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
          // D.4.d: the printed record shows whether the prescriber was told.
          // Positive attestation prints on any held/refused dose; the NEGATIVE
          // prints only on refusals (holds are often physician-directed, and
          // legacy docs without the field print nothing at all).
          // The reading checked against the order's parameters leads, so a
          // "held per parameters" entry prints with the BP it was based on.
          // A sliding-scale entry in this log (held, refused, or an amount
          // that differs from the scale) leads with its reading and, for a
          // deviation, what the scale called for and why it was not followed.
          reason: [
            a.glucoseReading ? `Blood glucose ${a.glucoseReading} ${GLUCOSE_UNIT}` : '',
            a.scaleDeviationReason
              ? `Scale called for ${a.scaleRange || 'a different amount'}; differs because: ${a.scaleDeviationReason}`
              : '',
            a.parametersReading ? `Checked: ${a.parametersReading}` : '',
            (a.status === 'held' || a.status === 'refused') && a.prescriberNotified === true
              ? `${a.reason || '-'} (prescriber notified)`
              : a.status === 'refused' && a.prescriberNotified === false
                ? `${a.reason || '-'} (prescriber not yet notified)`
                : a.reason || (a.glucoseReading || a.scaleDeviationReason ? '' : '-'),
          ]
            .filter(Boolean)
            .join(' · '),
          // A given PRN dose is complete only once its result is recorded; the
          // export says so explicitly rather than printing a silent blank.
          // A check's reading belongs in Result: it is what the entry recorded.
          result: a.value.trim()
            ? `${a.value}${a.valueUnit ? ` ${a.valueUnit}` : ''}`
            : a.outcome.trim()
              ? a.outcome
              : a.status === 'given' && a.scheduledTime === 'PRN'
                ? 'Result pending'
                : '-',
          initials: a.initials || '-',
          amendment,
        };
      });

    // Legend keyed by the documenting USER, not the initials string, so one
    // nurse prints as one row even where historical docs carry differently-
    // formed initials (they were once free-typed; derived-only now). Every
    // distinct token she used is listed so each grid mark stays resolvable.
    // Iterates the LIVE docs (adminsCurrent) so voided/superseded entries'
    // tokens don't join the legend, and stays an ARRAY: two clinicians can
    // legitimately derive the same initials, and a map keyed by the token
    // would silently drop one signer from a legal document.
    const byUid = new Map<string, { name: string; tokens: string[] }>();
    for (const a of adminsCurrent) {
      if (!a.documentedBy || !a.documentedByName || !a.initials) continue;
      const entry = byUid.get(a.documentedBy) || {
        name: `${a.documentedByName}${a.documentedByCredential ? `, ${a.documentedByCredential}` : ''}`,
        tokens: [],
      };
      if (!entry.tokens.includes(a.initials)) entry.tokens.push(a.initials);
      byUid.set(a.documentedBy, entry);
    }
    const legendEntries = Array.from(byUid.values()).map((e) => ({
      initials: e.tokens.join(' / '),
      name: e.name,
    }));

    const element = React.createElement(MarPDF, {
      orgName: settings.branding.orgName || 'Heart and Soul Healthcare',
      monthLabel: monthLabel(month),
      days,
      patient: {
        name: String(p.name || ''),
        dob: formatDateUS(String(p.dob || '')),
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
      // A month that is not over yet is printed and used as a paper MAR (a
      // future month for a day program, or the rest of the current month),
      // so its log needs ruled rows to write in. A finished month prints the
      // record as it stands.
      logWriteInRows: month >= agencyMonth() ? LOG_WRITE_IN_ROWS : 0,
      generatedAt: new Date().toLocaleString('en-US'),
      generatedBy: caller.profile.displayName || caller.email || '',
    });

    const buffer = await renderToBuffer(element as unknown as React.ReactElement<DocumentProps>);
    const safeName = String(p.name || 'client').replace(/[^a-zA-Z0-9-]+/g, '_');

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="MAR_${safeName}_${formatMonthUSFile(month)}.pdf"`,
      },
    });
  } catch (err) {
    console.error('MAR PDF export failed:', err);
    return NextResponse.json({ error: 'Failed to generate the MAR PDF.' }, { status: 500 });
  }
}
