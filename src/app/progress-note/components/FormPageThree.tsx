'use client';

import { useState } from 'react';
import styles from '../page.module.css';
import DeselectableRadio from './DeselectableRadio';

interface FormPageThreeProps {
  formRef: React.RefObject<HTMLFormElement>;
}

export default function FormPageThree({ formRef }: FormPageThreeProps) {
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
  });

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
            <div className={styles.row}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q24_painLevel">Pain Level (0-10)</label>
                <input
                  className={styles.input}
                  type="number"
                  id="q24_painLevel"
                  name="q24_painLevel"
                  min="0"
                  max="10"
                />
              </div>
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
          </div>
        )}
      </div>

      {/* System Assessments */}
      <div className={styles.section}>
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
            <div className={styles.checkRow}>
              <label>
                <input
                  type="checkbox"
                  name="q30_neuroAssessment"
                  value="Alert and oriented"
                />
                Alert and oriented
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q30_neuroAssessment"
                  value="Headache"
                />
                Headache
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q30_neuroAssessment"
                  value="Dizziness"
                />
                Dizziness
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q30_neuroAssessment"
                  value="Weakness"
                />
                Weakness
              </label>
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
            <div className={styles.checkRow}>
              <label>
                <input
                  type="checkbox"
                  name="q31_cardioAssessment"
                  value="Heart rate regular"
                />
                Heart rate regular
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q31_cardioAssessment"
                  value="Chest pain"
                />
                Chest pain
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q31_cardioAssessment"
                  value="Shortness of breath"
                />
                Shortness of breath
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q31_cardioAssessment"
                  value="Edema"
                />
                Edema
              </label>
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
            <div className={styles.checkRow}>
              <label>
                <input
                  type="checkbox"
                  name="q32_respAssessment"
                  value="Clear bilaterally"
                />
                Clear bilaterally
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q32_respAssessment"
                  value="Cough"
                />
                Cough
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q32_respAssessment"
                  value="Wheezing"
                />
                Wheezing
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q32_respAssessment"
                  value="Congestion"
                />
                Congestion
              </label>
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
            <div className={styles.checkRow}>
              <label>
                <input
                  type="checkbox"
                  name="q33_giAssessment"
                  value="Appetite adequate"
                />
                Appetite adequate
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q33_giAssessment"
                  value="Nausea"
                />
                Nausea
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q33_giAssessment"
                  value="Vomiting"
                />
                Vomiting
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q33_giAssessment"
                  value="Constipation"
                />
                Constipation
              </label>
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
            <div className={styles.checkRow}>
              <label>
                <input
                  type="checkbox"
                  name="q34_guAssessment"
                  value="Normal urination"
                />
                Normal urination
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q34_guAssessment"
                  value="Dysuria"
                />
                Dysuria
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q34_guAssessment"
                  value="Frequency"
                />
                Frequency
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q34_guAssessment"
                  value="Urgency"
                />
                Urgency
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
            <div className={styles.checkRow}>
              <label>
                <input
                  type="checkbox"
                  name="q35_reproAssessment"
                  value="No abnormalities noted"
                />
                No abnormalities noted
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q35_reproAssessment"
                  value="Discharge"
                />
                Discharge
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q35_reproAssessment"
                  value="Bleeding"
                />
                Bleeding
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q35_reproAssessment"
                  value="Pain"
                />
                Pain
              </label>
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

        {/* Skin */}
        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('skin')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.skin ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Skin</div>
        </div>
        {expandedSections.skin && (
          <div>
            <div className={styles.checkRow}>
              <label>
                <input
                  type="checkbox"
                  name="q36_skinAssessment"
                  value="Intact"
                />
                Intact
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q36_skinAssessment"
                  value="Dry"
                />
                Dry
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q36_skinAssessment"
                  value="Rash"
                />
                Rash
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q36_skinAssessment"
                  value="Wounds"
                />
                Wounds
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q36_skinAssessment"
                  value="Pressure ulcers"
                />
                Pressure ulcers
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
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Behavioral / Emotional</div>
        </div>
        {expandedSections.behavioral && (
          <div>
            <div className={styles.checkRow}>
              <label>
                <input
                  type="checkbox"
                  name="q37_behaveAssessment"
                  value="Calm"
                />
                Calm
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q37_behaveAssessment"
                  value="Anxious"
                />
                Anxious
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q37_behaveAssessment"
                  value="Depressed"
                />
                Depressed
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q37_behaveAssessment"
                  value="Irritable"
                />
                Irritable
              </label>
              <label>
                <input
                  type="checkbox"
                  name="q37_behaveAssessment"
                  value="Withdrawn"
                />
                Withdrawn
              </label>
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
      </div>
    </div>
  );
}
