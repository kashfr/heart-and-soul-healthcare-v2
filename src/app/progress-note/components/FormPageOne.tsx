'use client';

import styles from '../page.module.css';

interface FormPageOneProps {
  formRef: React.RefObject<HTMLFormElement>;
}

export default function FormPageOne({ formRef }: FormPageOneProps) {
  const today = new Date().toISOString().split('T')[0];

  return (
    <div>
      {/* CLIENT INFORMATION: name, DOB, age, diagnosis, address */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>CLIENT INFORMATION</span>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q3_clientName">Client Name *</label>
            <input
              className={styles.input}
              type="text"
              id="q3_clientName"
              name="q3_clientName"
              required
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q4_dateofBirth">Date of Birth *</label>
            <input
              className={styles.input}
              type="date"
              id="q4_dateofBirth"
              name="q4_dateofBirth"
              required
            />
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q5_ageYears">Age in Years *</label>
            <input
              className={styles.input}
              type="number"
              id="q5_ageYears"
              name="q5_ageYears"
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q10_primaryDiagnosis">Primary Diagnosis *</label>
            <input
              className={styles.input}
              type="text"
              id="q10_primaryDiagnosis"
              name="q10_primaryDiagnosis"
              required
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q200_addr_line1">Street Address *</label>
            <input
              className={styles.input}
              type="text"
              id="q200_addr_line1"
              name="q200_addr_line1"
              required
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q200_city">City *</label>
            <input
              className={styles.input}
              type="text"
              id="q200_city"
              name="q200_city"
              required
            />
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q200_state">State *</label>
            <input
              className={styles.input}
              type="text"
              id="q200_state"
              name="q200_state"
              required
            />
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q200_postal">ZIP Code *</label>
            <input
              className={styles.input}
              type="text"
              id="q200_postal"
              name="q200_postal"
              required
            />
          </div>
        </div>
      </div>

      {/* SHIFT INFORMATION: date of service, times, hours */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>SHIFT INFORMATION</span>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q6_dateofService">Date of Service *</label>
            <input
              className={styles.input}
              type="date"
              id="q6_dateofService"
              name="q6_dateofService"
              defaultValue={today}
              required
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q7_shiftStart">Shift Start Time *</label>
            <input
              className={styles.input}
              type="time"
              id="q7_shiftStart"
              name="q7_shiftStart"
              required
            />
          </div>
        </div>
      </div>

      {/* NURSE / CAREGIVER INFORMATION */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>NURSE / CAREGIVER INFORMATION</span>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q11_nurseName">Nurse / Caregiver Name *</label>
            <input
              className={styles.input}
              type="text"
              id="q11_nurseName"
              name="q11_nurseName"
              required
            />
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q12_credential">Credential *</label>
            <select
              className={styles.select}
              id="q12_credential"
              name="q12_credential"
              required
            >
              <option value="">Select credential</option>
              <option value="RN">RN</option>
              <option value="LPN">LPN</option>
              <option value="CNA">CNA</option>
              <option value="HHA">HHA</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
