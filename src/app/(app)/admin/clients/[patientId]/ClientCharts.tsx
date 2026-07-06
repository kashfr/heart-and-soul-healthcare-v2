'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getVitalRanges, type VitalRangesOverride } from '@/lib/vitalRanges';
import {
  notesInWindow,
  shiftISO,
  vitalSeries,
  weeklyBuckets,
  weeklyMedBuckets,
  type DashAdmin,
  type DashboardNote,
} from '@/lib/clientDashboardShared';

const NAVY = '#1a3a5c';
const GREEN = '#0e7c4a';
const AMBER = '#b56a17';
const RED = '#c0392b';
const GRAY_GRID = '#e5e7eb';
const BAND_FILL = '#0e7c4a';

type Metric = 'bp' | 'pulse' | 'spo2' | 'temp' | 'resp' | 'pain';

const METRICS: Array<{ key: Metric; label: string }> = [
  { key: 'bp', label: 'Blood pressure' },
  { key: 'pulse', label: 'Pulse' },
  { key: 'spo2', label: 'SpO2' },
  { key: 'temp', label: 'Temperature' },
  { key: 'resp', label: 'Respirations' },
  { key: 'pain', label: 'Pain' },
];

function shortDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  notes: DashboardNote[];
  admins: DashAdmin[];
  dob?: string;
  vitalsOverride?: VitalRangesOverride;
}

/**
 * The dashboard's trend charts (phase 2): vitals with the age-aware normal
 * range shaded behind the line, weekly medication administration, and weekly
 * visits + care hours. Pure presentation — every series comes pre-parsed and
 * bounds-guarded from clientDashboardShared.
 */
