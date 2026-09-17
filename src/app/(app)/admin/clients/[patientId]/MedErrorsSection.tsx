'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Clock, Plus, ShieldAlert } from 'lucide-react';
import { getMedErrorsForPatient, type MedErrorReport } from '@/lib/medErrors';
import { effectiveIncidentRequired, formatLocalDateTimeUS, medErrorTypeLabel } from '@/lib/medErrorShared';

/** Client dashboard (Overview): this client's medication error reports. */
export default function MedErrorsSection({ patientId, canFile }: { patientId: string; canFile: boolean }) {
  const [items, setItems] = useState<MedErrorReport[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMedErrorsForPatient(patientId, 20)
      .then((list) => {
        if (!cancelled) {
          setItems(list);
          setError(false);
        }
      })
      .catch((err) => {
        console.error('Med errors load failed:', err);
        if (!cancelled) {
          setError(true);
          setItems([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const open = (items || []).filter((r) => r.status !== 'reviewed');

  return (
    <section style={cardStyle}>
      <div style={headerRowStyle}>
        <div style={titleStyle}>
          <ShieldAlert size={16} /> Medication errors
          {open.length > 0 && <span style={countChipStyle}>{open.length} awaiting review</span>}
        </div>
        {canFile && (
          <Link href={`/admin/med-errors/new?patient=${encodeURIComponent(patientId)}`} style={addBtnStyle}><Plus size={14} /> Report an error</Link>
        )}
      </div>
      {items === null ? (
        <div style={emptyStyle}>Loading…</div>
      ) : error ? (
        <div style={errorRowStyle}><AlertTriangle size={14} /> Reports couldn&apos;t be loaded.</div>
      ) : items.length === 0 ? (
        <div style={emptyStyle}>No medication errors reported for this client.</div>
      ) : (
        <ul style={listStyle}>
          {items.map((r) => (
            <li key={r.id} style={{ ...rowStyle, borderLeftColor: r.status === 'reviewed' ? '#27ae60' : effectiveIncidentRequired(r) ? '#b3261e' : '#e0a100' }}>
              <div style={rowHeadStyle}>
                {r.status === 'reviewed' ? <span style={chipSignedStyle}><Check size={11} /> Reviewed</span> : <span style={chipWarnStyle}><Clock size={11} /> Awaiting review</span>}
                {effectiveIncidentRequired(r) && <span style={chipDangerStyle}>Incident report</span>}
                <span style={metaStyle}>{medErrorTypeLabel(r.errorType)} · {r.medName} · {formatLocalDateTimeUS(r.discoveredAt)} · {r.reporterName}</span>
                <Link href={`/admin/med-errors?r=${r.id}`} style={openLinkStyle}>Open</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const NAVY = '#1a3a5c';
const cardStyle: CSSProperties = { background: 'white', borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 12, padding: '16px 18px', marginTop: 16 };
const headerRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 };
const titleStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 15, color: NAVY };
const addBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: NAVY, color: 'white', padding: '7px 13px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' };
const emptyStyle: CSSProperties = { padding: '16px 14px', color: '#7f8c8d', fontSize: 13, background: '#f8fafc', borderRadius: 8, lineHeight: 1.5 };
const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 };
const rowStyle: CSSProperties = { background: 'white', borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb', borderLeftWidth: 4, borderRadius: 10, padding: '10px 12px' };
const rowHeadStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const metaStyle: CSSProperties = { fontSize: 12, color: '#5c6b7a', flex: 1, minWidth: 0 };
const openLinkStyle: CSSProperties = { fontSize: 12.5, fontWeight: 700, color: NAVY, textDecoration: 'none' };
const chip = (bg: string, fg: string): CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, background: bg, color: fg, fontSize: 11.5, fontWeight: 700 });
const chipSignedStyle = chip('#e6f6ec', '#1e7a44');
const chipWarnStyle = chip('#fff4e0', '#9a5b00');
const chipDangerStyle = chip('#fdeaea', '#b3261e');
const countChipStyle = chip('#fff4e0', '#9a5b00');
const errorRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: '#fdeaea', color: '#b3261e', borderRadius: 8, fontSize: 13, fontWeight: 600 };
