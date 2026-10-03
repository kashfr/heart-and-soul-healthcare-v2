import type { CSSProperties } from 'react';

/**
 * The three labeled lines of a sliding-scale row on the MAR grid: blood
 * glucose reading, units given, initials. The label stack (beside the
 * medication) and each day's box use the same fixed line height and the same
 * separators, and both are vertically centered in the row, so a label always
 * lines up with its values however tall the order text makes the row.
 */
export const SCALE_LINE_LABELS = ['Blood Glucose (mg/dL)', 'Units Given', 'Initials'] as const;
const LINE_H = 22;
const SEPARATOR = '1px solid rgba(26,58,92,0.18)';

/** One day's box: reading, units given (or Held / Ref), initials. */
export function ScaleLines({ lines }: { lines: [string, string, string] }) {
  return (
    <div>
      {lines.map((text, i) => (
        <div
          key={i}
          style={{
            height: LINE_H,
            lineHeight: `${LINE_H}px`,
            padding: '0 4px',
            borderTop: i === 0 ? undefined : SEPARATOR,
            fontSize: i === 0 ? 11.5 : 10.5,
            fontWeight: i === 0 ? 700 : 600,
          }}
        >
          {text || ' '}
        </div>
      ))}
    </div>
  );
}

/** The label stack shown beside the medication on a sliding-scale row. */
export function ScaleLineLabels() {
  return (
    <div style={stack}>
      {SCALE_LINE_LABELS.map((label, i) => (
        <div key={label} style={i === 0 ? line : { ...line, borderTop: SEPARATOR }}>
          {label}
        </div>
      ))}
    </div>
  );
}

const stack: CSSProperties = { flexShrink: 0, width: 116, borderLeft: '1px solid #c8d3df', borderRight: '1px solid #c8d3df', background: '#e8eef4' };
const line: CSSProperties = { height: LINE_H, lineHeight: `${LINE_H}px`, padding: '0 6px', fontSize: 10, fontWeight: 700, color: '#1a3a5c', whiteSpace: 'nowrap' };
