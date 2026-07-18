'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Plus, ShieldCheck, Pencil, Ban } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { getPatient, type Patient } from '@/lib/patients';
import {
  getCareTasks,
  addCareTask,
  updateCareTask,
  discontinueCareTask,
  approveCareTasks,
  compareCareTasks,
  type CareTask,
  type CareTaskActor,
} from '@/lib/careTasks';
import {
  CARE_TASK_CATALOG,
  CARE_TASK_FREQUENCIES,
  findCatalogTask,
  type CareTaskLevel,
} from '@/lib/careTaskCatalog';

/**
 * Per-client care task editor (Option C phase 1). Staff assign tasks from
 * the catalog (plus custom entries); the RN supervisor approves the list,
 * and each approval is stamped per task. Phase 2 renders the ACTIVE +
 * APPROVED tasks on the client's progress notes for per-shift charting.
 */
export default function CarePlanEditorPage() {
  const params = useParams<{ patientId: string }>();
  const patientId = params?.patientId ?? '';
  const { user, profile, role } = useAuth();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [tasks, setTasks] = useState<CareTask[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Add modal
  const [addOpen, setAddOpen] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState(CARE_TASK_CATALOG[0].key);
  const [customLevel, setCustomLevel] = useState<CareTaskLevel>('any');
  const [customFrequency, setCustomFrequency] = useState<string>('Every shift');
  const [customInstructions, setCustomInstructions] = useState('');

  // Edit modal
  const [editTarget, setEditTarget] = useState<CareTask | null>(null);
  const [editName, setEditName] = useState('');
  const [editFrequency, setEditFrequency] = useState('');
  const [editInstructions, setEditInstructions] = useState('');

  // Discontinue modal
  const [dcTarget, setDcTarget] = useState<CareTask | null>(null);
  const [dcReason, setDcReason] = useState('');

  const actor: CareTaskActor | null = user
    ? { uid: user.uid, displayName: profile?.displayName || user.email || '', role: role || '' }
    : null;

  const reload = useCallback(async () => {
    if (!patientId) return;
    const [p, t] = await Promise.all([getPatient(patientId), getCareTasks(patientId)]);
    setPatient(p);
    setTasks(t);
  }, [patientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const active = useMemo(
    () => (tasks || []).filter((t) => t.status === 'active').sort(compareCareTasks),
    [tasks],
  );
  const discontinued = useMemo(
    () => (tasks || []).filter((t) => t.status === 'discontinued').sort(compareCareTasks),
    [tasks],
  );
  const activeCatalogKeys = useMemo(
    () => new Set(active.map((t) => t.catalogKey).filter(Boolean)),
    [active],
  );
  const pending = active.filter((t) => !t.approvedAt);

  // Group active tasks in catalog order, custom tasks last.
  const grouped = useMemo(() => {
    const byLabel = new Map<string, CareTask[]>();
    for (const t of active) {
      const list = byLabel.get(t.categoryLabel) || [];
      list.push(t);
      byLabel.set(t.categoryLabel, list);
    }
    const ordered: { label: string; tasks: CareTask[] }[] = [];
    for (const cat of CARE_TASK_CATALOG) {
      const list = byLabel.get(cat.label);
      if (list) {
        ordered.push({ label: cat.label, tasks: list });
        byLabel.delete(cat.label);
      }
    }
    for (const [label, list] of byLabel) ordered.push({ label, tasks: list });
    return ordered;
  }, [active]);

  const withBusy = async (fn: () => Promise<void>) => {
    if (!actor) return;
    setBusy(true);
    setError('');
    try {
      await fn();
      await reload();
    } catch (err) {
      console.error(err);
      setError('Something went wrong saving. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = () =>
    withBusy(async () => {
      if (!actor) return;
      const keys = Object.keys(picked).filter((k) => picked[k]);
      for (const key of keys) {
        const cat = findCatalogTask(key);
        if (!cat) continue;
        await addCareTask(
          patientId,
          {
            catalogKey: cat.key,
            name: cat.name,
            category: cat.category,
            categoryLabel: cat.categoryLabel,
            level: cat.level,
            frequency: cat.defaultFrequency,
          },
          actor,
        );
      }
      if (customName.trim()) {
        const catDef = CARE_TASK_CATALOG.find((c) => c.key === customCategory);
        await addCareTask(
          patientId,
          {
            name: customName.trim(),
            category: 'custom',
            categoryLabel: catDef ? catDef.label : 'Other',
            level: customLevel,
            frequency: customFrequency,
            instructions: customInstructions,
          },
          actor,
        );
      }
      setPicked({});
      setCustomName('');
      setCustomInstructions('');
      setAddOpen(false);
    });

  const openEdit = (t: CareTask) => {
    setEditTarget(t);
    setEditName(t.name);
    setEditFrequency(t.frequency);
    setEditInstructions(t.instructions || '');
  };

  const handleEdit = () =>
    withBusy(async () => {
      if (!actor || !editTarget?.id) return;
      await updateCareTask(
        editTarget.id,
        { name: editName.trim() || editTarget.name, frequency: editFrequency, instructions: editInstructions },
        actor,
      );
      setEditTarget(null);
    });

  const handleDiscontinue = () =>
    withBusy(async () => {
      if (!actor || !dcTarget?.id || !dcReason.trim()) return;
      await discontinueCareTask(dcTarget.id, dcReason.trim(), actor);
      setDcTarget(null);
      setDcReason('');
    });

  const handleApprove = () =>
    withBusy(async () => {
      if (!actor) return;
      await approveCareTasks(pending.map((t) => t.id!).filter(Boolean), actor);
    });

  // Per-task approval: the RN can accept the tasks she agrees with and leave
  // the one she wants reworded as pending — approval granularity matches her
  // judgment, never all-or-nothing.
  const handleApproveOne = (t: CareTask) =>
    withBusy(async () => {
      if (!actor || !t.id) return;
      await approveCareTasks([t.id], actor);
    });

  const pickedCount = Object.values(picked).filter(Boolean).length + (customName.trim() ? 1 : 0);

  return (
    <div style={containerStyle}>
      <Link href="/admin/care-plan" style={backStyle}>
        <ArrowLeft size={15} /> All care plans
      </Link>

      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>{patient ? patient.name : 'Loading…'}</h1>
          <p style={subStyle}>
            Care task list{patient?.mrn ? ` · Record #${patient.mrn}` : ''}
            {pending.length > 0 && (
              <span style={pendingBannerStyle}> · {pending.length} task{pending.length === 1 ? '' : 's'} pending RN approval</span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {pending.length > 0 && (
            <button type="button" style={approveBtnStyle} onClick={handleApprove} disabled={busy} title="Stamps your name, role, and the time on each pending task. Intended for the RN supervisor.">
              <ShieldCheck size={15} /> Approve all pending ({pending.length})
            </button>
          )}
          <button type="button" style={addBtnStyle} onClick={() => setAddOpen(true)} disabled={busy}>
            <Plus size={15} /> Add tasks
          </button>
        </div>
      </header>

      {error && <div style={errorStyle}>{error}</div>}

      {tasks === null ? (
        <div style={emptyStyle}>Loading care tasks…</div>
      ) : active.length === 0 ? (
        <div style={emptyStyle}>
          No care tasks assigned yet. Use &ldquo;Add tasks&rdquo; to build this client&apos;s list from the catalog.
        </div>
      ) : (
        grouped.map((group) => (
          <section key={group.label} style={{ marginBottom: 18 }}>
            <h2 style={groupTitleStyle}>{group.label}</h2>
            <ul style={listStyle}>
              {group.tasks.map((t) => (
                <li key={t.id} style={taskRowStyle}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={taskNameStyle}>
                      {t.name}
                      <span style={t.level === 'skilled' ? skilledChipStyle : anyChipStyle}>
                        {t.level === 'skilled' ? 'RN/LPN' : 'All staff'}
                      </span>
                    </div>
                    <div style={taskMetaStyle}>
                      {t.frequency}
                      {t.instructions ? ` · ${t.instructions}` : ''}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      {t.approvedAt ? (
                        <span style={approvedChipStyle}>
                          <ShieldCheck size={12} /> Approved · {t.approvedByName || 'RN'}
                        </span>
                      ) : (
                        <span style={pendingChipStyle}>Pending RN approval</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {!t.approvedAt && (
                      <button type="button" style={approveOneBtnStyle} onClick={() => handleApproveOne(t)} disabled={busy} title="Approve this task (stamps your name, role, and the time)">
                        <ShieldCheck size={13} /> Approve
                      </button>
                    )}
                    <button type="button" style={iconBtnStyle} onClick={() => openEdit(t)} disabled={busy} title="Edit frequency / instructions">
                      <Pencil size={14} />
                    </button>
                    <button type="button" style={iconBtnDangerStyle} onClick={() => { setDcTarget(t); setDcReason(''); }} disabled={busy} title="Discontinue task">
                      <Ban size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {discontinued.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={dcSummaryStyle}>Discontinued tasks ({discontinued.length})</summary>
          <ul style={listStyle}>
            {discontinued.map((t) => (
              <li key={t.id} style={{ ...taskRowStyle, opacity: 0.65 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={taskNameStyle}>{t.name}</div>
                  <div style={taskMetaStyle}>
                    Discontinued{t.discontinuedByName ? ` by ${t.discontinuedByName}` : ''}
                    {t.discontinueReason ? ` · ${t.discontinueReason}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Add-tasks modal */}
      {addOpen && (
        <div style={backdropStyle} onClick={() => !busy && setAddOpen(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitleStyle}>Add care tasks</h2>
            <p style={modalSubStyle}>
              Check the tasks that belong on this client&apos;s plan. Frequencies start at the
              catalog default; edit any task after adding. New tasks are marked pending until
              the RN supervisor approves them.
            </p>
            <div style={catalogScrollStyle}>
              {CARE_TASK_CATALOG.map((cat) => {
                const available = cat.tasks.filter((t) => !activeCatalogKeys.has(t.key));
                if (available.length === 0) return null;
                return (
                  <div key={cat.key} style={{ marginBottom: 12 }}>
                    <div style={catalogCatStyle}>{cat.label}</div>
                    {available.map((t) => (
                      <label key={t.key} style={catalogTaskStyle}>
                        <input
                          type="checkbox"
                          checked={!!picked[t.key]}
                          onChange={(e) => setPicked((p) => ({ ...p, [t.key]: e.target.checked }))}
                        />
                        <span style={{ flex: 1 }}>{t.name}</span>
                        <span style={t.level === 'skilled' ? skilledChipStyle : anyChipStyle}>
                          {t.level === 'skilled' ? 'RN/LPN' : 'All staff'}
                        </span>
                      </label>
                    ))}
                  </div>
                );
              })}

              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 4 }}>
                <div style={catalogCatStyle}>Custom task (not in catalog)</div>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Task name as it should appear on the note…"
                  style={inputStyle}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <select value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} style={selectStyle}>
                    {CARE_TASK_CATALOG.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                  <select value={customLevel} onChange={(e) => setCustomLevel(e.target.value as CareTaskLevel)} style={selectStyle}>
                    <option value="any">All staff</option>
                    <option value="skilled">RN/LPN only</option>
                  </select>
                  <select value={customFrequency} onChange={(e) => setCustomFrequency(e.target.value)} style={selectStyle}>
                    {CARE_TASK_FREQUENCIES.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Instructions (optional)…"
                  style={{ ...inputStyle, marginTop: 8 }}
                />
              </div>
            </div>
            <div style={modalActionsStyle}>
              <button type="button" style={secondaryBtnStyle} onClick={() => setAddOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" style={addBtnStyle} onClick={handleAdd} disabled={busy || pickedCount === 0}>
                {busy ? 'Saving…' : `Add ${pickedCount || ''} task${pickedCount === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <div style={backdropStyle} onClick={() => !busy && setEditTarget(null)}>
          <div style={{ ...modalStyle, maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitleStyle}>Edit task</h2>
            {editTarget.catalogKey ? (
              <p style={modalSubStyle}>{editTarget.name}</p>
            ) : (
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} style={inputStyle} />
            )}
            <label style={fieldLabelStyle}>Frequency</label>
            <select value={editFrequency} onChange={(e) => setEditFrequency(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
              {CARE_TASK_FREQUENCIES.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
              {!CARE_TASK_FREQUENCIES.includes(editFrequency as (typeof CARE_TASK_FREQUENCIES)[number]) && (
                <option value={editFrequency}>{editFrequency}</option>
              )}
            </select>
            <label style={fieldLabelStyle}>Instructions</label>
            <input type="text" value={editInstructions} onChange={(e) => setEditInstructions(e.target.value)} style={inputStyle} placeholder="Optional…" />
            {editTarget.approvedAt != null && (
              <p style={editWarnStyle}>Editing clears this task&apos;s RN approval; it returns to pending review.</p>
            )}
            <div style={modalActionsStyle}>
              <button type="button" style={secondaryBtnStyle} onClick={() => setEditTarget(null)} disabled={busy}>Cancel</button>
              <button type="button" style={addBtnStyle} onClick={handleEdit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Discontinue modal */}
      {dcTarget && (
        <div style={backdropStyle} onClick={() => !busy && setDcTarget(null)}>
          <div style={{ ...modalStyle, maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitleStyle}>Discontinue task</h2>
            <p style={modalSubStyle}>{dcTarget.name}</p>
            <label style={fieldLabelStyle}>Reason *</label>
            <input
              type="text"
              value={dcReason}
              onChange={(e) => setDcReason(e.target.value)}
              style={inputStyle}
              placeholder="e.g. No longer ordered, condition resolved…"
            />
            <div style={modalActionsStyle}>
              <button type="button" style={secondaryBtnStyle} onClick={() => setDcTarget(null)} disabled={busy}>Cancel</button>
              <button type="button" style={dangerBtnStyle} onClick={handleDiscontinue} disabled={busy || !dcReason.trim()}>
                {busy ? 'Saving…' : 'Discontinue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const NAVY = '#1a3a5c';
const GREEN = '#0e7c4a';
const containerStyle: React.CSSProperties = { maxWidth: 860, margin: '0 auto', padding: 20 };
const backStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#4a7cf7', textDecoration: 'none', marginBottom: 10 };
const headerStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 };
const titleStyle: React.CSSProperties = { fontSize: 22, color: NAVY, margin: 0 };
const subStyle: React.CSSProperties = { fontSize: 13.5, color: '#64748b', margin: '4px 0 0' };
const pendingBannerStyle: React.CSSProperties = { color: '#b45309', fontWeight: 600 };
const addBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: GREEN, color: 'white', border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' };
const approveBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: NAVY, color: 'white', border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' };
const secondaryBtnStyle: React.CSSProperties = { padding: '9px 14px', background: 'white', color: '#374151', border: '1px solid #d0d7de', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' };
const dangerBtnStyle: React.CSSProperties = { padding: '9px 14px', background: '#c62828', color: 'white', border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' };
const errorStyle: React.CSSProperties = { padding: '10px 12px', background: '#fff5f5', border: '1px solid #f5c6c6', color: '#c62828', borderRadius: 8, fontSize: 13.5, marginBottom: 12 };
const emptyStyle: React.CSSProperties = { padding: '28px 16px', textAlign: 'center', color: '#7f8c8d', fontSize: 14, background: 'white', border: '1px solid #e5e7eb', borderRadius: 10 };
const groupTitleStyle: React.CSSProperties = { fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6, color: '#64748b', margin: '0 0 6px' };
const listStyle: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 };
const taskRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '12px 14px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 10 };
const taskNameStyle: React.CSSProperties = { fontWeight: 600, fontSize: 14.5, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const taskMetaStyle: React.CSSProperties = { fontSize: 12.5, color: '#7f8c8d', marginTop: 3 };
const skilledChipStyle: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#eef4fb', color: NAVY, border: '1px solid #c8def5', whiteSpace: 'nowrap' };
const anyChipStyle: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#f1f5f1', color: '#3d6b47', border: '1px solid #d5e5d8', whiteSpace: 'nowrap' };
const approvedChipStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: GREEN };
const pendingChipStyle: React.CSSProperties = { display: 'inline-block', fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#fdf3e7', color: '#b45309', border: '1px solid #f0d9b8' };
const iconBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, background: 'white', border: '1px solid #d0d7de', borderRadius: 7, color: '#374151', cursor: 'pointer' };
const approveOneBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, height: 30, padding: '0 10px', background: 'white', border: `1px solid ${NAVY}`, borderRadius: 7, color: NAVY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const iconBtnDangerStyle: React.CSSProperties = { ...iconBtnStyle, color: '#c62828', borderColor: '#f5c6c6' };
const dcSummaryStyle: React.CSSProperties = { cursor: 'pointer', fontSize: 13.5, color: '#64748b', marginBottom: 8 };
const backdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 };
const modalStyle: React.CSSProperties = { background: 'white', borderRadius: 12, padding: 20, width: '100%', maxWidth: 620, maxHeight: '86vh', display: 'flex', flexDirection: 'column' };
const modalTitleStyle: React.CSSProperties = { fontSize: 18, color: NAVY, margin: '0 0 4px' };
const modalSubStyle: React.CSSProperties = { fontSize: 13, color: '#64748b', margin: '0 0 12px' };
const catalogScrollStyle: React.CSSProperties = { overflowY: 'auto', flex: 1, paddingRight: 4 };
const catalogCatStyle: React.CSSProperties = { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748b', fontWeight: 700, margin: '0 0 6px' };
const catalogTaskStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px', fontSize: 13.5, color: '#1f2937', cursor: 'pointer' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' };
const selectStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #d0d7de', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: 'white' };
const fieldLabelStyle: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: '#374151', margin: '12px 0 5px' };
const editWarnStyle: React.CSSProperties = { fontSize: 12.5, color: '#b45309', margin: '10px 0 0' };
const modalActionsStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 };
