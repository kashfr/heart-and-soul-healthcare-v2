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
import MedChart from './MedChart';
import {
  marAdminState,
  setMarAdmin,
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

interface FormPageFiveProps extends FormPageProps {
  credential?: string;
  isEditMode?: boolean;
  documenter?: MarDocumenter;
  getNoteId?: () => string;
}

export default function FormPageFive({ formRef, register, watch, setValue, control, credential, isEditMode, documenter, getNoteId }: FormPageFiveProps) {
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

  const updateMark = (order: MarOrder, slot: string, patch: Partial<MarAdminRecord>) => {
    const key = marAdminKey(marPatientId, order.id || '', slot);
    const existing: MarAdminRecord =
      marAdminState[key] || {
        patientId: marPatientId,
        orderId: order.id || '',
        medName: order.medName,
        dose: order.dose,
        units: order.units || '',
        route: order.route,
        scheduledTime: slot,
        isPRN: slot === 'PRN',
        status: '',
        administeredByType: 'nurse',
        administratorName: '',
        actualTime: slot === 'PRN' ? '' : slot,
        initials: marDefaultInitials,
        reason: '',
      };
    setMarAdmin(key, { ...existing, ...patch });
  };

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
        ) : marRows.length === 0 ? (
          marActiveCount > 0 ? (
            <p style={marHintStyle}>
              This client has {marActiveCount} active medication order{marActiveCount === 1 ? '' : 's'}, but none
              apply to the date of service{marDate ? ` (${marDate})` : ''}. Check the date of service on Page 1 and the
              order&apos;s start / end dates under Records; a shift dated before an order&apos;s start date won&apos;t show it.
            </p>
          ) : (
            <p style={marHintStyle}>
              No medications are on this client&apos;s MAR yet. If this client should have a MAR, build their orders
              under Records.
            </p>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={marHintStyle}>
              Mark each due dose. Entries are saved when you submit the note and cannot be edited afterward.
            </p>
            {marRows.map(({ order, slot }) => {
              const key = marAdminKey(marPatientId, order.id || '', slot);
              const rec = marAdminState[key];
              const status = rec?.status || '';
              const isNurseAdmin = !rec || !rec.administeredByType || rec.administeredByType === 'nurse';
              // A dose already documented for this slot today (by anyone); warn
              // before the nurse double-documents. Doesn't block: corrections
              // and legitimate repeat doses are still possible.
              const prior = dayAdmins.find(
                (a) => a.orderId === (order.id || '') && a.scheduledTime === slot,
              );
              return (
                <div key={key} style={marCardStyle}>
                  <div style={marCardHeadStyle}>
                    <div>
                      <span style={{ fontWeight: 700, color: '#1f2937' }}>{order.medName}</span>
                      <span style={{ color: '#6b7280', marginLeft: 8, fontSize: 13 }}>
                        {order.dose}{order.units ? ` ${order.units}` : ''} · {order.route}
                      </span>
                    </div>
                    <span style={slot === 'PRN' ? marPrnBadgeStyle : marSlotBadgeStyle}>
                      {slot === 'PRN' ? 'PRN' : slot}
                    </span>
                  </div>

                  {prior && (
                    <div style={marAlreadyChipStyle}>
                      Already documented today: {prior.status === 'given' ? 'given' : prior.status}
                      {prior.status === 'given' && prior.actualTime ? ` at ${prior.actualTime}` : ''}
                      {prior.initials ? ` (${prior.initials})` : ''}
                      {prior.documentedByName ? ` · by ${prior.documentedByName}` : ''}
                    </div>
                  )}

                  <div style={marStatusRowStyle}>
                    {(['given', 'held', 'refused'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => updateMark(order, slot, { status: status === s ? '' : s })}
                        style={status === s ? marStatusBtnActive[s] : marStatusBtnStyle}
                      >
                        {s === 'given' ? 'Given' : s === 'held' ? 'Held' : 'Refused'}
                      </button>
                    ))}
                  </div>

                  {status === 'given' && (
                    <div style={marDetailGridStyle}>
                      <label style={marFieldStyle}>
                        <span style={marFieldLabelStyle}>Time given</span>
                        <input
                          type="time"
                          value={rec?.actualTime || ''}
                          onChange={(e) => updateMark(order, slot, { actualTime: e.target.value })}
                          style={marInputStyle}
                        />
                      </label>
                      <label style={marFieldStyle}>
                        <span style={marFieldLabelStyle}>Initials</span>
                        <input
                          type="text"
                          value={rec?.initials || ''}
                          onChange={(e) => updateMark(order, slot, { initials: e.target.value })}
                          style={marInputStyle}
                          maxLength={5}
                        />
                      </label>
                      <label style={marFieldStyle}>
                        <span style={marFieldLabelStyle}>Administered by</span>
                        <select
                          value={rec?.administeredByType || 'nurse'}
                          onChange={(e) => updateMark(order, slot, { administeredByType: e.target.value })}
                          style={marSelectStyle}
                        >
                          {ADMIN_BY_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </label>
                      {!isNurseAdmin && (
                        <label style={marFieldStyle}>
                          <span style={marFieldLabelStyle}>Administrator name</span>
                          <input
                            type="text"
                            value={rec?.administratorName || ''}
                            onChange={(e) => updateMark(order, slot, { administratorName: e.target.value })}
                            style={marInputStyle}
                            placeholder="e.g., Jane Doe (daughter)"
                          />
                        </label>
                      )}
                    </div>
                  )}

                  {(status === 'held' || status === 'refused') && (
                    <label style={{ ...marFieldStyle, marginTop: 10 }}>
                      <span style={marFieldLabelStyle}>Reason</span>
                      <input
                        type="text"
                        value={rec?.reason || ''}
                        onChange={(e) => updateMark(order, slot, { reason: e.target.value })}
                        style={marInputStyle}
                        placeholder={status === 'refused' ? 'Reason for refusal' : 'Reason held / omitted'}
                      />
                    </label>
                  )}
                </div>
              );
            })}
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
const marFiledBannerStyle: CSSProperties = { marginTop: 12, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: 6, padding: '10px 12px', fontSize: 13, lineHeight: 1.5 };
const stagedBoxStyle: CSSProperties = { marginTop: 12, border: '1px solid #c8def5', background: '#f5f9fe', borderRadius: 8, padding: 10 };
const stagedHeaderStyle: CSSProperties = { fontSize: 12, fontWeight: 700, color: '#1a3a5c', marginBottom: 8 };
const stagedRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #e3eefb', fontSize: 13 };
const stagedTagAddStyle: CSSProperties = { background: '#e8f4e8', color: '#2a7a2a', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0 };
const stagedTagDcStyle: CSSProperties = { background: '#fdeaea', color: '#c0392b', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0 };
const stagedRemoveBtnStyle: CSSProperties = { background: 'transparent', border: 'none', color: '#c0392b', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 };
