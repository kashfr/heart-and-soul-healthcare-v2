'use client';

/**
 * Vital signs entry shared by the note forms. One place for the conventions
 * every note follows so the dashboard, PDF, abnormal-vitals banner, and
 * vitals trends read them all the same way:
 *
 *  - the shift note's field keys (q16_temperature + q16_temperatureRoute,
 *    q17_systolic / q17_diastolic mirrored into the legacy "S/D" string
 *    q17_bloodPressure, q18_pulse, q19_respiration, q20_oxygenSaturation);
 *  - the typo-guard ranges from validators.ts on every input;
 *  - age-appropriate abnormal highlighting from src/lib/vitalRanges.
 *
 * `fields` picks which vitals a form asks for (the supervisory visit records
 * temperature, BP, and pulse; the shift note records all five). Errors come
 * through `errorFor` so a host can use RHF validation, its own submit-time
 * escort messages, or both.
 */

import { useEffect } from 'react';
import type { UseFormRegister, UseFormWatch, UseFormSetValue } from 'react-hook-form';
import type { FormValues } from '../types';
import styles from '../page.module.css';
import { rangeValidator, VITAL_RANGE as RANGE } from '../validators';
import { checkVitalRange, getAgeGroupLabel, type VitalKey } from '@/lib/vitalRanges';

export type VitalField = 'temperature' | 'bloodPressure' | 'pulse' | 'respiration' | 'oxygenSaturation';

export const ALL_VITAL_FIELDS: VitalField[] = ['temperature', 'bloodPressure', 'pulse', 'respiration', 'oxygenSaturation'];

/** Field keys a set of vitals writes, for hosts that build required-field rules. */
export const VITAL_FIELD_KEYS: Record<VitalField, string[]> = {
  temperature: ['q16_temperature', 'q16_temperatureRoute'],
  bloodPressure: ['q17_systolic', 'q17_diastolic', 'q17_bloodPressure'],
  pulse: ['q18_pulse'],
  respiration: ['q19_respiration'],
  oxygenSaturation: ['q20_oxygenSaturation'],
};

const alertInputStyle: React.CSSProperties = { border: '2px solid #c62828', background: '#fff5f5' };
const alertLabelStyle: React.CSSProperties = { color: '#c62828' };
const noteStyle: React.CSSProperties = { fontSize: 12, color: '#c62828', marginTop: 4, fontWeight: 500 };
const errorStyle: React.CSSProperties = { display: 'block', marginTop: 4, color: '#c62828', fontSize: 12, fontWeight: 500 };

interface Props {
  register: UseFormRegister<FormValues>;
  watch: UseFormWatch<FormValues>;
  setValue: UseFormSetValue<FormValues>;
  /** Client age ("41" / "3 months") and DOB drive the normal ranges. */
  ageStr?: string;
  dob?: string;
  fields?: VitalField[];
  /** Show the required marker on each vital. */
  required?: boolean;
  /** Message to show under a field, keyed by field key (q16_temperature, q17_systolic, …). */
  errorFor?: (key: string) => string | undefined;
}

