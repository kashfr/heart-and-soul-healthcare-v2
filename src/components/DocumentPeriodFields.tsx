'use client';
import type { CSSProperties } from 'react';
import MonthPicker from './MonthPicker';
import { currentMonth, type DocumentPeriodDraft } from '@/lib/documentPeriod';

/**
 * "Period covered" picker for a client document: none, one calendar month
 * (eligibility, monthly authorizations), or a date range (a certification
 * period, a quarter, a plan year). The caller owns the draft so a bulk
 * upload can copy one draft onto every file; resolvePeriodDraft turns it
 * into the stored ISO pair at submit time.
 */
export default function DocumentPeriodFields({ draft, onChange, name, labelStyle, inputStyle, selectStyle, disabled }: {
  draft: DocumentPeriodDraft;
  onChange: (draft: DocumentPeriodDraft) => void;
  /** Names the file in each control's accessible label when several sets share a form. */
  name?: string;
  labelStyle: CSSProperties;
  inputStyle: CSSProperties;
  selectStyle: CSSProperties;
  disabled?: boolean;
}) {
  const suffix = name ? ` for ${name}` : '';
  return <>
    <label style={labelStyle}>Period covered <select aria-label={`Period covered${suffix}`} style={selectStyle} disabled={disabled} value={draft.mode} onChange={(e) => {
      const mode = e.target.value as DocumentPeriodDraft['mode'];
      onChange({ ...draft, mode, month: mode === 'month' && !draft.month ? currentMonth() : draft.month });
    }}>
      <option value="none">Not tied to a period</option>
      <option value="month">One month</option>
      <option value="range">Date range</option>
    </select></label>
    {draft.mode === 'month' && <span style={labelStyle}>Month covered <MonthPicker label={`Month covered${suffix}`} value={draft.month} onChange={(month) => onChange({ ...draft, month })} style={{ ...selectStyle, ...(disabled ? { pointerEvents: 'none', opacity: 0.6 } : null) }} /></span>}
    {draft.mode === 'range' && <>
      <label style={labelStyle}>Period start (MM/DD/YYYY) <input aria-label={`Period start${suffix}`} type="text" placeholder="MM/DD/YYYY" inputMode="numeric" style={inputStyle} disabled={disabled} value={draft.from} onChange={(e) => onChange({ ...draft, from: e.target.value })} /></label>{' '}
      <label style={labelStyle}>Period end (MM/DD/YYYY) <input aria-label={`Period end${suffix}`} type="text" placeholder="MM/DD/YYYY" inputMode="numeric" style={inputStyle} disabled={disabled} value={draft.to} onChange={(e) => onChange({ ...draft, to: e.target.value })} /></label>
    </>}
  </>;
}
