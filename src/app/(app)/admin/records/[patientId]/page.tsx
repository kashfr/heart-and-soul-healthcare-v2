'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Plus, Pencil, Ban, Clock, X, Pill, CalendarDays } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import {
  getPatient,
  getPatientClinical,
  type Patient,
  type PatientClinical,
} from '@/lib/patients';
import {
  getMarOrders,
  addMarOrder,
  updateMarOrder,
  discontinueMarOrder,
  type MarOrder,
  type MarActor,
} from '@/lib/mar';
import { MED_FREQUENCIES, PRN_FREQUENCY } from '@/lib/medFrequencies';
import { looksLikeUnknownPhysician, physicianAttributionPending } from '@/lib/marShared';

interface OrderForm {
  medName: string;
  dose: string;
  units: string;
  route: string;
  frequencyLabel: string;
  scheduledTimes: string[];
  isPRN: boolean;
  indication: string;
  startDate: string;
  endDate: string;
  orderSignedDate: string;
  orderingPhysician: string;
  physicianUnknown: boolean;
  notes: string;
}

const ROUTES = ['PO (by mouth)', 'SL (sublingual)', 'Topical', 'Inhalation', 'Subcutaneous', 'IM', 'IV', 'Rectal', 'G-tube', 'J-tube', 'NG tube', 'Ophthalmic', 'Otic', 'Nasal'];
const UNITS = ['mg', 'mcg', 'g', 'mL', 'units', 'mEq', 'tablet(s)', 'capsule(s)', 'puff(s)', 'drop(s)', 'patch(es)', 'spray(s)', '%'];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyForm(): OrderForm {
  return {
    medName: '',
    dose: '',
    units: '',
    route: '',
    frequencyLabel: '',
    scheduledTimes: ['08:00'],
    isPRN: false,
    indication: '',
    startDate: todayISO(),
    endDate: '',
    orderSignedDate: '',
    orderingPhysician: '',
    physicianUnknown: false,
    notes: '',
  };
}

