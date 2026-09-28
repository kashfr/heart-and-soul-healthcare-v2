'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { FormPageProps } from '../types';
import styles from '../page.module.css';
import DeselectableRadio, { radioState, radioSubscribe, radioGetSnapshot } from './DeselectableRadio';
import { SHIFT_CHANGE_KEYS } from '@/lib/shiftChange';
import FieldError from './FieldError';
import { isBpRoutinelyRequired } from '@/lib/vitalRanges';
import VitalsRecheckSection from './VitalsRecheckSection';
import VitalSignsFields from './VitalSignsFields';

interface FormPageTwoProps extends FormPageProps {
  credential?: string;
  ageStr?: string;
  dob?: string;
  /** Editing a submitted note: the since-last-shift answers are required only
      when the note carries the rev-3 stamp (never retroactively). */
  isEditMode?: boolean;
  /** Jump to the Medications page's add/change/discontinue box (LPN/RN). */
  onGoToMedChanges?: () => void;
}

const getRadioSnapshotStr = () => String(radioGetSnapshot());

const helperStyle: React.CSSProperties = { fontSize: '12px', color: '#666', marginTop: '4px', fontStyle: 'italic', lineHeight: 1.45 };
const marCalloutStyle: React.CSSProperties = { background: '#fff7ed', border: '1px solid #f59e0b', color: '#7c2d12', borderRadius: 8, padding: '10px 12px', margin: '6px 0 12px', fontSize: 13.5, lineHeight: 1.5 };
const marCalloutBtnStyle: React.CSSProperties = { display: 'inline-block', background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 8 };


