'use client';

import styles from '../page.module.css';

interface FormPageFourProps {
  formRef: React.RefObject<HTMLFormElement>;
}

export default function FormPageFour({ formRef }: FormPageFourProps) {
  return (
    <div>
      <div className={styles.section}>
        <span className={styles.sectionLabel}>SKILLED NURSING INTERVENTIONS</span>

        <div className={styles.subsec}>Interventions Performed</div>
        <div className={styles.checkRow}>
          <label>
            <input
              type="checkbox"
              name="q38_interventions"
              value="Wound care and dressing changes"
            />
            Wound care and dressing changes
          </label>
          <label>
            <input
              type="checkbox"
              name="q38_interventions"
              value="Catheter care"
            />
            Catheter care
          </label>
          <label>
            <input
              type="checkbox"
              name="q38_interventions"
              value="IV line management"
            />
            IV line management
          </label>
          <label>
            <input
              type="checkbox"
              name="q38_interventions"
              value="Medication administration"
            />
            Medication administration
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input
              type="checkbox"
              name="q38_interventions"
              value="Injection administration"
            />
            Injection administration
          </label>
          <label>
            <input
              type="checkbox"
              name="q38_interventions"
              value="Foley catheter insertion"
            />
            Foley catheter insertion
          </label>
          <label>
            <input
              type="checkbox"
              name="q38_interventions"
              value="Ostomy care"
            />
            Ostomy care
          </label>
          <label>
            <input
              type="checkbox"
              name="q38_interventions"
              value="Tracheostomy care"
            />
            Tracheostomy care
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input
              type="checkbox"
              name="q38_interventions"
              value="Oxygen therapy"
            />
            Oxygen therapy
          </label>
          <label>
            <input
              type="checkbox"
              name="q38_interventions"
              value="Nebulizer treatment"
            />
            Nebulizer treatment
          </label>
          <label>
            <input
              type="checkbox"
              name="q38_interventions"
              value="Suctioning"
            />
            Suctioning
          </label>
          <label>
            <input
              type="checkbox"
              name="q38_interventions"
              value="Blood glucose monitoring"
            />
            Blood glucose monitoring
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input
              type="checkbox"
              name="q38_interventions"
              value="Assessment and evaluation"
            />
            Assessment and evaluation
          </label>
          <label>
            <input
              type="checkbox"
              name="q38_interventions"
              value="Patient education"
            />
            Patient education
          </label>
          <label>
            <input
              type="checkbox"
              name="q38_interventions"
              value="Fall prevention"
            />
            Fall prevention
          </label>
          <label>
            <input
              type="checkbox"
              name="q38_interventions"
              value="Other"
            />
            Other
          </label>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>DETAILED DESCRIPTION OF INTERVENTIONS</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q39_interventionDetails">
              Describe interventions performed, patient response, and any complications or changes in condition: *
            </label>
            <textarea
              className={styles.textarea}
              id="q39_interventionDetails"
              name="q39_interventionDetails"
              rows={6}
              placeholder="Provide detailed notes on each intervention, how the patient responded, and any outcomes..."
              required
            />
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>SKILLED NURSING CARE JUSTIFICATION</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q40_skillJustification">
              Describe why skilled nursing care was required today and how it relates to the patient&apos;s medical condition and treatment plan: *
            </label>
            <textarea
              className={styles.textarea}
              id="q40_skillJustification"
              name="q40_skillJustification"
              rows={5}
              placeholder="Explain the clinical necessity for skilled nursing services..."
              required
            />
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>PATIENT EDUCATION PROVIDED</span>

        <div className={styles.checkRow}>
          <label>
            <input
              type="checkbox"
              name="q41_patientEduc"
              value="Disease process"
            />
            Disease process
          </label>
          <label>
            <input
              type="checkbox"
              name="q41_patientEduc"
              value="Medication management"
            />
            Medication management
          </label>
          <label>
            <input
              type="checkbox"
              name="q41_patientEduc"
              value="Wound care"
            />
            Wound care
          </label>
          <label>
            <input
              type="checkbox"
              name="q41_patientEduc"
              value="Nutrition and diet"
            />
            Nutrition and diet
          </label>
          <label>
            <input
              type="checkbox"
              name="q41_patientEduc"
              value="Activity and exercise"
            />
            Activity and exercise
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input
              type="checkbox"
              name="q41_patientEduc"
              value="Safety precautions"
            />
            Safety precautions
          </label>
          <label>
            <input
              type="checkbox"
              name="q41_patientEduc"
              value="Signs and symptoms to report"
            />
            Signs and symptoms to report
          </label>
          <label>
            <input
              type="checkbox"
              name="q41_patientEduc"
              value="Community resources"
            />
            Community resources
          </label>
          <label>
            <input
              type="checkbox"
              name="q41_patientEduc"
              value="None"
            />
            None
          </label>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>PATIENT RESPONSE TO INTERVENTIONS</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q42_patientResponse">
              Patient tolerance and response to interventions performed:
            </label>
            <textarea
              className={styles.textarea}
              id="q42_patientResponse"
              name="q42_patientResponse"
              rows={4}
              placeholder="How did the patient tolerate the interventions? Any side effects or adverse reactions?"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
