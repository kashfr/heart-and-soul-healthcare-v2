'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import type { FormValues } from '../types';
import styles from '../page.module.css';
import { rangeValidator, VITAL_RANGE as RANGE } from '../validators';
import { noteVitalRanges, readNoteBaselines } from '@/lib/vitalRanges';
import { baselineCoversGroup } from '@/lib/vitalsBaselines';
import {
  MAX_VITALS_RECHECKS,
  VITALS_RECHECK_CONTEXTS,
  VITALS_RECHECK_COUNT_KEY,
  VITALS_RECHECK_KEYS,
  readVitalsRechecks,
  recheckAbnormalVitals,
  vitalsRecheckFieldKey,
  type VitalsRecheck,
  type VitalsRecheckField,
} from '@/lib/vitalsRecheck';
import {
  assessVitalsFollowUp,
  firstSetValueText,
  recheckCovers,
  vitalsFollowUpApplies,
  FOLLOW_UP_ACTION_KEY,
  FOLLOW_UP_ACTIONS,
  FOLLOW_UP_BASELINE,
  FOLLOW_UP_NOTE_KEY,
  FOLLOW_UP_TIME_KEY,
  MIN_RECHECK_GAP_MINUTES,
  VITAL_GROUPS,
  VITAL_GROUP_LABELS,
  type VitalGroup,
} from '@/lib/vitalsFollowUp';

interface Props {
  register: UseFormRegister<FormValues>;
  watch: UseFormWatch<FormValues>;
  setValue: UseFormSetValue<FormValues>;
}

const alertInputStyle: CSSProperties = { border: '2px solid #c62828', background: '#fff5f5' };
const alertLabelStyle: CSSProperties = { color: '#c62828' };

/** The form fields each vital group owns on a recheck block. */
const GROUP_FIELDS: Record<VitalGroup, VitalsRecheckField[]> = {
  temperature: ['temperature', 'temperatureRoute'],
  bloodPressure: ['systolic', 'diastolic', 'bpMethod', 'bpSite'],
  pulse: ['pulse', 'pulseSite'],
  respiration: ['respiration'],
  oxygenSaturation: ['oxygenSaturation', 'oxygenSource'],
};

/**
 * Later readings in the same shift ("Vitals rechecks"), under the first set
 * of vitals on Page 2. One numbered block per reading (q16r_reading{n}_*),
 * every field an ordinary form value, so drafts, resume, edit mode,
 * amendments, and the PDF need no new plumbing.
 *
 * A reading is partial by design: the nurse picks WHICH vitals she retook
 * (chips on the block) and only those inputs appear, so retaking a pulse is
 * one box, not five. When a first-set vital is out of range, the section
 * says so, offers a one-click recheck for exactly that vital, and, if the
 * recheck is still out of range, asks what was done about it. The rules
 * live in src/lib/vitalsFollowUp.ts and are enforced at submit.
 */
