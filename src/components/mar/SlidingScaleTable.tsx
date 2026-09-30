import type { CSSProperties } from 'react';
import {
  GLUCOSE_UNIT,
  formatScaleRange,
  formatScaleUnits,
  type SlidingScaleRow,
} from '@/lib/slidingScale';

interface Props {
  rows: SlidingScaleRow[];
  /** The row the current reading falls on, highlighted. */
  activeRow?: SlidingScaleRow | null;
}

/** The order's sliding scale, read-only: one line per blood glucose range. */
export default function SlidingScaleTable({ rows, activeRow }: Props) {
  return (
    <table style={table}>
      <thead>
        <tr>
          <th style={th}>Blood Glucose ({GLUCOSE_UNIT})</th>
          <th style={th}>Give</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const active = !!activeRow && activeRow.min === r.min;
          return (
            <tr key={r.min} style={active ? activeTr : undefined}>
              <td style={active ? { ...td, fontWeight: 700 } : td}>{formatScaleRange(r)}</td>
              <td style={active ? { ...td, fontWeight: 700 } : td}>
                {formatScaleUnits(r.units)}
                {r.instruction ? <span style={instruction}> · {r.instruction}</span> : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const table: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const th: CSSProperties = { textAlign: 'left', padding: '4px 8px', fontSize: 10.5, fontWeight: 700, color: '#1a3a5c', textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid #c8def5' };
const td: CSSProperties = { padding: '4px 8px', borderBottom: '1px solid #e3eefb', color: '#1f2937', verticalAlign: 'top' };
const activeTr: CSSProperties = { background: '#d8efd8' };
const instruction: CSSProperties = { color: '#b3261e', fontWeight: 600 };
