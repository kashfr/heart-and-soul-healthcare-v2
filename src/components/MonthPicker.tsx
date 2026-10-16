'use client';

import type { CSSProperties } from 'react';
import { withSelectChevron } from '@/lib/selectChevron';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface Props {
  /** ISO month for queries/storage; only the visible controls use US order. */
  value: string;
  onChange: (month: string) => void;
  style?: CSSProperties;
  label?: string;
}

/** Native month inputs fall back to ISO text in Firefox. Explicit selects
 * keep month-before-year presentation consistent in every browser. */
export default function MonthPicker({ value, onChange, style, label = 'Month' }: Props) {
  const selectStyle = withSelectChevron(style || {});
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  const currentYear = new Date().getFullYear();
  const year = match ? Number(match[1]) : currentYear;
  const month = match?.[2] || '';
  const firstYear = Math.min(1900, year);
  const lastYear = Math.max(currentYear + 20, year);
  return (
    <span role="group" aria-label={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <select
        aria-label={label}
        value={month}
        onChange={(e) => onChange(`${year}-${e.target.value}`)}
        style={selectStyle}
      >
        <option value="" disabled>Select month</option>
        {MONTHS.map((name, i) => <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>)}
      </select>
      <select
        aria-label={`${label} year`}
        value={year}
        onChange={(e) => onChange(`${e.target.value}-${month || '01'}`)}
        style={selectStyle}
      >
        {Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i).map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </span>
  );
}
