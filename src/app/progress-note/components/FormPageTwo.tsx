'use client';

import { useState, useCallback } from 'react';
import styles from '../page.module.css';
import DeselectableRadio from './DeselectableRadio';

interface FormPageTwoProps {
  formRef: React.RefObject<HTMLFormElement>;
  credential?: string;
}

// Normal vital sign ranges
const VITAL_RANGES = {
  temperature: { low: 97.0, high: 99.5, unit: '°F', label: 'Temperature' },
  systolic: { low: 90, high: 140, unit: 'mmHg', label: 'Systolic BP' },
  diastolic: { low: 60, high: 90, unit: 'mmHg', label: 'Diastolic BP' },
  pulse: { low: 60, high: 100, unit: 'bpm', label: 'Pulse' },
  respiration: { low: 12, high: 20, unit: '/min', label: 'Respirations' },
  oxygenSaturation: { low: 95, high: 100, unit: '%', label: 'O2 Saturation' },
  bloodGlucose: { low: 70, high: 180, unit: 'mg/dL', label: 'Blood Glucose' },
};

type VitalKey = keyof typeof VITAL_RANGES;

interface VitalAlert {
  vital: string;
  value: string;
  status: 'low' | 'high';
}

function checkVitalRange(key: VitalKey, value: number): 'normal' | 'low' | 'high' {
  const range = VITAL_RANGES[key];
  if (value < range.low) return 'low';
  if (value > range.high) return 'high';
  return 'normal';
}

const alertInputStyle = {
  border: '2px solid #c62828',
  background: '#fff5f5',
};

const alertLabelStyle = {
  color: '#c62828',
};

const warningBannerStyle: React.CSSProperties = {
  background: '#fff3f0',
  border: '1px solid #ef9a9a',
  borderLeft: '4px solid #c62828',
  borderRadius: '4px',
  padding: '12px 16px',
  marginBottom: '16px',
  fontSize: '13px',
  color: '#b71c1c',
};

const warningItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '2px 0',
};

export default function FormPageTwo({ formRef, credential }: FormPageTwoProps) {
  const showVitals = credential !== 'HHA';
  const [alerts, setAlerts] = useState<Record<string, VitalAlert>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    detailedAppearance: false,
    additionalDetails: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

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

    const status = checkVitalRange(key, value);
    if (status !== 'normal') {
      const range = VITAL_RANGES[key];
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
  }, []);

  const handleBPChange = useCallback((rawValue: string) => {
    const parts = rawValue.split('/');
    if (parts.length === 2) {
      const systolic = parseFloat(parts[0]);
      const diastolic = parseFloat(parts[1]);

      if (!isNaN(systolic)) {
        const sysStatus = checkVitalRange('systolic', systolic);
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
        const diaStatus = checkVitalRange('diastolic', diastolic);
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
  }, []);

  const alertList = Object.values(alerts);
  const hasAlerts = alertList.length > 0;
  const isAbnormal = (key: string) => key in alerts;
  const isBPAbnormal = 'systolic' in alerts || 'diastolic' in alerts;

  return (
    <div>
      <div className={styles.section}>
        <span className={styles.sectionLabel}>CLIENT STATUS - BEGINNING OF SHIFT</span>

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
              name="q14_orientationBehaviorNotes"
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

        <div
          className={styles.collapsibleHeader}
          onClick={() => toggleSection('detailedAppearance')}
        >
          <span className={styles.toggleArrow}>
            {expandedSections.detailedAppearance ? '▼' : '▶'}
          </span>
          <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Detailed Appearance Findings</div>
        </div>
        {expandedSections.detailedAppearance && (
          <div>
            <div className={styles.row} style={{ marginTop: '10px' }}>
              <div className={styles.f}>
                <label className={styles.label} htmlFor="q15_skinColor">Skin Color</label>
                <select
                  className={styles.select}
                  id="q15_skinColor"
                  name="q15_skinColor"
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
                  name="q15_appearanceNotes"
                  rows={3}
                  placeholder="Describe appearance findings..."
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: showVitals ? 'block' : 'none' }}>
        <div className={styles.section}>
          <span className={styles.sectionLabel}>VITAL SIGNS</span>

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
                name="q16_temperature"
                step="0.1"
                required
                onBlur={(e) => handleVitalChange('temperature', e.target.value)}
              />
            </div>
            <div className={styles.f}>
              <label
                className={styles.label}
                htmlFor="q17_bloodPressure"
                style={isBPAbnormal ? alertLabelStyle : undefined}
              >
                Blood Pressure (mmHg) * {isBPAbnormal && '⚠'}
              </label>
              <input
                className={styles.input}
                style={isBPAbnormal ? alertInputStyle : undefined}
                type="text"
                id="q17_bloodPressure"
                name="q17_bloodPressure"
                placeholder="120/80"
                required
                onBlur={(e) => handleBPChange(e.target.value)}
              />
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
                name="q18_pulse"
                required
                onBlur={(e) => handleVitalChange('pulse', e.target.value)}
              />
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
                name="q19_respiration"
                required
                onBlur={(e) => handleVitalChange('respiration', e.target.value)}
              />
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
                name="q20_oxygenSaturation"
                required
                onBlur={(e) => handleVitalChange('oxygenSaturation', e.target.value)}
              />
            </div>
            <div className={styles.f}>
              <label
                className={styles.label}
                htmlFor="q21_bloodGlucose"
                style={isAbnormal('bloodGlucose') ? alertLabelStyle : undefined}
              >
                Blood Glucose (if applicable) {isAbnormal('bloodGlucose') && '⚠'}
              </label>
              <input
                className={styles.input}
                style={isAbnormal('bloodGlucose') ? alertInputStyle : undefined}
                type="number"
                id="q21_bloodGlucose"
                name="q21_bloodGlucose"
                onBlur={(e) => handleVitalChange('bloodGlucose', e.target.value)}
              />
            </div>
          </div>

          <div
            className={styles.collapsibleHeader}
            onClick={() => toggleSection('additionalDetails')}
          >
            <span className={styles.toggleArrow}>
              {expandedSections.additionalDetails ? '▼' : '▶'}
            </span>
            <div className={styles.subsec} style={{ borderBottom: 'none', marginBottom: 0 }}>Additional Details</div>
          </div>
          {expandedSections.additionalDetails && (
            <div>
              <div className={styles.row}>
                <div className={styles.f}>
                  <label className={styles.label} htmlFor="q21_oxygenSource">Oxygen Source</label>
                  <select
                    className={styles.select}
                    id="q21_oxygenSource"
                    name="q21_oxygenSource"
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

              <div className={styles.row}>
                <div className={styles.f} style={{ flex: '1 1 100%' }}>
                  <label className={styles.label} htmlFor="q22_additionalObservations">Additional Observations</label>
                  <textarea
                    className={styles.textarea}
                    id="q22_additionalObservations"
                    name="q22_additionalObservations"
                    rows={4}
                    placeholder="Any additional observations about client status..."
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
