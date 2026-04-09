'use client';

import { useState } from 'react';
import styles from '../page.module.css';
import DeselectableRadio from './DeselectableRadio';

interface FormPageThreeProps {
  formRef: React.RefObject<HTMLFormElement>;
  credential?: string;
}

export default function FormPageThree({ formRef, credential }: FormPageThreeProps) {
  const showSystemAssessments = credential === 'LPN' || credential === 'RN';
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    activity: false,
    pain: false,
    neuro: false,
    cardio: false,
    respiratory: false,
    gi: false,
    gu: false,
    reproductive: false,
    skin: false,
    behavioral: false,
    endocrine: false,
  });

  const [painScale, setPainScale] = useState<string>('');

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <div>
      <div className={styles.section}>
        <span className={styles.sectionLabel}>OBSERVATIONS DURING SHIFT</span>

        {/* Activity Section */}
        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('activity')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.activity ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Activity Level</div>
        </div>
        {expandedSections.activity && (
          <div>
            <div className={styles.radioRow}>
              <label>
                <DeselectableRadio
                  name="q23_activityLevel"
                  value="Bed bound"
                />
                Bed bound
              </label>
              <label>
                <DeselectableRadio
                  name="q23_activityLevel"
                  value="Chair bound"
                />
                Chair bound
              </label>
              <label>
                <DeselectableRadio
                  name="q23_activityLevel"
                  value="Ambulates with assistance"
                />
                Ambulates with assistance
              </label>
              <label>
                <DeselectableRadio
                  name="q23_activityLevel"
                  value="Ambulates independently"
                />
                Ambulates independently
              </label>
            </div>
          </div>
        )}

        {/* Pain Assessment Section */}
        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('pain')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.pain ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Pain Assessment</div>
        </div>
        {expandedSections.pain && (
          <div>
            {/* Scale selection and score — scale first, then score */}
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q24_scaleUsed">Scale Used</label>
                <select
                  className={styles.select}
                  id="q24_scaleUsed"
                  name="q24_scaleUsed"
                  value={painScale}
                  onChange={(e) => setPainScale(e.target.value)}
                >
                  <option value="">Select scale...</option>
                  <option value="Numeric (0-10)">Numeric (0-10)</option>
                  <option value="FACES">FACES (Wong-Baker)</option>
                  <option value="FLACC">FLACC (Behavioral)</option>
                  <option value="NIPS">NIPS (Neonatal/Infant)</option>
                  <option value="Verbal">Verbal</option>
                  <option value="N/A">N/A</option>
                </select>
              </div>
              {/* Show pain score only for scales that use numbers */}
              {(painScale === 'Numeric (0-10)' || painScale === '') && (
                <div className={styles.f}>
                  <label className={styles.label} htmlFor="q24_painScore">Pain Score (0-10)</label>
                  <input
                    className={styles.input}
                    type="number"
                    id="q24_painScore"
                    name="q24_painScore"
                    min="0"
                    max="10"
                  />
                </div>
              )}
            </div>

            {/* FACES Scale */}
            {painScale === 'FACES' && (
              <div style={{ background: '#f9f9f9', padding: '12px', borderRadius: '4px', marginBottom: '12px', borderLeft: '3px solid #3498db' }}>
                <div className={styles.subsec} style={{ color: '#3498db' }}>Wong-Baker FACES Pain Rating Scale</div>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Select the face that best matches the patient&apos;s pain level:</p>
                <div className={styles.radioRow}>
                  <label><DeselectableRadio name="q24_painScore" value="0" /> 😊 0 - No Hurt</label>
                  <label><DeselectableRadio name="q24_painScore" value="2" /> 🙂 2 - Hurts Little Bit</label>
                  <label><DeselectableRadio name="q24_painScore" value="4" /> 😐 4 - Hurts Little More</label>
                  <label><DeselectableRadio name="q24_painScore" value="6" /> 🙁 6 - Hurts Even More</label>
                  <label><DeselectableRadio name="q24_painScore" value="8" /> 😢 8 - Hurts Whole Lot</label>
                  <label><DeselectableRadio name="q24_painScore" value="10" /> 😭 10 - Hurts Worst</label>
                </div>
              </div>
            )}

            {/* FLACC Scale */}
            {painScale === 'FLACC' && (
              <div style={{ background: '#f9f9f9', padding: '12px', borderRadius: '4px', marginBottom: '12px', borderLeft: '3px solid #e67e22' }}>
                <div className={styles.subsec} style={{ color: '#e67e22' }}>FLACC Behavioral Pain Scale (0-10)</div>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>Score each category 0-2. Total = sum of all categories.</p>

                <div className={styles.row}>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor="q24_flaccFace">Face</label>
                    <select className={styles.select} id="q24_flaccFace" name="q24_flaccFace">
                      <option value="">Select...</option>
                      <option value="0">0 - No particular expression or smile</option>
                      <option value="1">1 - Occasional grimace/frown, withdrawn</option>
                      <option value="2">2 - Frequent quivering chin, clenched jaw</option>
                    </select>
                  </div>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor="q24_flaccLegs">Legs</label>
                    <select className={styles.select} id="q24_flaccLegs" name="q24_flaccLegs">
                      <option value="">Select...</option>
                      <option value="0">0 - Normal position or relaxed</option>
                      <option value="1">1 - Uneasy, restless, tense</option>
                      <option value="2">2 - Kicking, or legs drawn up</option>
                    </select>
                  </div>
                </div>
                <div className={styles.row}>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor="q24_flaccActivity">Activity</label>
                    <select className={styles.select} id="q24_flaccActivity" name="q24_flaccActivity">
                      <option value="">Select...</option>
                      <option value="0">0 - Lying quietly, moves easily</option>
                      <option value="1">1 - Squirming, shifting, tense</option>
                      <option value="2">2 - Arched, rigid, or jerking</option>
                    </select>
                  </div>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor="q24_flaccCry">Cry</label>
                    <select className={styles.select} id="q24_flaccCry" name="q24_flaccCry">
                      <option value="">Select...</option>
                      <option value="0">0 - No cry (awake or asleep)</option>
                      <option value="1">1 - Moans or whimpers, occasional</option>
                      <option value="2">2 - Crying steadily, screams or sobs</option>
                    </select>
                  </div>
                </div>
                <div className={styles.row}>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor="q24_flaccConsolability">Consolability</label>
                    <select className={styles.select} id="q24_flaccConsolability" name="q24_flaccConsolability">
                      <option value="">Select...</option>
                      <option value="0">0 - Content, relaxed</option>
                      <option value="1">1 - Reassured by touching/hugging/talking</option>
                      <option value="2">2 - Difficult to console or comfort</option>
                    </select>
                  </div>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor="q24_painScore">FLACC Total Score (auto-sum or enter)</label>
                    <input
                      className={styles.input}
                      type="number"
                      id="q24_painScoreFlacc"
                      name="q24_painScore"
                      min="0"
                      max="10"
                      placeholder="0-10"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* NIPS Scale */}
            {painScale === 'NIPS' && (
              <div style={{ background: '#f9f9f9', padding: '12px', borderRadius: '4px', marginBottom: '12px', borderLeft: '3px solid #8e44ad' }}>
                <div className={styles.subsec} style={{ color: '#8e44ad' }}>Neonatal/Infant Pain Scale - NIPS (0-7)</div>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>Score each category. Cry is 0-2, all others are 0-1. Total = sum.</p>

                <div className={styles.row}>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor="q24_nipsFacial">Facial Expression</label>
                    <select className={styles.select} id="q24_nipsFacial" name="q24_nipsFacial">
                      <option value="">Select...</option>
                      <option value="0">0 - Relaxed muscles, restful face</option>
                      <option value="1">1 - Grimace, tight facial muscles, furrowed brow</option>
                    </select>
                  </div>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor="q24_nipsCry">Cry</label>
                    <select className={styles.select} id="q24_nipsCry" name="q24_nipsCry">
                      <option value="">Select...</option>
                      <option value="0">0 - No cry, quiet</option>
                      <option value="1">1 - Whimper, mild moaning, intermittent</option>
                      <option value="2">2 - Vigorous cry, loud, shrill, continuous</option>
                    </select>
                  </div>
                </div>
                <div className={styles.row}>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor="q24_nipsBreathing">Breathing Patterns</label>
                    <select className={styles.select} id="q24_nipsBreathing" name="q24_nipsBreathing">
                      <option value="">Select...</option>
                      <option value="0">0 - Relaxed, usual pattern</option>
                      <option value="1">1 - Change in breathing, irregular, faster</option>
                    </select>
                  </div>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor="q24_nipsArms">Arms</label>
                    <select className={styles.select} id="q24_nipsArms" name="q24_nipsArms">
                      <option value="">Select...</option>
                      <option value="0">0 - Relaxed, no rigidity</option>
                      <option value="1">1 - Flexed / Extended</option>
                    </select>
                  </div>
                </div>
                <div className={styles.row}>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor="q24_nipsLegs">Legs</label>
                    <select className={styles.select} id="q24_nipsLegs" name="q24_nipsLegs">
                      <option value="">Select...</option>
                      <option value="0">0 - Relaxed</option>
                      <option value="1">1 - Flexed / Extended</option>
                    </select>
                  </div>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor="q24_nipsArousal">State of Arousal</label>
                    <select className={styles.select} id="q24_nipsArousal" name="q24_nipsArousal">
                      <option value="">Select...</option>
                      <option value="0">0 - Sleeping / Awake, quiet</option>
                      <option value="1">1 - Fussy, restless</option>
                    </select>
                  </div>
                </div>
                <div className={styles.row}>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor="q24_painScoreNips">NIPS Total Score (0-7)</label>
                    <input
                      className={styles.input}
                      type="number"
                      id="q24_painScoreNips"
                      name="q24_painScore"
                      min="0"
                      max="7"
                      placeholder="0-7"
                    />
                  </div>
                  <div className={styles.f}>
                    <p style={{ fontSize: '11px', color: '#666', marginTop: '20px' }}>
                      0-2 = No/minimal pain &nbsp;|&nbsp; 3-4 = Moderate pain &nbsp;|&nbsp; 5-7 = Severe pain
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Verbal Scale */}
            {painScale === 'Verbal' && (
              <div style={{ background: '#f9f9f9', padding: '12px', borderRadius: '4px', marginBottom: '12px', borderLeft: '3px solid #27ae60' }}>
                <div className={styles.subsec} style={{ color: '#27ae60' }}>Verbal Pain Description</div>
                <div className={styles.radioRow}>
                  <label><DeselectableRadio name="q24_painScore" value="None" /> None</label>
                  <label><DeselectableRadio name="q24_painScore" value="Mild" /> Mild</label>
                  <label><DeselectableRadio name="q24_painScore" value="Moderate" /> Moderate</label>
                  <label><DeselectableRadio name="q24_painScore" value="Severe" /> Severe</label>
                </div>
              </div>
            )}

            {/* Common fields for all scales (except N/A) */}
            {painScale !== 'N/A' && (
              <>
                <div className={styles.row}>
                  <div className={styles.f}>
                    <label className={styles.label}>Verbal Complaints?</label>
                    <div className={styles.radioRow}>
                      <label>
                        <DeselectableRadio name="q24_verbalComplaints" value="Yes" />
                        Yes
                      </label>
                      <label>
                        <DeselectableRadio name="q24_verbalComplaints" value="No" />
                        No
                      </label>
                    </div>
                  </div>
                  <div className={styles.f}>
                    <label className={styles.label}>Non-verbal Cues?</label>
                    <div className={styles.radioRow}>
                      <label>
                        <DeselectableRadio name="q24_nonverbalCues" value="Yes" />
                        Yes
                      </label>
                      <label>
                        <DeselectableRadio name="q24_nonverbalCues" value="No" />
                        No
                      </label>
                    </div>
                  </div>
                </div>
                <div className={styles.row}>
                  <div className={styles.f}>
                    <label className={styles.label} htmlFor="q25_painLocation">Pain Location</label>
                    <input
                      className={styles.input}
                      type="text"
                      id="q25_painLocation"
                      name="q25_painLocation"
                      placeholder="e.g., lower back, knee"
                    />
                  </div>
                </div>
                <div className={styles.row}>
                  <div className={styles.f} style={{ flex: '1 1 100%' }}>
                    <label className={styles.label} htmlFor="q26_painDescription">Pain Description / Characteristics</label>
                    <textarea
                      className={styles.textarea}
                      id="q26_painDescription"
                      name="q26_painDescription"
                      rows={3}
                      placeholder="Sharp, dull, throbbing, etc..."
                    />
                  </div>
                </div>
              </>
            )}

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q26_painNotes">Pain Notes</label>
                <textarea
                  className={styles.textarea}
                  id="q26_painNotes"
                  name="q26_painNotes"
                  rows={2}
                  placeholder="Additional pain observations..."
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Safety Checklist */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>SAFETY CHECKLIST</span>
        <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 0.5rem 0' }}>(Select all that apply)</p>

        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q27_safetyChecklist" value="Care plan reviewed at start of shift" />
            Care plan reviewed at start of shift
          </label>
          <label>
            <input type="checkbox" name="q27_safetyChecklist" value="Emergency action plan reviewed" />
            Emergency action plan reviewed
          </label>
          <label>
            <input type="checkbox" name="q27_safetyChecklist" value="Seizure precautions in place per care plan" />
            Seizure precautions in place per care plan
          </label>
          <label>
            <input type="checkbox" name="q27_safetyChecklist" value="Emergency contacts verified and accessible" />
            Emergency contacts verified and accessible
          </label>
          <label>
            <input type="checkbox" name="q27_safetyChecklist" value="Physician orders reviewed" />
            Physician orders reviewed
          </label>
          <label>
            <input type="checkbox" name="q27_safetyChecklist" value="Medications verified against MAR" />
            Medications verified against MAR
          </label>
          <label>
            <input type="checkbox" name="q27_safetyChecklist" value="Padded side rails up" />
            Padded side rails up
          </label>
          <label>
            <input type="checkbox" name="q27_safetyChecklist" value="Environment cleared of hazards" />
            Environment cleared of hazards
          </label>
          <label>
            <input type="checkbox" name="q27_safetyChecklist" value="Suction equipment at bedside and functional" />
            Suction equipment at bedside and functional
          </label>
          <label>
            <input type="checkbox" name="q27_safetyChecklist" value="Oxygen equipment at bedside and functional" />
            Oxygen equipment at bedside and functional
          </label>
          <label>
            <input type="checkbox" name="q27_safetyChecklist" value="Fall precautions in place" />
            Fall precautions in place
          </label>
          <label>
            <input type="checkbox" name="q27_safetyChecklist" value="Hourly safety checks performed" />
            Hourly safety checks performed
          </label>
          <label>
            <input type="checkbox" name="q27_safetyChecklist" value="Home environment assessed for safety hazards" />
            Home environment assessed for safety hazards
          </label>
          <label>
            <input type="checkbox" name="q27_safetyChecklist" value="Medical equipment checked and functioning" />
            Medical equipment checked and functioning
          </label>
          <label>
            <input type="checkbox" name="q27_safetyChecklist" value="Infection control / hand hygiene maintained" />
            Infection control / hand hygiene maintained
          </label>
        </div>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q27_safetyOther">Other</label>
            <input
              className={styles.input}
              type="text"
              id="q27_safetyOther"
              name="q27_safetyOther"
              placeholder="Specify..."
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label}>Falls / Injuries this shift?</label>
            <div className={styles.radioRow}>
              <label>
                <DeselectableRadio name="q27_fallsInjuries" value="Yes" />
                Yes
              </label>
              <label>
                <DeselectableRadio name="q27_fallsInjuries" value="No" />
                No
              </label>
            </div>
          </div>
          <div className={styles.f}>
            <label className={styles.label}>All Systems WNL?</label>
            <div className={styles.radioRow}>
              <label>
                <DeselectableRadio name="q27_allSystemsWNL" value="Yes" />
                Yes
              </label>
              <label>
                <DeselectableRadio name="q27_allSystemsWNL" value="No" />
                No
              </label>
            </div>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q27_safetyNotes">Safety Notes</label>
            <textarea
              className={styles.textarea}
              id="q27_safetyNotes"
              name="q27_safetyNotes"
              rows={2}
            />
          </div>
        </div>
      </div>

      {/* System Assessments — LPN/RN only */}
      <div style={{ position: 'relative' }}>
        {!showSystemAssessments && (
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
                System Assessments — available for LPN, RN credentials
              </span>
            </div>
          </div>
        )}
      <div className={styles.section} style={!showSystemAssessments ? { opacity: 0.35, pointerEvents: 'none' } : undefined}>
        <span className={styles.sectionLabel}>SYSTEM ASSESSMENTS</span>

        {/* Neurological */}
        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('neuro')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.neuro ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Neurological</div>
        </div>
        {expandedSections.neuro && (
          <div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Status</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q30_neuroStatus" value="WNL" />
                    WNL
                  </label>
                  <label>
                    <DeselectableRadio name="q30_neuroStatus" value="Abnormal" />
                    Abnormal
                  </label>
                </div>
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q30_neuroBaseline">Baseline Neurological Status</label>
                <select className={styles.select} id="q30_neuroBaseline" name="q30_neuroBaseline">
                  <option value="">Select...</option>
                  <option value="Alert and oriented">Alert and oriented</option>
                  <option value="Alert responsive to stimuli">Alert responsive to stimuli</option>
                  <option value="Lethargic but arousable">Lethargic but arousable</option>
                  <option value="Responds to verbal stimuli only">Responds to verbal stimuli only</option>
                  <option value="Responds to painful stimuli only">Responds to painful stimuli only</option>
                  <option value="Unresponsive">Unresponsive</option>
                  <option value="Agitated / Combative">Agitated / Combative</option>
                  <option value="Confused / Disoriented">Confused / Disoriented</option>
                  <option value="Non-verbal baseline">Non-verbal baseline</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Seizure Event this shift?</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q30_seizureEvent" value="Yes" />
                    Yes
                  </label>
                  <label>
                    <DeselectableRadio name="q30_seizureEvent" value="No" />
                    No
                  </label>
                </div>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q30_seizureOnset">Onset Time</label>
                <input className={styles.input} type="time" id="q30_seizureOnset" name="q30_seizureOnset" />
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q30_seizureEnd">End Time</label>
                <input className={styles.input} type="time" id="q30_seizureEnd" name="q30_seizureEnd" />
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q30_seizureDuration">Duration (min)</label>
                <input className={styles.input} type="number" id="q30_seizureDuration" name="q30_seizureDuration" />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q30_seizureDescription">During Seizure Description</label>
                <textarea className={styles.textarea} id="q30_seizureDescription" name="q30_seizureDescription" rows={2} />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q30_postIctal">Post-ictal Status</label>
                <textarea className={styles.textarea} id="q30_postIctal" name="q30_postIctal" rows={2} />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q30_neuroNotes">Notes</label>
                <textarea
                  className={styles.textarea}
                  id="q30_neuroNotes"
                  name="q30_neuroNotes"
                  rows={2}
                />
              </div>
            </div>
          </div>
        )}

        {/* Cardiovascular */}
        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('cardio')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.cardio ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Cardiovascular</div>
        </div>
        {expandedSections.cardio && (
          <div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Status</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q31_cardioStatus" value="WNL" />
                    WNL
                  </label>
                  <label>
                    <DeselectableRadio name="q31_cardioStatus" value="Abnormal" />
                    Abnormal
                  </label>
                </div>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q31_heartRhythm">Heart Rhythm</label>
                <select className={styles.select} id="q31_heartRhythm" name="q31_heartRhythm">
                  <option value="">Select...</option>
                  <option value="Regular">Regular</option>
                  <option value="Irregular">Irregular</option>
                  <option value="Regularly irregular">Regularly irregular</option>
                  <option value="Irregularly irregular">Irregularly irregular</option>
                  <option value="Tachycardic">Tachycardic</option>
                  <option value="Bradycardic">Bradycardic</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q31_peripheralPulses">Peripheral Pulses</label>
                <select className={styles.select} id="q31_peripheralPulses" name="q31_peripheralPulses">
                  <option value="">Select...</option>
                  <option value="2+ bilaterally (WNL)">2+ bilaterally (WNL)</option>
                  <option value="1+ bilaterally (weak)">1+ bilaterally (weak)</option>
                  <option value="3+ bilaterally (bounding)">3+ bilaterally (bounding)</option>
                  <option value="Diminished left">Diminished left</option>
                  <option value="Diminished right">Diminished right</option>
                  <option value="Absent left">Absent left</option>
                  <option value="Absent right">Absent right</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q31_edema">Edema</label>
                <select className={styles.select} id="q31_edema" name="q31_edema">
                  <option value="">Select...</option>
                  <option value="None">None</option>
                  <option value="1+ pitting bilateral ankles">1+ pitting bilateral ankles</option>
                  <option value="2+ pitting bilateral ankles">2+ pitting bilateral ankles</option>
                  <option value="3+ pitting bilateral lower extremities">3+ pitting bilateral lower extremities</option>
                  <option value="4+ pitting generalized">4+ pitting generalized</option>
                  <option value="Non-pitting bilateral ankles">Non-pitting bilateral ankles</option>
                  <option value="Unilateral left">Unilateral left</option>
                  <option value="Unilateral right">Unilateral right</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q31_capillaryRefill">Capillary Refill</label>
                <select className={styles.select} id="q31_capillaryRefill" name="q31_capillaryRefill">
                  <option value="">Select...</option>
                  <option value="<2 seconds (WNL)">&lt;2 seconds (WNL)</option>
                  <option value="2-3 seconds (slightly delayed)">2-3 seconds (slightly delayed)</option>
                  <option value="3-4 seconds (delayed)">3-4 seconds (delayed)</option>
                  <option value=">4 seconds (severely delayed)">&gt;4 seconds (severely delayed)</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q31_cardioNotes">Notes</label>
                <textarea
                  className={styles.textarea}
                  id="q31_cardioNotes"
                  name="q31_cardioNotes"
                  rows={2}
                />
              </div>
            </div>
          </div>
        )}

        {/* Respiratory */}
        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('respiratory')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.respiratory ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Respiratory</div>
        </div>
        {expandedSections.respiratory && (
          <div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Status</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q32_respStatus" value="WNL" />
                    WNL
                  </label>
                  <label>
                    <DeselectableRadio name="q32_respStatus" value="Abnormal" />
                    Abnormal
                  </label>
                </div>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q32_breathSounds">Breath Sounds</label>
                <select className={styles.select} id="q32_breathSounds" name="q32_breathSounds">
                  <option value="">Select...</option>
                  <option value="Clear bilaterally">Clear bilaterally</option>
                  <option value="Diminished bilateral bases">Diminished bilateral bases</option>
                  <option value="Diminished left">Diminished left</option>
                  <option value="Diminished right">Diminished right</option>
                  <option value="Wheezing">Wheezing</option>
                  <option value="Crackles / Rales">Crackles / Rales</option>
                  <option value="Rhonchi">Rhonchi</option>
                  <option value="Stridor">Stridor</option>
                  <option value="Absent">Absent</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q32_workOfBreathing">Work of Breathing</label>
                <select className={styles.select} id="q32_workOfBreathing" name="q32_workOfBreathing">
                  <option value="">Select...</option>
                  <option value="No distress / WNL">No distress / WNL</option>
                  <option value="Mild distress">Mild distress</option>
                  <option value="Moderate distress">Moderate distress</option>
                  <option value="Severe distress">Severe distress</option>
                  <option value="Nasal flaring">Nasal flaring</option>
                  <option value="Intercostal retractions">Intercostal retractions</option>
                  <option value="Subcostal retractions">Subcostal retractions</option>
                  <option value="Accessory muscle use">Accessory muscle use</option>
                  <option value="Grunting">Grunting</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Cough</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q32_cough" value="Present" />
                    Present
                  </label>
                  <label>
                    <DeselectableRadio name="q32_cough" value="Absent" />
                    Absent
                  </label>
                </div>
              </div>
              <div className={styles.f}>
                <label className={styles.label}>Supplemental O2</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q32_supplementalO2" value="Yes" />
                    Yes
                  </label>
                  <label>
                    <DeselectableRadio name="q32_supplementalO2" value="No" />
                    No
                  </label>
                </div>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q32_respNotes">Notes</label>
                <textarea
                  className={styles.textarea}
                  id="q32_respNotes"
                  name="q32_respNotes"
                  rows={2}
                />
              </div>
            </div>
          </div>
        )}

        {/* Gastrointestinal */}
        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('gi')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.gi ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Gastrointestinal</div>
        </div>
        {expandedSections.gi && (
          <div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Status</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q33_giStatus" value="WNL" />
                    WNL
                  </label>
                  <label>
                    <DeselectableRadio name="q33_giStatus" value="Abnormal" />
                    Abnormal
                  </label>
                </div>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q33_abdomen">Abdomen</label>
                <select className={styles.select} id="q33_abdomen" name="q33_abdomen">
                  <option value="">Select...</option>
                  <option value="Soft non-tender non-distended">Soft non-tender non-distended</option>
                  <option value="Soft tender">Soft tender</option>
                  <option value="Distended non-tender">Distended non-tender</option>
                  <option value="Distended tender">Distended tender</option>
                  <option value="Firm non-tender">Firm non-tender</option>
                  <option value="Firm tender">Firm tender</option>
                  <option value="Rigid">Rigid</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q33_bowelSounds">Bowel Sounds</label>
                <select className={styles.select} id="q33_bowelSounds" name="q33_bowelSounds">
                  <option value="">Select...</option>
                  <option value="Present x4 quadrants (WNL)">Present x4 quadrants (WNL)</option>
                  <option value="Hypoactive">Hypoactive</option>
                  <option value="Hyperactive">Hyperactive</option>
                  <option value="Absent">Absent</option>
                  <option value="High-pitched / tinkling">High-pitched / tinkling</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>BM this shift?</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q33_bmThisShift" value="Yes" />
                    Yes
                  </label>
                  <label>
                    <DeselectableRadio name="q33_bmThisShift" value="No" />
                    No
                  </label>
                </div>
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q33_stoolCharacter">Stool Character</label>
                <select className={styles.select} id="q33_stoolCharacter" name="q33_stoolCharacter">
                  <option value="">Select...</option>
                  <option value="Brown formed (WNL)">Brown formed (WNL)</option>
                  <option value="Loose / soft">Loose / soft</option>
                  <option value="Watery / diarrhea">Watery / diarrhea</option>
                  <option value="Hard / constipated">Hard / constipated</option>
                  <option value="Black / tarry">Black / tarry</option>
                  <option value="Bloody">Bloody</option>
                  <option value="Mucousy">Mucousy</option>
                  <option value="Clay / pale colored">Clay / pale colored</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Nausea/Vomiting</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q33_nauseaVomiting" value="Yes" />
                    Yes
                  </label>
                  <label>
                    <DeselectableRadio name="q33_nauseaVomiting" value="No" />
                    No
                  </label>
                </div>
              </div>
            </div>

            {/* G-Tube / PEG Tube subsection */}
            <div className={styles.subsec}>G-Tube / PEG Tube</div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>G-Tube Present?</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q33_gtubePresent" value="Yes" />
                    Yes
                  </label>
                  <label>
                    <DeselectableRadio name="q33_gtubePresent" value="No" />
                    No
                  </label>
                  <label>
                    <DeselectableRadio name="q33_gtubePresent" value="N/A" />
                    N/A
                  </label>
                </div>
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q33_gtubeSiteAppearance">Insertion Site Appearance</label>
                <select className={styles.select} id="q33_gtubeSiteAppearance" name="q33_gtubeSiteAppearance">
                  <option value="">Select...</option>
                  <option value="WNL — Clean dry intact">WNL — Clean dry intact</option>
                  <option value="Redness / Irritation">Redness / Irritation</option>
                  <option value="Drainage present">Drainage present</option>
                  <option value="Granulation tissue">Granulation tissue</option>
                  <option value="Bleeding">Bleeding</option>
                  <option value="Signs of infection">Signs of infection</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q33_gtubeSiteNotes">Insertion Site Notes</label>
                <textarea className={styles.textarea} id="q33_gtubeSiteNotes" name="q33_gtubeSiteNotes" rows={2} />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q33_giNotes">Notes</label>
                <textarea
                  className={styles.textarea}
                  id="q33_giNotes"
                  name="q33_giNotes"
                  rows={2}
                />
              </div>
            </div>
          </div>
        )}

        {/* Genitourinary */}
        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('gu')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.gu ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Genitourinary</div>
        </div>
        {expandedSections.gu && (
          <div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Status</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q34_guStatus" value="WNL" />
                    WNL
                  </label>
                  <label>
                    <DeselectableRadio name="q34_guStatus" value="Abnormal" />
                    Abnormal
                  </label>
                </div>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q34_urinaryOutput">Urinary Output</label>
                <select className={styles.select} id="q34_urinaryOutput" name="q34_urinaryOutput">
                  <option value="">Select...</option>
                  <option value="Adequate (WNL)">Adequate (WNL)</option>
                  <option value="Decreased">Decreased</option>
                  <option value="Increased / polyuria">Increased / polyuria</option>
                  <option value="Absent / no output">Absent / no output</option>
                  <option value="Incontinent">Incontinent</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q34_urineCharacter">Urine Character</label>
                <select className={styles.select} id="q34_urineCharacter" name="q34_urineCharacter">
                  <option value="">Select...</option>
                  <option value="Clear yellow (WNL)">Clear yellow (WNL)</option>
                  <option value="Pale / dilute">Pale / dilute</option>
                  <option value="Dark yellow / concentrated">Dark yellow / concentrated</option>
                  <option value="Amber / tea-colored">Amber / tea-colored</option>
                  <option value="Cloudy">Cloudy</option>
                  <option value="Bloody / hematuria">Bloody / hematuria</option>
                  <option value="Foul-smelling">Foul-smelling</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Catheter Present?</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q34_catheterPresent" value="Yes" />
                    Yes
                  </label>
                  <label>
                    <DeselectableRadio name="q34_catheterPresent" value="No" />
                    No
                  </label>
                </div>
              </div>
              <div className={styles.f}>
                <label className={styles.label}>Urinary Complaints</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q34_urinaryComplaints" value="Yes" />
                    Yes
                  </label>
                  <label>
                    <DeselectableRadio name="q34_urinaryComplaints" value="No" />
                    No
                  </label>
                </div>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Catheter Care Provided?</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q34_catheterCareProvided" value="Yes" />
                    Yes
                  </label>
                  <label>
                    <DeselectableRadio name="q34_catheterCareProvided" value="No" />
                    No
                  </label>
                  <label>
                    <DeselectableRadio name="q34_catheterCareProvided" value="N/A" />
                    N/A
                  </label>
                </div>
              </div>
            </div>
            <div className={styles.checkRow}>
              <label>
                <input type="checkbox" name="q34_catheterCare" value="Pericare performed" />
                Pericare performed
              </label>
              <label>
                <input type="checkbox" name="q34_catheterCare" value="Site clean dry intact" />
                Site clean dry intact
              </label>
              <label>
                <input type="checkbox" name="q34_catheterCare" value="Tubing secured" />
                Tubing secured
              </label>
              <label>
                <input type="checkbox" name="q34_catheterCare" value="Bag emptied and measured" />
                Bag emptied and measured
              </label>
              <label>
                <input type="checkbox" name="q34_catheterCare" value="Bag below bladder level" />
                Bag below bladder level
              </label>
              <label>
                <input type="checkbox" name="q34_catheterCare" value="No kinks in tubing" />
                No kinks in tubing
              </label>
              <label>
                <input type="checkbox" name="q34_catheterCare" value="Signs of infection noted" />
                Signs of infection noted
              </label>
              <label>
                <input type="checkbox" name="q34_catheterCare" value="Catheter repositioned" />
                Catheter repositioned
              </label>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q34_guNotes">Notes</label>
                <textarea
                  className={styles.textarea}
                  id="q34_guNotes"
                  name="q34_guNotes"
                  rows={2}
                />
              </div>
            </div>
          </div>
        )}

        {/* Reproductive */}
        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('reproductive')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.reproductive ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Reproductive</div>
        </div>
        {expandedSections.reproductive && (
          <div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Status</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q35_reproStatus" value="WNL" />
                    WNL
                  </label>
                  <label>
                    <DeselectableRadio name="q35_reproStatus" value="Abnormal" />
                    Abnormal
                  </label>
                  <label>
                    <DeselectableRadio name="q35_reproStatus" value="N/A" />
                    N/A
                  </label>
                </div>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q35_discharge">Discharge</label>
                <input className={styles.input} type="text" id="q35_discharge" name="q35_discharge" />
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q35_menstrualCycle">Menstrual Cycle</label>
                <input className={styles.input} type="text" id="q35_menstrualCycle" name="q35_menstrualCycle" />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q35_reproNotes">Notes</label>
                <textarea
                  className={styles.textarea}
                  id="q35_reproNotes"
                  name="q35_reproNotes"
                  rows={2}
                />
              </div>
            </div>
          </div>
        )}

        {/* Skin / Integumentary */}
        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('skin')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.skin ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Skin / Integumentary</div>
        </div>
        {expandedSections.skin && (
          <div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Status</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q36_skinStatus" value="WNL" />
                    WNL
                  </label>
                  <label>
                    <DeselectableRadio name="q36_skinStatus" value="Abnormal" />
                    Abnormal
                  </label>
                </div>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q36_skinColorTone">Color/Tone</label>
                <select className={styles.select} id="q36_skinColorTone" name="q36_skinColorTone">
                  <option value="">Select...</option>
                  <option value="Normal for ethnicity">Normal for ethnicity</option>
                  <option value="Pale">Pale</option>
                  <option value="Flushed / Ruddy">Flushed / Ruddy</option>
                  <option value="Jaundiced (yellowish)">Jaundiced (yellowish)</option>
                  <option value="Cyanotic (bluish)">Cyanotic (bluish)</option>
                  <option value="Mottled">Mottled</option>
                  <option value="Ashen / Gray">Ashen / Gray</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q36_turgor">Turgor</label>
                <select className={styles.select} id="q36_turgor" name="q36_turgor">
                  <option value="">Select...</option>
                  <option value="Good (WNL)">Good (WNL)</option>
                  <option value="Slightly decreased">Slightly decreased</option>
                  <option value="Poor / tenting">Poor / tenting</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className={styles.checkRow}>
              <label><strong style={{ fontSize: '0.85rem' }}>Temperature:</strong></label>
              <label>
                <input type="checkbox" name="q36_skinTemp" value="Warm" />
                Warm
              </label>
              <label>
                <input type="checkbox" name="q36_skinTemp" value="Cool" />
                Cool
              </label>
              <label>
                <input type="checkbox" name="q36_skinTemp" value="Cold" />
                Cold
              </label>
              <label>
                <input type="checkbox" name="q36_skinTemp" value="Hot / febrile" />
                Hot / febrile
              </label>
              <label>
                <input type="checkbox" name="q36_skinTemp" value="Diaphoretic" />
                Diaphoretic
              </label>
              <label>
                <input type="checkbox" name="q36_skinTemp" value="Clammy" />
                Clammy
              </label>
              <label>
                <input type="checkbox" name="q36_skinTemp" value="Dry" />
                Dry
              </label>
            </div>
            <div className={styles.checkRow}>
              <label><strong style={{ fontSize: '0.85rem' }}>Wound/Breakdown:</strong></label>
              <label>
                <input type="checkbox" name="q36_woundBreakdown" value="Pressure injury" />
                Pressure injury
              </label>
              <label>
                <input type="checkbox" name="q36_woundBreakdown" value="Wound/incision" />
                Wound/incision
              </label>
              <label>
                <input type="checkbox" name="q36_woundBreakdown" value="Rash" />
                Rash
              </label>
              <label>
                <input type="checkbox" name="q36_woundBreakdown" value="Bruising" />
                Bruising
              </label>
              <label>
                <input type="checkbox" name="q36_woundBreakdown" value="Redness" />
                Redness
              </label>
              <label>
                <input type="checkbox" name="q36_woundBreakdown" value="None" />
                None
              </label>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q36_skinNotes">Notes</label>
                <textarea
                  className={styles.textarea}
                  id="q36_skinNotes"
                  name="q36_skinNotes"
                  rows={2}
                />
              </div>
            </div>
          </div>
        )}

        {/* Behavioral */}
        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('behavioral')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.behavioral ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Behavioral</div>
        </div>
        {expandedSections.behavioral && (
          <div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Status</label>
                <div className={styles.radioRow}>
                  <label>
                    <DeselectableRadio name="q37_behaveStatus" value="WNL" />
                    WNL
                  </label>
                  <label>
                    <DeselectableRadio name="q37_behaveStatus" value="Abnormal" />
                    Abnormal
                  </label>
                </div>
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q37_moodAffect">Mood/Affect</label>
                <input className={styles.input} type="text" id="q37_moodAffect" name="q37_moodAffect" />
              </div>
            </div>
            <div className={styles.checkRow}>
              <label><strong style={{ fontSize: '0.85rem' }}>Behavior Concerns:</strong></label>
              <label>
                <input type="checkbox" name="q37_behaviorConcerns" value="Aggression" />
                Aggression
              </label>
              <label>
                <input type="checkbox" name="q37_behaviorConcerns" value="Self-injurious behavior" />
                Self-injurious behavior
              </label>
              <label>
                <input type="checkbox" name="q37_behaviorConcerns" value="Elopement risk" />
                Elopement risk
              </label>
              <label>
                <input type="checkbox" name="q37_behaviorConcerns" value="Refusal of care" />
                Refusal of care
              </label>
              <label>
                <input type="checkbox" name="q37_behaviorConcerns" value="Verbal outbursts" />
                Verbal outbursts
              </label>
              <label>
                <input type="checkbox" name="q37_behaviorConcerns" value="None" />
                None
              </label>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q37_deescalation">De-escalation Interventions Used</label>
                <textarea className={styles.textarea} id="q37_deescalation" name="q37_deescalation" rows={2} />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q37_behaveNotes">Notes</label>
                <textarea
                  className={styles.textarea}
                  id="q37_behaveNotes"
                  name="q37_behaveNotes"
                  rows={2}
                />
              </div>
            </div>
          </div>
        )}

        {/* Endocrine (Diabetes Management) */}
        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('endocrine')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.endocrine ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Endocrine (Diabetes Management)</div>
        </div>
        {expandedSections.endocrine && (
          <div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Status</label>
                <div className={styles.radioRow}>
                  <label><DeselectableRadio name="q38_endocrineStatus" value="WNL" /> WNL</label>
                  <label><DeselectableRadio name="q38_endocrineStatus" value="Abnormal" /> Abnormal</label>
                  <label><DeselectableRadio name="q38_endocrineStatus" value="N/A" /> N/A</label>
                </div>
              </div>
            </div>

            <div className={styles.subsec}>Blood Glucose Monitoring</div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q38_preMealBG">Pre-meal BG (mg/dL)</label>
                <input
                  className={styles.input}
                  type="number"
                  id="q38_preMealBG"
                  name="q38_preMealBG"
                  min="0"
                  placeholder="mg/dL"
                />
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q38_postMealBG">Post-meal BG (mg/dL)</label>
                <input
                  className={styles.input}
                  type="number"
                  id="q38_postMealBG"
                  name="q38_postMealBG"
                  min="0"
                  placeholder="mg/dL"
                />
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q38_bgTime">BG Monitoring Time</label>
                <input
                  className={styles.input}
                  type="time"
                  id="q38_bgTime"
                  name="q38_bgTime"
                />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>BG Within Target Range?</label>
                <div className={styles.radioRow}>
                  <label><DeselectableRadio name="q38_bgInRange" value="Yes" /> Yes</label>
                  <label><DeselectableRadio name="q38_bgInRange" value="No" /> No</label>
                </div>
              </div>
            </div>

            <div className={styles.subsec}>Insulin / Diabetes Medication</div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Insulin Administered?</label>
                <div className={styles.radioRow}>
                  <label><DeselectableRadio name="q38_insulinAdmin" value="Yes" /> Yes</label>
                  <label><DeselectableRadio name="q38_insulinAdmin" value="No" /> No</label>
                  <label><DeselectableRadio name="q38_insulinAdmin" value="N/A" /> N/A</label>
                </div>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q38_insulinType">Insulin Type</label>
                <select className={styles.select} id="q38_insulinType" name="q38_insulinType">
                  <option value="">Select...</option>
                  <option value="Rapid-acting (Humalog/Novolog)">Rapid-acting (Humalog/Novolog)</option>
                  <option value="Short-acting (Regular)">Short-acting (Regular)</option>
                  <option value="Intermediate (NPH)">Intermediate (NPH)</option>
                  <option value="Long-acting (Lantus/Levemir)">Long-acting (Lantus/Levemir)</option>
                  <option value="Mixed">Mixed</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q38_insulinDose">Dose (units)</label>
                <input
                  className={styles.input}
                  type="number"
                  id="q38_insulinDose"
                  name="q38_insulinDose"
                  min="0"
                  step="0.5"
                  placeholder="Units"
                />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q38_insulinRoute">Route</label>
                <select className={styles.select} id="q38_insulinRoute" name="q38_insulinRoute">
                  <option value="">Select...</option>
                  <option value="Subcutaneous">Subcutaneous</option>
                  <option value="Insulin pump">Insulin pump</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q38_insulinTime">Time Administered</label>
                <input
                  className={styles.input}
                  type="time"
                  id="q38_insulinTime"
                  name="q38_insulinTime"
                />
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Oral Diabetes Medication Given?</label>
                <div className={styles.radioRow}>
                  <label><DeselectableRadio name="q38_oralDiabetesMed" value="Yes" /> Yes</label>
                  <label><DeselectableRadio name="q38_oralDiabetesMed" value="No" /> No</label>
                  <label><DeselectableRadio name="q38_oralDiabetesMed" value="N/A" /> N/A</label>
                </div>
              </div>
            </div>

            <div className={styles.subsec}>Diabetes Symptoms Observed</div>
            <div className={styles.checkRow}>
              <label><input type="checkbox" name="q38_diabetesSymptoms" value="Polyuria (excessive urination)" /> Polyuria (excessive urination)</label>
              <label><input type="checkbox" name="q38_diabetesSymptoms" value="Polydipsia (excessive thirst)" /> Polydipsia (excessive thirst)</label>
              <label><input type="checkbox" name="q38_diabetesSymptoms" value="Polyphagia (excessive hunger)" /> Polyphagia (excessive hunger)</label>
            </div>
            <div className={styles.checkRow}>
              <label><input type="checkbox" name="q38_diabetesSymptoms" value="Fatigue / lethargy" /> Fatigue / lethargy</label>
              <label><input type="checkbox" name="q38_diabetesSymptoms" value="Blurred vision" /> Blurred vision</label>
              <label><input type="checkbox" name="q38_diabetesSymptoms" value="Numbness / tingling (neuropathy)" /> Numbness / tingling (neuropathy)</label>
            </div>
            <div className={styles.checkRow}>
              <label><input type="checkbox" name="q38_diabetesSymptoms" value="Slow wound healing" /> Slow wound healing</label>
              <label><input type="checkbox" name="q38_diabetesSymptoms" value="Fruity breath odor (ketoacidosis)" /> Fruity breath odor (ketoacidosis)</label>
              <label><input type="checkbox" name="q38_diabetesSymptoms" value="Diaphoresis (hypoglycemia)" /> Diaphoresis (hypoglycemia)</label>
            </div>
            <div className={styles.checkRow}>
              <label><input type="checkbox" name="q38_diabetesSymptoms" value="Tremors / shakiness (hypoglycemia)" /> Tremors / shakiness (hypoglycemia)</label>
              <label><input type="checkbox" name="q38_diabetesSymptoms" value="Confusion / altered mental status" /> Confusion / altered mental status</label>
              <label><input type="checkbox" name="q38_diabetesSymptoms" value="None" /> None</label>
            </div>

            <div className={styles.subsec}>Foot / Skin Assessment (Diabetes-specific)</div>
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label}>Foot Inspection Performed?</label>
                <div className={styles.radioRow}>
                  <label><DeselectableRadio name="q38_footInspection" value="Yes" /> Yes</label>
                  <label><DeselectableRadio name="q38_footInspection" value="No" /> No</label>
                </div>
              </div>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q38_footFindings">Findings</label>
                <select className={styles.select} id="q38_footFindings" name="q38_footFindings">
                  <option value="">Select...</option>
                  <option value="WNL">WNL</option>
                  <option value="Redness / irritation">Redness / irritation</option>
                  <option value="Wound / ulcer">Wound / ulcer</option>
                  <option value="Numbness reported">Numbness reported</option>
                  <option value="Color changes">Color changes</option>
                  <option value="Swelling">Swelling</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.f} style={{ flex: '1 1 100%' }}>
                <label className={styles.label} htmlFor="q38_endocrineNotes">Notes</label>
                <textarea
                  className={styles.textarea}
                  id="q38_endocrineNotes"
                  name="q38_endocrineNotes"
                  rows={2}
                  placeholder="Additional endocrine/diabetes observations..."
                />
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