export default function VitalsRecheckSection({ register, watch, setValue }: Props) {
  const count = Math.max(0, Math.min(MAX_VITALS_RECHECKS, Number(watch(VITALS_RECHECK_COUNT_KEY)) || 0));
  const allValues = watch();
  const entries = useMemo(() => readVitalsRechecks(allValues as Record<string, unknown>), [allValues]);
  // Age range (from the note's own q5/q4 fields) plus this note's baseline
  // snapshot (q16b_*), see vitalRanges.ts.
  const ranges = useMemo(() => noteVitalRanges(allValues as Record<string, unknown>), [allValues]);
  const noteBaselines = useMemo(() => readNoteBaselines(allValues as Record<string, unknown>), [allValues]);
  const followUp = useMemo(() => assessVitalsFollowUp(allValues as Record<string, unknown>, ranges), [allValues, ranges]);
  const gateOn = vitalsFollowUpApplies(allValues as Record<string, unknown>);
  const abnormalGroups = VITAL_GROUPS.filter((g) => followUp.abnormal[g]);

  // Which vitals each block shows. A block always shows the groups that
  // carry a value (resume, edit); this state adds the ones the nurse chose
  // but has not typed into yet.
  const [chosen, setChosen] = useState<Record<number, VitalGroup[]>>({});
  const shownGroups = (e: VitalsRecheck): VitalGroup[] =>
    VITAL_GROUPS.filter((g) => (chosen[e.index] || []).includes(g) || GROUP_FIELDS[g].some((f) => e[f] !== ''));

  const addReading = (preselect: VitalGroup[] = []) => {
    if (count >= MAX_VITALS_RECHECKS) return;
    const index = count + 1;
    setChosen((prev) => ({ ...prev, [index]: preselect }));
    setValue(VITALS_RECHECK_COUNT_KEY, String(index), { shouldDirty: true });
    setTimeout(() => {
      document.getElementById(`q16r_block${index}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }, 50);
  };
  const removeReading = (index: number) => {
    // Shift later blocks down so numbering stays dense (fields are positional).
    for (let i = index; i < count; i += 1) {
      for (const k of VITALS_RECHECK_KEYS) {
        setValue(vitalsRecheckFieldKey(i, k), String(allValues[vitalsRecheckFieldKey(i + 1, k)] ?? ''), { shouldDirty: true });
      }
    }
    for (const k of VITALS_RECHECK_KEYS) setValue(vitalsRecheckFieldKey(count, k), '', { shouldDirty: true });
    setValue(VITALS_RECHECK_COUNT_KEY, String(count - 1), { shouldDirty: true });
    setChosen((prev) => {
      const next: Record<number, VitalGroup[]> = {};
      for (let i = 1; i < index; i += 1) if (prev[i]) next[i] = prev[i];
      for (let i = index; i < count; i += 1) if (prev[i + 1]) next[i] = prev[i + 1];
      return next;
    });
  };
  const toggleGroup = (e: VitalsRecheck, g: VitalGroup) => {
    const on = shownGroups(e).includes(g);
    if (on) {
      for (const f of GROUP_FIELDS[g]) setValue(vitalsRecheckFieldKey(e.index, f), '', { shouldDirty: true });
      setChosen((prev) => ({ ...prev, [e.index]: (prev[e.index] || []).filter((x) => x !== g) }));
    } else {
      setChosen((prev) => ({ ...prev, [e.index]: [...(prev[e.index] || []), g] }));
    }
  };

  // The follow-up action only means something while a vital is still out of
  // range after its recheck; if a later edit brings it back in range, drop
  // the stale answer so it never prints against a normal reading.
  const action = String(allValues[FOLLOW_UP_ACTION_KEY] || '');
  const stillAbnormal = followUp.stillAbnormal;
  useEffect(() => {
    if (stillAbnormal.length === 0 && action) {
      setValue(FOLLOW_UP_ACTION_KEY, '', { shouldDirty: true });
      setValue(FOLLOW_UP_TIME_KEY, '', { shouldDirty: true });
      setValue(FOLLOW_UP_NOTE_KEY, '', { shouldDirty: true });
    }
  }, [stillAbnormal.length, action, setValue]);

  return (
    <div id="q16r_readingList" style={{ marginTop: 14 }}>
      {/* Hidden count field keeps the number of blocks in the form values. */}
      <input type="hidden" {...register(VITALS_RECHECK_COUNT_KEY)} />

      <div className={styles.subsec} style={{ marginBottom: 2 }}>Vitals rechecks</div>
      <p style={helper}>
        Took any vitals again later in the shift? Add each later reading with the time and what the client was doing,
        and enter only the vitals you retook.
      </p>

      {abnormalGroups.length > 0 && (
        <div style={followUp.needsRecheck.length > 0 || followUp.tooSoon.length > 0 ? noticeWarn : noticeOk} role="status">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {followUp.needsRecheck.length > 0 || followUp.tooSoon.length > 0 ? '⚠ Recheck needed' : '✓ Rechecked'}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {abnormalGroups.map((g) => {
              const v = firstSetValueText(allValues as Record<string, unknown>, g);
              const needs = followUp.needsRecheck.includes(g);
              const soon = followUp.tooSoon.find((t) => t.group === g);
              const still = followUp.stillAbnormal.includes(g);
              return (
                <li key={g} style={{ margin: '2px 0' }}>
                  <strong>{VITAL_GROUP_LABELS[g]}</strong> {v ? `${v} ` : ''}is {followUp.abnormal[g]} for this client&apos;s age.{' '}
                  {needs && `Retake it after at least ${MIN_RECHECK_GAP_MINUTES} minutes of rest and add the reading below.`}
                  {soon && `Recheck ${soon.index} is less than ${MIN_RECHECK_GAP_MINUTES} minutes after the shift start; check its time, or add a later reading.`}
                  {!needs && !soon && (still ? 'Still out of range on the recheck; document what was done below.' : 'Back in range on the recheck.')}
                </li>
              );
            })}
          </ul>
          {gateOn && followUp.needsRecheck.length > 0 && count < MAX_VITALS_RECHECKS && (
            <button type="button" onClick={() => addReading(followUp.needsRecheck)} style={{ ...addBtn, marginTop: 8 }}>
              + Add a recheck for {followUp.needsRecheck.map((g) => VITAL_GROUP_LABELS[g].toLowerCase()).join(' and ')}
            </button>
          )}
        </div>
      )}

      {entries.map((e) => {
        const k = (f: VitalsRecheckField) => vitalsRecheckFieldKey(e.index, f);
        const abnormal = recheckAbnormalVitals(e, ranges);
        const bad = (key: keyof typeof abnormal) => key in abnormal;
        const bpBad = bad('systolic') || bad('diastolic');
        const groups = shownGroups(e);
        const show = (g: VitalGroup) => groups.includes(g);
        return (
          <div key={e.index} id={`q16r_block${e.index}`} style={card}>
            <div style={cardHead}>
              <strong>Recheck {e.index}</strong>
              {Object.keys(abnormal).length > 0 && (
                <span style={{ color: '#c62828', fontSize: 12, fontWeight: 600 }}>⚠ outside expected range</span>
              )}
              <button type="button" onClick={() => removeReading(e.index)} style={removeBtn} aria-label={`Remove vitals recheck ${e.index}`}>
                Remove
              </button>
            </div>

            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor={k('time')}>Time taken *</label>
                <input className={styles.input} type="time" id={k('time')} required {...register(k('time'))} />
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor={k('context')}>Client was</label>
                <select className={styles.select} id={k('context')} {...register(k('context'))}>
                  <option value="">Select...</option>
                  {VITALS_RECHECK_CONTEXTS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Which vitals were retaken: only those inputs appear. */}
            <div style={{ margin: '2px 0 10px' }}>
              <div className={styles.label} style={{ marginBottom: 6 }}>Vitals retaken *</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="group" aria-label={`Recheck ${e.index} vitals retaken`}>
                {VITAL_GROUPS.map((g) => {
                  const on = show(g);
                  const wanted = followUp.abnormal[g] && !recheckCovers(e, g);
                  return (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleGroup(e, g)}
                      style={{ ...chip, ...(on ? chipOn : null), ...(wanted && !on ? chipWanted : null) }}
                    >
                      {on ? '✓ ' : ''}{VITAL_GROUP_LABELS[g]}
                    </button>
                  );
                })}
              </div>
              {groups.length === 0 && (
                <p style={{ ...helper, color: '#b45309', margin: '6px 0 0' }}>Choose which vitals you retook.</p>
              )}
            </div>

            {(show('temperature') || show('bloodPressure') || show('pulse')) && (
              <div className={styles.row}>
                {show('temperature') && (
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor={k('temperature')} style={bad('temperature') ? alertLabelStyle : undefined}>
                      Temperature (°F) {bad('temperature') && '⚠'}
                    </label>
                    <input
                      className={styles.input}
                      style={bad('temperature') ? alertInputStyle : undefined}
                      type="number"
                      id={k('temperature')}
                      step="0.1"
                      min={RANGE.temperature.min}
                      max={RANGE.temperature.max}
                      {...register(k('temperature'), {
                        validate: rangeValidator(RANGE.temperature.min, RANGE.temperature.max, RANGE.temperature.label),
                      })}
                    />
                    <select
                      className={styles.select}
                      id={k('temperatureRoute')}
                      aria-label={`Recheck ${e.index} temperature route`}
                      style={{ marginTop: 6, fontSize: 13 }}
                      required={e.temperature !== ''}
                      {...register(k('temperatureRoute'))}
                    >
                      <option value="">Route{e.temperature !== '' ? ' *' : ''}&hellip;</option>
                      <option value="Oral">Oral</option>
                      <option value="Axillary">Axillary</option>
                      <option value="Tympanic">Tympanic (ear)</option>
                      <option value="Temporal">Temporal (forehead)</option>
                      <option value="Rectal">Rectal</option>
                    </select>
                  </div>
                )}
                {show('bloodPressure') && (
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor={k('systolic')} style={bpBad ? alertLabelStyle : undefined}>
                      Blood Pressure (mmHg) {bpBad && '⚠'}
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        className={styles.input}
                        style={{ ...(bpBad ? alertInputStyle : undefined), maxWidth: 80, textAlign: 'center' }}
                        type="number"
                        id={k('systolic')}
                        placeholder="120"
                        aria-label={`Recheck ${e.index} systolic`}
                        min={RANGE.systolic.min}
                        max={RANGE.systolic.max}
                        {...register(k('systolic'), {
                          validate: rangeValidator(RANGE.systolic.min, RANGE.systolic.max, RANGE.systolic.label),
                        })}
                      />
                      <span aria-hidden style={{ color: '#666', fontWeight: 600 }}>/</span>
                      <input
                        className={styles.input}
                        style={{ ...(bpBad ? alertInputStyle : undefined), maxWidth: 80, textAlign: 'center' }}
                        type="number"
                        id={k('diastolic')}
                        placeholder="80"
                        aria-label={`Recheck ${e.index} diastolic`}
                        min={RANGE.diastolic.min}
                        max={RANGE.diastolic.max}
                        {...register(k('diastolic'), {
                          validate: rangeValidator(RANGE.diastolic.min, RANGE.diastolic.max, RANGE.diastolic.label),
                        })}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <select className={styles.select} id={k('bpMethod')} aria-label={`Recheck ${e.index} blood pressure method`} style={{ fontSize: 13 }} {...register(k('bpMethod'))}>
                        <option value="">Method&hellip;</option>
                        <option value="Manual (auscultation)">Manual (auscultation)</option>
                        <option value="Automatic (oscillometric)">Automatic (oscillometric)</option>
                      </select>
                      <select className={styles.select} id={k('bpSite')} aria-label={`Recheck ${e.index} blood pressure site`} style={{ fontSize: 13 }} {...register(k('bpSite'))}>
                        <option value="">Site&hellip;</option>
                        <option value="Left arm">Left arm</option>
                        <option value="Right arm">Right arm</option>
                        <option value="Left leg">Left leg</option>
                        <option value="Right leg">Right leg</option>
                      </select>
                    </div>
                  </div>
                )}
                {show('pulse') && (
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor={k('pulse')} style={bad('pulse') ? alertLabelStyle : undefined}>
                      Pulse (bpm) {bad('pulse') && '⚠'}
                    </label>
                    <input
                      className={styles.input}
                      style={bad('pulse') ? alertInputStyle : undefined}
                      type="number"
                      id={k('pulse')}
                      min={RANGE.pulse.min}
                      max={RANGE.pulse.max}
                      {...register(k('pulse'), {
                        validate: rangeValidator(RANGE.pulse.min, RANGE.pulse.max, RANGE.pulse.label),
                      })}
                    />
                    <select className={styles.select} id={k('pulseSite')} aria-label={`Recheck ${e.index} pulse site`} style={{ marginTop: 6, fontSize: 13 }} {...register(k('pulseSite'))}>
                      <option value="">Site&hellip;</option>
                      <option value="Radial">Radial</option>
                      <option value="Apical">Apical</option>
                      <option value="Brachial">Brachial</option>
                      <option value="Carotid">Carotid</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {(show('respiration') || show('oxygenSaturation')) && (
              <div className={styles.row}>
                {show('respiration') && (
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor={k('respiration')} style={bad('respiration') ? alertLabelStyle : undefined}>
                      Respiration (breaths/min) {bad('respiration') && '⚠'}
                    </label>
                    <input
                      className={styles.input}
                      style={bad('respiration') ? alertInputStyle : undefined}
                      type="number"
                      id={k('respiration')}
                      min={RANGE.respiration.min}
                      max={RANGE.respiration.max}
                      {...register(k('respiration'), {
                        validate: rangeValidator(RANGE.respiration.min, RANGE.respiration.max, RANGE.respiration.label),
                      })}
                    />
                  </div>
                )}
                {show('oxygenSaturation') && (
                  <>
                    <div className={styles.f}>
                      <label className={styles.label} htmlFor={k('oxygenSaturation')} style={bad('oxygenSaturation') ? alertLabelStyle : undefined}>
                        O2 Saturation (%) {bad('oxygenSaturation') && '⚠'}
                      </label>
                      <input
                        className={styles.input}
                        style={bad('oxygenSaturation') ? alertInputStyle : undefined}
                        type="number"
                        id={k('oxygenSaturation')}
                        min={0}
                        max={100}
                        {...register(k('oxygenSaturation'), {
                          validate: rangeValidator(RANGE.o2.min, RANGE.o2.max, RANGE.o2.label),
                          onChange: (ev) => {
                            // Same hard physical ceiling as the first set: an SpO2 over 100 is not data.
                            const n = Number(ev.target.value);
                            if (ev.target.value !== '' && Number.isFinite(n) && (n > 100 || n < 0)) {
                              setValue(k('oxygenSaturation'), String(Math.min(100, Math.max(0, n))), { shouldValidate: true, shouldDirty: true });
                            }
                          },
                        })}
                      />
                    </div>
                    <div className={styles.f}>
                      <label className={styles.label} htmlFor={k('oxygenSource')}>
                        Oxygen Source{e.oxygenSaturation !== '' ? ' *' : ''}
                      </label>
                      <select className={styles.select} id={k('oxygenSource')} required={e.oxygenSaturation !== ''} {...register(k('oxygenSource'))}>
                        <option value="">Select...</option>
                        <option value="Room Air">Room Air</option>
                        <option value="Nasal Cannula">Nasal Cannula</option>
                        <option value="Face Mask">Face Mask</option>
                        <option value="Ventilator">Ventilator</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor={k('notes')}>Notes</label>
                <input
                  className={styles.input}
                  type="text"
                  id={k('notes')}
                  placeholder="Why it was retaken and anything relevant (e.g. pulse 102 at 09:00, retaken after 2 hours of rest)"
                  {...register(k('notes'))}
                />
              </div>
            </div>
          </div>
        );
      })}

      {count < MAX_VITALS_RECHECKS && (
        <button type="button" onClick={() => addReading()} style={addBtn}>
          + Add {entries.length === 0 ? 'a later vitals reading' : 'another vitals reading'}
        </button>
      )}

      {/* Still out of range after the recheck: what was done about it. */}
      {stillAbnormal.length > 0 && (
        <div style={followUpCard} id="q16f_followUp">
          <div style={{ fontWeight: 700, color: '#7c2d12', marginBottom: 4 }}>
            Still outside the expected range after recheck: {stillAbnormal.map((g) => VITAL_GROUP_LABELS[g].toLowerCase()).join(', ')}
          </div>
          <p style={{ ...helper, margin: '0 0 8px' }}>
            No need to keep retaking it. Document what you did about it; the RN supervisor reviews this note.
          </p>
          {action === FOLLOW_UP_BASELINE && !stillAbnormal.every((g) => baselineCoversGroup(noteBaselines, g)) && (
            <p style={{ ...helper, color: '#b45309', margin: '0 0 8px' }}>
              No baseline for {stillAbnormal.filter((g) => !baselineCoversGroup(noteBaselines, g)).map((g) => VITAL_GROUP_LABELS[g].toLowerCase()).join(', ')} is
              on this client&apos;s record yet. Say what the baseline is and where it is documented; the supervisor will add it to the client record.
            </p>
          )}
          <div className={styles.row}>
            <div className={styles.f} style={{ flex: '2 1 60%' }}>
              <label className={styles.label} htmlFor={FOLLOW_UP_ACTION_KEY}>Action taken *</label>
              <select className={styles.select} id={FOLLOW_UP_ACTION_KEY} required {...register(FOLLOW_UP_ACTION_KEY)}>
                <option value="">Select...</option>
                {FOLLOW_UP_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            {action && action !== FOLLOW_UP_BASELINE && (
              <div className={styles.f} style={{ flex: '1 1 30%' }}>
                <label className={styles.label} htmlFor={FOLLOW_UP_TIME_KEY}>Time *</label>
                <input className={styles.input} type="time" id={FOLLOW_UP_TIME_KEY} required {...register(FOLLOW_UP_TIME_KEY)} />
              </div>
            )}
          </div>
          <div className={styles.row}>
            <div className={styles.f} style={{ flex: '1 1 100%' }}>
              <label className={styles.label} htmlFor={FOLLOW_UP_NOTE_KEY}>
                {action === FOLLOW_UP_BASELINE ? 'What is the documented baseline? *' : 'Notes'}
              </label>
              <input
                className={styles.input}
                type="text"
                id={FOLLOW_UP_NOTE_KEY}
                required={action === FOLLOW_UP_BASELINE}
                placeholder={
                  action === FOLLOW_UP_BASELINE
                    ? 'e.g. resting pulse 100 to 105 per care plan dated 03/2026'
                    : 'e.g. spoke with Dr. Patel; instructed to continue monitoring and recheck at 16:00'
                }
                {...register(FOLLOW_UP_NOTE_KEY)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const helper: CSSProperties = { fontSize: 12.5, color: '#5c6b7a', margin: '4px 0 8px' };
const card: CSSProperties = { border: '1px solid #d9e2ec', borderRadius: 8, padding: '10px 12px', margin: '10px 0', background: '#fbfcfe' };
const cardHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 };
const removeBtn: CSSProperties = { marginLeft: 'auto', background: 'none', border: '1px solid #d0d7de', borderRadius: 6, padding: '3px 9px', fontSize: 12, cursor: 'pointer', color: '#5c6b7a' };
const addBtn: CSSProperties = { background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 6 };
const noticeWarn: CSSProperties = { background: '#fff7ed', border: '1px solid #f59e0b', color: '#7c2d12', borderRadius: 8, padding: '10px 12px', margin: '6px 0 10px', fontSize: 13.5, lineHeight: 1.5 };
const noticeOk: CSSProperties = { ...noticeWarn, background: '#f0fdf4', border: '1px solid #86efac', color: '#14532d' };
const followUpCard: CSSProperties = { ...noticeWarn, margin: '12px 0 4px' };
const chip: CSSProperties = { border: '1.5px solid #cbd5e1', background: '#fff', color: '#1f3a5f', borderRadius: 999, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.2 };
const chipOn: CSSProperties = { background: '#1a3a5c', borderColor: '#1a3a5c', color: '#fff' };
const chipWanted: CSSProperties = { borderColor: '#f59e0b', background: '#fff7ed', color: '#7c2d12' };
