'use client';

import { useState, useCallback } from 'react';
import styles from '../page.module.css';
import DeselectableRadio from './DeselectableRadio';

interface FormPageTwoProps {
  formRef: React.RefObject<HTMLFormElement>;
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

export default function FormPageTwo({ formRef }: FormPageTwoProps) {
  const [alerts, setAlerts] = useState<Record<string, VitalAlert>>({});

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

        <div className={styles.subsec}>Appearance</div>
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
      </div>

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
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>ADDITIONAL OBSERVATIONS</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q22_additionalObservations">Notes</label>
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
    </div>
  );
}
