'use client';

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { FormPageProps } from '../types';
import styles from '../page.module.css';
import DeselectableRadio, { radioState, radioSubscribe, radioGetSnapshot } from './DeselectableRadio';
import {
  getMarOrders,
  orderAppliesOn,
  subscribeStagedChanges,
  removeStagedChange,
  getAdministrationsForDay,
  type MarOrder,
  type MarDocumenter,
  type MarChangeRequest,
  type MarAdministration,
} from '@/lib/mar';
import { doseTimeStatus, resolveCurrentAdministrations, type DoseTimeStatus } from '@/lib/marShared';
import MedChart from './MedChart';
import {
  marAdminState,
  setMarAdmin,
  getAllMarAdmin,
  computeExtraMarks,
  marAdminKey,
  marAdminSubscribe,
  marAdminGetSnapshot,
  type MarAdminRecord,
} from './marAdminStore';
import MedChangeRequestModal from './MedChangeRequestModal';

const ADVERSE_VALUE = 'Adverse reaction / intolerance; document below';

const ADMIN_BY_OPTIONS = [
  { value: 'nurse', label: 'Nurse (me)' },
  { value: 'family', label: 'Family member' },
  { value: 'responsibleParty', label: 'Responsible party' },
  { value: 'self', label: 'Client (self)' },
  { value: 'proxy', label: 'Proxy' },
];

// Default initials from the nurse's name: first + last initial.
function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Current local time as {minutes since midnight, YYYY-MM-DD}, for the time-aware
// MAR pill. Isolated so the only Date reads happen at mount + the 60s tick,
// never in the render body.
function clockNow(): { nowMinutes: number; todayISO: string } {
  const d = new Date();
  const todayISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { nowMinutes: d.getHours() * 60 + d.getMinutes(), todayISO };
}

interface FormPageFiveProps extends FormPageProps {
  credential?: string;
  isEditMode?: boolean;
  /** Roster flag: this client requires a MAR, so the empty state escalates to a
   *  hard warning and submit is gated (see the requires-MAR gate in page.tsx). */
  clientRequiresMar?: boolean;
  documenter?: MarDocumenter;
  getNoteId?: () => string;
}

