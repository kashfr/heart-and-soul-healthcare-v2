'use client';

/**
 * Vital signs entry shared by the note forms. One place for the conventions
 * every note follows so the dashboard, PDF, abnormal-vitals banner, and
 * vitals trends read them all the same way:
 *
 *  - the shift note's field keys (q16_temperature + q16_temperatureRoute,
 *    q17_systolic / q17_diastolic mirrored into the legacy "S/D" string
 *    q17_bloodPressure, q18_pulse, q19_respiration, q20_oxygenSaturation
 *    + q21_oxygenSource);
 *  - the typo-guard ranges from validators.ts on every input, and the hard
 *    0-100 clamp on SpO2;
 *  - age-appropriate abnormal highlighting from src/lib/vitalRanges.
 *
 * `fields` picks which vitals a form asks for (the supervisory visit records
 * temperature, BP, and pulse; the shift note records all five). The shift
 * note also turns on the clinical extras: the "unable to obtain" reasons,
 * the BP method/site and pulse site, and native `required` attributes so
 * the browser's required styling and validation apply. Errors come through
 * `errorFor` so a host can use RHF validation, its own submit-time escort
 * messages, or both.
 */

import { useCallback, useEffect, useMemo } from 'react';
import type { UseFormRegister, UseFormWatch, UseFormSetValue } from 'react-hook-form';
import type { FormValues } from '../types';
import styles from '../page.module.css';
import { rangeValidator, VITAL_RANGE as RANGE } from '../validators';
import { getAgeGroupLabel, isBaselineRange, noteVitalRanges, readNoteBaselines, type VitalKey } from '@/lib/vitalRanges';
import { describeBaselines } from '@/lib/vitalsBaselines';

export type VitalField = 'temperature' | 'bloodPressure' | 'pulse' | 'respiration' | 'oxygenSaturation';

export const ALL_VITAL_FIELDS: VitalField[] = ['temperature', 'bloodPressure', 'pulse', 'respiration', 'oxygenSaturation'];

/** Field keys a set of vitals writes, for hosts that build required-field rules. */
export const VITAL_FIELD_KEYS: Record<VitalField, string[]> = {
  temperature: ['q16_temperature', 'q16_temperatureRoute'],
  bloodPressure: ['q17_systolic', 'q17_diastolic', 'q17_bloodPressure'],
  pulse: ['q18_pulse'],
  respiration: ['q19_respiration'],
  oxygenSaturation: ['q20_oxygenSaturation', 'q21_oxygenSource'],
};

