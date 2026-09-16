'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Clock, PhoneCall, Plus } from 'lucide-react';
import { useSettings } from '@/components/SettingsProvider';
import { getVerbalOrdersForPatient, type VerbalOrder } from '@/lib/verbalOrders';
import { verbalOrderStatusLabel, verbalOrderUrgency } from '@/lib/verbalOrderShared';
import { formatDateUS } from '@/lib/dateFormat';

function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Client dashboard (Overview): this client's verbal orders and their signature status. */
export default function VerbalOrdersSection({ patientId, canTake }: { patientId: string; canTake: boolean }) {
  const { settings } = useSettings();
  const [items, setItems] = useState<VerbalOrder[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getVerbalOrdersForPatient(patientId, 20)
      .then((list) => {
        if (!cancelled) {
          setItems(list);
          setError(false);
        }
      })
      .catch((err) => {
        console.error('Verbal orders load failed:', err);
        if (!cancelled) {
          setError(true);
          setItems([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const today = todayISO();
  const open = (items || []).filter((o) => o.status !== 'signed');

  return (
    <section style={cardStyle}>
      <div style={headerRowStyle}>
        <div style={titleStyle}>
          <PhoneCall size={16} /> Verbal orders
          {open.length > 0 && <span style={countChipStyle}>{open.length} awaiting signature</span>}
        </div>
        {canTake && (
          <Link href={`/admin/verbal-orders/new?patient=${encodeURIComponent(patientId)}`} style={addBtnStyle}>
            <Plus size={14} /> Take verbal order
          </Link>
        )}
      </div>
      {items === null ? (
        <div style={emptyStyle}>Loading…</div>
      ) : error ? (
        <div style={errorRowStyle}><AlertTriangle size={14} /> Verbal orders couldn&apos;t be loaded.</div>
      ) : items.length === 0 ? (
        <div style={emptyStyle}>No verbal orders on file. When a physician gives an order by phone, take it here so the signed copy is tracked automatically.</div>
      ) : (
        <ul style={listStyle}>
          {items.map((o) => {
            const u = verbalOrderUrgency(o, today, settings.verbalOrders);
            const failed = o.status !== 'signed' && o.fax?.sentStatus === 'Failed';
            return (
              <li key={o.id} style={{ ...rowStyle, borderLeftColor: u === 'signed' ? '#27ae60' : failed || u === 'escalated' ? '#b3261e' : u === 'overdue' ? '#e0a100' : '#1a3a5c' }}>
                <div style={rowHeadStyle}>
                  {u === 'signed' ? (
                    <span style={chipSignedStyle}><Check size={11} /> Signed {formatDateUS(o.signed?.signedDate || '')}</span>
                  ) : (
                    <span style={failed || u === 'escalated' ? chipDangerStyle : u === 'overdue' ? chipWarnStyle : chipOpenStyle}>
                      {failed || u !== 'open' ? <AlertTriangle size={11} /> : <Clock size={11} />} {u === 'overdue' ? 'Overdue' : u === 'escalated' ? 'Escalated' : verbalOrderStatusLabel(o)}
                    </span>
                  )}
                  <span style={metaStyle}>{o.physicianName} · taken {formatDateUS(o.takenDate)} by {o.nurseName}{o.marMedName ? ` · MAR: ${o.marMedName}` : ''}</span>
                  <Link href={`/admin/verbal-orders?vo=${o.id}`} style={openLinkStyle}>Open</Link>
                </div>
                <div style={textStyle}>{o.orderText}</div>
              </li>
            );
          })}
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
const rowHeadStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 };
const metaStyle: CSSProperties = { fontSize: 12, color: '#5c6b7a', flex: 1, minWidth: 0 };
const openLinkStyle: CSSProperties = { fontSize: 12.5, fontWeight: 700, color: NAVY, textDecoration: 'none' };
const textStyle: CSSProperties = { fontSize: 13.5, color: '#1f2937', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };
const chip = (bg: string, fg: string): CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, background: bg, color: fg, fontSize: 11.5, fontWeight: 700 });
const chipSignedStyle = chip('#e6f6ec', '#1e7a44');
const chipOpenStyle = chip('#e8eef4', NAVY);
const chipWarnStyle = chip('#fff4e0', '#9a5b00');
const chipDangerStyle = chip('#fdeaea', '#b3261e');
const countChipStyle = chip('#fff4e0', '#9a5b00');
const errorRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: '#fdeaea', color: '#b3261e', borderRadius: 8, fontSize: 13, fontWeight: 600 };
