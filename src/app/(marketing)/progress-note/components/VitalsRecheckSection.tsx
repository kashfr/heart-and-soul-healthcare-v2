'use client';

import { useMemo, type CSSProperties } from 'react';
import type { UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import type { FormValues } from '../types';
import styles from '../page.module.css';
import { rangeValidator, VITAL_RANGE as RANGE } from '../validators';
import { getVitalRanges } from '@/lib/vitalRanges';
import {
  MAX_VITALS_RECHECKS,
  VITALS_RECHECK_CONTEXTS,
  VITALS_RECHECK_COUNT_KEY,
  VITALS_RECHECK_KEYS,
  readVitalsRechecks,
  recheckAbnormalVitals,
  vitalsRecheckFieldKey,
  type VitalsRecheckField,
} from '@/lib/vitalsRecheck';

interface Props {
  register: UseFormRegister<FormValues>;
  watch: UseFormWatch<FormValues>;
  setValue: UseFormSetValue<FormValues>;
  ageStr: string;
  dob?: string;
}

const alertInputStyle: CSSProperties = { border: '2px solid #c62828', background: '#fff5f5' };
const alertLabelStyle: CSSProperties = { color: '#c62828' };

/**
 * Later readings in the same shift ("Vitals rechecks"), under the first set
 * of vitals on Page 2. One numbered block per reading (q16r_reading{n}_*),
 * every field an ordinary form value, so drafts, resume, edit mode,
 * amendments, and the PDF need no new plumbing. A reading is partial by
 * design: time plus whichever vitals were retaken. Abnormal values light up
 * red exactly like the first set. The either/or rules (at least one vital,
 * both BP numbers) live in vitalsRecheckGaps, enforced by the submit handler.
 */
export default function VitalsRecheckSection({ register, watch, setValue, ageStr, dob }: Props) {
  const count = Math.max(0, Math.min(MAX_VITALS_RECHECKS, Number(watch(VITALS_RECHECK_COUNT_KEY)) || 0));
  const allValues = watch();
  const entries = useMemo(() => readVitalsRechecks(allValues as Record<string, unknown>), [allValues]);
  const ranges = useMemo(() => getVitalRanges(ageStr || '', dob), [ageStr, dob]);

  const addReading = () => {
    if (count >= MAX_VITALS_RECHECKS) return;
    setValue(VITALS_RECHECK_COUNT_KEY, String(count + 1), { shouldDirty: true });
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
  };

  return (
    <div id="q16r_readingList" style={{ marginTop: 14 }}>
      {/* Hidden count field keeps the number of blocks in the form values. */}
      <input type="hidden" {...register(VITALS_RECHECK_COUNT_KEY)} />

      <div className={styles.subsec} style={{ marginBottom: 2 }}>Vitals rechecks</div>
      <p style={helper}>
        Took any vitals again later in the shift (for example, retook a high pulse after rest)?
        Add each later reading here with the time and what the client was doing. Enter only the vitals you retook.
      </p>

      {entries.map((e) => {
        const k = (f: VitalsRecheckField) => vitalsRecheckFieldKey(e.index, f);
        const abnormal = recheckAbnormalVitals(e, ranges);
        const bad = (key: keyof typeof abnormal) => key in abnormal;
        const bpBad = bad('systolic') || bad('diastolic');
        return (
          <div key={e.index} style={card}>
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

            <div className={styles.row}>
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
            </div>

            <div className={styles.row}>
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
            </div>

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
        <button type="button" onClick={addReading} style={addBtn}>
          + Add {entries.length === 0 ? 'a later vitals reading' : 'another vitals reading'}
        </button>
      )}
    </div>
  );
}

const helper: CSSProperties = { fontSize: 12.5, color: '#5c6b7a', margin: '4px 0 8px' };
const card: CSSProperties = { border: '1px solid #d9e2ec', borderRadius: 8, padding: '10px 12px', margin: '10px 0', background: '#fbfcfe' };
const cardHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 };
const removeBtn: CSSProperties = { marginLeft: 'auto', background: 'none', border: '1px solid #d0d7de', borderRadius: 6, padding: '3px 9px', fontSize: 12, cursor: 'pointer', color: '#5c6b7a' };
const addBtn: CSSProperties = { background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 6 };
