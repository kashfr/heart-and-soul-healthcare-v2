'use client';

import { useState, useCallback, useEffect } from 'react';
import type { FormPageProps } from '../types';
import styles from '../page.module.css';
import DeselectableRadio from './DeselectableRadio';
import FieldError from './FieldError';
import { rangeValidator, VITAL_RANGE as RANGE } from '../validators';
import { getVitalRanges, getAgeGroupLabel, checkVitalRange, isBpRoutinelyRequired, type VitalKey } from '@/lib/vitalRanges';

interface FormPageTwoProps extends FormPageProps {
  credential?: string;
  ageStr?: string;
  dob?: string;
}

interface VitalAlert {
  vital: string;
  value: string;
  status: 'low' | 'high';
}

const alertInputStyle = {
  border: '2px solid #c62828',
  background: '#fff5f5',
};

const alertLabelStyle = {
  color: '#c62828',
};

export default function FormPageTwo({ formRef, register, watch, setValue, control, credential, ageStr, dob, errors }: FormPageTwoProps) {
  const showVitals = credential !== 'HHA';
  const ageGroupLabel = getAgeGroupLabel(ageStr || '', dob);
  // BP is routinely required from age 3 (AAP). Under 3 it's optional — recorded
  // when clinically indicated/ordered — so we don't ask for a refusal reason.
  const bpRequired = isBpRoutinelyRequired(ageStr || '', dob);
  const [alerts, setAlerts] = useState<Record<string, VitalAlert>>({});

  // O2 saturation has a HARD physical ceiling of 100% (and floor of 0). Unlike
  // the other vitals — where out-of-range is implausible-but-possible and only
  // flagged at submit — an SpO2 over 100 is not real data, so we clamp it the
  // instant it's entered rather than letting it sit on screen looking valid.
  const clampO2 = useCallback((rawValue: string) => {
    if (rawValue === '' || rawValue == null) return;
    const n = Number(rawValue);
    if (Number.isNaN(n)) return;
    const clamped = Math.min(100, Math.max(0, n));
    if (clamped !== n) {
      setValue('q20_oxygenSaturation', String(clamped), { shouldValidate: true, shouldDirty: true });
    }
  }, [setValue]);

  const handleVitalChange = useCallback((key: VitalKey, rawValue: string) => {
    const value = parseFloat(rawValue);
    if (isNaN(value) || rawValue.trim() === '') {
      setAlerts(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    const status = checkVitalRange(key, value, ageStr || '', dob);
    const currentRanges = getVitalRanges(ageStr || '', dob);
    const range = currentRanges[key];
    if (status !== 'normal') {
      setAlerts(prev => ({
        ...prev,
        [key]: {
          vital: range.label,
          value: `${rawValue} ${range.unit}`,
          status,
        },
      }));
    } else {
      setAlerts(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, [ageStr, dob]);

  const handleBPChange = useCallback((rawValue: string) => {
    const parts = rawValue.split('/');
    if (parts.length === 2) {
      const systolic = parseFloat(parts[0]);
      const diastolic = parseFloat(parts[1]);

      if (!isNaN(systolic)) {
        const sysStatus = checkVitalRange('systolic', systolic, ageStr || '', dob);
        if (sysStatus !== 'normal') {
          setAlerts(prev => ({
            ...prev,
            systolic: { vital: 'Systolic BP', value: `${systolic} mmHg`, status: sysStatus },
          }));
        } else {
          setAlerts(prev => { const next = { ...prev }; delete next.systolic; return next; });
        }
      }

      if (!isNaN(diastolic)) {
        const diaStatus = checkVitalRange('diastolic', diastolic, ageStr || '', dob);
        if (diaStatus !== 'normal') {
          setAlerts(prev => ({
            ...prev,
            diastolic: { vital: 'Diastolic BP', value: `${diastolic} mmHg`, status: diaStatus },
          }));
        } else {
          setAlerts(prev => { const next = { ...prev }; delete next.diastolic; return next; });
        }
      }
    } else {
      setAlerts(prev => {
        const next = { ...prev };
        delete next.systolic;
        delete next.diastolic;
        return next;
      });
    }
  }, [ageStr, dob]);

  // Keep the legacy q17_bloodPressure string ("S/D") in sync with the two
  // numeric inputs so the dashboard, PDF, and vitalRanges helper keep working
  // unchanged. Also re-runs the abnormal-vitals check on every change.
  const sysWatch = watch('q17_systolic');
  const diaWatch = watch('q17_diastolic');
  useEffect(() => {
    const joined = sysWatch || diaWatch ? `${sysWatch || ''}/${diaWatch || ''}` : '';
    setValue('q17_bloodPressure', joined);
    handleBPChange(joined);
  }, [sysWatch, diaWatch, setValue, handleBPChange]);

  // Re-check the single-value vitals (temp, pulse, respiration, O2) whenever
  // their values change — including the PROGRAMMATIC populate when an existing
  // note is loaded for editing. Previously these only re-evaluated on the
  // input's onBlur, so opening a note with already-abnormal vitals rendered
  // them as if normal (no red) until the nurse manually edited a field. Watching
  // the RHF values fixes the edit-mode case (mirrors the BP effect above).
  const tempWatch = watch('q16_temperature');
  const pulseWatch = watch('q18_pulse');
  const respWatch = watch('q19_respiration');
  const o2Watch = watch('q20_oxygenSaturation');
  useEffect(() => {
    handleVitalChange('temperature', String(tempWatch ?? ''));
    handleVitalChange('pulse', String(pulseWatch ?? ''));
    handleVitalChange('respiration', String(respWatch ?? ''));
    handleVitalChange('oxygenSaturation', String(o2Watch ?? ''));
  }, [tempWatch, pulseWatch, respWatch, o2Watch, handleVitalChange]);

  const isAbnormal = (key: string) => key in alerts;
  const isBPAbnormal = 'systolic' in alerts || 'diastolic' in alerts;

  // When a reason is chosen from the "unable to obtain BP" dropdown, the two
  // numeric BP inputs are disabled/cleared and the reason satisfies the
  // required-BP check at submit. Empty reason = a normal reading is expected.
  const bpNotObtained = !!watch('q17_bpNotObtainedReason');

  // Section-level escape hatch: when vitals (any or all) couldn't be obtained
  // — refusal, uncooperative child, equipment failure — the nurse documents
  // one reason here instead. Unlike the BP-specific dropdown, this does NOT
  // disable the inputs: whatever vitals WERE obtained should still be
  // recorded, and the reason covers only the ones left blank.
  const vitalsNotObtained = !!watch('q16_vitalsNotObtainedReason');

  return (
    <div>
      <div className={styles.section}>
        <span className={styles.sectionLabel}>STATUS AT BEGINNING OF SHIFT</span>

        <div className={styles.subsec}>Alertness Level</div>
        <div className={styles.radioRow}>
          <label>
            <DeselectableRadio name="q13_alertnessLevel" value="Alert" />
            Alert
          </label>
          <label>
            <DeselectableRadio name="q13_alertnessLevel" value="Lethargic" />
            Lethargic
          </label>
          <label>
            <DeselectableRadio name="q13_alertnessLevel" value="Unresponsive" />
            Unresponsive
          </label>
          <label>
            <DeselectableRadio name="q13_alertnessLevel" value="Agitated" />
            Agitated
          </label>
        </div>

        <div className={styles.subsec}>Orientation</div>
        <div className={styles.radioRow}>
          <label>
            <DeselectableRadio
              name="q13_orientationLevel"
              value="Alert and Oriented x4"
            />
            Alert and Oriented x4 (Person, Place, Time, Situation)
          </label>
          <label>
            <DeselectableRadio
              name="q13_orientationLevel"
              value="Alert and Oriented x3"
            />
            Alert and Oriented x3
          </label>
          <label>
            <DeselectableRadio
              name="q13_orientationLevel"
              value="Alert and Oriented x2"
            />
            Alert and Oriented x2
          </label>
          <label>
            <DeselectableRadio
              name="q13_orientationLevel"
              value="Alert and Oriented x1"
            />
            Alert and Oriented x1
          </label>
          <label>
            <DeselectableRadio
              name="q13_orientationLevel"
              value="Not Alert and Oriented"
            />
            Not Alert and Oriented
          </label>
        </div>

        <div className={styles.subsec}>Behavior</div>
        <div className={styles.radioRow}>
          <label>
            <DeselectableRadio
              name="q14_behavior"
              value="Calm and cooperative"
            />
            Calm and cooperative
          </label>
          <label>
            <DeselectableRadio
              name="q14_behavior"
              value="Anxious"
            />
            Anxious
          </label>
          <label>
            <DeselectableRadio
              name="q14_behavior"
              value="Agitated"
            />
            Agitated
          </label>
          <label>
            <DeselectableRadio
              name="q14_behavior"
              value="Combative"
            />
            Combative
          </label>
          <label>
            <DeselectableRadio
              name="q14_behavior"
              value="Confused"
            />
            Confused
          </label>
          <label>
            <DeselectableRadio
              name="q14_behavior"
              value="Other"
            />
            Other
          </label>
        </div>

        <div className={styles.row} style={{ marginTop: '10px' }}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q14_orientationBehaviorNotes">Orientation &amp; Behavior Notes</label>
            <textarea
              className={styles.textarea}
              id="q14_orientationBehaviorNotes"
              {...register('q14_orientationBehaviorNotes')}
              rows={3}
              placeholder="Describe orientation and behavior at start of shift..."
            />
          </div>
        </div>

        <div className={styles.subsec}>Appearance</div>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label}>General Appearance</label>
            <div className={styles.radioRow}>
              <label>
                <DeselectableRadio name="q15_generalAppearance" value="WNL" />
                WNL
              </label>
              <label>
                <DeselectableRadio name="q15_generalAppearance" value="Abnormal" />
                Abnormal
              </label>
            </div>
          </div>
        </div>

        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q15_appearance" value="Clean" />
            Clean
          </label>
          <label>
            <input type="checkbox" name="q15_appearance" value="Well-groomed" />
            Well-groomed
          </label>
          <label>
            <input type="checkbox" name="q15_appearance" value="Disheveled" />
            Disheveled
          </label>
          <label>
            <input type="checkbox" name="q15_appearance" value="Soiled" />
            Soiled
          </label>
          <label>
            <input type="checkbox" name="q15_appearance" value="Odorous" />
            Odorous
          </label>
        </div>

        <div className={styles.row} style={{ marginTop: '10px' }}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q15_skinColor">Skin Color</label>
            <select
              className={styles.select}
              id="q15_skinColor"
              {...register('q15_skinColor')}
            >
              <option value="">Select...</option>
              <option value="Normal / Appropriate for ethnicity">Normal / Appropriate for ethnicity</option>
              <option value="Pale">Pale</option>
              <option value="Flushed / Ruddy">Flushed / Ruddy</option>
              <option value="Cyanotic (bluish)">Cyanotic (bluish)</option>
              <option value="Jaundiced (yellowish)">Jaundiced (yellowish)</option>
              <option value="Mottled">Mottled</option>
              <option value="Ashen / Gray">Ashen / Gray</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className={styles.f}>
            <label className={styles.label}>Skin Integrity</label>
            <div className={styles.radioRow}>
              <label>
                <DeselectableRadio name="q15_skinIntegrity" value="Intact" />
                Intact
              </label>
              <label>
                <DeselectableRadio name="q15_skinIntegrity" value="Impaired" />
                Impaired
              </label>
            </div>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q15_appearanceNotes">Appearance Notes</label>
            <textarea
              className={styles.textarea}
              id="q15_appearanceNotes"
              {...register('q15_appearanceNotes')}
              rows={3}
              placeholder="Describe appearance findings..."
            />
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          {!showVitals && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(255,255,255,0.75)',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
            }}>
              <div style={{
                background: '#f0f4f8',
                border: '1px solid #d0d9e3',
                borderRadius: '8px',
                padding: '12px 24px',
                textAlign: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}>
                <span style={{ fontSize: '14px', color: '#555', fontWeight: 600 }}>
                  Vital Signs — available for CNA, LPN, RN credentials
                </span>
              </div>
            </div>
          )}
          <div style={!showVitals ? { opacity: 0.35, pointerEvents: 'none' } : undefined}>
            <div className={styles.subsec}>Vitals</div>
            {ageStr && (
              <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 8px', fontStyle: 'italic' }}>
                Ranges based on age group: <strong>{ageGroupLabel}</strong>
              </p>
            )}

            {/* Unable-to-obtain reason for the vitals section as a whole.
                Selecting a reason lifts the hard `required` on the vitals
                inputs below — any vital still blank at submit is documented
                as not obtained for this reason. Inputs stay enabled so a
                partial set (e.g. temp + pulse on a child who fought the BP
                cuff) can still be recorded. */}
            <div style={{ margin: '0 0 10px' }}>
              <select
                className={styles.select}
                id="q16_vitalsNotObtainedReason"
                aria-label="Reason vitals not obtained"
                style={{ fontSize: 13, maxWidth: 480 }}
                {...register('q16_vitalsNotObtainedReason', {
                  onChange: (e) => {
                    if (!e.target.value) {
                      setValue('q16_vitalsNotObtainedNote', '');
                    }
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
                  <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 0', fontStyle: 'italic' }}>
                    Any vitals you were able to obtain can still be recorded below.
                  </p>
                </>
              )}
            </div>

            <div className={styles.row}>
              <div className={styles.f}>
                <label
                  className={styles.label}
                  htmlFor="q16_temperature"
                  style={isAbnormal('temperature') ? alertLabelStyle : undefined}
                >
                  Temperature (°F) * {isAbnormal('temperature') && '⚠'}
                </label>
                <input
                  className={styles.input}
                  style={isAbnormal('temperature') ? alertInputStyle : undefined}
                  type="number"
                  id="q16_temperature"
                  step="0.1"
                  min={RANGE.temperature.min}
                  max={RANGE.temperature.max}
                  required={!vitalsNotObtained}
                  {...register('q16_temperature', {
                    validate: rangeValidator(RANGE.temperature.min, RANGE.temperature.max, RANGE.temperature.label),
                    onBlur: (e) => handleVitalChange('temperature', e.target.value),
                  })}
                />
                {/* Route is required once a temperature is entered — a reading
                    is uninterpretable without it (axillary reads low, temporal
                    high; the fever threshold shifts by route). */}
                <select
                  className={styles.select}
                  id="q16_temperatureRoute"
                  aria-label="Temperature route"
                  style={{ marginTop: 6, fontSize: 13 }}
                  required={showVitals && !!tempWatch}
                  {...register('q16_temperatureRoute')}
                >
                  <option value="">Route&hellip;</option>
                  <option value="Oral">Oral</option>
                  <option value="Axillary">Axillary</option>
                  <option value="Tympanic">Tympanic (ear)</option>
                  <option value="Temporal">Temporal (forehead)</option>
                  <option value="Rectal">Rectal</option>
                </select>
                <FieldError name="q16_temperature" errors={errors} />
              </div>
              <div className={styles.f}>
                <label
                  className={styles.label}
                  htmlFor="q17_systolic"
                  style={isBPAbnormal ? alertLabelStyle : undefined}
                >
                  Blood Pressure (mmHg) {bpRequired && '*'} {isBPAbnormal && '⚠'}
                </label>
                {/* Two narrow numeric inputs read as a single BP entry. The
                    legacy q17_bloodPressure string is kept in sync via the
                    effect below so the dashboard, PDF, and abnormal-vitals
                    helper continue to work without changes. BP is no longer a
                    hard `required` field: a nurse who can't obtain it picks a
                    reason from the dropdown instead (validated at submit). */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    className={styles.input}
                    style={{ ...(isBPAbnormal ? alertInputStyle : undefined), maxWidth: 80, textAlign: 'center' }}
                    type="number"
                    id="q17_systolic"
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
                    style={{ ...(isBPAbnormal ? alertInputStyle : undefined), maxWidth: 80, textAlign: 'center' }}
                    type="number"
                    id="q17_diastolic"
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
                {/* Hidden mirror so the existing "120/80" key keeps working. */}
                <input type="hidden" {...register('q17_bloodPressure')} />
                {/* How the reading was taken — method affects accuracy, site
                    matters in infants (leg cuffs). Optional; hidden when BP
                    is marked unable-to-obtain. */}
                {!bpNotObtained && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <select
                      className={styles.select}
                      id="q17_bpMethod"
                      aria-label="Blood pressure method"
                      style={{ fontSize: 13 }}
                      {...register('q17_bpMethod')}
                    >
                      <option value="">Method&hellip;</option>
                      <option value="Manual (auscultation)">Manual (auscultation)</option>
                      <option value="Automatic (oscillometric)">Automatic (oscillometric)</option>
                    </select>
                    <select
                      className={styles.select}
                      id="q17_bpSite"
                      aria-label="Blood pressure site"
                      style={{ fontSize: 13 }}
                      {...register('q17_bpSite')}
                    >
                      <option value="">Site&hellip;</option>
                      <option value="Left arm">Left arm</option>
                      <option value="Right arm">Right arm</option>
                      <option value="Left leg">Left leg</option>
                      <option value="Right leg">Right leg</option>
                    </select>
                  </div>
                )}
                {/* Unable-to-obtain reason — only when BP is routinely required
                    (age >= 3). Selecting any reason disables and clears the two
                    inputs above and satisfies the BP check. */}
                {bpRequired && (
                  <>
                    <select
                      className={styles.select}
                      id="q17_bpNotObtainedReason"
                      aria-label="Reason blood pressure not obtained"
                      style={{ marginTop: 6, fontSize: 13 }}
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
                {!bpRequired && (
                  <p style={{ fontSize: '12px', color: '#666', margin: '6px 0 0', fontStyle: 'italic' }}>
                    Not routinely required under age 3 (AAP) &mdash; record if indicated or ordered.
                  </p>
                )}
                <FieldError name="q17_systolic" errors={errors} />
                <FieldError name="q17_diastolic" errors={errors} />
              </div>
              <div className={styles.f}>
                <label
                  className={styles.label}
                  htmlFor="q18_pulse"
                  style={isAbnormal('pulse') ? alertLabelStyle : undefined}
                >
                  Pulse (bpm) * {isAbnormal('pulse') && '⚠'}
                </label>
                <input
                  className={styles.input}
                  style={isAbnormal('pulse') ? alertInputStyle : undefined}
                  type="number"
                  id="q18_pulse"
                  min={RANGE.pulse.min}
                  max={RANGE.pulse.max}
                  required={!vitalsNotObtained}
                  {...register('q18_pulse', {
                    validate: rangeValidator(RANGE.pulse.min, RANGE.pulse.max, RANGE.pulse.label),
                    onBlur: (e) => handleVitalChange('pulse', e.target.value),
                  })}
                />
                {/* Site — apical is standard for infants/young children. Optional. */}
                <select
                  className={styles.select}
                  id="q18_pulseSite"
                  aria-label="Pulse site"
                  style={{ marginTop: 6, fontSize: 13 }}
                  {...register('q18_pulseSite')}
                >
                  <option value="">Site&hellip;</option>
                  <option value="Radial">Radial</option>
                  <option value="Apical">Apical</option>
                  <option value="Brachial">Brachial</option>
                  <option value="Carotid">Carotid</option>
                  <option value="Other">Other</option>
                </select>
                <FieldError name="q18_pulse" errors={errors} />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f}>
                <label
                  className={styles.label}
                  htmlFor="q19_respiration"
                  style={isAbnormal('respiration') ? alertLabelStyle : undefined}
                >
                  Respiration (breaths/min) * {isAbnormal('respiration') && '⚠'}
                </label>
                <input
                  className={styles.input}
                  style={isAbnormal('respiration') ? alertInputStyle : undefined}
                  type="number"
                  id="q19_respiration"
                  min={RANGE.respiration.min}
                  max={RANGE.respiration.max}
                  required={!vitalsNotObtained}
                  {...register('q19_respiration', {
                    validate: rangeValidator(RANGE.respiration.min, RANGE.respiration.max, RANGE.respiration.label),
                    onBlur: (e) => handleVitalChange('respiration', e.target.value),
                  })}
                />
                <FieldError name="q19_respiration" errors={errors} />
              </div>
              <div className={styles.f}>
                <label
                  className={styles.label}
                  htmlFor="q20_oxygenSaturation"
                  style={isAbnormal('oxygenSaturation') ? alertLabelStyle : undefined}
                >
                  O2 Saturation (%) * {isAbnormal('oxygenSaturation') && '⚠'}
                </label>
                <input
                  className={styles.input}
                  style={isAbnormal('oxygenSaturation') ? alertInputStyle : undefined}
                  type="number"
                  id="q20_oxygenSaturation"
                  min={0}
                  max={100}
                  required={!vitalsNotObtained}
                  {...register('q20_oxygenSaturation', {
                    validate: rangeValidator(RANGE.o2.min, RANGE.o2.max, RANGE.o2.label),
                    onChange: (e) => clampO2(e.target.value),
                    onBlur: (e) => {
                      clampO2(e.target.value);
                      handleVitalChange('oxygenSaturation', e.target.value);
                    },
                  })}
                />
                <FieldError name="q20_oxygenSaturation" errors={errors} />
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q21_oxygenSource">Oxygen Source</label>
                <select
                  className={styles.select}
                  id="q21_oxygenSource"
                  {...register('q21_oxygenSource')}
                >
                  <option value="">Select...</option>
                  <option value="Room Air">Room Air</option>
                  <option value="Nasal Cannula">Nasal Cannula</option>
                  <option value="Face Mask">Face Mask</option>
                  <option value="Ventilator">Ventilator</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q22_additionalObservations">Additional Observations</label>
            <textarea
              className={styles.textarea}
              id="q22_additionalObservations"
              {...register('q22_additionalObservations')}
              rows={4}
              placeholder="Any additional observations about client status..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