export default function FormPageTwo({ formRef, register, watch, setValue, control, credential, ageStr, dob, errors, isEditMode, onGoToMedChanges }: FormPageTwoProps) {
  const showVitals = credential !== 'HHA';
  // BP is routinely required from age 3 (AAP). Under 3 it's optional — recorded
  // when clinically indicated/ordered — so we don't ask for a refusal reason.
  const bpRequired = isBpRoutinelyRequired(ageStr || '', dob);

  // --- Since your last shift (rev 3) ---
  // Three required Yes/No radios plus Details required on any Yes. Radios live
  // in the DeselectableRadio store, so subscribe to re-render on change and
  // mirror each answer into a hidden RHF input that trigger() can validate and
  // the submit scan can surface (the physician-notification pattern).
  useSyncExternalStore(radioSubscribe, getRadioSnapshotStr, getRadioSnapshotStr);
  const sinceHospital = radioState[SHIFT_CHANGE_KEYS.hospitalAdmission] || '';
  const sinceEr = radioState[SHIFT_CHANGE_KEYS.erUrgentCare] || '';
  const sinceMed = radioState[SHIFT_CHANGE_KEYS.medChange] || '';
  const sinceAnyYes = sinceHospital === 'Yes' || sinceEr === 'Yes' || sinceMed === 'Yes';
  // Required on every NEW note; an amendment of a note written before the
  // section existed (no rev-3 stamp) is never asked to answer for that shift.
  const isRev3Note = !isEditMode || Number(watch('q1_formRev') || '0') >= 3;
  useEffect(() => {
    setValue(SHIFT_CHANGE_KEYS.hospitalAdmission, sinceHospital);
    setValue(SHIFT_CHANGE_KEYS.erUrgentCare, sinceEr);
    setValue(SHIFT_CHANGE_KEYS.medChange, sinceMed);
  }, [sinceHospital, sinceEr, sinceMed, setValue]);
  const isLpnRn = credential === 'LPN' || credential === 'RN';
  // One message per question so the submit-time "missing fields" list names
  // each unanswered one instead of collapsing them into a single line.
  const yesNoRule = (question: string) => (v: string) =>
    !isRev3Note || v === 'Yes' || v === 'No' || `Since your last shift: answer Yes or No for ${question}.`;


  return (
    <div>
      {/* SINCE YOUR LAST SHIFT — interval screening, every program and credential.
          Kept outside any collapsible so the required-field scan can see it. */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>SINCE YOUR LAST SHIFT</span>
        <p style={helperStyle}>
          Please verify with the family or caregiver. Ask about discharge papers and new prescriptions.
          {isRev3Note ? ' All three answers are required.' : ''}
        </p>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label}>Any hospital admission(s)?{isRev3Note ? ' *' : ''}</label>
            <div className={styles.radioRow}>
              <label>
                <DeselectableRadio name={SHIFT_CHANGE_KEYS.hospitalAdmission} value="Yes" />
                Yes
              </label>
              <label>
                <DeselectableRadio name={SHIFT_CHANGE_KEYS.hospitalAdmission} value="No" />
                No
              </label>
            </div>
            <input type="hidden" {...register(SHIFT_CHANGE_KEYS.hospitalAdmission, { validate: yesNoRule('hospital admission') })} />
            <FieldError name={SHIFT_CHANGE_KEYS.hospitalAdmission} errors={errors} />
          </div>
          <div className={styles.f}>
            <label className={styles.label}>Any urgent care or ER visit(s)?{isRev3Note ? ' *' : ''}</label>
            <div className={styles.radioRow}>
              <label>
                <DeselectableRadio name={SHIFT_CHANGE_KEYS.erUrgentCare} value="Yes" />
                Yes
              </label>
              <label>
                <DeselectableRadio name={SHIFT_CHANGE_KEYS.erUrgentCare} value="No" />
                No
              </label>
            </div>
            <input type="hidden" {...register(SHIFT_CHANGE_KEYS.erUrgentCare, { validate: yesNoRule('urgent care or ER visit') })} />
            <FieldError name={SHIFT_CHANGE_KEYS.erUrgentCare} errors={errors} />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label}>Any medication started, changed, or stopped?{isRev3Note ? ' *' : ''}</label>
            <div className={styles.radioRow}>
              <label>
                <DeselectableRadio name={SHIFT_CHANGE_KEYS.medChange} value="Yes" />
                Yes
              </label>
              <label>
                <DeselectableRadio name={SHIFT_CHANGE_KEYS.medChange} value="No" />
                No
              </label>
            </div>
            <input type="hidden" {...register(SHIFT_CHANGE_KEYS.medChange, { validate: yesNoRule('medication started, changed, or stopped') })} />
            <FieldError name={SHIFT_CHANGE_KEYS.medChange} errors={errors} />
            <p style={helperStyle}>
              Includes a new prescription; a dose, schedule, route, or form change; a medication the doctor
              stopped or told the family to hold; and anything over-the-counter, vitamin, or as-needed the
              family gave on their own. Look at the bottles for a new label.
            </p>
          </div>
        </div>

        {sinceMed === 'Yes' && (
          <div style={marCalloutStyle} role="status">
            <strong>Please update the MAR.</strong>{' '}
            {isLpnRn ? (
              <>
                If you have the written order or discharge papers, record the change under &ldquo;Add, change,
                or discontinue a medication&rdquo; on the Medications page so it is on the MAR when you submit.
                If a medication was stopped or held and you do not have the order, do not give it, mark its
                doses Held with the reason, and do not discontinue it on the MAR until the order is confirmed.
                {onGoToMedChanges && (
                  <>
                    <br />
                    <button type="button" onClick={onGoToMedChanges} style={marCalloutBtnStyle}>
                      Go to medication changes
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                Please let the supervising nurse know so the MAR can be updated. Your supervisor is also
                notified when you submit. Do not give any medication that is not on the current MAR.
              </>
            )}
          </div>
        )}

        {sinceAnyYes && (
          <div className={styles.row}>
            <div className={styles.f} style={{ flex: '1 1 100%' }}>
              <label className={styles.label} htmlFor={SHIFT_CHANGE_KEYS.details}>
                Details{isRev3Note ? ' *' : ''}
              </label>
              <textarea
                className={styles.textarea}
                style={isRev3Note ? { border: '2px solid #c62828', background: '#fff5f5' } : undefined}
                id={SHIFT_CHANGE_KEYS.details}
                {...register(SHIFT_CHANGE_KEYS.details, {
                  validate: (v) => !isRev3Note || !sinceAnyYes || !!(v || '').trim() || 'Required when any answer above is Yes.',
                })}
                rows={4}
                required={isRev3Note}
                placeholder={
                  sinceMed === 'Yes'
                    ? 'For each medication: name; what happened (started / dose or schedule changed / stopped / on hold and until when / not sure); who ordered it and when; whether you saw the written order or discharge papers.'
                    : 'Where and when, the reason, what was done, and any discharge instructions or new orders given to the family.'
                }
              />
              <FieldError name={SHIFT_CHANGE_KEYS.details} errors={errors} />
            </div>
          </div>
        )}
      </div>

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
            <VitalSignsFields
              register={register}
              watch={watch}
              setValue={setValue}
              ageStr={ageStr || ''}
              dob={dob}
              required
              nativeRequired={showVitals}
              notObtainedReason
              bpNotObtainedReason={bpRequired}
              bpOptional={!bpRequired}
              details
              errorFor={(k) => (errors?.[k]?.message ? String(errors[k]?.message) : undefined)}
            />

            {/* Later readings in the same shift (q16r_reading{n}_*). The first
                set above stays the note's "vitals of record" for every chart
                and filter; rechecks print beneath it and share its ranges. */}
            <VitalsRecheckSection register={register} watch={watch} setValue={setValue} />
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
