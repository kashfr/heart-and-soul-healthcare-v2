'use client';

import { useRef, useEffect, useState } from 'react';
import type { FormPageProps } from '../types';
import styles from '../page.module.css';
import DeselectableRadio from './DeselectableRadio';
import SignatureCanvas, { type SignatureCanvasHandle } from '@/components/SignatureCanvas';

interface FormPageSevenProps extends FormPageProps {
  credential?: string;
  initialSignature?: string;
  initialTotalHours?: string;
}

export default function FormPageSeven({ formRef, register, watch, setValue, control, credential, initialSignature, initialTotalHours }: FormPageSevenProps) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const sigRef = useRef<SignatureCanvasHandle>(null);
  const [totalHours, setTotalHours] = useState<string>('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    handoff: false,
  });

  const isLpnRn = credential === 'LPN' || credential === 'RN';

  // Set total hours from prop when editing
  useEffect(() => {
    if (initialTotalHours) {
      setTotalHours(initialTotalHours);
      setValue('q9_totalHours', initialTotalHours);
    }
  }, [initialTotalHours, setValue]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Recompute Total Hours from the full start/end DATETIMES — not just the
  // times. The shift starts on the Date of Service (q6_dateofService) at the
  // Shift Start Time, and ends on the Shift End Date (q62_shiftEndDate) at the
  // Shift End Time. Using only the times (with a single-day "overnight" roll)
  // was wrong for shifts that span into the next day or longer — e.g.
  // 5/31 08:00 → 6/1 16:00 totalled 8.00 instead of 32.00. We watch all four
  // fields so the total stays correct on new notes, edits, and draft restores.
  const dateOfService = watch('q6_dateofService');
  const shiftStartTime = watch('q7_shiftStart');
  const shiftEndDate = watch('q62_shiftEndDate');
  const shiftEndTime = watch('q62_shiftEndTime');
  useEffect(() => {
    if (!shiftStartTime || !shiftEndTime) return;

    // Preferred path: both dates present → exact elapsed time across days.
    if (dateOfService && shiftEndDate) {
      const start = new Date(`${dateOfService}T${shiftStartTime}`);
      const end = new Date(`${shiftEndDate}T${shiftEndTime}`);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        const diffH = (end.getTime() - start.getTime()) / 3_600_000;
        // End-before-start is a data-entry error; show 0 rather than a
        // nonsensical negative until it's corrected.
        const hours = (diffH >= 0 ? diffH : 0).toFixed(2);
        setTotalHours(hours);
        setValue('q9_totalHours', hours);
        return;
      }
    }

    // Fallback (used only while a date field is still blank mid-entry): time-only
    // with a single-day overnight roll. Both dates are required to submit, so a
    // completed note always uses the exact datetime path above.
    const [startHour, startMin] = shiftStartTime.split(':').map(Number);
    const [endHour, endMin] = shiftEndTime.split(':').map(Number);
    if ([startHour, startMin, endHour, endMin].some((n) => Number.isNaN(n))) return;
    const startTotalMin = startHour * 60 + startMin;
    let endTotalMin = endHour * 60 + endMin;
    if (endTotalMin < startTotalMin) {
      endTotalMin += 24 * 60; // overnight shift
    }
    const hours = ((endTotalMin - startTotalMin) / 60).toFixed(2);
    setTotalHours(hours);
    setValue('q9_totalHours', hours);
  }, [dateOfService, shiftStartTime, shiftEndDate, shiftEndTime, setValue]);

  // Mirror the signature back into RHF so the rest of the form submit / draft
  // autosave logic continues to work unchanged.
  const handleSignatureChange = (dataUrl: string) => {
    setValue('q61_signature', dataUrl);
  };

  const clearSignature = () => {
    sigRef.current?.clear();
  };

  return (
    <div>
      {/* FOLLOW-UP CARE OR REFERRALS NEEDED */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>FOLLOW-UP CARE OR REFERRALS NEEDED</span>

        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q58_followup" value="Continued skilled nursing" />
            Continued skilled nursing
          </label>
          <label>
            <input type="checkbox" name="q58_followup" value="Physical therapy" />
            Physical therapy
          </label>
          <label>
            <input type="checkbox" name="q58_followup" value="Occupational therapy" />
            Occupational therapy
          </label>
          <label>
            <input type="checkbox" name="q58_followup" value="Speech therapy" />
            Speech therapy
          </label>
        </div>
        <div className={styles.checkRow}>
          <label>
            <input type="checkbox" name="q58_followup" value="Medical supplies needed" />
            Medical supplies needed
          </label>
          <label>
            <input type="checkbox" name="q58_followup" value="Physician follow-up appointment" />
            Physician follow-up appointment
          </label>
          <label>
            <input type="checkbox" name="q58_followup" value="Specialist referral" />
            Specialist referral
          </label>
          <label>
            <input type="checkbox" name="q58_followup" value="None" />
            None
          </label>
        </div>
      </div>

      {/* FOLLOW-UP DETAILS */}
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
              {...register('q59_followupDetails')}
              rows={3}
              placeholder="Include dates, contact information, specific instructions for patient/family"
            />
          </div>
        </div>
      </div>

      {/* PLANS FOR NEXT SHIFT */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>PLANS FOR NEXT SHIFT / CARE CONTINUATION</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q60_nextShiftPlan">
              Summary of care plan, items to monitor, and recommendations for next caregiver:
            </label>
            <textarea
              className={styles.textarea}
              id="q60_nextShiftPlan"
              {...register('q60_nextShiftPlan')}
              rows={4}
              placeholder="Document continuing care needs, precautions, patient progress, and recommendations"
            />
          </div>
        </div>
      </div>

      {/* SHIFT COMPLETION DETAILS */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>SHIFT COMPLETION DETAILS</span>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q62_shiftEndDate">Shift End Date *</label>
            <input
              className={styles.input}
              type="date"
              id="q62_shiftEndDate"
              max={today}
              required
              {...register('q62_shiftEndDate')}
            />
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q62_shiftEndTime">Shift End Time *</label>
            <input
              className={styles.input}
              type="time"
              id="q62_shiftEndTime"
              required
              {...register('q62_shiftEndTime')}
            />
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q9_totalHours">Total Hours</label>
            <input
              className={styles.input}
              type="text"
              id="q9_totalHours"
              {...register('q9_totalHours')}
              readOnly
              style={{ backgroundColor: '#f0f0f0' }}
            />
          </div>
        </div>
      </div>

      {/* CERTIFICATION */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>CERTIFICATION</span>

        <div className={styles.checkRow}>
          <label>
            <input
              type="checkbox"
              name="q65_certification"
              value="certified"
              required
            />
            I certify that the information provided in this progress note is accurate and complete to the best of my knowledge. *
          </label>
        </div>
      </div>

      {/* ADDITIONAL NOTES */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>ADDITIONAL NOTES</span>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q66_additionalNotes">
              Any additional information or comments:
            </label>
            <textarea
              className={styles.textarea}
              id="q66_additionalNotes"
              {...register('q66_additionalNotes')}
              rows={3}
              placeholder="Optional additional documentation"
            />
          </div>
        </div>
      </div>

      {/* END-OF-SHIFT HANDOFF */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>END-OF-SHIFT HANDOFF</span>

        <div className={styles.row}>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q60_oncomingCaregiver">Oncoming Caregiver Name *</label>
            <input
              className={styles.input}
              type="text"
              id="q60_oncomingCaregiver"
              {...register('q60_oncomingCaregiver')}
              required
            />
          </div>
          <div className={styles.f}>
            <label className={styles.label} htmlFor="q60_handoffTime">Handoff Time *</label>
            <input
              className={styles.input}
              type="time"
              id="q60_handoffTime"
              {...register('q60_handoffTime')}
              required
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q60_verbalReport">Verbal Report Summary *</label>
            <textarea
              className={styles.textarea}
              id="q60_verbalReport"
              {...register('q60_verbalReport')}
              rows={4}
              placeholder="Summarize key events and handoff information given to oncoming caregiver..."
              required
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label}>Client Condition at Shift End *</label>
            <div className={styles.radioRow}>
              <label><DeselectableRadio name="q60_conditionAtEnd" value="Stable" /> Stable</label>
              <label><DeselectableRadio name="q60_conditionAtEnd" value="Improved" /> Improved</label>
              <label><DeselectableRadio name="q60_conditionAtEnd" value="Declined" /> Declined</label>
              <label><DeselectableRadio name="q60_conditionAtEnd" value="Unchanged" /> Unchanged</label>
            </div>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.f} style={{ flex: '1 1 100%' }}>
            <label className={styles.label} htmlFor="q60_endOfShiftNotes">Additional Notes</label>
            <textarea
              className={styles.textarea}
              id="q60_endOfShiftNotes"
              {...register('q60_endOfShiftNotes')}
              rows={3}
              placeholder="Any additional end-of-shift notes..."
            />
          </div>
        </div>
      </div>

      {/* SIGNATURE AND COMPLETION (ABSOLUTE LAST) */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>SIGNATURE AND COMPLETION</span>

        <div className={styles.subsec}>Nurse / Caregiver Signature</div>
        <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
          Please sign in the box below to verify the accuracy and completion of this progress note.
        </p>
        <div style={{ marginBottom: '1rem' }}>
          <label className={styles.label}>Signature *</label>
          <SignatureCanvas
            ref={sigRef}
            width={400}
            height={150}
            initialSignature={initialSignature}
            onChange={handleSignatureChange}
            className={styles.signaturePad}
          />
          <input
            type="hidden"
            id="q61_signature"
            {...register('q61_signature')}
            required
          />
        </div>
        <div className={styles.signaturePadControls}>
          <button
            type="button"
            onClick={clearSignature}
          >
            Clear Signature
          </button>
        </div>
      </div>
    </div>
  );
}
