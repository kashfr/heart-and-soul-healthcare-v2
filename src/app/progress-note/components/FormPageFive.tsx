'use client';

import styles from '../page.module.css';
import DeselectableRadio from './DeselectableRadio';

interface FormPageFiveProps {
  formRef: React.RefObject<HTMLFormElement>;
}

export default function FormPageFive({ formRef }: FormPageFiveProps) {
  return (
    <div>
      <div className={styles.section}>
        <span className={styles.sectionLabel}>MEDICATIONS AND MEDICAL MANAGEMENT</span>

        <div className={styles.subsec}>Medications Given Today</div>
        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q43_medicationsGiven">
              List all medications administered today (name, dose, route, time, patient response): *
            </label>
            <textarea
              className={styles.textarea}
              id="q43_medicationsGiven"
              name="q43_medicationsGiven"
              rows={5}
              placeholder="e.g., Lisinopril 10mg PO at 8:00 AM - patient tolerated well"
              required
            />
          </div>
        </div>

        <div className={styles.subsec}>Medication Compliance</div>
        <div className={styles.radioRow}>
          <label>
            <DeselectableRadio
              name="q44_medicationCompliance"
              value="Excellent - took all medications as prescribed"
            />
            Excellent - took all medications as prescribed
          </label>
          <label>
            <DeselectableRadio
              name="q44_medicationCompliance"
              value="Good - missed 1 dose"
            />
            Good - missed 1 dose
          </label>
          <label>
            <DeselectableRadio
              name="q44_medicationCompliance"
              value="Fair - missed 2+ doses or took incorrectly"
            />
            Fair - missed 2+ doses or took incorrectly
          </label>
          <label>
            <DeselectableRadio
              name="q44_medicationCompliance"
              value="Poor - significant non-compliance"
            />
            Poor - significant non-compliance
          </label>
        </div>

        <div className={styles.subsec}>Medication Side Effects or Adverse Reactions</div>
        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q45_medicationSideEffects">
              Note any side effects, adverse reactions, or concerns:
            </label>
            <textarea
              className={styles.textarea}
              id="q45_medicationSideEffects"
              name="q45_medicationSideEffects"
              rows={3}
              placeholder="Leave blank if no side effects noted"
            />
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>TREATMENTS PERFORMED</span>

        <div className={styles.checkRow}>
          <label>
            <input
              type="checkbox"
              name="q46_treatments"
              value="Wound irrigation"
            />
            Wound irrigation
          </label>
          <label>
            <input
              type="checkbox"
              name="q46_treatments"
              value="Dressing change"
            />
            Dressing change
          </label>
          <label>
            <input
              type="checkbox"
              name="q46_treatments"
              value="Catheterization"
            />
            Catheterization
          </label>
          <label>
            <input
              type="checkbox"
              name="q46_treatments"
              value="IV infusion"
            />
            IV infusion
          </label>
          <label>
            <input
              type="checkbox"
              name="q46_treatments"
              value="Physical therapy"
            />
            Physical therapy
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input
              type="checkbox"
              name="q46_treatments"
              value="Occupational therapy"
            />
            Occupational therapy
          </label>
          <label>
            <input
              type="checkbox"
              name="q46_treatments"
              value="Speech therapy"
            />
            Speech therapy
          </label>
          <label>
            <input
              type="checkbox"
              name="q46_treatments"
              value="Heat/cold therapy"
            />
            Heat/cold therapy
          </label>
          <label>
            <input
              type="checkbox"
              name="q46_treatments"
              value="Other"
            />
            Other
          </label>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>MEDICAL EQUIPMENT USED / CHECKED</span>

        <div className={styles.checkRow}>
          <label>
            <input
              type="checkbox"
              name="q47_equipment"
              value="Oxygen concentrator"
            />
            Oxygen concentrator
          </label>
          <label>
            <input
              type="checkbox"
              name="q47_equipment"
              value="CPAP/BiPAP machine"
            />
            CPAP/BiPAP machine
          </label>
          <label>
            <input
              type="checkbox"
              name="q47_equipment"
              value="Hospital bed"
            />
            Hospital bed
          </label>
          <label>
            <input
              type="checkbox"
              name="q47_equipment"
              value="Wheelchair/walker"
            />
            Wheelchair/walker
          </label>
          <label>
            <input
              type="checkbox"
              name="q47_equipment"
              value="Feeding pump"
            />
            Feeding pump
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input
              type="checkbox"
              name="q47_equipment"
              value="Catheter supplies"
            />
            Catheter supplies
          </label>
          <label>
            <input
              type="checkbox"
              name="q47_equipment"
              value="Glucose monitor"
            />
            Glucose monitor
          </label>
          <label>
            <input
              type="checkbox"
              name="q47_equipment"
              value="BP cuff / thermometer"
            />
            BP cuff / thermometer
          </label>
          <label>
            <input
              type="checkbox"
              name="q47_equipment"
              value="None"
            />
            None
          </label>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>EQUIPMENT ISSUES OR SUPPLY NEEDS</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q48_equipmentIssues">
              Note any equipment malfunctions, maintenance needs, or supply shortages:
            </label>
            <textarea
              className={styles.textarea}
              id="q48_equipmentIssues"
              name="q48_equipmentIssues"
              rows={3}
              placeholder="Leave blank if all equipment in good working order"
            />
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>HOME SAFETY AND ENVIRONMENT</span>

        <div className={styles.checkRow}>
          <label>
            <input
              type="checkbox"
              name="q49_homeEnvironment"
              value="Safe and clean"
            />
            Safe and clean
          </label>
          <label>
            <input
              type="checkbox"
              name="q49_homeEnvironment"
              value="Cluttered"
            />
            Cluttered
          </label>
          <label>
            <input
              type="checkbox"
              name="q49_homeEnvironment"
              value="Fall hazards present"
            />
            Fall hazards present
          </label>
          <label>
            <input
              type="checkbox"
              name="q49_homeEnvironment"
              value="Unclean"
            />
            Unclean
          </label>
          <label>
            <input
              type="checkbox"
              name="q49_homeEnvironment"
              value="Adequate lighting"
            />
            Adequate lighting
          </label>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>CAREGIVER OBSERVATIONS</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q50_caregiverObs">
              Notes on family/caregiver interaction, education provided, or concerns:
            </label>
            <textarea
              className={styles.textarea}
              id="q50_caregiverObs"
              name="q50_caregiverObs"
              rows={3}
              placeholder="Document any caregiver training, compliance issues, or support needed"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
