'use client';

import styles from '../page.module.css';
import DeselectableRadio from './DeselectableRadio';

interface FormPageSixProps {
  formRef: React.RefObject<HTMLFormElement>;
}

export default function FormPageSix({ formRef }: FormPageSixProps) {
  return (
    <div>
      <div className={styles.section}>
        <span className={styles.sectionLabel}>COMMUNICATION AND NOTIFICATIONS</span>

        <div className={styles.subsec}>Communication with Patient/Family</div>
        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q51_communication">
              Summary of communications with patient, family members, or caregivers: *
            </label>
            <textarea
              className={styles.textarea}
              id="q51_communication"
              name="q51_communication"
              rows={4}
              placeholder="Document conversations, education provided, concerns discussed, etc."
              required
            />
          </div>
        </div>

        <div className={styles.subsec}>Physician / Provider Notifications</div>
        <div className={styles.radioRow}>
          <label>
            <DeselectableRadio
              name="q52_physicianNotify"
              value="No notification required"
            />
            No notification required
          </label>
          <label>
            <DeselectableRadio
              name="q52_physicianNotify"
              value="Notified physician - routine"
            />
            Notified physician - routine
          </label>
          <label>
            <DeselectableRadio
              name="q52_physicianNotify"
              value="Notified physician - urgent changes in condition"
            />
            Notified physician - urgent changes in condition
          </label>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>PHYSICIAN NOTIFICATION DETAILS</span>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q53_physicianName">Physician Name</label>
            <input
              className={styles.input}
              type="text"
              id="q53_physicianName"
              name="q53_physicianName"
            />
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q54_notificationTime">Time of Notification</label>
            <input
              className={styles.input}
              type="time"
              id="q54_notificationTime"
              name="q54_notificationTime"
            />
          </div>
        </div>
        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q55_physicianOrders">Physician Orders / Response</label>
            <textarea
              className={styles.textarea}
              id="q55_physicianOrders"
              name="q55_physicianOrders"
              rows={3}
              placeholder="Document any orders given or response from physician"
            />
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>REPORTABLE INCIDENTS OR UNUSUAL EVENTS</span>

        <div className={styles.radioRow}>
          <label>
            <DeselectableRadio
              name="q56_incidents"
              value="No incidents"
            />
            No incidents
          </label>
          <label>
            <DeselectableRadio
              name="q56_incidents"
              value="Fall"
            />
            Fall
          </label>
          <label>
            <DeselectableRadio
              name="q56_incidents"
              value="Injury"
            />
            Injury
          </label>
          <label>
            <DeselectableRadio
              name="q56_incidents"
              value="Medication error"
            />
            Medication error
          </label>
        </div>
        <div className={styles.radioRow}>
          <label>
            <DeselectableRadio
              name="q56_incidents"
              value="Equipment malfunction"
            />
            Equipment malfunction
          </label>
          <label>
            <DeselectableRadio
              name="q56_incidents"
              value="Behavioral incident"
            />
            Behavioral incident
          </label>
          <label>
            <DeselectableRadio
              name="q56_incidents"
              value="Other"
            />
            Other
          </label>
        </div>

        <div className={styles.subsec}>Incident Details (if applicable)</div>
        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q57_incidentDetails">
              Detailed description of incident, circumstances, what was done:
            </label>
            <textarea
              className={styles.textarea}
              id="q57_incidentDetails"
              name="q57_incidentDetails"
              rows={4}
              placeholder="Document incident timeline, response, notifications made, and outcomes"
            />
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>FOLLOW-UP CARE OR REFERRALS NEEDED</span>

        <div className={styles.checkRow}>
          <label>
            <input
              type="checkbox"
              name="q58_followup"
              value="Continued skilled nursing"
            />
            Continued skilled nursing
          </label>
          <label>
            <input
              type="checkbox"
              name="q58_followup"
              value="Physical therapy"
            />
            Physical therapy
          </label>
          <label>
            <input
              type="checkbox"
              name="q58_followup"
              value="Occupational therapy"
            />
            Occupational therapy
          </label>
          <label>
            <input
              type="checkbox"
              name="q58_followup"
              value="Speech therapy"
            />
            Speech therapy
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input
              type="checkbox"
              name="q58_followup"
              value="Medical supplies needed"
            />
            Medical supplies needed
          </label>
          <label>
            <input
              type="checkbox"
              name="q58_followup"
              value="Physician follow-up appointment"
            />
            Physician follow-up appointment
          </label>
          <label>
            <input
              type="checkbox"
              name="q58_followup"
              value="Specialist referral"
            />
            Specialist referral
          </label>
          <label>
            <input
              type="checkbox"
              name="q58_followup"
              value="None"
            />
            None
          </label>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>FOLLOW-UP DETAILS</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q59_followupDetails">
              Specific follow-up instructions or referral details:
            </label>
            <textarea
              className={styles.textarea}
              id="q59_followupDetails"
              name="q59_followupDetails"
              rows={3}
              placeholder="Include dates, contact information, specific instructions for patient/family"
            />
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>PLANS FOR NEXT SHIFT / CARE CONTINUATION</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q60_nextShiftPlan">
              Summary of care plan, items to monitor, and recommendations for next caregiver: *
            </label>
            <textarea
              className={styles.textarea}
              id="q60_nextShiftPlan"
              name="q60_nextShiftPlan"
              rows={4}
              placeholder="Document continuing care needs, precautions, patient progress, and recommendations"
              required
            />
          </div>
        </div>
      </div>
    </div>
  );
}