export default function VitalSignsFields({
  register,
  watch,
  setValue,
  ageStr = '',
  dob,
  fields = ALL_VITAL_FIELDS,
  required = false,
  errorFor,
}: Props) {
  const show = (f: VitalField) => fields.includes(f);
  const star = required ? ' *' : '';
  const ageGroup = getAgeGroupLabel(ageStr, dob);

  const temp = watch('q16_temperature');
  const sys = watch('q17_systolic');
  const dia = watch('q17_diastolic');
  const pulse = watch('q18_pulse');
  const resp = watch('q19_respiration');
  const o2 = watch('q20_oxygenSaturation');

  // Keep the legacy "S/D" string in sync with the two numeric inputs.
  useEffect(() => {
    if (!show('bloodPressure')) return;
    const joined = sys || dia ? `${sys || ''}/${dia || ''}` : '';
    if (watch('q17_bloodPressure') !== joined) setValue('q17_bloodPressure', joined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sys, dia, setValue]);

  /** 'low' | 'high' | null for one reading, against the client's age group. */
  const status = (key: VitalKey, raw: string | undefined): 'low' | 'high' | null => {
    const n = parseFloat(String(raw ?? ''));
    if (Number.isNaN(n)) return null;
    const s = checkVitalRange(key, n, ageStr, dob);
    return s === 'normal' ? null : s;
  };
  const tempStatus = status('temperature', temp);
  const sysStatus = status('systolic', sys);
  const diaStatus = status('diastolic', dia);
  const pulseStatus = status('pulse', pulse);
  const respStatus = status('respiration', resp);
  const o2Status = status('oxygenSaturation', o2);
  const bpStatus = sysStatus || diaStatus;

  const Err = ({ k }: { k: string }) => {
    const m = errorFor?.(k);
    return m ? <span role="alert" style={errorStyle}>{m}</span> : null;
  };
  const Note = ({ s, what }: { s: 'low' | 'high' | null; what: string }) =>
    s ? <div style={noteStyle}>{what} is {s} for {ageGroup}.</div> : null;

  return (
    <>
      <div className={styles.row}>
        {show('temperature') && (
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q16_temperature" style={tempStatus ? alertLabelStyle : undefined}>
              Temperature (°F){star} {tempStatus && '⚠'}
            </label>
            <input
              className={styles.input}
              style={{ ...(tempStatus ? alertInputStyle : null), ...(errorFor?.('q16_temperature') ? alertInputStyle : null) }}
              type="number"
              id="q16_temperature"
              step="0.1"
              inputMode="decimal"
              placeholder="98.6"
              min={RANGE.temperature.min}
              max={RANGE.temperature.max}
              aria-invalid={!!errorFor?.('q16_temperature')}
              {...register('q16_temperature', {
                validate: rangeValidator(RANGE.temperature.min, RANGE.temperature.max, RANGE.temperature.label),
              })}
            />
            {/* A reading is uninterpretable without its route (axillary reads
                low, temporal high), so the route is required once a
                temperature is entered. */}
            <select
              className={styles.select}
              id="q16_temperatureRoute"
              aria-label="Temperature route"
              style={{ marginTop: 6, fontSize: 13, ...(errorFor?.('q16_temperatureRoute') ? alertInputStyle : null) }}
              aria-invalid={!!errorFor?.('q16_temperatureRoute')}
              {...register('q16_temperatureRoute')}
            >
              <option value="">Route…</option>
              <option value="Oral">Oral</option>
              <option value="Axillary">Axillary</option>
              <option value="Tympanic">Tympanic (ear)</option>
              <option value="Temporal">Temporal (forehead)</option>
              <option value="Rectal">Rectal</option>
            </select>
            <Note s={tempStatus} what="Temperature" />
            <Err k="q16_temperature" />
            <Err k="q16_temperatureRoute" />
          </div>
        )}

        {show('bloodPressure') && (
          <div className={styles.f} id="q17_bloodPressure">
            <label className={styles.label} htmlFor="q17_systolic" style={bpStatus ? alertLabelStyle : undefined}>
              Blood Pressure (mmHg){star} {bpStatus && '⚠'}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                className={styles.input}
                style={{ ...(sysStatus || errorFor?.('q17_bloodPressure') ? alertInputStyle : null), maxWidth: 90, textAlign: 'center' }}
                type="number"
                id="q17_systolic"
                inputMode="numeric"
                placeholder="120"
                aria-label="Systolic"
                min={RANGE.systolic.min}
                max={RANGE.systolic.max}
                {...register('q17_systolic', {
                  validate: rangeValidator(RANGE.systolic.min, RANGE.systolic.max, RANGE.systolic.label),
                })}
              />
              <span aria-hidden style={{ color: '#666', fontWeight: 600 }}>/</span>
              <input
                className={styles.input}
                style={{ ...(diaStatus || errorFor?.('q17_bloodPressure') ? alertInputStyle : null), maxWidth: 90, textAlign: 'center' }}
                type="number"
                id="q17_diastolic"
                inputMode="numeric"
                placeholder="80"
                aria-label="Diastolic"
                min={RANGE.diastolic.min}
                max={RANGE.diastolic.max}
                {...register('q17_diastolic', {
                  validate: rangeValidator(RANGE.diastolic.min, RANGE.diastolic.max, RANGE.diastolic.label),
                })}
              />
            </div>
            <input type="hidden" {...register('q17_bloodPressure')} />
            <Note s={sysStatus} what="Systolic" />
            <Note s={diaStatus} what="Diastolic" />
            <Err k="q17_bloodPressure" />
            <Err k="q17_systolic" />
            <Err k="q17_diastolic" />
          </div>
        )}

        {show('pulse') && (
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q18_pulse" style={pulseStatus ? alertLabelStyle : undefined}>
              Pulse (bpm){star} {pulseStatus && '⚠'}
            </label>
            <input
              className={styles.input}
              style={{ ...(pulseStatus || errorFor?.('q18_pulse') ? alertInputStyle : null) }}
              type="number"
              id="q18_pulse"
              inputMode="numeric"
              placeholder="72"
              min={RANGE.pulse.min}
              max={RANGE.pulse.max}
              aria-invalid={!!errorFor?.('q18_pulse')}
              {...register('q18_pulse', {
                validate: rangeValidator(RANGE.pulse.min, RANGE.pulse.max, RANGE.pulse.label),
              })}
            />
            <Note s={pulseStatus} what="Pulse" />
            <Err k="q18_pulse" />
          </div>
        )}
      </div>

      {(show('respiration') || show('oxygenSaturation')) && (
        <div className={styles.row}>
          {show('respiration') && (
            <div className={styles.f}>
              <label className={styles.label} htmlFor="q19_respiration" style={respStatus ? alertLabelStyle : undefined}>
                Respirations (breaths/min){star} {respStatus && '⚠'}
              </label>
              <input
                className={styles.input}
                style={{ ...(respStatus || errorFor?.('q19_respiration') ? alertInputStyle : null) }}
                type="number"
                id="q19_respiration"
                inputMode="numeric"
                min={RANGE.respiration.min}
                max={RANGE.respiration.max}
                {...register('q19_respiration', {
                  validate: rangeValidator(RANGE.respiration.min, RANGE.respiration.max, RANGE.respiration.label),
                })}
              />
              <Note s={respStatus} what="Respiration" />
              <Err k="q19_respiration" />
            </div>
          )}
          {show('oxygenSaturation') && (
            <div className={styles.f}>
              <label className={styles.label} htmlFor="q20_oxygenSaturation" style={o2Status ? alertLabelStyle : undefined}>
                O₂ Saturation (%){star} {o2Status && '⚠'}
              </label>
              <input
                className={styles.input}
                style={{ ...(o2Status || errorFor?.('q20_oxygenSaturation') ? alertInputStyle : null) }}
                type="number"
                id="q20_oxygenSaturation"
                inputMode="numeric"
                min={RANGE.o2.min}
                max={RANGE.o2.max}
                {...register('q20_oxygenSaturation', {
                  validate: rangeValidator(RANGE.o2.min, RANGE.o2.max, RANGE.o2.label),
                })}
              />
              <Note s={o2Status} what="O₂ saturation" />
              <Err k="q20_oxygenSaturation" />
            </div>
          )}
        </div>
      )}
    </>
  );
}