function formatDate(d?: string | null): string {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function scheduleSummary(o: MarOrder): string {
  if (o.isPRN) return 'PRN (as needed)';
  if (!o.scheduledTimes || o.scheduledTimes.length === 0) return '-';
  return o.scheduledTimes.join(', ');
}

export default function RecordDetailPage() {
  const params = useParams();
  const patientId = String(params.patientId);
  const { user, profile } = useAuth();

  const actor: MarActor | null = useMemo(
    () =>
      user && profile
        ? { uid: user.uid, displayName: profile.displayName || user.email || '', role: profile.role }
        : null,
    [user, profile],
  );

  const [patient, setPatient] = useState<Patient | null>(null);
  const [clinical, setClinical] = useState<PatientClinical | null>(null);
  const [orders, setOrders] = useState<MarOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Order add/edit modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OrderForm>(emptyForm());
  const [submitting, setSubmitting] = useState(false);

  // Read-only order detail (opened by clicking a medication row)
  const [viewOrder, setViewOrder] = useState<MarOrder | null>(null);

  // Discontinue modal
  const [dcTarget, setDcTarget] = useState<MarOrder | null>(null);
  const [dcEndDate, setDcEndDate] = useState(todayISO());
  const [dcReason, setDcReason] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [p, c, o] = await Promise.all([
        getPatient(patientId),
        getPatientClinical(patientId),
        getMarOrders(patientId),
      ]);
      if (cancelled) return;
      setPatient(p);
      setClinical(c);
      setOrders(o);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const reloadOrders = async () => {
    setOrders(await getMarOrders(patientId));
  };

  const activeOrders = orders.filter((o) => o.status === 'active');
  const discontinuedOrders = orders.filter((o) => o.status === 'discontinued');

  const openAdd = () => {
    setForm(emptyForm());
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (o: MarOrder) => {
    setForm({
      medName: o.medName || '',
      dose: o.dose || '',
      units: o.units || '',
      route: o.route || '',
      frequencyLabel: o.isPRN ? PRN_FREQUENCY : o.frequencyLabel || '',
      scheduledTimes: o.scheduledTimes && o.scheduledTimes.length > 0 ? [...o.scheduledTimes] : ['08:00'],
      // Legacy rows could hold the PRN frequency label with isPRN false (the
      // old independent checkbox); trust the label so a re-save heals them.
      isPRN: !!o.isPRN || o.frequencyLabel === PRN_FREQUENCY,
      indication: o.indication || '',
      startDate: o.startDate || todayISO(),
      endDate: o.endDate || '',
      orderSignedDate: o.orderSignedDate || '',
      orderingPhysician: o.orderingPhysician || '',
      physicianUnknown: o.physicianPending === true,
      notes: o.notes || '',
    });
    setEditingId(o.id || null);
    setFormOpen(true);
  };

  // Scheduled-times editor helpers
  const setTimeAt = (i: number, value: string) =>
    setForm((f) => ({ ...f, scheduledTimes: f.scheduledTimes.map((t, idx) => (idx === i ? value : t)) }));
  const addTime = () => setForm((f) => ({ ...f, scheduledTimes: [...f.scheduledTimes, ''] }));
  const removeTime = (i: number) =>
    setForm((f) => ({ ...f, scheduledTimes: f.scheduledTimes.filter((_, idx) => idx !== i) }));

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actor) {
      showToast('Not signed in.');
      return;
    }
    if (!form.medName.trim() || !form.dose.trim() || !form.units.trim() || !form.route.trim() || !form.startDate) {
      showToast('Medication, dose, units, route, and start date are required.');
      return;
    }
    if (!form.isPRN && form.scheduledTimes.filter(Boolean).length === 0) {
      showToast('Add at least one scheduled time, or choose the "As needed (PRN)" frequency.');
      return;
    }
    if (form.isPRN && !form.indication.trim()) {
      showToast('Add an indication: PRN doses are documented against what the med is for.');
      return;
    }
    if (form.orderSignedDate && form.orderSignedDate > todayISO()) {
      showToast('"Physician order signed on" cannot be a future date.');
      return;
    }
    if (!form.physicianUnknown && looksLikeUnknownPhysician(form.orderingPhysician)) {
      showToast(
        form.orderingPhysician.trim()
          ? 'Enter the ordering physician\'s actual name (placeholders like "N/A" don\'t document the order), or check "unknown right now" to flag it for follow-up.'
          : 'Ordering physician is required; the order reflects a physician\'s prescription. If unknown right now, check the box to flag it for follow-up.',
      );
      return;
    }
    setSubmitting(true);
    try {
      const input = {
        medName: form.medName,
        dose: form.dose,
        units: form.units,
        route: form.route,
        frequencyLabel: form.frequencyLabel,
        scheduledTimes: form.scheduledTimes,
        isPRN: form.isPRN,
        indication: form.indication,
        startDate: form.startDate,
        endDate: form.endDate || null,
        orderSignedDate: form.orderSignedDate,
        orderingPhysician: form.orderingPhysician,
        physicianPending: form.physicianUnknown && looksLikeUnknownPhysician(form.orderingPhysician),
        notes: form.notes,
      };
      if (editingId) {
        await updateMarOrder(editingId, input, actor);
        showToast(`${form.medName} updated`);
      } else {
        await addMarOrder(patientId, input, actor);
        showToast(`${form.medName} added`);
      }
      await reloadOrders();
      setFormOpen(false);
      setEditingId(null);
    } catch {
      showToast('Failed to save the order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const openDiscontinue = (o: MarOrder) => {
    setDcTarget(o);
    setDcEndDate(todayISO());
    setDcReason('');
  };

  const handleDiscontinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actor || !dcTarget?.id) return;
    if (!dcReason.trim()) {
      showToast('A reason is required to discontinue.');
      return;
    }
    setSubmitting(true);
    try {
      await discontinueMarOrder(dcTarget.id, dcEndDate, dcReason, actor);
      showToast(`${dcTarget.medName} discontinued`);
      await reloadOrders();
      setDcTarget(null);
    } catch {
      showToast('Failed to discontinue. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <div style={{ marginBottom: 16 }}>
          <Link href="/admin/records" style={backLinkStyle}>
            <ArrowLeft size={14} /> Back to Records
          </Link>
        </div>

        {loading ? (
          <div style={emptyStyle}>Loading…</div>
        ) : !patient ? (
          <div style={emptyStyle}>Client not found.</div>
        ) : (
          <>
            {/* MAR header; demographics from the roster, clinical PHI from the
                care-team-gated sub-record. Edited on the Patients screen. */}
            <header style={headerCardStyle}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={headerIconStyle}>
                  <Pill size={22} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h1 style={titleStyle}>{patient.name}</h1>
                  <div style={headerMetaStyle}>
                    {patient.dob ? `DOB ${formatDate(patient.dob)}` : ''}
                    {clinical?.sex ? ` · ${clinical.sex}` : ''}
                    {patient.mrn ? ` · Record #${patient.mrn}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, flexWrap: 'wrap' }}>
                  <Link href={`/admin/records/${patientId}/mar`} style={marLinkStyle}>
                    <CalendarDays size={14} /> Monthly MAR
                  </Link>
                  <Link href={`/admin/patients?edit=${patientId}`} style={editHeaderLinkStyle}>
                    <Pencil size={13} /> Edit client details
                  </Link>
                </div>
              </div>

              {!patient.requiresMar && (
                <div style={notFlaggedStyle}>
                  This client isn&apos;t marked <strong>Requires MAR</strong> yet. You can still build orders, but
                  flag them on the{' '}
                  <Link href="/admin/patients" style={inlineLinkStyle}>Patients</Link> screen so they appear in the
                  Records list.
                </div>
              )}

              <div style={headerGridStyle}>
                <HeaderField label="Diagnosis" value={patient.diagnosis} />
                <HeaderField label="Allergies" value={clinical?.allergies} highlight />
                <HeaderField
                  label="Attending physician"
                  value={[clinical?.physicianName, clinical?.physicianPhone].filter(Boolean).join(' · ')}
                />
                <HeaderField label="Diet / special instructions" value={clinical?.diet} />
              </div>
            </header>

            <div style={sectionHeaderRowStyle}>
              <h2 style={sectionTitleStyle}>Medication orders</h2>
              <button onClick={openAdd} style={primaryBtnStyle}>
                <Plus size={16} /> Add medication
              </button>
            </div>

            {activeOrders.length === 0 && discontinuedOrders.length === 0 ? (
              <div style={emptyStyle}>
                No medications yet. Click &ldquo;Add medication&rdquo; to build this client&apos;s regimen.
              </div>
            ) : (
              <>
                <OrderTable
                  title={`Active (${activeOrders.length})`}
                  orders={activeOrders}
                  onEdit={openEdit}
                  onDiscontinue={openDiscontinue}
                  onView={setViewOrder}
                />
                {discontinuedOrders.length > 0 && (
                  <OrderTable
                    title={`Discontinued (${discontinuedOrders.length})`}
                    orders={discontinuedOrders}
                    onView={setViewOrder}
                    discontinued
                  />
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Add / edit order modal */}
      {formOpen && (
        <div style={modalBackdropStyle} onClick={() => !submitting && setFormOpen(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h2 style={{ margin: 0, fontSize: 18, color: '#2c3e50' }}>
                {editingId ? 'Edit medication order' : 'Add medication order'}
              </h2>
              <button onClick={() => setFormOpen(false)} style={closeBtnStyle} aria-label="Close">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveOrder} style={{ padding: 20 }}>
              <Field label="Medication name *">
                <input
                  type="text"
                  required
                  value={form.medName}
                  onChange={(e) => setForm((f) => ({ ...f, medName: e.target.value }))}
                  style={inputStyle}
                  placeholder="e.g., Levetiracetam (Keppra)"
                />
              </Field>

              <div style={gridTwoStyle}>
                <Field label="Dose *">
                  <input
                    type="text"
                    required
                    value={form.dose}
                    onChange={(e) => setForm((f) => ({ ...f, dose: e.target.value }))}
                    style={inputStyle}
                    placeholder="e.g., 10"
                  />
                </Field>
                <Field label="Units *">
                  <input
                    type="text"
                    required
                    list="mar-units"
                    value={form.units}
                    onChange={(e) => setForm((f) => ({ ...f, units: e.target.value }))}
                    style={inputStyle}
                    placeholder="e.g., mg"
                  />
                  <datalist id="mar-units">
                    {UNITS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </Field>
              </div>

              <div style={gridTwoStyle}>
                <Field label="Route *">
                  <select
                    required
                    value={form.route}
                    onChange={(e) => setForm((f) => ({ ...f, route: e.target.value }))}
                    style={selectStyle}
                  >
                    <option value="">Select route…</option>
                    {ROUTES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Frequency">
                  <select
                    value={form.frequencyLabel}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        frequencyLabel: e.target.value,
                        // Single PRN control (PR #77): the "As needed (PRN)"
                        // frequency IS the PRN switch; no separate checkbox.
                        isPRN: e.target.value === PRN_FREQUENCY,
                      }))
                    }
                    style={selectStyle}
                  >
                    <option value="">Select frequency…</option>
                    {/* Preserve a pre-existing free-text value that isn't one of
                        the standard options, so editing an old order doesn't
                        silently blank or change its frequency. */}
                    {form.frequencyLabel && !MED_FREQUENCIES.includes(form.frequencyLabel as (typeof MED_FREQUENCIES)[number]) && (
                      <option value={form.frequencyLabel}>{form.frequencyLabel} (current)</option>
                    )}
                    {MED_FREQUENCIES.map((freq) => (
                      <option key={freq} value={freq}>
                        {freq}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {!form.isPRN && (
                <div style={{ marginBottom: 12 }}>
                  <div style={fieldLabelStyle}>Scheduled times *</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {form.scheduledTimes.map((t, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Clock size={15} color="#7f8c8d" />
                        <input
                          type="time"
                          value={t}
                          onChange={(e) => setTimeAt(i, e.target.value)}
                          style={{ ...inputStyle, maxWidth: 150 }}
                        />
                        {form.scheduledTimes.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeTime(i)}
                            style={removeTimeBtnStyle}
                            aria-label="Remove time"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addTime} style={addTimeBtnStyle}>
                    <Plus size={13} /> Add time
                  </button>
                </div>
              )}

              <Field label={form.isPRN ? 'Indication (what it’s given for) *' : 'Indication (what it’s for)'}>
                <input
                  type="text"
                  value={form.indication}
                  onChange={(e) => setForm((f) => ({ ...f, indication: e.target.value }))}
                  style={inputStyle}
                  placeholder={form.isPRN ? 'e.g., Moderate pain (4-6/10)' : 'e.g., Hypertension'}
                />
                <span style={indicationHintStyle}>
                  {form.isPRN
                    ? 'Required for PRN meds: the nurse documents why each as-needed dose was given against this.'
                    : 'Optional. Shown on the chart and snapshotted onto each recorded dose.'}
                </span>
              </Field>

              <div style={gridTwoStyle}>
                <Field label="Start date *">
                  <input
                    type="date"
                    required
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
                <Field label="End date (optional)">
                  <input
                    type="date"
                    value={form.endDate}
                    min={form.startDate || undefined}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
              </div>

              <div style={gridTwoStyle}>
                <Field label="Ordering physician *">
                  <input
                    type="text"
                    value={form.orderingPhysician}
                    onChange={(e) => setForm((f) => ({ ...f, orderingPhysician: e.target.value }))}
                    style={inputStyle}
                    placeholder="Dr. Jane Smith"
                  />
                </Field>
                <Field label="Physician order signed on">
                  <input
                    type="date"
                    value={form.orderSignedDate}
                    onChange={(e) => setForm((f) => ({ ...f, orderSignedDate: e.target.value }))}
                    style={inputStyle}
                  />
                  <span style={indicationHintStyle}>
                    Date on the current signed order. Blank = the start date. Update when the
                    annual renewal comes in; orders older than 12 months are flagged.
                  </span>
                </Field>
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: -4, marginBottom: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.physicianUnknown}
                  onChange={(e) => setForm((f) => ({ ...f, physicianUnknown: e.target.checked }))}
                  style={{ marginTop: 2 }}
                />
                <span style={{ fontSize: 12.5, color: '#5c6b7a', lineHeight: 1.4 }}>
                  I don&apos;t know the ordering physician right now. Flag this order for follow-up
                  so it can be updated with the physician&apos;s name.
                </span>
              </label>

              <Field label="Notes">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  style={textareaStyle}
                  placeholder="Special instructions, hold parameters, etc."
                />
              </Field>

              <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setFormOpen(false)} disabled={submitting} style={secondaryBtnStyle}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} style={primaryBtnStyle}>
                  {submitting ? 'Saving…' : editingId ? 'Update order' : 'Save order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Discontinue modal */}
      {dcTarget && (
        <div style={modalBackdropStyle} onClick={() => !submitting && setDcTarget(null)}>
          <div style={{ ...modalStyle, maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h2 style={{ margin: 0, fontSize: 18, color: '#2c3e50' }}>Discontinue medication</h2>
              <button onClick={() => setDcTarget(null)} style={closeBtnStyle} aria-label="Close">
                ✕
              </button>
            </div>
            <form onSubmit={handleDiscontinue} style={{ padding: 20 }}>
              <p style={{ fontSize: 14, color: '#5c6b7a', marginTop: 0 }}>
                Discontinue <strong>{dcTarget.medName}</strong> ({dcTarget.dose}). The order stays on the record for
                the days it applied; it just stops going forward.
              </p>
              <Field label="End date *">
                <input
                  type="date"
                  required
                  value={dcEndDate}
                  onChange={(e) => setDcEndDate(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Reason *">
                <textarea
                  required
                  value={dcReason}
                  onChange={(e) => setDcReason(e.target.value)}
                  style={textareaStyle}
                  placeholder="e.g., Physician discontinued; dose changed (new order added)"
                />
              </Field>
              <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setDcTarget(null)} disabled={submitting} style={secondaryBtnStyle}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} style={dangerBtnStyle}>
                  {submitting ? 'Saving…' : 'Discontinue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Read-only order detail (click a medication row to open) */}
      {viewOrder && (
        <div style={modalBackdropStyle} onClick={() => setViewOrder(null)}>
          <div style={{ ...modalStyle, maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h2 style={{ margin: 0, fontSize: 18, color: '#2c3e50' }}>Medication order</h2>
              <button onClick={() => setViewOrder(null)} style={closeBtnStyle} aria-label="Close">
                ✕
              </button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#1a3a5c' }}>{viewOrder.medName}</span>
                {viewOrder.isPRN && <span style={prnBadgeStyle}>PRN</span>}
                {viewOrder.status === 'discontinued' && <span style={dcBadgeStyle}>Discontinued</span>}
              </div>

              <div style={detailGridStyle}>
                <DetailRow label="Dose" value={`${viewOrder.dose}${viewOrder.units ? ` ${viewOrder.units}` : ''}`} />
                <DetailRow label="Route" value={viewOrder.route} />
                <DetailRow label="Frequency" value={viewOrder.frequencyLabel} />
                <DetailRow label="Schedule" value={scheduleSummary(viewOrder)} />
                <DetailRow label="Start date" value={formatDate(viewOrder.startDate)} />
                <DetailRow
                  label="End date"
                  value={viewOrder.endDate ? formatDate(viewOrder.endDate) : viewOrder.status === 'discontinued' ? '-' : 'Ongoing'}
                />
                <DetailRow
                  label="Ordering physician"
                  value={
                    physicianAttributionPending(viewOrder)
                      ? viewOrder.orderingPhysician?.trim()
                        ? `${viewOrder.orderingPhysician} (flagged: needs the actual physician name)`
                        : 'Needed (flagged for follow-up)'
                      : viewOrder.orderingPhysician
                  }
                />
              </div>

              {viewOrder.notes && (
                <div style={{ marginTop: 14 }}>
                  <div style={detailLabelStyle}>Notes</div>
                  <div style={{ ...detailValueStyle, whiteSpace: 'pre-wrap' }}>{viewOrder.notes}</div>
                </div>
              )}

              {viewOrder.status === 'discontinued' && (
                <div style={{ marginTop: 14, background: '#fdecea', border: '1px solid #f5c6c0', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={detailLabelStyle}>Discontinued</div>
                  <div style={detailValueStyle}>
                    {viewOrder.discontinueReason || '-'}
                    {viewOrder.endDate ? ` (effective ${formatDate(viewOrder.endDate)})` : ''}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setViewOrder(null)} style={secondaryBtnStyle}>
                  Close
                </button>
                {viewOrder.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => { const o = viewOrder; setViewOrder(null); openEdit(o); }}
                    style={primaryBtnStyle}
                  >
                    <Pencil size={14} /> Edit order
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={toastStyle}>{toast}</div>}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={detailLabelStyle}>{label}</div>
      <div style={detailValueStyle}>{value || <span style={{ color: '#aaa' }}>-</span>}</div>
    </div>
  );
}

function HeaderField({ label, value, highlight }: { label: string; value?: string | null; highlight?: boolean }) {
  return (
    <div>
      <div style={headerFieldLabelStyle}>{label}</div>
      <div style={{ ...headerFieldValueStyle, color: highlight && value ? '#b3261e' : '#2c3e50' }}>
        {value || <span style={{ color: '#aaa' }}>-</span>}
      </div>
    </div>
  );
}

function OrderTable({
  title,
  orders,
  onEdit,
  onDiscontinue,
  onView,
  discontinued,
}: {
  title: string;
  orders: MarOrder[];
  onEdit?: (o: MarOrder) => void;
  onDiscontinue?: (o: MarOrder) => void;
  onView?: (o: MarOrder) => void;
  discontinued?: boolean;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={orderGroupTitleStyle}>{title}</div>
      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Medication</th>
              <th style={thStyle}>Dose</th>
              <th style={thStyle}>Route</th>
              <th style={thStyle}>Schedule</th>
              <th style={thStyle}>Dates</th>
              {!discontinued && <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>}
              {discontinued && <th style={thStyle}>Reason</th>}
            </tr>
          </thead>
          <tbody>
            {orders.map((o, i) => (
              <tr
                key={o.id}
                style={{ ...(i % 2 === 1 ? altRowStyle : undefined), cursor: onView ? 'pointer' : undefined }}
                onClick={onView ? () => onView(o) : undefined}
                title={onView ? `View ${o.medName} order` : undefined}
                onMouseEnter={onView ? (e) => { e.currentTarget.style.background = '#f1f5f9'; } : undefined}
                onMouseLeave={onView ? (e) => { e.currentTarget.style.background = i % 2 === 1 ? '#f9fafb' : 'white'; } : undefined}
              >
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600, color: '#2c3e50' }}>{o.medName}</div>
                  {o.frequencyLabel && <div style={subTextStyle}>{o.frequencyLabel}</div>}
                  {o.isPRN && <span style={prnBadgeStyle}>PRN</span>}
                  {!discontinued && physicianAttributionPending(o) && (
                    <span style={physicianNeededBadgeStyle} title="No ordering physician on this order yet; edit the order to add the name.">
                      Physician needed
                    </span>
                  )}
                </td>
                <td style={tdStyle}>{o.dose}{o.units ? ` ${o.units}` : ''}</td>
                <td style={tdStyle}>{o.route}</td>
                <td style={tdStyle}>{scheduleSummary(o)}</td>
                <td style={tdStyle}>
                  {formatDate(o.startDate)}
                  {o.endDate ? ` → ${formatDate(o.endDate)}` : discontinued ? '' : ' → ongoing'}
                </td>
                {!discontinued && (
                  // Stop row-click (view) from firing when using the action buttons.
                  <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => onEdit?.(o)} style={iconBtnStyle} aria-label={`Edit ${o.medName}`} title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => onDiscontinue?.(o)}
                      style={{ ...iconBtnStyle, color: '#c44' }}
                      aria-label={`Discontinue ${o.medName}`}
                      title="Discontinue"
                    >
                      <Ban size={14} />
                    </button>
                  </td>
                )}
                {discontinued && (
                  <td style={{ ...tdStyle, color: '#7f8c8d', fontSize: 12.5 }}>
                    {o.discontinueReason || '-'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </label>
  );
}

const containerStyle: React.CSSProperties = { minHeight: '70vh', background: '#f5f7fa', padding: '32px 20px' };
const wrapStyle: React.CSSProperties = { maxWidth: 1100, margin: '0 auto' };
const backLinkStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, color: '#27ae60', textDecoration: 'none', fontSize: 13, fontWeight: 600 };
const headerCardStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginBottom: 20 };
const headerIconStyle: React.CSSProperties = { width: 46, height: 46, borderRadius: 10, background: '#eef5ff', color: '#1a3a5c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const titleStyle: React.CSSProperties = { fontSize: 24, color: '#2c3e50', margin: 0 };
const headerMetaStyle: React.CSSProperties = { fontSize: 13, color: '#7f8c8d', marginTop: 4 };
const editHeaderLinkStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, color: '#1a73c4', textDecoration: 'none', fontSize: 13, fontWeight: 600, flexShrink: 0 };
const marLinkStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a3a5c', color: 'white', textDecoration: 'none', fontSize: 13, fontWeight: 600, padding: '8px 12px', borderRadius: 6, flexShrink: 0 };
const notFlaggedStyle: React.CSSProperties = { marginTop: 14, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '10px 14px', fontSize: 13, lineHeight: 1.5 };
const headerGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f3f5' };
const headerFieldLabelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#9aa6b2', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 };
const headerFieldValueStyle: React.CSSProperties = { fontSize: 14, color: '#2c3e50', lineHeight: 1.45 };
const inlineLinkStyle: React.CSSProperties = { color: '#1a73c4', textDecoration: 'none', fontWeight: 600 };
const sectionHeaderRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' };
const sectionTitleStyle: React.CSSProperties = { fontSize: 18, color: '#2c3e50', margin: 0 };
const orderGroupTitleStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5c6b7a', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 };
const emptyStyle: React.CSSProperties = { textAlign: 'center', padding: '40px 20px', background: 'white', borderRadius: 10, color: '#7f8c8d', fontSize: 14, border: '1px solid #e5e7eb', lineHeight: 1.6 };
const tableWrapStyle: React.CSSProperties = { background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', overflowX: 'auto' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 14 };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '11px 14px', borderBottom: '1px solid #e5e7eb', color: '#5c6b7a', fontWeight: 700, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 };
const tdStyle: React.CSSProperties = { padding: '11px 14px', borderBottom: '1px solid #f1f3f5', color: '#2c3e50', verticalAlign: 'top' };
const altRowStyle: React.CSSProperties = { background: '#fafbfc' };
const subTextStyle: React.CSSProperties = { fontSize: 12, color: '#7f8c8d', marginTop: 2 };
const physicianNeededBadgeStyle: React.CSSProperties = { display: 'inline-block', marginLeft: 6, padding: '1px 8px', borderRadius: 999, background: '#fff3e0', color: '#b45309', fontSize: 10.5, fontWeight: 700 };
const prnBadgeStyle: React.CSSProperties = { display: 'inline-block', marginTop: 4, background: '#fef3e2', color: '#b56a17', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999, letterSpacing: 0.4 };
const dcBadgeStyle: React.CSSProperties = { display: 'inline-block', background: '#fdecea', color: '#b3261e', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, letterSpacing: 0.4, textTransform: 'uppercase' };
const detailGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 };
const detailLabelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#9aa6b2', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 };
const detailValueStyle: React.CSSProperties = { fontSize: 14.5, color: '#2c3e50' };
const primaryBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#27ae60', color: 'white', padding: '10px 14px', borderRadius: 6, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const secondaryBtnStyle: React.CSSProperties = { background: '#eef1f4', color: '#2c3e50', padding: '10px 14px', borderRadius: 6, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const dangerBtnStyle: React.CSSProperties = { background: '#c0392b', color: 'white', padding: '10px 14px', borderRadius: 6, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const iconBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', padding: 6, margin: '0 2px', borderRadius: 4, cursor: 'pointer', color: '#5c6b7a' };
const modalBackdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 };
const modalStyle: React.CSSProperties = { background: 'white', borderRadius: 10, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' };
const modalHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f3f5' };
const closeBtnStyle: React.CSSProperties = { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#7f8c8d' };
const fieldLabelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#5c6b7a' };
const indicationHintStyle: React.CSSProperties = { fontSize: 11.5, color: '#8a949e', lineHeight: 1.4, marginTop: 2 };
const inputStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' };
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 60, resize: 'vertical', lineHeight: 1.4 };
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  paddingRight: 36,
  background:
    "white url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\") no-repeat right 12px center",
  backgroundSize: '14px',
  cursor: 'pointer',
};
const gridTwoStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
const removeTimeBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#c44', border: 'none', padding: 4, borderRadius: 4, cursor: 'pointer' };
const addTimeBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'white', color: '#0e7c4a', border: '1px dashed #0e7c4a', padding: '7px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 8 };
const toastStyle: React.CSSProperties = { position: 'fixed', bottom: 20, right: 20, background: '#2c3e50', color: 'white', padding: '10px 16px', borderRadius: 8, fontSize: 13, boxShadow: '0 8px 20px rgba(0,0,0,0.2)', zIndex: 1100 };
