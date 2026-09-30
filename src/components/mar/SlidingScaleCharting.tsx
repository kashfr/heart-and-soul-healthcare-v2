'use client';

import type { CSSProperties } from 'react';
import {
  GLUCOSE_UNIT,
  HYPOGLYCEMIA_THRESHOLD,
  formatScaleRange,
  formatScaleUnits,
  lookupScaleDose,
  type ScaleChartingEntry,
  type ScaleChartingField,
  type SlidingScaleRow,
} from '@/lib/slidingScale';
import SlidingScaleTable from './SlidingScaleTable';

interface Props {
  rows: SlidingScaleRow[];
  /** '' until the nurse picks Given / Held / Refused. */
  status: string;
  entry: ScaleChartingEntry;
  onChange: (patch: Partial<ScaleChartingEntry>) => void;
  errors?: Partial<Record<ScaleChartingField, string>>;
  /** DOM id for each field's wrapper, so a blocked save can scroll to it. */
  fieldId?: (k: ScaleChartingField) => string;
  /** Someone other than the documenting nurse gave the dose. */
  givenByOther?: boolean;
}

/**
 * The sliding-scale block on a dose-charting surface (the MAR grid's dose form
 * and the progress note's dose card). The nurse types the meter reading; the
 * dose is looked up from the order's scale and shown back to her, so she never
 * reads the table by eye. An amount that differs from the scale can still be
 * recorded, but only with the amount and the reason.
 */
export default function SlidingScaleCharting({ rows, status, entry, onChange, errors, fieldId, givenByOther }: Props) {
  const lookup = lookupScaleDose(rows, entry.glucoseReading);
  const row = lookup.row;
  const e = errors || {};
  const errStyle = (k: ScaleChartingField): CSSProperties =>
    e[k] ? { border: '1px solid #b3261e', boxShadow: '0 0 0 3px rgba(179,38,30,0.12)' } : {};

  return (
    <div style={box}>
      <div style={title}>Sliding Scale: Check Blood Glucose First</div>
      <SlidingScaleTable rows={rows} activeRow={row} />

      <label id={fieldId?.('glucoseReading')} style={{ ...field, marginTop: 10 }}>
        <span style={fieldLabel}>
          Blood glucose reading ({GLUCOSE_UNIT}){status === 'given' || !status ? ' *' : ''}
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={entry.glucoseReading}
          onChange={(ev) => onChange({ glucoseReading: ev.target.value.replace(/[^\d]/g, '').slice(0, 3) })}
          style={{ ...input, maxWidth: 160, ...errStyle('glucoseReading') }}
          placeholder="e.g., 182"
          aria-label="Blood glucose reading"
        />
        {e.glucoseReading && <span style={errText} role="alert">{e.glucoseReading}</span>}
      </label>

      {lookup.low && (
        <div style={lowAlert} role="alert">
          <strong>Low blood sugar.</strong> {lookup.reading} {GLUCOSE_UNIT} is below {HYPOGLYCEMIA_THRESHOLD}. Follow
          this client&apos;s low blood sugar orders and notify the prescriber.
        </div>
      )}

      {row && (
        <div style={row.units === 0 ? resultNone : resultGive} role="status">
          <div style={resultMain}>
            {row.units === 0
              ? `No insulin at this reading (${formatScaleRange(row)} ${GLUCOSE_UNIT}).`
              : `Give ${formatScaleUnits(row.units)} (${formatScaleRange(row)} ${GLUCOSE_UNIT}).`}
          </div>
          {row.instruction && <div style={resultInstruction}>The order also says: {row.instruction}</div>}
          {row.units === 0 && (
            <div style={resultSub}>
              Choose &quot;No Insulin Due&quot; to record the check. It saves the reading with 0 units given.
            </div>
          )}
        </div>
      )}

      {status === 'given' && row && (
        <div style={{ marginTop: 10 }}>
          {!entry.customDose && (
            <div style={givenLine}>
              Units {givenByOther ? 'given' : 'you gave'}: <strong>{formatScaleUnits(row.units)}</strong> (from the scale)
            </div>
          )}
          <label style={checkRow}>
            <input
              type="checkbox"
              checked={entry.customDose}
              onChange={(ev) => onChange({ customDose: ev.target.checked })}
              style={{ marginTop: 2 }}
            />
            <span style={{ fontSize: 12.5, color: '#5c6b7a', lineHeight: 1.4 }}>
              A different amount was actually given.
            </span>
          </label>
          {entry.customDose && (
            <>
              <label id={fieldId?.('unitsGiven')} style={{ ...field, marginTop: 8 }}>
                <span style={fieldLabel}>Units actually given *</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={entry.unitsGiven}
                  onChange={(ev) => onChange({ unitsGiven: ev.target.value.replace(/[^\d.]/g, '').slice(0, 5) })}
                  style={{ ...input, maxWidth: 160, ...errStyle('unitsGiven') }}
                  aria-label="Units actually given"
                />
                {e.unitsGiven && <span style={errText} role="alert">{e.unitsGiven}</span>}
              </label>
              <label id={fieldId?.('deviationReason')} style={{ ...field, marginTop: 8 }}>
                <span style={fieldLabel}>Why the amount differs from the scale *</span>
                <input
                  type="text"
                  value={entry.deviationReason}
                  onChange={(ev) => onChange({ deviationReason: ev.target.value })}
                  style={{ ...input, ...errStyle('deviationReason') }}
                  placeholder="e.g., physician gave a one-time order by phone"
                  aria-label="Why the amount differs from the scale"
                />
                {e.deviationReason && <span style={errText} role="alert">{e.deviationReason}</span>}
              </label>
              <div style={deviationNote}>
                An amount that does not match the scale, without a physician&apos;s order for it, is a
                medication error and needs a medication error report.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const box: CSSProperties = { background: '#f5f9fe', border: '1px solid #c8def5', borderRadius: 8, padding: '10px 12px', marginTop: 8, marginBottom: 12 };
const title: CSSProperties = { fontSize: 11, fontWeight: 700, color: '#1a3a5c', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 };
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 };
const fieldLabel: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#5c6b7a' };
const input: CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', height: 38, background: 'white' };
const errText: CSSProperties = { fontSize: 12, color: '#b3261e', lineHeight: 1.4 };
const lowAlert: CSSProperties = { marginTop: 8, background: '#fdeaea', border: '1px solid #b3261e', color: '#7f1d1d', borderRadius: 8, padding: '9px 11px', fontSize: 13, lineHeight: 1.45 };
const resultBase: CSSProperties = { marginTop: 8, borderRadius: 8, padding: '9px 11px', lineHeight: 1.45 };
const resultGive: CSSProperties = { ...resultBase, background: '#e8f4e8', border: '1px solid #9bd19b', color: '#14532d' };
const resultNone: CSSProperties = { ...resultBase, background: '#f1f3f5', border: '1px solid #d0d7de', color: '#1f2937' };
const resultMain: CSSProperties = { fontSize: 15, fontWeight: 700 };
const resultInstruction: CSSProperties = { fontSize: 13, fontWeight: 700, color: '#b3261e', marginTop: 3 };
const resultSub: CSSProperties = { fontSize: 12.5, marginTop: 3 };
const givenLine: CSSProperties = { fontSize: 13.5, color: '#1f2937' };
const checkRow: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 6, cursor: 'pointer' };
const deviationNote: CSSProperties = { marginTop: 6, fontSize: 12, color: '#8a5a0d', lineHeight: 1.4 };