const alertInputStyle: React.CSSProperties = { border: '2px solid #c62828', background: '#fff5f5' };
const alertLabelStyle: React.CSSProperties = { color: '#c62828' };
const noteStyle: React.CSSProperties = { fontSize: 12, color: '#c62828', marginTop: 4, fontWeight: 500 };
const errorStyle: React.CSSProperties = { display: 'block', marginTop: 4, color: '#c62828', fontSize: 12, fontWeight: 500 };
const helperStyle: React.CSSProperties = { fontSize: '12px', color: '#666', margin: '4px 0 0', fontStyle: 'italic' };
const smallSelect: React.CSSProperties = { marginTop: 6, fontSize: 13 };

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
  /**
   * Also set the native `required` attribute (lifted while an "unable to
   * obtain" reason is selected), so the browser's required styling and
   * validation apply. The shift note relies on this; a form that validates
   * only at submit leaves it off.
   */
  nativeRequired?: boolean;
  /** Section-level "unable to obtain vitals" reason + note (q16_vitalsNotObtained*). */
  notObtainedReason?: boolean;
  /**
   * BP-specific "unable to obtain" reason (q17_bpNotObtained*), which clears
   * and disables the two BP inputs. The shift note shows it only when BP is
   * routinely required for the client's age.
   */
  bpNotObtainedReason?: boolean;
  /** BP is recorded only when indicated (the shift note under age 3): no
   *  required marker, plus a note saying so. */
  bpOptional?: boolean;
  /** Clinical detail selects: BP method and site, pulse site, oxygen source. */
  details?: boolean;
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
  nativeRequired = false,
  notObtainedReason = false,
  bpNotObtainedReason = false,
  bpOptional = false,
  details = false,
  errorFor,
}: Props) {
  const show = (f: VitalField) => fields.includes(f);
  const star = required ? ' *' : '';
  const ageGroup = getAgeGroupLabel(ageStr, dob);
  // The client's age range, with the baseline snapshot this note carries
  // (q16b_*) on top for any vital the client has a baseline for.
  const allValues = watch();
  const ranges = useMemo(() => noteVitalRanges(allValues as Record<string, unknown>), [allValues]);
  const baselineText = useMemo(() => describeBaselines(readNoteBaselines(allValues as Record<string, unknown>)), [allValues]);

  const temp = watch('q16_temperature');
  const sys = watch('q17_systolic');
  const dia = watch('q17_diastolic');
  const pulse = watch('q18_pulse');
  const resp = watch('q19_respiration');
  const o2 = watch('q20_oxygenSaturation');
  // A section-level reason lifts the hard `required` on every vital: what
  // WAS obtained is still recorded, the reason covers the blanks. The BP
  // reason instead disables the two BP inputs.
  const vitalsNotObtained = notObtainedReason && !!watch('q16_vitalsNotObtainedReason');
  const bpNotObtained = bpNotObtainedReason && !!watch('q17_bpNotObtainedReason');
  const req = nativeRequired && !vitalsNotObtained;

  // Keep the legacy "S/D" string in sync with the two numeric inputs.
  useEffect(() => {
    if (!show('bloodPressure')) return;
    const joined = sys || dia ? `${sys || ''}/${dia || ''}` : '';
    if (watch('q17_bloodPressure') !== joined) setValue('q17_bloodPressure', joined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sys, dia, setValue]);

  // SpO2 has a hard physical ceiling of 100% (and floor of 0). Unlike the
  // other vitals, where out-of-range is implausible but possible and only
  // flagged at submit, an SpO2 over 100 is not real data, so clamp it the
  // instant it is entered rather than letting it sit on screen looking valid.
  const clampO2 = useCallback(
    (rawValue: string) => {
      if (rawValue === '' || rawValue == null) return;
      const n = Number(rawValue);
      if (Number.isNaN(n)) return;
      const clamped = Math.min(100, Math.max(0, n));
      if (clamped !== n) {
        setValue('q20_oxygenSaturation', String(clamped), { shouldValidate: true, shouldDirty: true });
      }
    },
    [setValue],
  );

  /** 'low' | 'high' | null for one reading, against the client's age group. */
  const status = (key: VitalKey, raw: string | undefined): 'low' | 'high' | null => {
    const n = parseFloat(String(raw ?? ''));
    if (Number.isNaN(n)) return null;
    if (n < ranges[key].low) return 'low';
    if (n > ranges[key].high) return 'high';
    return null;
  };
  /** "for Adult (18-64 years)" or "for this client's baseline (100 to 110)". */
  const against = (key: VitalKey): string =>
    isBaselineRange(ranges[key]) ? `this client's baseline (${ranges[key].low} to ${ranges[key].high})` : ageGroup;
  const tempStatus = status('temperature', temp);
  const sysStatus = status('systolic', sys);
  const diaStatus = status('diastolic', dia);
  const pulseStatus = status('pulse', pulse);
  const respStatus = status('respiration', resp);
  const o2Status = status('oxygenSaturation', o2);
  const bpStatus = sysStatus || diaStatus;

  const hasErr = (k: string) => !!errorFor?.(k);
  const inputStyle = (abnormal: unknown, ...keys: string[]): React.CSSProperties | undefined =>
    abnormal || keys.some(hasErr) ? alertInputStyle : undefined;

  const Err = ({ k }: { k: string }) => {
    const m = errorFor?.(k);
    return m ? <span role="alert" style={errorStyle}>{m}</span> : null;
  };
  const Note = ({ s, what, k }: { s: 'low' | 'high' | null; what: string; k: VitalKey }) =>
    s ? <div style={noteStyle}>{what} is {s} for {against(k)}.</div> : null;

  return (
    <>
      {ageStr && (
        <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 8px', fontStyle: 'italic' }}>
          Ranges based on age group: <strong>{ageGroup}</strong>
          {baselineText && <>. This client&apos;s baselines: <strong>{baselineText}</strong></>}
        </p>
      )}

      {notObtainedReason && (
        <div style={{ margin: '0 0 10px' }}>
          <select
            className={styles.select}
            id="q16_vitalsNotObtainedReason"
            aria-label="Reason vitals not obtained"
            style={{ fontSize: 13, maxWidth: 480 }}
            {...register('q16_vitalsNotObtainedReason', {
              onChange: (e) => {
                if (!e.target.value) setValue('q16_vitalsNotObtainedNote', '');
              },
            })}
          >
            <option value="">All vitals recorded below &mdash; or select if unable to obtain&hellip;</option>
            <option value="Patient refused">Unable to obtain &mdash; patient refused</option>
            <option value="Parent/guardian refused">Unable to obtain &mdash; parent/guardian refused</option>
            <option value="Unable to tolerate / uncooperative">Unable to obtain &mdash; unable to tolerate / uncooperative</option>
            <option value="Equipment unavailable or malfunction">Unable to obtain &mdash; equipment unavailable / malfunction</option>
            <option value="Clinically contraindicated">Unable to obtain &mdash; clinically contraindicated</option>
            <option value="Other">Unable to obtain &mdash; other (note below)</option>
          </select>
          {vitalsNotObtained && (
            <>
              <input
                className={styles.input}
                id="q16_vitalsNotObtainedNote"
                placeholder="Optional note (details on why vitals weren't obtained)…"
                style={{ marginTop: 6, fontSize: 13, maxWidth: 480 }}
                {...register('q16_vitalsNotObtainedNote')}
              />
              <p style={helperStyle}>Any vitals you were able to obtain can still be recorded below.</p>
            </>
          )}
        </div>
      )}

      <div className={styles.row}>
        {show('temperature') && (
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q16_temperature" style={tempStatus ? alertLabelStyle : undefined}>
              Temperature (°F){star} {tempStatus && '⚠'}
            </label>
            <input
              className={styles.input}
              style={inputStyle(tempStatus, 'q16_temperature')}
              type="number"
              id="q16_temperature"
              step="0.1"
              inputMode="decimal"
              placeholder="98.6"
              min={RANGE.temperature.min}
              max={RANGE.temperature.max}
              required={req}
              aria-invalid={hasErr('q16_temperature')}
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
              style={{ ...smallSelect, ...inputStyle(false, 'q16_temperatureRoute') }}
              required={nativeRequired && !!temp}
              aria-invalid={hasErr('q16_temperatureRoute')}
              {...register('q16_temperatureRoute')}
            >
              <option value="">Route…</option>
              <option value="Oral">Oral</option>
              <option value="Axillary">Axillary</option>
              <option value="Tympanic">Tympanic (ear)</option>
              <option value="Temporal">Temporal (forehead)</option>
              <option value="Rectal">Rectal</option>
            </select>
            <Note s={tempStatus} what="Temperature" k="temperature" />
            <Err k="q16_temperature" />
            <Err k="q16_temperatureRoute" />
          </div>
        )}

        {show('bloodPressure') && (
          <div className={styles.f} id="q17_bloodPressure">
            <label className={styles.label} htmlFor="q17_systolic" style={bpStatus ? alertLabelStyle : undefined}>
              Blood Pressure (mmHg){bpOptional ? '' : star} {bpStatus && '⚠'}
            </label>
            {/* Two narrow numeric inputs read as a single BP entry. BP is never
                a native `required` field: a nurse who can't obtain it picks a
                reason instead (checked at submit). */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                className={styles.input}
                style={{ ...inputStyle(sysStatus, 'q17_bloodPressure', 'q17_systolic'), maxWidth: 90, textAlign: 'center' }}
                type="number"
                id="q17_systolic"
                inputMode="numeric"
                placeholder="120"
                aria-label="Systolic"
                min={RANGE.systolic.min}
                max={RANGE.systolic.max}
                disabled={bpNotObtained}
                {...register('q17_systolic', {
                  validate: rangeValidator(RANGE.systolic.min, RANGE.systolic.max, RANGE.systolic.label),
                })}
              />
              <span aria-hidden style={{ color: '#666', fontWeight: 600 }}>/</span>
              <input
                className={styles.input}
                style={{ ...inputStyle(diaStatus, 'q17_bloodPressure', 'q17_diastolic'), maxWidth: 90, textAlign: 'center' }}
                type="number"
                id="q17_diastolic"
                inputMode="numeric"
                placeholder="80"
                aria-label="Diastolic"
                min={RANGE.diastolic.min}
                max={RANGE.diastolic.max}
                disabled={bpNotObtained}
                {...register('q17_diastolic', {
                  validate: rangeValidator(RANGE.diastolic.min, RANGE.diastolic.max, RANGE.diastolic.label),
                })}
              />
            </div>
            <input type="hidden" {...register('q17_bloodPressure')} />
            {/* How the reading was taken: method affects accuracy, site
                matters in infants (leg cuffs). Optional. */}
            {details && !bpNotObtained && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <select className={styles.select} id="q17_bpMethod" aria-label="Blood pressure method" style={{ fontSize: 13 }} {...register('q17_bpMethod')}>
                  <option value="">Method&hellip;</option>
                  <option value="Manual (auscultation)">Manual (auscultation)</option>
                  <option value="Automatic (oscillometric)">Automatic (oscillometric)</option>
                </select>
                <select className={styles.select} id="q17_bpSite" aria-label="Blood pressure site" style={{ fontSize: 13 }} {...register('q17_bpSite')}>
                  <option value="">Site&hellip;</option>
                  <option value="Left arm">Left arm</option>
                  <option value="Right arm">Right arm</option>
                  <option value="Left leg">Left leg</option>
                  <option value="Right leg">Right leg</option>
                </select>
              </div>
            )}
            {bpNotObtainedReason && (
              <>
                <select
                  className={styles.select}
                  id="q17_bpNotObtainedReason"
                  aria-label="Reason blood pressure not obtained"
                  style={smallSelect}
                  {...register('q17_bpNotObtainedReason', {
                    onChange: (e) => {
                      if (e.target.value) {
                        setValue('q17_systolic', '');
                        setValue('q17_diastolic', '');
                      } else {
                        setValue('q17_bpNotObtainedNote', '');
                      }
                    },
                  })}
                >
                  <option value="">BP recorded above &mdash; or select if unable to obtain&hellip;</option>
                  <option value="Patient refused">Unable to obtain &mdash; patient refused</option>
                  <option value="Unable to tolerate / uncooperative">Unable to obtain &mdash; unable to tolerate / uncooperative</option>
                  <option value="Equipment unavailable or malfunction">Unable to obtain &mdash; equipment unavailable / malfunction</option>
                  <option value="Clinically contraindicated">Unable to obtain &mdash; clinically contraindicated</option>
                  <option value="Other">Unable to obtain &mdash; other (note below)</option>
                </select>
                {bpNotObtained && (
                  <input
                    className={styles.input}
                    id="q17_bpNotObtainedNote"
                    placeholder="Optional note (details on why BP wasn't obtained)…"
                    style={{ marginTop: 6, fontSize: 13 }}
                    {...register('q17_bpNotObtainedNote')}
                  />
                )}
              </>
            )}
            {bpOptional && (
              <p style={{ ...helperStyle, margin: '6px 0 0' }}>
                Not routinely required under age 3 (AAP) &mdash; record if indicated or ordered.
              </p>
            )}
            <Note s={sysStatus} what="Systolic" k="systolic" />
            <Note s={diaStatus} what="Diastolic" k="diastolic" />
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
              style={inputStyle(pulseStatus, 'q18_pulse')}
              type="number"
              id="q18_pulse"
              inputMode="numeric"
              placeholder="72"
              min={RANGE.pulse.min}
              max={RANGE.pulse.max}
              required={req}
              aria-invalid={hasErr('q18_pulse')}
              {...register('q18_pulse', {
                validate: rangeValidator(RANGE.pulse.min, RANGE.pulse.max, RANGE.pulse.label),
              })}
            />
            {/* Site: apical is standard for infants and young children. Optional. */}
            {details && (
              <select className={styles.select} id="q18_pulseSite" aria-label="Pulse site" style={smallSelect} {...register('q18_pulseSite')}>
                <option value="">Site&hellip;</option>
                <option value="Radial">Radial</option>
                <option value="Apical">Apical</option>
                <option value="Brachial">Brachial</option>
                <option value="Carotid">Carotid</option>
                <option value="Other">Other</option>
              </select>
            )}
            <Note s={pulseStatus} what="Pulse" k="pulse" />
            <Err k="q18_pulse" />
          </div>
        )}
      </div>

      {(show('respiration') || show('oxygenSaturation')) && (
        <div className={styles.row}>
          {show('respiration') && (
            <div className={styles.f}>
              <label className={styles.label} htmlFor="q19_respiration" style={respStatus ? alertLabelStyle : undefined}>
                Respiration (breaths/min){star} {respStatus && '⚠'}
              </label>
              <input
                className={styles.input}
                style={inputStyle(respStatus, 'q19_respiration')}
                type="number"
                id="q19_respiration"
                inputMode="numeric"
                min={RANGE.respiration.min}
                max={RANGE.respiration.max}
                required={req}
                aria-invalid={hasErr('q19_respiration')}
                {...register('q19_respiration', {
                  validate: rangeValidator(RANGE.respiration.min, RANGE.respiration.max, RANGE.respiration.label),
                })}
              />
              <Note s={respStatus} what="Respiration" k="respiration" />
              <Err k="q19_respiration" />
            </div>
          )}
          {show('oxygenSaturation') && (
            <>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q20_oxygenSaturation" style={o2Status ? alertLabelStyle : undefined}>
                  O2 Saturation (%){star} {o2Status && '⚠'}
                </label>
                <input
                  className={styles.input}
                  style={inputStyle(o2Status, 'q20_oxygenSaturation')}
                  type="number"
                  id="q20_oxygenSaturation"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  required={req}
                  aria-invalid={hasErr('q20_oxygenSaturation')}
                  {...register('q20_oxygenSaturation', {
                    validate: rangeValidator(RANGE.o2.min, RANGE.o2.max, RANGE.o2.label),
                    onChange: (e) => clampO2(e.target.value),
                    onBlur: (e) => clampO2(e.target.value),
                  })}
                />
                <Note s={o2Status} what="O2 saturation" k="oxygenSaturation" />
                <Err k="q20_oxygenSaturation" />
              </div>
              {details && (
                <div className={styles.f}>
                  {/* Required once an SpO2 value is present: a saturation can't
                      be interpreted without knowing the delivery (room air vs
                      O2). No silent default, since many clients are on home
                      O2 or ventilators. Mirrors the temperature route. */}
                  <label className={styles.label} htmlFor="q21_oxygenSource">
                    Oxygen Source {nativeRequired && !!o2 && '*'}
                  </label>
                  <select
                    className={styles.select}
                    id="q21_oxygenSource"
                    required={nativeRequired && !!o2}
                    {...register('q21_oxygenSource')}
                  >
                    <option value="">Select...</option>
                    <option value="Room Air">Room Air</option>
                    <option value="Nasal Cannula">Nasal Cannula</option>
                    <option value="Face Mask">Face Mask</option>
                    <option value="Ventilator">Ventilator</option>
                    <option value="Other">Other</option>
                  </select>
                  <Err k="q21_oxygenSource" />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