export default function FormPageFive({ formRef, register, watch, setValue, control, credential, isEditMode, clientRequiresMar, documenter, getNoteId }: FormPageFiveProps) {
  // Re-render whenever any DeselectableRadio changes so this page can react to
  // the Medication Tolerance choice. q43_medTolerance lives in the radio store
  // (not react-hook-form), so we read its current value from there. The
  // Adverse Reaction detail box only appears once a nurse explicitly reports
  // an adverse reaction; keeping it hidden the rest of the time stops nurses
  // assuming the (entirely optional) box is something they must fill in.
  useSyncExternalStore(radioSubscribe, radioGetSnapshot, radioGetSnapshot);
  const showAdverse = radioState['q43_medTolerance'] === ADVERSE_VALUE;

  // Once the box appears it stays collapsible; default expanded so the nurse
  // sees the fields right after choosing "adverse reaction."
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    adverseReaction: true,
  });
  const toggleSection = (key: string) =>
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // --- Medication Administration (MAR) ---
  // Re-render as the nurse marks each dose (marks live in the module store).
  useSyncExternalStore(marAdminSubscribe, marAdminGetSnapshot, marAdminGetSnapshot);
  const marPatientId = String(watch('patientId') || '').trim();
  const marDate = String(watch('q6_dateofService') || '');
  const marDefaultInitials = computeInitials(String(watch('q11_nurseName') || ''));
  const [marAllOrders, setMarAllOrders] = useState<MarOrder[]>([]);
  const [marLoading, setMarLoading] = useState(false);
  const [changeReqOpen, setChangeReqOpen] = useState(false);
  const [changeReqMsg, setChangeReqMsg] = useState<string | null>(null);
  const [stagedChanges, setStagedChanges] = useState<MarChangeRequest[]>([]);
  const [chartOpen, setChartOpen] = useState(false);
  // Doses already documented for this client+date by ANYONE (other nurses,
  // earlier notes); powers the "Already documented" chip so two nurses on
  // overlapping shifts can't unknowingly double-dose. Fails open to [].
  const [dayAdmins, setDayAdmins] = useState<MarAdministration[]>([]);
  const isLpnRn = credential === 'LPN' || credential === 'RN';
  const marPatientName = String(watch('q3_clientName') || '');

  // Live clock for time-aware dose pills (neutral -> amber "Due" -> red "Late").
  // Ticked once a minute so a pill flips while the screen is open. Time coloring
  // applies only when the date of service is today (never paints a backdated note).
  const [clock, setClock] = useState<{ nowMinutes: number; todayISO: string }>(() => clockNow());
  useEffect(() => {
    const id = setInterval(() => setClock(clockNow()), 60_000);
    return () => clearInterval(id);
  }, []);
  const isTodayService = !!marDate && clock.todayISO === marDate;

  useEffect(() => {
    if (!marPatientId || !marDate || isEditMode || !isLpnRn) return;
    let cancelled = false;
    (async () => {
      const admins = await getAdministrationsForDay(marPatientId, marDate);
      if (!cancelled) setDayAdmins(admins);
    })();
    return () => {
      cancelled = true;
    };
  }, [marPatientId, marDate, isEditMode, isLpnRn]);

  // Live list of medication changes staged on THIS note (apply on submit).
  // New notes only; edits don't stage changes.
  useEffect(() => {
    if (isEditMode || !isLpnRn || !getNoteId || !documenter?.uid) return;
    const noteId = getNoteId();
    if (!noteId) return;
    const unsub = subscribeStagedChanges(noteId, documenter.uid, setStagedChanges);
    return () => unsub();
  }, [isEditMode, isLpnRn, getNoteId, documenter?.uid]);

  const changeLabel = (c: MarChangeRequest): string => {
    const med = c.proposedMed?.medName || c.targetMedName || 'medication';
    if (c.type === 'add') return `Add ${med}${c.proposedMed?.dose ? ` ${c.proposedMed.dose} ${c.proposedMed.units}` : ''}`;
    if (c.type === 'change') return `Change ${med}${c.proposedMed?.dose ? ` → ${c.proposedMed.dose} ${c.proposedMed.units}` : ''}`;
    return `Discontinue ${med}`;
  };

  useEffect(() => {
    // Administrations are documented on NEW notes only (append-only records are
    // written once at submit). Skip the live regimen in edit mode or for
    // credentials that don't see this page. When the guard fails the render
    // branches on marPatientId/isEditMode before marRows, so leftover orders are
    // never shown; no need to clear state synchronously here. We fetch ALL
    // orders and filter by the date of service at render time, so changing the
    // date doesn't require a refetch.
    if (!marPatientId || isEditMode || !isLpnRn) return;
    let cancelled = false;
    (async () => {
      setMarLoading(true);
      const all = await getMarOrders(marPatientId);
      if (cancelled) return;
      setMarAllOrders(all);
      setMarLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [marPatientId, isEditMode, isLpnRn]);

  // Orders that apply on the date of service (active + date within start/stop).
  // The count of ALL active orders lets the empty state distinguish "no MAR at
  // all" from "has orders, but none scheduled for this date" (e.g. the service
  // date is before the order's start date).
  const marApplicableOrders = marAllOrders.filter((o) => orderAppliesOn(o, marDate));
  const marActiveOrders = marAllOrders.filter((o) => o.status === 'active');
  const marActiveCount = marActiveOrders.length;

  // One row per scheduled time (PRN orders get a single 'PRN' row).
  const marRows: { order: MarOrder; slot: string }[] = [];
  for (const o of marApplicableOrders) {
    if (o.isPRN) marRows.push({ order: o, slot: 'PRN' });
    else for (const t of o.scheduledTimes || []) marRows.push({ order: o, slot: t });
  }

  // Apply a patch to the store entry under `key`, seeding from `fallback` when
  // it doesn't exist yet. Used both for order-derived rows (updateMark) and for
  // resumed "extra"/unlisted marks that have no current order row.
  const patchMarkByKey = (key: string, fallback: MarAdminRecord, patch: Partial<MarAdminRecord>) => {
    const existing = marAdminState[key] || fallback;
    setMarAdmin(key, { ...existing, ...patch });
  };

  const updateMark = (order: MarOrder, slot: string, patch: Partial<MarAdminRecord>) => {
    const key = marAdminKey(marPatientId, order.id || '', slot);
    patchMarkByKey(
      key,
      {
        patientId: marPatientId,
        orderId: order.id || '',
        medName: order.medName,
        dose: order.dose,
        units: order.units || '',
        route: order.route,
        scheduledTime: slot,
        isPRN: slot === 'PRN',
        indication: order.indication || '',
        status: '',
        administeredByType: 'nurse',
        administratorName: '',
        actualTime: slot === 'PRN' ? '' : slot,
        initials: marDefaultInitials,
        reason: '',
        // Stamp the note session that created this mark (event-time, so the
        // lazy id mint doesn't run during render). The submit harvest writes
        // only marks matching the current session — defense vs the cross-note leak.
        sessionId: getNoteId ? getNoteId() : '',
      },
      patch,
    );
  };

  // Keys already shown by an order-derived row this render. Any OTHER store
  // entry with a status — e.g. an "unlisted"/unscheduled one-off dose added via
  // the change-request modal, restored on resume — is rendered as an editable
  // "extra" card below. Without this the form silently hid doses it would still
  // write at submit (the Oxycodone "no trace" bug).
  const coveredKeys = new Set(
    marRows.map(({ order, slot }) => marAdminKey(marPatientId, order.id || '', slot)),
  );
  const extraMarks = computeExtraMarks(getAllMarAdmin(), coveredKeys, marPatientId);

  // A dose already on record for this client+date, submitted on an EARLIER note
  // (dayAdmins is submitted-only; the current draft isn't submitted yet, so
  // these are always prior/other entries). Matches by order+slot for scheduled
  // meds, and by med name for unlisted one-offs that carry no orderId.
  // Resolve amend chains so "prior" reflects the CURRENT value of each dose
  // (a correction supersedes the original) and a superseded record isn't counted.
  const dayAdminsCurrent = resolveCurrentAdministrations(dayAdmins);

  const priorFor = (orderId: string, slot: string, medName: string): MarAdministration | undefined =>
    dayAdminsCurrent.find((a) =>
      orderId
        ? a.orderId === orderId && a.scheduledTime === slot
        : (a.medNameSnapshot || '').toLowerCase() === medName.toLowerCase(),
    );

  // How many PRN doses of this order were already GIVEN today on earlier notes
  // (dayAdmins is submitted-only). Drives the "Nth PRN dose today" repeat count
  // so a nurse can see at a glance how often an as-needed med has been used.
  const prnGivenToday = (orderId: string): number =>
    orderId
      ? dayAdminsCurrent.filter((a) => a.orderId === orderId && a.scheduledTime === 'PRN' && a.status === 'given').length
      : 0;

  // Enforce the hard stop at the DATA layer, not just visually. If a scheduled
  // slot is already documented on an earlier note today, drop any draft mark for
  // it so it can never be submitted as a duplicate — covering the race where a
  // dose was marked before dayAdmins loaded and the case of a resumed draft.
  // PRN and unlisted one-offs (no orderId) repeat legitimately and are left alone.
  useEffect(() => {
    for (const rec of getAllMarAdmin()) {
      if (rec.patientId !== marPatientId) continue;
      if (!rec.orderId || rec.scheduledTime === 'PRN' || !rec.status) continue;
      const hasPrior = dayAdminsCurrent.some(
        (a) => a.orderId === rec.orderId && a.scheduledTime === rec.scheduledTime,
      );
      if (hasPrior) setMarAdmin(rec.key, { ...rec, status: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayAdmins, marPatientId]);

  // Shared renderer for one MAR dose card, used for both scheduled-order rows
  // and resumed "extra"/unlisted doses. `onPatch` writes to the right store key.
  const renderDoseCard = (opts: {
    cardKey: string;
    rec: MarAdminRecord | undefined;
    medName: string;
    doseLabel: string;
    badgeLabel: string;
    scheduledSlot?: string; // raw 'HH:MM' / 'PRN' / 'unscheduled', for time-status
    prior?: MarAdministration;
    onPatch: (patch: Partial<MarAdminRecord>) => void;
    extra?: boolean;
    isPRN?: boolean;
    indication?: string;
    prnGivenToday?: number;
  }) => {
    const status = opts.rec?.status || '';
    const isNurseAdmin = !opts.rec || !opts.rec.administeredByType || opts.rec.administeredByType === 'nurse';
    const indication = (opts.indication || '').trim();
    // The time pill's color reflects the dose's combined state. A documented
    // status (this draft, or a prior submitted entry) wins; an undocumented
    // SCHEDULED dose is colored by how its time compares to now (today only).
    const documented = status || opts.prior?.status || '';
    const timeStatus: DoseTimeStatus =
      !opts.isPRN && !documented
        ? doseTimeStatus(opts.scheduledSlot || '', clock.nowMinutes, { isToday: isTodayService })
        : 'none';
    const pill = marPill(documented, timeStatus, !!opts.isPRN, opts.badgeLabel);
    // Hard stop: a SCHEDULED slot already documented on an earlier note can't be
    // re-documented here (no giving the same dose twice). Corrections go through
    // the chart's amend flow. PRN ("as needed") repeats are expected, never locked.
    const lockedByPrior = !!opts.prior && !opts.isPRN && !opts.extra;
    return (
      <div key={opts.cardKey} style={marCardStyle}>
        <div style={marCardHeadStyle}>
          <div>
            <span style={{ fontWeight: 700, color: '#1f2937' }}>{opts.medName}</span>
            <span style={{ color: '#6b7280', marginLeft: 8, fontSize: 13 }}>{opts.doseLabel}</span>
          </div>
          <span style={pill.style} title={pill.title}>{pill.label}</span>
        </div>

        {opts.isPRN && indication && (
          <div style={marIndicationStyle}>Ordered for: {indication}</div>
        )}

        {opts.extra && (
          <div style={marExtraNoteStyle}>One-off dose documented this shift (not a scheduled order).</div>
        )}

        {opts.prior && (
          <div style={marAlreadyChipStyle}>
            Already documented today on another entry: {opts.prior.status === 'given' ? 'given' : opts.prior.status}
            {opts.prior.status === 'given' && opts.prior.actualTime ? ` at ${opts.prior.actualTime}` : ''}
            {opts.prior.initials ? ` (${opts.prior.initials})` : ''}
            {opts.prior.documentedByName ? ` · ${opts.prior.documentedByName}` : ''}
          </div>
        )}

        {lockedByPrior ? (
          <div style={marLockedRowStyle}>
            Already documented today. To correct it, open the medication chart and amend the entry — a scheduled
            dose can&apos;t be recorded twice.
          </div>
        ) : (
          <div style={marStatusRowStyle}>
            {(['given', 'held', 'refused'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => opts.onPatch({ status: status === s ? '' : s })}
                style={status === s ? marStatusBtnActive[s] : marStatusBtnStyle}
              >
                {s === 'given' ? 'Given' : s === 'held' ? 'Held' : 'Refused'}
              </button>
            ))}
            {opts.extra && status && (
              <button type="button" onClick={() => opts.onPatch({ status: '' })} style={stagedRemoveBtnStyle} title="Remove this dose">
                Remove
              </button>
            )}
          </div>
        )}

        {status === 'given' && (
          <div style={marDetailGridStyle}>
            <label style={marFieldStyle}>
              <span style={marFieldLabelStyle}>Time given</span>
              <input type="time" value={opts.rec?.actualTime || ''} onChange={(e) => opts.onPatch({ actualTime: e.target.value })} style={marInputStyle} />
            </label>
            <label style={marFieldStyle}>
              <span style={marFieldLabelStyle}>Initials</span>
              <input type="text" value={opts.rec?.initials || ''} onChange={(e) => opts.onPatch({ initials: e.target.value })} style={marInputStyle} maxLength={5} />
            </label>
            <label style={marFieldStyle}>
              <span style={marFieldLabelStyle}>Administered by</span>
              <select value={opts.rec?.administeredByType || 'nurse'} onChange={(e) => opts.onPatch({ administeredByType: e.target.value })} style={marSelectStyle}>
                {ADMIN_BY_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
            </label>
            {!isNurseAdmin && (
              <label style={marFieldStyle}>
                <span style={marFieldLabelStyle}>Administrator name</span>
                <input type="text" value={opts.rec?.administratorName || ''} onChange={(e) => opts.onPatch({ administratorName: e.target.value })} style={marInputStyle} placeholder="e.g., Jane Doe (daughter)" />
              </label>
            )}
          </div>
        )}

        {/* A PRN ("as needed") dose must record WHY it was given this time, shown
            against the order's standing indication. Scheduled doses don't ask. */}
        {status === 'given' && opts.isPRN && (
          <>
            <div style={marPrnCountStyle}>
              PRN dose #{(opts.prnGivenToday || 0) + 1} today
              {indication ? ` · for ${indication}` : ''}
            </div>
            <label style={{ ...marFieldStyle, marginTop: 8 }}>
              <span style={marFieldLabelStyle}>Reason this dose was given *</span>
              <input
                type="text"
                required
                aria-label={`Reason ${opts.medName} PRN dose was given`}
                value={opts.rec?.reason || ''}
                onChange={(e) => opts.onPatch({ reason: e.target.value })}
                style={!(opts.rec?.reason || '').trim() ? marInputRequiredStyle : marInputStyle}
                placeholder={indication ? `e.g., ${indication}; rated 6/10` : 'e.g., complained of pain, rated 6/10'}
              />
              {!(opts.rec?.reason || '').trim() && (
                <span style={marRequiredHintStyle}>Required for a PRN dose: note the symptom or reason it was given.</span>
              )}
            </label>
            {/* The effectiveness follow-up: a PRN dose isn't fully documented
                until the RESULT is recorded (why given -> given -> what
                happened). Checked 30-60 min after the dose, so it's required by
                the time the note is submitted, not the moment the dose is
                marked. */}
            <label style={{ ...marFieldStyle, marginTop: 8 }}>
              <span style={marFieldLabelStyle}>Outcome / result *</span>
              <input
                type="text"
                required
                aria-label={`Outcome of ${opts.medName} PRN dose`}
                value={opts.rec?.outcome || ''}
                onChange={(e) => opts.onPatch({ outcome: e.target.value })}
                style={!(opts.rec?.outcome || '').trim() ? marInputRequiredStyle : marInputStyle}
                placeholder="e.g., pain decreased from 6/10 to 2/10 within 45 min"
              />
              {!(opts.rec?.outcome || '').trim() && (
                <span style={marRequiredHintStyle}>
                  Required for a PRN dose: record the result (recheck 30-60 min after the dose).
                </span>
              )}
            </label>
          </>
        )}

        {(status === 'held' || status === 'refused') && (
          <label style={{ ...marFieldStyle, marginTop: 10 }}>
            <span style={marFieldLabelStyle}>Reason *</span>
            <input
              type="text"
              required
              aria-label={`Reason ${opts.medName} dose was ${status}`}
              value={opts.rec?.reason || ''}
              onChange={(e) => opts.onPatch({ reason: e.target.value })}
              style={!(opts.rec?.reason || '').trim() ? marInputRequiredStyle : marInputStyle}
              placeholder={status === 'refused' ? 'Reason for refusal' : 'Reason held / omitted'}
            />
            {!(opts.rec?.reason || '').trim() && (
              <span style={marRequiredHintStyle}>
                Required: a {status} dose must document why (e.g., hold parameter met, client refused).
              </span>
            )}
          </label>
        )}

        {(status === 'held' || status === 'refused') && (
          // D.4.d proof trail: the manual requires timely prescriber
          // notification for doses not received; this attestation is the
          // evidence. Optional here (the nurse may reach the doctor later; an
          // amendment can record it afterwards, and the dashboard readiness
          // tile tracks refusals still missing it).
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={opts.rec?.prescriberNotified === true}
              onChange={(e) => opts.onPatch({ prescriberNotified: e.target.checked })}
              style={{ marginTop: 2 }}
            />
            <span style={{ fontSize: 12, color: '#5c6b7a', lineHeight: 1.4 }}>
              I notified the prescriber{status === 'refused' ? ' of this refusal' : ' that this dose was not given'}.
            </span>
          </label>
        )}
      </div>
    );
  };

  // Render one scheduled-order or PRN row as a full dose card.
  const renderScheduledRow = ({ order, slot }: { order: MarOrder; slot: string }) => {
    const key = marAdminKey(marPatientId, order.id || '', slot);
    return renderDoseCard({
      cardKey: key,
      rec: marAdminState[key],
      medName: order.medName,
      doseLabel: `${order.dose}${order.units ? ` ${order.units}` : ''} · ${order.route}`,
      badgeLabel: slot === 'PRN' ? 'PRN' : slot,
      scheduledSlot: slot,
      prior: priorFor(order.id || '', slot, order.medName),
      onPatch: (patch) => updateMark(order, slot, patch),
      isPRN: slot === 'PRN',
      indication: order.indication,
      prnGivenToday: slot === 'PRN' ? prnGivenToday(order.id || '') : 0,
    });
  };

  // Collapse completed scheduled doses so the nurse focuses on what's still due
  // ("once a dose is given, only the next is front-and-center"). A scheduled slot
  // is "done" once it's COMPLETELY documented on this draft or already recorded
  // on an earlier note today; PRN rows are always open (as-needed, can repeat).
  // A held/refused mark without its required reason is NOT done — collapsing it
  // would unmount the required input before the nurse could type, hiding it from
  // the submit validation scan (and from her).
  const isDoneScheduled = ({ order, slot }: { order: MarOrder; slot: string }): boolean => {
    if (slot === 'PRN') return false;
    const rec = marAdminState[marAdminKey(marPatientId, order.id || '', slot)];
    if (rec?.status) {
      if ((rec.status === 'held' || rec.status === 'refused') && !(rec.reason || '').trim()) return false;
      return true;
    }
    return !!priorFor(order.id || '', slot, order.medName);
  };
  const openRows = marRows.filter((r) => !isDoneScheduled(r));
  const doneRows = marRows.filter((r) => isDoneScheduled(r));

  if (!credential || (credential !== 'LPN' && credential !== 'RN')) {
    return (
      <div>
        <div className={styles.section}>
          <span className={styles.sectionLabel}>SKILLED NURSING &amp; MEDICAL MANAGEMENT</span>
          <p style={{ padding: '20px', color: '#666', textAlign: 'center' }}>
            This page is only available for LPN and RN credentials. Please select a credential on Page 1.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Skilled Nursing Interventions */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>SKILLED NURSING INTERVENTIONS</span>

        <div className={styles.subsec}>Interventions Performed</div>
        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q38_interventions" value="Wound care" />
            Wound care
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Catheter care" />
            Catheter care
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="IV line management" />
            IV line management
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Medication administration" />
            Medication administration
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q38_interventions" value="Injection administration" />
            Injection administration
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Foley catheter insertion" />
            Foley catheter insertion
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Ostomy care" />
            Ostomy care
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Tracheostomy care" />
            Tracheostomy care
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q38_interventions" value="Oxygen therapy" />
            Oxygen therapy
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Nebulizer treatment" />
            Nebulizer treatment
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Suctioning" />
            Suctioning
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Blood glucose monitoring" />
            Blood glucose monitoring
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q38_interventions" value="G-tube / J-tube feeding" />
            G-tube / J-tube feeding
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Feeding tube site care" />
            Feeding tube site care
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="NG tube feeding" />
            NG tube feeding
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Aspiration precautions" />
            Aspiration precautions
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q38_interventions" value="Ventilator management" />
            Ventilator management
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Chest physiotherapy (CPT / Vest)" />
            Chest physiotherapy (CPT / Vest)
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Cough assist" />
            Cough assist
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Pulse oximetry / apnea monitoring" />
            Pulse oximetry / apnea monitoring
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q38_interventions" value="Seizure precautions / monitoring" />
            Seizure precautions / monitoring
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Straight catheterization" />
            Straight catheterization
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Perineal care" />
            Perineal care
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Bowel program" />
            Bowel program
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q38_interventions" value="Assessment and evaluation" />
            Assessment and evaluation
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Patient education" />
            Patient education
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Fall prevention" />
            Fall prevention
          </label>
          <label>
            <input type="checkbox" name="q38_interventions" value="Other" />
            Other
          </label>
        </div>
      </div>

      {/* Detailed Description of Interventions */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>DETAILED DESCRIPTION OF INTERVENTIONS</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q39_interventionDetails">
              Describe interventions performed, patient response, and any complications or changes in condition: *
            </label>
            <textarea
              className={styles.textarea}
              id="q39_interventionDetails"
              {...register('q39_interventionDetails')}
              rows={6}
              placeholder="Provide detailed notes on each intervention, how the patient responded, and any outcomes..."
              required
            />
          </div>
        </div>
      </div>


      {/* Medication Administration (MAR); structured per-dose documentation
          against the client's standing orders. Saved as append-only records at
          submit; appears only when the roster client has active MAR orders. */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>MEDICATION ADMINISTRATION (MAR)</span>

        {isEditMode ? (
          <p style={marHintStyle}>
            Medication administration is recorded when a note is first submitted and can&apos;t be changed by editing.
            To correct an entry, document a new administration.
          </p>
        ) : !marPatientId ? (
          <p style={marHintStyle}>Select a client from the roster on Page 1 to load their medication schedule.</p>
        ) : marLoading ? (
          <p style={marHintStyle}>Loading medications…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {marRows.length === 0 && extraMarks.length === 0 ? (
              marActiveCount > 0 ? (
                <p style={marHintStyle}>
                  This client has {marActiveCount} active medication order{marActiveCount === 1 ? '' : 's'}, but none
                  apply to the date of service{marDate ? ` (${marDate})` : ''}. Check the date of service on Page 1 and the
                  order&apos;s start / end dates under Records; a shift dated before an order&apos;s start date won&apos;t show it.
                </p>
              ) : clientRequiresMar ? (
                /* Flagged requiresMar with nothing on file: this is the exact
                   state the submit gate blocks, so say so loudly and put the
                   fix (the add-med modal) one tap away. */
                <div style={marRequiredWarnStyle}>
                  <strong style={{ display: 'block', marginBottom: 6 }}>
                    ⚠ This client requires a MAR, but no medications are on file.
                  </strong>
                  <span style={{ display: 'block', marginBottom: 10 }}>
                    Enter their medications from the physician&apos;s orders now — the note can&apos;t be
                    submitted until they&apos;re added. Please don&apos;t list them only in the text boxes
                    below; the MAR is the official record.
                  </span>
                  <button
                    type="button"
                    onClick={() => { setChangeReqMsg(null); setChangeReqOpen(true); }}
                    style={marRequiredWarnBtnStyle}
                  >
                    Add this client&apos;s medications
                  </button>
                </div>
              ) : (
                <p style={marHintStyle}>
                  No medications are on this client&apos;s MAR yet. If this client should have a MAR, build their orders
                  under Records.
                </p>
              )
            ) : (
              <>
                <p style={marHintStyle}>
                  Mark each due dose. Completed scheduled doses collapse below. Entries are saved when you submit;
                  to correct one afterward, amend it in the medication chart.
                  {clientRequiresMar && (
                    <>
                      {' '}
                      <strong>This client requires a MAR: every scheduled dose due during your shift must be
                      marked given, held, or refused before the note can be submitted.</strong>
                    </>
                  )}
                </p>
                {openRows.map(renderScheduledRow)}
                {doneRows.length > 0 && (
                  <div style={marDoneSectionStyle}>
                    <button type="button" onClick={() => toggleSection('marCompleted')} style={marDoneToggleStyle}>
                      <span style={{ fontSize: 11 }}>{expandedSections.marCompleted ? '▼' : '▶'}</span>
                      {doneRows.length} scheduled dose{doneRows.length === 1 ? '' : 's'} documented today
                    </button>
                    {expandedSections.marCompleted && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                        {doneRows.map(renderScheduledRow)}
                      </div>
                    )}
                  </div>
                )}
                {extraMarks.length > 0 && (
                  <>
                    <div style={marExtraHeaderStyle}>
                      Other doses documented this shift
                    </div>
                    {extraMarks.map((rec) => {
                      // A genuine unlisted one-off (added via the change-request
                      // modal) carries no orderId; show it as an "Unscheduled"
                      // one-off that can be removed. A record WITH an orderId is a
                      // real scheduled dose whose order just isn't on the current
                      // date's list (e.g. the date of service was changed) — show
                      // it under its real time, never as a removable "one-off",
                      // so a legitimate administration can't be mislabeled or
                      // accidentally dropped.
                      const isUnlisted = !rec.orderId;
                      const sched = rec.scheduledTime;
                      const badgeLabel = isUnlisted || !sched || sched === 'unscheduled'
                        ? 'Unscheduled'
                        : sched === 'PRN' ? 'PRN' : sched;
                      return renderDoseCard({
                        cardKey: rec.key,
                        rec,
                        medName: rec.medName,
                        doseLabel: `${rec.dose}${rec.units ? ` ${rec.units}` : ''} · ${rec.route}`,
                        badgeLabel,
                        scheduledSlot: sched,
                        prior: priorFor(rec.orderId || '', rec.scheduledTime, rec.medName),
                        onPatch: (patch) => patchMarkByKey(rec.key, rec, patch),
                        extra: isUnlisted,
                        isPRN: rec.isPRN || sched === 'PRN',
                        indication: rec.indication,
                        prnGivenToday: rec.orderId ? prnGivenToday(rec.orderId) : 0,
                      });
                    })}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {stagedChanges.length > 0 && (
          <div style={stagedBoxStyle}>
            <div style={stagedHeaderStyle}>Medication changes on this note (apply when you submit)</div>
            {stagedChanges.map((c) => (
              <div key={c.id} style={stagedRowStyle}>
                <span style={c.type === 'discontinue' ? stagedTagDcStyle : stagedTagAddStyle}>
                  {c.type === 'add' ? 'Add' : c.type === 'change' ? 'Change' : 'Discontinue'}
                </span>
                <span style={{ flex: 1, minWidth: 0, color: '#2c3e50' }}>{changeLabel(c)}</span>
                <button
                  type="button"
                  onClick={() => c.id && removeStagedChange(c.id)}
                  style={stagedRemoveBtnStyle}
                  aria-label="Remove staged change"
                  title="Remove"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {changeReqMsg && (
          <div style={marFiledBannerStyle}>{changeReqMsg}</div>
        )}

        {marPatientId && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {!isEditMode && (
              <button
                type="button"
                onClick={() => { setChangeReqMsg(null); setChangeReqOpen(true); }}
                style={requestChangeBtnStyle}
              >
                Add, change, or discontinue a medication
              </button>
            )}
            {isLpnRn && (
              <button type="button" onClick={() => setChartOpen(true)} style={viewChartBtnStyle}>
                View medication chart
              </button>
            )}
          </div>
        )}
      </div>

      {chartOpen && (
        <MedChart
          patientId={marPatientId}
          patientName={marPatientName}
          initialDate={marDate}
          onClose={() => setChartOpen(false)}
          documenter={documenter}
        />
      )}

      {changeReqOpen && (
        <MedChangeRequestModal
          patientId={marPatientId}
          patientName={marPatientName}
          date={marDate}
          activeOrders={marActiveOrders}
          documenter={documenter}
          getNoteId={getNoteId || (() => '')}
          defaultInitials={marDefaultInitials}
          onClose={() => setChangeReqOpen(false)}
          onStaged={(msg) => setChangeReqMsg(msg)}
        />
      )}

      {/* Medications */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>MEDICATIONS</span>

        {marActiveCount > 0 && !isEditMode && (
          <p style={marHintStyle}>
            The Medication Administration (MAR) section above is the official record of each dose.
            Use these boxes only for extra narrative context — text written here does not count as
            MAR documentation.
          </p>
        )}

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q43_scheduledMeds">Scheduled Medications Administered</label>
            <textarea
              className={styles.textarea}
              id="q43_scheduledMeds"
              {...register('q43_scheduledMeds')}
              rows={4}
              placeholder="List medications, doses, routes, and times administered..."
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q43_prnMeds">PRN Medications Administered</label>
            <textarea
              className={styles.textarea}
              id="q43_prnMeds"
              {...register('q43_prnMeds')}
              rows={4}
              placeholder="List PRN medications, doses, routes, times, and reason..."
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label}>Medication Tolerance</label>
            <div className={styles.radioRow}>
              <label>
                <DeselectableRadio name="q43_medTolerance" value="Tolerated without difficulty" />
                Tolerated without difficulty
              </label>
              <label>
                <DeselectableRadio name="q43_medTolerance" value={ADVERSE_VALUE} />
                Adverse reaction / intolerance; document below
              </label>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#6b7280' }}>
              Optional. Only choose &ldquo;Adverse reaction&rdquo; if the patient actually had a
              reaction; it opens a detail box to document it. Otherwise leave this blank or
              choose &ldquo;Tolerated without difficulty.&rdquo;
            </p>
          </div>
        </div>
      </div>

      {/* Adverse Reaction Detail Box; only shown once the nurse reports an
          adverse reaction via the Medication Tolerance radio above. */}
      {showAdverse && (
      <div id="adverse-reaction-detail" style={{
        background: '#fff3f0',
        borderLeft: '3px solid #c62828',
        borderRadius: '4px',
        padding: '16px',
        marginBottom: '16px',
      }}>
        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('adverseReaction')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.adverseReaction ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0, color: '#c62828' }}>{'\u26A0'} Adverse Reaction / Intolerance Detail</div>
        </div>
        <div style={{ display: expandedSections.adverseReaction ? 'block' : 'none' }}>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q43_reactionMed">Medication Involved *</label>
                <input
                  className={styles.input}
                  type="text"
                  id="q43_reactionMed"
                  {...register('q43_reactionMed')}
                />
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q43_reactionTime">Time of Reaction</label>
                <input
                  className={styles.input}
                  type="time"
                  id="q43_reactionTime"
                  {...register('q43_reactionTime')}
                />
              </div>
            </div>

            <div className={styles.subsec}>Reaction Type <span style={{ color: '#c62828' }}>*</span></div>
            <div className={styles.checkRow}>
              <label>
                <input type="checkbox" name="q43_reactionType" value="Nausea/Vomiting" />
                Nausea/Vomiting
              </label>
              <label>
                <input type="checkbox" name="q43_reactionType" value="Rash/Hives" />
                Rash/Hives
              </label>
              <label>
                <input type="checkbox" name="q43_reactionType" value="Difficulty Breathing" />
                Difficulty Breathing
              </label>
              <label>
                <input type="checkbox" name="q43_reactionType" value="Swelling" />
                Swelling
              </label>
              <label>
                <input type="checkbox" name="q43_reactionType" value="Dizziness/Syncope" />
                Dizziness/Syncope
              </label>
              <label>
                <input type="checkbox" name="q43_reactionType" value="Refusal to take" />
                Refusal to take
              </label>
              <label>
                <input type="checkbox" name="q43_reactionType" value="Spitting out/Gagging" />
                Spitting out/Gagging
              </label>
              <label>
                <input type="checkbox" name="q43_reactionType" value="Other" />
                Other
              </label>
            </div>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q43_reactionDescription">Description of Reaction *</label>
                <textarea
                  className={styles.textarea}
                  id="q43_reactionDescription"
                  {...register('q43_reactionDescription')}
                  rows={3}
                  placeholder="Describe the adverse reaction in detail..."
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Physician Notified? *</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q43_reactionPhysNotified" value="Yes" />
                    Yes
                  </label>
                  <label>
                    <DeselectableRadio name="q43_reactionPhysNotified" value="No" />
                    No
                  </label>
                </div>
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q43_reactionPhysTime">Time Notified</label>
                <input
                  className={styles.input}
                  type="time"
                  id="q43_reactionPhysTime"
                  {...register('q43_reactionPhysTime')}
                />
              </div>
          </div>
        </div>
      </div>
      )}

    </div>
  );
}

const marHintStyle: CSSProperties = { fontSize: 13, color: '#6b7280', margin: '4px 0', lineHeight: 1.5 };
// Requires-MAR empty-state warning: same amber family as the tube-care prompts.
const marRequiredWarnStyle: CSSProperties = { background: '#fff7ed', border: '1.5px solid #f59e0b', borderRadius: 10, padding: '14px 16px', fontSize: 13.5, color: '#7c2d12', lineHeight: 1.5 };
const marRequiredWarnBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#b45309', color: 'white', border: 'none', padding: '9px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const marCardStyle: CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fafbfc' };
const marCardHeadStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' };
const marSlotBadgeStyle: CSSProperties = { background: '#eef4fb', color: '#1a3a5c', fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999, border: '1px solid #c8def5' };
const marPrnBadgeStyle: CSSProperties = { background: '#fef3e2', color: '#b56a17', fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999 };
const marStatusRowStyle: CSSProperties = { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' };
const marStatusBtnStyle: CSSProperties = { padding: '6px 14px', borderRadius: 6, border: '1px solid #d0d7de', background: 'white', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const marStatusBtnActive: Record<'given' | 'held' | 'refused', CSSProperties> = {
  given: { ...marStatusBtnStyle, background: '#0e7c4a', color: 'white', border: '1px solid #0e7c4a' },
  held: { ...marStatusBtnStyle, background: '#b56a17', color: 'white', border: '1px solid #b56a17' },
  refused: { ...marStatusBtnStyle, background: '#c0392b', color: 'white', border: '1px solid #c0392b' },
};
// Fixed 2-column grid (Time given | Initials, then Administered by |
// Administrator name). The 4th cell is reserved, so revealing the
// Administrator name field fills it in place rather than reflowing or growing
// the card; nothing shifts when "Administered by" changes.
const marDetailGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 12 };
const marFieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 };
const marFieldLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#5c6b7a' };
const marInputStyle: CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', height: 38 };
const marInputRequiredStyle: CSSProperties = { ...marInputStyle, border: '1px solid #d9a441', background: '#fffdf6' };
const marRequiredHintStyle: CSSProperties = { fontSize: 11.5, color: '#8a5a0d', lineHeight: 1.4, marginTop: 3 };
const marIndicationStyle: CSSProperties = { marginTop: 6, fontSize: 12.5, color: '#5c6b7a' };
const marPrnCountStyle: CSSProperties = { marginTop: 12, fontSize: 12.5, fontWeight: 700, color: '#b56a17' };
// Same box as the inputs (appearance reset + custom chevron) so the select is
// exactly the same height; no native OS chrome making it taller.
const marSelectStyle: CSSProperties = {
  ...marInputStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  paddingRight: 34,
  cursor: 'pointer',
  background:
    "white url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\") no-repeat right 11px center",
  backgroundSize: '13px',
};
const requestChangeBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, background: 'white', color: '#1a3a5c', border: '1px solid #c8def5', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const viewChartBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, background: '#1a3a5c', color: 'white', border: '1px solid #1a3a5c', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const marAlreadyChipStyle: CSSProperties = { marginTop: 8, background: '#fff7e6', border: '1px solid #f5d9a8', color: '#8a5a0d', borderRadius: 6, padding: '7px 10px', fontSize: 12.5, lineHeight: 1.45 };
const marExtraNoteStyle: CSSProperties = { marginTop: 6, color: '#6b7280', fontSize: 12, fontStyle: 'italic' };
const marExtraHeaderStyle: CSSProperties = { marginTop: 6, fontSize: 12, fontWeight: 700, color: '#5c6b7a', textTransform: 'uppercase', letterSpacing: 0.4 };
const marFiledBannerStyle: CSSProperties = { marginTop: 12, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: 6, padding: '10px 12px', fontSize: 13, lineHeight: 1.5 };
const stagedBoxStyle: CSSProperties = { marginTop: 12, border: '1px solid #c8def5', background: '#f5f9fe', borderRadius: 8, padding: 10 };
const stagedHeaderStyle: CSSProperties = { fontSize: 12, fontWeight: 700, color: '#1a3a5c', marginBottom: 8 };
const stagedRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #e3eefb', fontSize: 13 };
const stagedTagAddStyle: CSSProperties = { background: '#e8f4e8', color: '#2a7a2a', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0 };
const stagedTagDcStyle: CSSProperties = { background: '#fdeaea', color: '#c0392b', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0 };
const stagedRemoveBtnStyle: CSSProperties = { background: 'transparent', border: 'none', color: '#c0392b', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 };
const marLockedRowStyle: CSSProperties = { marginTop: 10, background: '#f3f4f6', border: '1px solid #d0d7de', color: '#4b5563', borderRadius: 6, padding: '8px 11px', fontSize: 12.5, lineHeight: 1.45 };
const marDoneSectionStyle: CSSProperties = { marginTop: 2 };
const marDoneToggleStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left' };

// Time-aware dose pill. A documented status (given/held/refused) shows as a
// solid color with its label; an undocumented scheduled dose shows the neutral
// time chip, or an amber "Due" / red "Late" OUTLINE when today's clock passes
// its time — so the attention states read differently from a solid "Refused".
const pillBase: CSSProperties = { fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' };
const pillGiven: CSSProperties = { ...pillBase, background: '#0e7c4a', color: 'white', border: '1px solid #0e7c4a' };
const pillHeld: CSSProperties = { ...pillBase, background: '#b56a17', color: 'white', border: '1px solid #b56a17' };
const pillRefused: CSSProperties = { ...pillBase, background: '#c0392b', color: 'white', border: '1px solid #c0392b' };
const pillDue: CSSProperties = { ...pillBase, background: '#fff7e6', color: '#8a5a0d', border: '1px solid #e0a93b' };
const pillLate: CSSProperties = { ...pillBase, background: '#fdeaea', color: '#b3261e', border: '1px solid #e07a72' };

function marPill(
  documented: string,
  timeStatus: DoseTimeStatus,
  isPRN: boolean,
  label: string,
): { style: CSSProperties; label: string; title: string } {
  if (documented === 'given') return { style: pillGiven, label: `${label} ✓`, title: 'Given' };
  if (documented === 'held') return { style: pillHeld, label: `${label} · Held`, title: 'Held' };
  if (documented === 'refused') return { style: pillRefused, label: `${label} · Refused`, title: 'Refused' };
  if (isPRN) return { style: marPrnBadgeStyle, label, title: 'PRN (as needed)' };
  if (timeStatus === 'late') return { style: pillLate, label: `${label} · Late`, title: 'Late — past due, not yet documented' };
  if (timeStatus === 'due') return { style: pillDue, label: `${label} · Due`, title: 'Due now' };
  return { style: marSlotBadgeStyle, label, title: '' };
}
