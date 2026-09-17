'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, Clock, Download, Plus, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { useAuth, useEffectiveUser } from '@/components/AuthProvider';
import { useSettings } from '@/components/SettingsProvider';
import { fetchMedErrorPdf, getAllMedErrors, getMyMedErrors, markIncidentReportFiled, reviewMedErrorReport, type MedErrorReport } from '@/lib/medErrors';
import { effectiveIncidentRequired, isSubstantiveText } from '@/lib/medErrorShared';
import { formatLocalDateTimeUS, medErrorHarmLabel, medErrorOutcomeLabel, medErrorResponsibleLabel, medErrorTypeLabel } from '@/lib/medErrorShared';
import { formatDateUS } from '@/lib/dateFormat';

/**
 * /admin/med-errors
 * Staff and the RN reviewer: every report, open ones first, with the review
 * form. Nurses and aides: the reports they filed and their review status.
 */
export default function MedErrorsPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const { user } = useAuth();
  const { uid: effectiveUid, role, credential, isViewingAs } = useEffectiveUser();
  const { settings } = useSettings();
  const highlightId = useSearchParams().get('r');
  const isStaff = role === 'admin' || role === 'supervisor';
  const isReviewer = isStaff || credential === 'RN' || (!!effectiveUid && settings.corrections.reviewerUid === effectiveUid);
  const uid = role === 'nurse' ? effectiveUid || '' : user?.uid || '';

  const [reports, setReports] = useState<MedErrorReport[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [reloadKey, setReloadKey] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  // The deep link (?r=) opens that report once it has loaded; a manual Open
  // sets openId directly. Derived, so no state is written inside an effect.
  const [dismissedDeepLink, setDismissedDeepLink] = useState(false);
  const openReport = useMemo(() => {
    const id = openId ?? (dismissedDeepLink ? null : highlightId);
    return id && reports ? reports.find((x) => x.id === id) || null : null;
  }, [openId, dismissedDeepLink, highlightId, reports]);
  const setOpenReport = (r: MedErrorReport | null) => {
    if (!r) setDismissedDeepLink(true);
    setOpenId(r ? r.id : null);
  };
  const [toast, setToast] = useState('');
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!role || !uid) return;
    let cancelled = false;
    (async () => {
      try {
        const list = isReviewer ? await getAllMedErrors() : await getMyMedErrors(uid);
        if (cancelled) return;
        setReports(list);
        setError(false);
      } catch (err) {
        console.error('Med errors load failed:', err);
        if (cancelled) return;
        setError(true);
        setReports([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, uid, isReviewer, reloadKey]);

  const visible = useMemo(() => {
    if (!reports) return [];
    return filter === 'all' ? reports : reports.filter((r) => r.status !== 'reviewed');
  }, [reports, filter]);
  const openCount = reports ? reports.filter((r) => r.status !== 'reviewed').length : 0;
  const incidentOpen = reports ? reports.filter((r) => effectiveIncidentRequired(r) && !(r.review?.incidentReportFiledDate)).length : 0;

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 3500);
  };
  const download = async (r: MedErrorReport) => {
    try {
      const url = URL.createObjectURL(await fetchMedErrorPdf(r.id));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      showToast('The PDF could not be loaded.');
    }
  };

  if (!role || role === 'va') return null;

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <p style={kickerStyle}>Quality and safety</p>
            <h1 style={titleStyle}>Medication errors</h1>
            <p style={subtitleStyle}>
              {isReviewer ? 'Every reported medication error, its nursing review, and whether a DBHDD incident report is owed.' : 'The medication error reports you have filed and where their review stands.'}
            </p>
          </div>
          {!isViewingAs && (isStaff || !!credential) && (
            <Link href="/admin/med-errors/new" style={primaryLinkStyle}><Plus size={15} /> Report an error</Link>
          )}
        </header>

        {toast && <div style={toastStyle}>{toast}</div>}

        <section style={cardStyle}>
          <div style={{ ...sectionTitleStyle, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ShieldAlert size={16} /> {isStaff ? 'Reports' : 'My reports'}
              {openCount > 0 && <span style={countChipStyle}>{openCount} awaiting review</span>}
              {isStaff && incidentOpen > 0 && <span style={countChipDangerStyle}>{incidentOpen} incident report{incidentOpen === 1 ? '' : 's'} owed</span>}
            </span>
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <button type="button" style={filter === 'open' ? filterActiveStyle : filterBtnStyle} onClick={() => setFilter('open')}>Awaiting review</button>
              <button type="button" style={filter === 'all' ? filterActiveStyle : filterBtnStyle} onClick={() => setFilter('all')}>All</button>
              <button type="button" style={filterBtnStyle} onClick={reload} title="Refresh"><RefreshCw size={13} /></button>
            </span>
          </div>
          {reports === null ? (
            <div style={mutedStyle}>Loading…</div>
          ) : error ? (
            <div style={errRowStyle}><AlertTriangle size={14} /> Reports couldn&apos;t be loaded. <button type="button" style={retryBtnStyle} onClick={reload}>Retry</button></div>
          ) : visible.length === 0 ? (
            <div style={mutedStyle}>{filter === 'open' ? 'Every report has been reviewed.' : 'No medication error reports on file.'}</div>
          ) : (
            <ul style={listStyle}>
              {visible.map((r) => (
                <li key={r.id} id={`me-${r.id}`} style={{ ...rowStyle, borderLeftColor: r.status === 'reviewed' ? '#27ae60' : effectiveIncidentRequired(r) ? '#b3261e' : '#e0a100', ...(r.id === highlightId ? hotStyle : null) }}>
                  <div style={rowHeadStyle}>
                    {r.status === 'reviewed' ? <span style={chipSignedStyle}><Check size={11} /> Reviewed</span> : <span style={chipWarnStyle}><Clock size={11} /> Awaiting review</span>}
                    {effectiveIncidentRequired(r) && <span style={chipDangerStyle}><ShieldAlert size={11} /> {r.review?.incidentReportFiledDate ? `Incident report filed ${formatDateUS(r.review.incidentReportFiledDate)}` : 'Incident report required'}</span>}
                    <Link href={`/admin/clients/${r.patientId}`} style={clientLinkStyle}>{r.patientName}</Link>
                    <span style={metaStyle}>{medErrorTypeLabel(r.errorType)} · {r.medName} · discovered {formatLocalDateTimeUS(r.discoveredAt)} · reported by {r.reporterName}</span>
                  </div>
                  <div style={textStyle}>{r.description.length > 240 ? `${r.description.slice(0, 240)}…` : r.description}</div>
                  <div style={actionsRowStyle}>
                    <button type="button" style={smallBtnStyle} onClick={() => setOpenReport(r)}>Open</button>
                    <button type="button" style={smallBtnStyle} onClick={() => void download(r)}><Download size={13} /> Download PDF</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {openReport && (
        <ReportDetail
          report={openReport}
          canReview={isReviewer && !isViewingAs && openReport.status !== 'reviewed' && openReport.reporterId !== (user?.uid || '')}
          canMarkFiled={isStaff && !isViewingAs}
          onDownload={() => void download(openReport)}
          onClose={() => setOpenReport(null)}
          onReviewed={() => {
            setOpenReport(null);
            showToast('Review recorded.');
            reload();
          }}
          onFiled={() => {
            setOpenReport(null);
            showToast('Incident report date recorded.');
            reload();
          }}
        />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={detailLabelStyle}>{label}</div>
      <div style={detailValueStyle}>{value || '-'}</div>
    </div>
  );
}
function notifText(n: { notified: boolean; name: string; at: string }): string {
  return n.notified ? `${n.name || 'Yes'}${n.at ? `, ${formatLocalDateTimeUS(n.at)}` : ''}` : 'Not notified';
}

function ReportDetail({ report: r, canReview, canMarkFiled, onClose, onReviewed, onFiled, onDownload }: { report: MedErrorReport; canReview: boolean; canMarkFiled: boolean; onClose: () => void; onReviewed: () => void; onFiled: () => void; onDownload: () => void }) {
  const [findings, setFindings] = useState('');
  const [filedLater, setFiledLater] = useState('');
  const [filingBusy, setFilingBusy] = useState(false);
  const markFiled = async () => {
    if (!filedLater) return;
    setFilingBusy(true);
    const res = await markIncidentReportFiled(r.id, filedLater);
    setFilingBusy(false);
    if (!res.ok) {
      setErr(res.error || 'Could not record the date.');
      return;
    }
    onFiled();
  };
  const [rootCause, setRootCause] = useState('');
  const [corrective, setCorrective] = useState('');
  const [incident, setIncident] = useState(r.incidentReportRequired);
  const [filedDate, setFiledDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!isSubstantiveText(findings)) {
      setErr('Findings must say what the review found, in at least a sentence. Placeholders like N/A are not accepted.');
      return;
    }
    if (!isSubstantiveText(corrective)) {
      setErr('Corrective action must say what will change, in at least a sentence. If no action is needed, say why.');
      return;
    }
    setBusy(true);
    setErr('');
    const res = await reviewMedErrorReport(r.id, { findings, rootCause, correctiveAction: corrective, incidentReportRequired: incident, incidentReportFiledDate: incident ? filedDate : '' });
    if (!res.ok) {
      setErr(res.error || 'The review could not be saved.');
      setBusy(false);
      return;
    }
    onReviewed();
  };

  return (
    <div style={backdropStyle} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div style={sheetStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <div style={sheetTitleStyle}>Medication error report</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <button type="button" style={smallBtnStyle} onClick={onDownload} title="Opens the report as a PDF for the binder or an incident packet"><Download size={13} /> Download PDF</button>
            <button type="button" onClick={onClose} style={closeBtnStyle} aria-label="Close" disabled={busy}><X size={16} /></button>
          </div>
        </div>
        <div style={detailGridStyle}>
          <Field label="Client" value={r.patientName} />
          <Field label="Reported by" value={`${r.reporterName}${r.reporterCredential ? `, ${r.reporterCredential}` : ''}`} />
          <Field label="Discovered" value={formatLocalDateTimeUS(r.discoveredAt)} />
          <Field label="Occurred" value={r.occurredAt ? `${formatLocalDateTimeUS(r.occurredAt)}${r.occurredApprox ? ' (approx.)' : ''}` : 'Unknown'} />
          <Field label="Medication" value={`${r.medName}${r.route ? `, ${r.route}` : ''}`} />
          <Field label="Ordered / given" value={`${r.doseOrdered || '-'} / ${r.doseGiven || '-'}`} />
          <Field label="Type" value={medErrorTypeLabel(r.errorType)} />
          <Field label="Dose outcome" value={medErrorOutcomeLabel(r.doseOutcome)} />
          <Field label="Administered by" value={`${medErrorResponsibleLabel(r.responsibleType)}${r.responsibleName ? `: ${r.responsibleName}` : ''}`} />
          <Field label="Effect on client" value={medErrorHarmLabel(r.harm)} />
          <Field label="Physician" value={notifText(r.physician)} />
          <Field label="Family / guardian" value={notifText(r.guardian)} />
          <Field label="Supervisor" value={notifText(r.supervisor)} />
        </div>
        <div style={detailLabelStyle}>What happened</div>
        <div style={detailTextStyle}>{r.description}</div>
        <div style={detailLabelStyle}>Client condition</div>
        <div style={detailTextStyle}>{r.clientCondition}</div>
        <div style={detailLabelStyle}>Actions taken</div>
        <div style={detailTextStyle}>{r.actionsTaken}</div>
        {r.marAdministrationId && <div style={{ ...mutedStyle, marginBottom: 8 }}>Linked to a charted MAR dose. <Link href={`/admin/records/${r.patientId}/mar`} style={{ color: NAVY }}>Open the MAR</Link></div>}

        {r.review ? (
          <div style={reviewBoxStyle}>
            <div style={{ fontWeight: 700, color: '#1e7a44', marginBottom: 6 }}><Check size={13} style={{ verticalAlign: -2 }} /> Reviewed by {r.review.reviewerName}{r.review.reviewerCredential ? `, ${r.review.reviewerCredential}` : ''}{r.review.reviewedAt ? ` on ${new Date(r.review.reviewedAt).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}` : ''}</div>
            <div style={detailLabelStyle}>Findings</div>
            <div style={detailTextStyle}>{r.review.findings}</div>
            <div style={detailLabelStyle}>Root cause</div>
            <div style={detailTextStyle}>{r.review.rootCause || '-'}</div>
            <div style={detailLabelStyle}>Corrective action</div>
            <div style={detailTextStyle}>{r.review.correctiveAction}</div>
            <div style={detailLabelStyle}>DBHDD incident report</div>
            <div style={detailTextStyle}>{r.review.incidentReportRequired ? (r.review.incidentReportFiledDate ? `Required; filed ${formatDateUS(r.review.incidentReportFiledDate)}` : 'Required; not yet filed') : 'Not required'}{r.incidentReportRequired !== r.review.incidentReportRequired ? ` (flagged ${r.incidentReportRequired ? 'required' : 'not required'} automatically at filing; changed by the reviewer)` : ''}</div>
            {canMarkFiled && r.review.incidentReportRequired && !r.review.incidentReportFiledDate && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                {err && <div style={{ ...errBoxStyle, width: '100%' }}>{err}</div>}
                <label style={{ ...fieldStyle, marginBottom: 0 }}><span style={labelStyle}>Incident report filed on</span><input type="date" value={filedLater} onChange={(e) => setFiledLater(e.target.value)} style={{ ...inputStyle, maxWidth: 200 }} disabled={filingBusy} /></label>
                <button type="button" style={{ ...saveBtnStyle, opacity: !filedLater || filingBusy ? 0.55 : 1 }} disabled={!filedLater || filingBusy} onClick={() => void markFiled()}>{filingBusy ? 'Saving…' : 'Record filing date'}</button>
              </div>
            )}
          </div>
        ) : canReview ? (
          <div style={reviewBoxStyle}>
            <div style={{ fontWeight: 700, color: NAVY, marginBottom: 8 }}>Nursing review</div>
            {err && <div style={errBoxStyle}>{err}</div>}
            <label style={fieldStyle}><span style={labelStyle}>Findings *</span><textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={3} style={textareaStyle} placeholder="What the review established: what was ordered, what happened, and why. Example: 'Mother gave a second 500 mg dose from the bottle at 8:15 AM, not realizing the organizer dose had been given at 8:00.'" disabled={busy} /></label>
            <label style={fieldStyle}><span style={labelStyle}>Root cause</span><textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} rows={2} style={textareaStyle} disabled={busy} /></label>
            <label style={fieldStyle}><span style={labelStyle}>Corrective action *</span><textarea value={corrective} onChange={(e) => setCorrective(e.target.value)} rows={2} style={textareaStyle} placeholder="What changes so it does not recur. Example: 'Family re-instructed to give only from the organizer; nurse to verify the organizer at each visit.'" disabled={busy} /></label>
            <label style={checkRowStyle}><input type="checkbox" checked={incident} onChange={(e) => setIncident(e.target.checked)} disabled={busy} /><span><strong>DBHDD incident report required.</strong> {r.incidentReportRequired ? 'Flagged automatically from the harm level or error type; uncheck only with the reason in your findings.' : 'Check if your review finds this meets the reporting criteria.'}</span></label>
            {incident && (
              <label style={{ ...fieldStyle, marginTop: 8 }}><span style={labelStyle}>Incident report filed on (leave blank if not yet)</span><input type="date" value={filedDate} onChange={(e) => setFiledDate(e.target.value)} style={{ ...inputStyle, maxWidth: 200 }} disabled={busy} /></label>
            )}
            <div style={actionsStyle}>
              <button type="button" style={cancelBtnStyle} onClick={onClose} disabled={busy}>Close</button>
              <button type="button" style={{ ...saveBtnStyle, opacity: busy ? 0.6 : 1 }} onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Record review'}</button>
            </div>
          </div>
        ) : (
          <div style={{ ...mutedStyle, marginTop: 10 }}>{r.status === 'reviewed' ? '' : 'Awaiting nursing review.'}</div>
        )}
      </div>
    </div>
  );
}

const NAVY = '#1a3a5c';
const containerStyle: CSSProperties = { minHeight: '70vh', background: '#f5f7fa', padding: '32px 20px' };
const wrapStyle: CSSProperties = { maxWidth: 1000, margin: '0 auto' };
const kickerStyle: CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#27ae60', margin: 0 };
const titleStyle: CSSProperties = { fontSize: 30, color: '#2c3e50', margin: '4px 0 0' };
const subtitleStyle: CSSProperties = { color: '#7f8c8d', fontSize: 14.5, marginTop: 6, lineHeight: 1.5, maxWidth: 720 };
const cardStyle: CSSProperties = { background: 'white', borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 12, padding: '16px 18px', marginBottom: 16 };
const sectionTitleStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 12 };
const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 };
const rowStyle: CSSProperties = { background: 'white', borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb', borderLeftWidth: 4, borderRadius: 10, padding: '12px 14px' };
const hotStyle: CSSProperties = { boxShadow: '0 0 0 3px rgba(26,58,92,0.25)' };
const rowHeadStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 };
const clientLinkStyle: CSSProperties = { fontWeight: 700, color: NAVY, textDecoration: 'none', fontSize: 14 };
const metaStyle: CSSProperties = { fontSize: 12.5, color: '#5c6b7a' };
const textStyle: CSSProperties = { fontSize: 14, color: '#1f2937', lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };
const actionsRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 };
const smallBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f1f5f9', color: NAVY, borderWidth: 1, borderStyle: 'solid', borderColor: '#e2e8f0', padding: '6px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const chip = (bg: string, fg: string): CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, background: bg, color: fg, fontSize: 11.5, fontWeight: 700 });
const chipSignedStyle = chip('#e6f6ec', '#1e7a44');
const chipWarnStyle = chip('#fff4e0', '#9a5b00');
const chipDangerStyle = chip('#fdeaea', '#b3261e');
const countChipStyle = chip('#fff4e0', '#9a5b00');
const countChipDangerStyle = chip('#fdeaea', '#b3261e');
const filterBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f1f5f9', color: '#475569', borderWidth: 1, borderStyle: 'solid', borderColor: '#e2e8f0', padding: '5px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const filterActiveStyle: CSSProperties = { ...filterBtnStyle, background: '#e8eef4', color: NAVY, borderColor: NAVY };
const mutedStyle: CSSProperties = { fontSize: 13, color: '#7f8c8d', lineHeight: 1.5 };
const errRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: '#fdeaea', color: '#b3261e', borderRadius: 8, fontSize: 13, fontWeight: 600 };
const retryBtnStyle: CSSProperties = { background: 'white', color: '#b3261e', border: '1px solid #e5b6b1', padding: '4px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' };
const toastStyle: CSSProperties = { background: '#1f2937', color: 'white', padding: '10px 14px', borderRadius: 8, fontSize: 13.5, marginBottom: 14 };
const primaryLinkStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: NAVY, color: 'white', padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: 'none' };
const backdropStyle: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 3200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto' };
const sheetStyle: CSSProperties = { width: '100%', maxWidth: 720, background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' };
const sheetTitleStyle: CSSProperties = { fontWeight: 700, fontSize: 17, color: '#1f2937' };
const closeBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, cursor: 'pointer' };
const detailGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, margin: '10px 0 12px', padding: '10px 12px', background: '#f8fafc', borderRadius: 8 };
const detailLabelStyle: CSSProperties = { fontSize: 10.5, fontWeight: 700, color: '#8a949e', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2, marginTop: 6 };
const detailValueStyle: CSSProperties = { fontSize: 13, color: '#2c3e50', fontWeight: 600 };
const detailTextStyle: CSSProperties = { fontSize: 13.5, color: '#1f2937', lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginBottom: 6 };
const reviewBoxStyle: CSSProperties = { marginTop: 12, padding: '12px 14px', background: '#f6f9fc', border: '1px solid #dbe3ec', borderRadius: 10 };
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, minWidth: 0 };
const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#5c6b7a' };
const inputStyle: CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', height: 38 };
const textareaStyle: CSSProperties = { ...inputStyle, height: 'auto', minHeight: 64, resize: 'vertical', lineHeight: 1.5 };
const checkRowStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#2c3e50', lineHeight: 1.45, cursor: 'pointer' };
const errBoxStyle: CSSProperties = { background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13, marginBottom: 10 };
const actionsStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 };
const cancelBtnStyle: CSSProperties = { background: 'white', color: '#374151', border: '1px solid #d0d7de', padding: '9px 16px', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const saveBtnStyle: CSSProperties = { background: NAVY, color: 'white', border: 'none', padding: '9px 16px', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
