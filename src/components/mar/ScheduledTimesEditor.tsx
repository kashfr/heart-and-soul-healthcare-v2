'use client';

import type { CSSProperties } from 'react';
import { btn, btnDanger, btnIcon, btnSm } from '@/components/buttons';
import { Plus, X } from 'lucide-react';
import { TIME_ANCHORS, anchorDefaultTime } from '@/lib/marShared';
import { withSelectChevron } from '@/lib/selectChevron';

interface Props {
  /** 'HH:MM' per row; '' while a row is still blank. */
  times: string[];
  /** Meal anchor per row, parallel to `times`; '' = a plain clock time. */
  anchors: string[];
  onChange: (times: string[], anchors: string[]) => void;
}

/**
 * The scheduled-times rows shared by all three medication order forms. Each
 * row is a clock time, optionally tied to a meal ("Before Breakfast"). A meal
 * is not a clock time, so the row keeps both: the anchor is what the nurse
 * reads on the MAR, and the time (this client's usual time for that meal) is
 * what the due / late reminders and shift checks run on.
 */
export default function ScheduledTimesEditor({ times, anchors, onChange }: Props) {
  const anchorAt = (i: number) => anchors[i] || '';

  const setTime = (i: number, value: string) =>
    onChange(
      times.map((t, idx) => (idx === i ? value : t)),
      times.map((_, idx) => anchorAt(idx)),
    );

  const setAnchor = (i: number, value: string) => {
    const previous = anchorAt(i);
    const current = times[i] || '';
    // Move the clock to the new anchor's usual time only while the row still
    // holds a default (blank, the form's 08:00 starter, or the previous
    // anchor's own default). A time someone typed is never overwritten.
    const stillDefault =
      !current || current === anchorDefaultTime(previous) || (!previous && current === '08:00');
    const nextTime = value && stillDefault ? anchorDefaultTime(value) : current;
    onChange(
      times.map((t, idx) => (idx === i ? nextTime : t)),
      times.map((_, idx) => (idx === i ? value : anchorAt(idx))),
    );
  };

  const addRow = () => onChange([...times, ''], [...times.map((_, idx) => anchorAt(idx)), '']);
  const removeRow = (i: number) =>
    onChange(
      times.filter((_, idx) => idx !== i),
      times.map((_, idx) => anchorAt(idx)).filter((_, idx) => idx !== i),
    );

  const anyAnchor = times.some((_, i) => !!anchorAt(i));

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {times.map((t, i) => (
          <div key={i} style={row}>
            <select
              value={anchorAt(i)}
              onChange={(e) => setAnchor(i, e.target.value)}
              style={anchorSelect}
              aria-label={`Scheduled time ${i + 1}: when`}
            >
              <option value="">Clock Time</option>
              {TIME_ANCHORS.map((a) => (
                <option key={a.label} value={a.label}>
                  {a.label}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={t}
              onChange={(e) => setTime(i, e.target.value)}
              style={timeInput}
              aria-label={`Scheduled time ${i + 1}: clock time`}
            />
            {times.length > 1 && (
              <button type="button" onClick={() => removeRow(i)} className={`${btnDanger} ${btnIcon} ${btnSm}`} aria-label="Remove time" title="Remove time">
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={addRow} className={`${btn} ${btnSm}`} style={{ marginTop: 8 }}>
        <Plus size={13} /> Add Time
      </button>
      {anyAnchor && (
        <div style={hint}>
          Set each meal&apos;s clock time to when this client usually eats (or goes to bed). The MAR shows
          the meal with the time, and uses the time for due and late reminders.
        </div>
      )}
    </div>
  );
}

const input: CSSProperties = { padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', height: 38 };
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const anchorSelect: CSSProperties = { ...withSelectChevron(input), width: 190, maxWidth: '100%' };
const timeInput: CSSProperties = { ...input, width: 140 };
const hint: CSSProperties = { fontSize: 11.5, color: '#8a949e', lineHeight: 1.4, marginTop: 6 };