export default function ClientCharts({ notes, admins, dob, vitalsOverride }: Props) {
  const [metric, setMetric] = useState<Metric>('bp');
  const [rangeDays, setRangeDays] = useState<30 | 90>(90);
  const today = todayISO();

  // Age-aware normal ranges (admin overrides applied) drive the shaded band.
  const ranges = useMemo(() => getVitalRanges('', dob, vitalsOverride), [dob, vitalsOverride]);

  const points = useMemo(() => {
    const start = shiftISO(today, -(rangeDays - 1));
    return vitalSeries(notesInWindow(notes, start, today)).map((p) => ({ ...p, x: shortDate(p.dateISO) }));
  }, [notes, rangeDays, today]);

  const medWeeks = useMemo(
    () => weeklyMedBuckets(admins, 12, today).map((b) => ({ ...b, x: shortDate(b.weekStartISO) })),
    [admins, today],
  );
  const anyMeds = medWeeks.some((w) => w.given + w.held + w.refused > 0);

  const visitWeeks = useMemo(
    () => weeklyBuckets(notes, 12, today).map((b) => ({ ...b, x: shortDate(b.weekStartISO), hours: Math.round(b.hours * 10) / 10 })),
    [notes, today],
  );
  const anyVisits = visitWeeks.some((w) => w.visits > 0);

  // Band + line config for the selected vitals metric.
  const cfg = useMemo(() => {
    switch (metric) {
      case 'bp':
        return {
          lines: [
            { key: 'sys', name: 'Systolic', color: NAVY },
            { key: 'dia', name: 'Diastolic', color: '#5b8bb5' },
          ],
          bands: [
            { low: ranges.systolic.low, high: ranges.systolic.high },
            { low: ranges.diastolic.low, high: ranges.diastolic.high },
          ],
          unit: 'mmHg',
          cap: undefined as number | undefined,
        };
      case 'pulse':
        return { lines: [{ key: 'pulse', name: 'Pulse', color: NAVY }], bands: [{ low: ranges.pulse.low, high: ranges.pulse.high }], unit: 'bpm', cap: undefined as number | undefined };
      case 'spo2':
        // Hard axis cap: an SpO2 axis reading past 100% would display an
        // impossible value range above the normal band.
        return { lines: [{ key: 'spo2', name: 'SpO2', color: NAVY }], bands: [{ low: ranges.oxygenSaturation.low, high: ranges.oxygenSaturation.high }], unit: '%', cap: 100 as number | undefined };
      case 'temp':
        return { lines: [{ key: 'temp', name: 'Temperature', color: NAVY }], bands: [{ low: ranges.temperature.low, high: ranges.temperature.high }], unit: '°F', cap: undefined as number | undefined };
      case 'resp':
        return { lines: [{ key: 'resp', name: 'Respirations', color: NAVY }], bands: [{ low: ranges.respiration.low, high: ranges.respiration.high }], unit: '/min', cap: undefined as number | undefined };
      case 'pain':
        return { lines: [{ key: 'pain', name: 'Pain score', color: AMBER }], bands: [], unit: '/10', cap: 10 as number | undefined };
    }
  }, [metric, ranges]);

  const hasMetricData = points.some((p) => cfg.lines.some((l) => p[l.key as keyof typeof p] !== undefined));
  const bandLow = cfg.bands.length ? Math.min(...cfg.bands.map((b) => b.low)) : undefined;
  const bandHigh = cfg.bands.length ? Math.max(...cfg.bands.map((b) => b.high)) : undefined;

  return (
    <div>
      {/* Vitals trend */}
      <div style={chartBlockStyle}>
        <div style={chartHeadStyle}>
          <div style={chartTitleStyle}>Vitals trend</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {METRICS.map((m) => (
              <button key={m.key} type="button" onClick={() => setMetric(m.key)} style={metric === m.key ? chipActiveStyle : chipStyle}>
                {m.label}
              </button>
            ))}
            <span style={{ width: 10 }} />
            {([30, 90] as const).map((d) => (
              <button key={d} type="button" onClick={() => setRangeDays(d)} style={rangeDays === d ? chipActiveStyle : chipStyle}>
                {d}d
              </button>
            ))}
          </div>
        </div>
        {!hasMetricData ? (
          <div style={chartEmptyStyle}>No {METRICS.find((m) => m.key === metric)?.label.toLowerCase()} readings in the last {rangeDays} days.</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
                <CartesianGrid stroke={GRAY_GRID} strokeDasharray="3 3" />
                <XAxis dataKey="x" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  domain={[
                    (dataMin: number) => Math.floor(Math.min(dataMin, bandLow ?? dataMin) * 0.97),
                    (dataMax: number) => {
                      const padded = Math.ceil(Math.max(dataMax, bandHigh ?? dataMax) * 1.03);
                      return cfg.cap !== undefined ? Math.min(cfg.cap, padded) : padded;
                    },
                  ]}
                />
                {/* Pass the series name through, or recharts drops the label and a
                    BP tooltip shows two unlabeled rows (systolic vs diastolic
                    distinguishable only by color). Single-line charts stay name-less. */}
                <Tooltip
                  formatter={(v, name) => [`${v} ${cfg.unit}`, cfg.lines.length > 1 ? name : undefined]}
                  labelStyle={{ fontSize: 12 }}
                  itemStyle={{ fontSize: 12 }}
                />
                {cfg.lines.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
                {cfg.bands.map((b, i) => (
                  <ReferenceArea key={i} y1={b.low} y2={b.high} fill={BAND_FILL} fillOpacity={0.08} stroke={BAND_FILL} strokeOpacity={0.18} />
                ))}
                {cfg.lines.map((l) => (
                  <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
            {cfg.bands.length > 0 && (
              <div style={bandNoteStyle}>
                Shaded band = normal range for this client&apos;s age group
                {/* Default settings ship an EMPTY override object — truthiness
                    alone would claim agency thresholds on every install. */}
                {vitalsOverride && Object.keys(vitalsOverride).length > 0 ? ' (agency thresholds applied)' : ''}.
              </div>
            )}
          </>
        )}
      </div>

      {/* Medication administration */}
      <div style={chartBlockStyle}>
        <div style={chartHeadStyle}>
          <div style={chartTitleStyle}>Medication administration · weekly (12 weeks)</div>
        </div>
        {!anyMeds ? (
          <div style={chartEmptyStyle}>No doses documented in the last 12 weeks.</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={medWeeks} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
              <CartesianGrid stroke={GRAY_GRID} strokeDasharray="3 3" />
              <XAxis dataKey="x" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip labelStyle={{ fontSize: 12 }} itemStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="given" name="Given" stackId="m" fill={GREEN} isAnimationActive={false} />
              <Bar dataKey="held" name="Held" stackId="m" fill={AMBER} isAnimationActive={false} />
              <Bar dataKey="refused" name="Refused" stackId="m" fill={RED} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Visits + hours */}
      <div style={{ ...chartBlockStyle, marginBottom: 0 }}>
        <div style={chartHeadStyle}>
          <div style={chartTitleStyle}>Visits &amp; care hours · weekly (12 weeks)</div>
        </div>
        {!anyVisits ? (
          <div style={chartEmptyStyle}>No visits documented in the last 12 weeks.</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={visitWeeks} margin={{ top: 8, right: 4, bottom: 0, left: -14 }}>
              <CartesianGrid stroke={GRAY_GRID} strokeDasharray="3 3" />
              <XAxis dataKey="x" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="visits" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="hours" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip labelStyle={{ fontSize: 12 }} itemStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="visits" dataKey="visits" name="Visits" fill={NAVY} isAnimationActive={false} barSize={18} />
              <Line yAxisId="hours" type="monotone" dataKey="hours" name="Hours" stroke={GREEN} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

const chartBlockStyle: React.CSSProperties = { marginBottom: 22 };
const chartHeadStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 };
const chartTitleStyle: React.CSSProperties = { fontSize: 13.5, fontWeight: 700, color: '#2c3e50' };
const chipStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: 999, border: '1px solid #d0d7de', background: 'white', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const chipActiveStyle: React.CSSProperties = { ...chipStyle, background: NAVY, color: 'white', border: `1px solid ${NAVY}` };
const chartEmptyStyle: React.CSSProperties = { padding: '22px 0', color: '#7f8c8d', fontSize: 13, textAlign: 'center', background: '#f8fafc', borderRadius: 8 };
const bandNoteStyle: React.CSSProperties = { fontSize: 11.5, color: '#8a949e', marginTop: 4 };
