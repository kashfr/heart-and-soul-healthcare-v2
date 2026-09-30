'use client';

import type { CSSProperties } from 'react';
import { Plus, X } from 'lucide-react';
import { GLUCOSE_UNIT, type SlidingScaleFormRow } from '@/lib/slidingScale';

interface Props {
  rows: SlidingScaleFormRow[];
  onChange: (rows: SlidingScaleFormRow[]) => void;
  /** Outline the table when the form's validation rejected it. */
  invalid?: boolean;
}

/**
 * The sliding-scale table on the medication order forms. Each row asks only
 * where its range ENDS: it starts one above the row before it and the last
 * row is always "and above", so the ranges cannot overlap or leave a gap and
 * every possible reading lands on exactly one row.
 */
export default function SlidingScaleEditor({ rows, onChange, invalid }: Props) {
  const patch = (i: number, p: Partial<SlidingScaleFormRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  const addRow = () => onChange([...rows, { upTo: '', units: '', instruction: '' }]);
  const removeRow = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  // Where row i starts: 0 for the first, otherwise one above the previous
  // row's end ('?' until that end is typed).
  const startOf = (i: number): string => {
    if (i === 0) return '0';
    const prev = rows[i - 1].upTo.trim();
    return /^\d+$/.test(prev) ? String(Number(prev) + 1) : '?';
  };

  return (
    <div style={invalid ? { ...box, border: '1px solid #b3261e', boxShadow: '0 0 0 3px rgba(179,38,30,0.12)' } : box}>
      <div style={headRow}>
        <span style={{ ...headCell, width: RANGE_W }}>Blood glucose ({GLUCOSE_UNIT})</span>
        <span style={{ ...headCell, width: UNITS_W }}>Give</span>
        <span style={{ ...headCell, flex: 1, minWidth: 120 }}>Also do (optional)</span>
      </div>
      {rows.map((r, i) => {
        const last = i === rows.length - 1;
        return (
          <div key={i} style={row}>
            <div style={{ ...cell, width: RANGE_W }}>
              <span style={fromText}>{startOf(i)}</span>
              {last ? (
                <span style={muted}>and above</span>
              ) : (
                <>
                  <span style={muted}>to</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={r.upTo}
                    onChange={(e) => patch(i, { upTo: e.target.value.replace(/[^\d]/g, '').slice(0, 3) })}
                    style={numInput}
                    aria-label={`Range ${i + 1}: blood glucose up to`}
                    placeholder="to"
                  />
                </>
              )}
            </div>
            <div style={{ ...cell, width: UNITS_W }}>
              <input
                type="text"
                inputMode="decimal"
                value={r.units}
                onChange={(e) => patch(i, { units: e.target.value.replace(/[^\d.]/g, '').slice(0, 5) })}
                style={numInput}
                aria-label={`Range ${i + 1}: units to give`}
              />
              <span style={muted}>units</span>
            </div>
            <div style={{ ...cell, flex: 1, minWidth: 120 }}>
              <input
                type="text"
                value={r.instruction}
                onChange={(e) => patch(i, { instruction: e.target.value })}
                style={textInput}
                aria-label={`Range ${i + 1}: other instruction`}
                placeholder={i === 0 ? 'e.g., Treat low blood sugar, call the physician' : last ? 'e.g., Call the physician' : ''}
              />
              {rows.length > 2 && (
                <button type="button" onClick={() => removeRow(i)} style={removeBtn} aria-label={`Remove range ${i + 1}`}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        );
      })}
      <button type="button" onClick={addRow} style={addBtn}>
        <Plus size={13} /> Add Range
      </button>
      <div style={hint}>
        Copy the scale exactly as the physician wrote it. Enter 0 units where the order gives no
        insulin. The ranges shown are only a common starting layout: change them to match the order.
        If bedtime uses a different scale, add it as a second medication with its own bedtime time.
      </div>
    </div>
  );
}

const RANGE_W = 168;
const UNITS_W = 104;
const box: CSSProperties = { border: '1px solid #d0d7de', borderRadius: 8, padding: 10, background: '#fafbfc' };
const headRow: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 };
const headCell: CSSProperties = { fontSize: 11, fontWeight: 700, color: '#5c6b7a', textTransform: 'uppercase', letterSpacing: 0.3 };
const row: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '5px 0', borderTop: '1px solid #eef1f4' };
const cell: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 };
const fromText: CSSProperties = { fontSize: 14, fontWeight: 700, color: '#1a3a5c', minWidth: 30, textAlign: 'right' };
const muted: CSSProperties = { fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' };
const inputBase: CSSProperties = { padding: '7px 9px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', height: 34, background: 'white' };
const numInput: CSSProperties = { ...inputBase, width: 58, textAlign: 'center' };
const textInput: CSSProperties = { ...inputBase, flex: 1, minWidth: 0, width: '100%' };
const removeBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#c44', border: 'none', padding: 4, borderRadius: 4, cursor: 'pointer', flexShrink: 0 };
const addBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'white', color: '#0e7c4a', border: '1px dashed #0e7c4a', padding: '6px 11px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 8 };
const hint: CSSProperties = { fontSize: 11.5, color: '#8a949e', lineHeight: 1.45, marginTop: 8 };
